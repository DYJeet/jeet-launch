// Disposable validator only. The expected path contains a newly generated local fixture signer.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AccountRole, address, createClient, createKeyPairSignerFromBytes, lamports,
} from '@solana/kit';
import { solanaRpc, rpcAirdrop } from '@solana/kit-plugin-rpc';
import { generatedPayer, airdropPayer } from '@solana/kit-plugin-signer';
import { systemTransfer } from '../amm/cpmm.mjs';
import { mainnetReleaseControl, releaseControlInstruction } from '../../src/lib/mainnet-release-control.ts';

const [validator, elf, fixtureKey] = process.argv.slice(2);
assert(validator && elf && fixtureKey, 'Provide local validator, local SBF and disposable local signer paths.');
const program = address('36VASLSKLFD2KokjXG7V28veZvXEsyHRKefLonPaAKzv');
const key = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(await readFile(fixtureKey))));
const control = await mainnetReleaseControl(program);
const dir = await mkdtemp(join(tmpdir(), 'jeet-release-control-'));
const log = await open(join(dir, 'validator.log'), 'w');
const rpcUrl = 'http://127.0.0.1:9927';
const child = spawn(validator, [
  '--bind-address', '127.0.0.1', '--rpc-port', '9927', '--faucet-port', '9929',
  '--dynamic-port-range', '13101-13201', '--ledger', join(dir, 'ledger'), '--bpf-program', program, elf, '--log',
], { stdio: ['ignore', log.fd, log.fd] });
await log.close();
let startupError;
child.on('error', error => { startupError = error; });
try {
  const rpc = async (method, params = []) => {
    const result = await fetch(rpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(2500),
    }).then(r => r.json());
    assert(!result.error);
    return result.result;
  };
  for (let retry = 0; ; retry++) {
    if (startupError || child.exitCode !== null || retry >= 100) throw Error('Local validator startup failed. Inspect ' + dir);
    try { if (await rpc('getHealth') === 'ok') break; } catch { /* Wait for local startup. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const requestOptions = { encoding: 'base64', commitment: 'confirmed' };
  const account = async key => (await rpc('getAccountInfo', [key, requestOptions])).value;
  assert((await account(program))?.executable);
  assert.equal(await account(control), null);
  const sponsor = await createClient().use(generatedPayer()).use(solanaRpc({
    rpcUrl, rpcSubscriptionsUrl: 'ws://127.0.0.1:9928',
    transactionConfig: { version: 0, estimateResourceLimits: false },
  })).use(rpcAirdrop()).use(airdropPayer(lamports(100000000n)));
  const mode = async expected => {
    const state = await account(control);
    assert.equal(state.owner, program);
    const data = Buffer.from(state.data[0], 'base64');
    assert.equal(data.subarray(0, 8).toString(), 'JEETCTL1');
    assert.equal(data[9], expected);
  };
  const signatures = [];
  const submit = async instructions => {
    signatures.push(String((await sponsor.sendTransaction(instructions)).context.signature));
  };
  await submit([systemTransfer(sponsor.payer, key.address, 5_000_000n)]);
  await submit([await releaseControlInstruction(program, key, 'initialize')]);
  await mode(0);
  await assert.rejects(sponsor.sendTransaction([await releaseControlInstruction(program, sponsor.payer, 2)]));
  await mode(0);
  for (const next of [1, 2, 0]) {
    await submit([await releaseControlInstruction(program, key, next)]);
    await mode(next);
  }
  const status = await rpc('getSignatureStatuses', [signatures, { searchTransactionHistory: true }]);
  assert(status.value.every(entry => entry?.err === null));
  const off = {
    programAddress: program,
    accounts: [{ address: key.address, signer: key, role: AccountRole.READONLY_SIGNER },
      { address: control, role: AccountRole.READONLY }],
    data: Uint8Array.of(19),
  };
  await assert.rejects(sponsor.sendTransaction([off]), error => JSON.stringify(error, (_, value) => typeof value === 'bigint' ? String(value) : value).includes('1700'));
  await mode(0);
  console.log(JSON.stringify({ network: 'local validator', program, control, signedLocalTransactions: signatures.length,
    verifiedModes: [0, 1, 2, 0], deniedUnauthorizedReopen: true, deniedBuyWhileClosed: true }));
} finally {
  if (child.exitCode === null && child.pid) {
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await done;
    clearTimeout(timer);
  }
}
