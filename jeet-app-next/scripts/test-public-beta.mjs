import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.NEXT_PUBLIC_JEET_PUBLIC_BETA='1';
process.env.NEXT_PUBLIC_JEET_WALLET_NETWORK='devnet';
const { WalletTransactionExecutor }=await import('../src/lib/wallet-transactions.ts');
const { DEVNET_GENESIS }=await import('../src/lib/wallet-environment.ts');
const { DEVNET_WALLET_PROGRAM }=await import('../src/lib/wallet-program.ts');
const { localWalletConfiguration }=await import('../src/lib/local-wallet-server.ts');
const { assertTransactionsEnabled,publicBetaServerReadOnly }=await import('../src/lib/public-beta.ts');
const { createPublicReadLimiter }=await import('../src/lib/public-read-limit.ts');
test('public beta stops before accessing wallet, building instructions, RPC or signing',async()=>{
 let accesses=0;
 const executor=new WalletTransactionExecutor({network:'devnet',chain:'solana:devnet',genesis:DEVNET_GENESIS,program:DEVNET_WALLET_PROGRAM,rpcPath:'/api/wallet/rpc'},'http://127.0.0.1:1',()=>{accesses++;throw Error('Unexpected wallet access');},{get:()=>null,put:()=>{accesses++;},remove:()=>{accesses++;}});
 await assert.rejects(executor.execute(async()=>{accesses++;return [];},0n),/disabled pending post-upgrade acceptance/);
 assert.equal(accesses,0);
});
test('public server remains read-only on Vercel',()=>{process.env.VERCEL='1';assert(publicBetaServerReadOnly());assert.throws(assertTransactionsEnabled,/disabled/);});
test('canonical and exact deployment origins work; foreign and spoofed forwarded hosts fail',()=>{
 process.env.JEET_DEVNET_WALLET='1';process.env.JEET_DEVNET_WALLET_ORIGIN='https://jeet-launch-community-preview.vercel.app';process.env.VERCEL_URL='beta-exact.vercel.app';
 for(const host of ['jeet-launch-community-preview.vercel.app','beta-exact.vercel.app']) assert.equal(localWalletConfiguration(new Request('https://'+host,{headers:{host,origin:'https://'+host}})).environment.genesis,DEVNET_GENESIS);
 for(const headers of [{host:'evil.example','x-forwarded-host':'beta-exact.vercel.app'},{host:'beta-exact.vercel.app',origin:'https://evil.example'},{host:'beta-exact.vercel.app','sec-fetch-site':'cross-site'}]) assert.throws(()=>localWalletConfiguration(new Request('https://beta-exact.vercel.app',{headers})));
});
test('per-client admission is bounded and resets only after its window',()=>{const admit=createPublicReadLimiter();for(let i=0;i<60;i++)assert(admit('a',100));assert(!admit('a',101));assert(admit('a',60101));});
test('per-instance global ceiling limits rotating client identifiers',()=>{const admit=createPublicReadLimiter();for(let i=0;i<240;i++)assert(admit('c'+i,100));assert(!admit('new-client',101));assert(admit('new-client',60101));});
