// Server-only configuration. Never accepts a caller-provided RPC URL or a signing key.
import {
  validateWalletEnvironment,
  LOCAL_WALLET_PROGRAM,
} from "./wallet-environment.ts";

import { WALLET_NETWORK, WALLET_PROGRAM_ADDRESS } from "./wallet-program.ts";
import { DEVNET_GENESIS, MAINNET_GENESIS } from "./wallet-environment.ts";
import { walletUpstreamFetch } from "./wallet-rpc-server.ts";

export function walletModeEnabled() {
  if (WALLET_NETWORK === "mainnet") return process.env.JEET_MAINNET_READ_PREVIEW === "1";
  return WALLET_NETWORK === "devnet" ? process.env.JEET_DEVNET_WALLET === "1" : process.env.JEET_LOCAL_WALLET === "1";
}

function devnetWalletConfiguration(request: Request, pageNavigation: boolean) {
  if (process.env.JEET_DEVNET_WALLET !== "1" || WALLET_NETWORK !== "devnet")
    throw Error("Explicit Devnet wallet configuration is required.");
  const configured = process.env.JEET_DEVNET_WALLET_ORIGIN ?? "";
  const host = request.headers.get("host");
  const deployment = process.env.VERCEL === "1" ? process.env.VERCEL_URL : undefined;
  const origin = new URL(deployment && host === deployment ? "https://" + deployment : configured);
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash)
    throw Error("Expected an explicit HTTPS application origin.");
  const suppliedOrigin = request.headers.get("origin");
  // The Codespaces tunnel rewrites same-origin POST Origin to https://localhost:port.
  // Accept that alias only with exact named-workspace forwarding and same-origin Fetch Metadata.
  const tunnelOrigin = codespacesForwardedHost(request, origin) &&
    request.headers.get("sec-fetch-site") === "same-origin" &&
    suppliedOrigin === `https://${request.headers.get("host")}`;
  // An external link may open a read-only Preview document on its exact
  // deployment hostname. Wallet API calls never use this navigation exception.
  const previewNavigation = pageNavigation && process.env.VERCEL_ENV === "preview" &&
    !!deployment && host === deployment && request.method === "GET" && !request.headers.has("origin") &&
    request.headers.get("sec-fetch-mode") === "navigate" &&
    request.headers.get("sec-fetch-dest") === "document";
  if (!devnetApplicationHost(request, origin) ||
      (suppliedOrigin && suppliedOrigin !== origin.origin && !tunnelOrigin) ||
      (request.headers.get("sec-fetch-site") === "cross-site" && !previewNavigation))
    throw Error("Cross-origin Devnet wallet request rejected.");
  const rpc = new URL(process.env.JEET_DEVNET_WALLET_RPC ?? "https://api.devnet.solana.com");
  if (rpc.protocol !== "https:" || rpc.username || rpc.password || rpc.hash || /mainnet/i.test(rpc.href))
    throw Error("Expected an explicit HTTPS Devnet RPC endpoint.");
  return { url: rpc.toString(),
    environment: validateWalletEnvironment({ network: "devnet", chain: "solana:devnet",
      genesis: DEVNET_GENESIS, program: WALLET_PROGRAM_ADDRESS, rpcPath: "/api/wallet/rpc" }) };
}

function devnetApplicationHost(request: Request, origin: URL) {
  return request.headers.get("host") === origin.host || codespacesForwardedHost(request, origin);
}

function codespacesForwardedHost(request: Request, origin: URL) {
  const host = request.headers.get("host");
  // Codespaces terminates HTTPS and replaces Host with localhost:<port>.
  // Trust forwarding only in that named workspace, for its exact private
  // forwarding hostname and matching loopback port. Origin/site checks above
  // remain mandatory; generic forwarded headers are never sufficient.
  if (process.env.CODESPACES !== "true" || !process.env.CODESPACE_NAME || !host)
    return false;
  const local = new URL("http://" + host);
  return ["localhost", "127.0.0.1"].includes(local.hostname) && !!local.port &&
    local.host === host && origin.hostname === `${process.env.CODESPACE_NAME}-${local.port}.app.github.dev` &&
    request.headers.get("x-forwarded-host") === origin.host;
}

