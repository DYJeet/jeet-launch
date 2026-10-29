"use client";

import Link from "next/link";
import { useState } from "react";
import LaunchCard from "@/components/LaunchCard";
import SiteHeader from "@/components/SiteHeader";
import { launchTabs, launchesByStatus, type LaunchStatus } from "@/lib/launches";

const fairRules = [
  "Fair launch mechanics",
  "No hidden allocations",
  "Transparent token supply",
  "Community first",
  "Rug scan & safety checks",
];

export default function Home() {
  const [activeLaunchTab, setActiveLaunchTab] = useState<LaunchStatus>("Trending");
  const activeLaunches = launchesByStatus(activeLaunchTab);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050605] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-220px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[#9cff43]/[0.08] blur-[140px]" />
        <div className="absolute right-[-160px] top-[260px] h-[460px] w-[460px] rounded-full bg-[#7dff4d]/[0.04] blur-[130px]" />
      </div>

      <SiteHeader />

      <section className="mx-auto max-w-[1500px] px-5 pb-8 pt-10 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_.9fr_.72fr] lg:items-center">
          <div>
            <h1 className="text-[3.4rem] font-black leading-[0.92] tracking-[-0.055em] sm:text-6xl lg:text-[5.3rem]">
              FAIR LAUNCHES.
              <span className="block text-[#9cff43]">NO HIDDEN<br />BUNDLES.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/55">
              The Solana launchpad for real people.<br />Transparent launches. Same rules for everyone.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/create" className="rounded-2xl bg-[#9cff43] px-7 py-4 font-black text-black">Launch a Coin →</Link>
              <Link href="/explore" className="rounded-2xl border border-white/[0.1] bg-white/[0.03] px-7 py-4 font-black transition hover:bg-white/[0.06]">Explore Launches</Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-white/40">
              <span>🛡 No hidden allocations</span><span>♙ Fair for everyone</span><span>▥ Built on Solana</span>
            </div>
          </div>

          <div className="relative min-h-[520px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(156,255,67,0.16),transparent_46%)]" />
            <div className="absolute right-3 top-3 z-20 rotate-3 rounded-2xl border border-black/20 bg-white px-5 py-4 text-black shadow-xl">
              <p className="text-lg font-black leading-tight">YOU SOLD<br />THERE?! 💀</p>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jeet-promo.png" alt="JeeT the Cat giving a thumbs up" className="relative z-10 h-[500px] w-auto object-contain drop-shadow-[0_25px_45px_rgba(0,0,0,0.7)]" />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/[0.08] bg-[#0a0d0a] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <h3 className="text-2xl font-black leading-tight">KNOW YOUR<br />LAUNCH FEES</h3>
            <p className="mt-3 leading-6 text-white/45">Transparent curve fees.<br />Review platform and creator entitlements.</p>
            <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white/25">0.75% platform + 0.25% creator</div>
            <Link href="/revenue" className="mt-4 block w-full rounded-xl bg-[#9cff43] py-3.5 text-center font-black text-black">VIEW REVENUE & FEES →</Link>
            <p className="mt-4 text-xs text-white/30">Viewing requires no signature. Claims require the entitled signer.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-5 lg:px-8">
        <div className="grid grid-cols-2 overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#090b09] md:grid-cols-4">
          {[["0.75%", "Platform curve fee"], ["0.25%", "Creator curve reward"], ["0 SOL", "Creation platform fee"], ["Devnet", "Current wallet network"]].map(([value, label], index) => (
            <div key={label} className={`px-6 py-5 ${index !== 3 ? "md:border-r md:border-white/[0.06]" : ""}`}>
              <p className="text-3xl font-black text-[#9cff43]">{value}</p><p className="mt-1 text-sm text-white/40">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="launches" className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wide text-white/75">🔥 {activeLaunchTab} Launches</h2>
          <Link href="/explore" className="text-xs font-black text-[#9cff43]">View All →</Link>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {launchTabs.map((tab) => (
            <button key={tab} aria-pressed={activeLaunchTab === tab} onClick={() => setActiveLaunchTab(tab)} className={`rounded-xl px-4 py-2 text-sm font-black transition ${activeLaunchTab === tab ? "bg-[#9cff43] text-black" : "border border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white"}`}>{tab}</button>
          ))}
        </div>

        {!activeLaunches.length && <p role="status" className="mb-5 rounded-2xl border border-white/10 p-5 text-sm text-white/60">Verified launch listings are not connected yet. No demo market activity is shown. V5 trading and graduation are awaiting approval and implementation.</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {activeLaunches.slice(0, 4).map((coin) => <LaunchCard key={coin.mint} coin={coin} />)}
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-5 pb-10 lg:px-8">
        <div className="rounded-[28px] border border-white/[0.07] bg-[#090b09] p-7 lg:p-9">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_.85fr] lg:items-center">
            <div>
              <h2 className="text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-5xl">LAUNCH A COIN.<span className="block text-[#9cff43]">BUILT FOR THE PEOPLE.</span></h2>
              <p className="mt-4 text-lg leading-7 text-white/45">No hidden bundles. No team snipes.<br />Just fair launches on Solana.</p>
              <Link href="/create" className="mt-6 inline-block rounded-xl bg-[#9cff43] px-6 py-3.5 font-black text-black">Create Your Token →</Link>
            </div>

            <div className="grid gap-3">
              {fairRules.map((rule) => (
                <div key={rule} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#9cff43] text-xs font-black text-black">✓</span><span className="text-sm font-semibold text-white/65">{rule}</span></div>
              ))}
              <div className="mt-2 rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                <p className="text-xl font-black leading-tight">REAL PROJECTS.<br /><span className="text-[#9cff43]">REAL COMMUNITIES.</span></p>
                <div className="mt-5 flex h-24 items-end gap-2">{[28,40,48,58,69,78,92,105].map((height) => <div key={height} className="flex-1 rounded-t bg-gradient-to-t from-[#58c83a] to-[#9cff43]" style={{ height }} />)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-7 text-xs text-white/25 sm:flex-row sm:items-center sm:justify-between lg:px-8"><p className="font-black text-white/50">JeeT Launch</p><p>Same cat. Different bags.</p></div>
      </footer>
    </main>
  );
}
