// Executes the actual Next POST handler with local backend and RPC fixtures. No genuine wallet acceptance is asserted.
import assert from 'node:assert/strict';import {test} from 'node:test';
import {registerHooks} from 'node:module';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {createSharedBackend} from '../src/lib/shared-backend.ts';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('@/')?pathToFileURL(resolve('src',specifier.slice(2)+'.ts')).href:specifier,context);}});
const token='fixture-only-no-real-service-credential-000000';
Object.assign(process.env,{NODE_ENV:'production',VERCEL:'1',NEXT_PUBLIC_JEET_PUBLIC_BETA:'0',NEXT_PUBLIC_JEET_WALLET_NETWORK:'devnet',JEET_DEVNET_PUBLIC_WRITES:'1',JEET_DEVNET_WALLET:'1',JEET_DEVNET_WALLET_ORIGIN:'https://candidate.example',JEET_DEVNET_WALLET_RPC:'https://devnet.fixture.example',JEET_SHARED_BACKEND_URL:'https://backend.fixture.example',JEET_SHARED_BACKEND_TOKEN:token,JEET_METADATA_STORAGE:'pinata',PINATA_JWT:'fixture.only.value',JEET_PHANTOM_ACCEPTANCE_SHA:'0'.repeat(64)});
const backend=createSharedBackend(':memory:',token);let writes=0,available=true,failSend=false;
const original=global.fetch;
global.fetch=async(url,options)=>{
 if(String(url).startsWith('https://backend.fixture.example')){if(!available)throw Error('Backend outage fixture');return backend.handle(new Request(url,options));}
 assert.equal(String(url),'https://devnet.fixture.example/','No external network is allowed in this test');
 const body=JSON.parse(options.body);
 if(body.method==='getGenesisHash')return Response.json({jsonrpc:'2.0',id:body.id,result:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'});
 assert.equal(body.method,'sendTransaction');writes++;if(failSend)throw Error('Ambiguous provider response fixture');
 return Response.json({jsonrpc:'2.0',id:body.id,result:'fixture-response-not-a-real-transaction'});
};
const {POST}=await import('../src/app/api/wallet/rpc/route.ts');
const request=()=>new Request('https://candidate.example/api/wallet/rpc',{method:'POST',headers:{host:'candidate.example',origin:'https://candidate.example','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:['AQ==',{encoding:'base64',preflightCommitment:'confirmed',maxRetries:0}]})});
test('actual write route permits only fully configured fixture mode; kill switch and backend outage prevent forwarding',async()=>{
 try{
  assert.equal((await POST(request())).status,200);assert.equal(writes,1);
  process.env.JEET_DEVNET_PUBLIC_WRITES='0';assert.equal((await POST(request())).status,403);assert.equal(writes,1);
  process.env.JEET_DEVNET_PUBLIC_WRITES='1';available=false;assert.equal((await POST(request())).status,429);assert.equal(writes,1);
  available=true;failSend=true;assert.equal((await POST(request())).status,503);assert.equal(writes,2,'An ambiguous send must not be automatically retransmitted');
 }finally{backend.close();global.fetch=original;}
});
