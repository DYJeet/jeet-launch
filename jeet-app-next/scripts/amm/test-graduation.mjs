import assert from "node:assert/strict";
import {
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
} from "../../src/lib/launch-custody.ts";
import { decodeMarketQuote } from "../../src/lib/launch-market.ts";
import {
  claimFeeInstruction,
  decodeFeeState,
} from "../../src/lib/launch-fees.ts";
import {
  V5_PREVIEW_PROGRAM as program,
  initializeV5PreviewInstruction,
  v5PreviewQuoteInstruction,
  v5PreviewTradeInstruction,
  decodeV5PreviewState,
} from "../../src/lib/launch-v5-preview.ts";
import { potential, v5Quote } from "../../src/lib/v5-pricing.ts";
import {
  activateGraduationInstructions,
  graduationAddresses,
  initializeGraduationInstruction,
  graduateInstruction,
  decodeGraduation,
} from "../../src/lib/launch-graduation.ts";
import {
  computeBudget,
  FEE,
  WSOL,
  TOKEN,
  swapPool,
  systemTransfer,
} from "./cpmm.mjs";
export async function testGraduation() {
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
      await fetch("http://127.0.0.1:9917", {
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
          rpcUrl: "http://127.0.0.1:9917",
          rpcSubscriptionsUrl: "ws://127.0.0.1:9918",
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
    alice = await client(),
    bob = await client(),
    creator = await client(),
    creator2 = await client();
  keys.delete(sponsor.payer.address);
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
      termsBps,
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
    if (termsBps !== undefined) {
      const ga = await graduationAddresses(l.mint, 2n);
      keys.add(ga.terms);
      await denied(
        activateGraduationInstructions({
          ...l,
          ...ga,
          creator: owner.payer,
          maxPriceGapBps: 0,
        }),
        1605,
        "failed activation rolls back mint/freeze revocation",
      );
      const activated = await owner.sendTransaction(
        activateGraduationInstructions({
          ...l,
          ...ga,
          creator: owner.payer,
          maxPriceGapBps: termsBps,
        }),
      );
      (evidence.activations ??= []).push(String(activated.context.signature));
      assert.equal(
        decodeGraduation(Buffer.from((await raw(ga.terms)).data[0], "base64"))
          .migrated,
        false,
      );
      pass(
        "one transaction revokes both authorities and records prospective terms before trading",
      );
    } else {
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
    }
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
  const l = await launch(creator, { cap: false, limit: 9000, duration: 1n }),
    a = await dest(l, alice),
    b = await dest(l, bob),
    ga = await graduationAddresses(l.mint, 0n);
  for (const k of Object.values(ga)) keys.add(k);
  keys.add(FEE);
  await sponsor.sendTransaction([
    systemTransfer(sponsor.payer, ga.migrator, 1000000n),
  ]);
  const terms = initializeGraduationInstruction({
    ...l,
    ...ga,
    creator: creator.payer,
    maxPriceGapBps: 60,
  });
  await denied(
    {
      ...terms,
      programAddress: "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
    },
    1514,
    "default artifact rejects graduation activation",
  );
  await denied(
    {
      programAddress: "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
      accounts: [],
      data: new Uint8Array([22]),
    },
    1514,
    "default artifact rejects live migration",
  );
  await denied(
    initializeGraduationInstruction({
      ...l,
      ...ga,
      creator: alice.payer,
      maxPriceGapBps: 60,
    }),
    1602,
    "only immutable creator can accept prospective terms",
  );
  const tooTight = { ...terms, data: terms.data.slice() };
  new DataView(tooTight.data.buffer).setUint16(1, 0, true);
  await denied(tooTight, 1605, "price continuity outside disclosed tolerance");
  await sponsor.sendTransaction([terms]);
  pass("prospective graduation terms recorded before first trade");
  const grad = async (overrides = {}) =>
    graduateInstruction({
      ...l,
      ...ga,
      caller: bob.payer,
      sequence: (await state(l)).sequence,
      nonce: 0n,
      maxSetupLamports: 300000000n,
      ...overrides,
    });
  await denied(await grad(), 1603, "not completed");
  const malformed = await grad();
  malformed.data = new Uint8Array([22]);
  await denied(malformed, 1600, "malformed graduation encoding");
  const unsigned = await grad();
  unsigned.accounts[0] = { address: bob.payer.address, role: 1 };
  await denied(unsigned, 1602, "missing graduation caller signer");

  await trade(l, alice, a, 200n);
  await trade(l, alice, a, 40n, true);
  await denied(terms, 1604, "terms cannot be replaced after trading");
  await trade(l, bob, b, 434n);
  assert.equal((await state(l)).eligible, true);
  await denied(await grad({ sequence: 0n }), 1604, "stale completion state");
  await denied(
    [computeBudget, await grad({ maxSetupLamports: 1n })],
    1606,
    "insufficient setup budget rolls back account creation",
  );
  await denied(
    [computeBudget, await grad({ maxSetupLamports: 100000000n })],
    1,
    "failed AMM setup CPI preserves backing and custody",
  );
  await trade(l, bob, b, 1n, true);
  await trade(l, bob, b, 1n);
  for (const i of [7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 25]) {
    const ix = await grad();
    ix.accounts = ix.accounts.map((x, j) =>
      j === i ? { ...x, address: creator.payer.address } : x,
    );
    await denied(
      [computeBudget, ix],
      1601,
      "substituted graduation account " + i,
    );
  }
  await denied(
    [computeBudget, await grad(), await grad()],
    1609,
    "second migration in same transaction rolls back first migration",
  );
  const protocolFeeBefore = await sol(FEE),
    before = await state(l),
    pf = await fee(l.platformVault),
    cf = await fee(l.creatorVault),
    wallet = await sol(bob.payer.address);
  const racer = await client();
  keys.delete(racer.payer.address);
  const migration = await grad(),
    attempts = await Promise.allSettled([
      sponsor.sendTransaction([computeBudget, migration]),
      racer.sendTransaction([computeBudget, migration]),
    ]);
  assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
  const winner = attempts.find((x) => x.status === "fulfilled"),
    loserIndex = attempts.findIndex((x) => x.status === "rejected");
  const loser = (
    await rpc("getSignaturesForAddress", [
      [sponsor, racer][loserIndex].payer.address,
      { limit: 1, commitment: "confirmed" },
    ])
  )[0];
  assert.deepEqual(loser.err.InstructionError[1], { Custom: 1609 });
  evidence.rejections.push({
    label: "concurrent migration loser cannot repeat the economic transition",
    code: 1609,
    signature: loser.signature,
    slot: loser.slot,
  });
  pass(
    "concurrent permissionless graduation permits exactly one pool deposit and burn",
  );
  const sent = winner.value,
    signature = String(sent.context.signature),
    confirmed = await rpc("getTransaction", [
      signature,
      {
        encoding: "json",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
  assert.equal(confirmed.meta.err, null);
  const wire = await rpc("getTransaction", [
      signature,
      {
        encoding: "base64",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]),
    transactionBytes = Buffer.from(wire.transaction[0], "base64").length;
  assert.ok(transactionBytes <= 1232);
  const after = await state(l),
    proof = decodeGraduation(
      Buffer.from((await raw(ga.terms)).data[0], "base64"),
    );
  assert.equal((await sol(FEE)) - protocolFeeBefore, 150000000n);
  assert.equal(await sol(ga.migrator), 1000000n);
  assert.equal(after.sequence, before.sequence + 1n);
  assert.equal(after.migrated, true);
  assert.equal(after.reserve, 0n);
  assert.equal(after.migrationSol, before.reserve);
  assert.equal(proof.pool, ga.pool);
  assert.equal(proof.solDeposited, before.reserve);
  assert.equal(proof.tokensDeposited, 396n);
  assert.equal(await tokens(l.migrationVault), 0n);
  assert.equal(await tokens(l.vault), 0n);
  const projectPool = ga.mint0 === l.mint ? ga.vault0 : ga.vault1,
    solPool = ga.mint0 === WSOL ? ga.vault0 : ga.vault1;
  assert.equal(await tokens(projectPool), 396n);
  assert.equal(await tokens(solPool), before.reserve);
  assert.equal(
    (await rpc("getTokenSupply", [ga.lpMint, { commitment: "confirmed" }]))
      .value.amount,
    "0",
  );
  assert.equal(await raw(ga.migratorLp), null);
  assert.equal(await raw(ga.migratorToken), null);
  assert.equal(await raw(ga.migratorSol), null);
  assert.deepEqual(await fee(l.platformVault), pf);
  assert.deepEqual(await fee(l.creatorVault), cf);
  assert.equal(
    await sol(l.curve),
    BigInt(await rpc("getMinimumBalanceForRentExemption", [262])),
  );
  const setupSpent = wallet - (await sol(bob.payer.address));
  assert.ok(setupSpent > 150000000n && setupSpent <= 300000000n);
  pass(
    "real atomic custody migration, exact pool reserves, entire initial LP burn and source cleanup",
  );
  evidence.transactions = [
    {
      signature,
      computeUnits: confirmed.meta.computeUnitsConsumed,
      transactionBytes,
      setupSpent,
      proof,
    },
  ];
  await denied([computeBudget, await grad()], 1609, "duplicate migration");
  await denied(
    v5PreviewQuoteInstruction({ ...l, amount: 1n }),
    1609,
    "post migration buy quote",
  );
  await denied(
    v5PreviewQuoteInstruction({ ...l, amount: 1n, sell: true }),
    1609,
    "post migration redemption quote",
  );
  await denied(
    await tradeIx(l, alice, a, {
      amount: 1n,
      sold: 594n,
      raw: 126n,
      user: 128n,
      sequence: after.sequence,
    }),
    1609,
    "post migration buy",
  );
  await denied(
    await tradeIx(
      l,
      alice,
      a,
      {
        amount: 1n,
        sold: 594n,
        raw: 126n,
        user: 124n,
        sequence: after.sequence,
      },
      true,
    ),
    1609,
    "post migration sell",
  );
  const treasury = await createKeyPairSignerFromPrivateKeyBytes(
    new Uint8Array(32).fill(42),
  );
  await sponsor.sendTransaction([
    systemTransfer(sponsor.payer, treasury.address, 1000000n),
  ]);
  keys.add(treasury.address);
  for (const [kind, who, k] of [
    [0, treasury, l.platformVault],
    [1, creator.payer, l.creatorVault],
  ]) {
    const f = await fee(k),
      old = await sol(who.address),
      claim = local(
        claimFeeInstruction({
          ...l,
          beneficiary: who,
          feeVault: k,
          kind,
          amount: f.claimable,
        }),
      );
    await denied(
      local(
        claimFeeInstruction({
          ...l,
          beneficiary: alice.payer,
          feeVault: k,
          kind,
          amount: f.claimable,
        }),
      ),
      1304,
      "unauthorized post migration fee claim " + kind,
    );
    await sponsor.sendTransaction([claim]);
    assert.equal((await sol(who.address)) - old, f.claimable);
    assert.equal((await fee(k)).claimable, 0n);
    await denied(claim, 1307, "duplicate post migration fee claim " + kind);
    pass("post migration fee beneficiary claim " + kind);
  }
  let userTokens = 0n;
  for (const d of l.holdings) userTokens += await tokens(d);
  assert.equal(
    (await tokens(l.creatorAta)) + userTokens + (await tokens(projectPool)),
    1000n,
  );
  const expenditures = evidence.trades.reduce(
      (n, t) => n + (t.sell ? 0n : t.user),
      0n,
    ),
    returns = evidence.trades.reduce((n, t) => n + (t.sell ? t.user : 0n), 0n);
  assert.equal(
    expenditures,
    returns + before.reserve + pf.accrued + cf.accrued,
  );
  evidence.conservation.push({
    buyerExpenditure: expenditures,
    sellerNet: returns,
    migratedSol: before.reserve,
    platformFees: pf.accrued,
    creatorFees: cf.accrued,
    supply: 1000n,
    creatorTokens: 10n,
    buyerTokens: userTokens,
    poolTokens: 396n,
  });
  pass(
    "exact SOL and token conservation across buys, sells, migration and fee withdrawals",
  );
  const poolData = Buffer.from((await raw(ga.pool)).data[0], "base64"),
    open = Number(poolData.readBigUInt64LE(373));
  for (let i = 0; i < 50; i++) {
    const t = await rpc("getBlockTime", [
      await rpc("getSlot", [{ commitment: "confirmed" }]),
    ]);
    if (t >= open) break;
    if (i === 49) throw Error("Pool opening timeout");
    await new Promise((r) => setTimeout(r, 200));
  }
  await alice.associatedToken.instructions
    .createAssociatedTokenIdempotent({ mint: WSOL, owner: alice.payer.address })
    .sendTransaction();
  const [wrapped] = await findAssociatedTokenPda({
    mint: WSOL,
    owner: alice.payer.address,
    tokenProgram: TOKEN,
  });
  keys.add(wrapped);
  await sponsor.sendTransaction([
    systemTransfer(alice.payer, wrapped, 10000n),
    alice.token.instructions.syncNative({ account: wrapped }),
  ]);
  const beforePoolSol = await tokens(solPool),
    oldToken = await tokens(a);
  await sponsor.sendTransaction([
    computeBudget,
    swapPool(ga, alice.payer, wrapped, a, ga.mint0 === WSOL, 1000n, 1n),
  ]);
  assert.ok((await tokens(a)) > oldToken);
  assert.equal(await tokens(solPool), beforePoolSol + 1000n);
  await sponsor.sendTransaction([
    computeBudget,
    swapPool(ga, alice.payer, a, wrapped, ga.mint0 === l.mint, 10n, 1n),
  ]);
  assert.equal(
    (await tokens(l.creatorAta)) +
      (await tokens(a)) +
      (await tokens(b)) +
      (await tokens(projectPool)),
    1000n,
  );
  assert.equal(
    (await tokens(wrapped)) + (await tokens(solPool)),
    10000n + before.reserve,
  );
  assert.equal(
    (await rpc("getTokenSupply", [ga.lpMint, { commitment: "confirmed" }]))
      .value.amount,
    "0",
  );
  pass("actual post graduation AMM buy/sell preserve supply and burned LP");
  evidence.postAmm = {
    creatorTokens: await tokens(l.creatorAta),
    buyerTokens: (await tokens(a)) + (await tokens(b)),
    poolTokens: await tokens(projectPool),
    totalSupply: 1000n,
    buyerWrapped: await tokens(wrapped),
    poolWrapped: await tokens(solPool),
    totalWrapped: 10000n + before.reserve,
    lpSupply: 0n,
  };

  const protectedLaunch = await launch(creator2, {
      cap: false,
      limit: 9000,
      duration: 1000000n,
    }),
    protectedDest = await dest(protectedLaunch, alice),
    pa = await graduationAddresses(protectedLaunch.mint, 1n);
  for (const k of Object.values(pa)) keys.add(k);
  await sponsor.sendTransaction([
    initializeGraduationInstruction({
      ...protectedLaunch,
      ...pa,
      creator: creator2.payer,
      maxPriceGapBps: 60,
    }),
  ]);
  await trade(protectedLaunch, alice, protectedDest, 594n);
  await denied(
    [
      computeBudget,
      graduateInstruction({
        ...protectedLaunch,
        ...pa,
        caller: bob.payer,
        sequence: (await state(protectedLaunch)).sequence,
        nonce: 1n,
        maxSetupLamports: 300000000n,
      }),
    ],
    1610,
    "graduation cannot bypass active protected opening",
  );
  await trade(protectedLaunch, alice, protectedDest, 1n, true);
  pass("opening-phase rejection leaves redemption funded and executable");
  const third = await client();
  const capped = await launch(creator, {
      termsBps: 60,
      cap: true,
      limit: 1000,
      duration: 1n,
    }),
    ca = await dest(capped, alice),
    cb = await dest(capped, bob),
    cc = await dest(capped, third),
    cg = await graduationAddresses(capped.mint, 2n);
  for (const key of Object.values(cg)) keys.add(key);
  for (const [c, d] of [
    [alice, ca],
    [bob, cb],
    [third, cc],
  ])
    await trade(capped, c, d, 198n);
  await denied(
    [
      computeBudget,
      graduateInstruction({
        ...capped,
        ...cg,
        caller: alice.payer,
        sequence: (await state(capped)).sequence,
        nonce: 2n,
        maxSetupLamports: 300000000n,
      }),
    ],
    1610,
    "graduation cannot bypass active cumulative wallet-cap phase",
  );
  await trade(capped, alice, ca, 1n, true);
  pass("enabled ordinary cap window cannot be bypassed through graduation");
  const legacy = await launch(creator, {
      cap: false,
      limit: 9000,
      duration: 1n,
    }),
    ld = await dest(legacy, alice),
    lg = await graduationAddresses(legacy.mint, 3n);
  keys.add(lg.terms);
  await trade(legacy, alice, ld, 1n);
  await trade(legacy, alice, ld, 1n, true);
  assert.equal((await state(legacy)).sold, 0n);
  await denied(
    initializeGraduationInstruction({
      ...legacy,
      ...lg,
      creator: creator.payer,
      maxPriceGapBps: 60,
    }),
    1604,
    "no retroactive redemption cutoff after a complete round trip",
  );
  pass("unopted older V5 redemption rights remain unchanged");
  return evidence;
}
