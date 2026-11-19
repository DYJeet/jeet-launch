import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { address, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { verify } from './readiness/mainnet-readonly.mjs';
import { LOCAL_WALLET_PROGRAM, validateWalletEnvironment } from '../src/lib/wallet-environment.ts';

test('the local wallet environment rejects the full Mainnet genesis reported by Solana RPC', () => {
  assert.throws(() => validateWalletEnvironment({
    network: 'local', chain: 'solana:devnet', program: LOCAL_WALLET_PROGRAM, rpcPath: '/api/wallet/rpc',
    genesis: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  }), /pinned program is invalid/);
});

test('finalized verification requires exact loader identity, bytes and authority', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'jeet-loader-check-'));
  try {
    const loader = address('BPFLoaderUpgradeab1e11111111111111111111111');
    const decode = getAddressDecoder();
    const encode = getAddressEncoder();
    const program = decode.decode(new Uint8Array(32).fill(32));
    const authority = decode.decode(new Uint8Array(32).fill(72));
    const [programData] = await getProgramDerivedAddress({ programAddress: loader, seeds: [encode.encode(program)] });
    const artifact = Buffer.alloc(80, 17);
    Buffer.from('7f454c46', 'hex').copy(artifact);
    artifact.set(encode.encode(program), 4);
    artifact.set(encode.encode(address('HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP')), 36);
    const path = join(fixture, 'candidate.so');
    const sha256 = createHash('sha256').update(artifact).digest('hex');
    await writeFile(path, artifact);
    const header = Buffer.alloc(36);
    header.writeUInt32LE(2);
    header.set(encode.encode(programData), 4);
    const data = Buffer.alloc(45 + artifact.length + 8);
    data.writeUInt32LE(3);
    data.writeBigUInt64LE(99n, 4);
    data[12] = 1;
    data.set(encode.encode(authority), 13);
    data.set(artifact, 45);
    const account = (executable, bytes) => ({ executable, owner: loader, data: [bytes.toString('base64')] });
    const rpc = { getMultipleAccounts(keys, options) {
      assert.deepEqual(keys, [program, programData]);
      assert.equal(options.commitment, 'finalized');
      return { send: async () => ({ context: { slot: 100n }, value: [account(true, header), account(false, data)] }) };
    } };
    assert.equal((await verify(rpc, path, sha256, program, authority)).deploymentSlot, 99n);
    data[12] = 0;
    await assert.rejects(verify(rpc, path, sha256, program, authority), /no configured upgrade authority/);
    data[12] = 1;
    data[13] ^= 1;
    await assert.rejects(verify(rpc, path, sha256, program, authority), /authority differs/);
    data[13] ^= 1;
    data[45] ^= 1;
    await assert.rejects(verify(rpc, path, sha256, program, authority), /Deployed bytes differ/);
    data[45] ^= 1;
    data[data.length - 1] = 1;
    await assert.rejects(verify(rpc, path, sha256, program, authority), /nonzero ProgramData padding/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('owner proof verifies exact off-chain bytes and requires the pinned treasury', async () => {
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const { getBase58Decoder, getOffchainMessageV1Encoder } = await import('@solana/kit');
  const { makeCeremony, verifyCeremony, verifyRoleSignature } = await import('./readiness/mainnet-identities.mjs');
  const fromBytes = getBase58Decoder();
  const keys = Array.from({ length: 4 }, () => generateKeyPairSync('ed25519'));
  const addresses = keys.map(key => address(fromBytes.decode(key.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32))));
  const sourceCommit = 'a'.repeat(40);
  const now = Date.parse('2026-11-19T00:00:00.000Z');
  const ceremony = makeCeremony(sourceCommit, addresses, now);
  const roles = ['program', 'containmentAuthority', 'deploymentPayer', 'initialUpgradeAuthority'];
  const signatures = Object.fromEntries(roles.map((role, i) => [
    role, fromBytes.decode(sign(null, Buffer.from(ceremony.messages[role]), keys[i].privateKey)),
  ]));
  signatures.treasury = fromBytes.decode(sign(null, Buffer.from(ceremony.messages.treasury), keys[0].privateKey));
  const signedBytes = sign(null, Buffer.from(ceremony.messages.program), keys[0].privateKey);
  assert(verifyRoleSignature(addresses[0], ceremony.messages.program, signedBytes));
  assert(!verifyRoleSignature(addresses[0], ceremony.messages.containmentAuthority, signedBytes));
  const wrapped = getOffchainMessageV1Encoder().encode({ version: 1, content: ceremony.messages.program, requiredSignatories: [{ address: addresses[0] }] });
  assert(verifyRoleSignature(addresses[0], ceremony.messages.program, sign(null, wrapped, keys[0].privateKey)));
  const wrongSigner = getOffchainMessageV1Encoder().encode({ version: 1, content: ceremony.messages.program, requiredSignatories: [{ address: addresses[1] }] });
  assert(!verifyRoleSignature(addresses[0], ceremony.messages.program, sign(null, wrongSigner, keys[0].privateKey)));
  assert.throws(() => verifyCeremony(ceremony, signatures, sourceCommit, now), /Invalid key-control signature for treasury/);
  assert.throws(() => verifyCeremony(ceremony, signatures, 'b'.repeat(40), now), /another source commit/);
  assert.throws(() => verifyCeremony(ceremony, signatures, sourceCommit, Date.parse(ceremony.expiresAt)), /validity window/);
  assert.throws(() => makeCeremony(sourceCommit, [addresses[0], ...addresses.slice(0, 3)], now), /distinct addresses/);
  const changed = { ...ceremony, messages: { ...ceremony.messages, program: ceremony.messages.program + ' ' } };
  assert.throws(() => verifyCeremony(changed, signatures, sourceCommit, now), /Displayed message differs/);
});

test('new-deployment preflight rejects occupied loader state or an invalid system wallet', async () => {
  const { generateKeyPairSigner } = await import('@solana/kit');
  const { TREASURY, SYSTEM } = await import('../src/lib/mainnet-identity.ts');
  const { checkNewDeploymentAccounts } = await import('./readiness/mainnet-readonly.mjs');
  const [program, containmentAuthority, deploymentPayer, initialUpgradeAuthority] =
    await Promise.all(Array.from({ length: 4 }, async () => (await generateKeyPairSigner()).address));
  const identities = { program, containmentAuthority, deploymentPayer, initialUpgradeAuthority, treasury: TREASURY };
  const payer = { data: ['', 'base64'], owner: SYSTEM, executable: false, lamports: 42n };
  const values = [null, null, null, null, payer, null, null];
  const rpc = { getMultipleAccounts(keys, options) {
    assert.equal(keys[0], program);
    assert.deepEqual(keys.slice(3), [containmentAuthority, deploymentPayer, initialUpgradeAuthority, TREASURY]);
    assert.equal(options.commitment, 'finalized');
    return { send: async () => ({ context: { slot: 101n }, value: values }) };
  } };
  assert.equal((await checkNewDeploymentAccounts(rpc, identities)).deploymentPayerLamports, 42n);
  values[1] = payer;
  await assert.rejects(checkNewDeploymentAccounts(rpc, identities), /already occupied/);
  values[1] = null;
  values[2] = { ...payer, owner: TREASURY };
  await assert.rejects(checkNewDeploymentAccounts(rpc, identities), /unexpected existing state/);
  values[2] = payer;
  assert.equal((await checkNewDeploymentAccounts(rpc, identities)).prefundedControlLamports, 42n);
  values[4] = { ...payer, data: ['AQ==', 'base64'] };
  await assert.rejects(checkNewDeploymentAccounts(rpc, identities), /wallet has unexpected/);
});
