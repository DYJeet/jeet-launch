import assert from "node:assert/strict";
import { test } from "node:test";
import {
  floorSum,
  potential,
  validateV5,
  v5Raw,
  v5Quote,
  v5Budget,
  v5Fees,
} from "../src/lib/v5-pricing.ts";
const p = { inventory: 594000000n, quantum: 1n, start: 42n, end: 126n };
test("whole-token quantum: exact documented economic delta, monotonicity and no free tokens", () => {
  assert.equal(potential(p, p.inventory), 50192999999n);
  assert.equal(potential(p, p.inventory) - 49896296996n, 296703003n);
  for (let i = 0n; i < 10000n; i++) {
    const k = i * 59400n;
    const marginal = v5Raw(p, k, 1n);
    assert.ok(marginal >= 42n && marginal <= 126n);
    if (k + 1n < p.inventory) assert.ok(v5Raw(p, k + 1n, 1n) >= marginal);
  }
  assert.equal(v5Raw(p, p.inventory - 1n, 1n), 126n);
  assert.equal(v5Raw(p, 1n, 1n), 43n);
  assert.equal(v5Raw(p, 7071428n, 1n), 43n);
  assert.equal(v5Raw(p, 7071429n, 1n), 44n);
  for (const [quantum, expected] of [
    [1000n, 49896296996n],
    [100n, 49898969999n],
    [10n, 49925699999n],
    [1n, 50192999999n],
  ])
    assert.equal(
      potential(
        { ...p, quantum, start: 42n * quantum, end: 126n * quantum },
        p.inventory,
      ),
      expected,
    );
});
test("Euclidean floor sum agrees with brute force including zero terms", () => {
  for (let n = 0n; n < 20n; n++)
    for (let d = 1n; d < 20n; d++)
      for (let a = 0n; a < 10n; a++) {
        let sum = 0n;
        for (let i = 0n; i < n; i++) sum += (a * i + 7n) / d;
        assert.equal(floorSum(n, d, a, 7n), sum);
      }
});
test("SOL-budget buys are maximal, fee-inclusive and deterministic", () => {
  for (const sold of [0n, 10n, 300000000n, p.inventory - 10000n])
    for (const budget of [43n, 100n, 100000n, 10000000n]) {
      if (v5Quote(p, sold, 1n).user > budget) {
        assert.throws(() => v5Budget(p, sold, budget));
        continue;
      }
      const q = v5Budget(p, sold, budget);
      assert.ok(q.user <= budget);
      assert.deepEqual(q, v5Quote(p, sold, q.amount));
      if (sold + q.amount < p.inventory)
        assert.ok(v5Quote(p, sold, q.amount + 1n).user > budget);
    }
});
test("20k ordered multiwallet trades telescope exact SOL and supply with gross cap receipts", () => {
  let sold = 0n,
    reserve = 0n,
    buyPayments = 0n,
    sellNet = 0n,
    pa = 0n,
    ca = 0n;
  const wallets = [0n, 0n, 0n],
    gross = [0n, 0n, 0n];
  for (let i = 1n; i <= 20000n; i++) {
    const w = Number(i % 3n),
      n = ((i * 13n) % 113n) + 1n,
      sell = i % 4n === 0n && wallets[w] >= n;
    const q = v5Quote(p, sold, n, pa, ca, sell);
    pa += q.platform;
    ca += q.creator;
    if (sell) {
      sold -= n;
      wallets[w] -= n;
      reserve -= q.raw;
      sellNet += q.user;
    } else {
      sold += n;
      wallets[w] += n;
      gross[w] += n;
      reserve += q.raw;
      buyPayments += q.user;
    }
    assert.equal(reserve, potential(p, sold));
    assert.equal(buyPayments, sellNet + reserve + pa + ca);
    assert.equal(
      wallets.reduce((a, b) => a + b),
      sold,
    );
    assert.ok(gross[w] >= wallets[w]);
    assert.equal(
      10000000n +
        wallets.reduce((a, b) => a + b) +
        (p.inventory - sold) +
        396000000n,
      1000000000n,
    );
  }
  assert.equal(v5Raw(p, sold, sold, true), reserve);
});
test("quantity, boundary, invalid state, dust and overflow rejection", () => {
  for (const x of [0n, -1n, p.inventory + 1n])
    assert.throws(() => v5Raw(p, 0n, x));
  assert.throws(() => v5Raw(p, 0n, 1n, true));
  assert.throws(() =>
    v5Quote({ ...p, start: 1n, end: 1n }, 0n, 1n, 0n, 0n, true),
  );
  assert.throws(() => validateV5({ ...p, start: 0n }));
  assert.throws(() => validateV5({ ...p, end: 41n }));
  assert.throws(() => potential({ ...p, quantum: 1000n }, 1n));
  assert.throws(() => v5Fees(1n, 0n, 1n));
  assert.throws(() =>
    validateV5({
      ...p,
      inventory: (1n << 64n) - 1n,
      start: (1n << 64n) - 1n,
      end: (1n << 64n) - 1n,
    }),
  );
  assert.equal(
    v5Raw(p, 0n, p.inventory),
    v5Raw(p, p.inventory, p.inventory, true),
  );
  assert.throws(() => floorSum((1n << 64n) - 1n, 1n, (1n << 64n) - 1n, 1n));
});
