"use client";

import { useEffect, useState } from "react";
import { address } from "@solana/kit";
import { curveTradeEvents } from "@/lib/curve-history";
import { formatUnits } from "@/lib/wallet-environment";
import type { WalletTransactionExecutor } from "@/lib/wallet-transactions";

type Trade = ReturnType<typeof curveTradeEvents>[number] & { signature: string; slot: bigint };

export default function CurveHistory({ executor, curve, mint, decimals, revision }: {
  executor: WalletTransactionExecutor;
  curve: string;
  mint: string;
  decimals: number;
  revision: bigint;
}) {
  const [result, setResult] = useState<{ key: string; trades?: Trade[]; error?: boolean }>();
  const [retry, setRetry] = useState(0);
  const key = mint + ":" + revision + ":" + retry;
  useEffect(() => {
    const controller = new AbortController();
    const options = { abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) };
    void (async () => {
      try {
        const signatures = await executor.rpc.getSignaturesForAddress(address(curve), {
          limit: 16, commitment: "confirmed",
        }).send(options);
        const trades: Trade[] = [];
        for (let offset = 0; offset < signatures.length; offset += 4) {
          const batch = await Promise.all(signatures.slice(offset, offset + 4).filter(item => !item.err).map(async item => {
            const tx = await executor.rpc.getTransaction(item.signature, {
              encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0,
            }).send(options);
            if (!tx) throw Error("Recent transaction details are unavailable.");
            if (!tx.meta || tx.meta.err) return [];
            return curveTradeEvents(tx.meta.logMessages ?? [], executor.environment.program, mint)
              .map(event => ({ ...event, signature: item.signature, slot: tx.slot }));
          }));
          trades.push(...batch.flat());
        }
        trades.sort((a, b) => a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0);
        if (!controller.signal.aborted) setResult({ key, trades });
      } catch {
        if (!controller.signal.aborted) setResult({ key, error: true });
      }
    })();
    return () => controller.abort();
  }, [executor, curve, mint, key]);

  const current = result?.key === key ? result : undefined;
  const trades = current?.trades ?? [];
  const prices = trades.map(trade => trade.raw * 10n ** BigInt(decimals + 9) / trade.tokens);
  const low = prices.reduce((min, price) => price < min ? price : min, prices[0] ?? 0n);
  const high = prices.reduce((max, price) => price > max ? price : max, low);
  const points = prices.map((price, i) =>
    `${i * 580 / Math.max(1, prices.length - 1) + 10},${high === low ? 60 : 110 - Number((price - low) * 100n / (high - low))}`);

  return <section className="space-y-3 rounded-2xl border border-white/15 p-4" aria-label="Confirmed curve activity">
    <h2 className="text-lg font-bold">Confirmed curve activity</h2>
    <p className="text-xs text-white/65">Most recent 16 curve transactions. Price uses SOL per token before fees. Raydium swaps are separate.</p>
    {!current && <p role="status">Loading curve activity…</p>}
    {current?.error && <p role="alert">Curve activity is unavailable. <button className="text-[#9cff43] underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {current?.trades?.length === 0 && <p>No curve trades in this transaction window.</p>}
    {trades.length > 0 && <>
      {points.length > 1 && <svg viewBox="0 0 600 120" className="h-32 w-full" role="img" aria-label="Recent curve trade prices">
        <polyline points={points.join(" ")} fill="none" stroke="#9cff43" strokeWidth="2" />
      </svg>}
      <ol className="space-y-3 text-sm">
        {trades.slice().reverse().map(trade => <li key={trade.sequence.toString()} className="border-t border-white/10 pt-2">
          <p>{trade.sell ? "Sell" : "Buy"} · {formatUnits(trade.tokens, decimals)} tokens · {formatUnits(trade.raw)} SOL before fees</p>
          <p className="break-all text-xs text-white/60">Confirmed at slot {trade.slot.toString()} · {trade.signature}</p>
        </li>)}
      </ol>
    </>}
  </section>;
}
