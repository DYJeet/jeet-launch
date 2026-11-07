"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@solana/react";
import { useConnectedWallet, useConnect, useDisconnect, useWallets } from "@solana/kit-plugin-wallet/react";
import { address, createNoopSigner, signature, type Address } from "@solana/kit";
import type { AppClient } from "@/app/providers";
import WalletHydrationGate from "./WalletHydrationGate";
import { browserPendingStore, WalletTransactionExecutor, type TransactionNotice } from "@/lib/wallet-transactions";
import { readWalletLaunch, type WalletLaunchSnapshot } from "@/lib/wallet-launch-flow";
import { formatUnits, parseUnits, type WalletEnvironment } from "@/lib/wallet-environment";
import { NATIVE_MINT } from "@/lib/launch-graduation";
import { ammInstructions, ammPreview, graduationPreview, inspectTransaction, readAmmMarket, type AmmMarket } from "@/lib/wallet-amm";

type Props = { environment: WalletEnvironment; launch: WalletLaunchSnapshot; onRefresh: () => void };
type Inspection = Awaited<ReturnType<typeof inspectTransaction>>;
type Review = { owner:Address; cost:Inspection } & (
  { kind:"graduation"; plan:Awaited<ReturnType<typeof graduationPreview>> } |
  { kind:"swap"; plan:ReturnType<typeof ammPreview> }
);
const button = "rounded-xl border border-[#9cff43]/30 px-4 py-2 text-[#9cff43] disabled:opacity-40";
const field = "w-full rounded-xl border border-white/15 bg-black/40 p-3";
const sol = (value:bigint) => formatUnits(value)+" SOL";
const message = (e:unknown) => e instanceof Error ? e.message : String(e);
const readOnlyWallet = address("11111111111111111111111111111111");

export default function WalletGraduationPanel(props:Props) {
  const client=useClient<AppClient>();
  return <WalletHydrationGate client={client} fallback={<p>Loading graduation state…</p>}>
    <Graduation {...props}/>
  </WalletHydrationGate>;
}

