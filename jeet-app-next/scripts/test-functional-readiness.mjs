import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MarketStore} from '../src/lib/market-store.ts';
import {ingestMarketPage} from '../src/lib/market-ingest.ts';
import {recoverFinalizedTransaction,archiveEndpoint,historyCoverageGap} from '../src/lib/history-recovery.ts';
import {readBoundedMetadata,cacheValidatedMetadata} from '../src/lib/metadata-read.ts';
import {publicWriteConfigurationReady} from '../src/lib/public-write-policy.ts';
import {admitPublicRequest} from '../src/lib/public-read-limit.ts';
const ready={NEXT_PUBLIC_JEET_PUBLIC_BETA:'0',NEXT_PUBLIC_JEET_WALLET_NETWORK:'devnet',JEET_DEVNET_PUBLIC_WRITES:'1',JEET_DEVNET_WALLET:'1',JEET_PHANTOM_ACCEPTANCE_SHA:'a'.repeat(64),JEET_SHARED_BACKEND_TOKEN:'test-only-'.repeat(5),JEET_SHARED_BACKEND_URL:'https://backend.example',JEET_METADATA_STORAGE:'pinata',PINATA_JWT:'test.only.credential'};
test('write configuration fails closed for every missing safeguard, unaccepted Phantom, wrong network or unsafe backend',()=>{
 assert(publicWriteConfigurationReady(ready));assert(!publicWriteConfigurationReady({}));
 for(const key of Object.keys(ready)){const e={...ready};delete e[key];assert(!publicWriteConfigurationReady(e),key);}
 for(const patch of [{NEXT_PUBLIC_JEET_PUBLIC_BETA:'1'},{NEXT_PUBLIC_JEET_WALLET_NETWORK:'mainnet'},{JEET_SHARED_BACKEND_URL:'http://backend.example'},{JEET_SHARED_BACKEND_URL:'https://secret@backend.example'},{JEET_PHANTOM_ACCEPTANCE_SHA:'unverified'}])assert(!publicWriteConfigurationReady({...ready,...patch}));
});
test('public write admission fails closed without backend and on backend timeout/error; raw IP never forwarded',async()=>{
 const prior={...process.env},oldFetch=global.fetch;try{
  process.env.VERCEL='1';delete process.env.JEET_SHARED_BACKEND_URL;delete process.env.JEET_SHARED_BACKEND_TOKEN;
  assert(!await admitPublicRequest(new Request('https://site'),'write'));
  process.env.JEET_SHARED_BACKEND_URL='https://backend.example';process.env.JEET_SHARED_BACKEND_TOKEN=ready.JEET_SHARED_BACKEND_TOKEN;
  global.fetch=async(_url,options)=>{assert(!options.body.includes('203.0.113.42'));throw Error('credential-bearing transport error');};
  assert(!await admitPublicRequest(new Request('https://site',{headers:{'x-real-ip':'203.0.113.42'}}),'write'));
 }finally{global.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});
test('temporary RPC omission retains the entire page and recovers exactly once using a configured archive',async()=>{
 const store=new MarketStore(':memory:');let available=false,reads=0;
 const entry={signature:'canonical-signature',slot:123n,failed:false};
 const source={signatures:async()=>[entry],events:async()=>recoverFinalizedTransaction(async()=>null,async()=>{reads++;return available?[{id:entry.signature+':trade:1',signature:entry.signature,slot:'123',time:null,kind:'buy',lamports:'100',tokens:'10'}]:null;})};
 try{
  await assert.rejects(ingestMarketPage(store,'devnet','mint:curve',source),/cursor is retained/);assert.deepEqual(store.checkpoint('devnet','mint:curve'),{});assert.equal(store.marketVolume('devnet','mint:curve').trades,0);
  available=true;assert(await ingestMarketPage(store,'devnet','mint:curve',source));assert(await ingestMarketPage(store,'devnet','mint:curve',source));assert.equal(store.marketVolume('devnet','mint:curve').trades,1);assert.equal(reads,2);
 }finally{store.close();}
});
test('primary recovery is bounded and archive endpoints cannot select Mainnet or unsafe transports',async()=>{
 let calls=0;assert.equal(await recoverFinalizedTransaction(async()=>{calls++;return 7;},async()=>{throw Error('Must not run');}),7);assert.equal(calls,1);
 assert.equal(await recoverFinalizedTransaction(async()=>{throw Error('429');},async()=>8),8);
 await assert.rejects(recoverFinalizedTransaction(async()=>null),/incomplete/);
 for(const url of ['http://rpc.example','https://mainnet.rpc.example','https://user:pass@rpc.example','https://rpc.example/#key'])assert.throws(()=>archiveEndpoint(url));
 assert.equal(archiveEndpoint('https://devnet.rpc.example/key'),'https://devnet.rpc.example/key');
});
test('conflicting event replay rolls back page data, volume and cursor together',()=>{
 const store=new MarketStore(':memory:'),event={id:'s:trade:1',signature:'s',slot:'1',time:null,kind:'buy',lamports:'10',tokens:'1'};
 try{assert(store.commit('n','m',{}, {anchor:'s'},[event]));assert.throws(()=>store.commit('n','m',{anchor:'s'},{anchor:'new'},[{...event,lamports:'999'}]),/Conflicting/);assert.deepEqual(store.checkpoint('n','m'),{anchor:'s'});assert.equal(store.marketVolume('n','m').lamports,10n);}finally{store.close();}
});
test('validated metadata caches bounded immutable bytes; denies cache size bypass and aborted readers',async()=>{
 const url='https://gateway.example/immutable-cid';let calls=0;
 const fetcher=async()=>{calls++;return new Response('valid');};const signal=new AbortController().signal;
 const bytes=await readBoundedMetadata(url,20,signal,fetcher);cacheValidatedMetadata(url,bytes);bytes[0]=0;
 assert.equal(new TextDecoder().decode(await readBoundedMetadata(url,20,signal,fetcher)),'valid');assert.equal(calls,1);
 await assert.rejects(readBoundedMetadata(url,2,signal,fetcher),/size limit/);const abort=new AbortController();abort.abort();await assert.rejects(readBoundedMetadata(url,20,abort.signal,fetcher));
});
test('403 gateway errors are explicit, not retried or cached, and oversized streams are bounded',async()=>{
 let calls=0;const denied=async()=>{calls++;return new Response('Cloudflare error code: 1010',{status:403});};
 for(let i=0;i<2;i++)await assert.rejects(readBoundedMetadata('https://gateway.example/denied',20,new AbortController().signal,denied),/HTTP 403/);
 assert.equal(calls,2);await assert.rejects(readBoundedMetadata('https://gateway.example/large',3,new AbortController().signal,async()=>new Response('too-large')),/size limit/);
});

test('history pruning is checked against token birth, not unrelated earlier ledger pruning',()=>{
 assert(!historyCoverageGap(100n,200n));assert(!historyCoverageGap(200n,200n));assert(historyCoverageGap(201n,200n));assert(historyCoverageGap(100n));assert(!historyCoverageGap(0n));
});

test('private local validation keeps existing throughput without weakening public write admission',async()=>{
 const prior={...process.env};try{delete process.env.VERCEL;delete process.env.NEXT_PUBLIC_JEET_PUBLIC_BETA;delete process.env.JEET_SHARED_BACKEND_URL;delete process.env.JEET_SHARED_BACKEND_TOKEN;for(let i=0;i<100;i++)assert(await admitPublicRequest(new Request('http://127.0.0.1'),'write'));process.env.VERCEL='1';assert(!await admitPublicRequest(new Request('https://site'),'write'));}finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});
