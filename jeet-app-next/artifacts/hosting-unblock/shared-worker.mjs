// workers/shared-devnet/src/worker.mjs
import { DurableObject } from "cloudflare:workers";
import { timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { Buffer as Buffer2 } from "node:buffer";

// src/lib/shared-backend.ts
import { Buffer } from "node:buffer";

// workers/shared-devnet/src/sqlite-unavailable.ts
var DatabaseSync = class {
  constructor() {
    throw Error("A Durable Object SQLite driver is required.");
  }
};

// src/lib/shared-backend.ts
import { timingSafeEqual } from "node:crypto";

// src/lib/market-store.ts
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// src/lib/shared-backend-client.ts
var backendJson = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? { __jeet_u64: v.toString() } : v);
function backendParse(value) {
  return JSON.parse(value, (_, v) => {
    if (v && typeof v === "object" && Object.hasOwn(v, "__jeet_u64")) {
      if (Object.keys(v).length !== 1 || !/^(0|[1-9]\d{0,19})$/.test(v.__jeet_u64) || BigInt(v.__jeet_u64) > (1n << 64n) - 1n)
        throw Error("Invalid backend integer.");
      return BigInt(v.__jeet_u64);
    }
    return v;
  });
}

// src/lib/market-store.ts
var MarketStore = class {
  constructor(path, database) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 448 });
    this.db = database ?? new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout=3000;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS launches (
        network TEXT NOT NULL, mint TEXT NOT NULL, creator TEXT NOT NULL, name TEXT NOT NULL,
        symbol TEXT NOT NULL, activation TEXT NOT NULL, volume TEXT NOT NULL,
        progress INTEGER NOT NULL, migrated INTEGER NOT NULL, slot TEXT NOT NULL,
        observed INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(network, mint)
      );
      CREATE INDEX IF NOT EXISTS launches_new ON launches(network, activation DESC, mint DESC);
      CREATE INDEX IF NOT EXISTS launches_trending ON launches(network, volume DESC, activation DESC, mint DESC);
      CREATE INDEX IF NOT EXISTS launches_stretch ON launches(network, progress DESC, activation DESC, mint DESC)
        WHERE migrated=0 AND progress>=90;
      CREATE INDEX IF NOT EXISTS launches_migrated ON launches(network, activation DESC, mint DESC) WHERE migrated=1;
      CREATE INDEX IF NOT EXISTS launches_refresh ON launches(network, observed, mint);
      CREATE INDEX IF NOT EXISTS launches_creator ON launches(network, creator);
      CREATE TABLE IF NOT EXISTS launch_rank_versions (
        network TEXT PRIMARY KEY, version INTEGER NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS launch_rank_change AFTER UPDATE OF volume,progress,migrated ON launches
      WHEN NEW.volume<>OLD.volume OR NEW.progress<>OLD.progress OR NEW.migrated<>OLD.migrated
      BEGIN
        INSERT INTO launch_rank_versions VALUES (NEW.network,1)
          ON CONFLICT(network) DO UPDATE SET version=version+1;
      END;
      CREATE TABLE IF NOT EXISTS launch_sync (
        network TEXT PRIMARY KEY, indexed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS streams (
        network TEXT NOT NULL, stream TEXT NOT NULL, checkpoint TEXT NOT NULL,
        PRIMARY KEY (network, stream)
      );
      CREATE TABLE IF NOT EXISTS market_events (
        network TEXT NOT NULL, stream TEXT NOT NULL, id TEXT NOT NULL,
        signature TEXT NOT NULL, slot_key TEXT NOT NULL, event TEXT NOT NULL,
        PRIMARY KEY (network, stream, id)
      );
      CREATE TABLE IF NOT EXISTS market_volume (
        network TEXT NOT NULL, stream TEXT NOT NULL, lamports TEXT NOT NULL,
        tokens TEXT NOT NULL, trades INTEGER NOT NULL, PRIMARY KEY(network, stream)
      );
      CREATE INDEX IF NOT EXISTS market_events_signature ON market_events(network, stream, signature);
      CREATE INDEX IF NOT EXISTS market_events_order
        ON market_events(network, stream, slot_key DESC, id DESC);
    `);
  }
  close() {
    this.db.close();
  }
  discoveryUpdatedAt(network) {
    const record2 = this.db.prepare("SELECT indexed_at FROM launch_sync WHERE network=?").get(network);
    return record2 ? Number(record2.indexed_at) : void 0;
  }
  oldestLaunches(network, before) {
    return this.db.prepare("SELECT mint,creator FROM launches WHERE network=? AND observed<=? ORDER BY observed,mint LIMIT 4").all(network, before).map((record2) => ({ mint: String(record2.mint), creator: String(record2.creator) }));
  }
  writeLaunches(network, observations, observed) {
    const upsert = this.db.prepare(`INSERT INTO launches VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(network,mint) DO UPDATE SET name=excluded.name,symbol=excluded.symbol,
        volume=excluded.volume,progress=excluded.progress,migrated=excluded.migrated,
        slot=excluded.slot,observed=excluded.observed,document=excluded.document
      WHERE excluded.slot>=launches.slot`);
    for (const { row, slot } of observations)
      upsert.run(
        network,
        row.mint,
        row.creator ?? "",
        row.name,
        row.symbol,
        row.activationSlot.padStart(20, "0"),
        row.volume.padStart(21, "0"),
        row.progress,
        Number(row.migrated),
        String(slot).padStart(20, "0"),
        observed,
        JSON.stringify({ ...row, observedAt: observed, observedSlot: String(slot) })
      );
  }
  launchPage(network, params) {
    const view = params.get("view");
    const query = (params.get("q") ?? "").trim().slice(0, 100).toLowerCase();
    const creator = params.get("creator") ?? "";
    const limit = Math.min(12, Math.max(1, Number.parseInt(params.get("limit") ?? "12", 10) || 12));
    const rank = view === "Trending" ? "volume," : view === "Final Stretch" ? "progress," : "";
    const sort = rank + "activation,mint";
    const stage = view === "Trending" ? "volume>'000000000000000000000'" : view === "Final Stretch" ? "migrated=0 AND progress>=90" : view === "Migrated" ? "migrated=1" : "1";
    const filters = ["network=?", stage];
    const args = [network];
    if (creator) {
      filters.push("creator=?");
      args.push(creator);
    }
    if (query) {
      filters.push("(instr(lower(name),?) OR instr(lower(symbol),?) OR instr(lower(mint),?) OR instr(lower(creator),?))");
      args.push(query, query, query, query);
    }
    const where = filters.join(" AND ");
    const total = Number(this.db.prepare(`SELECT count(*) AS total FROM launches WHERE ${where}`).get(...args)?.total);
    const cursor = params.get("after");
    const version = rank ? String(this.db.prepare("SELECT version FROM launch_rank_versions WHERE network=?").get(network)?.version ?? 0) : "0";
    const [cursorVersion, mint] = cursor?.split(".") ?? [];
    const anchor = cursorVersion === version && mint && mint.length <= 44 ? this.db.prepare(`SELECT ${sort} FROM launches WHERE ${where} AND mint=?`).get(...args, mint) : void 0;
    if (cursor && !anchor) return { rows: [], total, cursorExpired: true };
    const bounds = anchor ? `AND (${sort}) < (${Object.keys(anchor).map(() => "?").join(",")})` : "";
    const order = sort.split(",").map((column) => column + " DESC").join(",");
    const records = this.db.prepare(`SELECT document FROM launches WHERE ${where} ${bounds} ORDER BY ${order} LIMIT ?`).all(...args, ...Object.values(anchor ?? {}), limit + 1);
    const rows = records.slice(0, limit).map((record2) => JSON.parse(String(record2.document)));
    return { rows, total, cursorExpired: false, next: records.length > limit ? version + "." + rows.at(-1).mint : void 0 };
  }
  commitDiscovery(network, stream, previous, next, observations, observed) {
    return this.commitPage(network, stream, previous, next, () => {
      this.writeLaunches(network, observations, observed);
      this.db.prepare(`INSERT INTO launch_sync VALUES (?,?)
        ON CONFLICT(network) DO UPDATE SET indexed_at=MAX(launch_sync.indexed_at,excluded.indexed_at)`).run(network, observed);
    });
  }
  checkpoint(network, stream) {
    const row = this.db.prepare("SELECT checkpoint FROM streams WHERE network=? AND stream=?").get(network, stream);
    return row ? JSON.parse(String(row.checkpoint)) : {};
  }
  commit(network, stream, previous, next, events2) {
    return this.commitPage(network, stream, previous, next, () => {
      const volume = this.marketVolume(network, stream);
      const insert = this.db.prepare("INSERT OR IGNORE INTO market_events VALUES (?,?,?,?,?,?)");
      for (const event of events2) {
        const existing = this.db.prepare("SELECT event FROM market_events WHERE network=? AND stream=? AND id=?").get(network, stream, event.id);
        if (existing) {
          const prior = JSON.parse(String(existing.event));
          if (Object.keys({ ...prior, ...event }).some((key) => prior[key] !== event[key]))
            throw Error("Conflicting canonical event replay; checkpoint retained.");
        }
        const result = insert.run(network, stream, event.id, event.signature, event.slot.padStart(20, "0"), JSON.stringify(event));
        if (result.changes && (event.kind === "buy" || event.kind === "sell")) {
          volume.lamports += BigInt(event.lamports);
          volume.tokens += BigInt(event.tokens);
          volume.trades++;
        }
      }
      this.db.prepare(`INSERT INTO market_volume VALUES (?,?,?,?,?)
        ON CONFLICT(network,stream) DO UPDATE SET lamports=excluded.lamports,tokens=excluded.tokens,trades=excluded.trades`).run(network, stream, String(volume.lamports), String(volume.tokens), volume.trades);
    });
  }
  commitPage(network, stream, previous, next, write) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (JSON.stringify(this.checkpoint(network, stream)) !== JSON.stringify(previous)) {
        this.db.exec("ROLLBACK");
        return false;
      }
      write();
      this.db.prepare(`INSERT INTO streams VALUES (?,?,?)
        ON CONFLICT(network,stream) DO UPDATE SET checkpoint=excluded.checkpoint`).run(network, stream, JSON.stringify(next));
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  marketVolume(network, stream) {
    const saved = this.db.prepare("SELECT lamports,tokens,trades FROM market_volume WHERE network=? AND stream=?").get(network, stream);
    if (saved) return { lamports: BigInt(String(saved.lamports)), tokens: BigInt(String(saved.tokens)), trades: Number(saved.trades) };
    const result = { lamports: 0n, tokens: 0n, trades: 0 };
    const entries = this.db.prepare("SELECT event FROM market_events WHERE network=? AND stream=?").iterate(network, stream);
    for (const row of entries) {
      const event = JSON.parse(String(row.event));
      if (event.kind !== "buy" && event.kind !== "sell") continue;
      result.lamports += BigInt(event.lamports);
      result.tokens += BigInt(event.tokens);
      result.trades++;
    }
    return result;
  }
  history(network, stream, before, signature2) {
    const anchor = before && this.db.prepare(`SELECT slot_key,id FROM market_events
      WHERE network=? AND stream=? AND id=?`).get(network, stream, before);
    const rows = this.db.prepare(`SELECT event FROM market_events WHERE network=? AND stream=?
      AND (? IS NULL OR (slot_key,id) < (?,?)) AND (? IS NULL OR signature=?)
      ORDER BY slot_key DESC,id DESC LIMIT 17`).all(
      network,
      stream,
      anchor ? anchor.slot_key : null,
      anchor ? anchor.slot_key : null,
      anchor ? anchor.id : null,
      signature2 ?? null,
      signature2 ?? null
    );
    const events2 = rows.slice(0, 16).map((row) => JSON.parse(String(row.event)));
    return { events: events2, next: rows.length > 16 ? events2.at(-1)?.id : void 0, cursorExpired: !!before && !anchor };
  }
  historySnapshot(network, stream, before, signature2) {
    this.db.exec("BEGIN");
    try {
      const result = { ...this.history(network, stream, before, signature2), checkpoint: this.checkpoint(network, stream), volume: this.marketVolume(network, stream) };
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
};

// src/lib/shared-backend.ts
var DEVNET_INDEX_NAMESPACE = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG:Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D";
var uint = (v) => typeof v === "string" && /^(0|[1-9]\d{0,19})$/.test(v) && BigInt(v) <= (1n << 64n) - 1n;
var pubkey = (v) => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
var signature = (v) => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(v);
var record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var demand = (v) => {
  if (!v) throw Error("Invalid bounded index operation.");
};
var observedTime = (v) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= Date.now() + 6e4;
function checkpoint(v) {
  demand(record(v));
  const c = v;
  demand(Object.keys(c).every((k) => ["anchor", "head", "before", "backfilled", "gap"].includes(k)));
  for (const k of ["anchor", "head", "before"]) if (c[k] !== void 0) demand(signature(c[k]));
  for (const k of ["backfilled", "gap"]) if (c[k] !== void 0) demand(typeof c[k] === "boolean");
}
function events(v) {
  demand(Array.isArray(v) && v.length <= 128);
  for (const e of v) {
    demand(record(e) && signature(e.signature) && uint(e.slot) && uint(e.lamports));
    demand(typeof e.id === "string" && e.id.startsWith(e.signature + ":") && /^(trade|claim|swap):\d{1,20}$/.test(e.id.slice(e.signature.length + 1)));
    demand(["buy", "sell", "creator-claim", "platform-claim"].includes(e.kind));
    demand(e.time === null || Number.isSafeInteger(e.time) && e.time >= 0 && e.time <= Date.now() / 1e3 + 60);
    demand(e.wallet === void 0 || pubkey(e.wallet));
    if (e.kind === "buy" || e.kind === "sell") demand(uint(e.tokens));
  }
}
function launches(v) {
  demand(Array.isArray(v) && v.length <= 64);
  for (const o of v) {
    demand(record(o) && typeof o.slot === "bigint" && uint(String(o.slot)) && record(o.row));
    const r = o.row;
    demand(pubkey(r.mint) && pubkey(r.creator) && (r.pool === void 0 || pubkey(r.pool)));
    demand(typeof r.name === "string" && Buffer.byteLength(r.name) <= 32 && typeof r.symbol === "string" && Buffer.byteLength(r.symbol) <= 10);
    demand(uint(r.activationSlot) && uint(r.volume) && /^\d{1,20}(\.\d{1,9})?$/.test(r.reserve ?? ""));
    demand(BigInt(r.activationSlot) <= o.slot);
    demand(Number.isInteger(r.progress) && r.progress >= 0 && r.progress <= 100 && typeof r.migrated === "boolean" && typeof r.eligible === "boolean");
  }
}
var DEFAULT_QUOTAS = { readClient: 60, readGlobal: 240, writeClient: 12, writeGlobal: 60, uploadClient: 2, uploadGlobal: 10, uploadDaily: 20 };
var PersistentRequestLimiter = class {
  constructor(path, quotas = DEFAULT_QUOTAS, database) {
    this.quotas = { ...DEFAULT_QUOTAS, ...quotas };
    for (const n of Object.values(this.quotas)) demand(Number.isInteger(n) && n > 0 && n <= 1e5);
    this.db = database ?? new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS request_quotas(scope TEXT NOT NULL,client TEXT NOT NULL,window INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(scope,client)); CREATE INDEX IF NOT EXISTS quota_expiry ON request_quotas(window); CREATE TABLE IF NOT EXISTS quota_clock(id INTEGER PRIMARY KEY CHECK(id=1),highwater INTEGER NOT NULL);");
  }
  admit(client, scope, now = Date.now()) {
    demand(/^[a-f0-9]{64}$/.test(client) && ["read", "write", "upload"].includes(scope));
    const globalLimit = scope === "upload" ? this.quotas.uploadGlobal : scope === "write" ? this.quotas.writeGlobal : this.quotas.readGlobal;
    const clientLimit = scope === "upload" ? this.quotas.uploadClient : scope === "write" ? this.quotas.writeClient : this.quotas.readClient;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const effectiveNow = Math.max(now, Number(this.db.prepare("SELECT highwater FROM quota_clock WHERE id=1").get()?.highwater ?? 0));
      this.db.prepare("INSERT INTO quota_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET highwater=MAX(highwater,excluded.highwater)").run(effectiveNow);
      const duration = scope === "upload" ? 36e5 : 6e4;
      const window = Math.floor(effectiveNow / duration) * duration, day = Math.floor(effectiveNow / 864e5) * 864e5;
      this.db.prepare("DELETE FROM request_quotas WHERE window + CASE WHEN scope='upload-day' THEN 86400000 WHEN scope='upload' THEN 3600000 ELSE 60000 END <= ?").run(effectiveNow);
      const count = (bucket, key, start) => Number(this.db.prepare("SELECT count FROM request_quotas WHERE scope=? AND client=? AND window=?").get(bucket, key, start)?.count ?? 0);
      if (count(scope, "*", window) >= globalLimit || count(scope, client, window) >= clientLimit || scope === "upload" && count("upload-day", "*", day) >= this.quotas.uploadDaily) {
        this.db.exec("COMMIT");
        return false;
      }
      const add = this.db.prepare("INSERT INTO request_quotas VALUES(?,?,?,1) ON CONFLICT(scope,client) DO UPDATE SET window=excluded.window,count=CASE WHEN request_quotas.window=excluded.window THEN request_quotas.count+1 ELSE 1 END");
      add.run(scope, "*", window);
      add.run(scope, client, window);
      if (scope === "upload") add.run("upload-day", "*", day);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
};
function createSharedBackend(path, token, quotas = DEFAULT_QUOTAS, options = {}) {
  demand(token.length >= 32 && token.length <= 256);
  const store = new MarketStore(path, options.database), limiter = new PersistentRequestLimiter(path, quotas, options.database);
  const json = (result, status = 200) => new Response(backendJson({ result: result ?? null }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return {
    close() {
      store.close();
      limiter.close();
    },
    async handle(request) {
      const expected = Buffer.from("Bearer " + token), supplied = Buffer.from(request.headers.get("authorization") ?? "");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return json(null, 401);
      if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/index") return json(null, 404);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json(null, 415);
      try {
        const reader = request.body?.getReader();
        demand(reader);
        const chunks = [];
        let size = 0;
        for (; ; ) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 131072) {
            await reader.cancel();
            return json(null, 413);
          }
          chunks.push(part.value);
        }
        const bytes = Buffer.concat(chunks);
        const body = backendParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        demand(record(body));
        const { op, args } = body;
        demand(Array.isArray(args) && args.length <= 6);
        const invoke = () => {
          if (op === "admit") {
            demand(args.length === 2);
            return json(limiter.admit(args[0], args[1]));
          }
          demand(args[0] === DEVNET_INDEX_NAMESPACE);
          const network = args[0], stream = args[1];
          if (["checkpoint", "commit", "commitDiscovery", "marketVolume", "history", "historySnapshot"].includes(op))
            demand(stream === "launch-activations-v1" || /^[1-9A-HJ-NP-Za-km-z]{32,44}:(curve|amm)$/.test(stream));
          switch (op) {
            case "checkpoint":
              demand(args.length === 2);
              return json(store.checkpoint(network, stream));
            case "marketVolume":
              demand(args.length === 2);
              return json(store.marketVolume(network, stream));
            case "discoveryUpdatedAt":
              demand(args.length === 1);
              return json(store.discoveryUpdatedAt(network));
            case "oldestLaunches":
              demand(args.length === 2 && observedTime(args[1]));
              return json(store.oldestLaunches(network, args[1]));
            case "launchPage": {
              demand(args.length === 2 && typeof stream === "string" && stream.length <= 1e3);
              const params = new URLSearchParams(stream);
              demand([...params.keys()].every((k) => ["view", "q", "creator", "limit", "after", "retry"].includes(k)));
              return json(store.launchPage(network, params));
            }
            case "history":
            case "historySnapshot":
              demand(args.length >= 2 && args.length <= 4 && (args[2] == null || typeof args[2] === "string" && args[2].length <= 120) && (args[3] == null || signature(args[3])));
              return json(store[op](network, stream, args[2], args[3]));
            case "writeLaunches":
              launches(args[1]);
              demand(args.length === 3 && observedTime(args[2]));
              store.writeLaunches(network, args[1], args[2]);
              return json(null);
            case "commit":
            case "commitDiscovery": {
              demand(args.length === (op === "commit" ? 5 : 6));
              checkpoint(args[2]);
              checkpoint(args[3]);
              if (args[2].gap) args[3].gap = true;
              if (op === "commit") {
                events(args[4]);
                return json(store.commit(network, stream, args[2], args[3], args[4]));
              }
              launches(args[4]);
              demand(observedTime(args[5]));
              return json(store.commitDiscovery(network, stream, args[2], args[3], args[4], args[5]));
            }
            default:
              return json(null, 400);
          }
        };
        return options.transaction ? options.transaction(invoke) : invoke();
      } catch {
        return json(null, 400);
      }
    }
  };
}

// workers/shared-devnet/src/worker.mjs
var OBJECT_NAME = "jeet-devnet-v1";
function authorized(request, token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return false;
  const actual = Buffer2.from(request.headers.get("authorization") ?? ""), expected = Buffer2.from("Bearer " + token);
  return actual.length === expected.length && timingSafeEqual2(actual, expected);
}
var JeetSharedIndex = class extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    const bindings = (values) => values.map((v) => typeof v === "bigint" ? v.toString() : v);
    const database = {
      // transactionSync below encloses the entire synchronous operation, including all legacy SQL calls.
      exec(query) {
        if (/^\s*(BEGIN(?: IMMEDIATE)?|COMMIT|ROLLBACK)\s*;?\s*$/i.test(query)) return;
        const statements = query.replace(/PRAGMA\s+[^;]+;/gi, "");
        if (statements.trim()) sql.exec(statements).toArray();
      },
      prepare(query) {
        const rows = (...values) => sql.exec(query, ...bindings(values)).toArray();
        return {
          all: rows,
          get: (...values) => rows(...values)[0],
          iterate: rows,
          // Fully consume before any await: no cursor crosses an input gate.
          run(...values) {
            rows(...values);
            return { changes: Number(sql.exec("SELECT changes() AS affected").one().affected), lastInsertRowid: 0 };
          }
        };
      },
      close() {
      }
      // Runtime owns the Durable Object lifecycle.
    };
    this.backend = createSharedBackend(":memory:", env.JEET_SHARED_BACKEND_TOKEN, void 0, {
      database,
      transaction: (run) => ctx.storage.transactionSync(run)
    });
  }
  async fetch(request) {
    return this.backend.handle(request);
  }
};
var worker = {
  async fetch(request, env) {
    if (!authorized(request, env.JEET_SHARED_BACKEND_TOKEN)) return new Response("Unauthorized", { status: 401 });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/index") return new Response("Not found", { status: 404 });
    try {
      return await env.JEET_SHARED.get(env.JEET_SHARED.idFromName(OBJECT_NAME)).fetch(request);
    } catch {
      return Response.json({ error: "Shared backend unavailable." }, { status: 503 });
    }
  }
};
var worker_default = worker;
export {
  JeetSharedIndex,
  worker_default as default
};
