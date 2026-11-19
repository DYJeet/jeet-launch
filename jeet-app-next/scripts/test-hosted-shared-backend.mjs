// Owner-authorized HTTPS backend acceptance. No wallets, signing, funding or Solana submissions.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { SharedBackendClient, sharedBackendConfiguration, backendJson, backendParse } from '../src/lib/shared-backend-client.ts';
import { curveTradeEvents, feeClaimEvents } from '../src/lib/curve-history.ts';
const phase = process.argv[2]; assert(['before', 'final'].includes(phase));
const endpoint = 'https://jeet-launch-shared-devnet.victorriccardi24.workers.dev';
const tokenPath = '/home/codespace/.config/jeet-launch/shared-backend-token';
assert.equal((await stat(tokenPath)).mode & 0o777, 0o600);
const token = (await readFile(tokenPath, 'utf8')).trim();
process.env.JEET_SHARED_BACKEND_URL = endpoint; process.env.JEET_SHARED_BACKEND_TOKEN = token;
const clients = [new SharedBackendClient(sharedBackendConfiguration()), new SharedBackendClient(sharedBackendConfiguration())];
const dir = 'artifacts/hosting-unblock/cloudflare-hosted'; await mkdir(dir, { recursive: true });
const stateFile = dir + '/state.json'; let count = 0; const checks = [];
const call = (op, args, client = 0) => { count++; return clients[client].call(op, args); };
async function raw(op, args, credential = token, bytes) {
 count++; const r = await fetch(endpoint + '/v1/index', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { authorization: 'Bearer ' + credential, 'content-type': 'application/json', 'user-agent': 'JeeT-Launch-Backend/1.0' }, body: bytes ?? backendJson({ op, args }) });
 const status = r.status; await r.body?.cancel(); return status;
}
const base = 'artifacts/public-beta/post-upgrade-acceptance-162ad9f/';
const receipt = JSON.parse(await readFile(base + 'receipts.json', 'utf8'));
assert.equal(receipt.program, 'Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D');
const network = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG:' + receipt.program;
const stream = receipt.mint + ':curve';
const events = [];
for (const entry of receipt.receipts) {
 const tx = JSON.parse(await readFile(base + entry.label + '-finalized-transaction.json', 'utf8'));
 assert.equal(tx.meta.err, null); assert.equal(tx.slot, entry.slot); assert.equal(tx.transaction.signatures[0], entry.signature);
 const fields = { signature: entry.signature, slot: String(tx.slot), time: tx.blockTime };
 events.push(...curveTradeEvents(tx.meta.logMessages, receipt.program, receipt.mint).map(e => ({ ...fields, id: entry.signature + ':trade:' + e.sequence, kind: e.sell ? 'sell' : 'buy', wallet: e.wallet, tokens: String(e.tokens), lamports: String(e.raw) })));
 events.push(...feeClaimEvents(tx.meta.logMessages, receipt.program, receipt.mint).map((e, i) => ({ ...fields, id: entry.signature + ':claim:' + i, kind: e.platform ? 'platform-claim' : 'creator-claim', wallet: e.beneficiary, lamports: String(e.paid) })));
}
assert.equal(events.length, 3); assert.deepEqual(events.map(e => e.kind), ['buy', 'sell', 'creator-claim']);
const expectedVolume = { lamports: events.slice(0, 2).reduce((n, e) => n + BigInt(e.lamports), 0n), tokens: events.slice(0, 2).reduce((n, e) => n + BigInt(e.tokens), 0n), trades: 2 };
const head = { head: events[2].signature, before: events[0].signature, backfilled: false };
async function reconcile() {
 const snapshot = await call('historySnapshot', [network, stream]);
 assert.deepEqual(new Set(snapshot.events.map(e => e.id)), new Set(events.map(e => e.id)));
 assert.deepEqual(snapshot.volume, expectedVolume);
 assert.deepEqual(await call('checkpoint', [network, stream]), head);
 assert.equal(snapshot.checkpoint?.backfilled ?? false, false);
 return snapshot;
}
let state;
try {
 if (phase === 'before') {
  await assert.rejects(readFile(stateFile), e => e.code === 'ENOENT');
  state = { endpoint, run: randomUUID(), startedAt: new Date().toISOString(), dataSource: 'Three archived, independently finalized genuine JEETTEST receipts; partial history, not a new chain test', rpcWrites: 0 };
  await writeFile(stateFile, backendJson(state) + '\n');
  assert.equal(await raw('checkpoint', [network, stream], ''), 401); assert.equal(await raw('checkpoint', [network, stream], 'wrong-owner-test-credential'), 401);
  checks.push('Unauthenticated and incorrect-credential requests rejected');
  assert.equal(await raw('checkpoint', ['mainnet', stream]), 400); assert.equal(await raw('exec', ['DROP TABLE launches']), 400); assert.equal(await raw('checkpoint', [], token, 'x'.repeat(131073)), 413);
  checks.push('Namespace, arbitrary SQL and oversized-body restrictions');
  assert.deepEqual(await call('checkpoint', [network, stream]), {});
  const first = { head: events[1].signature, before: events[0].signature, backfilled: false };
  const winners = await Promise.all(clients.map((_, i) => call('commit', [network, stream, {}, first, events.slice(0, 2)], i))); assert.equal(winners.filter(Boolean).length, 1);
  checks.push('Concurrent real-receipt checkpoint CAS has one winner');
  assert.equal(await raw('commit', [network, stream, first, head, [events[2], { ...events[0], lamports: '999' }]]), 400);
  assert.equal((await call('historySnapshot', [network, stream])).events.length, 2); assert.deepEqual(await call('checkpoint', [network, stream]), first);
  checks.push('Conflict after partial batch rolls back claim, totals and cursor');
  assert(await call('commit', [network, stream, first, head, [events[2]]])); assert(await call('commit', [network, stream, head, head, events]));
  await reconcile(); checks.push('Genuine receipt replay is idempotent and volume conserved');
  const key = n => createHash('sha256').update('jeet-hosted-acceptance:' + state.run + ':' + n).digest('hex');
  state.uploadClient = key('upload'); state.globalProbeClient = key('global-after-restart'); state.uploadHour = Math.floor(Date.now() / 3600000);
  assert(3600000 - Date.now() % 3600000 > 90000, 'Run quota check away from an hour boundary');
  const clientQuota = await Promise.all(Array.from({ length: 8 }, (_, i) => call('admit', [state.uploadClient, 'upload'], i % 2))); assert.equal(clientQuota.filter(Boolean).length, 2);
  const globalQuota = await Promise.all(Array.from({ length: 10 }, (_, i) => call('admit', [key('global-' + Math.floor(i / 2)), 'upload'], i % 2))); assert.equal(globalQuota.filter(Boolean).length, 8); assert.equal(await call('admit', [state.globalProbeClient, 'upload']), false);
  checks.push('Two independent clients share atomic client and global upload quotas');
  const oldInstance = await call('__acceptance_instance', []);
  assert.equal(await raw('__acceptance_abort', []), 503);
  const newInstance = await call('__acceptance_instance', []); assert.notEqual(oldInstance.instance, newInstance.instance);
  assert.equal(Math.floor(Date.now() / 3600000), state.uploadHour);
  await reconcile(); assert.equal(await call('admit', [state.uploadClient, 'upload']), false); assert.equal(await call('admit', [state.globalProbeClient, 'upload']), false);
  checks.push('Forced Durable Object restart recovers exact history, cursor, volume and both quotas');
  state.databaseBytes = newInstance.databaseBytes; state.restartObserved = true;
  state.network = await call('__acceptance_network', []);
  state.networkReady = !!(state.network.genesis.matches && state.network.program.executable && state.network.metadata.matches);
 } else {
  state = backendParse(await readFile(stateFile, 'utf8')); assert(state.restartObserved);
  await reconcile();
  if (Math.floor(Date.now() / 3600000) === state.uploadHour) { assert.equal(await call('admit', [state.uploadClient, 'upload']), false); assert.equal(await call('admit', [state.globalProbeClient, 'upload']), false); checks.push('Quotas retained after restoring the prepared Worker'); }
  assert.equal(await raw('__acceptance_instance', []), 400); assert.equal(await raw('__acceptance_abort', []), 400); assert.equal(await raw('__acceptance_network', []), 400);
  assert.equal(await raw('checkpoint', [network, stream], ''), 401);
  checks.push('Prepared Worker restored, all temporary probe operations removed, authentication enforced');
 }
 state[phase] = { status: 'PASS', checks, requests: count, completedAt: new Date().toISOString() };
 await writeFile(stateFile, backendJson(state) + '\n'); console.log(JSON.stringify({ phase, status: 'PASS', checks, requests: count, databaseBytes: state.databaseBytes, network: state.network, allHostedNetworkChecksPassed: state.networkReady }, null, 2));
} catch (e) { if (state) { state[phase] = { status: 'FAIL', error: e.message, requests: count }; await writeFile(stateFile, backendJson(state) + '\n'); } throw e; }
