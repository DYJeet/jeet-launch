// Exactly three owner-authorized Devnet operations. No funding, new tokens or migration.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as k from '@solana/kit';
import {WalletTransactionExecutor} from '../../src/lib/wallet-transactions.ts';
import {readTradeMarket,tradePreview,tradeInstructions} from '../../src/lib/wallet-v5-trade.ts';
import {createServerWalletRpc} from '../../src/lib/wallet-rpc-server.ts';
import {claimFeeInstruction} from '../../src/lib/launch-fees.ts';
const mode=process.argv[2];assert(['preflight','buy','sell','claim','report'].includes(mode));
const program=k.address('Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D');
const creator=k.address('13TckZDu8H8VAXSmkfGqVKMwbeWoJsrsBSk5i1KkA1Uf'),trader=k.address('9m9k7oUP2EpVhgPXtrAsFTYE6WY6kaq8w67QvkWKjx9b');
const mint=k.address('7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM');
const treasury='HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP',authority='DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW';
const expectedHash='e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c';
const dir='/workspaces/.jeet-devnet/post-upgrade-acceptance-162ad9f',out='artifacts/public-beta/post-upgrade-acceptance-162ad9f';
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2)+'\n';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));let last=0,id=0;
async function raw(method,params=[]){for(let i=0;i<3;i++){
 await pause(Math.max(0,450-(Date.now()-last)));last=Date.now();
 const r=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(15000)});
 if(r.status===429&&method!=='sendTransaction'&&i<2){await r.body?.cancel();await pause(1000*2**i);continue;}
 assert.equal(r.status,200,'RPC HTTP '+r.status);const j=await r.json();assert(!j.error,'RPC rejected '+method+': '+JSON.stringify(j.error));return j.result;
}throw Error('RPC bounded attempts exhausted');}
const opts=()=>({abortSignal:AbortSignal.timeout(15000)});
const env={network:'devnet',chain:'solana:devnet',genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',program,rpcPath:'/api/wallet/rpc'};
const rpc=createServerWalletRpc('https://api.devnet.solana.com');
const e=new WalletTransactionExecutor(env,'https://api.devnet.solana.com',()=>{throw Error('No browser wallet access');},{get:()=>null,put:()=>{throw Error('No browser storage');},remove:()=>{}},undefined,undefined,rpc);
async function verifyProgram(){
 assert.equal(await raw('getGenesisHash'),env.genesis);
 const a=(await raw('getMultipleAccounts',[[program,'4UHVfUkA2HxHRo11hcN3FH8QjX6ZYznikSvA678cxQVW'],{encoding:'base64',commitment:'finalized'}])).value;
 assert(a[0]?.executable);for(const x of a)assert.equal(x.owner,'BPFLoaderUpgradeab1e11111111111111111111111');
 const pb=Buffer.from(a[0].data[0],'base64'),pd=Buffer.from(a[1].data[0],'base64'),dec=k.getAddressDecoder();
 assert.equal(dec.decode(pb.subarray(4,36)),'4UHVfUkA2HxHRo11hcN3FH8QjX6ZYznikSvA678cxQVW');assert.equal(pd.readUInt32LE(),3);assert.equal(pd[12],1);assert.equal(dec.decode(pd.subarray(13,45)),authority);
 const binary=await fs.readFile('artifacts/readiness/candidates/syncnative-devnet/jeet_launch_custody.so');assert.equal(hash(binary),expectedHash);assert.equal(hash(pd.subarray(45,45+binary.length)),expectedHash);assert(pd.subarray(45+binary.length).every(x=>x===0));assert(binary.includes(Buffer.from(k.getAddressEncoder().encode(treasury))));
 return {hash:expectedHash,authority,treasury,executable:true};
}
async function key(name,want){const p='/workspaces/.jeet-devnet/'+name+'.json';assert.equal((await fs.stat(p)).mode&0o077,0);const s=await k.createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(await fs.readFile(p,'utf8'))));assert.equal(s.address,want);return s;}
async function snapshot(){const m=await readTradeMarket(e,mint,creator,trader),s=m.launch.state;assert(s);assert.equal(m.setup,0n);assert.equal(m.launch.fees[0].beneficiary,treasury);assert.equal(m.launch.fees[1].beneficiary,creator);assert.equal(m.launch.mint.supplyRaw,1000000000000000000n);assert.equal(m.launch.creatorTokens,10000000000000000n);assert.equal(m.launch.mint.mintAuthority,null);assert.equal(m.launch.mint.freezeAuthority,null);assert(!s.migrated&&!m.launch.terms.migrated);
 const b=(await raw('getMultipleAccounts',[[creator,trader,m.launch.addresses.curve,m.launch.addresses.platformVault,m.launch.addresses.creatorVault],{encoding:'base64',commitment:'finalized'}])).value;
 return {m,summary:{slot:m.launch.slot,creatorSol:b[0].lamports,traderSol:b[1].lamports,tokens:m.tokens,sold:s.sold,reserve:s.reserve,sequence:s.sequence,platform:m.launch.fees[0],creator:m.launch.fees[1],curveLamports:b[2].lamports,platformVaultLamports:b[3].lamports,creatorVaultLamports:b[4].lamports,vaultTokens:m.launch.vaultTokens,migrationTokens:m.launch.migrationTokens}};
}
function checkStage(s,n){assert.equal(s.tokens,n===1?2400000000000n:0n);assert.equal(s.sold,n===1?2400000000000n:0n);assert.equal(s.reserve,n===1?103199n:0n);assert.equal(s.sequence,BigInt(2+Math.min(n,2)));assert.equal(s.platform.accrued,1342n+671n*BigInt(Math.min(n,2)));assert.equal(s.platform.withdrawn,0n);assert.equal(s.creator.accrued,722n+361n*BigInt(Math.min(n,2)));assert.equal(s.creator.withdrawn,n===3?1444n:722n);assert.equal(s.creator.claimable,n===1?361n:n===2?722n:0n);
 assert.equal(BigInt(s.traderSol),[837776n,728545n,825712n,825712n][n]);assert.equal(BigInt(s.creatorSol),n===3?13622644n:13626922n);
 assert.equal(s.vaultTokens,n===1?593997600000000000n:594000000000000000n);assert.equal(s.migrationTokens,396000000000000000n);assert.equal(s.curveLamports,n===1?2084399:1981200);assert.equal(s.platformVaultLamports,1428822+671*Math.min(n,2));assert.equal(s.creatorVaultLamports,n===3?1427480:1427480+361*Math.min(n,2));}
