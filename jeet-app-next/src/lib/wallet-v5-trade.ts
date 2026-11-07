import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  getAddressDecoder,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { v5PreviewTradeInstruction, V5_PREVIEW_PROGRAM } from "./launch-v5-preview.ts";
import { v5Budget, v5Quote } from "./v5-pricing.ts";
import { launchComputeLimit } from "./wallet-launch.ts";
import { readWalletLaunch, type WalletLaunchSnapshot } from "./wallet-launch-flow.ts";
import type { WalletTransactionExecutor } from "./wallet-transactions.ts";

const u64 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
const keyAt = (bytes: Uint8Array, offset: number) =>
  getAddressDecoder().decode(bytes.subarray(offset, offset + 32));
const options = { encoding: "base64", commitment: "confirmed" } as const;
const timeout = () => ({ abortSignal: AbortSignal.timeout(8000) });

export async function readTradeMarket(executor: WalletTransactionExecutor, mint: Address, creator: Address, wallet: Address) {
  const [launch, [destination], [receipt]] = await Promise.all([
    readWalletLaunch(executor, mint, creator),
    findAssociatedTokenPda({ mint, owner: wallet, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
    getProgramDerivedAddress({
      programAddress: V5_PREVIEW_PROGRAM,
      seeds: ["buyer", getAddressEncoder().encode(mint), getAddressEncoder().encode(wallet)],
    }),
  ]);
  const accounts = await executor.rpc.getMultipleAccounts([wallet, destination, receipt], {
    ...options, minContextSlot: launch.slot,
  }).send(timeout());
  const [owner, token, buyer] = accounts.value;
  let tokens = 0n, purchased = 0n;
  if (token) {
    const data = new Uint8Array(getBase64Encoder().encode(token.data[0]));
    if (token.owner !== TOKEN_PROGRAM_ADDRESS || data.length !== 165 ||
        keyAt(data, 0) !== mint || keyAt(data, 32) !== wallet || data[108] !== 1)
      throw Error("Unexpected wallet token account.");
    tokens = u64(data, 64);
  }
  if (buyer?.owner === V5_PREVIEW_PROGRAM) {
    const data = new Uint8Array(getBase64Encoder().encode(buyer.data[0]));
    if (data.length !== 81 || new TextDecoder().decode(data.subarray(0, 8)) !== "JEETBUY1" ||
        keyAt(data, 8) !== mint || keyAt(data, 40) !== wallet)
      throw Error("Unexpected buyer receipt.");
    purchased = u64(data, 72);
  }
  const [ataRent, receiptRent] = await Promise.all([
    token ? 0n : executor.rpc.getMinimumBalanceForRentExemption(165n).send(timeout()),
    buyer?.owner === V5_PREVIEW_PROGRAM ? 0n : executor.rpc.getMinimumBalanceForRentExemption(81n).send(timeout()),
  ]);
  return { launch, wallet, destination, receipt, tokens, purchased, sol: owner?.lamports ?? 0n,
    needsAta: !token, setup: ataRent + receiptRent };
}
export type TradeMarket = Awaited<ReturnType<typeof readTradeMarket>>;

export function curveTradeStatus(launch: WalletLaunchSnapshot) {
  if (launch.state?.migrated || launch.terms?.migrated) return "migrated";
  if (!launch.mint || launch.mint.mintAuthority || launch.mint.freezeAuthority ||
      !launch.metadata || !launch.terms || !launch.state || !launch.curveData || !launch.openingData)
    return "inactive";
  if (launch.slot < u64(launch.curveData, 162)) return "waiting";
  return launch.state.eligible ? "eligible" : "active";
}

export function openingBuyLimit(market: TradeMarket) {
  const { launch, purchased } = market;
  if (!launch.state || !launch.curveData || !launch.openingData) throw Error("Opening data unavailable.");
  let remaining = launch.state.inventory - launch.state.sold;
  const limit = (cap: bigint) => {
    const available = cap > purchased ? cap - purchased : 0n;
    if (available < remaining) remaining = available;
  };
  if (launch.openingData[96] && launch.slot < u64(launch.openingData, 88)) limit(u64(launch.openingData, 72));
  if (launch.slot < u64(launch.curveData, 178)) limit(u64(launch.curveData, 186));
  return remaining / launch.state.quantum * launch.state.quantum;
}

export function tradePreview(market: TradeMarket, input: bigint, sell: boolean, slippageBps: bigint) {
  const { launch } = market;
  const status = curveTradeStatus(launch);
  if ((status !== "active" && status !== "eligible") || !launch.state)
    throw Error("Curve trading is unavailable.");
  const [platform, creator] = launch.fees;
  if (!platform || !creator) throw Error("Fee state is unavailable.");
  if (slippageBps < 0n || slippageBps > 1000n) throw Error("Slippage must be between 0% and 10%.");
  const s = launch.state;
  if (sell && input > market.tokens) throw Error("Insufficient tokens.");
  const q = sell
    ? v5Quote(s, s.sold, input, platform.accrued, creator.accrued, true)
    : v5Budget(s, s.sold, input, platform.accrued, creator.accrued);
  if (!sell && q.amount > openingBuyLimit(market))
    throw Error("This budget exceeds the current opening limit. Enter a smaller amount.");
  if (sell && q.raw > s.reserve) throw Error("Insufficient curve reserve.");
  const maximum = q.user + q.user * slippageBps / 10000n;
  const minimum = q.user * (10000n - slippageBps) / 10000n;
  return { ...q, sell, sequence: s.sequence, sold: s.sold,
    bound: sell ? (minimum || 1n) : maximum < input ? maximum : input,
    setup: sell ? 0n : market.setup };
}
export type TradePreview = ReturnType<typeof tradePreview>;

export async function tradeInstructions(market: TradeMarket, q: TradePreview, buyer: TransactionSigner) {
  if (buyer.address !== market.wallet) throw Error("Wallet changed. Review a fresh quote.");
  const l = market.launch.addresses;
  const instructions = [launchComputeLimit()];
  if (!q.sell && market.needsAta)
    instructions.push(await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: buyer, mint: l.mint, owner: buyer.address }));
  instructions.push(v5PreviewTradeInstruction({
    ...l, buyer, destination: market.destination, receipt: market.receipt,
    amount: q.amount, expectedSold: q.sold, quotedCost: q.raw,
    maxCost: q.bound, sequence: q.sequence, sell: q.sell,
  }));
  return instructions;
}
