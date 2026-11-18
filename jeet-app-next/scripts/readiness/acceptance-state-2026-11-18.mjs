// Independent read-only verification. No signing or transaction submission imports.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getAddressDecoder,getAddressEncoder } from '@solana/kit';
const expected='e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c';
const deployment=JSON.parse(await readFile('artifacts/devnet/fee-65-35/deployment-verification.json'));
const life=JSON.parse(await readFile('artifacts/devnet/fee-65-35/lifecycle-jeettest/summary.json'));
const binary=await readFile('artifacts/readiness/candidates/syncnative-devnet/jeet_launch_custody.so');
const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(binary),expected);
const buffer='BbZogFHxBmRWGet9BJDdZvwTgumBuamNzMhEAHZfqRio';
const keys=[deployment.program,deployment.programdata,deployment.payer,buffer,life.addresses.platformVault,life.addresses.creatorVault,life.mint,life.addresses.curve,deployment.buffer];
async function rpc(method,params=[]){for(let attempt=0;attempt<3;attempt++){const r=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});if(r.status===429&&attempt<2){await r.body?.cancel();await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}assert.equal(r.status,200);const j=await r.json();assert(!j.error,JSON.stringify(j.error));return j.result;}throw Error('Bounded verification attempts exhausted');}
assert.equal(await rpc('getGenesisHash'),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const snap=await rpc('getMultipleAccounts',[keys,{encoding:'base64',commitment:'finalized'}]),a=snap.value;
const bytes=i=>Buffer.from(a[i].data[0],'base64'),dec=getAddressDecoder();
assert(a[0].executable);assert.equal(a[0].owner,'BPFLoaderUpgradeab1e11111111111111111111111');assert.equal(dec.decode(bytes(0).subarray(4,36)),deployment.programdata);
const pd=bytes(1);assert.equal(pd.readUInt32LE(),3);assert.equal(pd[12],1);assert.equal(dec.decode(pd.subarray(13,45)),deployment.upgradeAuthority);
assert.equal(sha(pd.subarray(45,45+binary.length)),expected);assert(pd.subarray(45+binary.length).every(n=>n===0));
assert(pd.subarray(45,45+binary.length).includes(Buffer.from(getAddressEncoder().encode(deployment.treasury))));assert.equal(a[3],null);assert.equal(a[8],null);
const pre=JSON.parse(await readFile('artifacts/readiness/controlled-upgrade/fresh-preflight.json'));
for(const index of [4,5,6,7]){const baseline=pre.preservedAccountSnapshots.find(s=>s.pubkey===keys[index]);assert(baseline);assert.equal(sha(bytes(index)),baseline.dataSha256);assert.equal(a[index].lamports,baseline.lamports);assert.equal(a[index].owner,baseline.owner);}
assert.equal(dec.decode(bytes(4).subarray(72,104)),deployment.treasury);
const initialPd=pre.preservedAccountSnapshots.find(s=>s.pubkey===deployment.programdata).lamports;
const fees=pre.payerBalanceLamports+initialPd-a[2].lamports-a[1].lamports;assert.equal(fees,1455000);assert.equal(deployment.cumulativeDeploymentFeesLamports+fees,4390000);
const report={checkedAt:new Date().toISOString(),readOnly:true,network:'devnet',finalizedSlot:snap.context.slot,program:deployment.program,programdata:deployment.programdata,executable:true,artifactSha256:expected,treasury:deployment.treasury,upgradeAuthority:deployment.upgradeAuthority,upgradeAuthorityUnchanged:true,existingFeeMintCurveAccountsUnchanged:true,feeConfiguration:'65 bps platform / 35 bps creator / 100 bps total; unchanged approved reproducible candidate',buffer,bufferClosed:true,previousBufferClosed:true,payer:deployment.payer,payerBalanceLamports:a[2].lamports,programDataBalanceLamports:a[1].lamports,feesThisUpgradeLamports:fees,cumulativeDeploymentFeesLamports:deployment.cumulativeDeploymentFeesLamports+fees,conservationVerified:true,accountSnapshots:keys.map((pubkey,i)=>({pubkey,exists:!!a[i],owner:a[i]?.owner,lamports:a[i]?.lamports,dataSha256:a[i]?sha(bytes(i)):null}))};
await writeFile('artifacts/public-beta/acceptance-2026-11-18-state.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
