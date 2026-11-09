// Uses genuine signed transactions and disposable loopback-only accounts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, open, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, generateKeyPairSigner, lamports } from "@solana/kit";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { generatedPayer, airdropPayer } from "@solana/kit-plugin-signer";
import { activateWalletLaunchInstructions, createWalletMintInstructions, createWalletSupplyInstructions,
  initializeWalletLaunchInstructions, walletLaunchAddresses, walletLaunchParameters } from "../src/lib/wallet-launch.ts";
import { initializeLaunchMetadataInstruction, METADATA_PROGRAM } from "../src/lib/launch-metadata.ts";
import { LOCAL_WALLET_PROGRAM } from "../src/lib/wallet-environment.ts";

const rpcUrl = "http://127.0.0.1:9927";
const proxyUrl = "http://127.0.0.1:9930";
const appUrl = "http://127.0.0.1:3027";
const dir = await mkdtemp("/tmp/jeet-scale-");
const target = 68;
const workers = 8;
const children = [];

async function start(name, command, args, env = {}) {
  const file = await open(dir + "/" + name + ".log", "a");
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", file.fd, file.fd] });
  child.on("error", error => console.error(error.message));
  children.push(child);
  await file.close();
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await exited; } finally { clearTimeout(timeout); }
}
async function rpc(method, params = []) {
  const body = await (await fetch(rpcUrl, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })).json();
  if (body.error) throw Error(JSON.stringify(body.error));
  return body.result;
}
async function until(read, accepts, ms) {
  const deadline = Date.now() + ms;
  let lastError;
  do {
    try {
      const value = await read();
      if (accepts(value)) return value;
    } catch (error) { lastError = error; }
    await delay(500);
  } while (Date.now() < deadline);
  throw Error("Timed out waiting for readiness. Logs: " + dir, { cause: lastError });
}
async function list(params = new URLSearchParams()) {
  const response = await fetch(appUrl + "/api/launches?" + params, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error("Listing status " + response.status);
  return response.json();
}
async function createLaunch(client, index, rent) {
  const creator = client.payer;
  const mint = await generateKeyPairSigner();
  const p = walletLaunchParameters({
    name: "JeeT Scale " + index, symbol: "S" + index,
    uri: appUrl + "/api/local-assets/" + "a".repeat(64) + ".json",
    supply: "1000", decimals: 0, creatorPercent: "1", capPercent: "5", capEnabled: true,
    capDuration: 10000n, openingDuration: 5n, openingDelay: 0n, openingLimitBps: 50,
  });
  const l = await walletLaunchAddresses(mint.address, creator.address);
  await client.sendTransaction(createWalletMintInstructions(creator, mint, rent, p));
  await client.sendTransaction(await createWalletSupplyInstructions(creator, l, p));
  await client.sendTransaction(initializeWalletLaunchInstructions(creator, l, p));
  await client.sendTransaction([await initializeLaunchMetadataInstruction({
    creator, mint: mint.address, custody: l.custody, name: p.name, symbol: p.symbol, uri: p.uri,
    mutable: false, maxCostLamports: 20000000n, allowLocalUri: true,
  })]);
  const activation = await client.sendTransaction(activateWalletLaunchInstructions(creator, l, p));
  return { mint: mint.address, creator: creator.address, activation: activation.context.signature };
}
let rateLimited = false;
let rateLimitResponses = 0;
const proxy = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (rateLimited && JSON.parse(body).method === "getSignaturesForAddress") {
      rateLimitResponses++;
      response.writeHead(429, { "Content-Type": "application/json", "Retry-After": "1" }).end("{}");
      return;
    }
    const upstream = await fetch(rpcUrl, { method: "POST", body, headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000) });
    response.writeHead(upstream.status, { "Content-Type": "application/json" }).end(await upstream.text());
  } catch {
    response.writeHead(502).end();
  }
});
try {
  proxy.listen(9930, "127.0.0.1");
  await once(proxy, "listening");
  await start("validator", process.env.JEET_VALIDATOR_BIN ?? "programs/launch-custody/target/toolchain/validator", [
    "--log", "--bind-address", "127.0.0.1", "--rpc-port", "9927", "--faucet-port", "9929",
    "--dynamic-port-range", "14000-14100", "--ledger", dir + "/ledger",
    "--bpf-program", LOCAL_WALLET_PROGRAM, "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
    "--bpf-program", METADATA_PROGRAM, "programs/launch-custody/target/metadata-research/mpl_token_metadata.so",
  ]);
  await until(() => rpc("getHealth"), health => health === "ok", 40000);
  const genesis = await rpc("getGenesisHash");
  const rent = BigInt(await rpc("getMinimumBalanceForRentExemption", [82]));
  const launched = (await Promise.all(Array.from({ length: workers }, async (_, worker) => {
    const client = await createClient().use(generatedPayer()).use(solanaRpc({
      rpcUrl, rpcSubscriptionsUrl: "ws://127.0.0.1:9928",
      transactionConfig: { version: 0, estimateResourceLimits: false },
    })).use(rpcAirdrop()).use(airdropPayer(lamports(2000000000n)));
    const rows = [];
    for (let i = worker; i < target; i += workers) rows.push(await createLaunch(client, i, rent));
    return rows;
  }))).flat();
  console.log("Activated " + launched.length + " real local launches");
  const startApp = () => start("app", process.execPath, [
    "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3027",
  ], { JEET_LOCAL_WALLET: "1", JEET_LOCAL_WALLET_RPC: proxyUrl, JEET_LOCAL_WALLET_GENESIS: genesis,
    JEET_MARKET_DB: dir + "/market.sqlite" });
  let app = await startApp();
  const partial = await until(list, page => page.total > 0 && page.backfilling, 45000);
  await stop(app);
  rateLimited = true;
  app = await startApp();
  const resumed = await until(list, page => page.total >= partial.total && page.stale, 40000);
  assert.ok(rateLimitResponses > 0);
  assert.equal(resumed.total, partial.total);
  rateLimited = false;
  const final = await until(list, page => page.total === target && !page.backfilling && !page.stale, 180000);
  assert.equal(final.gap, false);
  const seen = [];
  let page = final;
  for (;;) {
    assert.ok(page.rows.length <= 12);
    assert.equal(page.cursorExpired, false);
    seen.push(...page.rows.map(row => row.mint));
    if (!page.next) break;
    page = await list(new URLSearchParams({ after: page.next }));
  }
  assert.equal(seen.length, target);
  assert.deepEqual(new Set(seen), new Set(launched.map(row => row.mint)));
  for (const view of ["Trending", "Final Stretch", "Migrated"])
    assert.equal((await list(new URLSearchParams({ view }))).total, 0);
  const matching = await list(new URLSearchParams({ q: launched.at(-1).mint }));
  assert.equal(matching.total, 1);
  const evidence = { genesis, program: LOCAL_WALLET_PROGRAM, target, partial: partial.total, resumed: resumed.total,
    discovered: seen.length, coverageGap: final.gap, rateLimitResponses, launched };
  await writeFile(dir + "/evidence.json", JSON.stringify(evidence, (_key, value) =>
    typeof value === "bigint" ? String(value) : value, 2) + "\n");
  console.log("PASS real discovery, restart and cursor pagination: " + JSON.stringify({
    target, partial: partial.total, resumed: resumed.total, discovered: seen.length, gap: final.gap, rateLimitResponses,
  }));
} finally {
  proxy.close();
  for (const child of children.reverse()) await stop(child);
  console.log("Discovery test logs: " + dir);
}
