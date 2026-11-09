"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { launchViews, type IndexedLaunch, type LaunchView } from "@/lib/launch-index";
import { formatUnits } from "@/lib/wallet-environment";

type Page = { rows: IndexedLaunch[]; total: number; next?: string; cursorExpired: boolean; indexedAt: number; stale?: boolean };

export default function LaunchDiscovery({ compact = false }: { compact?: boolean }) {
  const [view, setView] = useState<LaunchView>("New");
  const [query, setQuery] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; page?: Page; error?: string }>();
  const params = new URLSearchParams({ view, q: query, limit: compact ? "4" : "12" });
  const cursor = cursors.at(-1);
  if (cursor) params.set("after", cursor);
  const key = params.toString() + "&retry=" + retry;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/launches?" + key, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (response.status === 404) throw Error("Verified index is unavailable outside the configured local validator.");
        if (!response.ok) throw Error("Launch index is temporarily unavailable.");
        const page = await response.json() as Page;
        if (!controller.signal.aborted) setResult({ key, page });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Launch index is unavailable." });
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key]);
  const current = result?.key === key ? result : null;
  const page = current?.page;

  return <div className="space-y-4">
    {!compact && <input value={query} maxLength={100} onChange={e => { setQuery(e.target.value); setCursors([]); }}
      aria-label="Search verified launches" placeholder="Search name, ticker, or mint"
      className="w-full max-w-md rounded-xl border border-white/15 bg-white/5 p-3 text-sm" />}
    <div className="flex flex-wrap gap-2">
      {launchViews.map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => { setView(tab); setCursors([]); }}
        className={`min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold ${view === tab ? "bg-[#9cff43] text-black" : "text-white/75"}`}>{tab}</button>)}
    </div>
    {view === "Trending" && <p className="text-xs text-white/60">Ranked by cumulative curve turnover. Raydium swaps are excluded.</p>}
    {!current && <p role="status">Loading verified launches…</p>}
    {current?.error && <div className="flex flex-wrap items-center gap-3 text-sm"><p role="alert">{current.error}</p>
      <button className="text-[#9cff43] underline" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {page?.cursorExpired && <p role="status">The listing changed. <button className="min-h-11 text-[#9cff43] underline"
      onClick={() => setCursors([])}>Back to first page</button></p>}
    {page && !page.cursorExpired && <div aria-live="polite">
      <p className="text-xs text-white/60">Read at {new Date(page.indexedAt).toLocaleTimeString()} · {page.stale ? "saved snapshot (RPC unavailable)" : "confirmed snapshot"}
        <button className="ml-2 min-h-11 text-[#9cff43] underline" onClick={() => { setCursors([]); setRetry(n => n + 1); }}>Refresh listings</button>
      </p>
      <p className="mb-4 text-sm text-white/60">{page.total === 0 ? "No verified launches match this view." : `${page.total} verified launches · local validator`}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {page.rows.map(row => <Link key={row.mint} href={`/token/${row.mint}`}
          className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-[#9cff43]/50">
          <h3 className="break-words text-lg font-black">{row.name} <span className="text-sm text-[#9cff43]">{row.symbol}</span></h3>
          <p className="mt-2 break-all text-xs text-white/60">{row.mint}</p>
          <p className="mt-3 text-sm">{row.migrated ? "Migrated" : row.eligible ? "Graduation eligible" : `${row.progress}% curve progress`}</p>
          <p className="mt-1 text-xs text-white/60">{formatUnits(BigInt(row.volume))} SOL cumulative curve turnover</p>
        </Link>)}
      </div>
      {!compact && (cursor || page.next) && <div className="mt-5 flex gap-4">
        <button disabled={!cursor} className="min-h-11 text-[#9cff43] disabled:opacity-40" onClick={() => setCursors(items => items.slice(0, -1))}>Previous</button>
        <button disabled={!page.next} className="min-h-11 text-[#9cff43] disabled:opacity-40" onClick={() => {
          if (page.next) setCursors([...cursors, page.next]);
        }}>Next</button>
      </div>}
    </div>}
  </div>;
}
