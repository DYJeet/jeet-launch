// Genuine loader-v3 rehearsal on loopback only. All signers are ephemeral local identities.
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createClient,generateKeyPairSigner,getAddressEncoder,lamports } from '@solana/kit';
import { generatedPayer,airdropPayer } from '@solana/kit-plugin-signer';
import { solanaRpc,rpcAirdrop } from '@solana/kit-plugin-rpc';
import { getCreateAccountInstruction } from '@solana-program/system';
const dir=await mkdtemp('/tmp/jeet-loader-rehearsal-');const rpcUrl='http://127.0.0.1:9927';
const base=JSON.parse(await readFile('artifacts/devnet/fee-65-35/deployment-verification.json'));
const old=await readFile('artifacts/devnet/fee-65-35/jeet_launch_custody.so'),candidate=await readFile('artifacts/readiness/candidates/syncnative-devnet/jeet_launch_custody.so');
const manifest=JSON.parse(await readFile('artifacts/readiness/candidates/syncnative-devnet/manifest.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(old),base.artifactSha256);assert.equal(hash(candidate),manifest.artifactSha256);
const loader='BPFLoaderUpgradeab1e11111111111111111111111';const authority=await generateKeyPairSigner(),buffer=await generateKeyPairSigner();
const pd=Buffer.alloc(45+617552);pd.writeUInt32LE(3);pd[12]=1;pd.set(getAddressEncoder().encode(authority.address),13);pd.set(old,45);
const program=Buffer.alloc(36);program.writeUInt32LE(2);program.set(getAddressEncoder().encode(base.programdata),4);
for(const [name,pubkey,data,executable] of [['program',base.program,program,true],['programdata',base.programdata,pd,false]])await writeFile(dir+'/'+name+'.json',JSON.stringify({pubkey,account:{lamports:10000000000,data:[data.toString('base64'),'base64'],owner:loader,executable,rentEpoch:0}}));
const log=await open(dir+'/validator.log','w');const validator=spawn(process.env.JEET_UPGRADE_VALIDATOR_BIN??'/home/codespace/.local/share/solana/install/active_release/bin/solana-test-validator',['--url','https://api.devnet.solana.com','--clone-feature-set','--log','--bind-address','127.0.0.1','--rpc-port','9927','--faucet-port','9929','--gossip-port','13997','--dynamic-port-range','14000-14100','--ledger',dir+'/ledger','--account',base.program,dir+'/program.json','--account',base.programdata,dir+'/programdata.json'],{stdio:['ignore',log.fd,log.fd]});await log.close();
const rpc=async(method,params=[])=>{const r=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});const j=await r.json();assert(!j.error,JSON.stringify(j.error));return j.result;};
const raw=async k=>(await rpc('getAccountInfo',[k,{encoding:'base64',commitment:'confirmed'}])).value;
const bytes=a=>Buffer.from(a.data[0],'base64');const tag=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const meta=(address,role=0,signer)=>({address,role,...(signer?{signer}:{})});const signed=(s,role=2)=>meta(s.address,role,s);
const ix=(data,accounts)=>({programAddress:loader,data,accounts});const receipts=[];
const deadline=setTimeout(()=>{console.error('Local rehearsal exceeded 600 seconds');validator.kill('SIGTERM');setTimeout(()=>process.exit(1),5000).unref();},600000);
try{
 for(let n=0;n<120;n++){if(validator.exitCode!==null)throw Error('Validator exited; '+dir);try{if(await rpc('getHealth')==='ok')break;}catch{}if(n===119)throw Error('Validator startup deadline');await new Promise(r=>setTimeout(r,300));}
 const genesis=await rpc('getGenesisHash');assert.notEqual(genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');assert.notEqual(genesis,'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
 const c=await createClient().use(generatedPayer()).use(solanaRpc({rpcUrl,rpcSubscriptionsUrl:'ws://127.0.0.1:9928',transactionConfig:{version:0,estimateResourceLimits:false},skipPreflight:false})).use(rpcAirdrop()).use(airdropPayer(lamports(3000000000n)));
 const payer=c.payer;const before=await raw(payer.address),beforePd=await raw(base.programdata);assert.equal(hash(bytes(beforePd).subarray(45,45+old.length)),hash(old));
 const send=async(label,instructions)=>{const sent=await c.sendTransaction(instructions);const signature=String(sent.context.signature);const tx=await rpc('getTransaction',[signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:0}]);assert(tx&&tx.meta.err===null,label);receipts.push({label,signature,feeLamports:tx.meta.fee,computeUnits:tx.meta.computeUnitsConsumed});return tx;};
 const rent=await rpc('getMinimumBalanceForRentExemption',[candidate.length+37]);
 await send('create-buffer',[getCreateAccountInstruction({payer,newAccount:buffer,lamports:BigInt(rent),space:BigInt(candidate.length+37),programAddress:loader}),ix(tag(0),[meta(buffer.address,1),meta(payer.address)])]);
 for(let baseOffset=0;baseOffset<candidate.length;baseOffset+=960*4){await Promise.all(Array.from({length:4},(_,i)=>baseOffset+i*960).filter(offset=>offset<candidate.length).map(async offset=>{const chunk=candidate.subarray(offset,offset+960),data=Buffer.alloc(16+chunk.length);data.writeUInt32LE(1);data.writeUInt32LE(offset,4);data.writeBigUInt64LE(BigInt(chunk.length),8);chunk.copy(data,16);await send('write-'+offset,[ix(data,[meta(buffer.address,1),signed(payer)])]);}));await writeFile('artifacts/readiness/controlled-upgrade/local-loader-progress.json',JSON.stringify({completed:false,localOnly:true,receipts},null,2));if(baseOffset%30720===0)console.log('LOCAL_UPLOAD_PROGRESS',Math.min(286,Math.floor(baseOffset/960)+4));}
 const uploaded=await raw(buffer.address);assert.equal(uploaded.owner,loader);assert.equal(hash(bytes(uploaded).subarray(37)),hash(candidate));
 await send('handoff',[ix(tag(4),[meta(buffer.address,1),signed(payer),meta(authority.address)])]);assert.deepEqual(bytes(await raw(buffer.address)).subarray(5,37),Buffer.from(getAddressEncoder().encode(authority.address)));
 const upgrade=who=>ix(tag(3),[meta(base.programdata,1),meta(base.program,1),meta(buffer.address,1),meta(payer.address,1),meta('SysvarRent111111111111111111111111111111111'),meta('SysvarC1ock11111111111111111111111111111111'),signed(who)]);
 const compute={programAddress:'ComputeBudget111111111111111111111111111111',accounts:[],data:new Uint8Array([2,192,92,21,0])};
 const wrong=await generateKeyPairSigner();await assert.rejects(c.sendTransaction([compute,upgrade(wrong)]));assert.equal(hash(bytes(await raw(base.programdata)).subarray(45,45+old.length)),hash(old));assert.equal(hash(bytes(await raw(buffer.address)).subarray(37)),hash(candidate));
 await send('upgrade',[compute,upgrade(authority)]);const afterPd=await raw(base.programdata),after=await raw(payer.address),b=bytes(afterPd);
 assert.equal(hash(b.subarray(45,45+candidate.length)),hash(candidate));assert(b.subarray(45+candidate.length).every(v=>v===0));assert.deepEqual(b.subarray(13,45),Buffer.from(getAddressEncoder().encode(authority.address)));assert.equal(await raw(buffer.address),null);
 const fees=receipts.reduce((n,t)=>n+t.feeLamports,0);assert.equal(before.lamports+beforePd.lamports,after.lamports+afterPd.lamports+fees);
 const report={completed:true,featureProfile:'cloned from public Devnet read-only; not all-features default',localWriteConcurrency:4,publicWriteConcurrencyRemains:1,network:'loopback-local-validator',genesis,liveDevnetChanged:false,realSignerKeysUsed:false,localUpgradeAuthority:authority.address,program:base.program,oldHash:hash(old),candidateHash:hash(candidate),positive:['loader accepts approved current executable','286 bounded write chunks confirmed','complete buffer byte hash verified','authority handoff verified','upgrade completed with exact candidate hash','upgrade authority preserved','buffer closed automatically','payer/ProgramData/buffer/fee conservation exact'],expectedRejections:['wrong upgrade authority rejected without changing executable or buffer'],transactions:receipts,transactionCount:receipts.length,feesLamports:fees,refundableRentLamports:rent,payerInitial:before.lamports,payerFinal:after.lamports,programDataInitialLamports:beforePd.lamports,programDataFinalLamports:afterPd.lamports,programDataFinalCapacity:b.length-45,ledger:dir};
 await writeFile('artifacts/readiness/controlled-upgrade/local-loader-rehearsal.json',JSON.stringify(report,null,2));console.log('LOCAL_UPGRADE_REHEARSAL_PASS',receipts.length,fees,hash(candidate));
}catch(error){await writeFile('artifacts/readiness/controlled-upgrade/local-loader-rehearsal-failure.json',JSON.stringify({completed:false,localOnly:true,receiptCount:receipts.length,receipts,message:String(error.message).slice(0,1500)},null,2));throw error;}finally{clearTimeout(deadline);if(validator.exitCode===null){const exited=once(validator,'exit');validator.kill('SIGTERM');const timer=setTimeout(()=>validator.kill('SIGKILL'),5000);await exited;clearTimeout(timer);}console.log('LOCAL_REHEARSAL_LOGS',dir);}
