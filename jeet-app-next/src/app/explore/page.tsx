import { headers } from "next/headers";
import { previewEnabled } from "@/lib/local-wallet-server";
import { GET as listings } from "@/app/api/launches/route";
import { launchViews, type IndexedLaunch } from "@/lib/launch-index";
import LaunchDiscovery from "@/components/LaunchDiscovery";
import SiteHeader from "@/components/SiteHeader";

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const preview = previewEnabled();
  const params = new URLSearchParams();
  let page: { rows: IndexedLaunch[]; next?: string; gap?: boolean; backfilling?: boolean; cursorExpired?: boolean; stale?: boolean } | undefined;
  if (preview) {
    const query = await searchParams;
    for (const key of ["view", "q", "after", "limit"]) {
      if (typeof query[key] === "string") params.set(key, query[key]);
    }
    const response = await listings(new Request("https://" + process.env.JEET_PREVIEW_HOST + "/api/launches?" + params,
      { headers: await headers() }));
    if (response.ok) page = await response.json();
  }
  return <main className="min-h-screen bg-[#050605] text-white">
    <SiteHeader />
    <section className="mx-auto max-w-[1500px] space-y-6 px-5 pb-16 pt-10 lg:px-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9cff43]">JeeT Launch</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Explore launches</h1>
        <p className="mt-3 text-sm text-white/60">Browse activated launches by stage, then open a token for verified launch details.</p>
      </div>
      {preview ? <>
        <form action="/explore" className="flex flex-wrap gap-2">
          <input type="hidden" name="view" value={params.get("view") ?? "New"} />
          <input aria-label="Search verified launches" name="q" defaultValue={params.get("q") ?? ""}
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/5 p-3" placeholder="Search name, ticker, or mint" />
          <button className="min-h-11 rounded-xl bg-[#9cff43] px-4 text-black">Search</button>
        </form>
        <nav className="flex flex-wrap gap-3" aria-label="Launch stages">{launchViews.map(view =>
          <a key={view} href={"/explore?" + new URLSearchParams({ view, q: params.get("q") ?? "" })}
            className="rounded-xl border border-white/20 p-3" aria-current={view === (params.get("view") ?? "New") ? "page" : undefined}>{view}</a>)}</nav>
        {page?.gap && <p className="text-amber-200">Local RPC history has a coverage gap.</p>}
        {page?.stale && <p>Showing saved observations while the local RPC catches up.</p>}
        {page?.backfilling && <p>Indexing is in progress. Refresh for more records.</p>}
        {!page ? <p role="alert">Local listings are unavailable. Refresh to retry.</p> : page.cursorExpired ?
          <a href="/explore">Listing order changed. Return to the first page.</a> : page.rows.length === 0 ? <p>No matching test launches.</p> :
          <div className="grid gap-3 sm:grid-cols-2">{page.rows.map(row =>
            <a key={row.mint} className="block rounded-xl border border-white/20 p-4" href={"/token/" + row.mint}>
              <strong>{row.name} · {row.symbol}</strong>
              <p>{row.migrated ? "Migrated" : row.progress + "% curve progress"}</p>
              <p className="break-all text-sm text-white/65">{row.mint}</p>
            </a>)}</div>}
        {page?.next && <a className="underline" href={"/explore?" + new URLSearchParams({ ...Object.fromEntries(params), after: page.next })}>Next page</a>}
      </> : <LaunchDiscovery />}
    </section>
  </main>;
}
