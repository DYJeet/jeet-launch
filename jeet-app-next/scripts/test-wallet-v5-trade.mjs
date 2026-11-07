import assert from "node:assert/strict";
import test from "node:test";
import { tradePreview, openingBuyLimit } from "../src/lib/wallet-v5-trade.ts";
import { v5Quote } from "../src/lib/v5-pricing.ts";

function market() {
  const curveData = new Uint8Array(262);
  const openingData = new Uint8Array(108);
  new DataView(curveData.buffer).setBigUint64(162, 10n, true);
  return {
    launch: {
      mint: { mintAuthority: null, freezeAuthority: null },
      state: { start: 42n, end: 126n, inventory: 594n, quantum: 1n, sold: 20n, reserve: 878n, sequence: 9n },
      metadata: {},
      terms: {},
      slot: 11n,
      curveData,
      openingData,
      fees: [{ accrued: 7n }, { accrued: 2n }],
    },
    purchased: 25n,
    tokens: 20n,
    setup: 5000n,
  };
}

test("V5 wallet budget chooses exact executable quanta within fee-inclusive spend", () => {
  const m = market(), s = m.launch.state;
  const q = tradePreview(m, 1000n, false, 50n);
  assert.equal(q.sequence, 9n);
  assert.equal(q.setup, 5000n);
  assert.ok(q.user <= q.bound && q.bound <= 1000n);
  assert.ok(v5Quote(s, s.sold, q.amount + 1n, 7n, 2n).user > 1000n);
  assert.equal(q.raw + q.platform + q.creator, q.user);
});

test("redemption keeps the program fee split and rounds minimum net SOL down", () => {
  const m = market();
  const q = tradePreview(m, 11n, true, 50n);
  assert.equal(q.user, q.raw - q.platform - q.creator);
  assert.equal(q.bound, q.user * 9950n / 10000n);
  assert.equal(q.setup, 0n);
  assert.throws(() => tradePreview(m, 21n, true, 0n), /Insufficient tokens/);
});

test("opening limits use gross purchases and expired caps do not suppress quotes", () => {
  const m = market();
  const data = new DataView(m.launch.openingData.buffer);
  data.setBigUint64(72, 30n, true);
  data.setBigUint64(88, 12n, true);
  m.launch.openingData[96] = 1;
  assert.equal(openingBuyLimit(m), 5n);
  assert.throws(() => tradePreview(m, 1000n, false, 0n), /opening limit/);
  m.launch.slot = 12n;
  assert.equal(openingBuyLimit(m), 574n);
  assert.ok(tradePreview(m, 1000n, false, 0n).amount > 5n);
});

test("unactivated, not-yet-open and migrated launches cannot construct a quote", () => {
  for (const patch of [{ terms: null }, { slot: 9n }, { terms: { migrated: true } }]) {
    const m = market();
    Object.assign(m.launch, patch);
    assert.throws(() => tradePreview(m, 10n, true, 0n), /unavailable/);
    assert.throws(() => tradePreview(m, 1000n, false, 0n), /unavailable/);
  }
});
