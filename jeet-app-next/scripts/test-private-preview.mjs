import assert from "node:assert/strict";
import { test } from "node:test";
import { localReadConfiguration, localWalletConfiguration } from "../src/lib/local-wallet-server.ts";

test("private preview accepts its exact host and keeps wallet configuration disabled", () => {
  const host = "example-3017.app.github.dev";
  Object.assign(process.env, { NODE_ENV: "development", JEET_PREVIEW_HOST: host,
    JEET_LOCAL_WALLET: "0", JEET_LOCAL_WALLET_RPC: "http://127.0.0.1:9907",
    JEET_LOCAL_WALLET_GENESIS: "943zuJHpLdDqdW9kJyuWxPJcpn94t5KXo1gYZbtPdew" });
  const request = (headers, method = "GET") => new Request("https://" + host, { headers, method });
  assert.equal(localReadConfiguration(request({ host })).url, "http://127.0.0.1:9907/");
  assert.throws(() => localWalletConfiguration(request({ host })));
  assert.throws(() => localReadConfiguration(request({ host, origin: "https://evil.example" })));
  assert.throws(() => localReadConfiguration(request({ host: "localhost", "x-forwarded-host": host })));
  assert.throws(() => localReadConfiguration(request({ host, "sec-fetch-site": "cross-site" })));
  assert.throws(() => localReadConfiguration(request({ host }, "POST")));
  process.env.NODE_ENV = "production";
  assert.throws(() => localReadConfiguration(request({ host })));
});
