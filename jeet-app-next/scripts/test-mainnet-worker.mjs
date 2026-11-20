// Local workerd only. No hosted resource or Solana connection.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { generateKeyPairSigner } from '@solana/kit';
import { MAINNET_GENESIS } from '../src/lib/wallet-environment.ts';
import { checkIndex } from './readiness/mainnet-hosted.mjs';
import { DEVNET_INDEX_NAMESPACE } from '../src/lib/shared-backend.ts';

const require = createRequire(join(process.env.JEET_WORKER_TOOLS_ROOT ?? resolve('workers/shared-devnet'), 'package.json'));
const { build } = require('esbuild');
const { Miniflare } = require('miniflare');
// Optionally exercise the exact prepared hosting profile, without deploying it.
const profilePath = process.env.JEET_MAINNET_WORKER_CONFIG;
const profile = profilePath ? JSON.parse(await readFile(profilePath, 'utf8')) : undefined;
if (profile) {
  assert.equal(profile.vars.JEET_SHARED_PROFILE, 'mainnet');
  assert.notEqual(profile.name, 'jeet-launch-shared-devnet');
  assert.deepEqual(profile.migrations, [{ tag: 'v1', new_sqlite_classes: ['JeetSharedIndex'] }]);
  assert.deepEqual(profile.durable_objects.bindings, [{ name: 'JEET_SHARED', class_name: 'JeetSharedIndex' }]);
  assert(!profile.routes && !profile.route, 'Preview must not modify domain routes.');
}

test('Mainnet Worker cannot accept Devnet index traffic or rebind persisted state to another program', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jeet-mainnet-worker-'));
  const bundle = join(dir, 'worker.mjs');
  let runtime;
  try {
    await build({
      entryPoints: ['workers/shared-devnet/src/worker.mjs'], outfile: bundle, bundle: true, platform: 'node',
      format: 'esm', target: 'es2022', external: ['cloudflare:workers'],
      alias: { 'node:sqlite': resolve('workers/shared-devnet/src/sqlite-unavailable.ts') },
    });
    const script = await readFile(bundle, 'utf8');
    const program = profile?.vars.JEET_SHARED_MAINNET_PROGRAM_ID ?? (await generateKeyPairSigner()).address;
    const namespace = MAINNET_GENESIS + ':' + program;
    const token = 'mainnet-worker-local-fixture-authorization';
    const stream = 'launch-activations-v1';
    const head = { anchor: '2'.repeat(64), backfilled: true };
    const open = id => new Miniflare({
      modules: true, script, compatibilityDate: profile?.compatibility_date ?? '2026-07-01',
      compatibilityFlags: profile?.compatibility_flags ?? ['nodejs_compat'], durableObjects: { JEET_SHARED: { className: 'JeetSharedIndex', useSQLite: true } },
      durableObjectsPersist: join(dir, 'persist'),
      bindings: {
        JEET_SHARED_PROFILE: 'mainnet', JEET_SHARED_BACKEND_TOKEN: token,
        ...(id === undefined ? {} : { JEET_SHARED_MAINNET_PROGRAM_ID: id }),
      },
    });
    const call = async (op, args, credential = token) => {
      const response = await runtime.dispatchFetch('https://worker.test/v1/index', {
        method: 'POST', headers: { authorization: 'Bearer ' + credential, 'content-type': 'application/json' },
        body: JSON.stringify({ op, args }),
      });
      const text = await response.text();
      return { status: response.status, result: response.ok ? JSON.parse(text).result : undefined };
    };
    runtime = open(undefined);
    assert.equal((await call('checkpoint', [namespace, stream], 'invalid')).status, 401);
    assert.equal((await call('checkpoint', [namespace, stream])).status, 503);
    await runtime.dispose();
    runtime = open(program);
    assert.equal((await call('checkpoint', [DEVNET_INDEX_NAMESPACE, stream])).status, 400);
    assert.equal((await call('commitDiscovery', [namespace, stream, {}, head, [], Date.now()])).result, true);
    await runtime.dispose();
    runtime = open(program);
    const hostedProbe = await checkIndex(
      { url: 'https://worker.test', token }, program,
      (url, init) => runtime.dispatchFetch(url, init),
    );
    assert.deepEqual(hostedProbe.checkpoint, head);
    await runtime.dispose();
    const other = (await generateKeyPairSigner()).address;
    runtime = open(other);
    assert.equal((await call('checkpoint', [MAINNET_GENESIS + ':' + other, stream])).status, 503);
  } finally {
    await runtime?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
