import assert from "node:assert/strict";
import { test } from "node:test";
import { indexPage } from "../src/lib/launch-index.ts";
import { curveTradeEvents } from "../src/lib/curve-history.ts";
import { getAddressDecoder } from "@solana/kit";

test("launch views filter stages and rank with exact turnover and slot values", () => {
  const rows = [
    { mint: "b", name: "Miso", symbol: "M", progress: 95, volume: "9007199254740992", activationSlot: "1" },
    { mint: "a", name: "Soba", symbol: "S", progress: 100, volume: "9007199254740993", activationSlot: "2", migrated: true },
    { mint: "c", name: "Udon", symbol: "U", progress: 4, volume: "0", activationSlot: "3" },
  ];
  const mints = query => indexPage(rows, new URLSearchParams(query)).rows.map(row => row.mint);
  assert.deepEqual(mints("view=New"), ["c", "a", "b"]);
  assert.deepEqual(mints("view=Trending"), ["a", "b"]);
  assert.deepEqual(mints("view=Final+Stretch"), ["b"]);
  assert.deepEqual(mints("view=Migrated&q=SOBA"), ["a"]);
  assert.deepEqual(mints("view=New&offset=1&limit=1"), ["a"]);
});

test("curve activity accepts attributable trade logs and ignores nested substitutions", () => {
  const key = Buffer.alloc(32, 1);
  const mint = getAddressDecoder().decode(key);
  const n = value => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return buffer;
  };
  const fields = [Buffer.from("JEET_V5_PREVIEW_TRADE"), key, key, Buffer.from([0]),
    ...[10, 100, 1, 0, 101, 10, 100, 1].map(n)];
  const event = "Program data: " + fields.map(field => field.toString("base64")).join(" ");
  const logs = ["Program AAA invoke [1]", "Program BBB invoke [2]", event, "Program BBB success",
    event, "Program AAA success"];
  assert.deepEqual(curveTradeEvents(logs, "AAA", mint),
    [{ wallet: mint, sell: false, tokens: 10n, raw: 100n, sequence: 1n }]);
  assert.deepEqual(curveTradeEvents(logs.slice(0, -1), "AAA", mint), []);
  assert.deepEqual(curveTradeEvents(logs, "AAA", "wrong-mint"), []);
});
