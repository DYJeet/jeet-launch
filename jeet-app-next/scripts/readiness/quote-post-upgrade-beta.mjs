// Read-only plan: unsigned messages and public state only, no signer keys or submission.
import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import * as k from '@solana/kit';
import {WalletTransactionExecutor} from '../../src/lib/wallet-transactions.ts';
import {readTradeMarket,tradePreview,tradeInstructions} from '../../src/lib/wallet-v5-trade.ts';
import {createServerWalletRpc} from '../../src/lib/wallet-rpc-server.ts';
import {potential} from '../../src/lib/v5-pricing.ts';
import {graduationAddresses} from '../../src/lib/launch-graduation.ts';
import {claimFeeInstruction} from '../../src/lib/launch-fees.ts';
const life=JSON.parse(await readFile('artifacts/devnet/fee-65-35/lifecycle-jeettest/summary.json'));
const creator=k.address('13TckZDu8H8VAXSmkfGqVKMwbeWoJsrsBSk5i1KkA1Uf'),trader=k.address(life.addresses.trader),mint=k.address(life.mint);
const env={network:'devnet',chain:'solana:devnet',genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',program:life.program,rpcPath:'/api/wallet/rpc'};
const rpc=createServerWalletRpc('https://api.devnet.solana.com'),opts={abortSignal:AbortSignal.timeout(15000)};
const e=new WalletTransactionExecutor(env,'https://api.devnet.solana.com',()=>{throw Error('No wallet may be accessed');},{get:()=>null,put:()=>{throw Error('Read only');},remove:()=>{}},undefined,undefined,rpc);
await e.network();const market=await readTradeMarket(e,mint,creator,trader);assert.equal(market.setup,0n);
const buy=tradePreview(market,104231n,false,0n),state=market.launch.state;assert(state);
const fees=market.launch.fees.map((f,i)=>({...f,accrued:f.accrued+(i?buy.creator:buy.platform)}));
const future={...market,tokens:market.tokens+buy.amount,launch:{...market.launch,fees,state:{...state,sold:state.sold+buy.amount,reserve:state.reserve+buy.raw,rawIn:state.rawIn+buy.raw,sequence:state.sequence+1n}}};
const sell=tradePreview(future,buy.amount,true,0n);
const lifetime=(await rpc.getLatestBlockhash().send(opts)).value;
const quotes=[]; let buySimulation;
for(const [name,payer,ixs] of [['buy',trader,await tradeInstructions(market,buy,k.createNoopSigner(trader))],['sell-after-buy',trader,await tradeInstructions(future,sell,k.createNoopSigner(trader))],['creator-claim-after-roundtrip',creator,[{...claimFeeInstruction({...market.launch.addresses,beneficiary:k.createNoopSigner(creator),feeVault:market.launch.addresses.creatorVault,kind:1,amount:buy.creator+sell.creator}),programAddress:k.address(life.program)}]]]){
 let m=k.createTransactionMessage({version:'legacy'});m=k.setTransactionMessageFeePayer(payer,m);m=k.setTransactionMessageLifetimeUsingBlockhash(lifetime,m);m=k.appendTransactionMessageInstructions(ixs,m);const t=k.compileTransaction(m);if(name==='buy'){buySimulation=(await rpc.simulateTransaction(k.getBase64EncodedWireTransaction(t),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'confirmed'}).send(opts)).value;assert.equal(buySimulation.err,null,'Read-only buy simulation failed');}const fee=(await rpc.getFeeForMessage(k.getBase64Decoder().decode(t.messageBytes)).send(opts)).value;assert(fee!==null);quotes.push({name,signatures:Object.keys(t.signatures).length,wireBytes:1+64*Object.keys(t.signatures).length+t.messageBytes.length,feeLamports:fee});
}
const ga=await graduationAddresses(mint,0n);const cfg=(await rpc.getAccountInfo(ga.config,{encoding:'base64'}).send(opts)).value;assert(cfg);const data=Buffer.from(cfg.data[0],'base64');assert.equal(data.length,236);
const bal=await rpc.getMultipleAccounts([creator,trader],{encoding:'base64'}).send(opts);
const zeroDataRent=await rpc.getMinimumBalanceForRentExemption(0n).send(opts);assert(bal.value[1].lamports>=zeroDataRent+buy.user+10000n,'Trader needs a newly authorized top-up');
const report={zeroDataWalletRentLamports:zeroDataRent,buySimulation,checkedAt:new Date().toISOString(),readOnly:true,signed:false,broadcast:false,existingMint:mint,wallets:[creator,trader].map((address,i)=>({address,balanceLamports:bal.value[i]?.lamports??0n})),quotes,buy,sell,additionalRentLamports:market.setup,roundTripCreatorFeeLamports:buy.creator+sell.creator,roundTripPlatformFeeLamports:buy.platform+sell.platform,grossDebitIncludingNetworkLamports:buy.user+quotes.reduce((s,q)=>s+q.feeLamports,0n),conservativeRequestedCapLamports:200000,request:'One existing JEETTEST buy, sell and disposable creator claim; no funding, new token or platform claim.',historicalRemainingLifecycleAllowanceLamports:19049698,existingTokenGraduationReserveLamports:potential(state,state.inventory),ammPoolCreationFeeLamports:data.readBigUInt64LE(36),newTokenCreation:'Requires separately approved new token and fresh metadata CPI simulation; no exact cost claimed while metadata protocol fees and predecessor state are unverified.',publicMigration:'NOT authorized or ready for execution; requires separate budget for AMM fee, account rent, curve completion, post-migration swaps and owner-controlled claims. Local regression evidence is preserved.'};
await mkdir('artifacts/public-beta',{recursive:true});await writeFile('artifacts/public-beta/post-upgrade-test-quote.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
