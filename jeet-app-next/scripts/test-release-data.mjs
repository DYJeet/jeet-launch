import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketStore } from "../src/lib/market-store.ts";
import { curveTradeEvents, feeClaimEvents } from "../src/lib/curve-history.ts";
import { getAddressDecoder } from "@solana/kit";

test("launch views filter stages and rank with exact turnover and slot values", () => {
  const rows = [
    { mint: "b", name: "Miso", symbol: "M", progress: 95, volume: "9007199254740992", activationSlot: "1" },
    { mint: "a", name: "Soba", symbol: "S", progress: 100, volume: "9007199254740993", activationSlot: "2", migrated: true },
    { mint: "c", name: "Udon", symbol: "U", progress: 4, volume: "0", activationSlot: "3" },
  ];
  const store = new MarketStore(":memory:");
  try {
    store.writeLaunches("chain", rows.map(row => ({ row: {
      progress: 0, reserve: "0", eligible: false, migrated: false, ...row,
    }, slot: 5n })), 100);
    const page = query => store.launchPage("chain", new URLSearchParams(query));
    const mints = query => page(query).rows.map(row => row.mint);
    assert.deepEqual(mints("view=New"), ["c", "a", "b"]);
    assert.deepEqual(mints("view=Trending"), ["a", "b"]);
    assert.deepEqual(mints("view=Final+Stretch"), ["b"]);
    assert.deepEqual(mints("view=Migrated&q=SOBA"), ["a"]);
    const first = page("view=New&limit=1");
    assert.equal(first.next, "0.c");
    assert.deepEqual(mints("view=New&limit=1&after=" + first.next), ["a"]);
    assert.equal(page("view=Migrated&after=" + first.next).cursorExpired, true);
    const ranked = page("view=Trending&limit=1");
    store.writeLaunches("chain", [{ row: { migrated: false, ...rows[0], volume: "9007199254740999" }, slot: 6n }], 200);
    assert.equal(page("view=Trending&after=" + ranked.next).cursorExpired, true);
    assert.deepEqual(mints("view=Trending"), ["b", "a"]);
  } finally {
    store.close();
  }
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
  const claim = (kind, paid, total) => "Program data: " +
    [Buffer.from("JEET_FEE_CLAIM_V1"), key, key, Buffer.from([kind]), n(paid), n(total)]
      .map(field => field.toString("base64")).join(" ");
  assert.deepEqual(feeClaimEvents(["Program AAA invoke [1]", "Program BBB invoke [2]",
    claim(0, 9, 9), "Program BBB success", claim(1, 3, 3), claim(0, 5, 4), "Program AAA success"], "AAA", mint),
    [{ beneficiary: mint, platform: false, paid: 3n, withdrawn: 3n }]);

});

test("Raydium history reconciles exact scoped transfers and rejects substituted evidence", async () => {
  const { getBase58Decoder } = await import("@solana/kit");
  const { TOKEN_PROGRAM_ADDRESS } = await import("@solana-program/token");
  const { CPMM_TEST_PROGRAM, NATIVE_MINT, graduationAddresses } = await import("../src/lib/launch-graduation.ts");
  const { ammHistoryPool, ammTradeEvents } = await import("../src/lib/amm-history.ts");
  const key = n => getAddressDecoder().decode(Buffer.alloc(32, n));
  const mint = key(1);
  const pool = await graduationAddresses(mint, 0n);
  await assert.rejects(ammHistoryPool(mint, key(5)), /Unrecognized/);
  assert.equal((await ammHistoryPool(mint, pool.pool)).pool, pool.pool);
  const encode = bytes => getBase58Decoder().decode(bytes);
  for (const sell of [false, true]) {
    const mintIn = sell ? mint : NATIVE_MINT;
    const mintOut = sell ? NATIVE_MINT : mint;
    const forward = mintIn === pool.mint0;
    const wallet = key(2);
    const keys = [wallet, pool.authority, pool.config, pool.pool, key(3), key(4),
      forward ? pool.vault0 : pool.vault1, forward ? pool.vault1 : pool.vault0,
      TOKEN_PROGRAM_ADDRESS, mintIn, mintOut, pool.observation, CPMM_TEST_PROGRAM];
    const data = Buffer.alloc(24);
    data.set([143, 190, 90, 218, 196, 30, 51, 222]);
    const input = sell ? 10n : 1000n;
    const output = sell ? 1157n : 7n;
    data.writeBigUInt64LE(input, 8);
    data.writeBigUInt64LE(output, 16);
    const transfer = (amount, accounts) => {
      const bytes = Buffer.alloc(10);
      bytes[0] = 12;
      bytes.writeBigUInt64LE(amount, 1);
      return { programIdIndex: 8, accounts, data: encode(bytes) };
    };
    const deposit = transfer(input, [4, 9, 6, 0]);
    const payout = transfer(output, [7, 10, 5, 1]);
    const tx = { transaction: { message: { accountKeys: keys.slice(0, 11), instructions: [
      { programIdIndex: 12, accounts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10, 11], data: encode(data) },
    ] } }, meta: { err: null, loadedAddresses: { writable: [], readonly: keys.slice(11) },
      innerInstructions: [{ index: 0, instructions: [deposit, payout] }] } };
    assert.deepEqual(ammTradeEvents(tx, pool), [{ index: 0, wallet, sell,
      tokens: sell ? input : output, raw: sell ? output : input }]);
    assert.deepEqual(ammTradeEvents({ ...tx, meta: { ...tx.meta, err: "Failed" } }, pool), []);
    assert.deepEqual(ammTradeEvents({ ...tx, meta: { ...tx.meta, innerInstructions: [{ index: 1, instructions: [deposit, payout] }] } }, pool), []);
    tx.meta.innerInstructions[0].instructions[1] = transfer(output, [6, 10, 5, 1]);
    assert.deepEqual(ammTradeEvents(tx, pool), []);
    tx.meta.innerInstructions[0].instructions[1] = transfer(output - 1n, [7, 10, 5, 1]);
    assert.deepEqual(ammTradeEvents(tx, pool), []);
  }
});

test("discovery pages 137 stored launches without duplicates and isolates chains", () => {
  const store = new MarketStore(":memory:");
  try {
    const launches = Array.from({ length: 137 }, (_, i) => ({
      slot: 250n,
      row: { mint: "mint-" + i, name: "Launch " + i, symbol: "T" + i, activationSlot: String(i),
        volume: "0", progress: 0, reserve: "0", migrated: false, eligible: false },
    }));
    store.writeLaunches("chain", [...launches, ...launches], 100);
    const params = new URLSearchParams({ limit: "12" });
    const mints = [];
    for (;;) {
      const page = store.launchPage("chain", params);
      assert.equal(page.total, 137);
      mints.push(...page.rows.map(row => row.mint));
      if (!page.next) break;
      params.set("after", page.next);
    }
    assert.deepEqual(mints, launches.map(item => item.row.mint).reverse());
    assert.equal(store.launchPage("other", new URLSearchParams()).total, 0);
  } finally {
    store.close();
  }
});
