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
import { LOCAL_WALLET_PROGRAM } from "../src/lib/wallet-environment.ts";
const dir = await mkdtemp("/tmp/jeet-wallet-browser-"),
  children = [],
  evidence = {
    positive: [],
    rejection: [],
    transactions: [],
    limitations: [
      "Disposable Wallet Standard adapter, not installed Phantom/Solflare or native mobile application acceptance.",
      "No creation/trading lifecycle is claimed by the infrastructure test.",
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
    let reject = false,
      signCount = 0,
      hold = false,
      release;
    const wires = [];
    let lastWire;
    await page.exposeFunction("jeetSignLocal", async (bytes) => {
      signCount++;
      if (reject) throw Error("User rejected request");
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
    await page.goto(appUrl + "/local-wallet");
    await page
      .getByRole("button", { name: "Connect JeeT genuine local signer" })
      .click();
    await expect(page.getByTestId("wallet-address")).toHaveText(wallet.address);
    try {
      await expect(page.getByTestId("local-balance")).toHaveText("1");
    } catch (e) {
      console.log("PAGE DIAGNOSTIC", await page.locator("main").innerText());
      throw e;
    }
    pass(width + "px discovery, connection and exact local balance");
    const action = page.getByRole("button", {
      name: "Sign local connection check",
    });
    const before = BigInt(
      (await rpc("getBalance", [wallet.address, { commitment: "confirmed" }]))
        .value,
    );
    hold = true;
    await action.click();
    await ready(async () => signCount === 1);
    assert.equal(await action.isDisabled(), true);
    assert.equal(
      await page.evaluate(
        (key) =>
          navigator.locks.request(key, { ifAvailable: true }, (lock) => !!lock),
        "jeet-wallet:" + genesis + ":" + wallet.address,
      ),
      false,
    );
    await expect(
      page.getByText("Estimated network fee:", { exact: false }),
    ).toContainText("5000 lamports");
    release();
    hold = false;
    try {
      await expect(page.getByTestId("transaction-phase")).toHaveText(
        "confirmed",
        { timeout: 50000 },
      );
    } catch (e) {
      console.log("TX DIAGNOSTIC", await page.locator("main").innerText());
      console.log(
        "DIRECT STATUS",
        await rpc("getSignatureStatuses", [
          [wires.at(-1).signature],
          { searchTransactionHistory: true },
        ]),
      );
      console.log(
        "DIRECT BALANCE",
        await rpc("getBalance", [wallet.address, { commitment: "confirmed" }]),
      );
      console.log(
        "SIGNED SIMULATION",
        await rpc("simulateTransaction", [
          lastWire,
          { encoding: "base64", sigVerify: true, commitment: "confirmed" },
        ]),
      );
      throw e;
    }
    const signature = await page
      .getByTestId("transaction-signature")
      .innerText();
    const tx = await rpc("getTransaction", [
      signature,
      {
        encoding: "json",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    assert.equal(tx.meta.err, null);
    assert.equal(signCount, 1);
    const after = BigInt(
      (await rpc("getBalance", [wallet.address, { commitment: "confirmed" }]))
        .value,
    );
    assert.equal(before - after, BigInt(tx.meta.fee));
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(localStorage).filter((x) =>
            x.startsWith("jeet-pending-v1:"),
          ).length,
      ),
      0,
    );
    evidence.transactions.push({
      width,
      signature,
      before: before.toString(),
      after: after.toString(),
      networkFee: String(tx.meta.fee),
      ...wires.at(-1),
    });
    pass(
      width +
        "px genuine signing, confirmation, duplicate-button protection and exact SOL reconciliation",
    );
    reject = true;
    await action.click();
    await expect(page.getByTestId("transaction-phase")).toHaveText("rejected");
    await expect(page.getByTestId("transaction-error")).toContainText(
      "User rejected",
    );
    assert.equal(
      BigInt(
        (await rpc("getBalance", [wallet.address, { commitment: "confirmed" }]))
          .value,
      ),
      after,
    );
    reject = false;
    pass(width + "px wallet rejection leaves SOL unchanged", true);
    let wrongNetwork = true;
    await page.route("**/api/wallet/rpc", async (route) => {
      const body = route.request().postDataJSON();
      if (wrongNetwork && body.method === "getGenesisHash")
        await route.fulfill({
          json: { jsonrpc: "2.0", id: body.id, result: wallet.address },
        });
      else await route.continue();
    });
    const signedBefore = signCount;
    await action.click();
    await expect(page.getByTestId("transaction-error")).toContainText(
      "RPC network changed",
    );
    assert.equal(signCount, signedBefore);
    assert.equal(
      BigInt(
        (await rpc("getBalance", [wallet.address, { commitment: "confirmed" }]))
          .value,
      ),
      after,
    );
    wrongNetwork = false;
    await page.unroute("**/api/wallet/rpc");
    pass(
      width +
        "px injected network mismatch blocks signing and preserves balances",
      true,
    );
    await page.reload();
    await expect(page.getByTestId("wallet-address")).toHaveText(
      wallet.address,
      { timeout: 10000 },
    );
    await expect(page.getByTestId("local-balance")).toHaveText(
      (Number(after) / 1e9).toString(),
    );
    pass(width + "px wallet reconnect and refreshed balance after reload");
    await page.getByRole("button", { name: "Disconnect wallet" }).click();
    await expect(page.getByTestId("wallet-address")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Connect JeeT genuine local signer" }),
    ).toBeVisible();
    pass(width + "px disconnect clears account display");
    const size = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.ok(size.document <= size.viewport + 1);
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: dir + `/wallet-${width}.png`,
      fullPage: true,
    });
    await page.close();
  }
  const denied = await fetch(appUrl + "/api/wallet/rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.invalid",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getGenesisHash",
      params: [],
    }),
  });
  assert.equal(denied.status, 503);
  pass("cross-origin server request rejected", true);
  evidence.genesis = genesis;
  evidence.completed = true;
  evidence.artifactSha256 = createHash("sha256")
    .update(
      await readFile(
        "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
      ),
    )
    .digest("hex");
  evidence.logs = dir;
  await writeFile(
    "programs/launch-custody/target/v6-wallet/browser-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log("WALLET BROWSER VERIFIED " + JSON.stringify(evidence));
} finally {
  clearTimeout(deadline);
  await browser?.close();
  for (const p of children.reverse()) {
    if (p.exitCode !== null || p.signalCode !== null) continue;
    const done = once(p, "exit");
    p.kill("SIGTERM");
    const timer = setTimeout(() => p.kill("SIGKILL"), 5000);
    await done;
    clearTimeout(timer);
  }
}
