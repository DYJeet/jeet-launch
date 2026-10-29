/** Opt-in V5 reference arithmetic. No launch defaults, wallet actions or deployment. */
const U64 = (1n << 64n) - 1n;
const U128 = (1n << 128n) - 1n;
function bounded(n: bigint, max = U64): bigint {
  if (typeof n !== "bigint" || n < 0n || n > max)
    throw new Error("V5 integer range");
  return n;
}
export function floorSum(n: bigint, d: bigint, a: bigint, b: bigint): bigint {
  for (const x of [n, d, a, b]) bounded(x);
  if (!d) throw new Error("V5 denominator");
  let out = 0n;
  for (;;) {
    if (a >= d) {
      out = bounded(out + bounded(n * (n - 1n) * (a / d), U128) / 2n, U128);
      a %= d;
    }
    if (b >= d) {
      out = bounded(out + bounded(n * (b / d), U128), U128);
      b %= d;
    }
    const y = bounded(a * n + b, U128);
    if (y < d) return out;
    n = y / d;
    b = y % d;
    [d, a] = [a, d];
  }
}
export type V5Parameters = {
  inventory: bigint;
  quantum: bigint;
  start: bigint;
  end: bigint;
};
export function validateV5(p: V5Parameters) {
  for (const n of [p.inventory, p.quantum, p.start, p.end]) bounded(n);
  if (
    !p.quantum ||
    p.inventory % p.quantum ||
    p.inventory / p.quantum < 2n ||
    !p.start ||
    p.end < p.start
  )
    throw new Error("V5 parameters");
  potential(p, p.inventory);
  return p;
}
export function potential(p: V5Parameters, sold: bigint): bigint {
  bounded(sold);
  for (const n of [p.inventory, p.quantum, p.start, p.end]) bounded(n);
  if (
    !p.quantum ||
    sold % p.quantum ||
    sold > p.inventory ||
    p.inventory % p.quantum ||
    p.inventory / p.quantum < 2n ||
    !p.start ||
    p.end < p.start
  )
    throw new Error("V5 quantity");
  const n = sold / p.quantum,
    d = p.inventory / p.quantum - 1n;
  return bounded(
    bounded(p.start * n, U128) + floorSum(n, d, p.end - p.start, d - 1n),
  );
}
export function v5Raw(
  p: V5Parameters,
  sold: bigint,
  amount: bigint,
  sell = false,
): bigint {
  bounded(amount);
  bounded(sold);
  if (!amount || amount % p.quantum || (sell && amount > sold))
    throw new Error("V5 quantity");
  return sell
    ? potential(p, sold) - potential(p, sold - amount)
    : potential(p, bounded(sold + amount)) - potential(p, sold);
}
export function v5Fees(
  raw: bigint,
  platformAccrued: bigint,
  creatorAccrued: bigint,
) {
  for (const n of [raw, platformAccrued, creatorAccrued]) bounded(n);
  const prior = bounded(platformAccrued + creatorAccrued),
    target = (n: bigint) => (n * 3n + 3n) / 4n;
  if (!raw || platformAccrued !== target(prior))
    throw new Error("V5 fee state");
  const total = (raw + 99n) / 100n,
    next = bounded(prior + total),
    platform = target(next) - platformAccrued;
  return { platform, creator: total - platform, total };
}
export function v5Quote(
  p: V5Parameters,
  sold: bigint,
  amount: bigint,
  pa = 0n,
  ca = 0n,
  sell = false,
) {
  const raw = v5Raw(p, sold, amount, sell),
    fees = v5Fees(raw, pa, ca);
  const user = sell ? raw - fees.total : bounded(raw + fees.total);
  if (user <= 0n) throw new Error("V5 dust proceeds");
  return { raw, ...fees, user, amount };
}
/** Maximum integral quanta within a fee-inclusive SOL budget; at most 64 iterations. */
export function v5Budget(
  p: V5Parameters,
  sold: bigint,
  budget: bigint,
  pa = 0n,
  ca = 0n,
) {
  bounded(budget);
  validateV5(p);
  potential(p, sold);
  let low = 0n,
    high = (p.inventory - sold) / p.quantum;
  while (low < high) {
    const mid = low + (high - low + 1n) / 2n;
    const raw = v5Raw(p, sold, mid * p.quantum),
      fees = v5Fees(raw, pa, ca);
    if (raw <= budget && fees.total <= budget - raw) low = mid;
    else high = mid - 1n;
  }
  if (!low) throw new Error("V5 budget below minimum");
  return v5Quote(p, sold, low * p.quantum, pa, ca);
}
