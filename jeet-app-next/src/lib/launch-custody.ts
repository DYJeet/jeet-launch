import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

// Local test program, loaded from programs/launch-custody by the validator runner.
export const CUSTODY_PROGRAM_ADDRESS = address(
  "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
);
export const SYSTEM_PROGRAM_ADDRESS = address(
  "11111111111111111111111111111111",
);
export const CUSTODY_STATE_SIZE = 89;

export function findLaunchCustodyPda(mint: Address) {
  return getProgramDerivedAddress({
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode("launch"),
      getAddressEncoder().encode(mint),
    ],
  });
}

export function initializeCustodyInstruction(input: {
  payer: TransactionSigner;
  mint: Address;
  creator: Address;
  creatorTokenAccount: Address | null;
  custody: Address;
  vault: Address;
  creatorAmount: bigint;
  inventoryAmount: bigint;
}) {
  const data = new Uint8Array(49);
  data.set(getAddressEncoder().encode(input.creator), 1);
  const view = new DataView(data.buffer);
  view.setBigUint64(33, input.creatorAmount, true);
  view.setBigUint64(41, input.inventoryAmount, true);
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    accounts: [
      {
        address: input.payer.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: input.payer,
      },
      { address: input.mint, role: AccountRole.READONLY },
      {
        address: input.creatorTokenAccount ?? TOKEN_PROGRAM_ADDRESS,
        role: AccountRole.READONLY,
      },
      { address: input.custody, role: AccountRole.WRITABLE },
      { address: input.vault, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

export function proveCustodyInstruction(
  custody: Address,
  mint: Address,
  vault: Address,
) {
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    accounts: [
      { address: custody, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: vault, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([1]),
  };
}

export function findOpeningPda(mint: Address) {
  return getProgramDerivedAddress({
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode("opening"),
      getAddressEncoder().encode(mint),
    ],
  });
}
export function findBuyerReceiptPda(mint: Address, wallet: Address) {
  return getProgramDerivedAddress({
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode("buyer"),
      getAddressEncoder().encode(mint),
      getAddressEncoder().encode(wallet),
    ],
  });
}
export function initializeOpeningInstruction(input: {
  payer: TransactionSigner;
  mint: Address;
  custody: Address;
  opening: Address;
  capBps: number;
  enabled: boolean;
  durationSlots: bigint;
}) {
  if (
    !Number.isInteger(input.capBps) ||
    input.capBps < 0 ||
    input.capBps > 10000 ||
    input.durationSlots < 0n ||
    input.durationSlots > 1000000n ||
    (input.enabled && input.durationSlots === 0n)
  ) {
    throw new Error("Invalid opening cap configuration.");
  }
  const data = new Uint8Array(12);
  data[0] = 2;
  const view = new DataView(data.buffer);
  view.setUint16(1, input.capBps, true);
  data[3] = input.enabled ? 1 : 0;
  view.setBigUint64(4, input.durationSlots, true);
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    data,
    accounts: [
      {
        address: input.payer.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: input.payer,
      },
      { address: input.mint, role: AccountRole.READONLY },
      { address: input.custody, role: AccountRole.READONLY },
      { address: input.opening, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
  };
}
export function receiveInventoryInstruction(input: {
  buyer: TransactionSigner;
  mint: Address;
  custody: Address;
  vault: Address;
  destination: Address;
  opening: Address;
  receipt: Address;
  amount: bigint;
  curve: Address;
  expectedSold: bigint;
  quotedCost: bigint;
  maxCost: bigint;
}) {
  if (input.amount <= 0n || input.amount > (1n << 64n) - 1n)
    throw new Error("Amount must be a positive u64.");
  const data = new Uint8Array(33);
  data[0] = 3;
  const view = new DataView(data.buffer);
  view.setBigUint64(1, input.amount, true);
  for (const [at, value] of [
    [9, input.expectedSold],
    [17, input.quotedCost],
    [25, input.maxCost],
  ] as const) {
    if (value < 0n || value > (1n << 64n) - 1n)
      throw new Error("Quote values must be u64 integers.");
    view.setBigUint64(at, value, true);
  }
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    data,
    accounts: [
      {
        address: input.buyer.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: input.buyer,
      },
      { address: input.mint, role: AccountRole.READONLY },
      { address: input.custody, role: AccountRole.READONLY },
      { address: input.vault, role: AccountRole.WRITABLE },
      { address: input.destination, role: AccountRole.WRITABLE },
      { address: input.opening, role: AccountRole.WRITABLE },
      { address: input.receipt, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: input.curve, role: AccountRole.WRITABLE },
    ],
  };
}

export function findCurvePda(mint: Address) {
  return getProgramDerivedAddress({
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode("curve"),
      getAddressEncoder().encode(mint),
    ],
  });
}
export function initializeCurveInstruction(input: {
  payer: TransactionSigner;
  mint: Address;
  custody: Address;
  opening: Address;
  curve: Address;
  vault: Address;
  basePrice: bigint;
  slope: bigint;
}) {
  if (
    input.basePrice <= 0n ||
    input.basePrice > (1n << 64n) - 1n ||
    input.slope < 0n ||
    input.slope > (1n << 64n) - 1n
  )
    throw new Error("Invalid curve parameters.");
  const data = new Uint8Array(17);
  data[0] = 4;
  const view = new DataView(data.buffer);
  view.setBigUint64(1, input.basePrice, true);
  view.setBigUint64(9, input.slope, true);
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    data,
    accounts: [
      {
        address: input.payer.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: input.payer,
      },
      { address: input.mint, role: AccountRole.READONLY },
      { address: input.custody, role: AccountRole.READONLY },
      { address: input.opening, role: AccountRole.READONLY },
      { address: input.curve, role: AccountRole.WRITABLE },
      { address: input.vault, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
  };
}
export function quoteCurveInstruction(input: {
  mint: Address;
  custody: Address;
  opening: Address;
  curve: Address;
  vault: Address;
  amount: bigint;
}) {
  if (input.amount <= 0n || input.amount > (1n << 64n) - 1n)
    throw new Error("Amount must be a positive u64.");
  const data = new Uint8Array(9);
  data[0] = 5;
  new DataView(data.buffer).setBigUint64(1, input.amount, true);
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    data,
    accounts: [
      { address: input.mint, role: AccountRole.READONLY },
      { address: input.custody, role: AccountRole.READONLY },
      { address: input.opening, role: AccountRole.READONLY },
      { address: input.curve, role: AccountRole.READONLY },
      { address: input.vault, role: AccountRole.READONLY },
    ],
  };
}
export type CurveState = {
  base: bigint;
  slope: bigint;
  scale: bigint;
  sold: bigint;
  collected: bigint;
  inventory: bigint;
};
export function decodeCurveState(data: Uint8Array): CurveState {
  if (
    data.length !== 153 ||
    new TextDecoder().decode(data.slice(0, 8)) !== "JEETCRV1"
  )
    throw new Error("Invalid curve state.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    base: view.getBigUint64(104, true),
    slope: view.getBigUint64(112, true),
    scale: view.getBigUint64(120, true),
    sold: view.getBigUint64(128, true),
    collected: view.getBigUint64(136, true),
    inventory: view.getBigUint64(144, true),
  };
}
export function quoteCurveCost(c: CurveState, amount: bigint): bigint {
  const max128 = (1n << 128n) - 1n,
    max64 = (1n << 64n) - 1n;
  const checked = (v: bigint) => {
    if (v < 0n || v > max128) throw new Error("Curve arithmetic overflow.");
    return v;
  };
  if (amount <= 0n || amount > max64 || c.base <= 0n || c.scale <= 0n)
    throw new Error("Invalid curve quote.");
  const series = checked(
    checked(c.sold * amount) + checked(amount * (amount - 1n)) / 2n,
  );
  const numerator = checked(
    checked(checked(c.base * amount) * c.scale) + checked(c.slope * series),
  );
  const denominator = checked(c.scale * c.scale);
  const cost =
    numerator / denominator + (numerator % denominator === 0n ? 0n : 1n);
  if (cost > max64) throw new Error("Curve arithmetic overflow.");
  return cost;
}
