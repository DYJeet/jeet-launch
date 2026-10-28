import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeSolanaAddress, parseMintBytes, getMintAccount, getSolBalance } from "../src/lib/solana-rpc.ts";
const mintAddress = "So11111111111111111111111111111111111111112";
const owner = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
function mintBytes() {
  const bytes = new Uint8Array(82), v = new DataView(bytes.buffer);
  v.setBigUint64(36, (1n << 64n) - 1n, true);
  bytes[44] = 9; bytes[45] = 1;
  return bytes;
}
function mock(t, fn) {
  const saved = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (...args) => { calls++; return fn(...args); };
  t.after(() => { globalThis.fetch = saved; });
  return () => calls;
}
const envelope = (result) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
test("public keys must decode to exactly 32 bytes", () => {
  assert.equal(looksLikeSolanaAddress(mintAddress), true);
  for (const s of ["z".repeat(44), "1".repeat(33), "0".repeat(32), "PLACEHOLDER_MINT_1", ""]) assert.equal(looksLikeSolanaAddress(s), false);
});
test("standard mint decoding preserves u64 supply and verified authority options", () => {
  const mint = parseMintBytes(mintBytes(), mintAddress, owner);
  assert.equal(mint.supplyRaw, (1n << 64n) - 1n);
  assert.equal(mint.decimals, 9); assert.equal(mint.initialized, true);
  assert.equal(mint.mintAuthorityRevoked, true); assert.equal(mint.freezeAuthorityRevoked, true);
});
test("wrong owners, truncated/extended mint layouts and invalid option flags fail", () => {
  assert.throws(() => parseMintBytes(mintBytes(), mintAddress, "11111111111111111111111111111111"));
  for (const n of [0, 81, 83, 165]) assert.throws(() => parseMintBytes(new Uint8Array(n), mintAddress, owner));
  for (const offset of [0, 46, 45]) { const bytes = mintBytes(); bytes[offset] = 2; assert.throws(() => parseMintBytes(bytes, mintAddress, owner)); }
});
test("RPC mint validation exposes actual supply and rejects substituted owner or uninitialized state", async (t) => {
  let accountOwner = owner, bytes = mintBytes();
  mock(t, () => envelope({ value: { owner: accountOwner, data: [Buffer.from(bytes).toString("base64"), "base64"] } }));
  const ok = await getMintAccount(mintAddress); assert.equal(ok.status, "ok"); assert.equal(ok.mint.supplyRaw, (1n << 64n) - 1n);
  accountOwner = "11111111111111111111111111111111"; assert.equal((await getMintAccount(mintAddress)).status, "invalid");
  accountOwner = owner; bytes[45] = 0; assert.equal((await getMintAccount(mintAddress)).status, "invalid");
});
test("invalid mint address does not issue an RPC request", async (t) => {
  const count = mock(t, () => { throw Error("must not fetch"); });
  assert.equal((await getMintAccount("z".repeat(44))).status, "invalid"); assert.equal(count(), 0);
});
test("rate limits and node-behind errors retry bounded reads and recover", async (t) => {
  let n = 0;
  const count = mock(t, () => { n++; return n === 1 ? new Response("busy", { status: 429 }) : n === 2 ? new Response(JSON.stringify({ error: { code: -32005 } })) : envelope({ value: 1230000000 }); });
  assert.equal(await getSolBalance(mintAddress), 1.23); assert.equal(count(), 3);
});
test("repeated transient failures stop at three attempts", async (t) => {
  const count = mock(t, () => new Response("offline", { status: 503 }));
  await assert.rejects(getSolBalance(mintAddress), /503/); assert.equal(count(), 3);
});
test("permanent HTTP errors and malformed JSON are not retried", async (t) => {
  let malformed = false;
  const count = mock(t, () => malformed ? new Response("not JSON") : new Response("denied", { status: 400 }));
  await assert.rejects(getSolBalance(mintAddress), /400/); assert.equal(count(), 1);
  malformed = true; await assert.rejects(getSolBalance(mintAddress), SyntaxError); assert.equal(count(), 2);
});
test("network disconnect retries reads; a timeout is reported without an indefinite loop", async (t) => {
  let timeout = false;
  const count = mock(t, (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    if (timeout) throw new DOMException("Timed out", "TimeoutError");
    if (count() === 1) throw new TypeError("Network disconnected");
    return envelope({ value: 0 });
  });
  assert.equal(await getSolBalance(mintAddress), 0); assert.equal(count(), 2);
  timeout = true; await assert.rejects(getSolBalance(mintAddress), { name: "TimeoutError" }); assert.equal(count(), 3);
});
test("cancelled requests never retry or leak the prior wallet response", async (t) => {
  const controller = new AbortController();
  const count = mock(t, () => { controller.abort(new DOMException("Wallet changed", "AbortError")); throw new TypeError("aborted fetch"); });
  await assert.rejects(getSolBalance(mintAddress, controller.signal), { name: "AbortError" }); assert.equal(count(), 1);
  await assert.rejects(getSolBalance(mintAddress, controller.signal), { name: "AbortError" }); assert.equal(count(), 1);
});
test("unsafe, fractional and negative RPC balances cannot be displayed as exact SOL", async (t) => {
  let value = -1; mock(t, () => envelope({ value }));
  for (value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(getSolBalance(mintAddress), /safe nonnegative/);
});
