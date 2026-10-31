// Full server pipeline with simulated provider transport, NOT live IPFS verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createLocalLaunchAssets } from '../src/lib/local-launch-assets.ts';
import { validateMetadataFields } from '../src/lib/launch-metadata.ts';
const cidFor=(bytes)=>{
 const b=Buffer.concat([Buffer.from([1,0x55,0x12,32]),createHash('sha256').update(bytes).digest()]);
 const alphabet='abcdefghijklmnopqrstuvwxyz234567';let bits=0,acc=0,s='b';
 for(const n of b){acc=(acc<<8)|n;bits+=8;while(bits>=5){bits-=5;s+=alphabet[(acc>>>bits)&31];}acc&=(1<<bits)-1;}
 if(bits)s+=alphabet[(acc<<(5-bits))&31];return s;
};
test('validated image → public IPFS image → matching JSON → IPFS metadata; retries reuse receipts',async()=>{
 const old={jwt:process.env.PINATA_JWT,storage:process.env.JEET_METADATA_STORAGE,fetch:globalThis.fetch};
 try{
  process.env.PINATA_JWT='pipeline.payload.signature';process.env.JEET_METADATA_STORAGE='pinata';
  const png=await sharp({create:{width:8,height:8,channels:4,background:'#9cff43'}}).png().toBuffer();
  const records=new Map(),contents=new Map();let uploads=0;
  globalThis.fetch=async(url,init)=>{
   if(url==='https://uploads.pinata.cloud/v3/files'){
    assert.ok(init.headers.authorization);assert.equal(init.body.get('network'),'public');
    const bytes=new Uint8Array(await init.body.get('file').arrayBuffer()),cid=cidFor(bytes),id=`00000000-0000-0000-0000-${String(++uploads).padStart(12,'0')}`;
    const data={id,cid,size:bytes.length};records.set(id,data);contents.set(cid,bytes);return Response.json({data});
   }
   if(url.startsWith('https://api.pinata.cloud/v3/files/public/'))return Response.json({data:records.get(url.split('/').at(-1))});
   assert.equal(init.headers,undefined);const bytes=contents.get(url.split('/').at(-1));assert.ok(bytes);return new Response(bytes);
  };
  const input={name:'JeeT pipeline',symbol:'JPIPE',description:'Test document',website:'https://example.com',twitter:'https://x.com/example',telegram:'https://t.me/example',mime:'image/png',imageBase64:png.toString('base64')};
  const result=await createLocalLaunchAssets(input,'http://127.0.0.1:3006');
  assert.equal(uploads,2);assert.ok(result.uri.startsWith('ipfs://'));assert.ok(result.document.image.startsWith('ipfs://'));assert.notEqual(result.uri,result.imageUri);
  assert.equal(result.document.name,input.name);assert.equal(result.document.symbol,input.symbol);assert.equal(result.document.description,input.description);
  assert.equal(result.storageEvidence.image.accountStatus,'public-file-record-confirmed');assert.equal(result.storageEvidence.metadata.accountStatus,'public-file-record-confirmed');
  validateMetadataFields(input.name,input.symbol,result.uri);
  assert.deepEqual(await createLocalLaunchAssets(input,'http://127.0.0.1:3006'),result);assert.equal(uploads,2);
  await assert.rejects(createLocalLaunchAssets({...input,website:'javascript:alert(1)'},'http://127.0.0.1:3006'));
  await assert.rejects(createLocalLaunchAssets({...input,imageBase64:Buffer.from('<svg/>').toString('base64')},'http://127.0.0.1:3006'));
  assert.equal(uploads,2);
 }finally{
  globalThis.fetch=old.fetch;for(const [key,val]of [['PINATA_JWT',old.jwt],['JEET_METADATA_STORAGE',old.storage]]){if(val===undefined)delete process.env[key];else process.env[key]=val;}
 }
});
