// Real browser + real local SBF execution. Only the Devnet transport/genesis label
// is bridged to a disposable validator; no trade/revenue response is fabricated.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, open, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import {
  generateKeyPairSigner,
  getAddressEncoder,
  getTransactionDecoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
  getBase58Encoder,
} from "@solana/kit";
import {
  CUSTODY_PROGRAM_ADDRESS,
  findCurvePda,
  findLaunchCustodyPda,
} from "../src/lib/launch-custody.ts";
import {
  PLATFORM_TREASURY,
  findFeePda,
  decodeFeeState,
} from "../src/lib/launch-fees.ts";
const dir = await mkdtemp("/tmp/jeet-fee-browser-"),
  processes = [],
  evidence = { positive: [], rejected: [], transactions: [] };
async function start(command, args, name) {
  const log = await open(dir + "/" + name + ".log", "w"),
    p = spawn(command, args, { stdio: ["ignore", log.fd, log.fd] });
  await log.close();
  processes.push(p);
  return p;
}
async function rpc(method, params) {
  const r = await fetch("http://127.0.0.1:8999", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const b = await r.json();
  if (b.error) throw new Error(JSON.stringify(b.error));
  return b.result;
}
async function ready(check) {
  for (let i = 0; i < 60; i++) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Startup timeout; " + dir);
}
function pass(label) {
  evidence.positive.push(label);
  console.log("PASS dashboard: " + label);
}
let browser, page;
try {
  await start(
    process.env.JEET_VALIDATOR_BIN ?? "solana-test-validator",
    [
      "--log",
      "--bind-address",
      "127.0.0.1",
      "--rpc-port",
      "8999",
      "--ledger",
      dir + "/ledger",
      "--bpf-program",
      CUSTODY_PROGRAM_ADDRESS,
      "programs/launch-custody/target/deploy/jeet_launch_custody.so",
    ],
    "validator",
  );
  await ready(async () => (await rpc("getHealth", [])) === "ok");
  const wallet = await generateKeyPairSigner();
  await rpc("requestAirdrop", [wallet.address, 2000000000]);
  await ready(
    async () =>
      (await rpc("getBalance", [wallet.address, { commitment: "confirmed" }]))
        .value > 0,
  );
  await start(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--port",
      "3001",
      "--hostname",
      "127.0.0.1",
    ],
    "app",
  );
  await ready(async () => (await fetch("http://127.0.0.1:3001/revenue")).ok);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.JEET_CHROMIUM_PATH,
    args: ["--no-sandbox"],
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.setDefaultTimeout(25000);
  let wrongGenesis = false,
    missingProgram = false,
    rejectWallet = false;
  const signatures = [];
  await page.route("https://api.devnet.solana.com/**", async (route) => {
    const body = route.request().postDataJSON();
    let result;
    if (body.method === "getGenesisHash")
      result = wrongGenesis
        ? "not-authorized"
        : "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    else if (
      missingProgram &&
      body.method === "getAccountInfo" &&
      body.params[0] === CUSTODY_PROGRAM_ADDRESS
    )
      result = { context: { slot: 1 }, value: null };
    else result = await rpc(body.method, body.params);
    if(body.method==="sendTransaction")signatures.push(result);
    await route.fulfill({
      json: { jsonrpc: "2.0", id: body.id, result },
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.exposeFunction("jeetTestSign", async (bytes, send) => {
    if (rejectWallet) throw new Error("User rejected request");
    const tx = getTransactionDecoder().decode(Uint8Array.from(bytes)),
      signed = await partiallySignTransaction([wallet.keyPair], tx);
    if (!send) {
      const { getTransactionEncoder } = await import("@solana/kit");
      return Array.from(getTransactionEncoder().encode(signed));
    }
    const signature = await rpc("sendTransaction", [
      getBase64EncodedWireTransaction(signed),
      { encoding: "base64", skipPreflight: false },
    ]);
    signatures.push(signature);
    return Array.from(getBase58Encoder().encode(signature));
  });
  await page.addInitScript(
    ({ address, publicKey }) => {
      const NativeWS = window.WebSocket;
      window.WebSocket = class extends NativeWS {
        constructor(url, protocols) {
          super(
            String(url).startsWith("wss://api.devnet.solana.com")
              ? "ws://127.0.0.1:9000"
              : url,
            protocols,
          );
        }
      };
      let connected = false;
      const listeners = new Set();
      const account = {
        address,
        publicKey: Uint8Array.from(publicKey),
        chains: ["solana:devnet"],
        features: ["solana:signTransaction", "solana:signAndSendTransaction"],
      };
      const notify = () =>
        listeners.forEach((fn) => fn({ accounts: connected ? [account] : [] }));
      const wallet = {
        version: "1.0.0",
        name: "JeeT disposable validator wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        chains: ["solana:devnet"],
        get accounts() {
          return connected ? [account] : [];
        },
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              connected = true;
              notify();
              return { accounts: [account] };
            },
          },
          "standard:disconnect": {
            version: "1.0.0",
            disconnect: async () => {
              connected = false;
              notify();
            },
          },
          "standard:events": {
            version: "1.0.0",
            on: (event, listener) => {
              listeners.add(listener);
              return () => listeners.delete(listener);
            },
          },
          "solana:signTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signTransaction: async (...inputs) =>
              Promise.all(
                inputs.map(async (i) => ({
                  signedTransaction: Uint8Array.from(
                    await window.jeetTestSign(Array.from(i.transaction), false),
                  ),
                })),
              ),
          },
          "solana:signAndSendTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signAndSendTransaction: async (...inputs) =>
              Promise.all(
                inputs.map(async (i) => ({
                  signature: Uint8Array.from(
                    await window.jeetTestSign(Array.from(i.transaction), true),
                  ),
                })),
              ),
          },
        },
      };
      const register = (api) => api.register(wallet);
      window.addEventListener("wallet-standard:app-ready", (e) =>
        register(e.detail),
      );
      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", {
          detail: register,
        }),
      );
    },
    {
      address: wallet.address,
      publicKey: Array.from(getAddressEncoder().encode(wallet.address)),
    },
  );
  await page.goto("http://127.0.0.1:3001/revenue");
  await expect(
    page.getByRole("heading", { name: "JeeT Launch revenue", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Intended platform beneficiary:", { exact: false }),
  ).toContainText(PLATFORM_TREASURY);
  await expect(
    page.getByRole("button", { name: "Create signer-owned fee test launch" }),
  ).toBeDisabled();
  pass(
    "fee disclosures and intended treasury render; unauthenticated operations disabled",
  );
  wrongGenesis = true;
  await page.getByRole("button", { name: "Refresh on-chain revenue" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Unexpected RPC network",
  );
  evidence.rejected.push("wrong network refused before signing");
  wrongGenesis = false;
  missingProgram = true;
  await page.getByRole("button", { name: "Refresh on-chain revenue" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("not deployed");
  evidence.rejected.push("undeployed program refused before signing");
  missingProgram = false;
  await page.getByRole("button", { name: "Refresh on-chain revenue" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed on-chain revenue loaded",
  );
  await expect(
    page.getByText("No fee-enabled launches found.", { exact: true }),
  ).toBeVisible();
  pass("real on-chain empty state and loading/error recovery");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: /JeeT disposable validator wallet/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Create signer-owned fee test launch" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Create signer-owned fee test launch" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed · fee launch initialized with your immutable creator entitlement",
    { timeout: 90000 },
  );
  const mint = await page.getByLabel("Mint", { exact: true }).inputValue();
  pass(
    "Wallet Standard signer creates real fee-enabled mint and immutable creator entitlement",
  );
  await page.getByRole("button", { name: "Get on-chain quote" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Quote simulated by the on-chain program · no transaction sent",
  );
  await expect(
    page.getByText("Total consideration:", { exact: false }),
  ).toContainText("10100 lamports");
  pass(
    "displayed 10000 + 75 + 25 = 10100 quote comes from actual SBF simulation",
  );
  const [curve] = await findCurvePda(mint),
    [platformVault] = await findFeePda(mint, 0),
    [creatorVault] = await findFeePda(mint, 1),
    [custody] = await findLaunchCustodyPda(mint);
  const protectedKeys = [wallet.address, curve, platformVault, creatorVault];
  const snapshot = async () =>
    (
      await rpc("getMultipleAccounts", [
        protectedKeys,
        { encoding: "base64", commitment: "confirmed" },
      ])
    ).value;
  const before = await snapshot();
  await page
    .getByLabel("Maximum fee-inclusive consideration (lamports)")
    .fill("10099");
  await page.getByRole("button", { name: "Sign fee-inclusive buy" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "below quoted total",
  );
  assert.deepEqual(await snapshot(), before);
  evidence.rejected.push(
    "underquoted full expenditure refused without state change",
  );
  await page
    .getByLabel("Maximum fee-inclusive consideration (lamports)")
    .fill("10100");
  rejectWallet = true;
  await page.getByRole("button", { name: "Sign fee-inclusive buy" }).click();
  await expect(page.getByRole("status")).toHaveText("Rejected by wallet");
  assert.deepEqual(await snapshot(), before);
  evidence.rejected.push(
    "wallet rejection leaves all chain accounts unchanged",
  );
  rejectWallet = false;
  await page.getByRole("button", { name: "Sign fee-inclusive buy" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed · buy, curve payment and both fee entitlements committed atomically",
    { timeout: 60000 },
  );
  await expect(
    page.getByText("Confirmed consideration", { exact: false }),
  ).toContainText("10100 lamports");
  const readFee = async (key) =>
    decodeFeeState(
      Buffer.from(
        (
          await rpc("getAccountInfo", [
            key,
            { encoding: "base64", commitment: "confirmed" },
          ])
        ).value.data[0],
        "base64",
      ),
    );
  assert.equal((await readFee(platformVault)).claimable, 75n);
  assert.equal((await readFee(creatorVault)).claimable, 25n);
  pass(
    "browser signs actual atomic buy; confirmed event and both real fee dashboards agree",
  );
  const creatorSection = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Creator rewards · 25 bps",
        exact: true,
      }),
    });
  await creatorSection
    .getByRole("button", { name: "Claim", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed · claim verified on-chain",
    { timeout: 60000 },
  );
  await expect(
    page.getByRole("heading", { name: "Verified claim history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Creator · .*25 lamports/ }),
  ).toBeVisible();
  assert.equal((await readFee(creatorVault)).claimable, 0n);
  assert.equal((await readFee(creatorVault)).withdrawn, 25n);
  assert.equal((await readFee(platformVault)).claimable, 75n);
  pass(
    "browser creator claim, zero claimable and verified transaction history; treasury remains isolated",
  );
  const { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } =
    await import("@solana-program/token");
  const [creatorAta] = await findAssociatedTokenPda({
      mint,
      owner: wallet.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
    [vault] = await findAssociatedTokenPda({
      mint,
      owner: custody,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
  const tokens = async (k) =>
    BigInt(
      (await rpc("getTokenAccountBalance", [k, { commitment: "confirmed" }]))
        .value.amount,
    );
  assert.equal(await tokens(creatorAta), 21n);
  assert.equal(await tokens(vault), 979n);
  pass(
    "browser launch conserves 20 initial creator + 1 buyer + 979 custody = 1000",
  );
  assert.ok(signatures.length>=6,"Browser transaction references missing");
  evidence.transactions = signatures;
  evidence.verifiedHistoryLinks=await page.locator('a[href*="/tx/"]').evaluateAll(elements=>elements.map(e=>e.href));
  evidence.mint = mint;
  evidence.tokenConservation = {
    creatorInitial: "20",
    buyerDistributed: "1",
    actualCreatorAta: "21",
    custody: "979",
    supply: "1000",
  };
  evidence.platform = await readFee(platformVault);
  evidence.creator = await readFee(creatorVault);
  await page.screenshot({
    path: "programs/launch-custody/target/verification/dashboard.png",
    fullPage: true,
  });
  await writeFile(
    "programs/launch-custody/target/verification/dashboard.json",
    JSON.stringify(
      evidence,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ) + "\n",
  );
  console.log(
    "PASS dashboard totals " +
      JSON.stringify({
        positive: evidence.positive.length,
        rejected: evidence.rejected.length,
      }),
  );
} catch (error) {
  if (page) {
    console.error((await page.locator("body").innerText()).slice(-12000));
    await page
      .screenshot({
        path: "programs/launch-custody/target/verification/dashboard-failed.png",
        fullPage: true,
      })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  for (const p of processes.reverse()) {
    if (p.exitCode !== null) continue;
    p.kill("SIGTERM");
    const t = setTimeout(() => p.kill("SIGKILL"), 5000);
    await once(p, "exit");
    clearTimeout(t);
  }
  console.log("Browser test logs: " + dir);
}
