// Public addresses and off-chain signature verification only. No private-key input or RPC writes.
import assert from 'node:assert/strict';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getAddressEncoder, getBase58Encoder, getOffchainMessageV1Encoder } from '@solana/kit';
import { MAINNET_GENESIS } from '../../src/lib/wallet-environment.ts';

import { dedicatedSigner, TREASURY } from '../../src/lib/mainnet-identity.ts';

const roles = ['program', 'containmentAuthority', 'deploymentPayer', 'initialUpgradeAuthority', 'treasury'];
const ttl = 24 * 60 * 60 * 1000;
const utf8 = new TextEncoder();
const ed25519Spki = Buffer.from('302a300506032b6570032100', 'hex');

function identities(entries) {
  const signers = entries.map(dedicatedSigner);
  assert.equal(new Set(signers).size, signers.length, 'Mainnet signer roles require distinct addresses.');
  return Object.fromEntries(roles.map((role, i) => [role, i === 4 ? TREASURY : signers[i]]));
}

function statement(ceremony, role) {
  return [
    'JeeT Launch Mainnet key-control proof v1',
    'Off-chain address control only. This message authorizes no spending or deployment.',
    'Repository: DYJeet/jeet-launch',
    'Source commit: ' + ceremony.sourceCommit,
    'Solana genesis: ' + MAINNET_GENESIS,
    'Role: ' + role,
    ...roles.map(name => name + ': ' + ceremony.addresses[name]),
    'Nonce: ' + ceremony.nonce,
    'Issued: ' + ceremony.issuedAt,
    'Expires: ' + ceremony.expiresAt,
  ].join('\n');
}

export function makeCeremony(sourceCommit, entries, now = Date.now()) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/, 'Use the full source commit SHA.');
  assert.equal(entries.length, 4, 'Four dedicated public signer addresses are required.');
  const ceremony = {
    version: 1, sourceCommit, addresses: identities(entries), nonce: randomBytes(32).toString('hex'),
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttl).toISOString(),
  };
  return {
    ...ceremony,
    messages: Object.fromEntries(roles.map(role => [role, statement(ceremony, role)])),
  };
}

export function verifyRoleSignature(signer, message, signature) {
  const publicKey = createPublicKey({
    key: Buffer.concat([ed25519Spki, getAddressEncoder().encode(signer)]), format: 'der', type: 'spki',
  });
  const wrapped = getOffchainMessageV1Encoder().encode({ version: 1, content: message, requiredSignatories: [{ address: signer }] });
  return verify(null, wrapped, publicKey, signature) || verify(null, utf8.encode(message), publicKey, signature);
}

export function verifyCeremony(ceremony, signatures, sourceCommit, now = Date.now()) {
  assert.equal(ceremony.version, 1, 'Unknown ceremony version.');
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(ceremony.sourceCommit, sourceCommit, 'Proof is bound to another source commit.');
  assert.match(ceremony.nonce, /^[a-f0-9]{64}$/);
  const issued = Date.parse(ceremony.issuedAt);
  const expires = Date.parse(ceremony.expiresAt);
  assert(issued <= now && now < expires && expires - issued === ttl, 'Ceremony proof is outside its validity window.');
  assert.deepEqual(ceremony.addresses, identities(roles.slice(0, 4).map(role => ceremony.addresses[role])));
  assert.equal(Object.keys(signatures).length, roles.length, 'Provide exactly one signature per ceremony role.');
  for (const role of roles) {
    const message = statement(ceremony, role);
    assert.equal(ceremony.messages[role], message, 'Displayed message differs for ' + role);
    const base58 = signatures[role];
    assert.match(base58 ?? '', /^[1-9A-HJ-NP-Za-km-z]{64,88}$/, 'Expected a base58 Ed25519 signature for ' + role);
    const signature = getBase58Encoder().encode(base58);
    assert.equal(signature.length, 64, 'Unexpected signature length for ' + role);
    assert(verifyRoleSignature(ceremony.addresses[role], message, signature), 'Invalid key-control signature for ' + role);
  }
  return { addresses: ceremony.addresses, sourceCommit, nonce: ceremony.nonce, expiresAt: ceremony.expiresAt };
}

async function main() {
  const [mode, commit, ...args] = process.argv.slice(2);
  const usage = 'mainnet-identities.mjs issue COMMIT PROGRAM CONTAINMENT PAYER INITIAL_UPGRADE | verify COMMIT CHALLENGE_JSON SIGNATURES_JSON';
  assert((mode === 'issue' && args.length === 4) || (mode === 'verify' && args.length === 2), usage);
  const result = mode === 'issue'
    ? makeCeremony(commit, args)
    : verifyCeremony(JSON.parse(await readFile(args[0], 'utf8')), JSON.parse(await readFile(args[1], 'utf8')), commit);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) main().catch(error => {
  console.error(error instanceof assert.AssertionError && error.operator !== 'deepStrictEqual'
    ? error.message : 'Mainnet identity ceremony failed.');
  process.exitCode = 1;
});
