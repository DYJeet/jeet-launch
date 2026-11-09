"use client";

import { useEffect, useState } from "react";
import { address, type Signature } from "@solana/kit";
import { ammHistoryPool, ammTradeEvents } from "@/lib/amm-history";
import { curveTradeEvents, feeClaimEvents } from "@/lib/curve-history";
import { formatUnits } from "@/lib/wallet-environment";
import type { WalletTransactionExecutor } from "@/lib/wallet-transactions";

type Receipt = { id: string; signature: string; slot: bigint; time?: number | null };
type Archive = {
  events: import("@/lib/market-store").MarketEvent[];
  next?: string;
  stale: boolean;
  cursorExpired: boolean;
  checkpoint: import("@/lib/market-store").Checkpoint;
};
type Trade = Receipt & { sell: boolean; tokens: bigint; raw: bigint };
type Claim = Receipt & ReturnType<typeof feeClaimEvents>[number];

export default function CurveHistory({ executor, curve, mint, decimals, revision, pool }: {
  executor: WalletTransactionExecutor;
  curve: string;
  mint: string;
  decimals: number;
  revision: bigint;
  pool?: string;
}) {
  const [result, setResult] = useState<{ key: string; trades?: Trade[]; claims?: Claim[]; next?: string; error?: boolean; archive?: Archive }>();
  const [retry, setRetry] = useState(0);
  const [cursor, setCursor] = useState<string>();
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const key = [mint, revision, retry, cursor, archived, query].join(":");
  const venue = pool ? "Raydium" : "curve";
  useEffect(() => {
    const controller = new AbortController();
    const options = { abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) };
    void (async () => {
      try {
        if (archived) {
          const params = new URLSearchParams({ mint, venue: pool ? "amm" : "curve" });
          if (cursor) params.set("before", cursor);
          if (query) params.set("signature", query);
          const response = await fetch("/api/market-history?" + params, { signal: options.abortSignal });
          if (!response.ok) throw Error("Archive unavailable.");
          const archive = await response.json() as Archive;
          const trades: Trade[] = [];
          const claims: Claim[] = [];
          for (const event of archive.events.slice().reverse()) {
            const receipt = { id: event.id, signature: event.signature, slot: BigInt(event.slot), time: event.time };
            if (event.kind === "buy" || event.kind === "sell") trades.push({
              ...receipt, sell: event.kind === "sell", tokens: BigInt(event.tokens!), raw: BigInt(event.lamports),
            });
            else claims.push({ ...receipt, beneficiary: address(event.wallet ?? ""), platform: event.kind === "platform-claim",
              paid: BigInt(event.lamports), withdrawn: 0n });
          }
          if (!controller.signal.aborted) setResult({ key, trades, claims, next: archive.next, archive });
          return;
        }
        const verifiedPool = pool ? await ammHistoryPool(address(mint), address(pool)) : undefined;
        const signatures = await executor.rpc.getSignaturesForAddress(address(pool ?? curve), {
          limit: 16, commitment: "confirmed", before: cursor as Signature | undefined,
        }).send(options);
        const records: (Trade | Claim)[] = [];
        for (let offset = 0; offset < signatures.length; offset += 4) {
          const batch = await Promise.all(signatures.slice(offset, offset + 4).filter(item => !item.err).map(async item => {
            const tx = await executor.rpc.getTransaction(item.signature, {
              encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0,
            }).send(options);
            if (!tx) throw Error("Recent transaction details are unavailable.");
            if (!tx.meta || tx.meta.err) return [];
            if (tx.slot !== item.slot) throw Error("Transaction slot changed.");
            if (verifiedPool) return ammTradeEvents(tx, verifiedPool).reverse().map(event => ({
              ...event, id: item.signature + ":" + event.index, signature: item.signature, slot: tx.slot, time: tx.blockTime == null ? null : Number(tx.blockTime),
            }));
            const logs = tx.meta.logMessages ?? [];
            const trades = curveTradeEvents(logs, executor.environment.program, mint).reverse()
              .map(event => ({ ...event, id: "trade:" + event.sequence, signature: item.signature, slot: tx.slot, time: tx.blockTime == null ? null : Number(tx.blockTime) }));
            const claims = feeClaimEvents(logs, executor.environment.program, mint).reverse()
              .map((event, index) => ({ ...event, id: item.signature + ":claim:" + index,
                signature: item.signature, slot: tx.slot, time: tx.blockTime == null ? null : Number(tx.blockTime) }));
            return [...trades, ...claims];
          }));
          records.push(...batch.flat());
        }
        const unique = [...new Map(records.map(record => [record.id, record])).values()].reverse();
        if (!controller.signal.aborted) setResult({
          key, trades: unique.filter(record => "tokens" in record),
          claims: unique.filter(record => "paid" in record), next: signatures.length === 16 ? signatures.at(-1)?.signature : undefined,
        });
      } catch {
        if (!controller.signal.aborted) setResult({ key, error: true });
      }
    })();
    return () => controller.abort();
  }, [executor, curve, mint, key, pool, cursor, archived, query]);

  const current = result?.key === key ? result : undefined;
  const trades = current?.trades ?? [];
  const prices = trades.map(trade => trade.raw * 10n ** BigInt(decimals + 9) / trade.tokens);
  const low = prices.reduce((min, price) => price < min ? price : min, prices[0] ?? 0n);
  const high = prices.reduce((max, price) => price > max ? price : max, low);
  const points = prices.map((price, i) =>
    `${i * 580 / Math.max(1, prices.length - 1) + 10},${high === low ? 60 : 110 - Number((price - low) * 100n / (high - low))}`);

  return <section className="space-y-3 rounded-2xl border border-white/15 p-4" aria-label={`Confirmed ${venue} activity`}>
    <h2 className="text-lg font-bold">Confirmed {venue} activity</h2>
    <p className="text-xs text-white/65">Up to 16 confirmed transactions per page. {pool
      ? "Price uses actual token transfers for supported Raydium base-input swaps, excluding network fees."
      : "Price uses SOL per token before fees. Raydium swaps are separate."}</p>
    <button className="min-h-11 text-[#9cff43] underline" onClick={() => {
      setCursor(undefined); setQuery(""); setSearch(""); setArchived(value => !value);
    }}>{archived ? "Show recent confirmed activity" : "Show finalized archive"}</button>
    {archived && <form className="flex flex-wrap gap-2" onSubmit={event => {
      event.preventDefault(); setCursor(undefined); setQuery(search.trim()); setRetry(n => n + 1);
    }}>
      <input className="min-h-11 min-w-0 rounded border border-white/20 bg-black px-2" aria-label="Search transaction signature"
        maxLength={88} value={search} onChange={event => setSearch(event.target.value)} />
      <button className="min-h-11 text-[#9cff43]">Search archive</button>
    </form>}
    {current?.archive && <div className="space-y-1 text-xs text-white/70">
      <p>Finalized records · {current.archive.stale ? "saved data; RPC update delayed" : "RPC checked"}</p>
      <p>{current.archive.checkpoint.gap ? "Historical gap detected. Some transactions may be missing." :
        current.archive.checkpoint.backfilled ? "Reached the configured RPC’s available history. Older records may be unavailable." :
          "Backfill incomplete. Refresh to continue indexing."}</p>
      {current.archive.cursorExpired && <p>Cursor unavailable. Return to the latest transactions.</p>}
      <button className="min-h-11 text-[#9cff43] underline" onClick={() => setRetry(n => n + 1)}>Refresh archive</button>
    </div>}
    {!current && <p role="status">Loading {venue} activity…</p>}
    {current?.error && <p role="alert">{venue} activity is unavailable. <button className="text-[#9cff43] underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {current?.trades?.length === 0 && <p>No supported {venue} trades in this transaction window.</p>}
    {trades.length > 0 && <>
      {points.length > 1 && <svg viewBox="0 0 600 120" className="h-32 w-full" role="img" aria-label={`Recent ${venue} trade prices`}>
        <polyline points={points.join(" ")} fill="none" stroke="#9cff43" strokeWidth="2" />
      </svg>}
      <ol className="space-y-3 text-sm">
        {trades.slice().reverse().map(trade => <li key={trade.id} className="border-t border-white/10 pt-2">
          <p>{trade.sell ? "Sell" : "Buy"} · {formatUnits(trade.tokens, decimals)} tokens · {formatUnits(trade.raw)} SOL{!pool && " before fees"}</p>
          <p className="break-all text-xs text-white/60">{archived ? "Finalized" : "Confirmed"} at slot {trade.slot.toString()} · {trade.time != null && <time>{new Date(trade.time * 1000).toLocaleString()} · </time>}{trade.signature}</p>
        </li>)}
      </ol>
    </>}
    {!pool && current?.claims && <div className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="font-bold">Confirmed fee claims</h3>
      {current.claims.length === 0 ? <p className="text-sm">No confirmed claims in this transaction window.</p> :
        <ol className="space-y-2 text-sm">
          {current.claims.slice().reverse().map(claim => <li key={claim.id}>
            <p>{claim.platform ? "Platform" : "Creator"} claimed {formatUnits(claim.paid)} SOL</p>
            <p className="break-all text-xs text-white/60">{claim.beneficiary} · {claim.signature}</p>
          </li>)}
        </ol>}
    </div>}
    <div className="flex flex-wrap gap-3 text-sm">
      {cursor && <button className="min-h-11 text-[#9cff43] underline" onClick={() => setCursor(undefined)}>Latest transactions</button>}
      {current?.next && <button className="min-h-11 text-[#9cff43] underline" onClick={() => setCursor(current.next)}>Older transactions</button>}
    </div>
  </section>;
}
