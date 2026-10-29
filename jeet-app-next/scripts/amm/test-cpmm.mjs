import assert from "node:assert/strict";
import {
  createClient,
  generateKeyPairSigner,
  lamports,
  AccountRole,
} from "@solana/kit";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { generatedPayer, airdropPayer } from "@solana/kit-plugin-signer";
import {
  tokenProgram,
  associatedTokenProgram,
  findAssociatedTokenPda,
  AuthorityType,
} from "@solana-program/token";
import {
  CPMM,
  WSOL,
  TOKEN,
  FEE,
  bytes,
  poolAddresses,
  initializePool,
  withdrawPool,
  swapPool,
  systemTransfer,
  computeBudget,
} from "./cpmm.mjs";
const rpc = async (method, params = []) => {
  const b = await (
    await fetch("http://127.0.0.1:9917", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  ).json();
  assert.ok(!b.error, JSON.stringify(b));
  return b.result;
};
const raw = async (k) =>
  (
    await rpc("getAccountInfo", [
      k,
      { encoding: "base64", commitment: "confirmed" },
    ])
  ).value;
const tokens = async (k) =>
  BigInt(
    (await rpc("getTokenAccountBalance", [k, { commitment: "confirmed" }]))
      .value.amount,
  );
const balance = async (k) =>
  BigInt((await rpc("getBalance", [k, { commitment: "confirmed" }])).value);
const client = () =>
  createClient()
    .use(generatedPayer())
    .use(
      solanaRpc({
        rpcUrl: "http://127.0.0.1:9917",
        rpcSubscriptionsUrl: "ws://127.0.0.1:9918",
        transactionConfig: { version: 0, estimateResourceLimits: false },
        skipPreflight: true,
      }),
    )
    .use(rpcAirdrop())
    .use(airdropPayer(lamports(5000000000n)))
    .use(tokenProgram())
    .use(associatedTokenProgram());
const sqrt = (n) => {
  if (n < 2n) return n;
  let x = n,
    y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
};
export async function testCpmm() {
  console.log("CPMM stage: creating disposable wallets");
  const owner = await client(),
    sponsor = await client(),
    mint = await generateKeyPairSigner(),
    evidence = { positive: [], rejection: [], transactions: [] };
  const pass = (s) => {
    evidence.positive.push(s);
    console.log("PASS CPMM " + s);
  };
  console.log("CPMM stage: wallets funded");
  const amount = 1000000000000n,
    solAmount = 1000000000n;
  await owner.token.instructions
    .createMint({
      newMint: mint,
      decimals: 9,
      mintAuthority: owner.payer.address,
      freezeAuthority: owner.payer.address,
    })
    .sendTransaction();
  console.log("CPMM stage: mint created");
  await owner.token.instructions
    .mintToATA({
      mint: mint.address,
      owner: owner.payer.address,
      mintAuthority: owner.payer,
      amount: amount * 2n,
      decimals: 9,
    })
    .sendTransaction();
  console.log("CPMM stage: tokens minted");
  await owner.associatedToken.instructions
    .createAssociatedTokenIdempotent({ mint: WSOL, owner: owner.payer.address })
    .sendTransaction();
  console.log("CPMM stage: wrapped SOL account created");
  const ata = async (m) =>
    (
      await findAssociatedTokenPda({
        mint: m,
        owner: owner.payer.address,
        tokenProgram: TOKEN,
      })
    )[0];
  const tokenAccount = await ata(mint.address),
    wsolAccount = await ata(WSOL);
  await owner.sendTransaction([
    systemTransfer(owner.payer, wsolAccount, solAmount * 2n),
    owner.token.instructions.syncNative({ account: wsolAccount }),
  ]);
  await owner.sendTransaction([
    owner.token.instructions.setAuthority({
      owned: mint.address,
      owner: owner.payer,
      authorityType: AuthorityType.MintTokens,
      newAuthority: null,
    }),
    owner.token.instructions.setAuthority({
      owned: mint.address,
      owner: owner.payer,
      authorityType: AuthorityType.FreezeAccount,
      newAuthority: null,
    }),
  ]);
  const zero =
    Buffer.compare(Buffer.from(bytes(mint.address)), Buffer.from(bytes(WSOL))) <
    0;
  const a = await poolAddresses(
      zero ? mint.address : WSOL,
      zero ? WSOL : mint.address,
    ),
    t0 = zero ? tokenAccount : wsolAccount,
    t1 = zero ? wsolAccount : tokenAccount;
  const lpAccount = await ata(a.lpMint),
    liquidity = sqrt(amount * solAmount),
    minted = liquidity - 100n;
  const init = initializePool(
      a,
      owner.payer,
      t0,
      t1,
      lpAccount,
      zero ? amount : solAmount,
      zero ? solAmount : amount,
    ),
    burn = owner.token.instructions.burnChecked({
      account: lpAccount,
      mint: a.lpMint,
      authority: owner.payer,
      amount: minted,
      decimals: 9,
    });
  const keys = [
    owner.payer.address,
    mint.address,
    tokenAccount,
    wsolAccount,
    a.config,
    a.pool,
    a.lpMint,
    a.vault0,
    a.vault1,
    a.observation,
    lpAccount,
    FEE,
  ];
  const snap = () => Promise.all(keys.map(raw));
  console.log("CPMM stage: submitting initialize and burn");
  const ownerBefore = await balance(owner.payer.address),
    feeBefore = await balance(FEE);
  const sent = await sponsor.sendTransaction([computeBudget, init, burn]);
  const tx = await rpc("getTransaction", [
    String(sent.context.signature),
    {
      encoding: "json",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  assert.equal(tx.meta.err, null);
  const wire = await rpc("getTransaction", [
    String(sent.context.signature),
    {
      encoding: "base64",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  assert.ok(Buffer.from(wire.transaction[0], "base64").length <= 1232);
  let setupRent = 0n;
  for (const size of [637, 82, 165, 165, 165, 4075])
    setupRent += BigInt(await rpc("getMinimumBalanceForRentExemption", [size]));
  assert.equal(
    ownerBefore - (await balance(owner.payer.address)),
    setupRent + 150000000n,
  );
  assert.equal((await balance(FEE)) - feeBefore, 150000000n);
  assert.equal(await tokens(a.vault0), zero ? amount : solAmount);
  assert.equal(await tokens(a.vault1), zero ? solAmount : amount);
  assert.equal(await tokens(lpAccount), 0n);
  const lp = Buffer.from((await raw(a.lpMint)).data[0], "base64");
  assert.equal(lp.readBigUInt64LE(36), 0n);
  assert.equal(lp.readUInt32LE(0), 1);
  assert.deepEqual(lp.subarray(4, 36), Buffer.from(bytes(a.authority)));
  assert.equal(lp.readUInt32LE(46), 0);
  const lpAccountBytes = Buffer.from((await raw(lpAccount)).data[0], "base64");
  assert.deepEqual(
    lpAccountBytes.subarray(32, 64),
    Buffer.from(bytes(owner.payer.address)),
  );
  const pool = Buffer.from((await raw(a.pool)).data[0], "base64");
  assert.equal(pool.length, 637);
  assert.equal(pool.readBigUInt64LE(333), liquidity);
  assert.equal(pool[390], 0);
  assert.deepEqual(pool.subarray(8, 40), Buffer.from(bytes(a.config)));
  assert.deepEqual(pool.subarray(136, 168), Buffer.from(bytes(a.lpMint)));
  evidence.transactions.push({
    kind: "initialize-and-burn",
    signature: String(sent.context.signature),
    computeUnits: tx.meta.computeUnitsConsumed,
    wireBytes: Buffer.from(wire.transaction[0], "base64").length,
    setupRent,
    externalSetupFee: 150000000n,
  });
  pass(
    "genuine initialize + full initial LP burn in one atomic transaction; exact deposited balances and zero withdrawable LP supply",
  );
  const denied = async (ix, label, code) => {
    const before = await snap(),
      old = (
        await rpc("getSignaturesForAddress", [
          sponsor.payer.address,
          { limit: 1, commitment: "confirmed" },
        ])
      )[0]?.signature;
    let error;
    try {
      await sponsor.sendTransaction([computeBudget, ix]);
    } catch (e) {
      error = e;
    }
    assert.ok(error, label + " succeeded");
    assert.deepEqual(await snap(), before);
    const failed = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0];
    assert.ok(failed.err && failed.signature !== old);
    assert.deepEqual(failed.err.InstructionError[1], { Custom: code });
    evidence.rejection.push({
      label,
      signature: failed.signature,
      error: failed.err,
    });
    console.log(
      "PASS CPMM rejection " +
        label +
        "; all pool/token/owner balances unchanged",
    );
  };
  await denied(
    withdrawPool(a, owner.payer, lpAccount, t0, t1, 1n),
    "creator cannot withdraw burned initial liquidity",
    2506,
  );
  await denied(
    owner.token.instructions.mintTo({
      mint: a.lpMint,
      token: lpAccount,
      mintAuthority: owner.payer,
      amount: 1n,
    }),
    "creator cannot remint burned LP",
    4,
  );
  await denied(init, "duplicate pool initialization", 0);
  const bad = withdrawPool(a, owner.payer, lpAccount, t0, t1, 1n);
  bad.accounts[12] = { address: mint.address, role: AccountRole.WRITABLE };
  await denied(bad, "substituted LP mint", 6004);
  // Await the protocol's on-chain timestamp opening, without a client-supplied clock.
  const open = Number(pool.readBigUInt64LE(373));
  for (let i = 0; i < 50; i++) {
    const slot = await rpc("getSlot", [{ commitment: "confirmed" }]),
      t = await rpc("getBlockTime", [slot]);
    if (t >= open) break;
    if (i === 49) throw Error("Pool opening clock timeout");
    await new Promise((r) => setTimeout(r, 250));
  }
  const oldToken = await tokens(tokenAccount),
    oldWsol = await tokens(wsolAccount);
  const swap = await sponsor.sendTransaction([
    computeBudget,
    swapPool(a, owner.payer, wsolAccount, tokenAccount, !zero, 10000000n, 1n),
  ]);
  assert.equal(oldWsol - (await tokens(wsolAccount)), 10000000n);
  assert.ok((await tokens(tokenAccount)) > oldToken);
  pass("real post-burn AMM buy succeeds");
  const sellAmount = 1000000000n,
    oldOut = await tokens(wsolAccount);
  await sponsor.sendTransaction([
    computeBudget,
    swapPool(a, owner.payer, tokenAccount, wsolAccount, zero, sellAmount, 1n),
  ]);
  assert.ok((await tokens(wsolAccount)) > oldOut);
  pass("real post-burn AMM sell succeeds");
  await denied(
    swapPool(
      a,
      owner.payer,
      wsolAccount,
      tokenAccount,
      !zero,
      100n,
      (1n << 64n) - 1n,
    ),
    "swap minimum-output protection",
    6005,
  );
  assert.equal(await tokens(lpAccount), 0n);
  assert.equal(
    Buffer.from((await raw(a.lpMint)).data[0], "base64").readBigUInt64LE(36),
    0n,
  );
  const tokenVault = zero ? a.vault0 : a.vault1,
    wsolVault = zero ? a.vault1 : a.vault0;
  assert.equal(
    (await tokens(tokenAccount)) + (await tokens(tokenVault)),
    amount * 2n,
  );
  assert.equal(
    (await tokens(wsolAccount)) + (await tokens(wsolVault)),
    solAmount * 2n,
  );
  pass(
    "post-swap total token and wrapped-SOL balances conserved exactly; LP principal remains burned",
  );
  return {
    ...evidence,
    pool: a.pool,
    program: CPMM,
    owner: owner.payer.address,
    mint: mint.address,
    initialTokenDeposit: amount,
    initialSolDeposit: solAmount,
    lpLiquidityAccounting: liquidity,
    initialLpBurned: minted,
    lpMintSupply: 0n,
    tokenConservation: amount * 2n,
    wsolConservation: solAmount * 2n,
    setupFeeRecipient: FEE,
    postBuySignature: String(swap.context.signature),
    feeRecipientLamports: await balance(FEE),
  };
}
