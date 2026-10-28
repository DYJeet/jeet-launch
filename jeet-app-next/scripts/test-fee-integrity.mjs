import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { address, createClient, lamports } from "@solana/kit";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { generatedPayer, airdropPayer } from "@solana/kit-plugin-signer";
import {
  tokenProgram,
  associatedTokenProgram,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  decodeCurveState,
  quoteCurveCost,
  findBuyerReceiptPda,
  CUSTODY_PROGRAM_ADDRESS,
} from "../src/lib/launch-custody.ts";
import {
  feeAmounts,
  feeBuyInstruction,
  feeQuoteInstruction,
} from "../src/lib/launch-fees.ts";
export async function verifyFeeIntegrity(fixtures) {
  async function rpc(method, params) {
    const b = await (
      await fetch("http://127.0.0.1:8899", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    ).json();
    assert.ok(!b.error, JSON.stringify(b));
    return b.result;
  }
  async function client() {
    return createClient()
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
  }
  const sponsor = await client(),
    buyer = await client(),
    results = [];
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
      [receipt] = await findBuyerReceiptPda(f.mint, buyer.payer.address);
    const keys = [
      buyer.payer.address,
      address("HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP"),
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
      ).value;
    const before = await snapshot(),
      curveAccount = before[keys.indexOf(f.curve)],
      curve = decodeCurveState(Buffer.from(curveAccount.data[0], "base64"));
    const instruction =
      f.code === 1102
        ? feeQuoteInstruction({ ...f, amount: 1n })
        : feeBuyInstruction({
            ...f,
            buyer: buyer.payer,
            destination,
            receipt,
            amount: 1n,
            expectedSold: curve.sold,
            quotedCost: quoteCurveCost(curve, 1n),
            maxCost: feeAmounts(quoteCurveCost(curve, 1n)).total,
          });
    let caught;
    try {
      await sponsor.sendTransaction([instruction]);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, f.label + " succeeded");
    const detail = JSON.stringify(caught, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    assert.ok(detail.includes('"code":' + f.code), f.label + ": " + detail);
    assert.deepEqual(
      await snapshot(),
      before,
      f.label + " altered balances or protected state",
    );
    const tx = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0];
    assert.ok(tx.err);
    let total = 0n;
    for (const key of [f.creatorAta, f.vault, ...f.destinations, destination]) {
      const a = before[keys.indexOf(key)];
      total += Buffer.from(a.data[0], "base64").readBigUInt64LE(64);
    }
    assert.equal(total, 1000n);
    results.push({
      label: f.label,
      code: f.code,
      signature: tx.signature,
      slot: tx.slot,
      program: CUSTODY_PROGRAM_ADDRESS,
      tokenSupply: total.toString(),
      stateAndBalancesUnchanged: true,
    });
    console.log(
      `PASS fee integrity: ${f.label} rejected (${f.code}); all SOL/tokens/state unchanged; token supply ${total}`,
    );
  }
  if (process.env.JEET_FEE_EVIDENCE)
    await writeFile(
      process.env.JEET_FEE_EVIDENCE + "-integrity.json",
      JSON.stringify(results, null, 2) + "\n",
    );
  return results;
}
