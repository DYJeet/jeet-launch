// No signer, keypair, transaction-building or submission dependency.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { address, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { MAINNET_GENESIS } from '../../src/lib/wallet-environment.ts';
import { dedicatedAddress, dedicatedSigner, SYSTEM, TREASURY } from '../../src/lib/mainnet-identity.ts';
import { verifyCeremony } from './mainnet-identities.mjs';
import { createServerWalletRpc } from '../../src/lib/wallet-rpc-server.ts';

const LOADER = address('BPFLoaderUpgradeab1e11111111111111111111111');
const CPMM = address('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const CPMM_FEE_RECIPIENT = address('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8');
const METADATA = address('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const PREVIEW_ARTIFACTS = new Set([
  'f3870160fbcdfc3040dde20d63a2b7918db77f1b2dac0648d5f79b76bdee7b1a',
  '13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa',
  'e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c',
  'a0517db22d618b092e1bd52b6b0e4c0e61bafa035a60abddd7ca3a9f649d87fa',
]);
const REPLAY_CPMM_HASH = 'c383e1c5b1f578f3d1bf42f12360fca67225b9adda0f3b6c293ad0d6b966818d';
const TOKEN = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WSOL = address('So11111111111111111111111111111111111111112');
const PROGRAM_HEADER = 36;
const PROGRAMDATA_HEADER = 45;
const BUFFER_HEADER = 37;
const maxCapacity = 10 * 1024 * 1024 - PROGRAMDATA_HEADER;
const final = { commitment: 'finalized' };
const timeout = () => ({ abortSignal: AbortSignal.timeout(12000) });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = getAddressEncoder();
const decode = getAddressDecoder();
const amount = text => {
  assert.match(text ?? '', /^[1-9][0-9]*$/);
  const value = Number(text);
  assert(Number.isSafeInteger(value) && value <= maxCapacity, 'Invalid executable size or capacity.');
  return value;
};

async function quote(rpc, binaryLength, capacity) {
  assert(capacity >= binaryLength, 'ProgramData capacity must fit the artifact.');
  const sizes = {
    program: PROGRAM_HEADER,
    programData: PROGRAMDATA_HEADER + capacity,
    temporaryBuffer: BUFFER_HEADER + binaryLength,
  };
  const rent = n => rpc.getMinimumBalanceForRentExemption(BigInt(n), final).send(timeout());
  const [program, programData, temporaryBuffer, mint, token, custody, opening, curve, feeVault, graduation, buyerReceipt, releaseControl] =
    await Promise.all([...Object.values(sizes), 82, 165, 89, 108, 262, 153, 253, 81, 10].map(rent));
  return {
    kind: 'rent-only planning estimate', binaryLength, capacity, sizes,
    deploymentRentLamports: {
      program, programData, temporaryBuffer,
      persistent: program + programData,
      conservativeFundingBeforeFees: program + programData + temporaryBuffer,
    },
    appRentLamports: {
      mint, tokenAccount: token, custody, opening, curve, feeVault, graduation, buyerReceipt, releaseControl,
      newLaunchAccountBudgetBeforeMetadataAndFees:
        mint + token * 3n + custody + opening + curve + feeVault * 2n + graduation,
      firstBuyerBothAccounts: token + buyerReceipt,
    },
  };
}