await fs.mkdir(out,{recursive:true});
const verified=await verifyProgram();
let journal;
if(mode==='preflight'){
 const {m,summary}=await snapshot();checkStage(summary,0);await key('phase1-creator',creator);await key('phase1-trader',trader);
 const q=tradePreview(m,104231n,false,0n);assert.equal(q.amount,2400000000000n);assert.equal(q.raw,103199n);assert.equal(q.platform,671n);assert.equal(q.creator,361n);
 const life=(await rpc.getLatestBlockhash({commitment:'confirmed'}).send(opts())).value;
 let message=k.setTransactionMessageFeePayer(trader,k.createTransactionMessage({version:'legacy'}));message=k.setTransactionMessageLifetimeUsingBlockhash(life,message);message=k.appendTransactionMessageInstructions(await tradeInstructions(m,q,k.createNoopSigner(trader)),message);const t=k.compileTransaction(message);
 const sim=(await rpc.simulateTransaction(k.getBase64EncodedWireTransaction(t),{encoding:'base64',sigVerify:false,commitment:'confirmed'}).send(opts())).value;assert.equal(sim.err,null);assert.equal((await rpc.getFeeForMessage(k.getBase64Decoder().decode(t.messageBytes)).send(opts())).value,5000n);
 assert(q.user+15000n===119231n&&119231n<=200000n);const rent=await rpc.getMinimumBalanceForRentExemption(0n).send(opts());assert(BigInt(summary.traderSol)-q.user-10000n>=rent);
 journal={approvedReference:'162ad9fa233204ac160a3eb608db9b97f3f2a182',program,mint,creator,trader,verified,capLamports:200000,grossDebitLamports:0,initial:summary,receipts:[],pending:null,startedAt:new Date().toISOString()};
 await fs.mkdir(dir,{mode:0o700});await fs.writeFile(dir+'/journal.json',json(journal),{mode:0o600,flag:'wx'});await fs.writeFile(out+'/preflight.json',json({verified,summary,buy:q,buySimulation:sim,expectedGrossDebitLamports:119231,capLamports:200000,remainingHistoricalAllowanceLamports:19049698,signerIdentitiesVerified:true}));console.log(json({status:'PREFLIGHT PASS',verified,summary,grossDebitLamports:119231,noTransactionsSubmitted:true}));
}else{
 journal=JSON.parse(await fs.readFile(dir+'/journal.json','utf8'));assert.equal(journal.verified.hash,expectedHash);assert.equal(journal.program,program);assert.equal(journal.capLamports,200000);assert(!journal.pending,'Pending signature requires reconciliation; never duplicate');
 const save=async()=>{await fs.writeFile(dir+'/journal.json',json(journal),{mode:0o600});await fs.writeFile(out+'/receipts.json',json({...journal,pending:journal.pending?{label:journal.pending.label,signature:journal.pending.signature}:null}));};
 const {m,summary}=await snapshot();const n=journal.receipts.length;checkStage(summary,n);
 if(mode==='report'){assert.equal(n,3);assert.equal(journal.grossDebitLamports,119231);const net=BigInt(journal.initial.traderSol)+BigInt(journal.initial.creatorSol)-BigInt(summary.traderSol)-BigInt(summary.creatorSol);assert.equal(net,16342n);assert.equal(net,15000n+1342n);journal.completed=true;journal.final=summary;journal.netWalletDecreaseLamports=net;journal.remainingHistoricalAllowanceLamports=19049698-Number(net);await save();console.log(json(journal));}
 else{
 assert.equal(mode,['buy','sell','claim'][n],'Unexpected or duplicate stage');assert.equal(process.env.JEET_ACCEPTANCE_AUTHORIZATION,'THREE-DEVNET-162ad9f');
 const payer=mode==='claim'?creator:trader;let q;
 if(mode!=='claim'){q=tradePreview(m,mode==='buy'?104231n:2400000000000n,mode==='sell',0n);assert.equal(q.amount,2400000000000n);assert.equal(q.raw,103199n);assert.equal(q.platform,671n);assert.equal(q.creator,361n);assert.equal(q.user,mode==='buy'?104231n:102167n);}
 const ixs=who=>mode==='claim'?[{...claimFeeInstruction({...m.launch.addresses,beneficiary:who,feeVault:m.launch.addresses.creatorVault,kind:1,amount:722n}),programAddress:program}]:tradeInstructions(m,q,who);
 const lifetime=(await rpc.getLatestBlockhash({commitment:'confirmed'}).send(opts())).value;
 const make=async(who,signer)=>{let msg=k.createTransactionMessage({version:'legacy'});msg=signer?k.setTransactionMessageFeePayerSigner(who,msg):k.setTransactionMessageFeePayer(payer,msg);msg=k.setTransactionMessageLifetimeUsingBlockhash(lifetime,msg);return k.appendTransactionMessageInstructions(await ixs(who),msg);};
 const um=await make(k.createNoopSigner(payer),false),ut=k.compileTransaction(um);assert(Buffer.from(k.getBase64EncodedWireTransaction(ut),'base64').length<=1232);assert.equal(Object.keys(ut.signatures).length,1);
 const fee=(await rpc.getFeeForMessage(k.getBase64Decoder().decode(ut.messageBytes),{commitment:'confirmed'}).send(opts())).value;assert.equal(fee,5000n);
 const debit=Number(fee)+(mode==='buy'?Number(q.user):0);assert(journal.grossDebitLamports+debit+(2-n)*5000<=200000);assert(119231<=19049698);
 const simulation=(await rpc.simulateTransaction(k.getBase64EncodedWireTransaction(ut),{encoding:'base64',sigVerify:false,commitment:'confirmed'}).send(opts())).value;await fs.writeFile(out+'/'+mode+'-simulation.json',json(simulation));assert.equal(simulation.err,null,'Simulation failed; nothing signed');
 await fs.writeFile(dir+'/'+mode+'.lock',json({pid:process.pid,at:new Date().toISOString()}),{mode:0o600,flag:'wx'});
 const who=await key(mode==='claim'?'phase1-creator':'phase1-trader',payer);const msg=await make(who,true);assert.deepEqual(Buffer.from(k.compileTransaction(msg).messageBytes),Buffer.from(ut.messageBytes));assert.equal(await raw('getGenesisHash'),env.genesis);
 const signed=await k.signTransactionMessageWithSigners(msg),signature=k.getSignatureFromTransaction(signed),wire=k.getBase64EncodedWireTransaction(signed);journal.pending={label:mode,signature,wire,feeLamports:5000,lastValidBlockHeight:lifetime.lastValidBlockHeight.toString()};await save();console.log(mode+' signed; saved pending signature '+signature);
 try{assert.equal(await raw('sendTransaction',[wire,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]),signature);}catch(error){journal.sendResponseError=String(error.message).slice(0,500);await save();console.log('Reconciling saved signature; no resend');}
 let finalized=false;for(let poll=0;poll<45;poll++){const st=(await raw('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0];if(st?.err){journal.confirmedError=st.err;await save();throw Error('On-chain failure; STOP '+signature);}if(st?.confirmationStatus==='finalized'){finalized=true;break;}await pause(1000);}assert(finalized,'Finality timeout: STOP and reconcile pending signature, do not resend');
 const tx=await raw('getTransaction',[signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);assert(tx?.meta);assert.equal(tx.meta.err,null);assert.equal(tx.meta.fee,5000);assert.equal(tx.transaction.signatures[0],signature);
 journal.grossDebitLamports+=debit;assert(journal.grossDebitLamports<=200000);journal.receipts.push({label:mode,signature,explorer:'https://explorer.solana.com/tx/'+signature+'?cluster=devnet',slot:tx.slot,feeLamports:tx.meta.fee,grossDebitLamports:debit,finalized:true,error:null});journal.pending=null;await fs.writeFile(out+'/'+mode+'-finalized-transaction.json',json(tx));await save();
 const after=await snapshot();checkStage(after.summary,n+1);await fs.writeFile(out+'/'+mode+'-state.json',json(after.summary));console.log(json({status:mode+' FINALIZED AND RECONCILED',receipt:journal.receipts.at(-1),grossDebitLamports:journal.grossDebitLamports,state:after.summary}));
 }
}
