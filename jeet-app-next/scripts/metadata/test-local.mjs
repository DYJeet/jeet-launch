import assert from "node:assert/strict";
import {
  createClient,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
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
import { decodeFeeState } from "../../src/lib/launch-fees.ts";
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
  decodeGraduation,
} from "../../src/lib/launch-graduation.ts";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import {
  initializeLaunchMetadataInstruction,
  findMetadataPda,
  decodeLaunchMetadata,
  METADATA_PROGRAM,
} from "../../src/lib/launch-metadata.ts";
export async function testMetadata() {
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
    creator = await client();
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
      beforeActivate,
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
    if (beforeActivate) await beforeActivate(l, owner);
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
  const image = await readFile("public/jeet-promo.png"),
    uri = "http://127.0.0.1:9926/metadata.json",
    document = {
      name: "JeeT Local Test",
      symbol: "JTEST",
      description: "Genuine disposable local metadata test",
      image: "http://127.0.0.1:9926/logo.png",
    };
  const server = createServer((req, res) => {
    if (req.url === "/metadata.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(document));
    } else if (req.url === "/logo.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(image);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(9926, "127.0.0.1", r));
  let metadata, observed;
  try {
    const l = await launch(creator, {
        cap: false,
        limit: 9000,
        duration: 1n,
        decimals: 9,
        termsBps: 60,
        beforeActivate: async (l, owner) => {
          [metadata] = await findMetadataPda(l.mint);
          keys.add(metadata);
          const p = {
              ...l,
              creator: owner.payer,
              name: document.name,
              symbol: document.symbol,
              uri,
              mutable: false,
              maxCostLamports: 20000000n,
              allowLocalUri: true,
            },
            ix = await initializeLaunchMetadataInstruction(p);
          await denied(
            {
              ...ix,
              programAddress: "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
            },
            1514,
            "public artifact metadata gate",
          );
          await denied(
            {
              ...ix,
              accounts: ix.accounts.map((a, i) =>
                i === 0 ? { address: owner.payer.address, role: 1 } : a,
              ),
            },
            1623,
            "unsigned metadata creator",
          );
          await denied(
            await initializeLaunchMetadataInstruction({
              ...p,
              creator: alice.payer,
            }),
            1623,
            "substituted metadata creator",
          );
          for (const i of [3, 6])
            await denied(
              {
                ...ix,
                accounts: ix.accounts.map((a, j) =>
                  j === i ? { ...a, address: alice.payer.address } : a,
                ),
              },
              1621,
              "substituted metadata account/program " + i,
            );
          for (const [offset, value] of [
            [9, 2],
            [10, 33],
            [11, 255],
          ]) {
            const data = ix.data.slice();
            data[offset] = value;
            await denied(
              { ...ix, data },
              1624,
              "invalid metadata field " + offset,
            );
          }
          await denied(
            await initializeLaunchMetadataInstruction({
              ...p,
              maxCostLamports: 0n,
            }),
            1625,
            "zero metadata budget reverses actual CPI",
          );
          const latest = (
              await rpc("getLatestBlockhash", [{ commitment: "confirmed" }])
            ).value,
            message = pipe(
              createTransactionMessage({ version: 0 }),
              (m) => setTransactionMessageFeePayer(sponsor.payer.address, m),
              (m) =>
                setTransactionMessageLifetimeUsingBlockhash(
                  {
                    ...latest,
                    lastValidBlockHeight: BigInt(latest.lastValidBlockHeight),
                  },
                  m,
                ),
              (m) => appendTransactionMessageInstruction(ix, m),
            );
          const before = await snap(),
            sim = await rpc("simulateTransaction", [
              getBase64EncodedWireTransaction(compileTransaction(message)),
              {
                encoding: "base64",
                commitment: "confirmed",
                sigVerify: false,
                accounts: {
                  encoding: "base64",
                  addresses: [metadata, owner.payer.address],
                },
              },
            ]);
          assert.equal(sim.value.err, null);
          assert.deepEqual(await snap(), before);
          const size = Buffer.from(
              sim.value.accounts[0].data[0],
              "base64",
            ).length,
            rent = BigInt(
              await rpc("getMinimumBalanceForRentExemption", [size]),
            ),
            cost =
              (await sol(owner.payer.address)) -
              BigInt(sim.value.accounts[1].lamports);
          assert.equal(BigInt(sim.value.accounts[0].lamports), cost);
          await denied(
            await initializeLaunchMetadataInstruction({
              ...p,
              maxCostLamports: cost - 1n,
            }),
            1625,
            "one lamport under actual metadata quote",
          );
          const old = await sol(owner.payer.address),
            sent = await sponsor.sendTransaction([
              await initializeLaunchMetadataInstruction({
                ...p,
                maxCostLamports: cost,
              }),
            ]),
            account = await raw(metadata),
            record = decodeLaunchMetadata(
              Buffer.from(account.data[0], "base64"),
            );
          assert.equal(old - (await sol(owner.payer.address)), cost);
          assert.equal(account.owner, METADATA_PROGRAM);
          assert.equal(record.mint, l.mint);
          assert.equal(record.updateAuthority, owner.payer.address);
          assert.equal(record.name, document.name);
          assert.equal(record.symbol, document.symbol);
          assert.equal(record.uri, uri);
          assert.equal(record.mutable, false);
          assert.equal(record.sellerFeeBasisPoints, 0);
          assert.equal(cost - rent, 10000000n);
          assert.deepEqual(await (await fetch(record.uri)).json(), document);
          assert.deepEqual(
            Buffer.from(await (await fetch(document.image)).arrayBuffer()),
            image,
          );
          evidence.metadata = {
            signature: String(sent.context.signature),
            record,
            metadataBytes: size,
            rent,
            protocolFee: cost - rent,
            cost,
          };
          observed = await raw(metadata);
          pass(
            "actual bounded-cost Metaplex identity, hosted JSON/image and immutable-data flag",
          );
          await denied(ix, 1622, "duplicate metadata creation");
          const bytes = [15, 1];
          for (const s of [document.name + "x", document.symbol, uri]) {
            const b = Buffer.from(s),
              n = Buffer.alloc(4);
            n.writeUInt32LE(b.length);
            bytes.push(...n, ...b);
          }
          bytes.push(0, 0, 0, 0, 0, 0, 0, 0);
          await denied(
            {
              programAddress: METADATA_PROGRAM,
              accounts: [
                { address: metadata, role: 1 },
                { address: owner.payer.address, role: 2, signer: owner.payer },
              ],
              data: new Uint8Array(bytes),
            },
            59,
            "Metaplex immutable data rejects update",
          );
        },
      }),
      d = await dest(l, alice);
    await trade(l, alice, d, 100n * l.scale);
    await trade(l, alice, d, 25n * l.scale, true);
    assert.deepEqual(await raw(metadata), observed);
    evidence.conservation.push(await conservation(l));
    pass("metadata survives V5 activation and exact buy/sell conservation");
    return evidence;
  } finally {
    await new Promise((r) => server.close(r));
  }
}
