// One owner-authorized Devnet-only loader upgrade. Never imports treasury/test-wallet keys.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash,randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as k from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
const approved='a3eb77a2ad629e5142bde5db92a4e4adb8a008fc';
const candidateHash='e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c';
const oldHash='13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa';
const program='Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D';
const loader='BPFLoaderUpgradeab1e11111111111111111111111';
const out='artifacts/readiness/controlled-upgrade/execution';
const privateDir='/workspaces/.jeet-devnet/syncnative-upgrade-a3eb77a';
const priorFees=2935000,feeCap=4600000,rentCap=1400000000;
assert.equal(process.env.JEET_APPROVED_SYNCNATIVE_UPGRADE,approved,'Explicit execution guard missing');
assert.equal(execFileSync('git',['rev-parse',approved],{encoding:'utf8'}).trim(),approved);
const hash=b=>createHash('sha256').update(b).digest('hex');
const binaryPath='artifacts/readiness/candidates/syncnative-devnet/jeet_launch_custody.so';
const binary=await fs.readFile(binaryPath),old=await fs.readFile('artifacts/devnet/fee-65-35/jeet_launch_custody.so');
assert.equal(hash(binary),candidateHash);assert.equal(hash(old),oldHash);
assert.equal(hash(execFileSync('git',['show',approved+':jeet-app-next/'+binaryPath])),candidateHash);
const manifest=JSON.parse(await fs.readFile('artifacts/readiness/candidates/syncnative-devnet/manifest.json'));
for(const [p,h] of Object.entries(manifest.sourceSha256))assert.equal(hash(await fs.readFile(p)),h,p);
const deployment=JSON.parse(await fs.readFile('artifacts/devnet/fee-65-35/deployment-verification.json'));
const lifecycle=JSON.parse(await fs.readFile('artifacts/devnet/fee-65-35/lifecycle-jeettest/summary.json'));
assert.equal(deployment.program,program);assert.equal(deployment.cumulativeDeploymentFeesLamports,priorFees);
assert.equal(deployment.treasury,'HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP');
assert(binary.includes(Buffer.from(k.getAddressEncoder().encode(deployment.treasury))));
// Reuse the approved independent read-only assertions before loading any signing key.
execFileSync(process.execPath,['scripts/readiness/prepare-syncnative-upgrade.mjs'],{stdio:'ignore',timeout:180000});
const pre=JSON.parse(await fs.readFile('artifacts/readiness/controlled-upgrade/fresh-preflight.json'));
assert.equal(pre.currentHash,oldHash);assert.equal(pre.candidateHash,candidateHash);
assert(pre.bufferRentLamports<=rentCap);assert(pre.estimatedCumulativeFeesLamports<=feeCap);
assert(pre.availableAfterBufferBaseFeesAndLifecycleReserveLamports>0);
assert.equal(pre.authority,'DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW');
assert.equal(pre.payer,'BAZK4s9BBN3x4XGhjG3tj4P6jGky8cnNHBUdMsoHGFyg');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let lastRpc=0,id=0;
async function rpc(method,params=[]){
 for(let attempt=0;attempt<3;attempt++){
  await sleep(Math.max(0,650-(Date.now()-lastRpc)));lastRpc=Date.now();
  const response=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(15000)});
  if(response.status===429&&method!=='sendTransaction'&&attempt<2){await response.body?.cancel();await sleep(1000*2**attempt);continue;}
  assert.equal(response.status,200,'RPC HTTP '+response.status);const body=await response.json();
  if(body.error){const e=Error('RPC '+method+' '+JSON.stringify(body.error));e.rpcError=body.error;throw e;}return body.result;
 }throw Error('Persistent RPC rate limiting');
}
assert.equal(await rpc('getGenesisHash'),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const acct=async(address,commitment='confirmed')=>(await rpc('getAccountInfo',[address,{encoding:'base64',commitment}])).value;
const bytes=a=>Buffer.from(a.data[0],'base64'),dec=k.getAddressDecoder();
const applicationKeys=[...new Set([lifecycle.mint,lifecycle.creatorWallet,...Object.values(lifecycle.addresses)])].filter(x=>x&&x!==lifecycle.addresses.system&&x!==lifecycle.addresses.token);
const beforeApplication=(await rpc('getMultipleAccounts',[applicationKeys,{encoding:'base64',commitment:'finalized'}])).value;
const fingerprint=a=>a?{owner:a.owner,executable:a.executable,lamports:a.lamports,dataSha256:hash(bytes(a))}:null;
const key=async name=>{const p='/workspaces/.jeet-devnet/'+name+'.json';assert.equal((await fs.stat(p)).mode&0o077,0,'Insecure signer permissions');return k.createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(await fs.readFile(p,'utf8'))));};
const payer=await key('payer'),authority=await key('upgrade-authority');assert.equal(payer.address,pre.payer);assert.equal(authority.address,pre.authority);
assert.equal((await acct(payer.address,'finalized')).lamports,pre.payerBalanceLamports,'Payer changed after preflight');
assert.equal(hash(bytes(await acct(deployment.programdata,'finalized')).subarray(45,45+old.length)),oldHash);
// Exclusive directory is the one-attempt/process lock. Existing state must be recovered, never replaced.
await fs.mkdir(privateDir,{mode:0o700});await fs.mkdir(out,{recursive:true});
const seed=randomBytes(32);await fs.writeFile(privateDir+'/buffer-seed.json',JSON.stringify([...seed]),{mode:0o600,flag:'wx'});
const buffer=await k.createKeyPairSignerFromPrivateKeyBytes(seed);assert.equal(await acct(buffer.address),null);
const journal={approvedCheckpoint:approved,program,candidateHash,oldHash,payer:payer.address,authority:authority.address,treasury:deployment.treasury,buffer:buffer.address,startedAt:new Date().toISOString(),pid:process.pid,priorFees,feeCap,rentCap,preflight:pre,applicationBefore:applicationKeys.map((pubkey,i)=>({pubkey,...fingerprint(beforeApplication[i])})),receipts:[],expired:[],pending:null,completed:false,stopRequested:false};
let fees=0,retries=0;
const save=async()=>{journal.feesThisAttemptLamports=fees;journal.cumulativeFeesLamports=priorFees+fees;await fs.writeFile(privateDir+'/journal.json',JSON.stringify(journal,null,2),{mode:0o600});const {pending,...pub}=journal;await fs.writeFile(out+'/progress.json',JSON.stringify({...pub,pending:pending?{label:pending.label,signature:pending.signature,expectedFee:pending.expectedFee}:null},null,2));};
process.on('SIGTERM',()=>{journal.stopRequested=true;});process.on('SIGINT',()=>{journal.stopRequested=true;});
const tag=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const meta=(address,role=0,signer)=>({address,role,...(signer?{signer}:{})});
const signed=(s,role=2)=>meta(s.address,role,s),ix=(data,accounts)=>({programAddress:loader,data,accounts});
let life=null,lifeTime=0;
async function send(label,instructions,expectedFee,remainingBase=0){
 for(let attempt=0;attempt<3;attempt++){
  assert(!journal.stopRequested,'Stop requested at safe transaction boundary');assert(!journal.pending,'Unresolved pending signature');
  assert(priorFees+fees+expectedFee+remainingBase+10000<=feeCap,'Fee cap/cleanup reserve would be exceeded');
  if(!life||Date.now()-lifeTime>15000){life=(await rpc('getLatestBlockhash',[{commitment:'confirmed'}])).value;lifeTime=Date.now();}
  let message=k.setTransactionMessageFeePayerSigner(payer,k.createTransactionMessage({version:'legacy'}));message=k.setTransactionMessageLifetimeUsingBlockhash({...life,lastValidBlockHeight:BigInt(life.lastValidBlockHeight)},message);message=k.appendTransactionMessageInstructions(instructions,message);
  const tx=await k.signTransactionMessageWithSigners(message),wire=k.getBase64EncodedWireTransaction(tx),signature=k.getSignatureFromTransaction(tx);assert(Buffer.from(wire,'base64').length<=1232,'Packet limit');
  // Fresh message quote before each funded or authority-changing operation and each new blockhash batch.
  const fee=(await rpc('getFeeForMessage',[k.getBase64Decoder().decode(tx.messageBytes),{commitment:'confirmed'}])).value;assert.equal(fee,expectedFee,'Unexpected fee');
  journal.pending={label,signature,expectedFee,lastValidBlockHeight:life.lastValidBlockHeight,wire};await save();
  if(label==='upgrade'){
   const simulation=(await rpc('simulateTransaction',[wire,{encoding:'base64',sigVerify:true,commitment:'confirmed'}])).value;await fs.writeFile(out+'/upgrade-simulation.json',JSON.stringify(simulation,null,2));
   if(simulation.err){journal.pending=null;await save();throw Error('Final upgrade simulation failed: '+JSON.stringify(simulation.err));}
  }
  try{assert.equal(await rpc('sendTransaction',[wire,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]),signature);}catch(error){journal.lastSendError=String(error.message).slice(0,1000);await save();if(error.rpcError?.code===-32002){journal.pending=null;await save();throw error;}}
  let expired=false,confirmed=false;
  for(let poll=0;poll<110;poll++){
   const status=(await rpc('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0];
   if(status?.err){const t=await rpc('getTransaction',[signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:0}]);assert(t?.meta);fees+=t.meta.fee;journal.receipts.push({label,signature,feeLamports:t.meta.fee,err:status.err,slot:t.slot});journal.pending=null;await save();throw Error('Confirmed failed transaction '+signature);}
   if(status&&(status.confirmationStatus==='confirmed'||status.confirmationStatus==='finalized')){confirmed=true;break;}
   if(poll%5===4&&(await rpc('getBlockHeight',[{commitment:'finalized'}]))>life.lastValidBlockHeight){
    const finalStatus=(await rpc('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0];
    if(!finalStatus){expired=true;break;}
   }await sleep(900);
  }
  if(expired){
   journal.expired.push({label,signature});journal.pending=null;await save();life=null;assert(++retries<=20,'Global retry cap');if(!label.startsWith('write-'))throw Error('Non-write expired; stop for reconciliation');
   const at=Number(label.slice(6)),range=bytes(await acct(buffer.address)).subarray(37+at,37+Math.min(at+960,binary.length));
   assert(range.every(n=>n===0),'Expired signature has nonzero buffer range; reconcile instead of duplicate writing');continue;
  }
  assert(confirmed,'Confirmation deadline; pending signature must be reconciled before any retry');
  let receipt=null;for(let i=0;i<5&&!receipt;i++){receipt=await rpc('getTransaction',[signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:0}]);if(!receipt)await sleep(1000);}
  assert(receipt?.meta&&!receipt.meta.err,'Receipt missing or failed');assert.equal(receipt.meta.fee,expectedFee);
  fees+=receipt.meta.fee;journal.receipts.push({label,signature,slot:receipt.slot,feeLamports:receipt.meta.fee,computeUnits:receipt.meta.computeUnitsConsumed,explorer:'https://explorer.solana.com/tx/'+signature+'?cluster=devnet'});journal.pending=null;await save();return signature;
 }throw Error('Per-range retry limit');
}
async function bufferData(expectedAuthority){const a=await acct(buffer.address);assert(a&&a.owner===loader);const b=bytes(a);assert.equal(b.length,binary.length+37);assert.equal(b.readUInt32LE(),1);assert.equal(b[4],1);assert.equal(dec.decode(b.subarray(5,37)),expectedAuthority);return b;}
try{
 await save();console.log('PREFLIGHT_PASSED_SINGLE_BUFFER',buffer.address,'rent',pre.bufferRentLamports,'new-base-fees',pre.newBaseFeesLamports);
 await send('create-buffer',[getCreateAccountInstruction({payer,newAccount:buffer,lamports:BigInt(pre.bufferRentLamports),space:BigInt(binary.length+37),programAddress:loader}),ix(tag(0),[meta(buffer.address,1),meta(payer.address)])],10000,1445000);
 const initial=await bufferData(payer.address);assert(initial.subarray(37).every(x=>x===0));
 for(let offset=0;offset<binary.length;offset+=960){
  const chunk=binary.subarray(offset,offset+960),data=Buffer.alloc(16+chunk.length);data.writeUInt32LE(1);data.writeUInt32LE(offset,4);data.writeBigUInt64LE(BigInt(chunk.length),8);chunk.copy(data,16);
  await send('write-'+offset,[ix(data,[meta(buffer.address,1),signed(payer)])],5000,(Math.ceil((binary.length-offset)/960)-1)*5000+15000);
  const b=await bufferData(payer.address);assert(b.subarray(37+offset,37+offset+chunk.length).equals(chunk),'Written range mismatch');journal.chunksVerified=Math.ceil((offset+chunk.length)/960);await save();if(journal.chunksVerified%16===0)console.log('UPLOAD_VERIFIED',journal.chunksVerified,'of',286,'cumulative-fees',priorFees+fees);
 }
 const uploaded=await bufferData(payer.address);assert.equal(hash(uploaded.subarray(37)),candidateHash);journal.fullBufferVerified=true;await save();
 // No authority transfer until complete byte equality. Revalidate live old executable and payer before handoff.
 const livePd=bytes(await acct(deployment.programdata));assert.equal(hash(livePd.subarray(45,45+old.length)),oldHash);assert.equal(dec.decode(livePd.subarray(13,45)),authority.address);assert((await acct(payer.address)).lamports>=lifecycle.remainingLifecycleBudgetLamports+25000);
 await send('handoff',[ix(tag(4),[meta(buffer.address,1),signed(payer),meta(authority.address)])],5000,10000);await bufferData(authority.address);journal.authorityHandoffVerified=true;await save();
 const compute={programAddress:'ComputeBudget111111111111111111111111111111',accounts:[],data:new Uint8Array([2,192,92,21,0])};
 const upgrade=ix(tag(3),[meta(deployment.programdata,1),meta(program,1),meta(buffer.address,1),meta(payer.address,1),meta('SysvarRent111111111111111111111111111111111'),meta('SysvarC1ock11111111111111111111111111111111'),signed(authority)]);
 const signature=await send('upgrade',[compute,upgrade],10000);
 let finalized=false;for(let n=0;n<100;n++){const s=(await rpc('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0];assert(!s?.err);if(s?.confirmationStatus==='finalized'){finalized=true;break;}await sleep(1000);}assert(finalized,'Upgrade finalization deadline');
 for(let i=0;i<journal.receipts.length;i+=100){const statuses=(await rpc('getSignatureStatuses',[journal.receipts.slice(i,i+100).map(t=>t.signature),{searchTransactionHistory:true}])).value;assert(statuses.every(s=>s&&!s.err&&s.confirmationStatus==='finalized'),'Receipt not finalized');}
 const pdAccount=await acct(deployment.programdata,'finalized'),pd=bytes(pdAccount);assert.equal(hash(pd.subarray(45,45+binary.length)),candidateHash);assert(pd.subarray(45+binary.length).every(x=>x===0));assert.equal(dec.decode(pd.subarray(13,45)),authority.address);assert((await acct(program,'finalized')).executable);assert.equal(await acct(buffer.address,'finalized'),null,'Buffer not closed by loader');
 const afterApplication=(await rpc('getMultipleAccounts',[applicationKeys,{encoding:'base64',commitment:'finalized'}])).value;
 for(let i=0;i<applicationKeys.length;i++)assert.deepEqual(fingerprint(afterApplication[i]),fingerprint(beforeApplication[i]),'Existing account changed '+applicationKeys[i]);
 const payerFinal=(await acct(payer.address,'finalized')).lamports;
 const pdBefore=pre.preservedAccountSnapshots.find(a=>a.pubkey===deployment.programdata).lamports;
 assert.equal(pre.payerBalanceLamports+pdBefore,payerFinal+pdAccount.lamports+fees,'Rent/fee conservation');assert.equal(fees,1455000);assert(priorFees+fees<=feeCap);
 Object.assign(journal,{completed:true,finalized:true,upgradeSignature:signature,finalHash:candidateHash,upgradeAuthorityUnchanged:true,applicationAccountsUnchanged:true,feesBps:{platform:65,creator:35,total:100},bufferClosed:true,bufferRentRecoveredLamports:pre.bufferRentLamports,payerFinalLamports:payerFinal,programDataFinalLamports:pdAccount.lamports,finishedAt:new Date().toISOString()});await save();console.log('FINALIZED_UPGRADE_VERIFIED',signature,candidateHash,'newFees',fees,'cumulativeFees',priorFees+fees,'payerFinal',payerFinal);
}catch(error){journal.failure=String(error.message).slice(0,2000);await save();console.error('STOPPED_SAFELY',journal.failure,'pending',journal.pending?.signature??null,'buffer',buffer.address,'feesConfirmed',fees);process.exitCode=1;}
