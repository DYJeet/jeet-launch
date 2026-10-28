import { AccountRole } from "@solana/kit";
import {
  initializeFeeCurveInstruction,
  feeBuyInstruction,
  feeQuoteInstruction,
} from "./launch-fees.ts";
export const MARKET_SIZE = 245;
const max = (1n << 64n) - 1n;
function checked(n: bigint) {
  if (n < 0n || n > max) throw new Error("Market value must fit u64.");
  return n;
}
export function initializeMarketInstruction(
  input: Parameters<typeof initializeFeeCurveInstruction>[0],
) {
  const ix = initializeFeeCurveInstruction(input);
  ix.data[0] = 11;
  return ix;
}
export function marketQuoteInstruction(
  input: Parameters<typeof feeQuoteInstruction>[0] & { sell?: boolean },
) {
  const ix = feeQuoteInstruction(input);
  ix.data[0] = input.sell ? 14 : 13;
  return ix;
}
export function marketTradeInstruction(
  input: Parameters<typeof feeBuyInstruction>[0] & {
    sequence: bigint;
    sell?: boolean;
  },
) {
  const ix = feeBuyInstruction(input),
    data = new Uint8Array(41);
  data.set(ix.data);
  data[0] = input.sell ? 15 : 12;
  new DataView(data.buffer).setBigUint64(33, checked(input.sequence), true);
  return {
    ...ix,
    data,
    accounts: ix.accounts.map((account, i) =>
      input.sell && (i === 5 || i === 6)
        ? { address: account.address, role: AccountRole.READONLY }
        : account,
    ),
  };
}
export type MarketQuote = {
  raw: bigint;
  platform: bigint;
  creator: bigint;
  user: bigint;
  sold: bigint;
  reserve: bigint;
  amount: bigint;
  sequence: bigint;
  rawIn: bigint;
  rawOut: bigint;
};
export function decodeMarketQuote(data: Uint8Array): MarketQuote {
  if (data.length !== 80) throw new Error("Invalid market quote.");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const values = Array.from({ length: 10 }, (_, i) =>
    v.getBigUint64(i * 8, true),
  );
  const [
    raw,
    platform,
    creator,
    user,
    sold,
    reserve,
    amount,
    sequence,
    rawIn,
    rawOut,
  ] = values;
  if (
    !amount ||
    rawOut > rawIn ||
    rawIn - rawOut !== reserve ||
    platform + creator !== (raw + 99n) / 100n
  )
    throw new Error("Inconsistent market quote.");
  return {
    raw,
    platform,
    creator,
    user,
    sold,
    reserve,
    amount,
    sequence,
    rawIn,
    rawOut,
  };
}
export function decodeMarketState(data: Uint8Array) {
  if (
    data.length !== 245 ||
    new TextDecoder().decode(data.slice(0, 8)) !== "JEETCRV4"
  )
    throw new Error("Invalid V4 market.");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength),
    get = (n: number) => v.getBigUint64(n, true);
  const result = {
    base: get(104),
    slope: get(112),
    scale: get(120),
    sold: get(128),
    reserve: get(136),
    inventory: get(144),
    start: get(162),
    end: get(178),
    openingLimit: get(186),
    rawIn: get(204),
    rawOut: get(212),
    returned: get(220),
    sequence: get(228),
    completed: data[236] === 1,
    threshold: get(237),
  };
  if (
    data[236] > 1 ||
    result.rawOut > result.rawIn ||
    result.rawIn - result.rawOut !== result.reserve ||
    result.sold > result.inventory ||
    result.threshold !== result.inventory
  )
    throw new Error("Inconsistent V4 market.");
  return result;
}
/** Audit oracle only: executable quotes always come from the on-chain program. */
export function marketFeeOracle(
  raw: bigint,
  platformAccrued: bigint,
  creatorAccrued: bigint,
) {
  checked(raw);
  checked(platformAccrued);
  checked(creatorAccrued);
  if (!raw) throw new Error("Zero base.");
  const before = checked(platformAccrued + creatorAccrued);
  if (platformAccrued !== (before * 3n + 3n) / 4n)
    throw new Error("Inconsistent fee carry.");
  const total = (raw + 99n) / 100n,
    next = checked(before + total),
    target = (next * 3n + 3n) / 4n;
  return {
    platform: target - platformAccrued,
    creator: next - target - creatorAccrued,
    total,
  };
}
export function redemptionOracle(
  c: { base: bigint; slope: bigint; scale: bigint; sold: bigint },
  n: bigint,
) {
  if (n <= 0n || n > c.sold || c.scale <= 0n)
    throw new Error("Invalid redemption amount.");
  const s = c.sold - n;
  return (
    (c.base * n * c.scale + c.slope * (s * n + (n * (n - 1n)) / 2n)) /
    (c.scale * c.scale)
  );
}
export type MarketInitInput = Parameters<typeof initializeMarketInstruction>[0];
export type MarketTradeInput = Parameters<typeof marketTradeInstruction>[0];
