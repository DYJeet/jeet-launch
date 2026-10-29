"use client";

import { useMemo, useState } from "react";
import LaunchCard from "@/components/LaunchCard";
import SiteHeader from "@/components/SiteHeader";
import { launchTabs, launches, type LaunchStatus } from "@/lib/launches";

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState<LaunchStatus>("Trending");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return launches.filter((coin) => {
      const matchesTab = coin.status === activeTab;
      const matchesQuery =
        !normalized ||
        coin.name.toLowerCase().includes(normalized) ||
        coin.ticker.toLowerCase().includes(normalized) ||
        coin.mint.toLowerCase().includes(normalized);
      return matchesTab && matchesQuery;
    });
  }, [activeTab, query]);

  return (
    <main className="min-h-screen bg-[#050605] text-white">
      <SiteHeader />

      <section className="mx-auto max-w-[1500px] px-5 pb-16 pt-10 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9cff43]">JeeT Launch</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Explore launches</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
              Browse launches by stage, compare integrity signals, and open any token for the full launch view.
            </p>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search verified launches"
              placeholder="Search name, ticker, or mint..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {launchTabs.map((tab) => (
            <button
              key={tab}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                activeTab === tab
                  ? "bg-[#9cff43] text-black"
                  : "border border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-y border-white/[0.06] py-3 text-xs text-white/35">
          <span>{filtered.length} launches</span>
          <span>Verified index not connected</span>
        </div>

        {filtered.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filtered.map((coin) => <LaunchCard key={coin.mint} coin={coin} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center text-sm text-white/35">
            No verified listings are available from this application yet. This is not a claim that no tokens exist on-chain. Demo records are excluded.
          </div>
        )}
      </section>
    </main>
  );
}
