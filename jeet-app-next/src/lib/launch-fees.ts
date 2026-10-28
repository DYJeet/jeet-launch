import {
  AccountRole,
  address,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import {
  CUSTODY_PROGRAM_ADDRESS,
  initializeCurveInstruction,
  receiveInventoryInstruction,
  quoteCurveInstruction,
} from "./launch-custody.ts";
export const PLATFORM_TREASURY = address(
  "HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP",
);
export const PLATFORM_BPS = 75;
export const CREATOR_BPS = 25;
export const FEE_SIZE = 153;
const max64 = (1n << 64n) - 1n;
function u64(n: bigint) {
  if (n < 0n || n > max64) throw new Error("Amount must fit u64.");
  return n;
}
export function feeAmounts(raw: bigint) {
  u64(raw);
  if (raw === 0n) throw new Error("Zero consideration.");
  const platform = (raw * 75n + 9999n) / 10000n,
    creator = (raw * 25n + 9999n) / 10000n;
  return {
    raw,
    platform,
    creator,
    fees: platform + creator,
    total: u64(raw + platform + creator),
  };
}
// Future sells may reuse these entitlements, deducted from raw proceeds, only after
// independently proving reserve solvency. No sell instruction exists today.
export function futureSellFees(raw: bigint) {
  const f = feeAmounts(raw);
  if (f.fees > raw) throw new Error("Proceeds cannot cover fees.");
  return {
    raw: f.raw,
    platform: f.platform,
    creator: f.creator,
    fees: f.fees,
    net: raw - f.fees,
  };
}
export function findFeePda(mint: Address, kind: 0 | 1) {
  return getProgramDerivedAddress({
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode("fee"),
      getAddressEncoder().encode(mint),
      new Uint8Array([kind]),
    ],
  });
}
export function initializeFeeCurveInstruction(
  input: Parameters<typeof initializeCurveInstruction>[0] & {
    creator: TransactionSigner;
    platformVault: Address;
    creatorVault: Address;
  },
) {
  if (!input.protection)
    throw new Error(
      "Fee launches require explicit protected-opening configuration.",
    );
  const ix = initializeCurveInstruction(input);
  ix.data[0] = 7;
  return {
    ...ix,
    accounts: [
      ...ix.accounts,
      { address: input.platformVault, role: AccountRole.WRITABLE },
      { address: input.creatorVault, role: AccountRole.WRITABLE },
      {
        address: input.creator.address,
        role: AccountRole.READONLY_SIGNER,
        signer: input.creator,
      },
    ],
  };
}
export function feeBuyInstruction(
  input: Parameters<typeof receiveInventoryInstruction>[0] & {
    platformVault: Address;
    creatorVault: Address;
  },
) {
  const ix = receiveInventoryInstruction(input);
  ix.data[0] = 8;
  return {
    ...ix,
    accounts: [
      ...ix.accounts,
      { address: input.platformVault, role: AccountRole.WRITABLE },
      { address: input.creatorVault, role: AccountRole.WRITABLE },
    ],
  };
}
export function feeQuoteInstruction(
  input: Parameters<typeof quoteCurveInstruction>[0] & {
    platformVault: Address;
    creatorVault: Address;
  },
) {
  const ix = quoteCurveInstruction(input);
  ix.data[0] = 9;
  return {
    ...ix,
    accounts: [
      ...ix.accounts,
      { address: input.platformVault, role: AccountRole.READONLY },
      { address: input.creatorVault, role: AccountRole.READONLY },
    ],
  };
}
export function claimFeeInstruction(input: {
  beneficiary: TransactionSigner;
  mint: Address;
  custody: Address;
  curve: Address;
  feeVault: Address;
  kind: 0 | 1;
  amount: bigint;
}) {
  if (input.amount <= 0n) throw new Error("Claim must be positive.");
  const data = new Uint8Array(10);
  data[0] = 10;
  data[1] = input.kind;
  new DataView(data.buffer).setBigUint64(2, u64(input.amount), true);
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    data,
    accounts: [
      {
        address: input.beneficiary.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: input.beneficiary,
      },
      { address: input.mint, role: AccountRole.READONLY },
      { address: input.custody, role: AccountRole.READONLY },
      { address: input.curve, role: AccountRole.READONLY },
      { address: input.feeVault, role: AccountRole.WRITABLE },
    ],
  };
}
export function decodeFeeState(data: Uint8Array) {
  if (
    data.length !== FEE_SIZE ||
    new TextDecoder().decode(data.slice(0, 8)) !== "JEETFEE1"
  )
    throw new Error("Invalid fee state.");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength),
    decode = (n: number) => getAddressDecoder().decode(data.slice(n, n + 32));
  const accrued = v.getBigUint64(105, true),
    withdrawn = v.getBigUint64(113, true),
    claimable = v.getBigUint64(121, true);
  if (
    data[104] > 1 ||
    withdrawn > accrued ||
    accrued - withdrawn !== claimable ||
    data.slice(129, 152).some((x) => x !== 0)
  )
    throw new Error("Inconsistent fee liability.");
  return {
    mint: decode(8),
    curve: decode(40),
    beneficiary: decode(72),
    kind: data[104] as 0 | 1,
    accrued,
    withdrawn,
    claimable,
    bump: data[152],
  };
}
export function decodeFeeQuote(data: Uint8Array) {
  if (data.length !== 56) throw new Error("Invalid fee quote.");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const [raw, platform, creator, total, sold, collected, amount] = Array.from(
    { length: 7 },
    (_, i) => v.getBigUint64(i * 8, true),
  );
  const f = feeAmounts(raw);
  if (f.platform !== platform || f.creator !== creator || f.total !== total)
    throw new Error("Fee quote mismatch.");
  return { raw, platform, creator, total, sold, collected, amount };
}

