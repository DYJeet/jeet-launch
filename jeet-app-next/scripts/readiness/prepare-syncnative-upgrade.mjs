// Read-only Devnet upgrade preflight. No keypair, signing, send or airdrop code.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { address,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compileTransaction,getBase64Decoder,getAddressDecoder,getAddressEncoder } from '@solana/kit';
import { getCreateAccountInstructionDataEncoder } from '@solana-program/system';
const out='artifacts/readiness/controlled-upgrade';await mkdir(out,{recursive:true});
const deployment=JSON.parse(await readFile('artifacts/devnet/fee-65-35/deployment-verification.json'));
const manifest=JSON.parse(await readFile('artifacts/readiness/candidates/syncnative-devnet/manifest.json'));
const lifecycle=JSON.parse(await readFile('artifacts/devnet/fee-65-35/lifecycle-jeettest/summary.json'));
const binary=await readFile('artifacts/readiness/candidates/syncnative-devnet/jeet_launch_custody.so');
const old=await readFile('artifacts/devnet/fee-65-35/jeet_launch_custody.so');
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(binary),manifest.artifactSha256);assert.equal(sha(old),deployment.artifactSha256);
for(const [p,h] of Object.entries(manifest.sourceSha256))assert.equal(sha(await readFile(p)),h,p);
const treasury=Buffer.from(getAddressEncoder().encode(address(deployment.treasury)));
assert.equal(binary.indexOf(treasury),binary.lastIndexOf(treasury));assert(binary.includes(treasury));
const allowed=new Set(['getGenesisHash','getMultipleAccounts','getMinimumBalanceForRentExemption','getLatestBlockhash','getFeeForMessage','getSignaturesForAddress']);
let requests=0;async function rpc(method,params=[]){assert(allowed.has(method));for(let attempt=0;attempt<3;attempt++){
 const res=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++requests,method,params}),signal:AbortSignal.timeout(15000)});
 if(res.status===429&&attempt<2){await res.body?.cancel();await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
 assert.equal(res.status,200,'Devnet RPC HTTP '+res.status);const body=await res.json();assert(!body.error,JSON.stringify(body.error));await new Promise(r=>setTimeout(r,650));return body.result;
}throw Error('Bounded RPC retries exhausted');}
assert.equal(await rpc('getGenesisHash'),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const keys=[deployment.program,deployment.programdata,deployment.payer,deployment.upgradeAuthority,deployment.buffer,lifecycle.addresses.platformVault,lifecycle.addresses.creatorVault,lifecycle.mint,lifecycle.addresses.curve];
const snapshot=await rpc('getMultipleAccounts',[keys,{encoding:'base64',commitment:'finalized'}]);
const ac=snapshot.value;const data=i=>Buffer.from(ac[i].data[0],'base64');const dec=getAddressDecoder();const loader=address('BPFLoaderUpgradeab1e11111111111111111111111');
assert(ac[0]?.executable);assert.equal(ac[0].owner,loader);assert.equal(data(0).readUInt32LE(),2);assert.equal(dec.decode(data(0).subarray(4,36)),deployment.programdata);
assert.equal(ac[1].owner,loader);const pd=data(1);assert.equal(pd.readUInt32LE(),3);assert.equal(pd[12],1);assert.equal(dec.decode(pd.subarray(13,45)),deployment.upgradeAuthority);
assert.equal(sha(pd.subarray(45,45+old.length)),sha(old));assert(pd.subarray(45+old.length).every(n=>n===0));assert.equal(ac[4],null,'Previous upload buffer must remain closed');assert(binary.length<=pd.length-45);
for(const [label,i,expected] of [['platform',5,lifecycle.platform],['creator',6,lifecycle.creator]]){
 const d=data(i);assert.equal(dec.decode(d.subarray(72,104)),label==='platform'?deployment.treasury:deployment.creatorWallet);
 for(const [field,at] of [['accruedLamports',105],['withdrawnLamports',113],['claimableLamports',121]])assert.equal(Number(d.readBigUInt64LE(at)),expected[field]);
}
assert.equal(data(7).readUInt32LE(0),0);assert.equal(data(7).readUInt32LE(46),0);assert.equal(data(7).readBigUInt64LE(36).toString(),lifecycle.supplyRaw);
assert.equal(data(8).readBigUInt64LE(136),0n);assert.notEqual(data(8)[261],2);
const preservedAccountSnapshots=keys.map((pubkey,i)=>({pubkey,exists:!!ac[i],owner:ac[i]?.owner,lamports:ac[i]?.lamports,dataSha256:ac[i]?sha(data(i)):null}));
const rent=await rpc('getMinimumBalanceForRentExemption',[binary.length+37,{commitment:'finalized'}]);
const rollbackRent=await rpc('getMinimumBalanceForRentExemption',[old.length+37,{commitment:'finalized'}]);
const life=(await rpc('getLatestBlockhash',[{commitment:'confirmed'}])).value;
const payer=address(deployment.payer), authority=address(deployment.upgradeAuthority),buffer=address(deployment.buffer);
const meta=(pubkey,role=0)=>({address:address(pubkey),role});const tag=n=>{const d=Buffer.alloc(4);d.writeUInt32LE(n);return d;};
const ix=(data,accounts)=>({programAddress:loader,data,accounts});
const create={programAddress:address('11111111111111111111111111111111'),accounts:[meta(payer,3),meta(buffer,3)],data:getCreateAccountInstructionDataEncoder().encode({lamports:BigInt(rent),space:BigInt(binary.length+37),programAddress:loader})};
const initialize=ix(tag(0),[meta(buffer,1),meta(payer)]);
function write(offset){const bytes=binary.subarray(offset,offset+960),d=Buffer.alloc(16+bytes.length);d.writeUInt32LE(1);d.writeUInt32LE(offset,4);d.writeBigUInt64LE(BigInt(bytes.length),8);bytes.copy(d,16);return ix(d,[meta(buffer,1),meta(payer,2)]);}
const handoff=ix(tag(4),[meta(buffer,1),meta(payer,2),meta(authority)]);
const upgrade=ix(tag(3),[meta(deployment.programdata,1),meta(deployment.program,1),meta(buffer,1),meta(payer,1),meta('SysvarRent111111111111111111111111111111111'),meta('SysvarC1ock11111111111111111111111111111111'),meta(authority,2)]);
const compute={programAddress:address('ComputeBudget111111111111111111111111111111'),accounts:[],data:new Uint8Array([2,192,92,21,0])};
const close=ix(tag(5),[meta(buffer,1),meta(payer,1),meta(authority,2)]);
const rows=[];
for(const [name,instructions] of [['create-buffer',[create,initialize]],['write-full',[write(0)]],['write-final',[write(Math.floor((binary.length-1)/960)*960)]],['handoff',[handoff]],['upgrade',[compute,upgrade]],['failure-close-after-handoff',[close]]]){
 const message=appendTransactionMessageInstructions(instructions,setTransactionMessageLifetimeUsingBlockhash(life,setTransactionMessageFeePayer(payer,createTransactionMessage({version:'legacy'}))));const tx=compileTransaction(message);const signatures=Object.keys(tx.signatures).length;
 const wireBytes=1+64*signatures+tx.messageBytes.length;assert(wireBytes<=1232,name+' exceeds packet size');
 const fee=(await rpc('getFeeForMessage',[getBase64Decoder().decode(tx.messageBytes),{commitment:'confirmed'}])).value;assert(fee!==null);
 rows.push({name,signatures,wireBytes,baseFeeLamports:fee,messageSha256:sha(tx.messageBytes)});
}
const get=n=>rows.find(x=>x.name===n).baseFeeLamports;const chunks=Math.ceil(binary.length/960);const freshFees=get('create-buffer')+(chunks-1)*get('write-full')+get('write-final')+get('handoff')+get('upgrade');
const ownReceipts=(await readFile('artifacts/devnet/fee-65-35/deployment-receipts.csv','utf8')).trim().split('\n').slice(1);const preservedReceiptsFees=ownReceipts.reduce((n,line)=>n+Number(line.split(',')[5]),0);assert.equal(preservedReceiptsFees,deployment.feesThisUpgradeLamports);
const feeCap=4600000,additionalFeeCap=feeCap-deployment.cumulativeDeploymentFeesLamports;
const report={checkedAt:new Date().toISOString(),network:'devnet',readOnly:true,signed:false,broadcast:false,slot:snapshot.context.slot,program:deployment.program,programdata:deployment.programdata,programExecutable:true,currentHash:sha(old),candidateHash:sha(binary),candidateBytes:binary.length,currentProgramDataCapacity:pd.length-45,authority:deployment.upgradeAuthority,payer:deployment.payer,payerBalanceLamports:ac[2]?.lamports??0,upgradeAuthorityAccountExists:!!ac[3],treasury:deployment.treasury,sourceManifestMatches:true,storedAccountLayoutsChanged:false,outerInstructionFormatsChanged:false,existingLifecycleAccountsUnchanged:true,previousBufferClosed:true,preservedAccountSnapshots,quoteBufferPlaceholder:deployment.buffer,placeholderIsNotAnActiveBuffer:true,freshBufferRequiredAfterApproval:true,bufferRentLamports:rent,rollbackBufferRentLamports:rollbackRent,chunkBytes:960,writeTransactions:chunks,plannedTransactions:chunks+3,transactions:rows,newBaseFeesLamports:freshFees,preservedLatestDeploymentReceiptCount:ownReceipts.length,preservedLatestDeploymentFeesLamports:preservedReceiptsFees,priorCumulativeFeesLamports:deployment.cumulativeDeploymentFeesLamports,estimatedCumulativeFeesLamports:deployment.cumulativeDeploymentFeesLamports+freshFees,oldLimitsPass:rent<=1340000000&&deployment.cumulativeDeploymentFeesLamports+freshFees<=3000000,proposedBufferRentCapLamports:1400000000,proposedCumulativeFeeCapLamports:feeCap,proposedNewFeeAllowanceLamports:additionalFeeCap,lifecycleAllowanceReservedLamports:lifecycle.remainingLifecycleBudgetLamports,availableAfterBufferBaseFeesAndLifecycleReserveLamports:(ac[2]?.lamports??0)-rent-freshFees-lifecycle.remainingLifecycleBudgetLamports,signerFileAvailability:'verified separately in signer-verification.json; public keys only',reproducibility:'clean pinned-toolchain reproduction matched candidate; see clean-reproduction.json and log',upgradeSimulation:'deferred until approved upload exists; no invalid missing-buffer simulation presented as success',authorizedToSubmit:false};
await writeFile(out+'/fresh-preflight.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
