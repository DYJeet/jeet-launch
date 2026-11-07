"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@solana/react";
import { useConnectedWallet, useConnect, useDisconnect, useWallets } from "@solana/kit-plugin-wallet/react";
import {
  address, signature, appendTransactionMessageInstructions, compileTransaction, createNoopSigner,
  createTransactionMessage, getBase64Decoder, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, type TransactionMessageBytesBase64,
} from "@solana/kit";
import type { AppClient } from "@/app/providers";
import WalletHydrationGate from "./WalletHydrationGate";
import { formatUnits, parseUnits, type WalletEnvironment } from "@/lib/wallet-environment";
import { browserPendingStore, WalletTransactionExecutor, type TransactionNotice } from "@/lib/wallet-transactions";
import type { WalletLaunchSnapshot } from "@/lib/wallet-launch-flow";
import { v5Quote } from "@/lib/v5-pricing";
import { curveTradeStatus, openingBuyLimit, readTradeMarket, tradeInstructions, tradePreview, type TradeMarket, type TradePreview } from "@/lib/wallet-v5-trade";

const button = "rounded-xl border border-[#9cff43]/30 px-4 py-2 text-[#9cff43] disabled:opacity-40";
const input = "w-full rounded-xl border border-white/15 bg-black/40 p-3";
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const sol = (lamports: bigint) => formatUnits(lamports) + " SOL";

export default function WalletTradePanel(props: {
  environment: WalletEnvironment;
  launch: WalletLaunchSnapshot;
  onRefresh: () => void;
}) {
  const client = useClient<AppClient>();
  return <WalletHydrationGate client={client} fallback={<p>Loading trading wallet…</p>}>
    <Trading {...props} />
  </WalletHydrationGate>;
}

