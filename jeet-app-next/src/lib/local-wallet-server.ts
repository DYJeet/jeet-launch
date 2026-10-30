// Server-only configuration. Never accepts a caller-provided RPC URL or a signing key.
import { validateWalletEnvironment, LOCAL_WALLET_PROGRAM } from "./wallet-environment";

export function localWalletConfiguration(request: Request) {
  if (process.env.JEET_LOCAL_WALLET !== "1") throw Error("Local wallet mode is disabled.");
  const url = new URL(process.env.JEET_LOCAL_WALLET_RPC ?? "");
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) throw Error("Expected an explicit loopback HTTP RPC.");
  const incoming = new URL(request.url);
  if (!["127.0.0.1", "localhost"].includes(incoming.hostname)) throw Error("Local wallet API requires a loopback host.");
  const origin = request.headers.get("origin");
  if ((origin && origin !== incoming.origin) || request.headers.get("sec-fetch-site") === "cross-site")
    throw Error("Cross-origin wallet request rejected.");
  const environment = validateWalletEnvironment({
    network: "local", chain: "solana:devnet", genesis: process.env.JEET_LOCAL_WALLET_GENESIS ?? "",
    program: LOCAL_WALLET_PROGRAM, rpcPath: "/api/wallet/rpc",
  });
  return { url: url.toString(), environment };
}

const methods = new Set([
  "getGenesisHash", "getBalance", "getAccountInfo", "getMultipleAccounts", "getLatestBlockhash",
  "getBlockHeight", "getSlot", "getMinimumBalanceForRentExemption", "getFeeForMessage",
  "simulateTransaction", "sendTransaction", "getSignatureStatuses", "getTransaction",
  "getSignaturesForAddress", "getTokenAccountBalance", "getTokenAccountsByOwner",
]);
export function validateWalletRpc(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("RPC batches are not supported.");
  const b = body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  if (b.jsonrpc !== "2.0" || (typeof b.id !== "number" && typeof b.id !== "string") ||
      typeof b.method !== "string" || !methods.has(b.method) || !Array.isArray(b.params))
    throw Error("Unsupported wallet RPC request.");
  if (b.method === "sendTransaction" || b.method === "simulateTransaction") {
    if (typeof b.params[0] !== "string" || b.params[0].length > 1644 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(b.params[0])) throw Error("Invalid bounded transaction encoding.");
    const options = b.params[1] as Record<string, unknown> | undefined;
    if (!options || options.encoding !== "base64" || options.skipPreflight === true ||
        options.replaceRecentBlockhash === true) throw Error("Unsafe transaction options.");
  }
  if (b.method === "getMultipleAccounts" && (!Array.isArray(b.params[0]) || b.params[0].length > 32))
    throw Error("At most 32 accounts per request.");
  if (b.method === "getSignatureStatuses" && (!Array.isArray(b.params[0]) || b.params[0].length > 16))
    throw Error("At most 16 signatures per request.");
  if (b.method === "getSignaturesForAddress") {
    const limit = (b.params[1] as { limit?: number } | undefined)?.limit;
    if (!Number.isInteger(limit) || limit! < 1 || limit! > 50) throw Error("History requires limit 1–50.");
  }
  return b;
}
export async function checkedLocalGenesis(url: string, expected: string) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash", params: [] }),
    signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!response.ok || (await response.json()).result !== expected) throw Error("RPC genesis mismatch; request not forwarded.");
}