export async function verify(rpc, artifact, expectedHash, program, authority) {
  assert.match(expectedHash, /^[a-f0-9]{64}$/);
  assert(!PREVIEW_ARTIFACTS.has(expectedHash), 'A fixture or Devnet artifact is not a Mainnet candidate.');
  dedicatedAddress(program);
  dedicatedAddress(authority);
  assert(authority !== program, 'Use a dedicated explicit upgrade authority.');
  const bytes = await readFile(artifact);
  assert(bytes.length > PROGRAMDATA_HEADER && bytes.length <= maxCapacity);
  assert.equal(bytes.subarray(0, 4).toString('hex'), '7f454c46', 'Expected an ELF artifact.');
  assert.equal(hash(bytes), expectedHash, 'The local artifact hash differs from the expected hash.');
  assert(bytes.includes(Buffer.from(encode.encode(TREASURY))), 'The local artifact does not include the approved treasury address.');
  const [programData] = await getProgramDerivedAddress({ programAddress: LOADER, seeds: [encode.encode(program)] });
  const accounts = await rpc.getMultipleAccounts([program, programData], { ...final, encoding: 'base64' }).send(timeout());
  const [executable, state] = accounts.value;
  assert(executable?.executable && executable.owner === LOADER, 'Unexpected program account.');
  assert(state && !state.executable && state.owner === LOADER, 'Unexpected ProgramData account.');
  const header = Buffer.from(executable.data[0], 'base64');
  const data = Buffer.from(state.data[0], 'base64');
  assert(header.length === PROGRAM_HEADER && header.readUInt32LE() === 2, 'Unexpected loader Program state.');
  assert.equal(decode.decode(header.subarray(4)), programData);
  assert(data.length >= PROGRAMDATA_HEADER + bytes.length && data.readUInt32LE() === 3, 'Unexpected ProgramData state.');
  assert.equal(data[12], 1, 'Program has no configured upgrade authority.');
  assert.equal(decode.decode(data.subarray(13, 45)), authority, 'Upgrade authority differs.');
  assert.equal(hash(data.subarray(45, 45 + bytes.length)), expectedHash, 'Deployed bytes differ.');
  assert(data.subarray(45 + bytes.length).every(n => n === 0), 'Unexpected nonzero ProgramData padding.');
  return {
    kind: 'finalized deployed artifact verification',
    program, programData, upgradeAuthority: authority, sha256: expectedHash,
    programDataCapacity: data.length - PROGRAMDATA_HEADER, observedSlot: accounts.context.slot,
    deploymentSlot: data.readBigUInt64LE(4),
  };
}

export async function dependencies(rpc) {
  const [[config], [cpmmProgramData]] = await Promise.all([
    getProgramDerivedAddress({ programAddress: CPMM, seeds: ['amm_config', Uint8Array.of(0, 0)] }),
    getProgramDerivedAddress({ programAddress: LOADER, seeds: [encode.encode(CPMM)] }),
  ]);
  const result = await rpc.getMultipleAccounts([CPMM, config, CPMM_FEE_RECIPIENT, METADATA, TREASURY, cpmmProgramData],
    { ...final, encoding: 'base64' }).send(timeout());
  const [cpmm, settings, feeRecipient, metadata, treasury, cpmmExecutable] = result.value;
  assert(cpmm?.executable && cpmm.owner === LOADER && metadata?.executable, 'External programs must be executable.');
  assert(settings?.owner === CPMM && !settings.executable && feeRecipient?.owner === TOKEN && !feeRecipient.executable,
    'CPMM configuration or fee recipient differs.');
  assert(cpmmExecutable?.owner === LOADER && !cpmmExecutable.executable, 'CPMM ProgramData account unavailable.');
  const loaderHeader = Buffer.from(cpmm.data[0], 'base64');
  const cpmmBytes = Buffer.from(cpmmExecutable.data[0], 'base64');
  assert(loaderHeader.length === PROGRAM_HEADER && loaderHeader.readUInt32LE() === 2 &&
    decode.decode(loaderHeader.subarray(4)) === cpmmProgramData &&
    cpmmBytes.length > PROGRAMDATA_HEADER && cpmmBytes.readUInt32LE() === 3, 'Unexpected CPMM loader state.');
  assert(cpmmBytes[12] === 0 || cpmmBytes[12] === 1, 'Unexpected CPMM upgrade authority encoding.');
  const raw = Buffer.from(settings.data[0], 'base64');
  const recipient = Buffer.from(feeRecipient.data[0], 'base64');
  assert(recipient.length === 165 && decode.decode(recipient.subarray(0, 32)) === WSOL &&
    recipient[108] === 1 && recipient.readUInt32LE(109) === 1, 'CPMM fee recipient is not an initialized native token account.');
  const discriminator = createHash('sha256').update('account:AmmConfig').digest().subarray(0, 8);
  assert(raw.length === 236 && raw.subarray(0, 8).equals(discriminator) && raw.readUInt16LE(10) === 0 && raw[9] <= 1,
    'CPMM config differs from the expected index-zero layout.');
  const cpmmHash = hash(cpmmBytes.subarray(PROGRAMDATA_HEADER));
  return {
    kind: 'external dependency snapshot',
    observedSlot: result.context.slot,
    raydium: {
      program: CPMM, config, feeRecipient: CPMM_FEE_RECIPIENT, programData: cpmmProgramData,
      deployedSlot: cpmmBytes.readBigUInt64LE(4),
      programDataPayloadSha256: cpmmHash,
      matchesLocallyReplayedPayload: cpmmHash === REPLAY_CPMM_HASH,
      upgradeAuthority: cpmmBytes[12] === 1 ? decode.decode(cpmmBytes.subarray(13, 45)) : null,
      createPoolDisabled: raw[9] !== 0, tradeFeeUnitsPerMillion: raw.readBigUInt64LE(12),
      currentCreatePoolFeeLamports: raw.readBigUInt64LE(36),
      binaryCompatibilityProven: false,
    },
    metadataProgram: METADATA,
    treasury: { address: TREASURY, accountPresent: !!treasury, owner: treasury?.owner, signerControlProven: false },
  };
}

