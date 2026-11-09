import { headers } from "next/headers";
import { GET as history } from "@/app/api/market-history/route";
import type { MarketEvent } from "@/lib/market-store";
import { formatUnits } from "@/lib/wallet-environment";

type Page = { events: MarketEvent[]; next?: string; stale: boolean; checkpoint: { gap?: boolean; backfilled?: boolean } };

export default async function PreviewHistory({ mint, venue, before }: { mint: string; venue: string; before: string }) {
  const query = new URLSearchParams({ mint, venue });
  if (before) query.set("before", before);
  const response = await history(new Request("https://" + process.env.JEET_PREVIEW_HOST + "/api/market-history?" + query,
    { headers: await headers() }));
  const page: Page | undefined = response.ok ? await response.json() : undefined;
  const fills = page?.events.filter(event => event.tokens && BigInt(event.tokens) > 0n).slice().reverse() ?? [];
  const prices = fills.map(event => BigInt(event.lamports) * 1000000000n / BigInt(event.tokens!));
  const low = prices.reduce((a, b) => a < b ? a : b, prices[0] ?? 0n);
  const high = prices.reduce((a, b) => a > b ? a : b, low);
  return <section className="mx-auto max-w-4xl space-y-4 px-5 py-8">
    <h1 className="text-2xl font-bold">Local launch history</h1>
    <p className="break-all">{mint}</p>
    <div className="flex flex-wrap gap-4">
      {["curve", "amm"].map(value => <a key={value} className="min-h-11 underline" aria-current={venue === value ? "page" : undefined} href={"?venue=" + value}>{value === "curve" ? "Bonding curve" : "Raydium"}</a>)}
      <a className="min-h-11 underline" href={"?venue=" + venue}>Refresh history</a>
    </div>
    {!page && <p role="alert">History unavailable.</p>}
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
    {page?.next && <a className="min-h-11 underline" href={"?" + new URLSearchParams({ venue, before: page.next })}>Older transactions</a>}
    {before && <a className="ml-4 min-h-11 underline" href={"?venue=" + venue}>Latest transactions</a>}
  </section>;
}
