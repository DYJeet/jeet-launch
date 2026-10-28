import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createClient, lamports } from "@solana/kit";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { generatedPayer, airdropPayer } from "@solana/kit-plugin-signer";
import {
  tokenProgram,
  associatedTokenProgram,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { findBuyerReceiptPda } from "../src/lib/launch-custody.ts";
import {
  marketQuoteInstruction,
  marketTradeInstruction,
  decodeMarketState,
} from "../src/lib/launch-market.ts";
export async function verifyMarketIntegrity(fixtures) {
  const rpc = async (method, params) => {
    const b = await (
      await fetch("http://127.0.0.1:8899", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    ).json();
    assert.ok(!b.error, JSON.stringify(b));
    return b.result;
  };
  const client = () =>
    createClient()
      .use(generatedPayer())
      .use(
        solanaRpc({
          rpcUrl: "http://127.0.0.1:8899",
          rpcSubscriptionsUrl: "ws://127.0.0.1:8900",
          transactionConfig: { version: 0, estimateResourceLimits: false },
          skipPreflight: true,
        }),
      )
      .use(rpcAirdrop())
      .use(airdropPayer(lamports(2000000000n)))
      .use(tokenProgram())
      .use(associatedTokenProgram());
  const sponsor = await client(),
    buyer = await client(),
    evidence = [];
  for (const f of fixtures) {
    await sponsor.associatedToken.instructions
      .createAssociatedTokenIdempotent({
        mint: f.mint,
        owner: buyer.payer.address,
      })
      .sendTransaction();
    const [destination] = await findAssociatedTokenPda({
        mint: f.mint,
        owner: buyer.payer.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
      [receipt] = await findBuyerReceiptPda(f.mint, buyer.payer.address),
      keys = [
        buyer.payer.address,
        ...f.accounts.map((a) => a.address),
        destination,
        receipt,
      ];
    const snapshot = async () =>
        (
          await rpc("getMultipleAccounts", [
            keys,
            { encoding: "base64", commitment: "confirmed" },
          ])
        ).value,
      before = await snapshot();
    let instruction;
    if (f.kind === "buy") {
      const s = decodeMarketState(
        Buffer.from(before[keys.indexOf(f.curve)].data[0], "base64"),
      );
      instruction = marketTradeInstruction({
        ...f,
        buyer: buyer.payer,
        destination,
        receipt,
        amount: 1n,
        expectedSold: s.sold,
        sequence: s.sequence,
        quotedCost: s.base,
        maxCost: (1n << 64n) - 1n,
      });
    } else
      instruction = marketQuoteInstruction({
        ...f,
        amount: 1n,
        sell: f.kind === "sellQuote",
      });
    let error;
    try {
      await sponsor.sendTransaction([instruction]);
    } catch (e) {
      error = e;
    }
    assert.ok(error, f.label + " succeeded");
    const detail = JSON.stringify(error, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    assert.ok(detail.includes('"code":' + f.code), f.label + ": " + detail);
    assert.deepEqual(
      await snapshot(),
      before,
      f.label + " changed funds/state",
    );
    let total = 0n;
    for (const key of [f.creatorAta, f.vault, ...f.destinations, destination])
      total += Buffer.from(
        before[keys.indexOf(key)].data[0],
        "base64",
      ).readBigUInt64LE(64);
    assert.equal(total, 1000n);
    const ref = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0];
    assert.ok(ref.err);
    evidence.push({
      label: f.label,
      code: f.code,
      signature: ref.signature,
      slot: ref.slot,
      supply: total.toString(),
      stateUnchanged: true,
    });
    console.log(
      `PASS market integrity: ${f.label} rejected (${f.code}); balances/state unchanged; supply ${total}`,
    );
  }
  if (process.env.JEET_MARKET_EVIDENCE)
    await writeFile(
      process.env.JEET_MARKET_EVIDENCE + "-integrity.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
  return evidence;
}