function Graduation({environment,launch,onRefresh}:Props) {
  const client=useClient<AppClient>(), account=useConnectedWallet(client)?.account.address;
  const wallet=account?address(account):undefined;
  const wallets=useWallets(client), connect=useConnect(client), disconnect=useDisconnect(client);
  const [market,setMarket]=useState<AmmMarket|null>(null), [review,setReview]=useState<Review|null>(null);
  const [notice,setNotice]=useState<TransactionNotice|null>(null), [receipt,setReceipt]=useState("");
  const [error,setError]=useState(""), [busy,setBusy]=useState(false);
  const [sell,setSell]=useState(false), [amount,setAmount]=useState(""), [slippage,setSlippage]=useState("0.5");
  const abort=useRef<AbortController|null>(null), lock=useRef(false);
  useEffect(()=>()=>abort.current?.abort(),[]);
  const executor=useMemo(()=>new WalletTransactionExecutor(environment,new URL(environment.rpcPath,window.location.origin).toString(),
    ()=>client.wallet.getState(),browserPendingStore(),setNotice),[client,environment]);
  const {mint,creator}=launch.addresses;
  const load=useCallback((owner:Address)=>readAmmMarket(executor,mint,creator,owner),[executor,mint,creator]);
  const migrated=!!(launch.terms?.migrated && launch.state?.migrated);
  useEffect(()=>{
    if(!migrated)return;
    let active=true;
    void load(wallet??readOnlyWallet).then(m=>{if(active)setMarket(m);},e=>{if(active)setError(message(e));});
    return ()=>{active=false;};
  },[load,migrated,wallet,launch.slot]);
  if(!launch.state || !launch.terms)return null;
  const pending=wallet ? browserPendingStore().get(environment.genesis+":"+wallet) : null;
  const disabled=busy || !!pending;
  const current=market?.wallet===(wallet??readOnlyWallet) && market.slot>=launch.slot?market:null;
  const decimals=launch.mint?.decimals??0;
  const tokenAmount=(n:bigint)=>formatUnits(n,decimals);
  const state=launch.state;
  const preview=review?.owner===wallet?review:null;

  async function action(run:(owner:Address)=>Promise<void>) {
    if(!wallet||lock.current)return;
    lock.current=true;
    setBusy(true);setError("");
    try {await run(wallet);} catch(e){setError(message(e));}
    finally {lock.current=false;setBusy(false);}
  }
  async function readConfirmed(sig:string,owner:Address,expected?:Review) {
    const tx=await executor.rpc.getTransaction(signature(sig),{commitment:"confirmed",encoding:"json",maxSupportedTransactionVersion:0})
      .send({abortSignal:AbortSignal.timeout(10000)});
    if(!tx?.meta||tx.meta.err)throw Error("Confirmation details are unavailable. Refresh on-chain state before retrying.");
    const fresh=await readWalletLaunch(executor,mint,creator);
    if(fresh.slot<tx.slot)throw Error("RPC state is behind the confirmed transaction. Refresh before trading again.");
    if(expected?.kind==="graduation" && (!fresh.terms?.migrated || !fresh.state?.migrated || fresh.terms.pool!==expected.plan.a.pool ||
      fresh.terms.solDeposited!==expected.plan.sol || fresh.terms.tokensDeposited!==expected.plan.tokens ||
      fresh.terms.migratedSlot!==tx.slot || fresh.state.reserve!==0n || fresh.migrationTokens!==0n))
      throw Error("Confirmed transaction does not match the expected migration receipt.");
    if(fresh.terms?.migrated) {
      const next=await load(owner);
      if(next.slot<tx.slot)throw Error("Pool balances are behind the confirmed transaction. Refresh before trading again.");
      setMarket(next);
    }
    setReceipt(sig);onRefresh();
  }
  const preflight=async (owner:Address, instructions:Parameters<typeof inspectTransaction>[1])=>inspectTransaction(executor,instructions,createNoopSigner(owner));

  return <section className="space-y-4 rounded-2xl border border-white/15 bg-black/40 p-4 sm:p-6" data-testid="graduation-panel">
    <h2 className="text-xl font-black">{migrated?"Trade on Raydium CPMM":"Graduation to Raydium"}</h2>
    <p data-testid="graduation-state">{migrated?"Migrated · curve trading closed":state.eligible?"Graduation eligible · pool has not been created":"Bonding curve trading"}</p>
    <label className="block text-sm">Curve progress: {tokenAmount(state.sold)} / {tokenAmount(state.inventory)} tokens
      <progress className="block w-full" max={10000} value={Number(state.sold*10000n/state.inventory)}/>
    </label>
    {!migrated && <p className="text-sm">{tokenAmount(state.inventory-state.sold)} curve tokens remain. Graduation requires full net sales and the end of protected opening and any wallet-cap window. Redemptions remain available until migration confirms.</p>}
    {migrated && <div className="space-y-1 text-sm" data-testid="amm-pool-proof">
      <p className="break-all">Pool: {launch.terms.pool}</p>
      <p className="break-all">AMM program: {launch.terms.ammProgram}</p>
      <p>Migration slot {launch.terms.migratedSlot.toString()} · initial deposits {sol(launch.terms.solDeposited)} and {tokenAmount(launch.terms.tokensDeposited)} tokens</p>
      <p>Initial LP units burned: {launch.terms.lpBurned.toString()}. This records the initial position. Later LP issuance and Raydium program controls remain separate.</p>
      {current && <><p>Current SPL LP supply: {current.lpSupply.toString()} base units</p>
        <p>Available pool liquidity: {sol(current.a.mint0===NATIVE_MINT?current.reserve0:current.reserve1)} and {tokenAmount(current.a.mint0===NATIVE_MINT?current.reserve1:current.reserve0)} tokens</p></>}
      {!current && <p role="status">External AMM balances unavailable. Refresh state to try again.</p>}
      <p>Raydium fees apply to swaps. JeeT’s bonding-curve fees apply only before migration. This local pool is unavailable in public explorers.</p>
    </div>}
    {(migrated||state.eligible) && (!wallet ? <div className="flex flex-wrap gap-2">{wallets.map(w=><button key={w.name} className={button} disabled={connect.isRunning} onClick={()=>connect.dispatch(w)}>Connect {w.name}</button>)}</div> : <>
      {migrated && <button className={button} onClick={()=>{abort.current?.abort();setReview(null);disconnect.dispatch();}}>Disconnect AMM wallet</button>}
      {pending && <button className={button} disabled={busy} onClick={()=>void action(async owner=>{
        const sig=await executor.reconcile(owner);if(sig)await readConfirmed(sig,owner);
      })}>Reconcile pending wallet transaction</button>}
      <button className={button} disabled={busy} onClick={()=>void action(async owner=>{
        setReview(null);if(migrated)setMarket(await load(owner));onRefresh();
      })}>Refresh graduation and pool state</button>
      {!migrated && <button className={button} disabled={disabled} onClick={()=>void action(async owner=>{
        setReview(null);await executor.network();
        const plan=await graduationPreview(executor,await readWalletLaunch(executor,mint,creator),owner);
        const cost=await preflight(owner,plan.build(createNoopSigner(owner)));
        setReview({kind:"graduation",plan,cost,owner});
      })}>Review graduation</button>}
      {migrated && current && <>
        <p data-testid="amm-wallet-balance">Available: {sol(current.sol)} and {tokenAmount(current.tokens)} tokens</p>
        {!current.swapOpen && <p role="status">External AMM temporarily unavailable. The pool may still be opening.</p>}
        <div className="flex gap-2">{[false,true].map(side=><button key={String(side)} className={button} aria-pressed={sell===side} disabled={disabled}
          onClick={()=>{setSell(side);setAmount("");setReview(null);}}>{side?"Sell":"Buy"}</button>)}</div>
        <label className="block">{sell?"Tokens to swap":"SOL to swap"}<input className={field} inputMode="decimal" value={amount} disabled={disabled} onChange={e=>{setAmount(e.target.value);setReview(null);}}/></label>
        <label className="block">AMM slippage tolerance (%)<input className={field} inputMode="decimal" value={slippage} disabled={disabled} onChange={e=>{setSlippage(e.target.value);setReview(null);}}/></label>
        <button className={button} disabled={disabled||!current.swapOpen||!amount} onClick={()=>void action(async owner=>{
          setReview(null);await executor.network();
          const fresh=await load(owner), plan=ammPreview(fresh,parseUnits(amount,sell?decimals:9),sell,parseUnits(slippage,2));
          const cost=await preflight(owner,await ammInstructions(fresh,plan,createNoopSigner(owner)));
          setMarket(fresh);setReview({kind:"swap",plan,cost,owner});
        })}>Review AMM {sell?"sell":"buy"}</button>
      </>}
      {preview && <div className="space-y-2 rounded-xl border border-white/15 p-3 text-sm" data-testid="external-transaction-preview">
        {preview.kind==="graduation" ? <>
          <p>Pool deposit: {sol(preview.plan.sol)} and {tokenAmount(preview.plan.tokens)} migration tokens. Curve fee balances are excluded.</p>
          <p>Raydium setup fee: {sol(preview.plan.setupFee)}</p>
          <p>Maximum setup funding from your wallet: {sol(preview.plan.maximum)}. The instruction returns unused funding and temporary account rent.</p>
          <p>Maximum including estimated network fee: {sol(preview.plan.maximum+preview.cost.fee)}</p>
        </> : <>
          <p>Input: {preview.plan.sell?tokenAmount(preview.plan.input)+" tokens":sol(preview.plan.input)}</p>
          <p>Estimated output: {preview.plan.sell?sol(preview.plan.output):tokenAmount(preview.plan.output)+" tokens"}</p>
          <p>Minimum received: {preview.plan.sell?sol(preview.plan.minimum):tokenAmount(preview.plan.minimum)+" tokens"}</p>
          <p>Raydium trading fee included in input: {preview.plan.sell?tokenAmount(preview.plan.fee)+" tokens":sol(preview.plan.fee)}</p>
          <p>Account funding: {sol(preview.plan.setup)}. Temporary wrapped SOL rent is returned in the same transaction.</p>
        </>}
        <p>Estimated network fee: {sol(preview.cost.fee)}</p>
        <p>Simulation: {preview.cost.size} bytes · {preview.cost.computeUnits.toString()} compute units</p>
        <button className={button} disabled={disabled} onClick={()=>void action(async owner=>{
          setReview(null);setReceipt("");abort.current=new AbortController();
          const maximum=preview.kind==="graduation"?preview.plan.maximum:preview.plan.setup+(preview.plan.sell?0n:preview.plan.input);
          const sig=await executor.execute(async signer=>{
            if(preview.kind==="graduation") {
              const fresh=await graduationPreview(executor,await readWalletLaunch(executor,mint,creator),owner);
              if(fresh.launch.state?.sequence!==preview.plan.launch.state?.sequence || fresh.maximum!==preview.plan.maximum ||
                fresh.setupFee!==preview.plan.setupFee || fresh.a.pool!==preview.plan.a.pool)throw Error("Graduation state changed. Review again.");
              return fresh.build(signer);
            }
            const fresh=await load(owner), q=preview.plan;
            if(!fresh.swapOpen || fresh.reserve0!==q.reserve0 || fresh.reserve1!==q.reserve1 || fresh.cfg.trade!==q.rate ||
              (q.sell && fresh.tokens<q.input) || fresh.setup+(!q.sell&&fresh.needsAta?fresh.setup:0n)!==q.setup)
              throw Error("Pool, fees, or wallet state changed. Review a fresh quote.");
            return ammInstructions(fresh,q,signer);
          },maximum,abort.current.signal);
          if(sig)await readConfirmed(sig,owner,preview);
        })}>{preview.kind==="graduation"?"Approve setup funding and sign graduation":`Sign AMM ${preview.plan.sell?"sell":"buy"}`}</button>
      </div>}
    </>)}
    {notice && <p role="status" className="break-all">Wallet: {notice.phase}{notice.signature?` · ${notice.signature}`:""}</p>}
    {error && <p role="alert">{error}</p>}
    {receipt && <p data-testid="external-transaction-receipt" className="break-all">Confirmed and refreshed · {receipt}</p>}
  </section>;
}
