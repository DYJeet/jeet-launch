// Synthetic configuration regressions. Every child has a distinct compiled network profile.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSigner } from '@solana/kit';
import { test } from 'node:test';

const program = (await generateKeyPairSigner()).address;
const environment = {
  ...process.env,
  NEXT_PUBLIC_JEET_WALLET_NETWORK: 'mainnet',
  NEXT_PUBLIC_JEET_MAINNET_PROGRAM_ID: program,
  NEXT_PUBLIC_JEET_PUBLIC_BETA: '0',
  JEET_MAINNET_PROGRAM_ID: program,
  JEET_MAINNET_READ_PREVIEW: '1',
  JEET_MAINNET_PREVIEW_ORIGIN: 'https://candidate.example',
  JEET_MAINNET_READ_RPC: 'https://approved-rpc.example/provider-credential',
  JEET_LOCAL_WALLET: '', JEET_DEVNET_WALLET: '',
  VERCEL: '', VERCEL_ENV: '', VERCEL_URL: '',
};
function run(code, changes = {}) {
  return spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', code],
    { env: { ...environment, ...changes }, encoding: 'utf8' });
}
function passed(result) { assert.equal(result.status, 0, result.stderr); }

test('Mainnet preview pins program and genesis, exact HTTPS origin, and rejects Production', () => {
  passed(run(`
    import assert from 'node:assert/strict';
    import { localWalletConfiguration, walletModeEnabled } from './src/lib/local-wallet-server.ts';
    import { validateWalletEnvironment, MAINNET_GENESIS } from './src/lib/wallet-environment.ts';
    import { WALLET_PROGRAM_ADDRESS } from './src/lib/wallet-program.ts';
    const request = (headers = {}) => new Request('https://candidate.example/api/wallet/environment', {
      headers: { host: 'candidate.example', origin: 'https://candidate.example', ...headers },
    });
    assert(walletModeEnabled());
    const { environment } = localWalletConfiguration(request());
    assert.equal(environment.program, WALLET_PROGRAM_ADDRESS);
    assert.equal(environment.genesis, MAINNET_GENESIS);
    assert.equal(environment.chain, 'solana:mainnet');
    assert.throws(() => validateWalletEnvironment({ ...environment, chain: 'solana:devnet' }));
    assert.throws(() => validateWalletEnvironment({ ...environment, genesis: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' }));
    assert.throws(() => localWalletConfiguration(request({ host: 'attacker.example' })));
    assert.throws(() => localWalletConfiguration(request({ origin: 'https://attacker.example' })));
    assert.throws(() => localWalletConfiguration(request({ 'sec-fetch-site': 'cross-site' })));
    const navigation = new Request('https://candidate.example/token/example', { headers: {
      host: 'candidate.example', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document',
    } });
    assert(localWalletConfiguration(navigation, { pageNavigation: true }));
    assert.throws(() => localWalletConfiguration(navigation));
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'candidate.example';
    assert.throws(() => localWalletConfiguration(request()));
    process.env.VERCEL_ENV = 'preview';
    assert(localWalletConfiguration(request()));
    process.env.VERCEL_URL = 'other.example';
    assert.throws(() => localWalletConfiguration(request()));
  `));
});

test('Mainnet transaction access stays closed even when legacy write settings are enabled', () => {
  passed(run(`
    import assert from 'node:assert/strict';
    import { PUBLIC_BETA_READ_ONLY, publicBetaServerReadOnly, assertTransactionsEnabled } from './src/lib/public-beta.ts';
    import { marketStore } from './src/lib/market-store.ts';
    import { admitPublicRequest } from './src/lib/public-read-limit.ts';
    assert(PUBLIC_BETA_READ_ONLY && publicBetaServerReadOnly());
    assert.throws(assertTransactionsEnabled, /disabled/);
    delete process.env.JEET_SHARED_BACKEND_URL;
    delete process.env.JEET_SHARED_BACKEND_TOKEN;
    assert.throws(marketStore, /durable shared index/);
    assert.equal(await admitPublicRequest(new Request('https://candidate.example')), false);
    const { WalletTransactionExecutor } = await import('./src/lib/wallet-transactions.ts');
    const execute = WalletTransactionExecutor.prototype.execute;
    let accessedWallet = false;
    await assert.rejects(execute.call({ connection: () => { accessedWallet = true; } }), /disabled/);
    assert.equal(accessedWallet, false);
  `, { JEET_DEVNET_PUBLIC_WRITES: '1', JEET_PHANTOM_ACCEPTANCE_SHA: 'a'.repeat(64) }));
});