export async function checkNewDeploymentAccounts(rpc, addresses) {
  const { program, containmentAuthority, deploymentPayer, initialUpgradeAuthority, treasury } = addresses;
  const signers = [program, containmentAuthority, deploymentPayer, initialUpgradeAuthority].map(dedicatedSigner);
  assert.equal(new Set(signers).size, signers.length, 'Duplicate Mainnet signer roles.');
  assert.equal(treasury, TREASURY, 'Treasury differs from the approved beneficiary.');
  const [[programData], [control]] = await Promise.all([
    getProgramDerivedAddress({ programAddress: LOADER, seeds: [encode.encode(program)] }),
    getProgramDerivedAddress({ programAddress: program, seeds: ['release-control'] }),
  ]);
  const result = await rpc.getMultipleAccounts([program, programData, control, containmentAuthority, deploymentPayer,
    initialUpgradeAuthority, treasury], { ...final, encoding: 'base64' }).send(timeout());
  assert.equal(result.value.length, 7, 'Unexpected identity account result.');
  const [programAccount, state, releaseControl, operator, payer, upgrade, beneficiary] = result.value;
  assert(programAccount === null && state === null, 'Program or ProgramData address is already occupied.');
  const systemWallet = account => account === null ||
    (account.owner === SYSTEM && !account.executable && account.data[0] === '');
  assert(systemWallet(releaseControl), 'Release-control address has unexpected existing state.');
  assert([operator, payer, upgrade, beneficiary].every(systemWallet), 'A proposed wallet has unexpected on-chain state.');
  return {
    observedSlot: result.context.slot, programData, control,
    prefundedControlLamports: releaseControl?.lamports ?? 0n,
    deploymentPayerLamports: payer?.lamports ?? 0n,
    containmentAuthorityLamports: operator?.lamports ?? 0n,
  };
}

async function verifyReleaseControl(rpc, program, mode) {
  dedicatedAddress(program);
  assert(/^[012]$/.test(mode), 'Expected release mode 0, 1 or 2.');
  const [control, bump] = await getProgramDerivedAddress({ programAddress: program, seeds: ['release-control'] });
  const result = await rpc.getAccountInfo(control, { ...final, encoding: 'base64' }).send(timeout());
  const state = result.value;
  assert(state?.owner === program && !state.executable, 'Release control is not initialized by the candidate.');
  const bytes = Buffer.from(state.data[0], 'base64');
  assert(bytes.length === 10 && bytes.subarray(0, 8).equals(Buffer.from('JEETCTL1')) && bytes[8] === bump,
    'Release-control data differs from the candidate layout.');
  assert.equal(bytes[9], Number(mode), 'Release mode differs from the expected mode.');
  return { kind: 'finalized release-control verification', program, control, mode: bytes[9], observedSlot: result.context.slot };
}

