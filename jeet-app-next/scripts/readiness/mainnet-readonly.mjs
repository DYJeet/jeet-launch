// No signer, keypair, transaction-building or submission dependency.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { address, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import { MAINNET_GENESIS } from '../../src/lib/wallet-environment.ts';
import { createServerWalletRpc } from '../../src/lib/wallet-rpc-server.ts';

const LOADER = address('BPFLoaderUpgradeab1e11111111111111111111111');
const CPMM = address('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const CPMM_FEE_RECIPIENT = address('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8');
const METADATA = address('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const TREASURY = address('HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP');
const OLD_PROGRAMS = new Set([
  '11111111111111111111111111111111',
  '7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31',
  '8zhREvLzbAGnMPrQv9nQ4dzvgmq2unFAsLPaX9ZS3zo',
  'Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D',
  '36VASLSKLFD2KokjXG7V28veZvXEsyHRKefLonPaAKzv',
  '5oEzAP4izB65uRm2yDAEf9oALGwHpWkDfyKb8zBY3euC',
  TREASURY,
]);
const PREVIEW_ARTIFACTS = new Set([
  'f3870160fbcdfc3040dde20d63a2b7918db77f1b2dac0648d5f79b76bdee7b1a',
  '13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa',
  'e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c',
  'a0517db22d618b092e1bd52b6b0e4c0e61bafa035a60abddd7ca3a9f649d87fa',
]);
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
  assert(!OLD_PROGRAMS.has(program), 'A dedicated Mainnet program identity is required.');
  assert(!OLD_PROGRAMS.has(authority) && authority !== program, 'Use a dedicated explicit upgrade authority.');
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

async function dependencies(rpc) {
  const [[config], [cpmmProgramData]] = await Promise.all([
    getProgramDerivedAddress({ programAddress: CPMM, seeds: ['amm_config', Uint8Array.of(0, 0)] }),
    getProgramDerivedAddress({ programAddress: LOADER, seeds: [encode.encode(CPMM)] }),
  ]);
  const result = await rpc.getMultipleAccounts([CPMM, config, CPMM_FEE_RECIPIENT, METADATA, TREASURY, cpmmProgramData],
    { ...final, encoding: 'base64' }).send(timeout());
  const [cpmm, settings, feeRecipient, metadata, treasury, cpmmExecutable] = result.value;
  assert(cpmm?.executable && cpmm.owner === LOADER && metadata?.executable, 'External programs must be executable.');
  assert(settings?.owner === CPMM && feeRecipient && !feeRecipient.executable, 'CPMM configuration or fee recipient missing.');
  assert(cpmmExecutable?.owner === LOADER && !cpmmExecutable.executable, 'CPMM ProgramData account unavailable.');
  const loaderHeader = Buffer.from(cpmm.data[0], 'base64');
  const cpmmBytes = Buffer.from(cpmmExecutable.data[0], 'base64');
  assert(loaderHeader.length === PROGRAM_HEADER && loaderHeader.readUInt32LE() === 2 &&
    decode.decode(loaderHeader.subarray(4)) === cpmmProgramData &&
    cpmmBytes.length > PROGRAMDATA_HEADER && cpmmBytes.readUInt32LE() === 3, 'Unexpected CPMM loader state.');
  assert(cpmmBytes[12] === 0 || cpmmBytes[12] === 1, 'Unexpected CPMM upgrade authority encoding.');
  const raw = Buffer.from(settings.data[0], 'base64');
  assert.equal(raw.length, 236, 'CPMM config size differs from the candidate ABI.');
  return {
    kind: 'external dependency snapshot',
    observedSlot: result.context.slot,
    raydium: {
      program: CPMM, config, feeRecipient: CPMM_FEE_RECIPIENT, programData: cpmmProgramData,
      deployedSlot: cpmmBytes.readBigUInt64LE(4),
      programDataPayloadSha256: hash(cpmmBytes.subarray(PROGRAMDATA_HEADER)),
      upgradeAuthority: cpmmBytes[12] === 1 ? decode.decode(cpmmBytes.subarray(13, 45)) : null,
      createPoolDisabled: raw[9] !== 0, tradeFeeUnitsPerMillion: raw.readBigUInt64LE(12),
      currentCreatePoolFeeLamports: raw.readBigUInt64LE(36),
      binaryCompatibilityProven: false,
    },
    metadataProgram: METADATA,
    treasury: { address: TREASURY, accountPresent: !!treasury, owner: treasury?.owner, signerControlProven: false },
  };
}

async function verifyReleaseControl(rpc, program, mode) {
  assert(!OLD_PROGRAMS.has(program), 'A dedicated Mainnet program identity is required.');
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

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  assert((mode === 'quote' && args.length === 2) || (mode === 'verify' && args.length === 4) ||
    (mode === 'dependencies' && args.length === 0) || (mode === 'verify-control' && args.length === 2),
    'Usage: mainnet-readonly.mjs quote ELF_BYTES PROGRAMDATA_CAPACITY | verify ELF_PATH SHA256 PROGRAM AUTHORITY | verify-control PROGRAM MODE | dependencies');
  const rpcUrl = new URL(process.env.JEET_MAINNET_READ_RPC ?? 'https://api.mainnet-beta.solana.com/');
  assert(rpcUrl.protocol === 'https:' && !rpcUrl.username && !rpcUrl.password && !rpcUrl.hash, 'HTTPS Solana RPC required.');
  const rpc = createServerWalletRpc(rpcUrl.href);
  assert.equal(await rpc.getGenesisHash().send(timeout()), MAINNET_GENESIS, 'RPC must point to Solana Mainnet.');
  const report = mode === 'quote'
    ? await quote(rpc, amount(args[0]), amount(args[1]))
    : mode === 'verify' ? await verify(rpc, args[0], args[1], address(args[2]), address(args[3]))
      : mode === 'verify-control' ? await verifyReleaseControl(rpc, address(args[0]), args[1])
        : await dependencies(rpc);
  console.log(JSON.stringify({ network: 'mainnet', checkedAt: new Date().toISOString(), ...report },
    (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
}

if (import.meta.main) main().catch(error => {
  // RPC errors can contain authenticated provider URLs. Avoid printing raw transport diagnostics.
  console.error(error instanceof assert.AssertionError ? error.message : 'Mainnet read-only check failed.');
  process.exitCode = 1;
});
