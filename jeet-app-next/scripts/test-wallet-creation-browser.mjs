// Real Wallet Standard adapter using genuine disposable Ed25519 signatures and local RPC.
// Fault injection tests are labelled; successful execution and balances are never fabricated.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, open, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import {
  generateKeyPairSigner,
  getAddressEncoder,
  getTransactionDecoder,
  partiallySignTransaction,
  getTransactionEncoder,
  getSignatureFromTransaction,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import { address } from "@solana/kit";
import { walletLaunchAddresses } from "../src/lib/wallet-launch.ts";
import { parseMintBytes } from "../src/lib/solana-rpc.ts";
import { LOCAL_WALLET_PROGRAM } from "../src/lib/wallet-environment.ts";
const dir = await mkdtemp("/tmp/jeet-wallet-browser-"),
  children = [],
  evidence = {
    positive: [],
    rejection: [],
    transactions: [],
    limitations: [
      "Disposable Wallet Standard adapter, not installed Phantom/Solflare or native mobile application acceptance.",
      "No installed extension or public metadata persistence is claimed.",
    ],
  };
const rpcUrl = "http://127.0.0.1:9907",
  appUrl = "http://127.0.0.1:3006";
async function start(command, args, name, env = {}) {
  const log = await open(dir + "/" + name + ".log", "w"),
    p = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", log.fd, log.fd],
    });
  await log.close();
  children.push(p);
  return p;
}
async function rpc(method, params = []) {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  const b = await r.json();
  if (b.error) throw Error(JSON.stringify(b.error));
  return b.result;
}
async function ready(fn) {
  for (let i = 0; i < 120; i++) {
    if (children.some((p) => p.exitCode !== null))
      throw Error("Child exited: " + dir);
    try {
      if (await fn()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Startup/confirmation timeout: " + dir);
}
const pass = (label, rejection = false) => {
  evidence[rejection ? "rejection" : "positive"].push(label);
  console.log("PASS wallet browser: " + label);
};
let browser, deadline;
try {
  deadline = setTimeout(() => {
    console.error("Wallet browser suite timed out");
    for (const p of children) p.kill("SIGTERM");
  }, 600000);
  await start(
    process.env.JEET_VALIDATOR_BIN ??
      "programs/launch-custody/target/toolchain/validator",
    [
      "--log",
      "--bind-address",
      "127.0.0.1",
      "--rpc-port",
      "9907",
      "--faucet-port",
      "9909",
      "--dynamic-port-range",
      "13500-13600",
      "--ledger",
      dir + "/ledger",
      "--bpf-program",
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
      "programs/launch-custody/target/metadata-research/mpl_token_metadata.so",
      "--bpf-program",
      LOCAL_WALLET_PROGRAM,
      "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
    ],
    "validator",
  );
  await ready(async () => (await rpc("getHealth")) === "ok");
  const genesis = await rpc("getGenesisHash");
  await start(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3006",
    ],
    "app",
    {
      JEET_LOCAL_WALLET: "1",
      JEET_LOCAL_WALLET_RPC: rpcUrl,
      JEET_LOCAL_WALLET_GENESIS: genesis,
    },
  );
  await ready(async () => (await fetch(appUrl + "/api/wallet/environment")).ok);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.JEET_CHROMIUM_PATH,
    args: ["--no-sandbox"],
  });
  for (const width of [390, 1440]) {
    const wallet = await generateKeyPairSigner();
    await rpc("requestAirdrop", [wallet.address, 1000000000]);
    await ready(
      async () =>
        (await rpc("getBalance", [wallet.address, { commitment: "finalized" }]))
          .value === 1000000000,
    );
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", async (r) => {
      if (r.url().includes("/api/wallet/")) {
        const t = await r.text();
        if (r.status() >= 400 || t.includes('\"error\"'))
          console.log(
            "RPC DIAGNOSTIC",
            r.status(),
            r.request().postDataJSON()?.method,
            r.request().postDataJSON()?.method === "getSignatureStatuses"
              ? r.request().postDataJSON().params
              : r.request().postDataJSON()?.params?.[1],
            t,
          );
      }
    });
    let rejectAt = 0, reject = false,
      signCount = 0,
      hold = false,
      release;
    const wires = [];
    let lastWire;
    await page.exposeFunction("jeetSignLocal", async (bytes) => {
      signCount++;
      if (reject || signCount === rejectAt) throw Error("User rejected request");
      if (hold) await new Promise((r) => (release = r));
      const tx = getTransactionDecoder().decode(Uint8Array.from(bytes)),
        signed = await partiallySignTransaction([wallet.keyPair], tx);
      lastWire = getBase64EncodedWireTransaction(signed);
      wires.push({
        signature: getSignatureFromTransaction(signed),
        bytes: getTransactionEncoder().encode(signed).length,
      });
      return Array.from(getTransactionEncoder().encode(signed));
    });
    await page.addInitScript(
      ({ address, publicKey }) => {
        let connected = false;
        const listeners = new Set();
        const account = {
          address,
          publicKey: Uint8Array.from(publicKey),
          chains: ["solana:devnet"],
          features: ["solana:signTransaction"],
        };
        const notify = () =>
          listeners.forEach((fn) =>
            fn({ accounts: connected ? [account] : [] }),
          );
        const wallet = {
          version: "1.0.0",
          name: "JeeT genuine local signer",
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
              on: (_, fn) => {
                listeners.add(fn);
                return () => listeners.delete(fn);
              },
            },
            "solana:signTransaction": {
              version: "1.0.0",
              supportedTransactionVersions: ["legacy", 0],
              signTransaction: async (...inputs) =>
                Promise.all(
                  inputs.map(async (i) => ({
                    signedTransaction: Uint8Array.from(
                      await window.jeetSignLocal(Array.from(i.transaction)),
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
    await page.goto(appUrl + "/local-create");
    await page.getByRole("button", { name: "Connect JeeT genuine local signer" }).click();
    await page.getByLabel("Token name", {exact:true}).fill("JeeT Browser " + width);
    await page.getByLabel("Ticker", {exact:true}).fill("JB" + width);
    await page.getByLabel("Description", {exact:true}).fill("Genuine local wallet creation test");
    await page.getByLabel("Total supply", {exact:true}).fill("1000");
    await page.getByLabel("Decimals (0–9)", {exact:true}).fill("0");
    await page.getByLabel("Launch delay (slots)", {exact:true}).fill("0");
    await page.getByLabel("Protected duration (slots)", {exact:true}).fill("1");
    await page.getByText("Enable cumulative opening wallet cap").uncheck();
    await page.getByLabel("Token image", {exact:true}).setInputFiles("public/jeet-promo.png");
    await page.getByText("I reviewed the allocations", {exact:false}).check();
    reject = true;
    await page.getByRole("button", {name:"Sign and create coin"}).click();
    await expect(page.getByTestId("creation-error")).toContainText("User rejected", {timeout:30000});
    reject = false;
    rejectAt = 3;
    await page.getByRole("button", {name:"Resume saved launch"}).click();
    await expect(page.getByTestId("creation-error")).toContainText("User rejected", {timeout:60000});
    const mint = (await page.getByTestId("created-mint").innerText()).trim();
    const account = (await rpc("getAccountInfo", [mint, {encoding:"base64",commitment:"confirmed"}])).value;
    assert.equal(parseMintBytes(Buffer.from(account.data[0],"base64"), address(mint), account.owner).supplyRaw, 0n);
    pass(width + "px rejected setup leaves minted supply at zero", true);
    rejectAt = 0;
    await page.reload();
    await page.getByRole("button", {name:"Resume saved launch"}).click();
    try {
      await expect(async () => {
        const error = page.getByTestId("creation-error");
        if (await error.isVisible()) throw Error(await error.innerText());
        await expect(page.getByTestId("launch-stage")).toHaveText("confirmed", {timeout:1000});
      }).toPass({timeout:90000});
    } catch(e) { console.log("CREATION DIAGNOSTIC",await page.locator("main").innerText()); throw e; }
    const l = await walletLaunchAddresses(address(mint), wallet.address);
    const accounts = (await rpc("getMultipleAccounts", [[mint,l.creatorAta,l.vault,l.migrationVault],{encoding:"base64",commitment:"confirmed"}])).value;
    const parsed = parseMintBytes(Buffer.from(accounts[0].data[0],"base64"), address(mint), accounts[0].owner);
    assert.equal(parsed.supplyRaw,1000n); assert.equal(parsed.mintAuthority,null); assert.equal(parsed.freezeAuthority,null);
    const balances = accounts.slice(1).map(a => Buffer.from(a.data[0],"base64").readBigUInt64LE(64));
    assert.deepEqual(balances,[10n,594n,396n]);
    assert.equal(balances.reduce((a,b)=>a+b,0n),parsed.supplyRaw);
    evidence.transactions.push({width,mint,wires,tokenConservation:"10 + 594 + 396 = 1000"});
    pass(width + "px genuine five-stage wallet creation, resume and supply conservation");
    await page.getByRole("link", {name:"Open token details"}).click();
    await expect(page.getByTestId("launch-reader")).toContainText("JeeT Browser " + width,{timeout:15000});
    await expect(page.getByTestId("launch-reader")).toContainText("Revoked");
    await page.reload();
    await expect(page.getByTestId("launch-reader")).toContainText("JeeT Browser " + width,{timeout:15000});
    assert.deepEqual(errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
    pass(width + "px token page reload and mobile layout");
    await page.close();
  }
  evidence.completed = true;
  evidence.genesis = genesis;
  await writeFile("programs/launch-custody/target/v6-wallet/creation-browser-evidence.json",JSON.stringify(evidence,null,2));
  console.log("PASS creation browser suite",JSON.stringify(evidence));
} finally {
  clearTimeout(deadline);
  await browser?.close();
  for(const child of children) child.kill("SIGTERM");
  console.log("Creation browser logs:",dir);
}
