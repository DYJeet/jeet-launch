/** Disposable local-validator execution preview, deliberately unavailable on public clusters. */
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { AccountRole, address, type Address } from "@solana/kit";
import {
  initializeMarketInstruction,
  marketQuoteInstruction,
  marketTradeInstruction,
} from "./launch-market.ts";
export const V5_PREVIEW_PROGRAM = address(
  "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
);
export const V5_PREVIEW_SIZE = 262;
const max = (1n << 64n) - 1n;
function value(v: bigint) {
  if (v < 0n || v > max) throw new Error("V5 u64");
  return v;
}
export function initializeV5PreviewInstruction(
  input: Parameters<typeof initializeMarketInstruction>[0] & {
    quantum: bigint;
    tradingInventory: bigint;
    migrationInventory: bigint;
    migrationVault: Address;
  },
) {
  const ix = initializeMarketInstruction(input),
    data = new Uint8Array(59);
  data.set(ix.data);
  data[0] = 16;
  const v = new DataView(data.buffer);
  [input.quantum, input.tradingInventory, input.migrationInventory].forEach(
    (n, i) => v.setBigUint64(35 + i * 8, value(n), true),
  );
  return {
    ...ix,
    programAddress: V5_PREVIEW_PROGRAM,
    data,
    accounts: [
      ...ix.accounts.map((a, i) =>
        i === 5 ? { ...a, role: AccountRole.WRITABLE } : a,
      ),
      { address: input.migrationVault, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
  };
}
export function v5PreviewQuoteInstruction(
  input: Parameters<typeof marketQuoteInstruction>[0] & {
    migrationVault: Address;
  },
) {
  const ix = marketQuoteInstruction(input);
  ix.data[0] = input.sell ? 18 : 17;
  return {
    ...ix,
    programAddress: V5_PREVIEW_PROGRAM,
    accounts: [
      ...ix.accounts,
      { address: input.migrationVault, role: AccountRole.READONLY },
    ],
  };
}
export function v5PreviewTradeInstruction(
  input: Parameters<typeof marketTradeInstruction>[0] & {
    migrationVault: Address;
  },
) {
  const ix = marketTradeInstruction(input);
  ix.data[0] = input.sell ? 20 : 19;
  return {
    ...ix,
    programAddress: V5_PREVIEW_PROGRAM,
    accounts: [
      ...ix.accounts,
      { address: input.migrationVault, role: AccountRole.READONLY },
    ],
  };
}
export function decodeV5PreviewState(data: Uint8Array) {
  if (
    data.length !== V5_PREVIEW_SIZE ||
    new TextDecoder().decode(data.slice(0, 8)) !== "JEETCRV5"
  )
    throw new Error("V5 state");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength),
    read = (at: number) => v.getBigUint64(at, true);
  const state = {
    start: read(104),
    end: read(112),
    scale: read(120),
    sold: read(128),
    reserve: read(136),
    inventory: read(144),
    rawIn: read(204),
    rawOut: read(212),
    returned: read(220),
    sequence: read(228),
    eligible: data[261] === 1,
    quantum: read(245),
    migrationInventory: read(253),
  };
  if (
    data[261] > 1 ||
    data[236] !== data[261] ||
    state.eligible !== (state.sold === state.inventory) ||
    !state.quantum ||
    state.rawIn < state.rawOut ||
    state.reserve !== state.rawIn - state.rawOut
  )
    throw new Error("V5 inconsistent state");
  return state;
}
