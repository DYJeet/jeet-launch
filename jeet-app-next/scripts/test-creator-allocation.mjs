import assert from 'node:assert/strict';

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
  evidence.push({ input, ...data });
  console.log(`PASS ${input.devAllocation}%: ${actualCreator} + ${actualInventory} = ${total}`);
}
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
