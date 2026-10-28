import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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
  CUSTODY_PROGRAM_ADDRESS,
  initializeCustodyInstruction,
  initializeOpeningInstruction,
  quoteCurveCost,
} from "../src/lib/launch-custody.ts";
import {
  decodeFeeState,
  claimFeeInstruction,
  feeBuyInstruction,
} from "../src/lib/launch-fees.ts";
import {
  initializeMarketInstruction,
  marketQuoteInstruction,
  marketTradeInstruction,
  decodeMarketQuote,
  decodeMarketState,
  marketFeeOracle,
  redemptionOracle,
} from "../src/lib/launch-market.ts";
export async function runMarketTests({ local = false } = {}) {
  const program = local
    ? address("8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo")
    : CUSTODY_PROGRAM_ADDRESS;
  const evidence = {
      positives: [],
      rejections: [],
      launches: [],
      trades: [],
      claims: [],
    },
    launches = [],
    wallets = [];
  async function rpc(method, params) {
    const r = await fetch("http://127.0.0.1:8899", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const b = await r.json();
    assert.ok(!b.error, JSON.stringify(b));
    return b.result;
  }
  const raw = async (k) =>
    (
      await rpc("getAccountInfo", [
        k,
        { encoding: "base64", commitment: "confirmed" },
      ])
    ).value;
  const balance = async (k) =>
    BigInt((await rpc("getBalance", [k, { commitment: "confirmed" }])).value);
  const tokens = async (k) =>
    BigInt(
      (await rpc("getTokenAccountBalance", [k, { commitment: "confirmed" }]))
        .value.amount,
    );
  const state = async (l) =>
    decodeMarketState(Buffer.from((await raw(l.curve)).data[0], "base64"));
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
  const ix = (v) => ({ ...v, programAddress: program });
  async function client() {
    const c = await createClient()
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
    wallets.push(c.payer.address);
    return c;
  }
  const sponsor = await client(),
    alice = await client(),
    bob = await client(),
    creator = await client(),
    creator2 = await client();
  function pass(label) {
    evidence.positives.push(label);
    console.log("PASS market: " + label);
  }
  async function snapshot() {
    const keys = [
      ...wallets.filter((k) => k !== sponsor.payer.address),
      ...launches.flatMap((l) => [
        l.mint,
        l.custody,
        l.opening,
        l.curve,
        l.platformVault,
        l.creatorVault,
        l.vault,
        l.creatorAta,
        ...l.destinations,
        ...l.receipts,
      ]),
    ];
    const values = [];
    for (let n = 0; n < keys.length; n += 50)
      values.push(
        ...(
          await rpc("getMultipleAccounts", [
            keys.slice(n, n + 50),
            { encoding: "base64", commitment: "confirmed" },
          ])
        ).value,
      );
    return values;
  }
  async function denied(instructions, code, label) {
    const before = await snapshot();
    const old = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0]?.signature;
    let caught;
    try {
      await sponsor.sendTransaction(
        Array.isArray(instructions) ? instructions : [instructions],
      );
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, label + " succeeded");
    const detail = JSON.stringify(caught, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    assert.ok(detail.includes('"code":' + code), label + ": " + detail);
    assert.deepEqual(
      await snapshot(),
      before,
      label + " changed protected state",
    );
    const ref = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0];
    assert.ok(ref.err && ref.signature !== old);
    evidence.rejections.push({
      label,
      code,
      signature: ref.signature,
      slot: ref.slot,
    });
    console.log(
      `PASS market rejection: ${label} (${code}); all SOL/tokens/state unchanged`,
    );
  }
  async function launch(owner, options = {}) {
    const {
        base = 10000n,
        slope = 10n,
        cap = true,
        duration = 100000n,
        delay = 0n,
        decimals = 0,
      } = options,
      mint = await generateKeyPairSigner(),
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
      [owner.payer.address, 20n * scale],
      [custody, 980n * scale],
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
    const [creatorAta] = await findAssociatedTokenPda({
        mint: mint.address,
        owner: owner.payer.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
      [vault] = await findAssociatedTokenPda({
        mint: mint.address,
        owner: custody,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
    const l = {
      mint: mint.address,
      scale,
      custody,
      opening,
      curve,
      platformVault,
      creatorVault,
      vault,
      creatorAta,
      creator: owner.payer,
      destinations: [],
      receipts: [],
      trades: [],
    };
    launches.push(l);
    await owner.sendTransaction([
      ix(
        initializeCustodyInstruction({
          payer: owner.payer,
          mint: l.mint,
          creator: owner.payer.address,
          creatorTokenAccount: creatorAta,
          custody,
          vault,
          creatorAmount: 20n * scale,
          inventoryAmount: 980n * scale,
        }),
      ),
      ix(
        initializeOpeningInstruction({
          payer: owner.payer,
          mint: l.mint,
          custody,
          opening,
          capBps: 200,
          enabled: cap,
          durationSlots: 1000000n,
        }),
      ),
      ix(
        initializeMarketInstruction({
          payer: owner.payer,
          creator: owner.payer,
          mint: l.mint,
          custody,
          opening,
          curve,
          vault,
          platformVault,
          creatorVault,
          basePrice: base,
          slope,
          protection: {
            delaySlots: delay,
            durationSlots: duration,
            limitBps: 100,
          },
        }),
      ),
    ]);
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
    assert.equal((await state(l)).sequence, 0n);
    pass(
      "explicit V4 initializes isolated market, immutable creator and zero fee carry",
    );
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
      }),
      [r] = await derive(
        "buyer",
        l.mint,
        getAddressEncoder().encode(c.payer.address),
      );
    if (!l.destinations.includes(d)) l.destinations.push(d);
    if (!l.receipts.includes(r)) l.receipts.push(r);
    return d;
  }
  async function alternate(l, owner) {
    const signer = await generateKeyPairSigner(), data = new Uint8Array(52), v = new DataView(data.buffer);
    v.setUint32(0, 0, true);
    v.setBigUint64(4, BigInt(await rpc("getMinimumBalanceForRentExemption", [165])), true);
    v.setBigUint64(12, 165n, true);
    data.set(getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS), 20);
    await sponsor.sendTransaction([
      { programAddress: address("11111111111111111111111111111111"), data, accounts: [
        { address: sponsor.payer.address, role: AccountRole.WRITABLE_SIGNER, signer: sponsor.payer },
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      ] },
      sponsor.token.instructions.initializeAccount3({ account: signer.address, mint: l.mint, owner: owner.payer.address }),
    ]);
    l.destinations.push(signer.address);
    return signer.address;
  }
  async function quote(l, n, sell = false) {
    const before = await snapshot(),
      sent = await sponsor.sendTransaction([
        ix(marketQuoteInstruction({ ...l, amount: n, sell })),
      ]),
      tx = await rpc("getTransaction", [
        String(sent.context.signature),
        {
          encoding: "json",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        },
      ]);
    assert.equal(tx.meta.err, null);
    assert.equal(tx.meta.returnData.programId, program);
    const q = decodeMarketQuote(
        Buffer.from(tx.meta.returnData.data[0], "base64"),
      ),
      s = await state(l),
      p = await fee(l.platformVault),
      c = await fee(l.creatorVault);
    assert.equal(
      q.raw,
      sell
        ? redemptionOracle(s, n)
        : quoteCurveCost({ ...s, collected: s.reserve }, n),
    );
    const parts = marketFeeOracle(q.raw, p.accrued, c.accrued);
    assert.equal(q.platform, parts.platform);
    assert.equal(q.creator, parts.creator);
    assert.equal(q.user, sell ? q.raw - parts.total : q.raw + parts.total);
    assert.equal(q.sequence, s.sequence);
    assert.deepEqual(await snapshot(), before);
    return q;
  }
  async function tradeIx(l, c, d, q, sell = false, bound = q.user) {
    const [receipt] = await derive(
      "buyer",
      l.mint,
      getAddressEncoder().encode(c.payer.address),
    );
    return ix(
      marketTradeInstruction({
        ...l,
        buyer: c.payer,
        destination: d,
        receipt,
        amount: q.amount,
        expectedSold: q.sold,
        quotedCost: q.raw,
        maxCost: bound,
        sequence: q.sequence,
        sell,
      }),
    );
  }
  async function trade(l, c, d, n, sell = false) {
    const q = await quote(l, n, sell),
      s = await state(l),
      p = await fee(l.platformVault),
      cr = await fee(l.creatorVault),
      sol = await balance(c.payer.address),
      reserve = await balance(l.curve),
      oldTokens = await tokens(d),
      [r] = await derive(
        "buyer",
        l.mint,
        getAddressEncoder().encode(c.payer.address),
      ),
      beforeReceipt = await raw(r);
    const sent = await sponsor.sendTransaction([
        await tradeIx(l, c, d, q, sell),
      ]),
      after = await state(l),
      receipt = await raw(r);
    const rent = sell
      ? 0n
      : BigInt(receipt.lamports) - BigInt(beforeReceipt?.lamports ?? 0);
    assert.equal(
      (await balance(c.payer.address)) - sol,
      sell ? q.user : -q.user - rent,
    );
    assert.equal((await balance(l.curve)) - reserve, sell ? -q.raw : q.raw);
    assert.equal((await tokens(d)) - oldTokens, sell ? -n : n);
    assert.equal(after.sold, sell ? s.sold - n : s.sold + n);
    assert.equal(after.sequence, s.sequence + 1n);
    assert.equal(after.reserve, sell ? s.reserve - q.raw : s.reserve + q.raw);
    assert.equal((await fee(l.platformVault)).accrued - p.accrued, q.platform);
    assert.equal((await fee(l.creatorVault)).accrued - cr.accrued, q.creator);
    if (sell)
      assert.deepEqual(
        receipt,
        beforeReceipt,
        "sell must not reset any gross wallet receipt",
      );
    const item = { sell, ...q, signature: String(sent.context.signature) };
    l.trades.push(item);
    evidence.trades.push(item);
    pass(
      `${sell ? "sell" : "buy"} ${n}: exact quote, fees, SOL, tokens, sequence and gross receipt accounting`,
    );
    return q;
  }
  async function expired(l) {
    const s = await state(l);
    for (let j = 0; j < 100; j++) {
      if (BigInt(await rpc("getSlot", [{ commitment: "processed" }])) >= s.end)
        return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Opening expiry timeout");
  }
  const main = await launch(creator),
    a = await dest(main, alice),
    b = await dest(main, bob);
  const initialBuy = await quote(main, 4n);
  await trade(main, alice, a, 4n);
  const altMain = await alternate(main, alice), batchFirst = await quote(main, 4n),
    batchState = await state(main), batchP = await fee(main.platformVault), batchC = await fee(main.creatorVault),
    nextRaw = quoteCurveCost({ ...batchState, sold: batchState.sold + 4n }, 4n),
    nextFees = marketFeeOracle(nextRaw, batchP.accrued + batchFirst.platform, batchC.accrued + batchFirst.creator),
    batchSecond = { ...batchFirst, raw: nextRaw, user: nextRaw + nextFees.total, sold: batchFirst.sold + 4n, sequence: batchFirst.sequence + 1n };
  await denied([
    await tradeIx(main, alice, a, batchFirst),
    await tradeIx(main, alice, altMain, batchSecond),
  ], 1201, "V4 correctly sequenced multi-instruction alternate-account opening overflow rolls back the first buy");
  await denied(await tradeIx(main, bob, b, await quote(main, 21n)), 1005, "V4 ordinary wallet cap applies before the protected opening limit");
  await trade(main, alice, a, 6n);
  await trade(main, alice, a, 3n, true);
  await denied(
    await tradeIx(main, alice, a, await quote(main, 1n)),
    1201,
    "selling never resets cumulative protected opening allowance",
  );
  await trade(main, bob, b, 3n);
  await trade(main, bob, b, 1n, true);
  await trade(main, bob, b, 2n, true);
  await trade(main, alice, a, 7n, true);
  assert.equal((await state(main)).sold, 0n);
  assert.equal((await state(main)).reserve, 0n);
  pass(
    "full redemption restores inventory and drains only raw reserve above rent",
  );
  await denied(
    await tradeIx(main, alice, a, initialBuy),
    1404,
    "ABA net cursor cannot revive a stale quote because sequence changed",
  );
  await denied(
    ix(marketQuoteInstruction({ ...main, amount: 1n, sell: true })),
    1403,
    "redemption below zero net inventory",
  );
  const normal = await launch(creator2, { cap: false, duration: 1n }),
    na = await dest(normal, alice),
    nb = await dest(normal, bob);
  await expired(normal);
  await trade(normal, alice, na, 20n);
  let sellQ = await quote(normal, 1n, true);
  await denied(
    await tradeIx(normal, alice, na, sellQ, true, sellQ.user + 1n),
    1408,
    "minimum sell output one lamport too high",
  );
  await denied(
    await tradeIx(normal, bob, nb, sellQ, true),
    1413,
    "insufficient seller token balance",
  );
  const valid = await tradeIx(normal, alice, na, sellQ, true);
  for (const [at, key, code, label] of [
    [1, main.mint, 1003, "mint substitution"],
    [2, main.custody, 1003, "custody substitution"],
    [3, main.vault, 1401, "custody token vault substitution"],
    [4, a, 1401, "seller token mint substitution"],
    [4, nb, 1401, "seller token owner substitution"],
    [5, main.opening, 1401, "opening state substitution"],
    [
      6,
      (
        await derive(
          "buyer",
          normal.mint,
          getAddressEncoder().encode(bob.payer.address),
        )
      )[0],
      1401,
      "wallet receipt substitution",
    ],
    [9, main.curve, 1401, "curve substitution"],
    [10, main.platformVault, 1302, "platform fee vault substitution"],
    [11, main.creatorVault, 1302, "creator fee vault substitution"],
    [7, TOKEN_PROGRAM_ADDRESS, 1401, "wrong system program"],
    [
      8,
      address("11111111111111111111111111111111"),
      1401,
      "wrong executable token program",
    ],
  ])
    await denied(
      {
        ...valid,
        accounts: valid.accounts.map((v, i) =>
          i === at ? { address: key, role: v.role } : v,
        ),
      },
      code,
      label,
    );
  await denied(
    {
      ...valid,
      accounts: valid.accounts.map((v, i) =>
        i === 0
          ? { address: alice.payer.address, role: AccountRole.WRITABLE }
          : v,
      ),
    },
    1402,
    "unsigned seller",
  );
  const zero = { ...valid, data: valid.data.slice() };
  new DataView(zero.data.buffer).setBigUint64(1, 0n, true);
  await denied(zero, 1403, "zero redemption");
  await denied(
    { ...valid, data: valid.data.slice(0, 33) },
    1400,
    "legacy-shaped sell payload rejected",
  );
  const badAfter = { ...sellQ, sequence: sellQ.sequence };
  await denied(
    [valid, await tradeIx(normal, alice, na, badAfter, true)],
    1404,
    "duplicate sell instructions roll back the first token return and payout",
  );
  const buyQ = await quote(normal, 1n);
  await denied(
    [valid, await tradeIx(normal, alice, na, buyQ, false)],
    1404,
    "mixed sell/buy stale ordering rolls back all accounts",
  );
  await trade(normal, alice, na, 5n, true);
  await trade(normal, bob, nb, 3n);
  await trade(normal, bob, nb, 3n, true);
  await trade(normal, alice, na, 15n, true);
  await trade(normal, alice, na, 600n);
  await trade(normal, alice, na, 600n, true);
  await trade(normal, alice, na, 600n);
  assert.equal(
    Buffer.from((await raw(normal.opening)).data[0], "base64").readBigUInt64LE(
      97,
    ),
    1223n,
  );
  pass(
    "gross cap counter may exceed initial inventory after returns; net inventory remains bounded",
  );
  await trade(normal, alice, na, 600n, true);
  await trade(normal, alice, na, 10n);
  const raceBuy = await quote(normal, 1n),
    raceSell = await quote(normal, 1n, true),
    beforeRace = await state(normal),
    beforeAlice = await balance(alice.payer.address),
    beforeP = await fee(normal.platformVault),
    beforeC = await fee(normal.creatorVault);
  const race = await Promise.allSettled([
    sponsor.sendTransaction([await tradeIx(normal, alice, na, raceBuy)]),
    sponsor.sendTransaction([await tradeIx(normal, alice, na, raceSell, true)]),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const winner = race[0].status === "fulfilled" ? raceBuy : raceSell,
    isSell = race[1].status === "fulfilled",
    failure = race.find((r) => r.status === "rejected");
  assert.ok(
    JSON.stringify(failure, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ).includes('"code":1404'),
  );
  const raced = await state(normal);
  assert.equal(raced.sequence, beforeRace.sequence + 1n);
  assert.equal(raced.sold, beforeRace.sold + (isSell ? -1n : 1n));
  assert.equal(
    (await balance(alice.payer.address)) - beforeAlice,
    isSell ? winner.user : -winner.user,
  );
  assert.equal(
    (await fee(normal.platformVault)).accrued - beforeP.accrued,
    winner.platform,
  );
  assert.equal(
    (await fee(normal.creatorVault)).accrued - beforeC.accrued,
    winner.creator,
  );
  normal.trades.push({
    sell: isSell,
    ...winner,
    signature: String(
      race.find((r) => r.status === "fulfilled").value.context.signature,
    ),
  });
  const raceRef = (
    await rpc("getSignaturesForAddress", [
      sponsor.payer.address,
      { limit: 2, commitment: "confirmed" },
    ])
  ).find((r) => r.err);
  assert.ok(raceRef);
  evidence.rejections.push({
    label: "concurrent buy/sell losing quote",
    code: 1404,
    signature: raceRef.signature,
    slot: raceRef.slot,
  });
  pass(
    "concurrent buy/sell race permits exactly one sequence update and one economic transfer",
  );
  await trade(normal, alice, na, raced.sold, true);
  await trade(normal, alice, na, 10n);
  async function raceTrades(entries, label) {
    const before = await state(normal),
      p = await fee(normal.platformVault),
      c = await fee(normal.creatorVault),
      solA = await balance(alice.payer.address),
      solB = await balance(bob.payer.address);
    const results = await Promise.allSettled(
      entries.map(async (e) =>
        sponsor.sendTransaction([
          await tradeIx(normal, e.wallet, e.destination, e.q, e.sell),
        ]),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const winner = results.findIndex((r) => r.status === "fulfilled"),
      e = entries[winner],
      s = await state(normal);
    assert.equal(s.sequence, before.sequence + 1n);
    assert.equal(s.sold, before.sold + (e.sell ? -1n : 1n));
    assert.equal(
      (await fee(normal.platformVault)).accrued - p.accrued,
      e.q.platform,
    );
    assert.equal(
      (await fee(normal.creatorVault)).accrued - c.accrued,
      e.q.creator,
    );
    assert.equal(
      (await balance(alice.payer.address)) - solA,
      e.wallet === alice ? (e.sell ? e.q.user : -e.q.user) : 0n,
    );
    assert.equal(
      (await balance(bob.payer.address)) - solB,
      e.wallet === bob ? (e.sell ? e.q.user : -e.q.user) : 0n,
    );
    const rejected = results.find((r) => r.status === "rejected");
    assert.ok(
      JSON.stringify(rejected, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ).includes('"code":1404'),
    );
    const ref = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 2, commitment: "confirmed" },
      ])
    ).find((r) => r.err);
    assert.ok(ref);
    evidence.rejections.push({
      label: label + " losing quote",
      code: 1404,
      signature: ref.signature,
      slot: ref.slot,
    });
    const item = {
      sell: !!e.sell,
      ...e.q,
      signature: String(results[winner].value.context.signature),
    };
    normal.trades.push(item);
    evidence.trades.push(item);
    pass(
      label +
        ": exactly one economic update, losing transaction cannot alter protected state",
    );
  }
  const bothBuy = await quote(normal, 1n);
  await raceTrades(
    [
      { wallet: alice, destination: na, q: bothBuy },
      { wallet: bob, destination: nb, q: bothBuy },
    ],
    "concurrent buyers",
  );
  await sponsor.sendTransaction([
    await sponsor.token.instructions.transferChecked({
      source: na,
      mint: normal.mint,
      destination: nb,
      authority: alice.payer,
      amount: 1n,
      decimals: 0,
    }),
  ]);
  const bothSell = await quote(normal, 1n, true);
  await raceTrades(
    [
      { wallet: alice, destination: na, q: bothSell, sell: true },
      { wallet: bob, destination: nb, q: bothSell, sell: true },
    ],
    "concurrent sellers",
  );
  for (const [wallet, destination] of [
    [alice, na],
    [bob, nb],
  ]) {
    const n = await tokens(destination);
    if (n > 0n) await trade(normal, wallet, destination, n, true);
  }
  const completion = await launch(creator, { cap: false, duration: 1n }),
    cd = await dest(completion, alice);
  await expired(completion);
  await trade(completion, alice, cd, 979n);
  assert.equal((await state(completion)).completed, false);
  await trade(completion, alice, cd, 1n);
  assert.equal((await state(completion)).completed, true);
  pass("exact final base unit sets irreversible completion once");
  await denied(
    ix(marketQuoteInstruction({ ...completion, amount: 1n })),
    1403,
    "one unit over sold-out inventory quote",
  );
  const terminal = {
    ...(await quote(completion, 1n, true)),
    raw: 1n,
    user: 1n,
  };
  await denied(
    await tradeIx(completion, alice, cd, terminal),
    1405,
    "completed market rejects continued buys",
  );
  await trade(completion, alice, cd, 1n, true);
  await denied(
    await tradeIx(completion, alice, cd, {
      ...terminal,
      sold: 979n,
      sequence: (await state(completion)).sequence,
    }),
    1405,
    "redemption cannot reopen a completed curve",
  );
  const dust = await launch(creator2, {
      base: 1n,
      slope: 0n,
      cap: false,
      duration: 1n,
    }),
    dd = await dest(dust, bob);
  await expired(dust);
  for (let n = 0; n < 4; n++) await trade(dust, bob, dd, 1n);
  const dp = await fee(dust.platformVault),
    dc = await fee(dust.creatorVault);
  assert.equal(dp.accrued, 3n);
  assert.equal(dc.accrued, 1n);
  pass(
    "four one-lamport buys charge exactly four fee lamports and allocate exactly 3:1",
  );
  await denied(
    ix(marketQuoteInstruction({ ...dust, amount: 1n, sell: true })),
    1409,
    "dust redemption with zero net proceeds is rejected",
  );
  await trade(dust, bob, dd, 4n, true);
  const creatorFees = await fee(main.creatorVault),
    claim = ix(
      claimFeeInstruction({
        beneficiary: creator.payer,
        mint: main.mint,
        custody: main.custody,
        curve: main.curve,
        feeVault: main.creatorVault,
        kind: 1,
        amount: creatorFees.claimable,
      }),
    ),
    beforeReserve = await raw(main.curve),
    creatorSolBefore = await balance(creator.payer.address);
  const creatorClaimTx = await sponsor.sendTransaction([claim]);
  assert.equal((await balance(creator.payer.address)) - creatorSolBefore, creatorFees.claimable);
  evidence.claims.push({ kind: 1, mint: main.mint, amount: creatorFees.claimable, signature: String(creatorClaimTx.context.signature) });
  assert.deepEqual(await raw(main.curve), beforeReserve);
  assert.equal((await fee(main.creatorVault)).claimable, 0n);
  pass("V4 creator claim preserves redeemable reserves and net price");
  if (local) {
    const treasury = await createKeyPairSignerFromPrivateKeyBytes(
      new Uint8Array(32).fill(42),
    );
    wallets.push(treasury.address);
    const funding = await rpc("requestAirdrop", [treasury.address, 1000000000]);
    let funded = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = (await rpc("getSignatureStatuses", [[funding]])).value[0];
      if (status && ["confirmed", "finalized"].includes(status.confirmationStatus)) {
        assert.equal(status.err, null);
        funded = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(funded, "Local treasury faucet transaction did not confirm");
    const p = await fee(main.platformVault), treasurySolBefore = await balance(treasury.address);
    const treasuryClaimTx = await sponsor.sendTransaction([
      ix(
        claimFeeInstruction({
          beneficiary: treasury,
          mint: main.mint,
          custody: main.custody,
          curve: main.curve,
          feeVault: main.platformVault,
          kind: 0,
          amount: p.claimable,
        }),
      ),
    ]);
    assert.equal((await balance(treasury.address)) - treasurySolBefore, p.claimable);
    evidence.claims.push({ kind: 0, mint: main.mint, amount: p.claimable, signature: String(treasuryClaimTx.context.signature) });
    assert.equal((await fee(main.platformVault)).claimable, 0n);
    assert.deepEqual(await raw(main.curve), beforeReserve);
    pass("V4 authorized isolated treasury claim cannot deplete sell reserves");
  }
  const fractional = await launch(creator2, {
      decimals: 2,
      cap: false,
      duration: 1n,
    }),
    fractionDest = await dest(fractional, bob);
  await expired(fractional);
  await trade(fractional, bob, fractionDest, 1n);
  await trade(fractional, bob, fractionDest, 1n);
  await trade(fractional, bob, fractionDest, 2n, true);
  assert.equal((await state(fractional)).reserve, 1n);
  pass(
    "fractional base-unit inverse retains exactly one explicit lamport of rounding reserve",
  );
  const timed = await launch(creator, { delay: 200n }),
    timedDest = await dest(timed, alice),
    timedBuy = await quote(timed, 1n);
  await denied(
    await tradeIx(timed, alice, timedDest, timedBuy),
    1200,
    "V4 opening buy before on-chain launch start",
  );
  const [timedCreatorReceipt] = await derive(
    "buyer",
    timed.mint,
    getAddressEncoder().encode(creator.payer.address),
  );
  timed.receipts.push(timedCreatorReceipt);
  await denied(
    await tradeIx(
      timed,
      creator,
      timed.creatorAta,
      { amount: 1n, sold: 0n, sequence: 0n, raw: 1n, user: 1n },
      true,
      0n,
    ),
    1200,
    "V4 creator has no pre-launch redemption exemption",
  );
  const counter = await launch(creator2, {
      base: 2000000n,
      slope: 0n,
      cap: false,
      duration: 1n,
    }),
    counterDest = await dest(counter, alice);
  await expired(counter);
  await trade(counter, alice, counterDest, 1n);
  await trade(counter, alice, counterDest, 1n, true);
  const poor = await generateKeyPairSigner();
  wallets.push(poor.address);
  const poorClient = { payer: poor },
    poorDest = await dest(counter, poorClient),
    poorQuote = await quote(counter, 1n),
    data = new Uint8Array(12),
    view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, poorQuote.user, true);
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
        { address: poor.address, role: AccountRole.WRITABLE },
      ],
    },
  ]);
  await denied(
    await tradeIx(counter, poorClient, poorDest, poorQuote),
    1,
    "failed receipt-rent CPI reverses all V4 payments and fee credits",
  );
  const capped = await launch(creator, { duration: 1n }), cappedAta = await dest(capped, alice), cappedAlt = await alternate(capped, alice);
  await expired(capped);
  await trade(capped, alice, cappedAta, 10n);
  await trade(capped, alice, cappedAlt, 10n);
  await denied(await tradeIx(capped, alice, cappedAlt, await quote(capped, 1n)), 1005, "V4 post-opening alternate accounts share the exact ordinary wallet cap");
  await trade(capped, alice, cappedAlt, 1n, true);
  await denied(await tradeIx(capped, alice, cappedAta, await quote(capped, 1n)), 1005, "V4 post-opening redemption never resets the cumulative wallet cap");
  const legacy = ix(
    feeBuyInstruction({
      ...main,
      buyer: bob.payer,
      destination: b,
      receipt: (
        await derive(
          "buyer",
          main.mint,
          getAddressEncoder().encode(bob.payer.address),
        )
      )[0],
      amount: 1n,
      expectedSold: 0n,
      quotedCost: 1n,
      maxCost: 2n,
    }),
  );
  await denied(
    legacy,
    1102,
    "V3 buy entry point cannot bypass V4 sequence and fee policy",
  );
  for (const l of launches) {
    const s = await state(l),
      p = await fee(l.platformVault),
      c = await fee(l.creatorVault);
    let distributed = 0n;
    for (const d of l.destinations) distributed += await tokens(d);
    const initialCreator = await tokens(l.creatorAta),
      inventory = await tokens(l.vault);
    assert.equal(initialCreator + inventory + distributed, 1000n * l.scale);
    assert.equal(s.rawIn - s.rawOut, s.reserve);
    assert.equal(
      s.rawIn,
      l.trades.filter((t) => !t.sell).reduce((n, t) => n + t.raw, 0n),
    );
    assert.equal(
      s.rawOut,
      l.trades.filter((t) => t.sell).reduce((n, t) => n + t.raw, 0n),
    );
    assert.equal(
      p.accrued,
      l.trades.reduce((n, t) => n + t.platform, 0n),
    );
    assert.equal(
      c.accrued,
      l.trades.reduce((n, t) => n + t.creator, 0n),
    );
    assert.equal(p.accrued, p.withdrawn + p.claimable);
    assert.equal(c.accrued, c.withdrawn + c.claimable);
    assert.equal(p.accrued, (3n * (p.accrued + c.accrued) + 3n) / 4n);
    const rent = BigInt(await rpc("getMinimumBalanceForRentExemption", [245])),
      feeRent = BigInt(await rpc("getMinimumBalanceForRentExemption", [153]));
    assert.equal(await balance(l.curve), rent + s.reserve);
    assert.equal(await balance(l.platformVault), feeRent + p.claimable);
    assert.equal(await balance(l.creatorVault), feeRent + c.claimable);
    const buyExpenditure = l.trades.filter((t) => !t.sell).reduce((n, t) => n + t.user, 0n),
      sellReturns = l.trades.filter((t) => t.sell).reduce((n, t) => n + t.user, 0n);
    assert.equal(buyExpenditure, sellReturns + s.reserve + p.withdrawn + p.claimable + c.withdrawn + c.claimable);
    evidence.launches.push({
      mint: l.mint,
      buyExpenditure,
      sellReturns,
      state: s,
      creator: initialCreator,
      custody: inventory,
      buyers: distributed,
      platform: p,
      creatorFees: c,
    });
    pass(
      "exact net/gross token, raw reserve, fee liabilities and rent conservation " +
        l.mint,
    );
  }
  const feeRent = Number(await rpc("getMinimumBalanceForRentExemption", [153]));
  const fixtures = [];
  if (!local) {
    for (const [l, label, code, kind, mutate] of [
      [
        counter,
        "V4 lifetime accounting overflow rolls back payment and token CPI",
        1407,
        "buy",
        (records, bytes) => {
          const d = bytes.get(counter.curve);
          d.writeBigUInt64LE((1n << 64n) - 1n, 204);
          d.writeBigUInt64LE((1n << 64n) - 1n, 212);
        },
      ],
      [
        main,
        "V4 gross distribution invariant corruption",
        1410,
        "quote",
        (records, bytes) => {
          const d = bytes.get(main.opening);
          d.writeBigUInt64LE(d.readBigUInt64LE(97) + 1n, 97);
        },
      ],
      [
        normal,
        "V4 exhausted trade sequence rejects before transfer",
        1407,
        "buy",
        (records, bytes) => {
          bytes.get(normal.curve).writeBigUInt64LE((1n << 64n) - 1n, 228);
        },
      ],
      [
        completion,
        "V4 reserve insolvency cannot fund redemption",
        1406,
        "sellQuote",
        (records) => {
          records.get(completion.curve).lamports -= 1;
        },
      ],
      [
        dust,
        "V4 inconsistent fee allocation carry",
        1412,
        "quote",
        (records, bytes) => {
          const p = bytes.get(dust.platformVault),
            c = bytes.get(dust.creatorVault);
          for (const at of [105, 113, 121]) p.writeBigUInt64LE(0n, at);
          c.writeBigUInt64LE(1n, 105);
          c.writeBigUInt64LE(0n, 113);
          c.writeBigUInt64LE(1n, 121);
          records.get(dust.platformVault).lamports = feeRent;
          records.get(dust.creatorVault).lamports = feeRent + 1;
        },
      ],
    ]) {
      const keys = [
          l.mint,
          l.custody,
          l.opening,
          l.curve,
          l.platformVault,
          l.creatorVault,
          l.vault,
          l.creatorAta,
          ...l.destinations,
          ...l.receipts,
        ],
        records = new Map();
      for (const k of keys) {
        const value = await raw(k);
        if (value) records.set(k, { ...value, rentEpoch: 0 });
      }
      const bytes = new Map(
        [...records].map(([k, v]) => [k, Buffer.from(v.data[0], "base64")]),
      );
      const cd = bytes.get(l.curve);
      cd.writeBigUInt64LE(0n, 154);
      cd.writeBigUInt64LE(0n, 162);
      cd.writeBigUInt64LE(cd.readBigUInt64LE(170), 178);
      mutate(records, bytes);
      const accounts = [...records].map(([key, value]) => ({
        address: key,
        account: {
          pubkey: key,
          account: {
            ...value,
            data: [bytes.get(key).toString("base64"), "base64"],
          },
        },
      }));
      fixtures.push({
        label,
        code,
        kind,
        mint: l.mint,
        custody: l.custody,
        opening: l.opening,
        curve: l.curve,
        platformVault: l.platformVault,
        creatorVault: l.creatorVault,
        vault: l.vault,
        creatorAta: l.creatorAta,
        destinations: l.destinations,
        accounts,
      });
    }
  }
  if (process.env.JEET_MARKET_EVIDENCE)
    await writeFile(
      process.env.JEET_MARKET_EVIDENCE +
        (local ? "-local.json" : "-production.json"),
      JSON.stringify(
        evidence,
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ) + "\n",
    );
  console.log(
    "PASS market totals " +
      JSON.stringify({
        positive: evidence.positives.length,
        rejection: evidence.rejections.length,
      }),
  );
  return { evidence, fixtures };
}
