import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function run(env, injectedFetch) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("JEET_DEVNET_")));
  const args = injectedFetch ? ["--import", "data:text/javascript," + encodeURIComponent(injectedFetch)] : [];
  return spawnSync(process.execPath, [...args, "scripts/check-devnet.mjs"], {
    env: { ...clean, ...env },
    encoding: "utf8",
    timeout: 5000,
  });
}

test("the read-only preflight stops after a mismatched genesis", () => {
  const result = run({}, `
    globalThis.fetch = async (_, options) => {
      if (JSON.parse(options.body).method !== "getGenesisHash") throw Error("unexpected request");
      return Response.json({ result: "mainnet" });
    };
  `);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected genesis/);
  assert.equal(result.stdout, "");
});

test("the read-only preflight refuses local identities and insecure RPC transport", () => {
  const local = run({ JEET_DEVNET_PROGRAM_ID: "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo" });
  assert.equal(local.status, 1);
  assert.match(local.stderr, /distinct disposable Devnet address/);
  const insecure = run({ JEET_DEVNET_RPC_URL: "http://127.0.0.1:8899" });
  assert.equal(insecure.status, 1);
  assert.match(insecure.stderr, /HTTPS Devnet RPC URL is required/);
});

test("a failed provider request does not disclose its endpoint or error body", () => {
  const result = run({ JEET_DEVNET_RPC_URL: "https://example.test/private-rpc-path" }, `
    globalThis.fetch = async () => { throw Error("private-rpc-path"); };
  `);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RPC transport unavailable/);
  assert.doesNotMatch(result.stderr, /private-rpc-path/);
});