async function preflight(rpc, [commit, challenge, signatures, artifact, expectedHash, capacity]) {
  const identity = verifyCeremony(JSON.parse(await readFile(challenge, 'utf8')), JSON.parse(await readFile(signatures, 'utf8')), commit);
  assert.match(expectedHash, /^[a-f0-9]{64}$/);
  assert(!PREVIEW_ARTIFACTS.has(expectedHash), 'A fixture or Devnet artifact is not a Mainnet candidate.');
  const bytes = await readFile(artifact);
  assert(bytes.subarray(0, 4).equals(Buffer.from('7f454c46', 'hex')) && hash(bytes) === expectedHash,
    'Candidate bytes differ from the supplied ELF hash.');
  const manifest = JSON.parse(await readFile(join(dirname(artifact), 'build-manifest.json'), 'utf8'));
  assert(manifest.sourceCommit === identity.sourceCommit && manifest.program === identity.addresses.program &&
    manifest.containmentAuthority === identity.addresses.containmentAuthority && manifest.sha256 === expectedHash &&
    manifest.byteLength === bytes.length && manifest.profile?.matchingBuilds === 2 &&
    manifest.profile?.feature === 'mainnet' && manifest.profile?.builder === '4.4.0' &&
    manifest.profile?.platformTools === 'v1.57' && manifest.profile?.arch === 'v0',
  'Build manifest differs from the reviewed source, public identities or executable.');
  for (const signer of [identity.addresses.treasury, identity.addresses.containmentAuthority])
    assert(bytes.includes(Buffer.from(encode.encode(signer))), 'Candidate is missing an expected compiled authority.');
  const accounts = await checkNewDeploymentAccounts(rpc, identity.addresses);
  const external = await dependencies(rpc);
  assert(external.raydium.matchesLocallyReplayedPayload && !external.raydium.createPoolDisabled &&
    external.raydium.tradeFeeUnitsPerMillion === 2500n && external.raydium.currentCreatePoolFeeLamports === 150000000n,
    'Raydium deployment or terms differ from the locally replayed release inputs.');
  const rent = await quote(rpc, bytes.length, amount(capacity));
  return {
    kind: 'read-only new deployment preflight',
    identity, artifactSha256: expectedHash, accounts, dependencies: external, rent,
    // This is a rent reference. Exact instruction fee and balance sufficiency require a deployment message plan.
    deploymentPayerCoversQuotedRent: accounts.deploymentPayerLamports >= rent.deploymentRentLamports.conservativeFundingBeforeFees,
    containmentAuthorityCoversQuotedRent: accounts.containmentAuthorityLamports + accounts.prefundedControlLamports >= rent.appRentLamports.releaseControl,
  };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  assert((mode === 'quote' && args.length === 2) || (mode === 'verify' && args.length === 4) ||
    (mode === 'preflight' && args.length === 6) || (mode === 'dependencies' && args.length === 0) || (mode === 'verify-control' && args.length === 2),
    'Usage: mainnet-readonly.mjs quote ELF_BYTES PROGRAMDATA_CAPACITY | verify ELF_PATH SHA256 PROGRAM AUTHORITY | verify-control PROGRAM MODE | dependencies | preflight COMMIT CHALLENGE_JSON SIGNATURES_JSON ELF_PATH SHA256 PROGRAMDATA_CAPACITY');
  const rpcUrl = new URL(process.env.JEET_MAINNET_READ_RPC ?? 'https://api.mainnet-beta.solana.com/');
  assert(rpcUrl.protocol === 'https:' && !rpcUrl.username && !rpcUrl.password && !rpcUrl.hash, 'HTTPS Solana RPC required.');
  const rpc = createServerWalletRpc(rpcUrl.href);
  assert.equal(await rpc.getGenesisHash().send(timeout()), MAINNET_GENESIS, 'RPC must point to Solana Mainnet.');
  const report = mode === 'quote'
    ? await quote(rpc, amount(args[0]), amount(args[1]))
    : mode === 'verify' ? await verify(rpc, args[0], args[1], address(args[2]), address(args[3]))
      : mode === 'verify-control' ? await verifyReleaseControl(rpc, address(args[0]), args[1])
        : mode === 'preflight' ? await preflight(rpc, args) : await dependencies(rpc);
  console.log(JSON.stringify({ network: 'mainnet', checkedAt: new Date().toISOString(), ...report },
    (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
}

if (import.meta.main) main().catch(error => {
  // RPC errors can contain authenticated provider URLs. Avoid printing raw transport diagnostics.
  console.error(error instanceof assert.AssertionError ? error.message : 'Mainnet read-only check failed.');
  process.exitCode = 1;
});
