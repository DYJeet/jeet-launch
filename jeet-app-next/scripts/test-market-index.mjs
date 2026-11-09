import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MarketStore } from "../src/lib/market-store.ts";
import { ingestMarketPage } from "../src/lib/market-ingest.ts";

const entries = n => Array.from({ length: n }, (_, i) => ({
  signature: "signature-" + (n - i), slot: BigInt(n - i), failed: false,
}));
const event = ({ signature, slot }) => ({
  id: signature + ":trade:0", signature, slot: String(slot), time: null,
  kind: "buy", lamports: "100000000", tokens: "10",
});
const source = (rows, unavailable) => ({
  async signatures(before) {
    if (before && !rows.some(row => row.signature === before)) return [];
    return rows.slice(before ? rows.findIndex(row => row.signature === before) + 1 : 0).slice(0, 16);
  },
  async events(entry) {
    if (entry.signature === unavailable) throw Error("Missing RPC transaction");
    return [event(entry)];
  },
});

test("finalized backfill resumes after restart, pages without duplicates and ingests new head", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jeet-index-"));
  const path = join(dir, "index.sqlite");
  let store = new MarketStore(path);
  const stream = "mint:curve";
  try {
    const original = entries(22);
    await ingestMarketPage(store, "chain-a", stream, source(original));
    assert.equal(store.checkpoint("chain-a", stream).before, "signature-7");
    store.commitDiscovery("chain-a", "launches", {}, {}, [], 123);
    store.close();
    store = new MarketStore(path);
    assert.equal(store.discoveryUpdatedAt("chain-a"), 123);
    assert.equal(store.discoveryUpdatedAt("chain-b"), undefined);
    await assert.rejects(ingestMarketPage(store, "chain-a", stream, source(original, "signature-5")), /Missing/);
    assert.equal(store.checkpoint("chain-a", stream).before, "signature-7");
    assert.equal(store.history("chain-a", stream).events.length, 16);
    await ingestMarketPage(store, "chain-a", stream, source(original));
    assert.equal(store.checkpoint("chain-a", stream).anchor, "signature-22");
    await ingestMarketPage(store, "chain-a", stream, source(entries(23)));
    await ingestMarketPage(store, "chain-a", stream, source(entries(23)));
    const first = store.history("chain-a", stream);
    const next = store.history("chain-a", stream, first.next);
    assert.equal(new Set([...first.events, ...next.events].map(row => row.id)).size, 23);
    assert.equal(store.history("chain-a", stream, undefined, "signature-9").events.length, 1);
    assert.equal(store.history("chain-b", stream).events.length, 0);
    assert.deepEqual(store.marketVolume("chain-a", stream), { lamports: 2300000000n, tokens: 230n, trades: 23 });
    assert.deepEqual(store.marketVolume("chain-b", stream), { lamports: 0n, tokens: 0n, trades: 0 });
    await ingestMarketPage(store, "chain-a", stream, source([{ signature: "pruned-head", slot: 29n }]));
    assert.equal(store.checkpoint("chain-a", stream).gap, true);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("rejects duplicate RPC pages and commits only one concurrent checkpoint", async () => {
  const store = new MarketStore(":memory:");
  try {
    const [row] = entries(1);
    await assert.rejects(ingestMarketPage(store, "chain", "stream", source([row, row])), /Inconsistent/);
    const claims = await Promise.all([
      ingestMarketPage(store, "chain", "stream", source([row])),
      ingestMarketPage(store, "chain", "stream", source([row])),
    ]);
    assert.deepEqual(claims.sort(), [false, true]);
    assert.equal(store.history("chain", "stream").events.length, 1);
  } finally { store.close(); }
});
