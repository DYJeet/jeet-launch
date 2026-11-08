"use client";

import { useEffect, useState } from "react";
import { address, type Signature } from "@solana/kit";
import { ammHistoryPool, ammTradeEvents } from "@/lib/amm-history";
import { curveTradeEvents } from "@/lib/curve-history";
import { formatUnits } from "@/lib/wallet-environment";
import type { WalletTransactionExecutor } from "@/lib/wallet-transactions";

type Trade = { id: string; sell: boolean; tokens: bigint; raw: bigint; signature: string; slot: bigint };

export default function CurveHistory({ executor, curve, mint, decimals, revision, pool }: {
  executor: WalletTransactionExecutor;
  curve: string;
  mint: string;
  decimals: number;
  revision: bigint;
  pool?: string;
}) {
  const [result, setResult] = useState<{ key: string; trades?: Trade[]; next?: Signature; error?: boolean }>();
  const [retry, setRetry] = useState(0);
  const [cursor, setCursor] = useState<Signature>();
  const key = mint + ":" + revision + ":" + retry + ":" + (cursor ?? "");
  const venue = pool ? "Raydium" : "curve";
  useEffect(() => {
    const controller = new AbortController();
    const options = { abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) };
    void (async () => {
      try {
        const verifiedPool = pool ? await ammHistoryPool(address(mint), address(pool)) : undefined;
        const signatures = await executor.rpc.getSignaturesForAddress(address(pool ?? curve), {
          limit: 16, commitment: "confirmed", before: cursor,
        }).send(options);
        const trades: Trade[] = [];
        for (let offset = 0; offset < signatures.length; offset += 4) {
          const batch = await Promise.all(signatures.slice(offset, offset + 4).filter(item => !item.err).map(async item => {
            const tx = await executor.rpc.getTransaction(item.signature, {
              encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0,
            }).send(options);
            if (!tx) throw Error("Recent transaction details are unavailable.");
            if (!tx.meta || tx.meta.err) return [];
            if (tx.slot !== item.slot) throw Error("Transaction slot changed.");
            if (verifiedPool) return ammTradeEvents(tx, verifiedPool).reverse().map(event => ({
              ...event, id: item.signature + ":" + event.index, signature: item.signature, slot: tx.slot,
            }));
            return curveTradeEvents(tx.meta.logMessages ?? [], executor.environment.program, mint).reverse()
              .map(event => ({ ...event, id: event.sequence.toString(), signature: item.signature, slot: tx.slot }));
          }));
          trades.push(...batch.flat());
        }
        const unique = [...new Map(trades.map(trade => [trade.id, trade])).values()].reverse();
        if (!controller.signal.aborted) setResult({
          key, trades: unique, next: signatures.length === 16 ? signatures.at(-1)?.signature : undefined,
        });
      } catch {
        if (!controller.signal.aborted) setResult({ key, error: true });
      }
    })();
    return () => controller.abort();
  }, [executor, curve, mint, key, pool, cursor]);

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
          <p className="break-all text-xs text-white/60">Confirmed at slot {trade.slot.toString()} · {trade.signature}</p>
        </li>)}
      </ol>
    </>}
    <div className="flex flex-wrap gap-3 text-sm">
      {cursor && <button className="min-h-11 text-[#9cff43] underline" onClick={() => setCursor(undefined)}>Latest transactions</button>}
      {current?.next && <button className="min-h-11 text-[#9cff43] underline" onClick={() => setCursor(current.next)}>Older transactions</button>}
    </div>
  </section>;
}
