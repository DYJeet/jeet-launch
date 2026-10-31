// Genuine provider test; never uses a stub transport or a signing key. No Solana transactions.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createLocalLaunchAssets } from '../src/lib/local-launch-assets.ts';
import { pinataCredentialAvailable } from '../src/lib/pinata-metadata-storage.ts';
import { resolveMetadataUri } from '../src/lib/metadata-storage-uri.ts';
import { validateMetadataFields } from '../src/lib/launch-metadata.ts';
if(!pinataCredentialAvailable(process.env.PINATA_JWT)){
 console.error('BLOCKED: PINATA_JWT is absent or not a JWT in this runtime. Use secure runtime secret settings; do not paste it into chat or a terminal command.');process.exitCode=2;
}else{
 try{
  process.env.JEET_METADATA_STORAGE='pinata';
  const png=await sharp({create:{width:8,height:8,channels:4,background:{r:156,g:255,b:67,alpha:1}}}).png().toBuffer();
  const input={name:'JeeT storage verification',symbol:'JSTORE',description:'Disposable JeeT Launch IPFS provider verification. Not a launched token.',imageBase64:png.toString('base64'),mime:'image/png',website:'https://example.com'};
  const result=await createLocalLaunchAssets(input,'http://127.0.0.1:3099');
  assert.equal(result.storage,'pinata');assert.ok(result.uri.startsWith('ipfs://'));assert.ok(result.imageUri.startsWith('ipfs://'));
  validateMetadataFields(input.name,input.symbol,result.uri);
  const response=await fetch(resolveMetadataUri(result.uri,'http://127.0.0.1:3099').url,{redirect:'error',signal:AbortSignal.timeout(30000)});
  assert.equal(response.ok,true);
  const text=await response.text();assert.ok(Buffer.byteLength(text)<=32000);
  const metadata=JSON.parse(text);
  assert.equal(metadata.name,input.name);assert.equal(metadata.symbol,input.symbol);assert.equal(metadata.description,input.description);assert.equal(metadata.image,result.imageUri);
  assert.equal(createHash('sha256').update(text).digest('hex'),result.sha256);
  const evidence={completed:true,provider:'Pinata public IPFS',testedAt:new Date().toISOString(),image:result.storageEvidence.image,metadata:result.storageEvidence.metadata,imageSha256:createHash('sha256').update(png).digest('hex'),tokenMetadataUriAccepted:true,browserWalletVerified:false,solanaTransactions:0,limitations:['Account public-file records and exact current gateway bytes verified; indefinite pinning not guaranteed.','No assets automatically deleted: retain for refresh verification. Only these disposable file IDs may be manually cleaned up after acceptance.','This script is provider/API verification, not browser-wallet creation proof.']};
  const directory='programs/launch-custody/target/v6-pinata';await mkdir(directory,{recursive:true});await writeFile(directory+'/live-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log('VERIFIED live Pinata image + metadata upload, account records and exact retrieval.');console.log(JSON.stringify(evidence,null,2));
 }catch{console.error('FAILED: live Pinata verification did not complete. Check credential permissions (public file upload/read), gateway availability and account plan. No token was created.');process.exitCode=1;}
}
