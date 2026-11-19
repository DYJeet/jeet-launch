import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';
import { MarketStore, type Checkpoint, type LaunchObservation, type MarketEvent, type IndexDatabase } from './market-store.ts';
import { backendJson, backendParse } from './shared-backend-client.ts';

export const DEVNET_INDEX_NAMESPACE = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG:Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D';
const uint = (v: unknown) => typeof v === 'string' && /^(0|[1-9]\d{0,19})$/.test(v) && BigInt(v) <= (1n << 64n) - 1n;
const pubkey = (v: unknown) => typeof v === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const signature = (v: unknown) => typeof v === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const demand = (v: unknown) => { if (!v) throw Error('Invalid bounded index operation.'); };
const observedTime = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= Date.now() + 60000;
function checkpoint(v: unknown): asserts v is Checkpoint {
  demand(record(v)); const c = v as Record<string, unknown>;
  demand(Object.keys(c).every(k => ['anchor', 'head', 'before', 'backfilled', 'gap'].includes(k)));
  for (const k of ['anchor', 'head', 'before']) if (c[k] !== undefined) demand(signature(c[k]));
  for (const k of ['backfilled', 'gap']) if (c[k] !== undefined) demand(typeof c[k] === 'boolean');
}
function events(v: unknown): asserts v is MarketEvent[] {
  demand(Array.isArray(v) && v.length <= 128);
  for (const e of v as MarketEvent[]) {
    demand(record(e) && signature(e.signature) && uint(e.slot) && uint(e.lamports));
    demand(typeof e.id === 'string' && e.id.startsWith(e.signature + ':') && /^(trade|claim|swap):\d{1,20}$/.test(e.id.slice(e.signature.length + 1)));
    demand(['buy', 'sell', 'creator-claim', 'platform-claim'].includes(e.kind));
    demand(e.time === null || (Number.isSafeInteger(e.time) && e.time >= 0 && e.time <= Date.now() / 1000 + 60));
    demand(e.wallet === undefined || pubkey(e.wallet));
    if (e.kind === 'buy' || e.kind === 'sell') demand(uint(e.tokens));
  }
}
function launches(v: unknown): asserts v is LaunchObservation[] {
  demand(Array.isArray(v) && v.length <= 64);
  for (const o of v as LaunchObservation[]) {
    demand(record(o) && typeof o.slot === 'bigint' && uint(String(o.slot)) && record(o.row));
    const r = o.row;
    demand(pubkey(r.mint) && pubkey(r.creator) && (r.pool === undefined || pubkey(r.pool)));
    demand(typeof r.name === 'string' && Buffer.byteLength(r.name) <= 32 && typeof r.symbol === 'string' && Buffer.byteLength(r.symbol) <= 10);
    demand(uint(r.activationSlot) && uint(r.volume) && /^\d{1,20}(\.\d{1,9})?$/.test(r.reserve ?? ''));
    demand(BigInt(r.activationSlot) <= o.slot);
    demand(Number.isInteger(r.progress) && r.progress >= 0 && r.progress <= 100 && typeof r.migrated === 'boolean' && typeof r.eligible === 'boolean');
  }
}
export type Quotas = { readClient: number; readGlobal: number; writeClient: number; writeGlobal: number; uploadClient: number; uploadGlobal: number; uploadDaily: number };
export const DEFAULT_QUOTAS: Quotas = { readClient: 60, readGlobal: 240, writeClient: 12, writeGlobal: 60, uploadClient: 2, uploadGlobal: 10, uploadDaily: 20 };
export class PersistentRequestLimiter {
  private db: IndexDatabase;
  readonly quotas: Quotas;
  constructor(path: string, quotas: Partial<Quotas> = DEFAULT_QUOTAS, database?: IndexDatabase) {
    this.quotas = { ...DEFAULT_QUOTAS, ...quotas };
    for (const n of Object.values(this.quotas)) demand(Number.isInteger(n) && n > 0 && n <= 100000);
    this.db = database ?? new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS request_quotas(scope TEXT NOT NULL,client TEXT NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(scope,client)); CREATE INDEX IF NOT EXISTS quota_expiry ON request_quotas(window); CREATE TABLE IF NOT EXISTS quota_clock(id INTEGER PRIMARY KEY CHECK(id=1),highwater INTEGER NOT NULL);');
  }
  admit(client: string, scope: 'read' | 'write' | 'upload', now = Date.now()) {
    demand(/^[a-f0-9]{64}$/.test(client) && ['read', 'write', 'upload'].includes(scope));
    const globalLimit = scope === 'upload' ? this.quotas.uploadGlobal : scope === 'write' ? this.quotas.writeGlobal : this.quotas.readGlobal;
    const clientLimit = scope === 'upload' ? this.quotas.uploadClient : scope === 'write' ? this.quotas.writeClient : this.quotas.readClient;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const effectiveNow = Math.max(now, Number(this.db.prepare('SELECT highwater FROM quota_clock WHERE id=1').get()?.highwater ?? 0));
      this.db.prepare('INSERT INTO quota_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET highwater=MAX(highwater,excluded.highwater)').run(effectiveNow);
      const duration = scope === 'upload' ? 3600000 : 60000;
      const window = Math.floor(effectiveNow / duration) * duration, day = Math.floor(effectiveNow / 86400000) * 86400000;
      this.db.prepare("DELETE FROM request_quotas WHERE window + CASE WHEN scope='upload-day' THEN 86400000 WHEN scope='upload' THEN 3600000 ELSE 60000 END <= ?").run(effectiveNow);
      const count = (bucket: string, key: string, start: number) => Number(this.db.prepare('SELECT count FROM request_quotas WHERE scope=? AND client=? AND window=?').get(bucket, key, start)?.count ?? 0);
      if (count(scope, '*', window) >= globalLimit || count(scope, client, window) >= clientLimit ||
          (scope === 'upload' && count('upload-day', '*', day) >= this.quotas.uploadDaily)) { this.db.exec('COMMIT'); return false; }
      const add = this.db.prepare('INSERT INTO request_quotas VALUES(?,?,?,1) ON CONFLICT(scope,client) DO UPDATE SET window=excluded.window,count=CASE WHEN request_quotas.window=excluded.window THEN request_quotas.count+1 ELSE 1 END');
      add.run(scope, '*', window); add.run(scope, client, window); if (scope === 'upload') add.run('upload-day', '*', day);
      this.db.exec('COMMIT'); return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  close() { this.db.close(); }
}

/** Authenticated internal index service. No SQL, RPC URL, wallet key or transaction-submission operation is exposed. */
export function createSharedBackend(path: string, token: string, quotas = DEFAULT_QUOTAS, options: { database?: IndexDatabase; transaction?: (run: () => Response) => Response } = {}) {
  demand(token.length >= 32 && token.length <= 256);
  const store = new MarketStore(path, options.database), limiter = new PersistentRequestLimiter(path, quotas, options.database);
  const json = (result: unknown, status = 200) => new Response(backendJson({ result: result ?? null }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return {
    close() { store.close(); limiter.close(); },
    async handle(request: Request) {
      const expected = Buffer.from('Bearer ' + token), supplied = Buffer.from(request.headers.get('authorization') ?? '');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return json(null, 401);
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/index') return json(null, 404);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json(null, 415);
      try {
        const reader = request.body?.getReader(); demand(reader);
        const chunks: Uint8Array[] = []; let size = 0;
        for (;;) { const part = await reader!.read(); if (part.done) break;
          size += part.value.length; if (size > 131072) { await reader!.cancel(); return json(null, 413); } chunks.push(part.value); }
        const bytes = Buffer.concat(chunks); const body = backendParse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        demand(record(body)); const { op, args } = body as { op: string; args: unknown[] }; demand(Array.isArray(args) && args.length <= 6);
        const invoke = () => {
        if (op === 'admit') { demand(args.length === 2); return json(limiter.admit(args[0] as string, args[1] as 'read' | 'write' | 'upload')); }
        demand(args[0] === DEVNET_INDEX_NAMESPACE); const network = args[0] as string, stream = args[1] as string;
        if (['checkpoint', 'commit', 'commitDiscovery', 'marketVolume', 'history', 'historySnapshot'].includes(op))
          demand(stream === 'launch-activations-v1' || /^[1-9A-HJ-NP-Za-km-z]{32,44}:(curve|amm)$/.test(stream));
        switch (op) {
          case 'checkpoint': demand(args.length === 2); return json(store.checkpoint(network, stream));
          case 'marketVolume': demand(args.length === 2); return json(store.marketVolume(network, stream));
          case 'discoveryUpdatedAt': demand(args.length === 1); return json(store.discoveryUpdatedAt(network));
          case 'oldestLaunches': demand(args.length === 2 && observedTime(args[1])); return json(store.oldestLaunches(network, args[1] as number));
          case 'launchPage': {
            demand(args.length === 2 && typeof stream === 'string' && stream.length <= 1000);
            const params = new URLSearchParams(stream); demand([...params.keys()].every(k => ['view', 'q', 'creator', 'limit', 'after', 'retry'].includes(k)));
            return json(store.launchPage(network, params));
          }
          case 'history': case 'historySnapshot': demand(args.length >= 2 && args.length <= 4 && (args[2] == null || (typeof args[2] === 'string' && args[2].length <= 120)) && (args[3] == null || signature(args[3])));
            return json(store[op](network, stream, args[2] as string | undefined, args[3] as string | undefined));
          case 'writeLaunches': launches(args[1]); demand(args.length === 3 && observedTime(args[2])); store.writeLaunches(network, args[1], args[2] as number); return json(null);
          case 'commit': case 'commitDiscovery': {
            demand(args.length === (op === 'commit' ? 5 : 6)); checkpoint(args[2]); checkpoint(args[3]);
            // A missing historical range must not disappear during an ordinary replay.
            if (args[2].gap) args[3].gap = true;
            if (op === 'commit') { events(args[4]); return json(store.commit(network, stream, args[2], args[3], args[4])); }
            launches(args[4]); demand(observedTime(args[5])); return json(store.commitDiscovery(network, stream, args[2], args[3], args[4], args[5] as number));
          }
          default: return json(null, 400);
        }
        };
        return options.transaction ? options.transaction(invoke) : invoke();

      } catch { return json(null, 400); }
    },
  };
}
