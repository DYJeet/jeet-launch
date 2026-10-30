// Contract/failure tests only. A stub provider is not evidence of real IPFS persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pinMetadataFile } from '../src/lib/pinata-metadata-storage.ts';
const bytes=new TextEncoder().encode('actual bytes');
const cid='b'+'a'.repeat(58);
test('pinning uses server bearer auth, explicit public network and verifies exact retrieved bytes',async()=>{
 let calls=0;
 const result=await pinMetadataFile(bytes,'metadata.json','application/json','test-token',async(url,init)=>{
  if(calls++===0){assert.equal(url,'https://uploads.pinata.cloud/v3/files');assert.equal(init.headers.authorization,'Bearer test-token');assert.equal(init.body.get('network'),'public');assert.equal(init.redirect,'error');return Response.json({data:{cid,size:bytes.length}});}
  assert.equal(url,'https://gateway.pinata.cloud/ipfs/'+cid);assert.equal(init.headers,undefined);return new Response(bytes);
 }); assert.equal(calls,2);assert.equal(result.cid,cid);
});
test('missing credentials fail before any upload',async()=>{
 await assert.rejects(pinMetadataFile(bytes,'x.json','application/json','',()=>{throw Error('must not call');}),/missing/);
});
test('provider error does not leak credential/error body',async()=>{
 await assert.rejects(pinMetadataFile(bytes,'x.json','application/json','test-token',async()=>new Response('secret',{status:401})),e=>!e.message.includes('secret')&&e.message.includes('401'));
});
test('substituted provider identity fails before retrieval',async()=>{
 await assert.rejects(pinMetadataFile(bytes,'x.json','application/json','test-token',async()=>Response.json({data:{cid:'../../evil',size:bytes.length}})),/identity/);
});
test('corrupted or unavailable persisted bytes cannot be marked uploaded',async()=>{
 for(const response of [new Response('wrong'),new Response('no',{status:404})]) {
  let n=0;await assert.rejects(pinMetadataFile(bytes,'x.json','application/json','test-token',async()=>n++===0?Response.json({data:{cid,size:bytes.length}}):response),/mismatch|retrievable/);
 }
});