export type FeeEvent =
  | {
      type: "trade";
      mint: Address;
      buyer: Address;
      raw: bigint;
      platform: bigint;
      creator: bigint;
      total: bigint;
    }
  | {
      type: "claim";
      mint: Address;
      beneficiary: Address;
      kind: 0 | 1;
      amount: bigint;
      withdrawn: bigint;
    };
/** Decode only this program's binary events, never another program's log text. */
export function decodeFeeEvents(
  logs: readonly string[],
  program: Address = CUSTODY_PROGRAM_ADDRESS,
): FeeEvent[] {
  const stack: string[] = [],
    events: FeeEvent[] = [];
  const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const number = (d: Uint8Array) => {
    if (d.length !== 8) throw new Error("Invalid fee event integer.");
    return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(
      0,
      true,
    );
  };
  const key = (d: Uint8Array) => {
    if (d.length !== 32) throw new Error("Invalid fee event address.");
    return getAddressDecoder().decode(d);
  };
  for (const log of logs) {
    const invoke = log.match(/^Program (\w+) invoke \[/);
    if (invoke) {
      stack.push(invoke[1]);
      continue;
    }
    const finish = log.match(/^Program (\w+) (?:success|failed)/);
    if (finish) {
      if (stack.at(-1) === finish[1]) stack.pop();
      continue;
    }
    if (stack.at(-1) !== program || !log.startsWith("Program data: ")) continue;
    const parts = log.slice(14).split(" ").map(bytes),
      tag = new TextDecoder().decode(parts[0]);
    if (tag === "JEET_TRADE_FEE_V1") {
      if (parts.length !== 7) throw new Error("Invalid trade event.");
      const [raw, platform, creator, total] = parts.slice(3).map(number),
        f = feeAmounts(raw);
      if (f.platform !== platform || f.creator !== creator || f.total !== total)
        throw new Error("Inconsistent trade fee event.");
      events.push({
        type: "trade",
        mint: key(parts[1]),
        buyer: key(parts[2]),
        raw,
        platform,
        creator,
        total,
      });
    }
    if (tag === "JEET_FEE_CLAIM_V1") {
      if (parts.length !== 6 || parts[3].length !== 1 || parts[3][0] > 1)
        throw new Error("Invalid claim event.");
      events.push({
        type: "claim",
        mint: key(parts[1]),
        beneficiary: key(parts[2]),
        kind: parts[3][0] as 0 | 1,
        amount: number(parts[4]),
        withdrawn: number(parts[5]),
      });
    }
  }
  return events;
}

/** Preserve a wallet/program rejection wrapped by the SDK's transaction planner. */
export function describeFeeError(error: unknown, depth = 0): string {
  if (depth > 5) return "Transaction failed.";
  if (typeof error !== "object" || error === null) return String(error);
  const wrapped = error as {
    message?: unknown;
    cause?: unknown;
    context?: { causeMessage?: unknown };
  };
  const context = wrapped.context?.causeMessage;
  if (typeof context === "string" && context.trim())
    return context.replace(/^[:\s]+/, "");
  if (wrapped.cause) return describeFeeError(wrapped.cause, depth + 1);
  return typeof wrapped.message === "string"
    ? wrapped.message
    : "Transaction failed.";
}