function mainnetReadConfiguration(request: Request, pageNavigation: boolean) {
  if (process.env.JEET_MAINNET_READ_PREVIEW !== "1" ||
      process.env.JEET_MAINNET_PROGRAM_ID !== WALLET_PROGRAM_ADDRESS ||
      process.env.JEET_DEVNET_WALLET === "1" || process.env.JEET_LOCAL_WALLET === "1" ||
      (process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "preview"))
    throw Error("Isolated Mainnet read preview configuration is required.");
  const origin = new URL(process.env.JEET_MAINNET_PREVIEW_ORIGIN ?? "");
  const previewNavigation = pageNavigation && request.method === "GET" && !request.headers.has("origin") &&
    request.headers.get("sec-fetch-mode") === "navigate" && request.headers.get("sec-fetch-dest") === "document";
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" ||
      origin.search || origin.hash || request.headers.get("host") !== origin.host ||
      (request.headers.has("origin") && request.headers.get("origin") !== origin.origin) ||
      (request.headers.get("sec-fetch-site") === "cross-site" && !previewNavigation) ||
      (process.env.VERCEL === "1" && process.env.VERCEL_URL !== origin.host))
    throw Error("Mainnet preview origin differs from the configured HTTPS deployment.");
  const rpc = new URL(process.env.JEET_MAINNET_READ_RPC ?? "");
  if (rpc.protocol !== "https:" || rpc.username || rpc.password || rpc.hash)
    throw Error("An approved HTTPS Mainnet read RPC is required.");
  return {
    url: rpc.href,
    environment: validateWalletEnvironment({
      network: "mainnet", chain: "solana:mainnet", genesis: MAINNET_GENESIS,
      program: WALLET_PROGRAM_ADDRESS, rpcPath: "/api/wallet/rpc",
    }),
  };
}

export function localWalletConfiguration(request: Request, { pageNavigation = false } = {}) {
  if (WALLET_NETWORK === "mainnet") return mainnetReadConfiguration(request, pageNavigation);
  if (process.env.JEET_DEVNET_WALLET === "1" || WALLET_NETWORK === "devnet")
    return devnetWalletConfiguration(request, pageNavigation);
  if (process.env.JEET_LOCAL_WALLET !== "1")
    throw Error("Local wallet mode is disabled.");
  const incoming = new URL(request.url);
  if (!["127.0.0.1", "localhost"].includes(incoming.hostname))
    throw Error("Local wallet API requires a loopback host.");
  // Next may reconstruct request.url using localhost while the browser used 127.0.0.1.
  // Compare Origin to the validated HTTP Host authority, never to forwarded headers.
  const host = request.headers.get("host");
  const publicUrl = host ? new URL(`${incoming.protocol}//${host}`) : incoming;
  if (
    !["127.0.0.1", "localhost"].includes(publicUrl.hostname) ||
    (host && publicUrl.host !== host)
  )
    throw Error("Invalid local wallet host.");
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== publicUrl.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw Error("Cross-origin wallet request rejected.");
  return configuredLoopback();
}

export function previewEnabled() {
  return WALLET_NETWORK === "local" && process.env.NODE_ENV === "development" && process.env.JEET_LOCAL_WALLET !== "1" &&
    /^[a-z0-9-]+-3017\.app\.github\.dev$/.test(process.env.JEET_PREVIEW_HOST ?? "");
}

export function localReadConfiguration(request: Request) {
  if (!previewEnabled()) return localWalletConfiguration(request);
  const host = process.env.JEET_PREVIEW_HOST;
  const incoming = new URL(request.url);
  const origin = request.headers.get("origin");
  if (request.method !== "GET" || request.headers.get("host") !== host ||
      ![host, "localhost", "127.0.0.1"].includes(incoming.hostname) ||
      (origin && origin !== "https://" + host) || request.headers.get("sec-fetch-site") === "cross-site")
    throw Error("Private preview request rejected.");
  return configuredLoopback();
}

