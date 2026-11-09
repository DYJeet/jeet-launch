// Server-side durable adapter. The index is derived data and holds no signing material.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IndexedLaunch } from "./launch-index.ts";

export type MarketEvent = {
  id: string;
  signature: string;
  slot: string;
  time: number | null;
  kind: "buy" | "sell" | "creator-claim" | "platform-claim";
  tokens?: string;
  lamports: string;
  wallet?: string;
};

export type Checkpoint = { anchor?: string; head?: string; before?: string; backfilled?: boolean; gap?: boolean };
export type LaunchObservation = { row: IndexedLaunch; slot: bigint };

export class MarketStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout=3000;
      PRAGMA journal_mode=WAL;
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
  close() { this.db.close(); }
  discoveryUpdatedAt(network: string) {
    const record = this.db.prepare("SELECT indexed_at FROM launch_sync WHERE network=?").get(network);
    return record ? Number(record.indexed_at) : undefined;
  }
  oldestLaunches(network: string, before: number) {
    return this.db.prepare("SELECT mint,creator FROM launches WHERE network=? AND observed<=? ORDER BY observed,mint LIMIT 4")
      .all(network, before).map(record => ({ mint: String(record.mint), creator: String(record.creator) }));
  }
  writeLaunches(network: string, observations: LaunchObservation[], observed: number) {
    const upsert = this.db.prepare(`INSERT INTO launches VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(network,mint) DO UPDATE SET name=excluded.name,symbol=excluded.symbol,
        volume=excluded.volume,progress=excluded.progress,migrated=excluded.migrated,
        slot=excluded.slot,observed=excluded.observed,document=excluded.document
      WHERE excluded.slot>=launches.slot`);
    for (const { row, slot } of observations)
      upsert.run(network, row.mint, row.creator ?? "", row.name, row.symbol, row.activationSlot.padStart(20, "0"),
        row.volume.padStart(21, "0"), row.progress, Number(row.migrated), String(slot).padStart(20, "0"),
        observed, JSON.stringify({ ...row, observedAt: observed, observedSlot: String(slot) }));
  }
  launchPage(network: string, params: URLSearchParams) {
    const view = params.get("view");
    const query = (params.get("q") ?? "").trim().slice(0, 100).toLowerCase();
    const creator = params.get("creator") ?? "";
    const limit = Math.min(12, Math.max(1, Number.parseInt(params.get("limit") ?? "12", 10) || 12));
    const rank = view === "Trending" ? "volume," : view === "Final Stretch" ? "progress," : "";
    const sort = rank + "activation,mint";
    const stage = view === "Trending" ? "volume>'000000000000000000000'" :
      view === "Final Stretch" ? "migrated=0 AND progress>=90" : view === "Migrated" ? "migrated=1" : "1";
    const filters = ["network=?", stage];
    const args = [network];
    if (creator) { filters.push("creator=?"); args.push(creator); }
    if (query) {
      filters.push("(instr(lower(name),?) OR instr(lower(symbol),?) OR instr(lower(mint),?) OR instr(lower(creator),?))");
      args.push(query, query, query, query);
    }
    const where = filters.join(" AND ");
    const total = Number(this.db.prepare(`SELECT count(*) AS total FROM launches WHERE ${where}`).get(...args)?.total);
    const cursor = params.get("after");
    const version = rank ? String(this.db.prepare("SELECT version FROM launch_rank_versions WHERE network=?")
      .get(network)?.version ?? 0) : "0";
    const [cursorVersion, mint] = cursor?.split(".") ?? [];
    const anchor = cursorVersion === version && mint && mint.length <= 44
      ? this.db.prepare(`SELECT ${sort} FROM launches WHERE ${where} AND mint=?`).get(...args, mint)
      : undefined;
    if (cursor && !anchor) return { rows: [], total, cursorExpired: true };
    const bounds = anchor ? `AND (${sort}) < (${Object.keys(anchor).map(() => "?").join(",")})` : "";
    const order = sort.split(",").map(column => column + " DESC").join(",");
    const records = this.db.prepare(`SELECT document FROM launches WHERE ${where} ${bounds} ORDER BY ${order} LIMIT ?`)
      .all(...args, ...Object.values(anchor ?? {}), limit + 1);
    const rows: IndexedLaunch[] = records.slice(0, limit).map(record => JSON.parse(String(record.document)));
    return { rows, total, cursorExpired: false, next: records.length > limit ? version + "." + rows.at(-1)!.mint : undefined };
  }
  commitDiscovery(network: string, stream: string, previous: Checkpoint, next: Checkpoint,
    observations: LaunchObservation[], observed: number) {
    return this.commitPage(network, stream, previous, next, () => {
      this.writeLaunches(network, observations, observed);
      this.db.prepare(`INSERT INTO launch_sync VALUES (?,?)
        ON CONFLICT(network) DO UPDATE SET indexed_at=MAX(launch_sync.indexed_at,excluded.indexed_at)`).run(network, observed);
    });
  }
  checkpoint(network: string, stream: string): Checkpoint {
    const row = this.db.prepare("SELECT checkpoint FROM streams WHERE network=? AND stream=?").get(network, stream);
    return row ? JSON.parse(String(row.checkpoint)) : {};
  }
  commit(network: string, stream: string, previous: Checkpoint, next: Checkpoint, events: MarketEvent[]) {
    return this.commitPage(network, stream, previous, next, () => {
      const volume = this.marketVolume(network, stream);
      const insert = this.db.prepare("INSERT OR IGNORE INTO market_events VALUES (?,?,?,?,?,?)");
      for (const event of events) {
        const result = insert.run(network, stream, event.id, event.signature, event.slot.padStart(20, "0"), JSON.stringify(event));
        if (result.changes && (event.kind === "buy" || event.kind === "sell")) {
          volume.lamports += BigInt(event.lamports);
          volume.tokens += BigInt(event.tokens!);
          volume.trades++;
        }
      }
      this.db.prepare(`INSERT INTO market_volume VALUES (?,?,?,?,?)
        ON CONFLICT(network,stream) DO UPDATE SET lamports=excluded.lamports,tokens=excluded.tokens,trades=excluded.trades`)
        .run(network, stream, String(volume.lamports), String(volume.tokens), volume.trades);
    });
  }
  private commitPage(network: string, stream: string, previous: Checkpoint, next: Checkpoint, write: () => void) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (JSON.stringify(this.checkpoint(network, stream)) !== JSON.stringify(previous)) {
        this.db.exec("ROLLBACK");
        return false;
      }
      write();
      this.db.prepare(`INSERT INTO streams VALUES (?,?,?)
        ON CONFLICT(network,stream) DO UPDATE SET checkpoint=excluded.checkpoint`)
        .run(network, stream, JSON.stringify(next));
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  marketVolume(network: string, stream: string) {
    const saved = this.db.prepare("SELECT lamports,tokens,trades FROM market_volume WHERE network=? AND stream=?").get(network, stream);
    if (saved) return { lamports: BigInt(String(saved.lamports)), tokens: BigInt(String(saved.tokens)), trades: Number(saved.trades) };
    const result = { lamports: 0n, tokens: 0n, trades: 0 };
    // Upgrade pre-volume archives without rewriting or dropping their receipts.
    const entries = this.db.prepare("SELECT event FROM market_events WHERE network=? AND stream=?").iterate(network, stream);
    for (const row of entries) {
      const event: MarketEvent = JSON.parse(String(row.event));
      if (event.kind !== "buy" && event.kind !== "sell") continue;
      result.lamports += BigInt(event.lamports);
      result.tokens += BigInt(event.tokens!);
      result.trades++;
    }
    return result;
  }
  history(network: string, stream: string, before?: string, signature?: string) {
    const anchor = before && this.db.prepare(`SELECT slot_key,id FROM market_events
      WHERE network=? AND stream=? AND id=?`).get(network, stream, before);
    const rows = this.db.prepare(`SELECT event FROM market_events WHERE network=? AND stream=?
      AND (? IS NULL OR (slot_key,id) < (?,?)) AND (? IS NULL OR signature=?)
      ORDER BY slot_key DESC,id DESC LIMIT 17`).all(network, stream,
      anchor ? anchor.slot_key : null, anchor ? anchor.slot_key : null, anchor ? anchor.id : null,
      signature ?? null, signature ?? null);
    const events: MarketEvent[] = rows.slice(0, 16).map(row => JSON.parse(String(row.event)));
    return { events, next: rows.length > 16 ? events.at(-1)?.id : undefined, cursorExpired: !!before && !anchor };
  }
}

let instance: MarketStore | undefined;
export function marketStore() {
  return instance ??= new MarketStore(process.env.JEET_MARKET_DB || resolve(".jeet-index", "market.sqlite"));
}
