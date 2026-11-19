import { address } from "@solana/kit";

export type WalletEnvironment = {
  network: "local" | "devnet" | "mainnet";
  chain: "solana:devnet" | "solana:mainnet";
  genesis: string;
  program: string;
  rpcPath: "/api/wallet/rpc";
};
export { LOCAL_WALLET_PROGRAM } from "./wallet-program.ts";
import { LOCAL_WALLET_PROGRAM, DEVNET_WALLET_PROGRAM, WALLET_PROGRAM_ADDRESS, WALLET_NETWORK } from "./wallet-program.ts";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export function validateWalletEnvironment(value: WalletEnvironment) {
  if (value.network === "mainnet") {
    if (WALLET_NETWORK !== "mainnet" || value.chain !== "solana:mainnet" ||
        value.genesis !== MAINNET_GENESIS || value.program !== WALLET_PROGRAM_ADDRESS ||
        value.rpcPath !== "/api/wallet/rpc") throw Error("Mainnet wallet environment differs from the compiled release.");
    return value;
  }
  if (
    !["local", "devnet"].includes(value.network) ||
    value.chain !== "solana:devnet" ||
    value.program !== (value.network === "devnet" ? DEVNET_WALLET_PROGRAM : LOCAL_WALLET_PROGRAM) ||
    value.program !== WALLET_PROGRAM_ADDRESS ||
    value.rpcPath !== "/api/wallet/rpc" ||
    !value.genesis ||
    (value.network === "devnet" ? value.genesis !== DEVNET_GENESIS : value.genesis === DEVNET_GENESIS) ||
    value.genesis === MAINNET_GENESIS
  ) {
    throw Error(
      "Wallet environment or pinned program is invalid.",
    );
  }
  address(value.genesis);
  return value;
}
export async function loadWalletEnvironment(signal?: AbortSignal) {
  const response = await fetch("/api/wallet/environment", {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw Error(
      "Local wallet transactions are not enabled on this application.",
    );
  return validateWalletEnvironment(await response.json());
}
export function formatUnits(raw: bigint, decimals = 9) {
  if (raw < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw Error("Invalid amount");
  const scale = 10n ** BigInt(decimals),
    whole = raw / scale;
  const fractional = (raw % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return decimals && fractional ? `${whole}.${fractional}` : whole.toString();
}
export function parseUnits(text: string, decimals = 9) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(text)
  )
    throw Error("Enter an unsigned decimal amount.");
  const [whole, part = ""] = text.split(".");
  if (part.length > decimals)
    throw Error(`Use at most ${decimals} decimal places.`);
  const raw =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(part.padEnd(decimals, "0") || "0");
  if (raw > (1n << 64n) - 1n) throw Error("Amount exceeds u64.");
  return raw;
}
