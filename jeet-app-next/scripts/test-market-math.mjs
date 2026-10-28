import assert from "node:assert/strict";
import { test } from "node:test";
import { feeAmounts } from "../src/lib/launch-fees.ts";
import { marketFeeOracle, redemptionOracle } from "../src/lib/launch-market.ts";
test("V3 and V4 worst-case dust rates and strict absolute rounding bounds", () => {
  let oldMax = [0n, 1n],
    nextMax = [0n, 1n];
  for (let raw = 1n; raw <= 100000n; raw++) {
    const old = feeAmounts(raw).fees,
      next = marketFeeOracle(raw, 0n, 0n).total;
    assert.ok(old * 100n - raw < 200n);
    assert.ok(next * 100n - raw < 100n);
    if (old * oldMax[1] > oldMax[0] * raw) oldMax = [old, raw];
    if (next * nextMax[1] > nextMax[0] * raw) nextMax = [next, raw];
  }
  assert.deepEqual(oldMax, [2n, 1n]);
  assert.deepEqual(nextMax, [1n, 1n]);
});
test("repeat microtrades never evade total fees; carry allocations conserve 3:1", () => {
  let p = 0n,
    c = 0n;
  for (let i = 0; i < 10000; i++) {
    const q = marketFeeOracle(1n, p, c);
    assert.equal(q.total, 1n);
    p += q.platform;
    c += q.creator;
    assert.equal(p + c, BigInt(i + 1));
    assert.equal(p, (3n * (p + c) + 3n) / 4n);
  }
  assert.deepEqual([p, c], [7500n, 2500n]);
});
test("splitting cannot reduce rounded total fee", () => {
  for (let a = 1n; a < 300n; a++)
    for (let b = 1n; b < 300n; b++)
      assert.ok(
        marketFeeOracle(a, 0n, 0n).total + marketFeeOracle(b, 0n, 0n).total >=
          marketFeeOracle(a + b, 0n, 0n).total,
      );
});
test("integer inverse is conservative across denomination boundaries", () => {
  for (const scale of [1n, 10n, 1000000000n])
    for (let n = 1n; n <= 100n; n++) {
      const c = { base: 1000n, slope: 7n, scale, sold: n };
      const raw = redemptionOracle(c, n);
      const numerator = 1000n * n * scale + (7n * n * (n - 1n)) / 2n,
        den = scale * scale;
      assert.equal(raw, numerator / den);
      assert.ok(raw <= numerator / den + (numerator % den ? 1n : 0n));
    }
});
test("invalid and negative-equivalent values are rejected", () => {
  for (const raw of [0n, -1n, 1n << 64n])
    assert.throws(() => marketFeeOracle(raw, 0n, 0n));
  assert.throws(() => marketFeeOracle(1n, 0n, 1n));
  assert.throws(() =>
    redemptionOracle({ base: 1n, slope: 0n, scale: 1n, sold: 0n }, 1n),
  );
});
