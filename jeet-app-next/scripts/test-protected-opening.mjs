import assert from "node:assert/strict";
import {
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  AccountRole,
  createClient,
  generateKeyPairSigner,
  lamports,
} from "@solana/kit";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { generatedPayer, airdropPayer } from "@solana/kit-plugin-signer";
import {
  tokenProgram,
  associatedTokenProgram,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  CUSTODY_PROGRAM_ADDRESS,
  findLaunchCustodyPda,
  findOpeningPda,
  findCurvePda,
  initializeCustodyInstruction,
  initializeOpeningInstruction,
  initializeCurveInstruction,
  findBuyerReceiptPda,
  decodeCurveState,
  quoteCurveCost,
  quoteCurveInstruction,
  receiveInventoryInstruction,
} from "../src/lib/launch-custody.ts";
const rpcUrl = "http://127.0.0.1:8899",
  evidence = [];
async function rpc(method, params) {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const b = await r.json();
  assert.ok(r.ok && !b.error, JSON.stringify(b));
  return b.result;
}
async function raw(key) {
  return (
    await rpc("getAccountInfo", [
      key,
      { encoding: "base64", commitment: "confirmed" },
    ])
  ).value;
}
async function balance(key) {
  return BigInt(
    (await rpc("getBalance", [key, { commitment: "confirmed" }])).value,
  );
}
async function tokens(key) {
  return BigInt(
    (await rpc("getTokenAccountBalance", [key, { commitment: "confirmed" }]))
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
const sponsor = await client();
const alice = await client(),
  bob = await client(),
  carol = await client();
async function launch(options = {}) {
  const r = await fetch("http://127.0.0.1:3000/api/local-test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      totalSupply: "1000",
      decimals: 0,
      devAllocation: "2",
      openingEnabled: true,
      openingDurationSlots: 1000000,
      maxWalletPercent: "2",
      protectedOpeningEnabled: true,
      protectedDelaySlots: 0,
      protectedDurationSlots: 100000,
      protectedLimitPercent: "1",
      ...options,
    }),
  });
  const l = await r.json();
  assert.equal(r.status, 200, JSON.stringify(l));
  l.destinations = [];
  l.receipts = [];
  l.purchases = [];
  evidence.push(l);
  assert.equal((await raw(l.curveAddress)).owner, CUSTODY_PROGRAM_ADDRESS);
  return l;
}
async function state(l) {
  return decodeCurveState(
    Buffer.from((await raw(l.curveAddress)).data[0], "base64"),
  );
}
async function dest(l, c) {
  await sponsor.associatedToken.instructions
    .createAssociatedTokenIdempotent({
      mint: address(l.mintAddress),
      owner: c.payer.address,
    })
    .sendTransaction();
  const [d] = await findAssociatedTokenPda({
    mint: address(l.mintAddress),
    owner: c.payer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  l.destinations.push(d);
  const [receipt] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  l.receipts.push(receipt);
  return d;
}
function quoteIx(l, n) {
  return quoteCurveInstruction({
    mint: address(l.mintAddress),
    custody: address(l.launchVaultAddress),
    opening: address(l.openingAddress),
    curve: address(l.curveAddress),
    vault: address(l.launchVaultTokenAccount),
    amount: n,
  });
}
async function quote(l, n) {
  const before = await raw(l.curveAddress);
  const sent = await sponsor.sendTransaction([quoteIx(l, n)]);
  const tx = await rpc("getTransaction", [
    String(sent.context.signature),
    {
      encoding: "json",
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    },
  ]);
  assert.equal(tx.meta.err, null);
  assert.equal(tx.meta.returnData.programId, CUSTODY_PROGRAM_ADDRESS);
  const data = Buffer.from(tx.meta.returnData.data[0], "base64");
  assert.equal(data.length, 32);
  const q = {
    cost: data.readBigUInt64LE(0),
    sold: data.readBigUInt64LE(8),
    collected: data.readBigUInt64LE(16),
    amount: data.readBigUInt64LE(24),
  };
  assert.equal(q.amount, n);
  assert.equal(q.cost, quoteCurveCost(await state(l), n));
  assert.deepEqual(
    await raw(l.curveAddress),
    before,
    "quote mutated state or SOL",
  );
  return q;
}
async function buyIx(l, c, d, q, maxCost = q.cost) {
  const [receipt] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  return receiveInventoryInstruction({
    buyer: c.payer,
    mint: address(l.mintAddress),
    custody: address(l.launchVaultAddress),
    vault: address(l.launchVaultTokenAccount),
    destination: d,
    opening: address(l.openingAddress),
    receipt,
    curve: address(l.curveAddress),
    amount: q.amount,
    expectedSold: q.sold,
    quotedCost: q.cost,
    maxCost,
  });
}
async function snapshot(l) {
  return {
    sol: await Promise.all(
      [
        alice.payer.address,
        bob.payer.address,
        carol.payer.address,
        l.curveAddress,
      ].map(async (k) => (await balance(k)).toString()),
    ),
    tokens: await Promise.all(
      [l.creatorTokenAccount, l.launchVaultTokenAccount, ...l.destinations].map(
        async (k) => (await tokens(k)).toString(),
      ),
    ),
    accounts: await Promise.all(
      [l.curveAddress, l.openingAddress, ...l.receipts].map(raw),
    ),
  };
}
async function denied(
  l,
  instructions,
  code,
  label,
  target,
) {
  const before = await snapshot(l);
  let caught;
  try {
    if (target !== undefined)
      await submitAt(
        Array.isArray(instructions) ? instructions : [instructions],
        target,
      );
    else
      await sponsor.sendTransaction(
        Array.isArray(instructions) ? instructions : [instructions],
      );
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, `${label} unexpectedly succeeded`);
  const details = JSON.stringify(caught, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  assert.ok(
    details.includes(`"code":${code}`),
    `${label}: expected ${code}, got ${details}`,
  );
  assert.deepEqual(
    await snapshot(l),
    before,
    `${label}: protocol SOL, tokens or state changed`,
  );
  const signatures = await rpc("getSignaturesForAddress", [
    sponsor.payer.address,
    { limit: 1, commitment: "confirmed" },
  ]);
  const transaction = await rpc("getTransaction", [
    signatures[0].signature,
    {
      encoding: "json",
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    },
  ]);
  assert.ok(
    transaction.meta.err,
    "A rejected transaction must actually execute and fail on chain",
  );
  if (target !== undefined)
    assert.equal(
      BigInt(transaction.slot),
      target,
      `${label}: wrong execution slot`,
    );
  outcomes.rejections.push({
    label,
    code,
    slot: transaction.slot,
    signature: signatures[0].signature,
    ...(target !== undefined ? { target: target.toString() } : {}),
  });
  if (target !== undefined)
    boundaries.push({
      label: "before-launch",
      target: target.toString(),
      executionSlot: transaction.slot,
      signature: signatures[0].signature,
    });
  console.log(
    `PASS protected rejection: ${label} (${code}); buyer/vault SOL, tokens and all state unchanged`,
  );
}
async function purchase(l, c, d, q, target) {
  const oldSol = await balance(c.payer.address),
    oldVault = await balance(l.curveAddress),
    oldTokens = await tokens(d);
  const [receipt] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  const oldRent = (await raw(receipt))?.lamports ?? 0;
  const instruction = await buyIx(l, c, d, q);
  const sent =
    target !== undefined
      ? await submitAt([instruction], target)
      : await sponsor.sendTransaction([instruction]);
  if (target !== undefined) {
    const tx = await rpc("getTransaction", [
      String(sent.context.signature),
      {
        encoding: "json",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ]);
    assert.equal(BigInt(tx.slot), target, "Wrong boundary execution slot");
    boundaries.push({
      label:
        target === l.boundaryStart
          ? "launch-start"
          : target === l.boundaryEnd
            ? "expiry"
            : "expiry-plus-one",
      target: target.toString(),
      executionSlot: tx.slot,
      signature: String(sent.context.signature),
    });
  }
  const receiptRent = (await raw(receipt)).lamports;
  const after = await state(l);
  assert.equal(
    oldSol - (await balance(c.payer.address)),
    q.cost + BigInt(receiptRent) - BigInt(oldRent),
  );
  assert.equal((await balance(l.curveAddress)) - oldVault, q.cost);
  assert.equal((await tokens(d)) - oldTokens, q.amount);
  assert.equal(after.sold, q.sold + q.amount);
  assert.equal(after.collected, q.collected + q.cost);
  l.purchases.push({
    amount: q.amount.toString(),
    soldBefore: q.sold.toString(),
    cost: q.cost.toString(),
    signature: String(sent.context.signature),
  });
  console.log(
    `PASS protected: buy ${q.amount} at sold ${q.sold} costs exactly ${q.cost} lamports`,
  );
}
async function reconcile(l) {
  const c = await state(l),
    creator = await tokens(l.creatorTokenAccount),
    inventory = await tokens(l.launchVaultTokenAccount);
  let buyers = 0n;
  for (const d of l.destinations) buyers += await tokens(d);
  assert.equal(creator + inventory + buyers, BigInt(l.supplyBaseUnits));
  let receipts = 0n;
  for (const key of new Set(l.receipts)) {
    const value = await raw(key);
    if (value)
      receipts += Buffer.from(value.data[0], "base64").readBigUInt64LE(72);
  }
  assert.equal(c.sold, receipts);
  assert.ok(inventory >= c.inventory - c.sold);
  const open = Buffer.from((await raw(l.openingAddress)).data[0], "base64");
  assert.equal(open.readBigUInt64LE(97), c.sold);
  const reserve = BigInt(
    await rpc("getMinimumBalanceForRentExemption", [
      Buffer.from((await raw(l.curveAddress)).data[0], "base64").length,
    ]),
  );
  assert.ok((await balance(l.curveAddress)) >= reserve + c.collected);
  assert.equal(
    c.collected,
    l.purchases.reduce((sum, p) => sum + BigInt(p.cost), 0n),
  );
  l.final = {
    creator: creator.toString(),
    inventory: inventory.toString(),
    buyers: buyers.toString(),
    supply: l.supplyBaseUnits,
    sold: c.sold.toString(),
    collected: c.collected.toString(),
    saleRemaining: (c.inventory - c.sold).toString(),
    returnedInventory: (inventory - (c.inventory - c.sold)).toString(),
    openingStateBase64: open.toString("base64"),
    curveStateBase64: (await raw(l.curveAddress)).data[0],
    curveLamports: (await balance(l.curveAddress)).toString(),
  };
  console.log(
    `PASS protected conservation: ${creator} + ${inventory} + ${buyers} = ${l.supplyBaseUnits}`,
  );
}

const outcomes = { positives: [], rejections: [], apiRejections: [] },
  boundaries = [];
function pass(label) {
  outcomes.positives.push(label);
  console.log(`PASS protected positive: ${label}`);
}
async function submitAt(instructions, target) {
  const lifetime = (
    await rpc("getLatestBlockhash", [{ commitment: "confirmed" }])
  ).value;
  const budget = new Uint8Array(5);
  budget[0] = 2;
  new DataView(budget.buffer).setUint32(1, 1400000, true);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(sponsor.payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: lifetime.blockhash,
          lastValidBlockHeight: BigInt(lifetime.lastValidBlockHeight),
        },
        m,
      ),
    (m) =>
      appendTransactionMessageInstructions(
        [
          {
            programAddress: address(
              "ComputeBudget111111111111111111111111111111",
            ),
            accounts: [],
            data: budget,
          },
          ...instructions,
        ],
        m,
      ),
  );
  const signed = await signTransactionMessageWithSigners(message),
    wire = getBase64EncodedWireTransaction(signed);
  // getSlot(processed) reports the latest processed bank; submit into its succeeding slot.
  if (target !== undefined) await waitSlot(target - 1n);
  const signature = await rpc("sendTransaction", [
    wire,
    { encoding: "base64", skipPreflight: true },
  ]);
  let tx;
  for (let i = 0; i < 4000; i++) {
    tx = await rpc("getTransaction", [
      signature,
      {
        encoding: "json",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ]);
    if (tx) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(tx, "Boundary transaction did not confirm");
  console.log(
    `${target === undefined ? "INTEGRITY" : "BOUNDARY"} target=${target ?? "unscheduled"} execution=${tx.slot} error=${JSON.stringify(tx.meta.err)}`,
  );
  if (target !== undefined)
    assert.equal(
      BigInt(tx.slot),
      target,
      "Boundary submission executed in a different slot",
    );
  if (tx.meta.err)
    throw {
      context: { code: tx.meta.err.InstructionError?.[1]?.Custom },
      signature,
      slot: tx.slot,
      error: tx.meta.err,
    };
  return { context: { signature } };
}
async function waitSlot(target) {
  for (let i = 0; i < 4000; i++) {
    const slot = BigInt(await rpc("getSlot", [{ commitment: "processed" }]));
    if (slot === target) return;
    assert.ok(slot < target, `Missed target slot ${target}; current ${slot}`);
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Slot ${target} not reached`);
}
async function localQuote(l, n, soldOverride) {
  const c = await state(l);
  if (soldOverride !== undefined) c.sold = soldOverride;
  return {
    amount: n,
    sold: c.sold,
    collected: c.collected,
    cost: quoteCurveCost(c, n),
  };
}
async function readReceipt(l, c) {
  const [key] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  const data = Buffer.from((await raw(key)).data[0], "base64");
  return data.readBigUInt64LE(72);
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
  data.set(
    (await import("@solana/kit"))
      .getAddressEncoder()
      .encode(TOKEN_PROGRAM_ADDRESS),
    20,
  );
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
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      ],
    },
    sponsor.token.instructions.initializeAccount3({
      account: signer.address,
      mint: address(l.mintAddress),
      owner: c.payer.address,
    }),
  ]);
  l.destinations.push(signer.address);
  return signer.address;
}
async function purchaseBatch(l, c, destinations, quotes, label) {
  const before = await state(l),
    oldBuyer = await balance(c.payer.address),
    oldVault = await balance(l.curveAddress);
  const [receipt] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  const oldRent = (await raw(receipt))?.lamports ?? 0;
  const oldTokens = await Promise.all(destinations.map(tokens));
  const instructions = await Promise.all(
    quotes.map((q, i) => buyIx(l, c, destinations[i], q)),
  );
  const sent = await sponsor.sendTransaction(instructions);
  const amount = quotes.reduce((sum, q) => sum + q.amount, 0n),
    cost = quotes.reduce((sum, q) => sum + q.cost, 0n);
  assert.equal(
    oldBuyer - (await balance(c.payer.address)),
    cost + BigInt((await raw(receipt)).lamports) - BigInt(oldRent),
  );
  assert.equal((await balance(l.curveAddress)) - oldVault, cost);
  for (const dest of new Set(destinations)) {
    const index = destinations.indexOf(dest),
      expected = quotes.reduce(
        (sum, q, i) => sum + (destinations[i] === dest ? q.amount : 0n),
        0n,
      );
    assert.equal((await tokens(dest)) - oldTokens[index], expected);
  }
  const after = await state(l);
  assert.equal(after.sold, before.sold + amount);
  assert.equal(after.collected, before.collected + cost);
  for (const q of quotes)
    l.purchases.push({
      amount: q.amount.toString(),
      soldBefore: q.sold.toString(),
      cost: q.cost.toString(),
      signature: String(sent.context.signature),
    });
  pass(label);
}
const boundary = await launch({
    protectedDelaySlots: 20,
    protectedDurationSlots: 3,
    protectedLimitPercent: "0.50",
  }),
  bd = await dest(boundary, alice);
const phase = (await state(boundary)).protection;
boundary.boundaryStart = phase.startSlot;
boundary.boundaryEnd = phase.endSlot;
assert.equal(phase.startSlot, phase.createdSlot + 20n);
assert.equal(phase.endSlot, phase.startSlot + 3n);
pass(
  "launch start derives solely from initialization Clock.slot plus configured delay",
);
await denied(
  boundary,
  await buyIx(boundary, alice, bd, await localQuote(boundary, 1n)),
  1200,
  "exactly one slot before launch start",
  phase.startSlot - 1n,
);
await purchase(
  boundary,
  alice,
  bd,
  await localQuote(boundary, 5n),
  phase.startSlot,
);
assert.equal(await readReceipt(boundary, alice), 5n);
pass("exact launch-start slot succeeds at exact protected limit");
await purchase(
  boundary,
  alice,
  bd,
  await localQuote(boundary, 1n),
  phase.endSlot,
);
pass("exact expiry slot uses normal capped pricing and permits the next unit");
await purchase(
  boundary,
  alice,
  bd,
  await localQuote(boundary, 1n),
  phase.endSlot + 1n,
);
pass("one slot after expiry uses normal capped pricing");
assert.equal(await readReceipt(boundary, alice), 7n);
pass("expiry preserves cumulative receipts without reset or double-counting");
await purchase(boundary, alice, bd, await quote(boundary, 13n));
assert.equal(await readReceipt(boundary, alice), 20n);
pass("post-opening purchases reach the unchanged ordinary wallet cap");
await denied(
  boundary,
  await buyIx(boundary, alice, bd, await quote(boundary, 1n)),
  1005,
  "post-opening ordinary cap remains enforced",
);
await reconcile(boundary);
const main = await launch(),
  a = await dest(main, alice),
  a2 = await alternate(main, alice),
  b = await dest(main, bob),
  c = await dest(main, carol);
const protection = (await state(main)).protection;
assert.ok(protection);
assert.equal(protection.limitBaseUnits, 10n);
pass("explicit immutable protected state initialized with a stricter limit");
await denied(
  main,
  await buyIx(main, alice, a, await quote(main, 11n)),
  1201,
  "one base unit over protected limit",
);
await purchase(main, alice, a, await quote(main, 6n));
pass("first partial protected buy uses exact on-chain quote");
await purchase(main, alice, a2, await quote(main, 4n));
assert.equal(await readReceipt(main, alice), 10n);
pass(
  "repeated buys across alternate accounts reach the exact cumulative limit",
);
await denied(
  main,
  await buyIx(main, alice, a, await quote(main, 1n)),
  1201,
  "repeat buy exceeds cumulative limit",
);
await denied(
  main,
  await buyIx(main, alice, a2, await quote(main, 1n)),
  1201,
  "alternate token account cannot reset allowance",
);
const stale = await quote(main, 1n);
const bq1 = await localQuote(main, 4n),
  bq2 = await localQuote(main, 6n, bq1.sold + 4n);
await purchaseBatch(
  main,
  bob,
  [b, b],
  [bq1, bq2],
  "different wallet reaches exact limit in one transaction with exact SOL/token updates",
);
assert.equal(await readReceipt(main, bob), 10n);
await denied(
  main,
  await buyIx(main, carol, c, stale),
  1104,
  "stale protected-phase curve quote",
);
await purchase(main, carol, c, await quote(main, 1n));
pass("third wallet receives its independent allowance");
const c2 = await alternate(main, carol);
const cq1 = await localQuote(main, 5n),
  cq2 = await localQuote(main, 5n, cq1.sold + 5n);
await denied(
  main,
  [await buyIx(main, carol, c, cq1), await buyIx(main, carol, c2, cq2)],
  1201,
  "multi-instruction cumulative overflow rolls back prior payment and release",
);
const cq3 = await localQuote(main, 4n),
  cq4 = await localQuote(main, 5n, cq3.sold + 4n);
await purchaseBatch(
  main,
  carol,
  [c, c2],
  [cq3, cq4],
  "multiple instructions and token accounts reach exact boundary atomically without double-counting",
);
assert.equal(await readReceipt(main, carol), 10n);
await sponsor.sendTransaction([
  alice.token.instructions.transferChecked({
    source: a,
    mint: address(main.mintAddress),
    destination: b,
    authority: alice.payer,
    amount: 6n,
    decimals: 0,
  }),
]);
await denied(
  main,
  await buyIx(main, alice, a, await quote(main, 1n)),
  1201,
  "sending tokens away does not restore protected allowance",
);
await denied(
  main,
  await buyIx(main, alice, a, await quote(main, 11n)),
  1005,
  "ordinary wallet cap still rejects during protection",
);
const other = await launch();

const [bobReceipt] = await findBuyerReceiptPda(
  address(main.mintAddress),
  bob.payer.address,
);
for (const [index, replacement, code, label] of [
  [4, a, 1003, "substituted destination owner"],
  [2, other.launchVaultAddress, 1003, "substituted custody PDA"],
  [5, other.openingAddress, 1003, "substituted cap/opening PDA"],
  [9, other.curveAddress, 1102, "substituted protected curve state"],
  [6, bobReceipt, 1003, "substituted wallet receipt"],
  [1, other.mintAddress, 1003, "substituted mint"],
  [3, other.launchVaultTokenAccount, 1003, "substituted custody inventory"],
  [8, "11111111111111111111111111111111", 1003, "substituted Token Program"],
]) {
  // Use an unused wallet for identity checks so a valid limit rejection cannot mask validation.
  const ix = await buyIx(
    other,
    carol,
    await destOnce(other, carol),
    await localQuote(other, 1n),
  );
  const reference =
    index === 4
      ? a
      : index === 2
        ? main.launchVaultAddress
        : index === 5
          ? main.openingAddress
          : index === 9
            ? main.curveAddress
            : index === 6
              ? bobReceipt
              : index === 1
                ? main.mintAddress
                : index === 3
                  ? main.launchVaultTokenAccount
                  : replacement;
  await denied(
    other,
    {
      ...ix,
      accounts: ix.accounts.map((m, i) =>
        i === index ? { ...m, address: address(reference) } : m,
      ),
    },
    code,
    label,
  );
}
const otherDestination = await destOnce(other, carol),
  otherIx = await buyIx(
    other,
    carol,
    otherDestination,
    await localQuote(other, 1n),
  );
await denied(
  other,
  {
    ...otherIx,
    accounts: otherIx.accounts.map((m, i) =>
      i === 0 ? { address: bob.payer.address, role: AccountRole.WRITABLE } : m,
    ),
  },
  1002,
  "substituted unsigned buyer",
);
await denied(
  other,
  carol.token.instructions.transferChecked({
    source: address(other.launchVaultTokenAccount),
    mint: address(other.mintAddress),
    destination: otherDestination,
    authority: carol.payer,
    amount: 1n,
    decimals: 0,
  }),
  4,
  "direct unauthorized inventory movement",
);
await reconcile(main);
assert.equal((await state(main)).sold, 30n);
pass(
  "protected payments, receipts, inventory and curve conserve 20 + 950 + 30 = 1000",
);
await reconcile(other);
const zero = await launch({ protectedLimitPercent: "0" }),
  z = await dest(zero, alice);
await denied(
  zero,
  await buyIx(zero, alice, z, await quote(zero, 1n)),
  1201,
  "zero protected allowance rejects positive buys",
);
await reconcile(zero);
// Longer local slots allow execution-slot assertions without any client-time enforcement.
for (const invalid of [
  { protectedDurationSlots: 0 },
  { protectedDurationSlots: -1 },
  { protectedDurationSlots: 1.5 },
  { protectedDurationSlots: 1000001 },
  { protectedDelaySlots: -1 },
  { protectedOpeningEnabled: "true" },
  { protectedLimitPercent: "2" },
  { protectedLimitPercent: "1.001" },
  { protectedDurationSlots: 1000000, protectedDelaySlots: 1 },
]) {
  const r = await fetch("http://127.0.0.1:3000/api/local-test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      totalSupply: "1000",
      decimals: 0,
      devAllocation: "2",
      maxWalletPercent: "2",
      openingDurationSlots: 1000000,
      protectedOpeningEnabled: true,
      protectedLimitPercent: "1",
      ...invalid,
    }),
  });
  assert.equal(r.status, 400, JSON.stringify(invalid));
  outcomes.apiRejections.push(invalid);
  console.log("PASS protected API rejection: " + JSON.stringify(invalid));
}
// Initialize another issuer-controlled fixture for raw on-chain configuration rejection tests.
const manualMint = await generateKeyPairSigner();
await alice.token.instructions
  .createMint({
    newMint: manualMint,
    decimals: 0,
    mintAuthority: alice.payer.address,
    freezeAuthority: alice.payer.address,
  })
  .sendTransaction();
const [manualCustody] = await findLaunchCustodyPda(manualMint.address),
  [manualOpening] = await findOpeningPda(manualMint.address),
  [manualCurve] = await findCurvePda(manualMint.address);
await alice.token.instructions
  .mintToATA({
    mint: manualMint.address,
    owner: alice.payer.address,
    mintAuthority: alice.payer,
    amount: 20n,
    decimals: 0,
  })
  .sendTransaction();
await alice.token.instructions
  .mintToATA({
    mint: manualMint.address,
    owner: manualCustody,
    mintAuthority: alice.payer,
    amount: 980n,
    decimals: 0,
  })
  .sendTransaction();
const [manualCreator] = await findAssociatedTokenPda({
    mint: manualMint.address,
    owner: alice.payer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  }),
  [manualVault] = await findAssociatedTokenPda({
    mint: manualMint.address,
    owner: manualCustody,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
await sponsor.sendTransaction([
  initializeCustodyInstruction({
    payer: alice.payer,
    mint: manualMint.address,
    creator: alice.payer.address,
    creatorTokenAccount: manualCreator,
    custody: manualCustody,
    vault: manualVault,
    creatorAmount: 20n,
    inventoryAmount: 980n,
  }),
  initializeOpeningInstruction({
    payer: alice.payer,
    mint: manualMint.address,
    custody: manualCustody,
    opening: manualOpening,
    capBps: 200,
    enabled: true,
    durationSlots: 1000000n,
  }),
]);
const manual = {
  mintAddress: manualMint.address,
  launchVaultAddress: manualCustody,
  openingAddress: manualOpening,
  curveAddress: manualCurve,
  launchVaultTokenAccount: manualVault,
  creatorTokenAccount: manualCreator,
  supplyBaseUnits: "1000",
  destinations: [],
  receipts: [],
  purchases: [],
};
const params = {
  payer: alice.payer,
  mint: manualMint.address,
  custody: manualCustody,
  opening: manualOpening,
  curve: manualCurve,
  vault: manualVault,
  basePrice: 1000n,
  slope: 1n,
  protection: { delaySlots: 0n, durationSlots: 100000n, limitBps: 100 },
};
const validInit = initializeCurveInstruction(params);
for (const [at, value, code, label] of [
  [25, 0n, 1202, "zero protected duration on chain"],
  [25, 1000001n, 1202, "oversized protected duration on chain"],
  [17, (1n << 64n) - 1n, 1202, "invalid u64 delay on chain"],
]) {
  const ix = { ...validInit, data: validInit.data.slice() };
  new DataView(ix.data.buffer).setBigUint64(at, value, true);
  await denied(manual, ix, code, label);
}
const notStricter = { ...validInit, data: validInit.data.slice() };
new DataView(notStricter.data.buffer).setUint16(33, 200, true);
await denied(
  manual,
  notStricter,
  1202,
  "protected limit must be stricter than ordinary cap",
);
await sponsor.sendTransaction([validInit]);
pass("valid issuer initialization fixes protected parameters on chain");
await denied(
  manual,
  initializeCurveInstruction({ ...params, protection: undefined }),
  1109,
  "issuer cannot downgrade a protected curve to legacy",
);
await denied(
  manual,
  validInit,
  1109,
  "issuer cannot reset the protected start or allowance",
);
await reconcile(manual);
evidence.push(manual);
// Prepare public account snapshots for a fresh validator genesis containing inconsistent state.
const corruptA = await launch(),
  corruptADest = await dest(corruptA, alice),
  corruptB = await launch(),
  corruptBDest = await dest(corruptB, alice);
const corruptions = [
  {
    launch: corruptA,
    destination: corruptADest,
    code: 1203,
    label: "inconsistent protected end slot",
    account: corruptA.curveAddress,
    offset: 178,
  },
  {
    launch: corruptB,
    destination: corruptBDest,
    code: 1102,
    label: "inconsistent cap/curve distributed state",
    account: corruptB.openingAddress,
    offset: 97,
  },
];
for (const fixture of [corruptA, corruptB]) await reconcile(fixture);
export async function integrityAccounts() {
  const keys = new Set([
    sponsor.payer.address,
    alice.payer.address,
    bob.payer.address,
    carol.payer.address,
  ]);
  for (const { launch: l } of corruptions)
    for (const key of [
      l.mintAddress,
      l.launchVaultAddress,
      l.launchVaultTokenAccount,
      l.creatorTokenAccount,
      l.openingAddress,
      l.curveAddress,
      ...l.destinations,
    ])
      keys.add(key);
  const entries = [];
  for (const key of keys) {
    const account = await raw(key);
    assert.ok(account);
    account.rentEpoch = 0;
    const mutation = corruptions.find((x) => x.account === key);
    if (mutation) {
      const data = Buffer.from(account.data[0], "base64");
      data.writeBigUInt64LE(
        data.readBigUInt64LE(mutation.offset) + 1n,
        mutation.offset,
      );
      account.data = [data.toString("base64"), "base64"];
    }
    entries.push({ address: key, account: { pubkey: key, account } });
  }
  return entries;
}
export async function verifyIntegrity() {
  // Freshly funded participants on the fresh genesis; protocol accounts remain the seeded fixtures.
  const feeSponsor = await client(),
    buyer = await client();
  for (const fixture of corruptions) {
    const l = fixture.launch,
      mint = address(l.mintAddress);
    await feeSponsor.associatedToken.instructions
      .createAssociatedTokenIdempotent({ mint, owner: buyer.payer.address })
      .sendTransaction();
    const [destination] = await findAssociatedTokenPda({
      mint,
      owner: buyer.payer.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [receipt] = await findBuyerReceiptPda(mint, buyer.payer.address);
    l.destinations.push(destination);
    l.receipts.push(receipt);
    const capture = async () => ({
      sol: await Promise.all(
        [
          alice.payer.address,
          bob.payer.address,
          carol.payer.address,
          buyer.payer.address,
          l.curveAddress,
        ].map(async (k) => (await balance(k)).toString()),
      ),
      tokens: await Promise.all(
        [
          l.creatorTokenAccount,
          l.launchVaultTokenAccount,
          ...l.destinations,
        ].map(async (k) => (await tokens(k)).toString()),
      ),
      accounts: await Promise.all(
        [l.curveAddress, l.openingAddress, ...l.receipts].map(raw),
      ),
    });
    const before = await capture();
    let caught;
    try {
      await feeSponsor.sendTransaction([
        receiveInventoryInstruction({
          buyer: buyer.payer,
          mint,
          custody: address(l.launchVaultAddress),
          vault: address(l.launchVaultTokenAccount),
          opening: address(l.openingAddress),
          curve: address(l.curveAddress),
          destination,
          receipt,
          amount: 1n,
          expectedSold: 0n,
          quotedCost: 1000n,
          maxCost: 1000n,
        }),
      ]);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, `${fixture.label} unexpectedly succeeded`);
    const details = JSON.stringify(caught, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    assert.ok(
      details.includes(`"code":${fixture.code}`),
      `${fixture.label}: ${caught.message} ${details}`,
    );
    assert.deepEqual(
      await capture(),
      before,
      "Corrupt-state rejection changed SOL, tokens or protected state",
    );
    const signatures = await rpc("getSignaturesForAddress", [
      feeSponsor.payer.address,
      { limit: 1, commitment: "confirmed" },
    ]);
    const tx = await rpc("getTransaction", [
      signatures[0].signature,
      {
        encoding: "json",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ]);
    assert.equal(tx.meta.err.InstructionError[1].Custom, fixture.code);
    outcomes.rejections.push({
      label: fixture.label,
      code: fixture.code,
      slot: tx.slot,
      signature: signatures[0].signature,
    });
    let held = 0n;
    for (const d of l.destinations) held += await tokens(d);
    assert.equal(
      (await tokens(l.creatorTokenAccount)) +
        (await tokens(l.launchVaultTokenAccount)) +
        held,
      1000n,
    );
    console.log(
      `PASS protected rejection: ${fixture.label} (${fixture.code}); buyer/vault SOL, tokens and all state unchanged`,
    );
  }
  console.log(
    "PASS protected integrity: inconsistent state rejected without a program bypass",
  );
  // JSON-safe copies preserve boundary evidence without serializing internal bigint scheduling fields.
  const safe = JSON.parse(
    JSON.stringify({ outcomes, boundaries, cases: evidence }, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
  if (process.env.JEET_PROTECTED_EVIDENCE) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      process.env.JEET_PROTECTED_EVIDENCE,
      JSON.stringify(safe, null, 2) + "\n",
    );
  }
  console.log(
    `PASS protected-opening suite: ${outcomes.positives.length} positive checks, ${outcomes.rejections.length} on-chain rejections, ${outcomes.apiRejections.length} API rejections`,
  );
}
async function destOnce(l, c) {
  if (!l.cachedDestination) l.cachedDestination = await dest(l, c);
  return l.cachedDestination;
}
