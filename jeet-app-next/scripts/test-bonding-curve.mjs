import assert from "node:assert/strict";
import {
  address,
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
  evidence = [],
  max64 = (1n << 64n) - 1n;
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
const sponsor = await client(),
  alice = await client(),
  bob = await client();
async function launch(options = {}) {
  const r = await fetch("http://127.0.0.1:3000/api/local-test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      totalSupply: "1000",
      decimals: 0,
      devAllocation: "2",
      openingEnabled: false,
      openingDurationSlots: 0,
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
      [alice.payer.address, bob.payer.address, l.curveAddress].map(async (k) =>
        (await balance(k)).toString(),
      ),
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
async function denied(l, instructions, code, label) {
  const before = await snapshot(l);
  let caught;
  try {
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
  console.log(
    `PASS curve: ${label} rejected (${code}); buyer/vault SOL, tokens, cap and curve unchanged`,
  );
}
async function purchase(l, c, d, q) {
  const oldSol = await balance(c.payer.address),
    oldVault = await balance(l.curveAddress),
    oldTokens = await tokens(d);
  const [receipt] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  const oldRent = (await raw(receipt))?.lamports ?? 0;
  const sent = await sponsor.sendTransaction([await buyIx(l, c, d, q)]);
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
    `PASS curve: buy ${q.amount} at sold ${q.sold} costs exactly ${q.cost} lamports`,
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
  const reserve = BigInt(await rpc("getMinimumBalanceForRentExemption", [153]));
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
    `PASS curve conservation: ${creator} + ${inventory} + ${buyers} = ${l.supplyBaseUnits}`,
  );
}
const main = await launch(),
  a = await dest(main, alice),
  b = await dest(main, bob);
const first = await quote(main, 10n);
assert.equal(first.cost, 10045n);
await denied(
  main,
  await buyIx(main, alice, a, first, first.cost - 1n),
  1105,
  "maximum cost one lamport too low",
);
const wrong = await buyIx(main, alice, a, first);
new DataView(wrong.data.buffer).setBigUint64(17, first.cost + 1n, true);
await denied(main, wrong, 1105, "quoted cost one lamport too high");
await purchase(main, alice, a, first);
const stale = first;
await denied(
  main,
  await buyIx(main, bob, b, stale),
  1104,
  "stale quote from previous sold state",
);
const second = await quote(main, 10n);
assert.equal(second.cost, 10145n);
await purchase(main, bob, b, second);
const third = await quote(main, 1n);
assert.equal(third.cost, 1020n);
await purchase(main, alice, a, third);
console.log(
  "PASS curve: sequential marginal prices progress across multiple wallets",
);
const fresh = await quote(main, 1n);
const buy = await buyIx(main, alice, a, fresh);
const zero = { ...buy, data: buy.data.slice() };
new DataView(zero.data.buffer).setBigUint64(1, 0n, true);
await denied(main, zero, 1006, "zero purchase");
const legacy = {
  ...buy,
  data: buy.data.slice(0, 9),
  accounts: buy.accounts.slice(0, 9),
};
await denied(main, legacy, 1000, "retired unpaid distribution bypass");
const invalidQuote = { ...quoteIx(main, 1n), data: new Uint8Array([5]) };
await denied(main, invalidQuote, 1100, "malformed quote");
const zeroQuote = {
  ...quoteIx(main, 1n),
  data: quoteIx(main, 1n).data.slice(),
};
zeroQuote.data.fill(0, 1);
await denied(main, zeroQuote, 1101, "zero quote");
const other = await launch(),
  o = await dest(other, alice);
await denied(
  main,
  {
    ...buy,
    accounts: buy.accounts.map((m, i) =>
      i === 9 ? { ...m, address: address(other.curveAddress) } : m,
    ),
  },
  1102,
  "substituted curve PDA",
);
await denied(
  main,
  {
    ...buy,
    accounts: buy.accounts.map((m, i) =>
      i === 3 ? { ...m, address: address(other.launchVaultTokenAccount) } : m,
    ),
  },
  1003,
  "substituted inventory account",
);
// Execute a valid paid purchase, then fail a later instruction in the same transaction.
await denied(
  main,
  [buy, invalidQuote],
  1100,
  "post-payment transaction rollback",
);
await reconcile(main);
const capped = await launch({
    openingEnabled: true,
    openingDurationSlots: 100000,
    maxWalletPercent: "1",
  }),
  ca = await dest(capped, alice);
await denied(
  capped,
  await buyIx(capped, alice, ca, await quote(capped, 11n)),
  1005,
  "wallet cap enforced before payment/release",
);
await purchase(capped, alice, ca, await quote(capped, 10n));
await reconcile(capped);
const drain = await quote(other, 980n);
await purchase(other, alice, o, drain);
await denied(
  other,
  quoteIx(other, 1n),
  1110,
  "one unit beyond sold-out inventory",
);
const synthetic = { amount: 1n, cost: 1000n, sold: 980n };
await denied(
  other,
  await buyIx(other, alice, o, synthetic),
  1007,
  "inventory underflow purchase",
);
await reconcile(other);
const fractional = await launch({
    totalSupply: "1000",
    decimals: 2,
    curveBasePriceLamports: "1",
    curveSlopeLamports: "1",
  }),
  fa = await dest(fractional, alice);
const fq = await quote(fractional, 1n);
assert.equal(fq.cost, 1n);
await purchase(fractional, alice, fa, fq);
const fq2 = await quote(fractional, 100n);
assert.equal(fq2.cost, 2n);
await purchase(fractional, alice, fa, fq2);
await reconcile(fractional);
const flat = await launch({
    curveBasePriceLamports: "7",
    curveSlopeLamports: "0",
  }),
  fd = await dest(flat, bob);
const flatQ = await quote(flat, 3n);
assert.equal(flatQ.cost, 21n);
await purchase(flat, bob, fd, flatQ);
await reconcile(flat);
const expensive = await launch({
    curveBasePriceLamports: "3000000000",
    curveSlopeLamports: "0",
  }),
  ed = await dest(expensive, alice);
await denied(
  expensive,
  await buyIx(expensive, alice, ed, await quote(expensive, 1n)),
  1106,
  "insufficient buyer SOL",
);
await reconcile(expensive);
const overflow = await launch({
    curveBasePriceLamports: max64.toString(),
    curveSlopeLamports: "0",
  }),
  od = await dest(overflow, alice);
const edge = await quote(overflow, 1n);
assert.equal(edge.cost, max64);
await denied(overflow, quoteIx(overflow, 2n), 1108, "u64 quote overflow");
await denied(
  overflow,
  await buyIx(overflow, alice, od, { amount: 2n, sold: 0n, cost: 1n }),
  1108,
  "u64 execution overflow",
);
await reconcile(overflow);
const wide = await launch({
  totalSupply: "1000000000",
  decimals: 9,
  curveSlopeLamports: max64.toString(),
});
await denied(
  wide,
  quoteIx(wide, BigInt(wide.launchInventoryBaseUnits)),
  1108,
  "u128 intermediate overflow",
);
await reconcile(wide);
const oneOver = await launch({
  curveBasePriceLamports: (max64 / 2n + 1n).toString(),
  curveSlopeLamports: "0",
});
await denied(
  oneOver,
  quoteIx(oneOver, 2n),
  1108,
  "cost exactly one lamport above u64 maximum",
);
await reconcile(oneOver);
// An issuer-controlled fixture tests on-chain parameter validation and one-time initialization.
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
});
const [manualVault] = await findAssociatedTokenPda({
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
    capBps: 10000,
    enabled: false,
    durationSlots: 0n,
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
// Snapshot supports uninitialized curve state when checking initialization failures.
const parameters = {
  payer: alice.payer,
  mint: manualMint.address,
  custody: manualCustody,
  opening: manualOpening,
  curve: manualCurve,
  vault: manualVault,
  basePrice: 1000n,
  slope: 1n,
};
const init = initializeCurveInstruction(parameters),
  badInit = { ...init, data: init.data.slice() };
badInit.data.fill(0, 1, 9);
await denied(manual, badInit, 1103, "zero base price on-chain initialization");
await denied(
  manual,
  initializeCurveInstruction({ ...parameters, payer: bob.payer }),
  1107,
  "unauthorized curve initialization",
);
await denied(manual, quoteIx(manual, 1n), 1102, "uninitialized curve quote");
await sponsor.sendTransaction([init]);
await denied(manual, init, 1109, "issuer cannot reset initialized curve");
await reconcile(manual);
evidence.push(manual);
const donated = await launch(),
  dd = await dest(donated, alice);
await purchase(donated, alice, dd, await quote(donated, 2n));
const donationQuote = await quote(donated, 1n);
await sponsor.sendTransaction([
  alice.token.instructions.transferChecked({
    source: dd,
    mint: address(donated.mintAddress),
    destination: address(donated.launchVaultTokenAccount),
    authority: alice.payer,
    amount: 1n,
    decimals: 0,
  }),
]);
const gift = new Uint8Array(12);
new DataView(gift.buffer).setUint32(0, 2, true);
new DataView(gift.buffer).setBigUint64(4, 1n, true);
await sponsor.sendTransaction([
  {
    programAddress: address("11111111111111111111111111111111"),
    data: gift,
    accounts: [
      {
        address: bob.payer.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: bob.payer,
      },
      { address: address(donated.curveAddress), role: AccountRole.WRITABLE },
    ],
  },
]);
assert.equal((await quote(donated, 1n)).cost, donationQuote.cost);
await purchase(donated, alice, dd, donationQuote);
await reconcile(donated);
console.log(
  "PASS curve: unsolicited token/SOL deposits do not reset price or stop valid purchases",
);
for (const invalid of [
  { curveBasePriceLamports: "0" },
  { curveBasePriceLamports: "-1" },
  { curveSlopeLamports: "-1" },
  { curveSlopeLamports: (max64 + 1n).toString() },
  { curveBasePriceLamports: 1000 },
]) {
  const r = await fetch("http://127.0.0.1:3000/api/local-test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ totalSupply: "1000", decimals: 0, ...invalid }),
  });
  assert.equal(r.status, 400);
}
console.log("PASS curve: five invalid API parameter configurations rejected");
if (process.env.JEET_CURVE_EVIDENCE) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    process.env.JEET_CURVE_EVIDENCE,
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
console.log("PASS deterministic bonding-curve suite");
