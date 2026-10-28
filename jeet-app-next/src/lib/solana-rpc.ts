import { address as solanaAddress, getAddressEncoder } from "@solana/kit";

export const SOLANA_CLUSTER = "devnet" as const;

export const SOLANA_RPC_URL = "https://api.devnet.solana.com";

const LAMPORTS_PER_SOL = 1_000_000_000;

export type RpcErrorShape = {
  code?: number;
  message?: string;
};

type RpcEnvelope<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: RpcErrorShape;
};

export type ParsedMintAccount = {
  address: string;
  ownerProgram: string;
  supplyRaw: bigint;
  supplyFormatted: string;
  decimals: number;
  initialized: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
};

export type MintReadResult =
  | { status: "ok"; mint: ParsedMintAccount }
  | { status: "missing"; message: string }
  | { status: "invalid"; message: string };

let rpcId = 1;

class RetryableReadError extends Error {}

function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// Read-only RPC helper. Never use automatic retries for signing or sending funds.
async function rpcRequest<T>(method: string, params: unknown[], signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(SOLANA_RPC_URL, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) {
        const message = `Solana RPC returned HTTP ${response.status}.`;
        if ([429, 500, 502, 503, 504].includes(response.status)) throw new RetryableReadError(message);
        throw new Error(message);
      }
      const payload = await response.json() as RpcEnvelope<T>;
      if (payload.error) {
        if (payload.error.code === -32005) throw new RetryableReadError("Solana RPC node is behind. Try again shortly.");
        throw new Error(payload.error.message ?? "Solana RPC request failed.");
      }
      if (payload.result === undefined) throw new Error("Solana RPC returned no result.");
      return payload.result;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (attempt === 2 || !(error instanceof RetryableReadError || error instanceof TypeError)) throw error;
      await pause(250 * 2 ** attempt, signal);
    }
  }
  throw new Error("Solana RPC read retries exhausted.");
}

export async function getSolBalance(
  address: string,
  signal?: AbortSignal,
): Promise<number> {
  if (!looksLikeSolanaAddress(address)) {
    throw new Error("Wallet address is not a valid Solana public key.");
  }

  const result = await rpcRequest<{ value: number }>(
    "getBalance",
    [address, { commitment: "confirmed" }],
    signal,
  );

  if (!Number.isSafeInteger(result.value) || result.value < 0) throw new Error("RPC balance is not a safe nonnegative lamport amount.");
  return result.value / LAMPORTS_PER_SOL;
}

export async function getMintAccount(
  address: string,
  signal?: AbortSignal,
): Promise<MintReadResult> {
  if (!looksLikeSolanaAddress(address)) {
    return {
      status: "invalid",
      message: "Enter a correctly encoded 32-byte Solana mint public key.",
    };
  }

  const result = await rpcRequest<{
    value: null | {
      data: [string, "base64"];
      executable: boolean;
      lamports: number;
      owner: string;
      rentEpoch: number;
      space: number;
    };
  }>(
    "getAccountInfo",
    [address, { encoding: "base64", commitment: "confirmed" }],
    signal,
  );

  if (!result.value) {
    return {
      status: "missing",
      message: "No mint account exists at this address on Devnet.",
    };
  }

  try {
    const mint = parseMintBytes(base64ToBytes(result.value.data[0]), address, result.value.owner);
    if (!mint.initialized) throw new Error("SPL mint is not initialized.");
    return { status: "ok", mint };
  } catch (error) {
    return { status: "invalid", message: error instanceof Error ? error.message : "Invalid SPL mint account." };
  }
}

export function parseMintBytes(
  bytes: Uint8Array,
  address: string,
  ownerProgram: string,
): ParsedMintAccount {
  if (ownerProgram !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" || bytes.length !== 82) {
    throw new Error("Account is not an exact standard SPL Token mint owned by the SPL Token program.");
  }
  if (![0, 1].includes(readU32LE(bytes, 0)) || ![0, 1].includes(readU32LE(bytes, 46)) || bytes[45] > 1)
    throw new Error("Invalid SPL mint option or initialization flag.");

  const mintAuthorityOption = readU32LE(bytes, 0);
  const supplyRaw = readU64LE(bytes, 36);
  const decimals = bytes[44];
  const initialized = bytes[45] !== 0;
  const freezeAuthorityOption = readU32LE(bytes, 46);

  const mintAuthority =
    mintAuthorityOption === 0 ? null : base58Encode(bytes.slice(4, 36));
  const freezeAuthority =
    freezeAuthorityOption === 0 ? null : base58Encode(bytes.slice(50, 82));

  return {
    address,
    ownerProgram,
    supplyRaw,
    supplyFormatted: formatTokenAmount(supplyRaw, decimals),
    decimals,
    initialized,
    mintAuthority,
    freezeAuthority,
    mintAuthorityRevoked: mintAuthority === null,
    freezeAuthorityRevoked: freezeAuthority === null,
  };
}

export function looksLikeSolanaAddress(value: string) {
  try { getAddressEncoder().encode(solanaAddress(value)); return true; }
  catch { return false; }
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function readU32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readU64LE(bytes: Uint8Array, offset: number) {
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return value;
}

function formatTokenAmount(raw: bigint, decimals: number) {
  if (decimals === 0) return raw.toString();

  const rawText = raw.toString().padStart(decimals + 1, "0");
  const whole = rawText.slice(0, -decimals);
  const fractional = rawText.slice(-decimals).replace(/0+$/, "");
  const value = fractional ? `${whole}.${fractional}` : whole;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 1_000_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  return value;
}

function base58Encode(bytes: Uint8Array) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let numeric = 0n;

  for (const byte of bytes) {
    numeric = (numeric << 8n) | BigInt(byte);
  }

  let encoded = "";
  while (numeric > 0n) {
    const remainder = Number(numeric % 58n);
    encoded = alphabet[remainder] + encoded;
    numeric /= 58n;
  }

  let leadingZeroes = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    leadingZeroes += 1;
  }

  return alphabet[0].repeat(leadingZeroes) + encoded;
}
