import assert from "node:assert/strict";
import { createClient, lamports } from "@solana/kit";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { generatedPayer, airdropPayer } from "@solana/kit-plugin-signer";
import { v5PreviewQuoteInstruction } from "../src/lib/launch-v5-preview.ts";
export async function verifyV5Integrity(f) {
  const rpc = async (method, params) => {
    const b = await (
      await fetch("http://127.0.0.1:9907", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    ).json();
    assert.ok(!b.error, JSON.stringify(b));
    return b.result;
  };
  const sponsor = await createClient()
    .use(generatedPayer())
    .use(
      solanaRpc({
        rpcUrl: "http://127.0.0.1:9907",
        rpcSubscriptionsUrl: "ws://127.0.0.1:9908",
        transactionConfig: { version: 0, estimateResourceLimits: false },
        skipPreflight: true,
      }),
    )
    .use(rpcAirdrop())
    .use(airdropPayer(lamports(2000000000n)));
  const snapshot = async () => {
    const out = [];
    for (let i = 0; i < f.accounts.length; i += 50)
      out.push(
        ...(
          await rpc("getMultipleAccounts", [
            f.accounts.slice(i, i + 50).map((a) => a.address),
            { encoding: "base64", commitment: "confirmed" },
          ])
        ).value,
      );
    return out;
  };
  const before = await snapshot();
  let caught;
  try {
    await sponsor.sendTransaction([
      v5PreviewQuoteInstruction({ ...f, amount: f.scale }),
    ]);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, f.label + " succeeded");
  assert.ok(
    JSON.stringify(caught, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ).includes('"code":' + f.code),
    f.label + ": " + String(caught),
  );
  assert.deepEqual(await snapshot(), before);
  const failed = (
    await rpc("getSignaturesForAddress", [
      sponsor.payer.address,
      { limit: 1, commitment: "confirmed" },
    ])
  )[0];
  assert.ok(failed.err);
  console.log(
    `PASS V5 integrity: ${f.label} (${f.code}); protected accounts unchanged`,
  );
  return {
    label: f.label,
    code: f.code,
    signature: failed.signature,
    slot: failed.slot,
  };
}
