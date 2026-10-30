import assert from "node:assert/strict";
import {
  address,
  AccountRole,
  createClient,
  generateKeyPairSigner,
  getAddressEncoder,
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
  initializeCustodyInstruction,
  findOpeningPda,
  findBuyerReceiptPda,
  initializeOpeningInstruction,
  receiveInventoryInstruction,
  decodeCurveState,
  quoteCurveCost,
} from "../src/lib/launch-custody.ts";
const rpcUrl = "http://127.0.0.1:8899";
const evidence = [];
async function rpc(method, params) {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
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
const alice = await client(),
  bob = await client();
async function launch(options = {}) {
  const r = await fetch("http://127.0.0.1:3000/api/local-test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      totalSupply: "1000",
      decimals: 0,
      devAllocation: "2",
      maxWalletPercent: "10",
      openingDurationSlots: 100000,
      ...options,
    }),
  });
  const b = await r.json();
  assert.equal(r.status, 200, JSON.stringify(b));
  const [opening] = await findOpeningPda(address(b.mintAddress));
  assert.equal(b.openingAddress, opening);
  const data = Buffer.from((await raw(opening)).data[0], "base64");
  assert.equal(data.subarray(0, 8).toString(), "JEETOPN1");
  assert.equal(data.readBigUInt64LE(72), BigInt(b.openingCapBaseUnits));
  assert.equal((await raw(opening)).owner, CUSTODY_PROGRAM_ADDRESS);
  b.destinations = [];
  b.receipts = [];
  evidence.push(b);
  return b;
}
async function destination(l, c, alternate = false) {
  let result;
  const mint = address(l.mintAddress);
  if (!alternate) {
    await c.associatedToken.instructions
      .createAssociatedTokenIdempotent({ mint, owner: c.payer.address })
      .sendTransaction();
    [result] = await findAssociatedTokenPda({
      mint,
      owner: c.payer.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
  } else {
    const signer = await generateKeyPairSigner();
    const data = new Uint8Array(52);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0, true);
    view.setBigUint64(
      4,
      BigInt(await rpc("getMinimumBalanceForRentExemption", [165])),
      true,
    );
    view.setBigUint64(12, 165n, true);
    data.set(getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS), 20);
    await c.sendTransaction([
      {
        programAddress: address("11111111111111111111111111111111"),
        data,
        accounts: [
          {
            address: c.payer.address,
            role: AccountRole.WRITABLE_SIGNER,
            signer: c.payer,
          },
          {
            address: signer.address,
            role: AccountRole.WRITABLE_SIGNER,
            signer,
          },
        ],
      },
      c.token.instructions.initializeAccount3({
        account: signer.address,
        mint,
        owner: c.payer.address,
      }),
    ]);
    result = signer.address;
  }
  l.destinations.push(result);
  return result;
}
async function instruction(l, c, d, amount) {
  const [receipt] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  if (!l.receipts.includes(receipt)) l.receipts.push(receipt);
  const curve = decodeCurveState(
    Buffer.from((await raw(l.curveAddress)).data[0], "base64"),
  );
  const cost = quoteCurveCost(curve, amount);
  return receiveInventoryInstruction({
    curve: address(l.curveAddress),
    expectedSold: curve.sold,
    quotedCost: cost,
    maxCost: cost,
    buyer: c.payer,
    mint: address(l.mintAddress),
    custody: address(l.launchVaultAddress),
    vault: address(l.launchVaultTokenAccount),
    destination: d,
    opening: address(l.openingAddress),
    receipt,
    amount,
  });
}
async function snapshot(l) {
  const keys = [l.openingAddress, ...l.receipts];
  return {
    balances: await Promise.all(
      [l.creatorTokenAccount, l.launchVaultTokenAccount, ...l.destinations].map(
        async (x) => (await balance(x)).toString(),
      ),
    ),
    state: await Promise.all(
      keys.map(async (x) => (await raw(x))?.data ?? null),
    ),
  };
}
async function denied(l, c, ix, code, label) {
  const before = await snapshot(l);
  let caught;
  try {
    await c.sendTransaction(Array.isArray(ix) ? ix : [ix], {
      abortSignal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, `${label} succeeded`);
  const encoded = JSON.stringify(caught, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  assert.ok(
    encoded.includes(`"code":${code}`),
    `${label}: expected custom error ${code}: ${encoded}`,
  );
  assert.deepEqual(
    await snapshot(l),
    before,
    `${label} changed token balances or cap state`,
  );
  console.log(
    `PASS wallet cap: ${label} rejected (${code}); balances/state unchanged`,
  );
}
async function received(l, c) {
  const [key] = await findBuyerReceiptPda(
    address(l.mintAddress),
    c.payer.address,
  );
  const account = await raw(key);
  assert.equal(account.owner, CUSTODY_PROGRAM_ADDRESS);
  const data = Buffer.from(account.data[0], "base64");
  assert.equal(data.subarray(0, 8).toString(), "JEETBUY1");
  assert.deepEqual(
    data.subarray(40, 72),
    Buffer.from(getAddressEncoder().encode(c.payer.address)),
  );
  return data.readBigUInt64LE(72);
}
async function reconcile(l) {
  const creator = await balance(l.creatorTokenAccount),
    inventory = await balance(l.launchVaultTokenAccount);
  let distributed = 0n;
  for (const d of l.destinations) distributed += await balance(d);
  assert.equal(creator, 20n);
  assert.equal(creator + inventory + distributed, 1000n);
  const state = Buffer.from((await raw(l.openingAddress)).data[0], "base64");
  assert.equal(state.readBigUInt64LE(97), distributed);
  l.finalReconciliation = {
    creatorBaseUnits: creator.toString(),
    inventoryBaseUnits: inventory.toString(),
    distributedBaseUnits: distributed.toString(),
    totalSupplyBaseUnits: "1000",
  };
  l.finalOpeningStateBase64 = state.toString("base64");
  l.finalReceiptStates = await Promise.all(
    l.receipts.map(async (key) => ({
      address: key,
      stateBase64: (await raw(key))?.data[0] ?? null,
    })),
  );
  console.log(
    `PASS wallet cap conservation: ${creator} + ${inventory} + ${distributed} = 1000`,
  );
}
const active = await launch();
const a = await destination(active, alice),
  a2 = await destination(active, alice, true),
  b = await destination(active, bob);
await denied(
  active,
  alice,
  await instruction(active, alice, a, 101n),
  1005,
  "one unit above cap",
);
await alice.sendTransaction([await instruction(active, alice, a, 60n)]);
await alice.sendTransaction([await instruction(active, alice, a2, 40n)]);
assert.equal(await received(active, alice), 100n);
console.log(
  "PASS wallet cap: alternate accounts share one wallet allowance; exact cap accepted",
);
await denied(
  active,
  alice,
  await instruction(active, alice, a, 1n),
  1005,
  "repeat purchase above cumulative cap",
);
await denied(
  active,
  alice,
  await instruction(active, alice, a2, 1n),
  1005,
  "alternate account bypass",
);
await bob.sendTransaction([await instruction(active, bob, b, 100n)]);
assert.equal(await received(active, bob), 100n);
console.log("PASS wallet cap: different wallets have independent allowances");
const carol = await client(),
  ca = await destination(active, carol);
await denied(
  active,
  carol,
  [
    await instruction(active, carol, ca, 60n),
    await instruction(active, carol, ca, 60n),
  ],
  1005,
  "atomic repeated-buy batch rollback",
);

// Moving acquired tokens away cannot restore launch allowance.
await alice.token.instructions
  .transferChecked({
    source: a,
    mint: address(active.mintAddress),
    destination: b,
    authority: alice.payer,
    amount: 60n,
    decimals: 0,
  })
  .sendTransaction();
await denied(
  active,
  alice,
  await instruction(active, alice, a, 1n),
  1005,
  "transfer-away allowance reset",
);
const base = await instruction(active, alice, a, 1n);
const [bobReceipt] = await findBuyerReceiptPda(
  address(active.mintAddress),
  bob.payer.address,
);
await denied(
  active,
  alice,
  {
    ...base,
    accounts: base.accounts.map((m, i) =>
      i === 6 ? { ...m, address: bobReceipt } : m,
    ),
  },
  1003,
  "substituted wallet receipt",
);
await denied(
  active,
  alice,
  {
    ...base,
    accounts: base.accounts.map((m, i) => (i === 4 ? { ...m, address: b } : m)),
  },
  1003,
  "another wallet destination",
);
await denied(
  active,
  alice,
  alice.token.instructions.transferChecked({
    source: address(active.launchVaultTokenAccount),
    mint: address(active.mintAddress),
    destination: a,
    authority: alice.payer,
    amount: 1n,
    decimals: 0,
  }),
  4,
  "direct inventory withdrawal",
);
await denied(
  active,
  alice,
  initializeOpeningInstruction({
    payer: alice.payer,
    mint: address(active.mintAddress),
    custody: address(active.launchVaultAddress),
    opening: address(active.openingAddress),
    capBps: 10000,
    enabled: false,
    durationSlots: 0n,
  }),
  1002,
  "opening settings bypass",
);
await reconcile(active);
const zero = await launch({ maxWalletPercent: "0" }),
  z = await destination(zero, alice);
await denied(
  zero,
  alice,
  await instruction(zero, alice, z, 1n),
  1005,
  "zero-percent protected cap",
);
await reconcile(zero);
const disabled = await launch({
    maxWalletPercent: "0",
    openingEnabled: false,
    openingDurationSlots: 0,
  }),
  d = await destination(disabled, alice);
await alice.sendTransaction([await instruction(disabled, alice, d, 200n)]);
assert.equal(await received(disabled, alice), 200n);
await reconcile(disabled);
console.log(
  "PASS wallet cap: disabled phase permits distributions above configured cap",
);
for (const [index, replacement, label] of [
  [1, disabled.mintAddress, "substituted mint"],
  [2, disabled.launchVaultAddress, "substituted custody PDA"],
  [3, disabled.launchVaultTokenAccount, "substituted inventory"],
  [5, disabled.openingAddress, "substituted opening state"],
  [8, "11111111111111111111111111111111", "substituted Token Program"],
]) {
  const ix = await instruction(active, alice, a, 1n);
  await denied(
    active,
    alice,
    {
      ...ix,
      accounts: ix.accounts.map((m, i) =>
        i === index ? { ...m, address: address(replacement) } : m,
      ),
    },
    1003,
    label,
  );
}
const unsigned = await instruction(active, alice, a, 1n);
await denied(
  active,
  alice,
  {
    ...unsigned,
    accounts: unsigned.accounts.map((m, i) =>
      i === 0 ? { address: bob.payer.address, role: AccountRole.WRITABLE } : m,
    ),
  },
  1002,
  "missing buyer signature",
);
await denied(
  active,
  alice,
  { ...base, data: new Uint8Array([3]) },
  1000,
  "malformed distribution encoding",
);

const expired = await launch({
    maxWalletPercent: "0",
    openingDurationSlots: 1,
  }),
  e = await destination(expired, alice);
const end = Buffer.from(
  (await raw(expired.openingAddress)).data[0],
  "base64",
).readBigUInt64LE(88);
for (
  let i = 0;
  BigInt(await rpc("getSlot", [{ commitment: "confirmed" }])) < end;
  i++
) {
  assert.ok(i < 100, "phase expiry timeout");
  await new Promise((r) => setTimeout(r, 100));
}
await alice.sendTransaction([await instruction(expired, alice, e, 200n)]);
assert.equal(await received(expired, alice), 200n);
await reconcile(expired);
console.log(
  "PASS wallet cap: expired phase permits distributions above configured cap",
);
const badAmount = await instruction(disabled, alice, d, 1n);
badAmount.data.fill(0, 1);
await denied(disabled, alice, badAmount, 1006, "zero-unit distribution");
await denied(
  disabled,
  alice,
  await instruction(disabled, alice, d, 1000n),
  1007,
  "insufficient launch inventory",
);
// Validate configuration with the actual mint-authority signer before revocation.
const configMint = await generateKeyPairSigner();
await alice.token.instructions
  .createMint({
    newMint: configMint,
    decimals: 0,
    mintAuthority: alice.payer.address,
    freezeAuthority: alice.payer.address,
  })
  .sendTransaction();
const [configCustody] = await findLaunchCustodyPda(configMint.address);
await alice.token.instructions
  .mintToATA({
    mint: configMint.address,
    owner: alice.payer.address,
    mintAuthority: alice.payer,
    amount: 20n,
    decimals: 0,
  })
  .sendTransaction();
await alice.token.instructions
  .mintToATA({
    mint: configMint.address,
    owner: configCustody,
    mintAuthority: alice.payer,
    amount: 980n,
    decimals: 0,
  })
  .sendTransaction();
const [configCreator] = await findAssociatedTokenPda({
  mint: configMint.address,
  owner: alice.payer.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
const [configVault] = await findAssociatedTokenPda({
  mint: configMint.address,
  owner: configCustody,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
await alice.sendTransaction([
  initializeCustodyInstruction({
    payer: alice.payer,
    mint: configMint.address,
    creator: alice.payer.address,
    creatorTokenAccount: configCreator,
    custody: configCustody,
    vault: configVault,
    creatorAmount: 20n,
    inventoryAmount: 980n,
  }),
]);
const [configOpening] = await findOpeningPda(configMint.address);
const configuration = {
  mintAddress: configMint.address,
  openingAddress: configOpening,
  creatorTokenAccount: configCreator,
  launchVaultAddress: configCustody,
  launchVaultTokenAccount: configVault,
  destinations: [],
  receipts: [],
};
const configIx = initializeOpeningInstruction({
  payer: alice.payer,
  mint: configMint.address,
  custody: configCustody,
  opening: configOpening,
  capBps: 1000,
  enabled: true,
  durationSlots: 100000n,
});
const tooHigh = { ...configIx, data: configIx.data.slice() };
new DataView(tooHigh.data.buffer).setUint16(1, 10001, true);
await denied(configuration, alice, tooHigh, 1004, "invalid cap basis points");
const noDuration = { ...configIx, data: configIx.data.slice() };
new DataView(noDuration.data.buffer).setBigUint64(4, 0n, true);
await denied(
  configuration,
  alice,
  noDuration,
  1004,
  "enabled phase without duration",
);
const invalidFlag = { ...configIx, data: configIx.data.slice() };
invalidFlag.data[3] = 2;
await denied(configuration, alice, invalidFlag, 1004, "invalid enabled flag");
await alice.sendTransaction([configIx]);
await denied(
  configuration,
  alice,
  configIx,
  1009,
  "authorized initializer cannot reset cap phase",
);
await reconcile(configuration);
evidence.push(configuration);
for (const invalid of [
  { maxWalletPercent: "100.01" },
  { maxWalletPercent: "-1" },
  { maxWalletPercent: "1.001" },
  { maxWalletPercent: 2 },
  { openingDurationSlots: 0 },
  { openingDurationSlots: 1.5 },
  { openingDurationSlots: 1000001 },
  { openingEnabled: "false" },
]) {
  const r = await fetch("http://127.0.0.1:3000/api/local-test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      totalSupply: "1000",
      decimals: 0,
      devAllocation: "2",
      ...invalid,
    }),
  });
  assert.equal(r.status, 400, JSON.stringify(invalid));
}
console.log("PASS wallet cap: eight invalid API configurations rejected");
if (process.env.JEET_WALLET_EVIDENCE) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    process.env.JEET_WALLET_EVIDENCE,
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
console.log("PASS opening wallet-cap suite");
