import assert from "node:assert/strict";
import { test } from "node:test";
import { SolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR } from "@solana/kit";
import { describeLaunchReadError } from "../src/lib/wallet-read-error.ts";

test("rate limits and unavailable reads show recovery instructions without SDK diagnostics", () => {
  for (const statusCode of [429, 500, 503, 504]) {
    const error = new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
      { statusCode, headers: new Headers(), message: "private upstream diagnostic" });
    const text = describeLaunchReadError(error);
    assert.match(text, /RPC is busy or unavailable/);
    assert.match(text, /refresh on-chain state/);
    assert.doesNotMatch(text, /private|npx|8100002/);
  }
});
test("rejected transport requests retain a configuration action without leaking diagnostics", () => {
  const error = new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
    { statusCode: 403, headers: new Headers(), message: "private upstream diagnostic" });
  assert.match(describeLaunchReadError(error), /configured test network/);
  assert.doesNotMatch(describeLaunchReadError(error), /private|npx/);
});
test("account-integrity failures remain visible rather than being labelled transient", () => {
  assert.equal(describeLaunchReadError(new Error("Invalid custody state.")), "Invalid custody state.");
});
