// Provider contract tests use injected transport. They are NOT genuine IPFS evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pinMetadataFile, pinataCredentialAvailable } from '../src/lib/pinata-metadata-storage.ts';
import { resolveMetadataUri, validMetadataCid } from '../src/lib/metadata-storage-uri.ts';
import { createLocalUploadLimiter } from '../src/lib/local-upload-limit.ts';
import { validateMetadataFields } from '../src/lib/launch-metadata.ts';
const bytes=new TextEncoder().encode('actual bytes');
const cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
const id='e5323ea7-8a02-4486-9b6f-63c788810aeb';
const data={id,cid,size:bytes.length};
let counter=0;const jwt=()=>`test${++counter}.payload.signature`;
function provider(overrides={}){let calls=[];return {calls,request:async(url,init)=>{calls.push({url,init});if(url.startsWith('https://uploads.'))return overrides.upload?.()??Response.json({data});if(url.startsWith('https://api.'))return overrides.account?.()??Response.json({data});return overrides.gateway?.()??new Response(bytes);}};}
test('JWT presence check rejects API key/secret pair and whitespace without revealing them',()=>{
 assert.equal(pinataCredentialAvailable(undefined),false);assert.equal(pinataCredentialAvailable('api-key'),false);assert.equal(pinataCredentialAvailable('a.b.c\n'),false);assert.equal(pinataCredentialAvailable(jwt()),true);
});
test('public upload, authenticated account record and exact gateway bytes; credentials never sent to gateway',async()=>{
 const p=provider(),token=jwt();const r=await pinMetadataFile(bytes,'metadata.json','application/json',token,p.request);
 assert.equal(r.uri,'ipfs://'+cid);assert.equal(r.accountStatus,'public-file-record-confirmed');assert.equal(p.calls.length,3);
 assert.equal(p.calls[0].init.body.get('network'),'public');assert.equal(p.calls[0].init.headers.authorization,'Bearer '+token);
 assert.equal(p.calls[1].url,'https://api.pinata.cloud/v3/files/public/'+id);assert.equal(p.calls[2].init.headers,undefined);
 for(const c of p.calls){assert.equal(c.init.redirect,'error');assert.ok(c.init.signal);}
});
test('missing credential and invalid input reject before upload',async()=>{
 for(const [b,name,mime,token] of [[bytes,'x.json','application/json',''],[new Uint8Array(),'x.json','application/json',jwt()],[bytes,'../x','application/json',jwt()],[bytes,'x.svg','image/svg+xml',jwt()]])await assert.rejects(pinMetadataFile(b,name,mime,token,()=>{throw Error('must not call');}));
});
test('provider HTTP failures and transport exceptions cannot leak credentials or provider bodies',async()=>{
 const token=jwt();for(const request of [async()=>new Response(token,{status:401}),async()=>{throw Error('Authorization: Bearer '+token);}])await assert.rejects(pinMetadataFile(bytes,'x.json','application/json',token,request),e=>!e.message.includes(token)&&!e.message.includes('Authorization'));
});
test('substituted CID, size, missing file ID, or account record rejects',async()=>{
 for(const bad of [{...data,cid:'../../evil'},{...data,size:1},{cid,size:bytes.length}]){const p=provider({upload:()=>Response.json({data:bad})});await assert.rejects(pinMetadataFile(bytes,'x.json','application/json',jwt(),p.request));}
 const p=provider({account:()=>Response.json({data:{...data,id:'00000000-0000-0000-0000-000000000000'}})});await assert.rejects(pinMetadataFile(bytes,'x.json','application/json',jwt(),p.request));
});
test('corrupt, oversized, unavailable or malformed responses reject instead of claiming persistence',async()=>{
 for(const gateway of [()=>new Response('wrong'),()=>new Response(new Uint8Array(100)),()=>new Response('no',{status:404})]){const p=provider({gateway});await assert.rejects(pinMetadataFile(bytes,'x.json','application/json',jwt(),p.request));}
 for(const upload of [()=>new Response('not json'),()=>new Response('x'.repeat(17000))]){const p=provider({upload});await assert.rejects(pinMetadataFile(bytes,'x.json','application/json',jwt(),p.request));}
});
test('concurrent identical requests coalesce; confirmed receipt retries reverify without another POST',async()=>{
 const p=provider(),token=jwt();const [a,b]=await Promise.all([pinMetadataFile(bytes,'x.json','application/json',token,p.request),pinMetadataFile(bytes,'x.json','application/json',token,p.request)]);assert.deepEqual(a,b);await pinMetadataFile(bytes,'x.json','application/json',token,p.request);assert.equal(p.calls.filter(c=>c.init.method==='POST').length,1);
});
test('gateway failure after returned upload receipt can resume verification without another upload',async()=>{
 let fail=true;const p=provider({gateway:()=>fail?new Response('no',{status:503}):new Response(bytes)}),token=jwt();await assert.rejects(pinMetadataFile(bytes,'x.json','application/json',token,p.request));fail=false;await pinMetadataFile(bytes,'x.json','application/json',token,p.request);assert.equal(p.calls.filter(c=>c.init.method==='POST').length,1);
});
test('canonical ipfs URI is accepted by existing on-chain metadata SDK and resolved only to approved gateway',()=>{
 assert.equal(validMetadataCid(cid),true);assert.equal(validMetadataCid('b'+'a'.repeat(58)),false);
 const uri='ipfs://'+cid;validateMetadataFields('JeeT','JEET',uri);assert.equal(resolveMetadataUri(uri,'http://127.0.0.1:3006').url,'https://gateway.pinata.cloud/ipfs/'+cid);
 for(const bad of ['https://evil.test/x','ipfs://'+cid+'/extra','https://user:pass@gateway.pinata.cloud/ipfs/'+cid,uri+'?x=1','ipfs://../../evil'])assert.throws(()=>resolveMetadataUri(bad,'http://127.0.0.1:3006'));
});
test('local URI retains exact content-hash check and upload budget has deterministic expiry',()=>{
 const hash='a'.repeat(64);assert.equal(resolveMetadataUri('http://127.0.0.1:3006/api/local-assets/'+hash+'.json','http://127.0.0.1:3006').sha256,hash);
 const admit=createLocalUploadLimiter(2,100);assert.equal(admit(10),true);assert.equal(admit(11),true);assert.equal(admit(12),false);assert.equal(admit(110),true);
});