function configuredLoopback() {
  const url = new URL(process.env.JEET_LOCAL_WALLET_RPC ?? "");
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Expected an explicit loopback HTTP RPC.");
  const environment = validateWalletEnvironment({
    network: "local",
    chain: "solana:devnet",
    genesis: process.env.JEET_LOCAL_WALLET_GENESIS ?? "",
    program: LOCAL_WALLET_PROGRAM,
    rpcPath: "/api/wallet/rpc",
  });
  return { url: url.toString(), environment };
}

const methods = new Set([
  "getGenesisHash",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSlot",
  "getMinimumBalanceForRentExemption",
  "getFeeForMessage",
  "simulateTransaction",
  "sendTransaction",
  "getSignatureStatuses",
  "getTransaction",
  "getSignaturesForAddress",
  "getTokenAccountBalance",
]);
export function validateWalletRpc(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw Error("RPC batches are not supported.");
  const b = body as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
  };
  if (
    b.jsonrpc !== "2.0" ||
    (typeof b.id !== "number" && typeof b.id !== "string") ||
    typeof b.method !== "string" ||
    !methods.has(b.method) ||
    !Array.isArray(b.params)
  )
    throw Error("Unsupported wallet RPC request.");
  if (b.method === "sendTransaction" || b.method === "simulateTransaction") {
    if (
      typeof b.params[0] !== "string" ||
      b.params[0].length > 1644 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b.params[0])
    )
      throw Error("Invalid bounded transaction encoding.");
    const options = b.params[1] as Record<string, unknown> | undefined;
    if (
      !options ||
      options.encoding !== "base64" ||
      options.skipPreflight === true ||
      options.replaceRecentBlockhash === true
    )
      throw Error("Unsafe transaction options.");
    if (atob(b.params[0] as string).length > 1232)
      throw Error("Transaction exceeds the wire-size limit.");
    if (
      b.method === "sendTransaction" &&
      (options.preflightCommitment !== "confirmed" ||
        !Number.isInteger(options.maxRetries) ||
        (options.maxRetries as number) < 0 ||
        (options.maxRetries as number) > 3)
    )
      throw Error(
        "Submission requires confirmed preflight and bounded same-wire retries.",
      );
  }
  if (
    b.method === "getMultipleAccounts" &&
    (!Array.isArray(b.params[0]) || b.params[0].length > 32)
  )
    throw Error("At most 32 accounts per request.");
  if (
    b.method === "getSignatureStatuses" &&
    (!Array.isArray(b.params[0]) || b.params[0].length > 16)
  )
    throw Error("At most 16 signatures per request.");
  if (b.method === "getSignaturesForAddress") {
    const limit = (b.params[1] as { limit?: number } | undefined)?.limit;
    if (!Number.isInteger(limit) || limit! < 1 || limit! > 50)
      throw Error("History requires limit 1–50.");
  }
  return b;
}
const genesisChecks = new Map<string, Promise<void>>();
export async function checkedLocalGenesis(url: string, expected: string) {
  const key = url + ":" + expected;
  const existing = genesisChecks.get(key);
  if (existing) return existing;
  const check = (async () => {
    const response = await walletUpstreamFetch(url, JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getGenesisHash",
      params: [],
    }), AbortSignal.timeout(8000));
    if (!response.ok) {
      await response.body?.cancel();
      throw Error("Devnet RPC rejected the network check.");
    }
    if ((await response.json()).result !== expected)
      throw Error("RPC genesis mismatch or unavailable; request not forwarded.");
  })();
  genesisChecks.set(key, check);
  try { await check; } finally { if (genesisChecks.get(key) === check) genesisChecks.delete(key); }
}
