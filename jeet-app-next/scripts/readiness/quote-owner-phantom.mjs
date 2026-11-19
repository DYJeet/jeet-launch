// Owner-specific quote and unsigned Devnet simulation. No wallet access or submission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as k from '@solana/kit';
import { WalletTransactionExecutor } from '../../src/lib/wallet-transactions.ts';
import { DEVNET_GENESIS } from '../../src/lib/wallet-environment.ts';
import { DEVNET_WALLET_PROGRAM } from '../../src/lib/wallet-program.ts';
import { createServerWalletRpc } from '../../src/lib/wallet-rpc-server.ts';
import { curveTradeStatus, openingBuyLimit, readTradeMarket, tradeInstructions } from '../../src/lib/wallet-v5-trade.ts';
import { v5Quote } from '../../src/lib/v5-pricing.ts';

const CREATOR = k.address('13TckZDu8H8VAXSmkfGqVKMwbeWoJsrsBSk5i1KkA1Uf');
const MINT = k.address('7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM');
const TOKEN_AMOUNT = 2400n * 10n ** 9n;
const commitment = 'confirmed';
const timeout = () => ({ abortSignal: AbortSignal.timeout(15000) });

async function main() {
  const [owner, ...extra] = process.argv.slice(2);
  assert(owner && extra.length === 0, 'Usage: quote-owner-phantom.mjs PUBLIC_DEVNET_PHANTOM_ADDRESS');
  const wallet = k.address(owner);
  assert(!k.isOffCurveAddress(wallet), 'Expected the public Solana signing address of the selected Phantom account.');
  const endpoint = new URL(process.env.JEET_DEVNET_WALLET_RPC ?? 'https://api.devnet.solana.com');
  assert(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.hash, 'Use an approved HTTPS Devnet RPC.');
  const rpc = createServerWalletRpc(endpoint.href);
  const env = { network: 'devnet', chain: 'solana:devnet', genesis: DEVNET_GENESIS,
    program: DEVNET_WALLET_PROGRAM, rpcPath: '/api/wallet/rpc' };
  const executor = new WalletTransactionExecutor(env, endpoint.href, () => { throw Error('No wallet access.'); },
    { get: () => null, put: () => { throw Error('No transaction storage.'); }, remove: () => {} }, undefined, undefined, rpc);
  await executor.network();
  const market = await readTradeMarket(executor, MINT, CREATOR, wallet);
  const { launch } = market;
  const [platform, creator] = launch.fees;
  assert(launch.state && launch.mint.decimals === 9 &&
    ['active', 'eligible'].includes(curveTradeStatus(launch)), 'The pinned JEETTEST curve is unavailable.');
  assert(platform && creator && openingBuyLimit(market) >= TOKEN_AMOUNT, 'The exact 2,400 JEETTEST buy currently exceeds its limit.');
  const state = launch.state;
  const quote = v5Quote(state, state.sold, TOKEN_AMOUNT, platform.accrued, creator.accrued);
  const ixs = await tradeInstructions(market, { ...quote, sell: false, sequence: state.sequence, sold: state.sold,
    bound: quote.user, setup: market.setup }, k.createNoopSigner(wallet));
  const { value: lifetime } = await rpc.getLatestBlockhash({ commitment, minContextSlot: launch.slot }).send(timeout());
  let message = k.createTransactionMessage({ version: 0 });
  message = k.setTransactionMessageFeePayer(wallet, message);
  message = k.setTransactionMessageLifetimeUsingBlockhash(lifetime, message);
  const tx = k.compileTransaction(k.appendTransactionMessageInstructions(ixs, message));
  assert.deepEqual(Object.keys(tx.signatures), [wallet], 'Unexpected signer or fee payer.');
  const result = await rpc.getFeeForMessage(k.getBase64Decoder().decode(tx.messageBytes), { commitment }).send(timeout());
  assert(result.value !== null, 'Fee quote expired.');
  const fee = result.value;
  const walletReserve = await rpc.getMinimumBalanceForRentExemption(0n, { commitment }).send(timeout());
  const grossCap = quote.user + market.setup + fee;
  const minBalance = grossCap + walletReserve;
  const simulation = await rpc.simulateTransaction(k.getBase64EncodedWireTransaction(tx), {
    commitment, encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false, minContextSlot: launch.slot,
  }).send(timeout());
  const ready = market.sol >= minBalance && simulation.value.err === null;
  console.log(JSON.stringify({
    network: 'devnet', program: DEVNET_WALLET_PROGRAM, wallet, mint: MINT,
    quantity: 2400, walletBalanceLamports: market.sol, quoteSlot: launch.slot, simulationSlot: simulation.context.slot,
    curveSequence: state.sequence, priceLamports: quote.raw, platformFeeLamports: quote.platform,
    creatorFeeLamports: quote.creator, networkFeeLamports: fee, accountRentLamports: market.setup,
    needsAssociatedTokenAccount: market.needsAta, minimumBalanceLamports: minBalance,
    maxGrossDebitLamports: grossCap, messageSha256: createHash('sha256').update(tx.messageBytes).digest('hex'),
    simulationError: simulation.value.err, readyForSeparateApproval: ready, signed: false, submitted: false,
  }, (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
  if (!ready) process.exitCode = 1;
}

if (import.meta.main) main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message : 'Read-only Devnet owner quote failed.');
  process.exitCode = 1;
});
