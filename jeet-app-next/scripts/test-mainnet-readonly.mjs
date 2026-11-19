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
