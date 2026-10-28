import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import {
  address,
  AccountRole,
  createClient,
  generateKeyPairSigner,
  createKeyPairSignerFromPrivateKeyBytes,
  lamports,
  getAddressEncoder,
  getProgramDerivedAddress,
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
  CUSTODY_PROGRAM_ADDRESS as PRODUCTION_PROGRAM,
  initializeCustodyInstruction as sdk_initializeCustodyInstruction,
  initializeOpeningInstruction as sdk_initializeOpeningInstruction,
  receiveInventoryInstruction as sdk_receiveInventoryInstruction,
  decodeCurveState,
  quoteCurveCost,
} from "../src/lib/launch-custody.ts";
import {
  initializeFeeCurveInstruction as sdk_initializeFeeCurveInstruction,
  feeQuoteInstruction as sdk_feeQuoteInstruction,
  feeBuyInstruction as sdk_feeBuyInstruction,
  claimFeeInstruction as sdk_claimFeeInstruction,
  decodeFeeState,
  decodeFeeQuote,
  feeAmounts,
  decodeFeeEvents,
} from "../src/lib/launch-fees.ts";
export async function runFeeTests({ local = false } = {}) {
  const CUSTODY_PROGRAM_ADDRESS = local
    ? address("8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo")
    : PRODUCTION_PROGRAM;
  const expectedTreasury = local
    ? address("2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ")
    : address("HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP");
  const derive = (seed, mint, ...extra) =>
    getProgramDerivedAddress({
      programAddress: CUSTODY_PROGRAM_ADDRESS,
      seeds: [
        new TextEncoder().encode(seed),
        getAddressEncoder().encode(mint),
        ...extra,
      ],
    });
  const findLaunchCustodyPda = (m) => derive("launch", m),
    findOpeningPda = (m) => derive("opening", m),
    findCurvePda = (m) => derive("curve", m),
    findBuyerReceiptPda = (m, w) =>
      derive("buyer", m, getAddressEncoder().encode(w)),
    findFeePda = (m, k) => derive("fee", m, new Uint8Array([k]));
  const wrap =
    (fn) =>
    (...args) => ({ ...fn(...args), programAddress: CUSTODY_PROGRAM_ADDRESS });
  const initializeCustodyInstruction = wrap(sdk_initializeCustodyInstruction),
    initializeOpeningInstruction = wrap(sdk_initializeOpeningInstruction),
    receiveInventoryInstruction = wrap(sdk_receiveInventoryInstruction),
    initializeFeeCurveInstruction = wrap(sdk_initializeFeeCurveInstruction),
    feeQuoteInstruction = wrap(sdk_feeQuoteInstruction),
    feeBuyInstruction = wrap(sdk_feeBuyInstruction),
    claimFeeInstruction = wrap(sdk_claimFeeInstruction);
  const rpcUrl = "http://127.0.0.1:8899",
    evidence = { positives: [], rejections: [], launches: [], claims: [] };
  const treasury = await createKeyPairSignerFromPrivateKeyBytes(
    new Uint8Array(32).fill(42),
  ); // Public disposable fixture; NEVER the production treasury.
  async function rpc(method, params) {
    const b = await (
      await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    ).json();
    assert.ok(!b.error, JSON.stringify(b));
    return b.result;
  }
  async function raw(k) {
    return (
      await rpc("getAccountInfo", [
        k,
        { encoding: "base64", commitment: "confirmed" },
      ])
    ).value;
  }
  async function bal(k) {
    return BigInt(
      (await rpc("getBalance", [k, { commitment: "confirmed" }])).value,
    );
  }
  async function tok(k) {
    return BigInt(
      (await rpc("getTokenAccountBalance", [k, { commitment: "confirmed" }]))
        .value.amount,
    );
  }
  async function client() {
    return createClient()
      .use(generatedPayer())
      .use(
        solanaRpc({
          rpcUrl,
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
    alice = await client(),
    bob = await client(),
    creatorA = await client(),
    creatorB = await client();
  const launches = [],
    extraWallets = [];
  if (local) {
    await rpc("requestAirdrop", [treasury.address, 1000000000]);
    while ((await bal(treasury.address)) === 0n)
      await new Promise((r) => setTimeout(r, 100));
  }
  function pass(label) {
    evidence.positives.push(label);
    console.log("PASS fees: " + label);
  }
  async function fee(k) {
    return decodeFeeState(Buffer.from((await raw(k)).data[0], "base64"));
  }
  async function launch(c, base = 10000n, slope = 10n) {
    const mint = await generateKeyPairSigner();
    await c.token.instructions
      .createMint({
        newMint: mint,
        decimals: 0,
        mintAuthority: c.payer.address,
        freezeAuthority: c.payer.address,
      })
      .sendTransaction();
    const [custody] = await findLaunchCustodyPda(mint.address),
      [opening] = await findOpeningPda(mint.address),
      [curve] = await findCurvePda(mint.address),
      [platformVault] = await findFeePda(mint.address, 0),
      [creatorVault] = await findFeePda(mint.address, 1);
    await c.token.instructions
      .mintToATA({
        mint: mint.address,
        owner: c.payer.address,
        mintAuthority: c.payer,
        amount: 20n,
        decimals: 0,
      })
      .sendTransaction();
    await c.token.instructions
      .mintToATA({
        mint: mint.address,
        owner: custody,
        mintAuthority: c.payer,
        amount: 980n,
        decimals: 0,
      })
      .sendTransaction();
    const [creatorAta] = await findAssociatedTokenPda({
        mint: mint.address,
        owner: c.payer.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
      [vault] = await findAssociatedTokenPda({
        mint: mint.address,
        owner: custody,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
    const l = {
      mint: mint.address,
      custody,
      opening,
      curve,
      platformVault,
      creatorVault,
      vault,
      creatorAta,
      creator: c.payer,
      destinations: [],
      receipts: [],
      buys: [],
    };
    launches.push(l);
    const initialization = [
      initializeCustodyInstruction({
        payer: c.payer,
        mint: l.mint,
        creator: c.payer.address,
        creatorTokenAccount: creatorAta,
        custody,
        vault,
        creatorAmount: 20n,
        inventoryAmount: 980n,
      }),
      initializeOpeningInstruction({
        payer: c.payer,
        mint: l.mint,
        custody,
        opening,
        capBps: 200,
        enabled: true,
        durationSlots: 1000000n,
      }),
      initializeFeeCurveInstruction({
        payer: c.payer,
        creator: c.payer,
        mint: l.mint,
        custody,
        opening,
        curve,
        vault,
        platformVault,
        creatorVault,
        basePrice: base,
        slope,
        protection: { delaySlots: 0n, durationSlots: 100000n, limitBps: 100 },
      }),
    ];
    if (base === 10000n) {
      const wrongCreator = {
        ...initialization[2],
        accounts: initialization[2].accounts.map((v, i) =>
          i === 9
            ? {
                address: bob.payer.address,
                role: AccountRole.READONLY_SIGNER,
                signer: bob.payer,
              }
            : v,
        ),
      };
      await denied(
        [...initialization.slice(0, 2), wrongCreator],
        1304,
        "fee initialization requires immutable custody creator signature",
      );
      const fakeVault = {
        ...initialization[2],
        accounts: initialization[2].accounts.map((v, i) =>
          i === 7
            ? { address: bob.payer.address, role: AccountRole.WRITABLE }
            : v,
        ),
      };
      await denied(
        [...initialization.slice(0, 2), fakeVault],
        1302,
        "invalid platform vault during initialization",
      );
      const badConfig = {
        ...initialization[2],
        data: new Uint8Array(initialization[2].data),
      };
      new DataView(badConfig.data.buffer).setBigUint64(25, 0n, true);
      await denied(
        [...initialization.slice(0, 2), badConfig],
        1202,
        "fee version preserves invalid protected-duration rejection",
      );
      const redirect = { ...initialization[2], data: new Uint8Array(67) };
      redirect.data.set(initialization[2].data);
      redirect.data.set(getAddressEncoder().encode(bob.payer.address), 35);
      await denied(
        [...initialization.slice(0, 2), redirect],
        1100,
        "caller cannot append treasury rotation or redirection configuration",
      );
    }
    await c.sendTransaction(initialization);
    await c.sendTransaction([
      c.token.instructions.setAuthority({
        owned: l.mint,
        owner: c.payer,
        authorityType: AuthorityType.MintTokens,
        newAuthority: null,
      }),
      c.token.instructions.setAuthority({
        owned: l.mint,
        owner: c.payer,
        authorityType: AuthorityType.FreezeAccount,
        newAuthority: null,
      }),
    ]);
    const p = await fee(platformVault),
      cr = await fee(creatorVault);
    assert.equal(p.beneficiary, expectedTreasury);
    assert.equal(cr.beneficiary, c.payer.address);
    assert.equal(p.claimable, 0n);
    pass("immutable isolated fee entitlement " + l.mint);
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
    const [r] = await findBuyerReceiptPda(l.mint, c.payer.address);
    if (!l.destinations.includes(d)) l.destinations.push(d);
    if (!l.receipts.includes(r)) l.receipts.push(r);
    return d;
  }
  async function alternate(l, c) {
    const signer = await generateKeyPairSigner(),
      data = new Uint8Array(52),
      view = new DataView(data.buffer);
    view.setUint32(0, 0, true);
    view.setBigUint64(
      4,
      BigInt(await rpc("getMinimumBalanceForRentExemption", [165])),
      true,
    );
    view.setBigUint64(12, 165n, true);
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
      await sponsor.token.instructions.initializeAccount3({
        account: signer.address,
        mint: l.mint,
        owner: c.payer.address,
      }),
    ]);
    l.destinations.push(signer.address);
    return signer.address;
  }
  async function quote(l, n) {
    const before = await raw(l.curve);
    const sent = await sponsor.sendTransaction([
      feeQuoteInstruction({ ...l, amount: n }),
    ]);
    const tx = await rpc("getTransaction", [
      String(sent.context.signature),
      {
        encoding: "json",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ]);
    assert.equal(tx.meta.err, null);
    const q = decodeFeeQuote(Buffer.from(tx.meta.returnData.data[0], "base64"));
    assert.equal(q.amount, n);
    assert.equal(
      q.raw,
      quoteCurveCost(
        decodeCurveState(Buffer.from(before.data[0], "base64")),
        n,
      ),
    );
    assert.deepEqual(await raw(l.curve), before);
    return q;
  }
  async function ix(l, c, d, q, maximum = q.total) {
    const [receipt] = await findBuyerReceiptPda(l.mint, c.payer.address);
    return feeBuyInstruction({
      ...l,
      buyer: c.payer,
      destination: d,
      receipt,
      amount: q.amount,
      expectedSold: q.sold,
      quotedCost: q.raw,
      maxCost: maximum,
    });
  }
  async function snapshot() {
    const keys = [
      treasury.address,
      ...extraWallets,
      alice.payer.address,
      bob.payer.address,
      creatorA.payer.address,
      creatorB.payer.address,
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
    const result = [];
    for (let i = 0; i < keys.length; i += 50) {
      const values = (
        await rpc("getMultipleAccounts", [
          keys.slice(i, i + 50),
          { encoding: "base64", commitment: "confirmed" },
        ])
      ).value;
      result.push(...values.map((v, j) => [keys[i + j], v]));
    }
    return result;
  }
  async function denied(instructions, code, label) {
    const before = await snapshot();
    const oldSig = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0]?.signature;
    let error;
    try {
      await sponsor.sendTransaction(
        Array.isArray(instructions) ? instructions : [instructions],
      );
    } catch (e) {
      error = e;
    }
    assert.ok(error, label + " succeeded");
    const detail = JSON.stringify(error, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    if (code !== null)
      assert.ok(detail.includes('"code":' + code), label + ": " + detail);
    assert.deepEqual(
      await snapshot(),
      before,
      label + " changed business balances/state",
    );
    const ref = (
      await rpc("getSignaturesForAddress", [
        sponsor.payer.address,
        { limit: 1, commitment: "confirmed" },
      ])
    )[0];
    assert.ok(
      ref && ref.signature !== oldSig && ref.err,
      label + " did not execute a rejected transaction",
    );
    evidence.rejections.push({
      label,
      code,
      signature: ref.signature,
      slot: ref.slot,
      error: ref.err,
    });
    console.log(
      "PASS fees rejected: " +
        label +
        " (" +
        code +
        "); all state and balances unchanged",
    );
  }
  async function buy(l, c, d, n) {
    const q = await quote(l, n),
      [receipt] = await findBuyerReceiptPda(l.mint, c.payer.address);
    const buyerBefore = await bal(c.payer.address),
      reserve = await bal(l.curve),
      p = await fee(l.platformVault),
      cr = await fee(l.creatorVault),
      rent = BigInt((await raw(receipt))?.lamports ?? 0),
      tokens = await tok(d);
    const sent = await sponsor.sendTransaction([await ix(l, c, d, q)]);
    const confirmed = await rpc("getTransaction", [
      String(sent.context.signature),
      {
        encoding: "json",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    assert.equal(confirmed.meta.err, null);
    const event = decodeFeeEvents(
      confirmed.meta.logMessages,
      CUSTODY_PROGRAM_ADDRESS,
    ).find((e) => e.type === "trade");
    assert.deepEqual(event, {
      type: "trade",
      mint: l.mint,
      buyer: c.payer.address,
      raw: q.raw,
      platform: q.platform,
      creator: q.creator,
      total: q.total,
    });
    const receiptRent = BigInt((await raw(receipt)).lamports);
    assert.equal(
      buyerBefore - (await bal(c.payer.address)),
      q.total + receiptRent - rent,
    );
    assert.equal((await bal(l.curve)) - reserve, q.raw);
    assert.equal((await fee(l.platformVault)).accrued - p.accrued, q.platform);
    assert.equal((await fee(l.creatorVault)).accrued - cr.accrued, q.creator);
    assert.equal((await tok(d)) - tokens, n);
    const curve = decodeCurveState(
      Buffer.from((await raw(l.curve)).data[0], "base64"),
    );
    assert.equal(curve.sold, q.sold + n);
    assert.equal(curve.collected, q.collected + q.raw);
    l.buys.push({ ...q, signature: String(sent.context.signature) });
    pass(
      "exact quote/payment/reserves/fees/receipts/tokens atomic " +
        l.mint +
        " " +
        n,
    );
    return q;
  }
  function claim(l, signer, kind, amount) {
    return claimFeeInstruction({
      beneficiary: signer,
      mint: l.mint,
      custody: l.custody,
      curve: l.curve,
      feeVault: kind === 0 ? l.platformVault : l.creatorVault,
      kind,
      amount,
    });
  }
  async function claimOk(l, signer, kind, amount) {
    const k = kind === 0 ? l.platformVault : l.creatorVault,
      other = kind === 0 ? l.creatorVault : l.platformVault;
    const before = await fee(k),
      recipient = await bal(signer.address),
      reserve = await raw(l.curve),
      otherBefore = await raw(other);
    const sent = await sponsor.sendTransaction([
      claim(l, signer, kind, amount),
    ]);
    const confirmed = await rpc("getTransaction", [
      String(sent.context.signature),
      {
        encoding: "json",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    assert.equal(confirmed.meta.err, null);
    const event = decodeFeeEvents(
      confirmed.meta.logMessages,
      CUSTODY_PROGRAM_ADDRESS,
    ).find((e) => e.type === "claim");
    assert.deepEqual(event, {
      type: "claim",
      mint: l.mint,
      beneficiary: signer.address,
      kind,
      amount,
      withdrawn: before.withdrawn + amount,
    });
    const after = await fee(k);
    assert.equal(after.accrued, before.accrued);
    assert.equal(after.withdrawn - before.withdrawn, amount);
    assert.equal(before.claimable - after.claimable, amount);
    assert.equal((await bal(signer.address)) - recipient, amount);
    assert.deepEqual(await raw(l.curve), reserve);
    assert.deepEqual(await raw(other), otherBefore);
    evidence.claims.push({
      mint: l.mint,
      kind,
      amount,
      signature: String(sent.context.signature),
    });
    pass(
      "authorized partial/full claim preserves reserves and other entitlement " +
        kind +
        " " +
        amount,
    );
  }
  const a = await launch(creatorA),
    b = await launch(creatorB),
    ad = await dest(a, alice),
    bd = await dest(a, bob),
    ad2 = await dest(b, alice);
  await buy(a, alice, ad, 4n);
  const alternateAlice = await alternate(a, alice);
  await buy(a, alice, alternateAlice, 6n);
  await buy(a, bob, bd, 3n);
  await buy(b, alice, ad2, 2n);
  let q = await quote(a, 1n);
  await denied(
    await ix(a, alice, ad, q),
    1201,
    "protected repeated buy over cumulative allowance",
  );
  await denied(
    await ix(a, alice, alternateAlice, q),
    1201,
    "alternate token account cannot bypass fee-launch cumulative opening allowance",
  );
  q = await quote(a, 21n);
  await denied(await ix(a, bob, bd, q), 1005, "cumulative ordinary wallet cap");
  q = await quote(a, 1n);
  await denied(
    await ix(a, bob, bd, q, q.total - 1n),
    1305,
    "fee inclusive slippage one lamport short",
  );
  const valid = await ix(a, bob, bd, q);
  for (const [index, k, code, label] of [
    [10, b.platformVault, 1302, "cross launch platform vault"],
    [11, b.creatorVault, 1302, "cross launch creator vault"],
    [10, alice.payer.address, 1302, "fake platform vault"],
    [11, bob.payer.address, 1302, "fake creator vault"],
    [1, b.mint, 1003, "wrong mint"],
    [3, b.vault, 1003, "wrong custody inventory"],
    [4, ad, 1003, "destination owned by another buyer"],
    [5, b.opening, 1003, "substituted opening"],
    [
      6,
      (await findBuyerReceiptPda(a.mint, alice.payer.address))[0],
      1003,
      "substituted wallet receipt",
    ],
    [9, b.curve, 1102, "substituted curve"],
    [
      8,
      address("11111111111111111111111111111111"),
      1003,
      "wrong token program",
    ],
    [7, TOKEN_PROGRAM_ADDRESS, 1003, "wrong system program"],
  ]) {
    const ix = {
      ...valid,
      accounts: valid.accounts.map((v, i) =>
        i === index ? { address: k, role: v.role } : v,
      ),
    };
    await denied(ix, code, label);
  }
  const unsigned = {
    ...valid,
    accounts: valid.accounts.map((v, i) =>
      i === 0 ? { address: bob.payer.address, role: AccountRole.WRITABLE } : v,
    ),
  };
  await denied(unsigned, 1002, "unsigned buyer");
  const legacy = receiveInventoryInstruction({
    ...a,
    buyer: bob.payer,
    destination: bd,
    receipt: (await findBuyerReceiptPda(a.mint, bob.payer.address))[0],
    amount: 1n,
    expectedSold: q.sold,
    quotedCost: q.raw,
    maxCost: q.total,
  });
  await denied(legacy, 1306, "fee bypass through legacy paid-buy entry point");
  const stale = { ...q, sold: q.sold - 1n };
  await denied(await ix(a, bob, bd, stale), 1104, "stale fee quote");
  const inaccurate = { ...q, raw: q.raw + 1n };
  await denied(await ix(a, bob, bd, inaccurate), 1105, "substituted raw quote");
  // First instruction would collect real fees; second fails, rolling back all changes.
  const q2 = { ...q, sold: q.sold + 1n };
  await denied(
    [valid, await ix(a, bob, bd, q2)],
    1105,
    "second instruction inconsistent price rolls back first trade and both fee CPIs",
  );
  await denied(
    claim(a, alice.payer, 0, 1n),
    1304,
    "unauthorized treasury claim",
  );
  await denied(claim(a, bob.payer, 1, 1n), 1304, "unauthorized creator claim");
  await denied(
    claim(a, creatorB.payer, 1, 1n),
    1304,
    "cross launch creator beneficiary",
  );
  const wrong = claim(a, creatorA.payer, 1, 1n);
  wrong.accounts[0] = {
    address: alice.payer.address,
    role: AccountRole.WRITABLE_SIGNER,
    signer: alice.payer,
  };
  await denied(wrong, 1304, "claim destination substitution");
  const cp = claim(a, creatorA.payer, 1, 1n);
  cp.accounts[4] = { address: a.platformVault, role: AccountRole.WRITABLE };
  await denied(cp, 1302, "creator withdrawal cannot draw platform funds");
  const cr = await fee(a.creatorVault);
  await denied(
    claim(a, creatorA.payer, 1, cr.claimable + 1n),
    1307,
    "claim exceeds liability",
  );
  const zero = claim(a, creatorA.payer, 1, 1n);
  new DataView(zero.data.buffer).setBigUint64(2, 0n, true);
  await denied(zero, 1307, "zero withdrawal");
  const unsignedClaim = claim(a, creatorA.payer, 1, 1n);
  unsignedClaim.accounts[0] = {
    address: creatorA.payer.address,
    role: AccountRole.WRITABLE,
  };
  await denied(
    unsignedClaim,
    1304,
    "correct creator address without signature is unauthorized",
  );
  const readonlyClaim = claim(a, creatorA.payer, 1, 1n);
  readonlyClaim.accounts[4] = {
    address: a.creatorVault,
    role: AccountRole.READONLY,
  };
  await denied(readonlyClaim, 1304, "read-only fee vault cannot be withdrawn");
  const crossMintClaim = claim(a, creatorA.payer, 1, 1n);
  crossMintClaim.accounts[1] = { address: b.mint, role: AccountRole.READONLY };
  await denied(
    crossMintClaim,
    1003,
    "cross-mint custody and claim relationship substitution",
  );
  await denied(
    [
      claim(a, creatorA.payer, 1, 1n),
      claim(a, creatorA.payer, 1, cr.claimable),
    ],
    1307,
    "multiple claims exceeding cumulative liability roll back the first withdrawal",
  );
  if (local) {
    await claimOk(a, treasury, 0, 1n);
    await claimOk(a, treasury, 0, (await fee(a.platformVault)).claimable);
    await denied(
      claim(a, treasury, 0, 1n),
      1307,
      "duplicate treasury withdrawal",
    );
  } else {
    await denied(
      claim(a, treasury, 0, 1n),
      1304,
      "disposable local treasury cannot withdraw production entitlement",
    );
  }
  await claimOk(a, creatorA.payer, 1, 1n);
  await claimOk(a, creatorA.payer, 1, (await fee(a.creatorVault)).claimable);
  await denied(
    claim(a, creatorA.payer, 1, 1n),
    1307,
    "duplicate creator withdrawal",
  );
  await claimOk(b, creatorB.payer, 1, (await fee(b.creatorVault)).claimable);
  // No spending, closure, reserve withdrawal or migration instruction exists.
  for (const opcode of [11, 12, 255])
    await denied(
      {
        programAddress: CUSTODY_PROGRAM_ADDRESS,
        accounts: cp.accounts,
        data: new Uint8Array([opcode]),
      },
      null,
      "unsupported closure/migration/reserve movement opcode " + opcode,
    ).catch((e) => {
      throw e;
    });
  async function futureQuote(l, amount, sold, collected) {
    const curve = decodeCurveState(
      Buffer.from((await raw(l.curve)).data[0], "base64"),
    );
    const consideration = quoteCurveCost({ ...curve, sold, collected }, amount);
    return { ...feeAmounts(consideration), amount, sold, collected };
  }
  const third = await client();
  extraWallets.push(third.payer.address);
  const thirdDest = await dest(a, third);
  const first = await quote(a, 5n),
    second = await futureQuote(
      a,
      6n,
      first.sold + 5n,
      first.collected + first.raw,
    );
  await denied(
    [
      await ix(a, third, thirdDest, first),
      await ix(a, third, thirdDest, second),
    ],
    1201,
    "multiple fee-buy instructions cannot exceed protected allowance cumulatively",
  );
  const capFirst = await quote(a, 4n),
    capSecond = await futureQuote(
      a,
      17n,
      capFirst.sold + 4n,
      capFirst.collected + capFirst.raw,
    );
  await denied(
    [
      await ix(a, third, thirdDest, capFirst),
      await ix(a, third, thirdDest, capSecond),
    ],
    1005,
    "multiple fee-buy instructions cannot exceed ordinary cap cumulatively",
  );
  const altBob = await alternate(a, bob),
    batchFirst = await quote(a, 2n),
    batchSecond = await futureQuote(
      a,
      5n,
      batchFirst.sold + 2n,
      batchFirst.collected + batchFirst.raw,
    );
  const bobSol = await bal(bob.payer.address),
    reserveBefore = await bal(a.curve),
    pBefore = await fee(a.platformVault),
    cBefore = await fee(a.creatorVault),
    tokensBefore = await tok(bd);
  const batch = await sponsor.sendTransaction([
    await ix(a, bob, bd, batchFirst),
    await ix(a, bob, altBob, batchSecond),
  ]);
  assert.equal(
    bobSol - (await bal(bob.payer.address)),
    batchFirst.total + batchSecond.total,
  );
  assert.equal(
    (await bal(a.curve)) - reserveBefore,
    batchFirst.raw + batchSecond.raw,
  );
  assert.equal(
    (await fee(a.platformVault)).accrued - pBefore.accrued,
    batchFirst.platform + batchSecond.platform,
  );
  assert.equal(
    (await fee(a.creatorVault)).accrued - cBefore.accrued,
    batchFirst.creator + batchSecond.creator,
  );
  assert.equal((await tok(bd)) - tokensBefore, 2n);
  assert.equal(await tok(altBob), 5n);
  const batchCurve = decodeCurveState(
    Buffer.from((await raw(a.curve)).data[0], "base64"),
  );
  assert.equal(batchCurve.sold, batchSecond.sold + 5n);
  assert.equal(batchCurve.collected, batchSecond.collected + batchSecond.raw);
  const receipt = (await findBuyerReceiptPda(a.mint, bob.payer.address))[0];
  assert.equal(
    Buffer.from((await raw(receipt)).data[0], "base64").readBigUInt64LE(72),
    10n,
  );
  a.buys.push(
    { ...batchFirst, signature: String(batch.context.signature) },
    { ...batchSecond, signature: String(batch.context.signature) },
  );
  pass(
    "two atomic fee purchases across alternate accounts reach exact cumulative protected limit and conserve every lamport",
  );
  const dust = await launch(creatorA, 1n, 0n),
    dustDest = await dest(dust, alice);
  await buy(dust, alice, dustDest, 1n);
  await buy(dust, alice, dustDest, 1n);
  await buy(dust, bob, await dest(dust, bob), 2n);
  const overflow = await launch(creatorB, (1n << 64n) - 1n - 10000000n, 0n),
    overflowDest = await dest(overflow, bob);
  const overflowQuote = feeQuoteInstruction({ ...overflow, amount: 1n });
  await denied(overflowQuote, 1308, "fee-inclusive u64 overflow quote");
  const huge = {
    amount: 1n,
    sold: 0n,
    raw: (1n << 64n) - 1n - 10000000n,
    total: (1n << 64n) - 1n,
  };
  await denied(
    await ix(overflow, bob, overflowDest, huge),
    1308,
    "fee-inclusive u64 overflow buy",
  );
  await denied(
    feeQuoteInstruction({ ...overflow, amount: 2n }),
    1108,
    "raw curve price overflow",
  );
  const zeroBuy = await ix(b, bob, await dest(b, bob), await quote(b, 1n));
  new DataView(zeroBuy.data.buffer).setBigUint64(1, 0n, true);
  await denied(zeroBuy, 1006, "zero purchase rejected before fee collection");
  const poorLaunch = await launch(creatorB, 2000000n, 0n),
    poor = await generateKeyPairSigner();
  extraWallets.push(poor.address);
  const poorClient = { payer: poor },
    poorDest = await dest(poorLaunch, poorClient),
    poorQuote = await quote(poorLaunch, 1n);
  const transferData = new Uint8Array(12);
  const tv = new DataView(transferData.buffer);
  tv.setUint32(0, 2, true);
  tv.setBigUint64(4, poorQuote.total, true);
  await sponsor.sendTransaction([
    {
      programAddress: address("11111111111111111111111111111111"),
      data: transferData,
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
    await ix(poorLaunch, poorClient, poorDest, poorQuote),
    1,
    "receipt-rent System CPI fails after both fees and raw payment; transaction rolls everything back",
  );
  for (const l of launches) {
    const curve = decodeCurveState(
        Buffer.from((await raw(l.curve)).data[0], "base64"),
      ),
      p = await fee(l.platformVault),
      c = await fee(l.creatorVault);
    let distributed = 0n;
    for (const d of l.destinations) distributed += await tok(d);
    const creator = await tok(l.creatorAta),
      inventory = await tok(l.vault);
    assert.equal(creator + inventory + distributed, 1000n);
    assert.equal(distributed, curve.sold);
    assert.equal(p.accrued, p.withdrawn + p.claimable);
    assert.equal(c.accrued, c.withdrawn + c.claimable);
    assert.equal(
      p.accrued,
      l.buys.reduce((n, b) => n + b.platform, 0n),
    );
    assert.equal(
      c.accrued,
      l.buys.reduce((n, b) => n + b.creator, 0n),
    );
    const rent = BigInt(await rpc("getMinimumBalanceForRentExemption", [153])),
      curveRent = BigInt(await rpc("getMinimumBalanceForRentExemption", [204]));
    assert.equal(await bal(l.platformVault), rent + p.claimable);
    assert.equal(await bal(l.creatorVault), rent + c.claimable);
    assert.equal(await bal(l.curve), curveRent + curve.collected);
    evidence.launches.push({
      mint: l.mint,
      creator: creator.toString(),
      inventory,
      distributed,
      supply: 1000n,
      rawReserve: curve.collected,
      platform: p,
      creatorFees: c,
      buys: l.buys,
    });
    pass("exact SOL liability isolation and token conservation " + l.mint);
  }
  for (const raw of [1n, 399n, 400n, 10000n, 10001n]) {
    const f = feeAmounts(raw);
    assert.equal(f.total, raw + f.platform + f.creator);
  }
  pass("deterministic dust rounding fixtures; splitting never fee-free");
  const integrityFixtures = [];
  if (!local) {
    for (const [l, label, code, mutate] of [
      [
        a,
        "withdrawn exceeds accrued",
        1308,
        (map) => {
          const d = map.get(a.creatorVault);
          d.writeBigUInt64LE(d.readBigUInt64LE(105) + 1n, 113);
        },
      ],
      [
        b,
        "redirected production treasury configuration",
        1302,
        (map) => {
          map
            .get(b.platformVault)
            .set(getAddressEncoder().encode(alice.payer.address), 72);
        },
      ],
      [
        dust,
        "inconsistent creator liability",
        1303,
        (map) => {
          const d = map.get(dust.creatorVault);
          d.writeBigUInt64LE(d.readBigUInt64LE(121) + 1n, 121);
        },
      ],
      [
        overflow,
        "curve reserve depleted below recorded consideration",
        1102,
        (map) => {
          map.get(overflow.curve).writeBigUInt64LE(1n, 136);
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
      ];
      const sampled = await Promise.all(
        keys.map(async (key) => [key, await raw(key)]),
      );
      for (const [key, value] of sampled.slice(0, 8))
        assert.ok(value, `Required fee fixture account missing: ${key}`);
      // Rejected purchases intentionally have no receipt. Do not materialize a
      // nonexistent account in genesis; retain every existing state account.
      const records = sampled.filter(([, value]) => value !== null);
      const bytes = new Map(
        records.map(([key, value]) => [
          key,
          Buffer.from(value.data[0], "base64"),
        ]),
      );
      const cd = bytes.get(l.curve);
      cd.writeBigUInt64LE(0n, 154);
      cd.writeBigUInt64LE(0n, 162);
      cd.writeBigUInt64LE(100000n, 178);
      mutate(bytes);
      const accounts = records.map(([key, value]) => ({
        address: key,
        account: {
          pubkey: key,
          account: {
            ...value,
            data: [bytes.get(key).toString("base64"), "base64"],
            rentEpoch: 0,
          },
        },
      }));
      integrityFixtures.push({
        label,
        code,
        mint: l.mint,
        custody: l.custody,
        opening: l.opening,
        curve: l.curve,
        platformVault: l.platformVault,
        creatorVault: l.creatorVault,
        vault: l.vault,
        creatorAta: l.creatorAta,
        destinations: l.destinations,
        receipts: l.receipts,
        accounts,
      });
    }
  }
  console.log(
    "PASS fee totals " +
      JSON.stringify({
        positive: evidence.positives.length,
        rejection: evidence.rejections.length,
      }),
  );
  if (process.env.JEET_FEE_EVIDENCE)
    await writeFile(
      process.env.JEET_FEE_EVIDENCE +
        (local ? "-local.json" : "-production.json"),
      JSON.stringify(
        evidence,
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ) + "\n",
    );

  return { evidence, integrityFixtures };
}
