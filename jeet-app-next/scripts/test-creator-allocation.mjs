import assert from 'node:assert/strict';
import { address, AccountRole, generateKeyPairSigner, createClient, getProgramDerivedAddress, getAddressEncoder, lamports } from '@solana/kit';
import { solanaRpc, rpcAirdrop } from '@solana/kit-plugin-rpc';
import { generatedPayer, airdropPayer } from '@solana/kit-plugin-signer';
import { tokenProgram, associatedTokenProgram, findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { CUSTODY_PROGRAM_ADDRESS, initializeCustodyInstruction, proveCustodyInstruction } from '../src/lib/launch-custody.ts';

// Run against a production app and solana-test-validator in the same environment.
const app = process.env.JEET_TEST_APP_URL ?? 'http://127.0.0.1:3000';
const rpcUrl = 'http://127.0.0.1:8899';
async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await response.json();
  assert.ok(response.ok && !data.error, JSON.stringify(data));
  return data.result;
}
async function parsedAccount(address) {
  const result = await rpc('getAccountInfo', [address, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  assert.ok(result.value);
  assert.equal(result.value.owner, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  return result.value.data.parsed.info;
}
async function create(body) {
  const response = await fetch(`${app}/api/local-test/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const evidence = [];
const program = await rpc('getAccountInfo', [CUSTODY_PROGRAM_ADDRESS, { encoding: 'base64' }]);
assert.equal(program.value?.executable, true, 'Custody program must be deployed');
const verifier = await createClient().use(generatedPayer()).use(solanaRpc({
  rpcUrl, rpcSubscriptionsUrl: 'ws://127.0.0.1:8900', transactionConfig: { version: 0 },
})).use(rpcAirdrop()).use(airdropPayer(lamports(2000000000n)))
  .use(tokenProgram()).use(associatedTokenProgram());
async function mustReject(label, instruction) {
  let failure;
  try { await verifier.sendTransaction([instruction]); } catch (error) { failure = error; }
  assert.ok(failure, `${label} unexpectedly succeeded`);
  const details = JSON.stringify(failure, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
  // A negative test must fail at program execution, not due to a network/signing error.
  assert.ok(details.includes(`Program ${instruction.programAddress} failed:`), `${label}: expected an on-chain program rejection, received ${details}`);
  console.log(`PASS rejected ${label}`);
}
for (const input of [
  { totalSupply: '1000000000', decimals: 9, devAllocation: '2' },
  { totalSupply: '1000000000', decimals: 9, devAllocation: '0' },
  { totalSupply: '1000000000', decimals: 9, devAllocation: '5' },
  { totalSupply: '123', decimals: 2, devAllocation: '2.51' },
  { totalSupply: '1', decimals: 0, devAllocation: '0.01' },
  { totalSupply: '1000', decimals: 0, devAllocation: '2', revokeMint: false, revokeFreeze: false },
]) {
  const { status, data } = await create(input);
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.ok, true);
  const mint = await parsedAccount(data.mintAddress);
  const inventory = await parsedAccount(data.launchVaultTokenAccount);
  const creator = data.creatorTokenAccount ? await parsedAccount(data.creatorTokenAccount) : null;
  const [whole, fraction = ''] = input.devAllocation.split('.');
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const total = BigInt(input.totalSupply) * 10n ** BigInt(input.decimals);
  const expectedCreator = total * bps / 10000n;
  const actualCreator = BigInt(creator?.tokenAmount.amount ?? '0');
  const actualInventory = BigInt(inventory.tokenAmount.amount);
  assert.equal(actualCreator, expectedCreator);
  assert.equal(actualInventory, total - expectedCreator);
  assert.equal(actualCreator + actualInventory, BigInt(mint.supply));
  assert.equal(BigInt(mint.supply), total);
  assert.equal(mint.decimals, input.decimals);
  assert.equal(mint.mintAuthority, input.revokeMint === false ? data.payerAddress : null);
  assert.equal(mint.freezeAuthority, input.revokeFreeze === false ? data.payerAddress : null);
  assert.equal(inventory.owner, data.launchVaultAddress);
  assert.equal(inventory.mint, data.mintAddress);
  if (creator) {
    assert.equal(creator.owner, data.creatorAddress);
    assert.equal(creator.mint, data.mintAddress);
  }
  assert.notEqual(data.creatorAddress, data.launchVaultAddress);
  assert.equal(data.custodyVerified, true);
  assert.equal(data.custodyProgramAddress, CUSTODY_PROGRAM_ADDRESS);
  const [expectedPda, bump] = await getProgramDerivedAddress({
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    seeds: [new TextEncoder().encode('launch'), getAddressEncoder().encode(address(data.mintAddress))],
  });
  assert.equal(data.launchVaultAddress, expectedPda);
  assert.equal(data.custodyBump, bump);
  const raw = await rpc('getAccountInfo', [expectedPda, { encoding: 'base64', commitment: 'confirmed' }]);
  assert.equal(raw.value.owner, CUSTODY_PROGRAM_ADDRESS);
  assert.equal(raw.value.executable, false);
  const state = Buffer.from(raw.value.data[0], 'base64');
  assert.equal(state.length, 89);
  assert.equal(state.subarray(0, 8).toString(), 'JEETCST1');
  assert.deepEqual(state.subarray(8, 40), Buffer.from(getAddressEncoder().encode(address(data.mintAddress))));
  assert.deepEqual(state.subarray(40, 72), Buffer.from(getAddressEncoder().encode(address(data.creatorAddress))));
  assert.equal(state.readBigUInt64LE(72), expectedCreator);
  assert.equal(state.readBigUInt64LE(80), total - expectedCreator);
  assert.equal(state[88], bump);
  assert.equal(inventory.delegate, undefined);
  assert.equal(inventory.closeAuthority, undefined);
  const custodyTx = await rpc('getTransaction', [data.custodySignature,
    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  assert.equal(custodyTx.meta.err, null);
  const inner = custodyTx.meta.innerInstructions.flatMap(group => group.instructions);
  assert.ok(inner.some(ix => ix.programId === TOKEN_PROGRAM_ADDRESS && ix.parsed?.type === 'revoke' &&
    ix.parsed.info.source === data.launchVaultTokenAccount && ix.parsed.info.owner === expectedPda),
    'Successful inner revoke proves invoke_signed control by the custody program');
  data.custodyStateBase64 = state.toString('base64');
  evidence.push({ input, ...data });
  console.log(`PASS ${input.devAllocation}%: ${actualCreator} + ${actualInventory} = ${total}`);
}
const first = evidence[0];
const second = evidence[1];
const mintAddress = address(first.mintAddress);
const vaultAddress = address(first.launchVaultTokenAccount);
const custody = address(first.launchVaultAddress);
const creatorAta = address(first.creatorTokenAccount);
// Successful control proof by a different fee payer: no private key exists for the PDA.
const proof = await verifier.sendTransaction([proveCustodyInstruction(custody, mintAddress, vaultAddress)]);
assert.ok(proof.context.signature);
console.log('PASS custody program signs CPI from an independent caller');
await mustReject('unauthorized wallet withdrawal', verifier.token.instructions.transferChecked({
  source: vaultAddress, mint: mintAddress, destination: creatorAta,
  authority: verifier.payer, amount: 1n, decimals: 9,
}));
await mustReject('cross-mint vault substitution', proveCustodyInstruction(custody, mintAddress, address(second.launchVaultTokenAccount)));
await mustReject('creator ATA substituted for vault', proveCustodyInstruction(custody, mintAddress, creatorAta));
await mustReject('fake custody state', proveCustodyInstruction(verifier.payer.address, mintAddress, vaultAddress));
await mustReject('unknown instruction', { ...proveCustodyInstruction(custody, mintAddress, vaultAddress), data: new Uint8Array([255]) });
const init = initializeCustodyInstruction({ payer: verifier.payer, mint: mintAddress,
  creator: address(first.creatorAddress), creatorTokenAccount: creatorAta,
  custody, vault: vaultAddress, creatorAmount: BigInt(first.creatorAllocationBaseUnits),
  inventoryAmount: BigInt(first.launchInventoryBaseUnits) });
await mustReject('custody reinitialization', init);
await mustReject('invalid PDA seed account', { ...init,
  accounts: init.accounts.map((meta, i) => i === 3 ? { ...meta, address: verifier.payer.address } : meta) });
const after = await parsedAccount(first.launchVaultTokenAccount);
assert.equal(after.tokenAmount.amount, first.launchInventoryBaseUnits);
assert.equal((await parsedAccount(first.creatorTokenAccount)).tokenAmount.amount, first.creatorAllocationBaseUnits);
assert.equal((await parsedAccount(first.mintAddress)).supply, first.supplyBaseUnits);
console.log('PASS balances and supply unchanged after all denied operations');
// An unfunded, uninitialized launch exercises initialization checks, rather than
// allowing the already-initialized guard to mask invalid allocation validation.
const fixtureMint = await generateKeyPairSigner();
const fixtureCreator = await generateKeyPairSigner();
await verifier.token.instructions.createMint({ newMint: fixtureMint, decimals: 0,
  mintAuthority: verifier.payer.address, freezeAuthority: verifier.payer.address }).sendTransaction();
const [fixturePda] = await getProgramDerivedAddress({ programAddress: CUSTODY_PROGRAM_ADDRESS,
  seeds: [new TextEncoder().encode('launch'), getAddressEncoder().encode(fixtureMint.address)] });
await verifier.token.instructions.mintToATA({ mint: fixtureMint.address, owner: fixtureCreator.address,
  mintAuthority: verifier.payer, amount: 20n, decimals: 0 }).sendTransaction();
await verifier.token.instructions.mintToATA({ mint: fixtureMint.address, owner: fixturePda,
  mintAuthority: verifier.payer, amount: 980n, decimals: 0 }).sendTransaction();
const [fixtureCreatorAta] = await findAssociatedTokenPda({ mint: fixtureMint.address,
  owner: fixtureCreator.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
const [fixtureVault] = await findAssociatedTokenPda({ mint: fixtureMint.address,
  owner: fixturePda, tokenProgram: TOKEN_PROGRAM_ADDRESS });
const fixtureInput = { payer: verifier.payer, mint: fixtureMint.address, creator: fixtureCreator.address,
  creatorTokenAccount: fixtureCreatorAta, custody: fixturePda, vault: fixtureVault,
  creatorAmount: 20n, inventoryAmount: 980n };
await mustReject('supply mismatch at initialization', initializeCustodyInstruction({ ...fixtureInput, inventoryAmount: 981n }));
await mustReject('creator balance mismatch at initialization', initializeCustodyInstruction({ ...fixtureInput, creatorAmount: 19n, inventoryAmount: 981n }));
await mustReject('creator identity substitution', initializeCustodyInstruction({ ...fixtureInput, creator: verifier.payer.address }));
const fixtureInit = initializeCustodyInstruction(fixtureInput);
await mustReject('unsigned initializer', { ...fixtureInit,
  accounts: fixtureInit.accounts.map((meta, i) => i === 0 ?
    { address: fixtureCreator.address, role: AccountRole.WRITABLE } : meta) });
await mustReject('incorrect Token Program', { ...fixtureInit,
  accounts: fixtureInit.accounts.map((meta, i) => i === 6 ?
    { ...meta, address: address('11111111111111111111111111111111') } : meta) });
assert.equal((await rpc('getAccountInfo', [fixturePda, { commitment: 'confirmed' }])).value, null,
  'Failed initializations must not create state');
// Dust transfers to a PDA must not prevent its subsequent allocation and assignment.
const dust = new Uint8Array(12);
const dustView = new DataView(dust.buffer);
dustView.setUint32(0, 2, true);
dustView.setBigUint64(4, BigInt(await rpc('getMinimumBalanceForRentExemption', [0])), true);
await verifier.sendTransaction([{ programAddress: address('11111111111111111111111111111111'),
  accounts: [{ address: verifier.payer.address, role: AccountRole.WRITABLE_SIGNER, signer: verifier.payer },
    { address: fixturePda, role: AccountRole.WRITABLE }], data: dust }]);
const fixtureResult = await verifier.sendTransaction([fixtureInit,
  proveCustodyInstruction(fixturePda, fixtureMint.address, fixtureVault)]);
assert.equal((await rpc('getAccountInfo', [fixturePda, { commitment: 'confirmed' }])).value.owner, CUSTODY_PROGRAM_ADDRESS);
assert.equal((await parsedAccount(fixtureVault)).tokenAmount.amount, '980');
assert.equal((await parsedAccount(fixtureCreatorAta)).tokenAmount.amount, '20');
assert.equal((await parsedAccount(fixtureMint.address)).supply, '1000');
evidence.push({ test: 'prefunded PDA initializes after invalid attempts',
  mintAddress: fixtureMint.address, custody: fixturePda, custodySignature: String(fixtureResult.context.signature) });
console.log('PASS prefunded PDA initializes safely after invalid attempts; 20 + 980 = 1000');

for (const invalid of [
  { devAllocation: '5.01' }, { devAllocation: '-1' }, { devAllocation: '1.001' },
  { devAllocation: 2 }, { totalSupply: '0' }, { totalSupply: '1.5' },
  { totalSupply: '18446744073709551616' }, { decimals: 10 }, { revokeMint: 'false' },
]) {
  const response = await create({ totalSupply: '100', decimals: 0, devAllocation: '2', ...invalid });
  assert.equal(response.status, 400, JSON.stringify(response));
}
console.log('PASS invalid parameters rejected before chain writes');
if (process.env.JEET_TEST_EVIDENCE) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(process.env.JEET_TEST_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
}
