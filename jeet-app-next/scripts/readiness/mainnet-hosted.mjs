// Read-only release probes: finalized RPC, authenticated indexing read, and pinned public metadata.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dedicatedSigner } from '../../src/lib/mainnet-identity.ts';
import { MAINNET_GENESIS } from '../../src/lib/wallet-environment.ts';
import { createServerWalletRpc } from '../../src/lib/wallet-rpc-server.ts';
import { DEVNET_INDEX_NAMESPACE } from '../../src/lib/shared-backend.ts';
import { SharedBackendClient, sharedBackendConfiguration } from '../../src/lib/shared-backend-client.ts';
import { resolveMetadataUri } from '../../src/lib/metadata-storage-uri.ts';
import { readBoundedMetadata } from '../../src/lib/metadata-read.ts';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const stream = 'launch-activations-v1';
const timeout = () => AbortSignal.timeout(15000);

async function rpcIdentity(endpoint) {
  const url = new URL(endpoint);
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'Private Mainnet HTTPS RPC is required.');
  const rpc = createServerWalletRpc(url.href);
  assert.equal(await rpc.getGenesisHash().send({ abortSignal: timeout() }), MAINNET_GENESIS, 'Provider RPC must use Mainnet.');
  return { commitment: 'finalized', slot: await rpc.getSlot({ commitment: 'finalized' }).send({ abortSignal: timeout() }) };
}

export async function checkIndex(configuration, program, request = fetch) {
  const client = new SharedBackendClient(configuration, request);
  const namespace = MAINNET_GENESIS + ':' + dedicatedSigner(program);
  const endpoint = configuration.url + '/v1/index';
  const send = (network, authenticated) => request(endpoint, {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: timeout(),
    headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer ' + configuration.token } : {}) },
    body: JSON.stringify({ op: 'checkpoint', args: [network, stream] }),
  });
  for (const [network, auth, expected] of [[namespace, false, 401], [DEVNET_INDEX_NAMESPACE, true, 400]]) {
    const response = await send(network, auth);
    await response.body?.cancel();
    assert.equal(response.status, expected, 'Index must enforce authentication and reject the Devnet namespace.');
  }
  const checkpoint = await client.call('checkpoint', [namespace, stream]);
  assert(checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint), 'Index returned an invalid checkpoint.');
  return { namespace, authentication: true, rejectsDevnet: true, checkpoint };
}

export async function checkMetadata(uri, metadataSha, imageSha, request = fetch) {
  assert.match(metadataSha, /^[0-9a-f]{64}$/);
  assert.match(imageSha, /^[0-9a-f]{64}$/);
  const read = (input, max) => readBoundedMetadata(resolveMetadataUri(input, '').url, max, timeout(), request);
  const metadata = await read(uri, 32768);
  assert.equal(digest(metadata), metadataSha, 'Public metadata bytes do not match their reviewed hash.');
  const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata));
  assert(typeof document.name === 'string' && typeof document.symbol === 'string' && typeof document.image === 'string',
    'Metadata document is missing token fields.');
  const image = await read(document.image, 2097152);
  assert.equal(digest(image), imageSha, 'Public image bytes do not match their reviewed hash.');
  return { metadataBytes: metadata.length, imageBytes: image.length, metadataSha256: metadataSha, imageSha256: imageSha };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const index = mode === 'stack' && args.length === 4;
  assert(index || (mode === 'metadata' && args.length === 3),
    'Usage: mainnet-hosted.mjs stack PROGRAM METADATA_URI METADATA_SHA256 IMAGE_SHA256 | metadata METADATA_URI METADATA_SHA256 IMAGE_SHA256');
  let rpc, sharedIndex;
  if (index) {
    const config = sharedBackendConfiguration();
    assert(config && new URL(config.url).protocol === 'https:', 'Private Mainnet index environment is required.');
    assert(process.env.JEET_MAINNET_READ_RPC, 'Set the approved Mainnet provider RPC.');
    rpc = await rpcIdentity(process.env.JEET_MAINNET_READ_RPC);
    sharedIndex = await checkIndex(config, args[0]);
  }
  const metadata = await checkMetadata(...(index ? args.slice(1) : args));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), rpc, sharedIndex, metadata },
    (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
}

if (import.meta.main) main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message :
    'Hosted read-only probe failed. Check approved RPC, index configuration and public metadata access.');
  process.exitCode = 1;
});