function Trading({ environment, launch, onRefresh }: Parameters<typeof WalletTradePanel>[0]) {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const wallet = connected?.account.address ?? null;
  const wallets = useWallets(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const [market, setMarket] = useState<TradeMarket | null>(null);
  const [sell, setSell] = useState(false);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TransactionNotice | null>(null);
  const [receipt, setReceipt] = useState<{ signature: string; wallet: string } | null>(null);
  const [review, setReview] = useState<{ quote: TradePreview; market: TradeMarket; fee: bigint } | null>(null);
  const running = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const executor = useMemo(() => new WalletTransactionExecutor(
    environment, new URL(environment.rpcPath, window.location.origin).toString(),
    () => client.wallet.getState(), browserPendingStore(), setNotice,
  ), [client, environment]);
  const { mint, creator } = launch.addresses;
  const load = useCallback(async (owner: string) => readTradeMarket(executor, mint, creator, address(owner)), [executor, mint, creator]);

  useEffect(() => {
    if (!wallet) return;
    let active = true;
    void load(wallet).then(m => { if (active) setMarket(m); }, e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [wallet, load, launch.slot]);

  const current = market?.wallet === wallet ? market : null;
  const state = current?.launch ?? launch;
  const status = curveTradeStatus(state);
  const decimals = state.mint?.decimals ?? 0;
  let quote: TradePreview | undefined;
  let quoteError = "";
  if (current && amount && !review) {
    try { quote = tradePreview(current, parseUnits(amount, sell ? decimals : 9), sell, parseUnits(slippage, 2)); }
    catch (e) { quoteError = message(e); }
  }
  const displayed = review?.quote ?? quote;
  const pending = wallet ? browserPendingStore().get(environment.genesis + ":" + wallet) : null;

  async function action(run: (owner: string) => Promise<void>) {
    if (!wallet || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try { await run(wallet); }
    catch (e) { setError(message(e)); }
    finally { running.current = false; setBusy(false); }
  }

  async function feeFor(m: TradeMarket, q: TradePreview) {
    const signer = createNoopSigner(m.wallet);
    const { value } = await executor.rpc.getLatestBlockhash({ commitment: "confirmed" }).send({ abortSignal: AbortSignal.timeout(8000) });
    const compiled = compileTransaction(appendTransactionMessageInstructions(
      await tradeInstructions(m, q, signer),
      setTransactionMessageLifetimeUsingBlockhash(value, setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version: 0 }))),
    ));
    const fee = (await executor.rpc.getFeeForMessage(
      getBase64Decoder().decode(compiled.messageBytes) as TransactionMessageBytesBase64,
      { commitment: "confirmed" },
    ).send({ abortSignal: AbortSignal.timeout(8000) })).value;
    if (fee === null) throw Error("Network fee unavailable.");
    return fee;
  }

  async function verify(sig: string, owner: string) {
    const tx = await executor.rpc.getTransaction(signature(sig), {
      commitment: "confirmed", encoding: "json", maxSupportedTransactionVersion: 0,
    }).send({ abortSignal: AbortSignal.timeout(8000) });
    if (!tx?.meta || tx.meta.err) throw Error("Transaction result could not be verified.");
    const fresh = await load(owner);
    if (fresh.launch.slot < tx.slot) throw Error("Confirmed transaction found. Refresh market state before trading again.");
    setMarket(fresh);
    setReceipt({ signature: sig, wallet: owner });
    onRefresh();
  }

  const controlsDisabled = busy || !!pending;
  return <section data-testid="curve-trade" className="space-y-4 rounded-2xl border border-white/15 bg-black/40 p-4 sm:p-6">
    <h2 className="text-xl font-black">Trade on the bonding curve</h2>
    <p className="text-sm text-white/60">Local validator · test SOL only</p>
    <p data-testid="curve-trade-status">{status === "migrated" ? "Migrated · curve closed" :
      status === "eligible" ? "Graduation eligible · redemption open" :
      status === "waiting" ? "Waiting for the opening slot" :
      status === "active" ? "Active curve" : "Awaiting verified activation"}</p>
    {status === "migrated" && <p className="break-all text-sm">External AMM pool {state.terms?.migrated ? state.terms.pool : "unavailable"}</p>}
    {!wallet ? <div className="flex flex-wrap gap-2">
      {wallets.map(w => <button key={w.name} className={button} disabled={connect.isRunning} onClick={() => connect.dispatch(w)}>Connect {w.name}</button>)}
      {!wallets.length && <p>Connect a supported Wallet Standard wallet.</p>}
    </div> : <>
      <button className={button} onClick={() => { request.current?.abort(); setReview(null); disconnect.dispatch(); }}>Disconnect trading wallet</button>
      <p data-testid="trade-sol-balance">Available SOL: {current ? sol(current.sol) : "Loading…"}</p>
      <p data-testid="trade-token-balance">Available tokens: {current ? formatUnits(current.tokens, decimals) : "Loading…"}</p>
      <button className={button} disabled={busy} onClick={() => void action(async owner => {
        setReview(null);
        const m = await load(owner);
        setMarket(m);
        onRefresh();
      })}>Refresh trade state</button>
      {pending && <button className={button} disabled={busy} onClick={() => void action(async owner => {
        const sig = await executor.reconcile(owner);
        if (sig) await verify(sig, owner);
      })}>Reconcile pending wallet transaction</button>}
      {(status === "active" || status === "eligible") && current && <>
        <div className="flex gap-2">
          {[false, true].map(side => <button key={String(side)} className={button} aria-pressed={sell === side}
            disabled={controlsDisabled} onClick={() => { setSell(side); setAmount(""); setReview(null); }}>{side ? "Sell" : "Buy"}</button>)}
        </div>
        <p className="text-sm">Opening buy allowance: {formatUnits(openingBuyLimit(current), decimals)} tokens available now</p>
        <label className="block">{sell ? "Tokens to sell" : "SOL trade budget"}
          <input className={input} inputMode="decimal" value={amount} disabled={controlsDisabled}
            onChange={e => { setAmount(e.target.value); setReview(null); }} />
        </label>
        <div className="flex flex-wrap gap-2">
          {sell ? [25n, 50n, 75n, 100n].map(percent => <button key={String(percent)} className={button}
            disabled={controlsDisabled} onClick={() => {
              const s = current.launch.state!;
              const available = current.tokens < s.sold ? current.tokens : s.sold;
              setAmount(formatUnits((available * percent / 100n / s.quantum) * s.quantum, decimals)); setReview(null);
            }}>{String(percent)}%</button>) : <>
              {["0.001", "0.01", "0.1"].map(value => <button key={value} className={button}
                disabled={controlsDisabled} onClick={() => { setAmount(value); setReview(null); }}>{value} SOL</button>)}
              <button className={button} disabled={controlsDisabled} onClick={() => void action(async owner => {
                const m = await load(owner);
                const s = m.launch.state!;
                const allowance = openingBuyLimit(m);
                if (!allowance) throw Error("No tokens are available to buy.");
                const [p, c] = m.launch.fees;
                if (!p || !c) throw Error("Fee state unavailable.");
                const budget = v5Quote(s, s.sold, s.quantum, p.accrued, c.accrued).user;
                const q = tradePreview(m, budget, false, 0n);
                const fee = await feeFor(m, q);
                if (m.sol <= m.setup + fee) throw Error("Insufficient SOL for account funding and network fee.");
                const cap = v5Quote(s, s.sold, allowance, p.accrued, c.accrued).user;
                const affordable = m.sol - m.setup - fee;
                setAmount(formatUnits(affordable < cap ? affordable : cap)); setMarket(m); setReview(null);
              })}>Max affordable</button>
            </>}
        </div>
        <label className="block">Slippage tolerance (%)
          <input className={input} inputMode="decimal" value={slippage} disabled={controlsDisabled}
            onChange={e => { setSlippage(e.target.value); setReview(null); }} />
        </label>
        <p className="text-xs text-white/60">The program locks quantity and curve sequence. A changed quote requires review again.</p>
        {quoteError && <p role="status">{quoteError}</p>}
        {displayed && <dl data-testid="trade-quote" className="space-y-1 text-sm">
          <div>Tokens {sell ? "sold" : "received"}: {formatUnits(displayed.amount, decimals)}</div>
          <div>Curve consideration: {sol(displayed.raw)}</div>
          <div>Platform fee: {sol(displayed.platform)}</div>
          <div>Creator fee: {sol(displayed.creator)}</div>
          <div>{sell ? "Expected net SOL" : "Expected SOL debit"}: {sol(displayed.user)}</div>
          <div>{sell ? "Minimum SOL received" : "Maximum curve spend"}: {sol(displayed.bound)}</div>
          {!sell && <div>Minimum tokens received: {formatUnits(displayed.amount, decimals)}</div>}
          <div>Account funding allowance: {sol(displayed.setup)}</div>
          <div>Estimated network fee: {review ? sol(review.fee) : "Calculated at review"}</div>
          {!sell && review && <div>Maximum total including funding and estimated fee: {sol(displayed.bound + displayed.setup + review.fee)}</div>}
        </dl>}
        {!review ? <button className={button} disabled={controlsDisabled || !quote} onClick={() => void action(async owner => {
          const m = await load(owner);
          const q = tradePreview(m, parseUnits(amount, sell ? decimals : 9), sell, parseUnits(slippage, 2));
          const fee = await feeFor(m, q);
          if (m.sol < (sell ? 0n : q.bound + q.setup) + fee) throw Error("Insufficient SOL for trade, account funding and network fee.");
          setMarket(m); setReview({ market: m, quote: q, fee });
        })}>Review {sell ? "sell" : "buy"}</button> :
          <button className={button} disabled={controlsDisabled || review.market.wallet !== wallet} onClick={() => void action(async owner => {
            const reviewed = review;
            setReview(null);
            setReceipt(null);
            request.current = new AbortController();
            const sig = await executor.execute(async signer => {
              const fresh = await load(owner);
              const s = fresh.launch.state;
              const phase = curveTradeStatus(fresh.launch);
              if ((phase !== "active" && phase !== "eligible") || s?.sequence !== reviewed.quote.sequence ||
                  fresh.setup !== reviewed.market.setup || fresh.needsAta !== reviewed.market.needsAta)
                throw Error("Market or account state changed. Review a fresh quote.");
              return tradeInstructions(fresh, reviewed.quote, signer);
            }, sell ? 0n : reviewed.quote.bound + reviewed.quote.setup, request.current.signal);
            if (sig) await verify(sig, owner);
          })}>Sign and {sell ? "sell" : "buy"}</button>}
      </>}
    </>}
    {notice && <p role="status" className="break-all">Wallet status: {notice.phase === "confirmed" ? "confirmed on-chain; verify market state" : notice.phase}{notice.signature ? " · " + notice.signature : ""}</p>}
    {error && <p role="alert">{error}</p>}
    {receipt?.wallet === wallet && <p data-testid="trade-receipt" className="break-all">Confirmed and refreshed · {receipt.signature}</p>}
  </section>;
}
