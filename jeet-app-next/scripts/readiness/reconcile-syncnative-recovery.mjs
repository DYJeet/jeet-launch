// Read-only recovery: never signs, submits, funds, closes or upgrades anything.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir='artifacts/readiness/controlled-upgrade';
const journal=JSON.parse(await readFile(dir+'/execution/progress.json'));
assert(journal.completed&&journal.finalized&&journal.pending===null);
assert.equal(journal.chunksVerified,286);assert.equal(journal.receipts.length,289);
assert.equal(journal.expired.length,0);assert(!journal.failure);
assert.equal(new Set(journal.receipts.map(t=>t.signature)).size,289);
assert.equal(journal.receipts.filter(t=>t.label==='upgrade').length,1);
for(let offset=0;offset<274496;offset+=960)assert.equal(journal.receipts.filter(t=>t.label==='write-'+offset).length,1);
const fees=journal.receipts.reduce((n,t)=>n+t.feeLamports,0);assert.equal(fees,1455000);assert.equal(fees+journal.priorFees,4390000);
let last=0;
async function rpc(method,params=[]){
 assert(['getGenesisHash','getSignatureStatuses','getTransaction','getMultipleAccounts'].includes(method));
 for(let n=0;n<3;n++){
  await new Promise(r=>setTimeout(r,Math.max(0,650-(Date.now()-last))));last=Date.now();
  const r=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  if(r.status===429&&n<2){await r.body?.cancel();await new Promise(r=>setTimeout(r,1000*2**n));continue;}
  assert.equal(r.status,200);const j=await r.json();assert(!j.error,JSON.stringify(j.error));return j.result;
 }throw Error('Bounded RPC attempts exhausted');
}
assert.equal(await rpc('getGenesisHash'),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
for(let i=0;i<journal.receipts.length;i+=100){
 const receipts=journal.receipts.slice(i,i+100),s=(await rpc('getSignatureStatuses',[receipts.map(t=>t.signature),{searchTransactionHistory:true}])).value;
 for(let n=0;n<s.length;n++){assert(s[n]&&!s[n].err&&s[n].confirmationStatus==='finalized');assert.equal(s[n].slot,receipts[n].slot);}
}
const keyReceipts=[];
for(const receipt of journal.receipts.filter(t=>['create-buffer','handoff','upgrade'].includes(t.label))){
 const tx=await rpc('getTransaction',[receipt.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 assert(tx&&!tx.meta.err);assert.equal(tx.meta.fee,receipt.feeLamports);assert.equal(tx.slot,receipt.slot);
 assert(tx.transaction.message.accountKeys.includes(journal.buffer));
 const pi=tx.transaction.message.accountKeys.indexOf(journal.payer),bi=tx.transaction.message.accountKeys.indexOf(journal.buffer);assert(pi>=0&&bi>=0);
 if(receipt.label==='create-buffer'){
  assert.equal(tx.meta.postBalances[bi]-tx.meta.preBalances[bi],journal.bufferRentRecoveredLamports);
  assert.equal(tx.meta.preBalances[pi]-tx.meta.postBalances[pi],journal.bufferRentRecoveredLamports+tx.meta.fee);
 }
 if(receipt.label==='upgrade'){
  assert.equal(tx.meta.preBalances[bi],journal.bufferRentRecoveredLamports);assert.equal(tx.meta.postBalances[bi],0);
  assert.equal(tx.meta.postBalances[pi]-tx.meta.preBalances[pi]+tx.meta.fee,journal.bufferRentRecoveredLamports);
 }
 keyReceipts.push({...receipt,confirmedSignerCount:tx.transaction.signatures.length,finalized:true});
}
const snap=await rpc('getMultipleAccounts',[journal.applicationBefore.map(t=>t.pubkey),{encoding:'base64',commitment:'finalized'}]);
const sha=b=>createHash('sha256').update(b).digest('hex');
for(let i=0;i<journal.applicationBefore.length;i++){
 const expected=journal.applicationBefore[i],actual=snap.value[i];
 if(!expected.owner){assert.equal(actual,null);continue;}
 assert(actual);for(const key of ['owner','lamports','executable'])assert.equal(actual[key],expected[key],expected.pubkey+' '+key);
 assert.equal(sha(Buffer.from(actual.data[0],'base64')),expected.dataSha256,expected.pubkey);
}
const state=JSON.parse(await readFile(dir+'/independent-finalized-verification.json'));
assert.equal(state.artifactSha256,journal.candidateHash);assert.equal(state.payerBalanceLamports,journal.payerFinalLamports);
assert.equal(state.programDataBalanceLamports,journal.programDataFinalLamports);assert(state.bufferClosed);
const old=await readFile('artifacts/devnet/fee-65-35/jeet_launch_custody.so');assert.equal(sha(old),journal.oldHash);
const report={checkedAt:new Date().toISOString(),readOnly:true,recoveryTransactionsSubmitted:0,uploader:'original uploader completed during interruption; not restarted',approvedCheckpoint:journal.approvedCheckpoint,program:journal.program,candidateHash:journal.candidateHash,oldExecutablePreservedSha256:sha(old),uploadChunksVerified:286,receiptsReverifiedFinalized:289,onChainFailedTransactions:0,expiredAttempts:0,pendingTransactions:0,applicationAccountsReverifiedUnchanged:journal.applicationBefore.length,accountSnapshotSlot:snap.context.slot,upgradeCompleted:true,upgradeSignature:journal.upgradeSignature,completedAt:journal.finishedAt,buffer:journal.buffer,bufferClosed:true,bufferRentRecoveredLamports:journal.bufferRentRecoveredLamports,bufferRentOutstandingLamports:0,feesThisUpgradeLamports:fees,priorDeploymentFeesLamports:journal.priorFees,cumulativeFeesLamports:fees+journal.priorFees,approvedCumulativeFeeCapLamports:journal.feeCap,feeHeadroomLamports:journal.feeCap-fees-journal.priorFees,payerFinalLamports:state.payerBalanceLamports,treasury:journal.treasury,upgradeAuthority:journal.authority,feesBps:journal.feesBps,keyReceipts};
await writeFile(dir+'/recovery-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
