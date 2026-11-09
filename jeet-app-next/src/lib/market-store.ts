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
export type Discovery = { rows: IndexedLaunch[]; indexedAt: number };

export class MarketStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout=3000;
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS discovery (
        network TEXT PRIMARY KEY, document TEXT NOT NULL
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
      CREATE INDEX IF NOT EXISTS market_events_order
        ON market_events(network, stream, slot_key DESC, id DESC);
    `);
  }
  close() { this.db.close(); }
  readDiscovery(network: string): Discovery | undefined {
    const row = this.db.prepare("SELECT document FROM discovery WHERE network=?").get(network);
    return row && JSON.parse(String(row.document));
  }
  writeDiscovery(network: string, value: Discovery) {
    this.db.prepare(`INSERT INTO discovery VALUES (?,?)
      ON CONFLICT(network) DO UPDATE SET document=excluded.document`).run(network, JSON.stringify(value));
  }
  checkpoint(network: string, stream: string): Checkpoint {
    const row = this.db.prepare("SELECT checkpoint FROM streams WHERE network=? AND stream=?").get(network, stream);
    return row ? JSON.parse(String(row.checkpoint)) : {};
  }
  commit(network: string, stream: string, previous: Checkpoint, next: Checkpoint, events: MarketEvent[]) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (JSON.stringify(this.checkpoint(network, stream)) !== JSON.stringify(previous)) {
        this.db.exec("ROLLBACK");
        return false;
      }
      const insert = this.db.prepare("INSERT OR IGNORE INTO market_events VALUES (?,?,?,?,?,?)");
      for (const event of events)
        insert.run(network, stream, event.id, event.signature, event.slot.padStart(20, "0"), JSON.stringify(event));
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
