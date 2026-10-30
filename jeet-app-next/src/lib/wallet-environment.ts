import { address } from "@solana/kit";

export type WalletEnvironment = {
  network: "local";
  chain: "solana:devnet";
  genesis: string;
  program: string;
  rpcPath: "/api/wallet/rpc";
};
export const LOCAL_WALLET_PROGRAM = "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export function validateWalletEnvironment(value: WalletEnvironment) {
  if (value.network !== "local" || value.chain !== "solana:devnet" ||
      value.program !== LOCAL_WALLET_PROGRAM || value.rpcPath !== "/api/wallet/rpc" ||
      !value.genesis || value.genesis === DEVNET_GENESIS || value.genesis === MAINNET_GENESIS) {
    throw Error("Local wallet environment is invalid. Public V5 signing is disabled.");
  }
  address(value.genesis);
  return value;
}
export async function loadWalletEnvironment(signal?: AbortSignal) {
  const response = await fetch("/api/wallet/environment", {
    cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("Local wallet transactions are not enabled on this application.");
  return validateWalletEnvironment(await response.json());
}
export function formatUnits(raw: bigint, decimals = 9) {
  if (raw < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw Error("Invalid amount");
  const scale = 10n ** BigInt(decimals), whole = raw / scale;
  const fractional = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return decimals && fractional ? `${whole}.${fractional}` : whole.toString();
}
export function parseUnits(text: string, decimals = 9) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 ||
      !/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) throw Error("Enter an unsigned decimal amount.");
  const [whole, part = ""] = text.split(".");
  if (part.length > decimals) throw Error(`Use at most ${decimals} decimal places.`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(part.padEnd(decimals, "0") || "0");
  if (raw > (1n << 64n) - 1n) throw Error("Amount exceeds u64.");
  return raw;
}