test('Mainnet pool derivation, swap attribution and archive selection never use the Devnet profile', () => {
  passed(run(`
    import assert from 'node:assert/strict';
    import { address } from '@solana/kit';
    import { defaultGraduationProfile, graduationAddresses, CPMM_MAINNET_PROGRAM, CPMM_TEST_PROGRAM } from './src/lib/launch-graduation.ts';
    import { ammHistoryPool } from './src/lib/amm-history.ts';
    import { historyArchiveEndpoint } from './src/lib/history-recovery.ts';
    import { MAINNET_GENESIS, DEVNET_GENESIS } from './src/lib/wallet-environment.ts';
    const mint = address('So11111111111111111111111111111111111111112');
    const accounts = await graduationAddresses(mint, 1n);
    assert.equal(defaultGraduationProfile.amm, CPMM_MAINNET_PROGRAM);
    const terms = { mint, migrated: true, pool: accounts.pool, config: accounts.config,
      migrator: accounts.migrator, ammProgram: CPMM_MAINNET_PROGRAM };
    assert.equal((await ammHistoryPool(mint, terms)).config, accounts.config);
    await assert.rejects(ammHistoryPool(mint, { ...terms, ammProgram: CPMM_TEST_PROGRAM }));
    process.env.JEET_MAINNET_ARCHIVE_RPC = 'https://mainnet-archive.example';
    process.env.JEET_DEVNET_ARCHIVE_RPC = 'https://devnet-archive.example';
    assert.equal(historyArchiveEndpoint(MAINNET_GENESIS), 'https://mainnet-archive.example/');
    assert.equal(historyArchiveEndpoint(DEVNET_GENESIS), 'https://devnet-archive.example/');
    assert.equal(historyArchiveEndpoint('local-fixture'), undefined);
  `));
});

test('Mainnet read preview requires an explicit dedicated program and is rejected by Production build configuration', () => {
  for (const id of ['', '11111111111111111111111111111111',
    '8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo',
    'Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D']) {
    assert.notEqual(run("await import('./src/lib/wallet-program.ts')", { NEXT_PUBLIC_JEET_MAINNET_PROGRAM_ID: id }).status, 0);
  }
  assert.notEqual(run("await import('./next.config.ts')", { VERCEL: '1', VERCEL_ENV: 'production' }).status, 0);
  passed(run("await import('./next.config.ts')", { VERCEL: '1', VERCEL_ENV: 'preview' }));
});

test('Mainnet creation, metadata, activation and buy messages include canonical release control while sells retain their account ABI', () => {
  passed(run(`
    import assert from 'node:assert/strict';
    import { createNoopSigner, generateKeyPairSigner, compileTransaction, createTransactionMessage,
      appendTransactionMessageInstructions, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
      getTransactionEncoder } from '@solana/kit';
    import { walletLaunchAddresses, walletLaunchParameters, initializeWalletLaunchInstructions,
      activateWalletLaunchInstructions } from './src/lib/wallet-launch.ts';
    import { initializeLaunchMetadataInstruction } from './src/lib/launch-metadata.ts';
    import { tradeInstructions } from './src/lib/wallet-v5-trade.ts';
    import { mainnetReleaseControl } from './src/lib/mainnet-release-control.ts';
    import { WALLET_PROGRAM_ADDRESS } from './src/lib/wallet-program.ts';
    const creator = createNoopSigner((await generateKeyPairSigner()).address);
    const mint = (await generateKeyPairSigner()).address;
    const l = await walletLaunchAddresses(mint, creator.address);
    const control = await mainnetReleaseControl(WALLET_PROGRAM_ADDRESS);
    assert.equal(l.releaseControl, control);
    const params = walletLaunchParameters({ name: 'Synthetic launch', symbol: 'SYN',
      uri: 'ipfs://bafkreicsyxczhcmdur2arx44cthughlu5kttxhb72y7fcgpzsc5kap2gn4',
      supply: '1000000000', decimals: 9, creatorPercent: '1', capPercent: '1', capEnabled: true,
      capDuration: 10000n, openingDuration: 100n, openingDelay: 0n, openingLimitBps: 50 });
    const metadata = await initializeLaunchMetadataInstruction({ ...l, creator, name: 'Synthetic launch', symbol: 'SYN',
      uri: 'ipfs://bafkreicsyxczhcmdur2arx44cthughlu5kttxhb72y7fcgpzsc5kap2gn4',
      mutable: false, maxCostLamports: 100000000n });
    const market = { launch: { addresses: l }, wallet: creator.address, needsAta: false,
      destination: l.creatorAta, receipt: (await generateKeyPairSigner()).address };
    const quote = { amount: 1n, sold: 0n, raw: 1n, bound: 2n, sequence: 0n };
    const buy = await tradeInstructions(market, { ...quote, sell: false }, creator);
    const sell = await tradeInstructions(market, { ...quote, sell: true }, creator);
    const batches = [initializeWalletLaunchInstructions(creator, l, params),
      activateWalletLaunchInstructions(creator, l, params), [metadata], buy];
    const seen = new Set();
    for (const batch of batches) {
      for (const ix of batch) if (ix.programAddress === WALLET_PROGRAM_ADDRESS) {
        seen.add(ix.data[0]);
        assert.equal(ix.accounts.at(-1).address, control);
        assert.equal(ix.accounts.at(-1).role, 0);
      }
      let message = setTransactionMessageFeePayer(creator.address, createTransactionMessage({ version: 0 }));
      message = setTransactionMessageLifetimeUsingBlockhash({
        blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100n,
      }, message);
      assert(getTransactionEncoder().encode(compileTransaction(appendTransactionMessageInstructions(batch, message))).length <= 1232);
    }
    assert.deepEqual([...seen].sort((a,b) => a-b), [0,2,16,19,21,23]);
    const redemption = sell.find(ix => ix.programAddress === WALLET_PROGRAM_ADDRESS);
    assert.equal(redemption.data[0], 20);
    assert(!redemption.accounts.some(meta => meta.address === control));
  `));
});
