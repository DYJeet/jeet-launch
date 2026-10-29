import assert from "node:assert/strict";
import {
  address,
  AccountRole,
  createClient,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  createKeyPairSignerFromPrivateKeyBytes,
  lamports,
} from "@solana/kit";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { generatedPayer, airdropPayer } from "@solana/kit-plugin-signer";
import {
  tokenProgram,
  associatedTokenProgram,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  AuthorityType,
} from "@solana-program/token";
import {
  initializeCustodyInstruction,
  initializeOpeningInstruction,
} from "../src/lib/launch-custody.ts";
import {
  decodeMarketQuote,
  marketTradeInstruction,
  marketQuoteInstruction,
} from "../src/lib/launch-market.ts";
import { claimFeeInstruction, decodeFeeState } from "../src/lib/launch-fees.ts";
import {
  V5_PREVIEW_PROGRAM as program,
  initializeV5PreviewInstruction,
  v5PreviewQuoteInstruction,
  v5PreviewTradeInstruction,
  decodeV5PreviewState,
} from "../src/lib/launch-v5-preview.ts";
import { potential, v5Quote, v5Budget } from "../src/lib/v5-pricing.ts";
export async function runV5Tests() {
  const evidence = {
      positive: [],
      rejections: [],
      trades: [],
      conservation: [],
    },
    keys = new Set(),
    launches = [];
  const rpc = async (method, params = []) => {
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
  const raw = async (k) =>
    (
      await rpc("getAccountInfo", [
        k,
        { encoding: "base64", commitment: "confirmed" },
      ])
    ).value;
  const sol = async (k) =>
    BigInt((await rpc("getBalance", [k, { commitment: "confirmed" }])).value);
  const tokens = async (k) =>
    BigInt(
      (await rpc("getTokenAccountBalance", [k, { commitment: "confirmed" }]))
        .value.amount,
    );
  const state = async (l) =>
    decodeV5PreviewState(Buffer.from((await raw(l.curve)).data[0], "base64"));
  const fee = async (k) =>
    decodeFeeState(Buffer.from((await raw(k)).data[0], "base64"));
  const derive = (seed, m, ...x) =>
    getProgramDerivedAddress({
      programAddress: program,
      seeds: [
        new TextEncoder().encode(seed),
        getAddressEncoder().encode(m),
        ...x,
      ],
    });
  const local = (ix) => ({ ...ix, programAddress: program });
  async function client() {
    const c = await createClient()
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
      .use(airdropPayer(lamports(3000000000n)))
      .use(tokenProgram())
      .use(associatedTokenProgram());
    keys.add(c.payer.address);
    return c;
  }
  const sponsor = await client(),
    raceSponsor = await client(),
    alice = await client(),
    bob = await client(),
    creator = await client(),
    creator2 = await client();
  keys.delete(sponsor.payer.address);
  keys.delete(raceSponsor.payer.address);
  function pass(s) {
    evidence.positive.push(s);
    console.log("PASS V5: " + s);
  }
  async function snap() {
    return Promise.all([...keys].map(raw));
  }
  async function denied(ixs, code, label) {
    const before = await snap();
    const old = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0]?.signature;
    let caught;
    try {
      await sponsor.sendTransaction(Array.isArray(ixs) ? ixs : [ixs]);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, label + " unexpectedly succeeded");
    const detail = JSON.stringify(caught, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    assert.ok(detail.includes('"code":' + code), label + ": " + detail);
    assert.deepEqual(
      await snap(),
      before,
      label + " changed protected accounts",
    );
    const failed = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0];
    assert.ok(
      failed.err && failed.signature !== old,
      "rejection must execute and fail on-chain",
    );
    evidence.rejections.push({
      label,
      code,
      signature: failed.signature,
      slot: failed.slot,
    });
    console.log(
      "PASS V5 rejection: " + label + " (" + code + "); rollback exact",
    );
  }
  async function launch(
    owner,
    {
      cap = true,
      delay = 0n,
      limit = 1000,
      decimals = 0,
      start = 42n,
      end = 126n,
      duration = 1000000n,
    } = {},
  ) {
    const mint = await generateKeyPairSigner(),
      scale = 10n ** BigInt(decimals);
    await owner.token.instructions
      .createMint({
        newMint: mint,
        decimals,
        mintAuthority: owner.payer.address,
        freezeAuthority: owner.payer.address,
      })
      .sendTransaction();
    const [custody] = await derive("launch", mint.address),
      [opening] = await derive("opening", mint.address),
      [curve] = await derive("curve", mint.address),
      [platformVault] = await derive("fee", mint.address, new Uint8Array([0])),
      [creatorVault] = await derive("fee", mint.address, new Uint8Array([1]));
    for (const [who, amount] of [
      [owner.payer.address, 10n * scale],
      [custody, 990n * scale],
    ])
      await owner.token.instructions
        .mintToATA({
          mint: mint.address,
          owner: who,
          mintAuthority: owner.payer,
          amount,
          decimals,
        })
        .sendTransaction();
    await owner.associatedToken.instructions
      .createAssociatedTokenIdempotent({ mint: mint.address, owner: curve })
      .sendTransaction();
    const ata = async (owner) =>
      (
        await findAssociatedTokenPda({
          mint: mint.address,
          owner,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        })
      )[0];
    const l = {
      mint: mint.address,
      custody,
      opening,
      curve,
      platformVault,
      creatorVault,
      vault: await ata(custody),
      creatorAta: await ata(owner.payer.address),
      migrationVault: await ata(curve),
      scale,
      creator: owner.payer,
      inventory: 594n * scale,
      quantum: scale,
      start,
      end,
      holdings: new Set(),
      receipts: new Set(),
    };
    for (const k of [
      l.mint,
      custody,
      opening,
      curve,
      platformVault,
      creatorVault,
      l.vault,
      l.creatorAta,
      l.migrationVault,
    ])
      keys.add(k);
    launches.push(l);
    const setup = [
      local(
        initializeCustodyInstruction({
          payer: owner.payer,
          mint: l.mint,
          creator: owner.payer.address,
          creatorTokenAccount: l.creatorAta,
          custody,
          vault: l.vault,
          creatorAmount: 10n * scale,
          inventoryAmount: 990n * scale,
        }),
      ),
      local(
        initializeOpeningInstruction({
          payer: owner.payer,
          mint: l.mint,
          custody,
          opening,
          capBps: 2000,
          enabled: cap,
          durationSlots: 1000000n,
        }),
      ),
      initializeV5PreviewInstruction({
        ...l,
        payer: owner.payer,
        basePrice: start,
        slope: end,
        protection: {
          delaySlots: delay,
          durationSlots: duration,
          limitBps: limit,
        },
        tradingInventory: l.inventory,
        migrationInventory: 396n * scale,
      }),
    ];
    if (launches.length === 1) {
      for (const [offset, value, code, label] of [
        [35, 0n, 1503, "zero quantum"],
        [1, 0n, 1503, "zero starting price"],
        [9, 1n, 1503, "falling curve"],
        [43, 593n * scale, 1503, "inventory partition mismatch"],
        [51, 0n, 1503, "zero migration inventory"],
        [25, 0n, 1202, "zero protected duration"],
      ]) {
        const bad = { ...setup[2], data: setup[2].data.slice() };
        new DataView(bad.data.buffer).setBigUint64(offset, value, true);
        await denied(
          [setup[0], setup[1], bad],
          code,
          "initialization " + label,
        );
      }
      const bad = { ...setup[2], data: setup[2].data.slice() },
        v = new DataView(bad.data.buffer);
      v.setBigUint64(1, (1n << 64n) - 1n, true);
      v.setBigUint64(9, (1n << 64n) - 1n, true);
      await denied(
        [setup[0], setup[1], bad],
        1507,
        "initialization reserve overflow",
      );
    }
    await owner.sendTransaction(setup);
    await denied(
      v5PreviewQuoteInstruction({ ...l, amount: scale }),
      1501,
      "trading requires revoked mint/freeze authorities",
    );
    await owner.sendTransaction([
      owner.token.instructions.setAuthority({
        owned: l.mint,
        owner: owner.payer,
        authorityType: AuthorityType.MintTokens,
        newAuthority: null,
      }),
      owner.token.instructions.setAuthority({
        owned: l.mint,
        owner: owner.payer,
        authorityType: AuthorityType.FreezeAccount,
        newAuthority: null,
      }),
    ]);
    assert.equal(await tokens(l.vault), 594n * scale);
    assert.equal(await tokens(l.migrationVault), 396n * scale);
    assert.equal((await state(l)).sequence, 0n);
    const t = Buffer.from((await raw(l.migrationVault)).data[0], "base64");
    assert.deepEqual(
      t.subarray(32, 64),
      Buffer.from(getAddressEncoder().encode(curve)),
    );
    pass("init: exact 1/59.4/39.6 partition and curve-PDA migration custody");
    return l;
  }
  async function dest(l, c) {
    await sponsor.associatedToken.instructions
      .createAssociatedTokenIdempotent({ mint: l.mint, owner: c.payer.address })
      .sendTransaction();
    const [d] = await findAssociatedTokenPda({
      mint: l.mint,
      owner: c.payer.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [r] = await derive(
      "buyer",
      l.mint,
      getAddressEncoder().encode(c.payer.address),
    );
    l.holdings.add(d);
    l.receipts.add(r);
    keys.add(d);
    keys.add(r);
    return d;
  }
  async function alternate(l, c) {
    const signer = await generateKeyPairSigner(),
      data = new Uint8Array(52),
      v = new DataView(data.buffer);
    v.setUint32(0, 0, true);
    v.setBigUint64(
      4,
      BigInt(await rpc("getMinimumBalanceForRentExemption", [165])),
      true,
    );
    v.setBigUint64(12, 165n, true);
    data.set(getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS), 20);
    await sponsor.sendTransaction([
      {
        programAddress: address("11111111111111111111111111111111"),
        data,
        accounts: [
          {
            address: sponsor.payer.address,
            role: AccountRole.WRITABLE_SIGNER,
            signer: sponsor.payer,
          },
          {
            address: signer.address,
            role: AccountRole.WRITABLE_SIGNER,
            signer,
          },
        ],
      },
      sponsor.token.instructions.initializeAccount3({
        account: signer.address,
        mint: l.mint,
        owner: c.payer.address,
      }),
    ]);
    l.holdings.add(signer.address);
    keys.add(signer.address);
    return signer.address;
  }
  async function quote(l, n, sell = false) {
    const before = await snap();
    const sent = await sponsor.sendTransaction([
      v5PreviewQuoteInstruction({ ...l, amount: n, sell }),
    ]);
    const tx = await rpc("getTransaction", [
      String(sent.context.signature),
      {
        encoding: "json",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    assert.equal(tx.meta.err, null);
    const q = decodeMarketQuote(
        Buffer.from(tx.meta.returnData.data[0], "base64"),
      ),
      s = await state(l),
      p = await fee(l.platformVault),
      c = await fee(l.creatorVault);
    const oracle = v5Quote(l, s.sold, n, p.accrued, c.accrued, sell);
    for (const k of ["raw", "platform", "creator", "user", "amount"])
      assert.equal(q[k], oracle[k]);
    assert.equal(q.sequence, s.sequence);
    assert.deepEqual(await snap(), before);
    return q;
  }
  async function tradeIx(l, c, d, q, sell = false, bound = q.user) {
    const [r] = await derive(
      "buyer",
      l.mint,
      getAddressEncoder().encode(c.payer.address),
    );
    return v5PreviewTradeInstruction({
      ...l,
      buyer: c.payer,
      destination: d,
      receipt: r,
      amount: q.amount,
      expectedSold: q.sold,
      quotedCost: q.raw,
      maxCost: bound,
      sequence: q.sequence,
      sell,
    });
  }
  async function conservation(l) {
    const s = await state(l),
      p = await fee(l.platformVault),
      c = await fee(l.creatorVault),
      rent = BigInt(await rpc("getMinimumBalanceForRentExemption", [262]));
    assert.equal(s.reserve, potential(l, s.sold));
    assert.equal(await sol(l.curve), rent + s.reserve);
    assert.equal(await tokens(l.migrationVault), 396n * l.scale);
    let distributed = 0n;
    for (const d of l.holdings) distributed += await tokens(d);
    assert.equal(
      (await tokens(l.creatorAta)) +
        (await tokens(l.vault)) +
        (await tokens(l.migrationVault)) +
        distributed,
      1000n * l.scale,
    );
    for (const [k, f] of [
      [l.platformVault, p],
      [l.creatorVault, c],
    ]) {
      assert.equal(f.accrued, f.withdrawn + f.claimable);
      assert.equal(
        await sol(k),
        BigInt(await rpc("getMinimumBalanceForRentExemption", [153])) +
          f.claimable,
      );
    }
    const trades = evidence.trades.filter((t) => t.mint === l.mint),
      sum = (f) => trades.reduce((a, t) => a + f(t), 0n);
    const buyerExpenditure = sum((t) => (t.sell ? 0n : t.user)),
      netRedemptions = sum((t) => (t.sell ? t.user : 0n));
    assert.equal(
      sum((t) => (t.sell ? 0n : t.raw)),
      s.rawIn,
    );
    assert.equal(
      sum((t) => (t.sell ? t.raw : 0n)),
      s.rawOut,
    );
    assert.equal(
      sum((t) => t.platform),
      p.accrued,
    );
    assert.equal(
      sum((t) => t.creator),
      c.accrued,
    );
    assert.equal(
      buyerExpenditure,
      netRedemptions + s.reserve + p.accrued + c.accrued,
    );
    return {
      buyerExpenditure,
      netRedemptions,
      platformClaimable: p.claimable,
      creatorClaimable: c.claimable,
      creatorTokens: await tokens(l.creatorAta),
      tradingTokens: await tokens(l.vault),
      migrationTokens: await tokens(l.migrationVault),
      buyerTokens: distributed,
      mint: l.mint,
      supply: 1000n * l.scale,
      sold: s.sold,
      reserve: s.reserve,
      rawIn: s.rawIn,
      rawOut: s.rawOut,
      platformAccrued: p.accrued,
      creatorAccrued: c.accrued,
      platformWithdrawn: p.withdrawn,
      creatorWithdrawn: c.withdrawn,
    };
  }
  async function trade(l, c, d, n, sell = false) {
    const q = await quote(l, n, sell),
      before = await state(l),
      p = await fee(l.platformVault),
      cr = await fee(l.creatorVault),
      b = await sol(c.payer.address),
      v = await sol(l.curve),
      t = await tokens(d),
      [r] = await derive(
        "buyer",
        l.mint,
        getAddressEncoder().encode(c.payer.address),
      ),
      receipt = await raw(r);
    const sent = await sponsor.sendTransaction([
      await tradeIx(l, c, d, q, sell),
    ]);
    const s = await state(l),
      afterReceipt = await raw(r),
      rent = sell
        ? 0n
        : BigInt(afterReceipt.lamports) - BigInt(receipt?.lamports ?? 0);
    assert.equal(
      (await sol(c.payer.address)) - b,
      sell ? q.user : -q.user - rent,
    );
    assert.equal((await sol(l.curve)) - v, sell ? -q.raw : q.raw);
    assert.equal((await tokens(d)) - t, sell ? -n : n);
    assert.equal(s.reserve, potential(l, s.sold));
    assert.equal(s.sequence, before.sequence + 1n);
    assert.equal((await fee(l.platformVault)).accrued - p.accrued, q.platform);
    assert.equal((await fee(l.creatorVault)).accrued - cr.accrued, q.creator);
    if (sell) assert.deepEqual(afterReceipt, receipt);
    evidence.trades.push({
      mint: l.mint,
      ...q,
      sell,
      signature: String(sent.context.signature),
    });
    await conservation(l);
    pass(
      (sell ? "sell" : "buy") +
        ": exact quote/payment/fees, gross receipts, reserve and supply",
    );
    return q;
  }
  const l = await launch(creator),
    l2 = await launch(creator2, { cap: false, limit: 9000, decimals: 9 }),
    a = await dest(l, alice),
    b = await dest(l, bob),
    alt = await alternate(l, alice),
    a2 = await dest(l2, alice),
    b2 = await dest(l2, bob);
  await denied(
    sponsor.token.instructions.transferChecked({
      source: l.migrationVault,
      mint: l.mint,
      destination: a,
      authority: alice.payer,
      amount: 1n,
      decimals: 0,
    }),
    4,
    "unauthorized migration token movement",
  );
  const l3 = await launch(creator, { duration: 1n }),
    a3 = await dest(l3, alice);
  await trade(l3, alice, a3, 200n);
  await denied(
    await tradeIx(l3, alice, a3, await quote(l3, 1n)),
    1005,
    "post-protection exact cumulative wallet cap",
  );
  await trade(l3, alice, a3, 1n, true);
  await denied(
    await tradeIx(l3, alice, a3, await quote(l3, 1n)),
    1005,
    "sell cannot reset ordinary cumulative wallet cap",
  );
  await trade(l, alice, a, 60n);
  await trade(l, alice, alt, 40n);
  await denied(
    await tradeIx(l, alice, alt, await quote(l, 1n)),
    1201,
    "alternate account cannot exceed cumulative protected limit",
  );
  await trade(l, bob, b, 100n);
  await trade(l, alice, a, 20n, true);
  await denied(
    await tradeIx(l, alice, a, await quote(l, 1n)),
    1201,
    "sell does not reset gross protected receipt",
  );
  let q = await quote(l2, 17n * l2.scale);
  const buy = await tradeIx(l2, alice, a2, q);
  await denied(
    await tradeIx(l2, alice, a2, q, false, q.user - 1n),
    1508,
    "fee-inclusive maximum spend",
  );
  const substituted = (ix, index, key) => ({
    ...ix,
    accounts: ix.accounts.map((x, i) =>
      i === index ? { ...x, address: key } : x,
    ),
  });
  for (const [index, key, label] of [
    [1, l.mint, "mint"],
    [2, l.custody, "custody"],
    [3, l.vault, "inventory"],
    [4, b2, "destination"],
    [5, l.opening, "opening"],
    [6, [...l.receipts][0], "receipt"],
    [9, l.curve, "curve"],
    [10, l.platformVault, "platform vault"],
    [11, l.creatorVault, "creator vault"],
    [12, l.migrationVault, "migration vault"],
  ])
    await denied(substituted(buy, index, key), 1501, "substituted " + label);
  await denied(
    {
      ...buy,
      accounts: buy.accounts.map((x, i) =>
        i === 0 ? { address: x.address, role: AccountRole.WRITABLE } : x,
      ),
    },
    1502,
    "missing buyer signature",
  );
  await denied(
    { ...buy, data: new Uint8Array([19]) },
    1500,
    "malformed instruction",
  );
  let zero = { ...buy, data: buy.data.slice() };
  new DataView(zero.data.buffer).setBigUint64(1, 0n, true);
  await denied(zero, 1503, "zero purchase");
  let dust = { ...buy, data: buy.data.slice() };
  new DataView(dust.data.buffer).setBigUint64(1, 1n, true);
  await denied(dust, 1503, "fractional quantum rejected");
  await denied(
    [buy, buy],
    1504,
    "same-transaction stale repeated buy rolls back first buy",
  );
  await trade(l2, alice, a2, q.amount);
  await denied(buy, 1504, "stale sold and sequence");
  await denied(
    {
      ...marketTradeInstruction({
        ...l2,
        buyer: alice.payer,
        destination: a2,
        receipt: [...l2.receipts][0],
        amount: q.amount,
        expectedSold: q.sold,
        quotedCost: q.raw,
        maxCost: q.user,
        sequence: q.sequence,
      }),
      programAddress: program,
    },
    1401,
    "legacy V4 buy cannot access V5",
  );
  const q2 = await quote(l2, 1n * l2.scale);
  await denied(
    {
      ...marketQuoteInstruction({ ...l2, amount: q2.amount }),
      programAddress: program,
    },
    1401,
    "legacy V4 quote cannot access V5",
  );
  await denied(
    {
      ...buy,
      programAddress: address("7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31"),
    },
    1514,
    "production artifact refuses V5 execution",
  );
  await trade(l2, bob, b2, 100n * l2.scale);
  let sq = await quote(l2, 5n * l2.scale, true);
  await denied(
    await tradeIx(l2, bob, b2, sq, true, sq.user + 1n),
    1508,
    "minimum net proceeds",
  );
  await trade(l2, bob, b2, 5n * l2.scale, true);
  const latest = await state(l2),
    max = v5Budget(
      l2,
      latest.sold,
      10000n,
      (await fee(l2.platformVault)).accrued,
      (await fee(l2.creatorVault)).accrued,
    );
  await trade(l2, alice, a2, max.amount);
  pass(
    "SOL-denominated budget converts to maximal affordable whole-token quote",
  );
  const remaining = l2.inventory - (await state(l2)).sold;
  await trade(l2, alice, a2, remaining);
  assert.equal((await state(l2)).eligible, true);
  pass("exact completion marks eligible but does not cut off redemptions");
  await denied(
    v5PreviewQuoteInstruction({ ...l2, amount: l2.scale }),
    1503,
    "one quantum beyond completion",
  );
  await trade(l2, alice, a2, l2.scale, true);
  assert.equal((await state(l2)).eligible, false);
  await trade(l2, alice, a2, l2.scale);
  pass("eligibility is reversible; no stranded redemption backing");
  const s0 = await state(l2),
    partial = await quote(l2, l2.scale, true),
    ix = await tradeIx(l2, alice, a2, partial, true);
  await denied([ix, ix], 1504, "same-transaction repeated sell rolls back");
  assert.equal((await state(l2)).sequence, s0.sequence);
  // Two concurrently submitted sells share a cursor; exactly one can commit.
  const raceSol = await sol(alice.payer.address);
  const races = await Promise.allSettled([
    sponsor.sendTransaction([ix]),
    raceSponsor.sendTransaction([ix]),
  ]);
  assert.equal(races.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await state(l2)).sequence, s0.sequence + 1n);
  assert.equal((await sol(alice.payer.address)) - raceSol, partial.user);
  const winner = races.find((x) => x.status === "fulfilled").value;
  evidence.trades.push({
    mint: l2.mint,
    ...partial,
    sell: true,
    signature: String(winner.context.signature),
  });
  await conservation(l2);
  pass("concurrent sells: one commits, stale competitor cannot double-redeem");
  // Claims use existing immutable beneficiaries; neither reserve nor price changes.
  const treasury = await createKeyPairSignerFromPrivateKeyBytes(
    new Uint8Array(32).fill(42),
  );
  keys.add(treasury.address);
  const funding = await rpc("requestAirdrop", [treasury.address, 1000000000]);
  for (let i = 0; i < 100; i++) {
    const f = (await rpc("getSignatureStatuses", [[funding]])).value[0];
    if (f && ["confirmed", "finalized"].includes(f.confirmationStatus)) {
      assert.equal(f.err, null);
      break;
    }
    if (i === 99) throw Error("Treasury faucet confirmation timeout");
    await new Promise((r) => setTimeout(r, 200));
  }
  for (const [kind, who, k] of [
    [0, treasury, l2.platformVault],
    [1, creator2.payer, l2.creatorVault],
  ]) {
    const f = await fee(k),
      s = await state(l2),
      old = await sol(who.address),
      amount = f.claimable;
    const claim = local(
      claimFeeInstruction({
        ...l2,
        beneficiary: who,
        feeVault: k,
        kind,
        amount,
      }),
    );
    await denied(
      local(
        claimFeeInstruction({
          ...l2,
          beneficiary: alice.payer,
          feeVault: k,
          kind,
          amount,
        }),
      ),
      1304,
      "unauthorized " + (kind ? "creator" : "platform") + " claim",
    );
    await sponsor.sendTransaction([claim]);
    assert.equal((await sol(who.address)) - old, amount);
    assert.equal((await fee(k)).claimable, 0n);
    assert.deepEqual(await state(l2), s);
    pass(
      "authorized " +
        (kind ? "creator" : "treasury") +
        " full claim leaves redemption reserve unchanged",
    );
    await denied(claim, 1307, "duplicate " + kind + " claim");
  }
  const balanceA = await tokens(a2),
    balanceB = await tokens(b2);
  await trade(l2, alice, a2, balanceA, true);
  await trade(l2, bob, b2, balanceB, true);
  assert.equal((await state(l2)).reserve, 0n);
  assert.equal((await state(l2)).sold, 0n);
  pass(
    "full multiwallet redemption returns reserve to zero, migration tokens untouched",
  );
  evidence.conservation.push(
    await conservation(l),
    await conservation(l2),
    await conservation(l3),
  );
  const records = [];
  for (const key of keys) {
    const value = await raw(key);
    if (value)
      records.push({ address: key, account: { pubkey: key, account: {...value,rentEpoch:0} } });
  }
  const fixtures = [];
  for (const [label, code, mutate] of [
    [
      "potential/reserve mismatch",
      1510,
      (get) => {
        const d = get(l.curve);
        d.writeBigUInt64LE(d.readBigUInt64LE(136) + 1n, 136);
        d.writeBigUInt64LE(d.readBigUInt64LE(204) + 1n, 204);
      },
    ],
    [
      "zero quantum state",
      1510,
      (get) => get(l.curve).writeBigUInt64LE(0n, 245),
    ],
    [
      "reserved inventory partition corruption",
      1510,
      (get) => get(l.curve).writeBigUInt64LE(395n, 253),
    ],
    [
      "gross opening receipt corruption",
      1510,
      (get) => {
        const d = get(l.opening);
        d.writeBigUInt64LE(d.readBigUInt64LE(97) + 1n, 97);
      },
    ],
    [
      "migration custody authority corruption",
      1501,
      (get) =>
        get(l.migrationVault).set(
          getAddressEncoder().encode(creator.payer.address),
          32,
        ),
    ],
    [
      "redemption reserve insolvency",
      1506,
      (_get, map) => map.get(l.curve).account.account.lamports--,
    ],
    [
      "fee carry inconsistency",
      1412,
      (get, map) => {
        const d = get(l.creatorVault);
        d.writeBigUInt64LE(d.readBigUInt64LE(105) + 1n, 105);
        d.writeBigUInt64LE(d.readBigUInt64LE(121) + 1n, 121);
        map.get(l.creatorVault).account.account.lamports++;
      },
    ],
  ]) {
    const cloned = structuredClone(records),
      map = new Map(cloned.map((a) => [a.address, a])),
      bytes = new Map(
        cloned.map((a) => [
          a.address,
          Buffer.from(a.account.account.data[0], "base64"),
        ]),
      );
    mutate((k) => bytes.get(k), map);
    for (const a of cloned)
      a.account.account.data = [
        bytes.get(a.address).toString("base64"),
        "base64",
      ];
    fixtures.push({ ...l, label, code, accounts: cloned });
  }
  const json = JSON.stringify(
    evidence,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
  console.log(json);
  console.log(
    `V5 PASS ${evidence.positive.length} positive; ${evidence.rejections.length} on-chain rejection/rollback checks`,
  );
  return { ...evidence, fixtures };
}
