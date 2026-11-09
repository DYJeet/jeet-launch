"use client";
import { useEffect, useState } from "react";
import type { MarketEvent } from "@/lib/market-store";
import { formatUnits } from "@/lib/wallet-environment";

type Page = { events: MarketEvent[]; next?: string; stale: boolean; checkpoint: { gap?: boolean; backfilled?: boolean } };

export default function PreviewHistory({ mint }: { mint: string }) {
  const [venue, setVenue] = useState("curve");
  const [before, setBefore] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; page?: Page }>();
  const query = new URLSearchParams({ mint, venue });
  if (before) query.set("before", before);
  const key = query + "&refresh=" + retry;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/market-history?" + key, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw Error("History unavailable");
        return response.json() as Promise<Page>;
      })
      .then(page => { if (!controller.signal.aborted) setResult({ key, page }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key }); });
    return () => controller.abort();
  }, [key]);
  const page = result?.key === key ? result.page : undefined;
  const fills = page?.events.filter(event => event.tokens && BigInt(event.tokens) > 0n).slice().reverse() ?? [];
  const prices = fills.map(event => BigInt(event.lamports) * 1000000000n / BigInt(event.tokens!));
  const low = prices.reduce((a, b) => a < b ? a : b, prices[0] ?? 0n);
  const high = prices.reduce((a, b) => a > b ? a : b, low);
  return <section className="mx-auto max-w-4xl space-y-4 px-5 py-8">
    <h1 className="text-2xl font-bold">Local launch history</h1>
    <p className="break-all">{mint}</p>
    <div className="flex flex-wrap gap-4">
      {["curve", "amm"].map(value => <button key={value} className="min-h-11 underline" aria-pressed={venue === value}
        onClick={() => { setVenue(value); setBefore(""); }}>{value === "curve" ? "Bonding curve" : "Raydium"}</button>)}
      <button className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Refresh history</button>
    </div>
    {result?.key !== key ? <p role="status">Loading finalized history…</p> : !page && <p role="alert">History unavailable.</p>}
    {page && <p role="status">{page.stale ? "RPC update delayed or venue unavailable. " : ""}{page.checkpoint.gap ? "History coverage gap. " : ""}
      {!page.checkpoint.backfilled ? "History is still indexing. " : ""}{page.events.length === 0 ? "No indexed events for this venue." : ""}</p>}
    {prices.length > 1 && <svg className="h-32 w-full" viewBox="0 0 600 120" role="img" aria-label="Finalized execution prices per token base unit">
      <polyline fill="none" stroke="#9cff43" strokeWidth="2" points={prices.map((price, i) =>
        [10 + i * 580 / (prices.length - 1), high === low ? 60 : 110 - Number((price - low) * 100n / (high - low))].join(",")).join(" ")} />
    </svg>}
    <ol className="space-y-3">{page?.events.map(event => <li key={event.id} className="break-all rounded-xl border border-white/15 p-3">
      <p>{event.kind} · {formatUnits(BigInt(event.lamports))} SOL {event.tokens && "· " + event.tokens + " token base units"}</p>
      <p className="text-sm text-white/60">Slot {event.slot} · {event.signature}</p>
    </li>)}</ol>
    {page?.next && <button className="min-h-11 underline" onClick={() => setBefore(page.next!)}>Older transactions</button>}
    {before && <button className="ml-4 min-h-11 underline" onClick={() => setBefore("")}>Latest transactions</button>}
  </section>;
}
