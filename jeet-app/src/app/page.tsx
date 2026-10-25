"use client";
import { useState } from "react";



type Launch = {
  name: string;
  ticker: string;
  mint: string;
  subtitle: string;
  image: string;
  creator: string;
  price: string;
  marketCap: string;
  volume24h: string;
  holders: string;
  age: string;
  bondingProgress: number;
  status: "New" | "Trending" | "Final Stretch" | "Migrated";
  devAllocation: number;
  topHolderPercent: number;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  liquidityStatus: "Pending" | "Locked" | "Burned";
  

  
  };



function calculateIntegrityScore(coin: {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  devAllocation: number;
  topHolderPercent: number;
  liquidityStatus: string;
  bondingProgress: number;
}) {

  let score = 100;

  if (!coin.mintAuthorityRevoked) score -= 25;
  if (!coin.freezeAuthorityRevoked) score -= 20;

  if (coin.devAllocation > 5) {
    score -= 20;
  } else if (coin.devAllocation > 2) {
    score -= 10;
  }

  if (coin.topHolderPercent > 20) {
    score -= 20;
  } else if (coin.topHolderPercent > 15) {
    score -= 10;
  }

  if (coin.liquidityStatus === "Pending") score -= 5;
if (coin.bondingProgress < 20 && coin.liquidityStatus ==="PENDING") score -= 5;
  return Math.max(0, Math.min(100, score));
}



function getIntegrityNotes(coin: {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  devAllocation: number;
  topHolderPercent: number;
  liquidityStatus: string;
  bondingProgress: number;
}) {
  const notes: string[] = [];

  if (!coin.mintAuthorityRevoked) notes.push("Mint authority active");
  if (!coin.freezeAuthorityRevoked) notes.push("Freeze authority active");
  if (coin.devAllocation > 5) notes.push("High dev allocation");
  if (coin.topHolderPercent > 20) notes.push("High holder concentration");
  if (coin.liquidityStatus === "Pending") notes.push("Liquidity pending");
  if (coin.bondingProgress < 20) notes.push("Very early launch");

  return notes;
}



const trendingLaunches: Launch[] = [
  {
    name: "DOGGO",
    ticker: "DOGGO",
    mint: "PLACEHOLDER_MINT_1",
    image: "",
    creator: "PLACEHOLDER_CREATOR_1",
    subtitle: "Doggo Coin",
    price: "$0.0024",
    marketCap: "$184K",
    volume24h: "$1.2M",
    holders: "4.8K",
    age: "6h",
    bondingProgress: 72,
status: "Trending",
devAllocation: 1,
topHolderPercent: 12,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",

    
  
  },
  {
    name: "KITTY",
    ticker: "KITTY",
    mint: "PLACEHOLDER_MINT_2",
    image: "",
    creator: "PLACEHOLDER_CREATOR_2",
    subtitle: "Kitty On Sol",
    price: "$0.0009",
    marketCap: "$96K",
    volume24h: "$420K",
    holders: "2.1K",
    age: "3h",
    bondingProgress: 61,
status: "Trending",
devAllocation: 1,
topHolderPercent: 14,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",

    
    
  },
  {
    name: "PEPE2.0",
    ticker: "PEPE2.0",
    mint: "PLACEHOLDER_MINT_3",
    image: "",
    creator: "PLACEHOLDER_CREATOR_3",
    subtitle: "Pepe 2.0",
    price: "$0.0011",
    marketCap: "$121K",
    volume24h: "$310K",
    holders: "1.7K",
    age: "5h",
    bondingProgress: 66,
status: "Trending",
devAllocation: 1,
topHolderPercent: 13,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",


    
    
  },
  {
    name: "$JEET",
    ticker: "JEET",
    mint: "PLACEHOLDER_MINT_4",
    image: "",
    creator: "PLACEHOLDER_CREATOR_4",
    subtitle: "JeeT the Cat",
    price: "$0.0031",
    marketCap: "$268K",
    volume24h: "$2.4M",
    holders: "6.2K",
    age: "12h",
    bondingProgress: 84,
status: "Trending",
devAllocation: 1,
topHolderPercent: 10,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",

    
    
  },
];


const newLaunches: Launch[] = [
  {
    name: "MOONCAT",
    ticker: "MOONCAT",
    mint: "PLACEHOLDER_MINT_5",
    image: "",
    creator: "PLACEHOLDER_CREATOR_5",
    subtitle: "Moon Cat",
    price: "$0.00014",
    marketCap: "$42K",
    volume24h: "$38K",
    holders: "420",
    age: "12m",
    bondingProgress: 18,
status: "New",
devAllocation: 1,
topHolderPercent: 9,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",
  },
  {
    name: "BANANAS",
    ticker: "BANANAS",
    mint: "PLACEHOLDER_MINT_6",
    image: "",
    creator: "PLACEHOLDER_CREATOR_6",
    subtitle: "Bananas On Sol",
    price: "$0.00021",
    marketCap: "$57K",
    volume24h: "$61K",
    holders: "690",
    age: "27m",
    bondingProgress: 27,
status: "New",
devAllocation: 1,
topHolderPercent: 11,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",
  },
  {
    name: "FROGGO",
    ticker: "FROGGO",
    mint: "PLACEHOLDER_MINT_7",
    image: "",
    creator: "PLACEHOLDER_CREATOR_7",
    subtitle: "Froggo",
    price: "$0.00008",
    marketCap: "$31K",
    volume24h: "$22K",
    holders: "305",
    age: "41m",
    bondingProgress: 14,
status: "New",
devAllocation: 1,
topHolderPercent: 10,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",
  },
  {
    name: "CHONK",
    ticker: "CHONK",
    mint: "PLACEHOLDER_MINT_8",
    image: "",
    creator: "PLACEHOLDER_CREATOR_8",
    subtitle: "Chonk Cat",
    price: "$0.00017",
    marketCap: "$49K",
    volume24h: "$44K",
    holders: "515",
    age: "53m",
    bondingProgress: 22,
status: "New",
devAllocation: 1,
topHolderPercent: 12,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",

  },
];


const finalStretchLaunches: Launch[] = [
  {
    name: "WAGMI",
    ticker: "WAGMI",
    mint: "PLACEHOLDER_MINT_9",
    image: "",
    creator: "PLACEHOLDER_CREATOR_9",
    subtitle: "We Are Gonna Make It",
    price: "$0.00074",
    marketCap: "$152K",
    volume24h: "$188K",
    holders: "1.4K",
    age: "2h",
    bondingProgress: 91,
status: "Final Stretch",
devAllocation: 1,
topHolderPercent: 11,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",

  },
  {
    name: "DEGEN",
    ticker: "DEGEN",
    mint: "PLACEHOLDER_MINT_10",
    image: "",
    creator: "PLACEHOLDER_CREATOR_10",
    subtitle: "Degen Mode",
    price: "$0.0012",
    marketCap: "$214K",
    volume24h: "$265K",
    holders: "1.9K",
    age: "3h",
    bondingProgress: 95,
status: "Final Stretch",
devAllocation: 1,
topHolderPercent: 12,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",
    
  },
  {
    name: "PUMPY",
    ticker: "PUMPY",
    mint: "PLACEHOLDER_MINT_11",
    image: "",
    creator: "PLACEHOLDER_CREATOR_11",
    subtitle: "Pumpy",
    price: "$0.00063",
    marketCap: "$173K",
    volume24h: "$149K",
    holders: "1.2K",
    age: "2h",
    bondingProgress: 88,
status: "Final Stretch",
devAllocation: 1,
topHolderPercent: 10,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",
    
  },
  {
    name: "SENDIT",
    ticker: "SENDIT",
    mint: "PLACEHOLDER_MINT_12",
    image: "",
    creator: "PLACEHOLDER_CREATOR_12",
    subtitle: "Send It",
    price: "$0.00091",
    marketCap: "$198K",
    volume24h: "$201K",
    holders: "1.6K",
    age: "4h",
    bondingProgress: 93,
status: "Final Stretch",
devAllocation: 1,
topHolderPercent: 11,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Pending",
    
  },
];



const migratedLaunches: Launch[] = [
  {
    name: "SOLCAT",
    ticker: "SOLCAT",
    mint: "PLACEHOLDER_MINT_13",
    image: "",
    creator: "PLACEHOLDER_CREATOR_13",
    subtitle: "Sol Cat",
    price: "$0.0048",
    marketCap: "$1.1M",
    volume24h: "$1.8M",
    holders: "5.7K",
    age: "9h",
    bondingProgress: 100,
status: "Migrated",
devAllocation: 1,
topHolderPercent: 9,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",
    
  },
  {
    name: "BONKX",
    ticker: "BONKX",
    mint: "PLACEHOLDER_MINT_14",
    image: "",
    creator: "PLACEHOLDER_CREATOR_14",
    subtitle: "Bonk X",
    price: "$0.0031",
    marketCap: "$860K",
    volume24h: "$1.2M",
    holders: "4.9K",
    age: "11h",
    bondingProgress: 100,
status: "Migrated",
devAllocation: 1,
topHolderPercent: 10,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",
  
  },
  {
    name: "APEIT",
    ticker: "APEIT",
    mint: "PLACEHOLDER_MINT_15",
    image: "",
    creator: "PLACEHOLDER_CREATOR_15",
    subtitle: "Ape It",
    price: "$0.0062",
    marketCap: "$1.4M",
    volume24h: "$2.3M",
    holders: "7.1K",
    age: "14h",
    bondingProgress: 100,
status: "Migrated",
devAllocation: 1,
topHolderPercent: 8,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",
    
  },
  {
    name: "MOONER",
    ticker: "MOONER",
    mint: "PLACEHOLDER_MINT_16",
    image: "",
    creator: "PLACEHOLDER_CREATOR_16",
    subtitle: "Mooner",
    price: "$0.0054",
    marketCap: "$1.2M",
    volume24h: "$1.9M",
    holders: "6.3K",
    age: "16h",
    bondingProgress: 100,
status: "Migrated",
devAllocation: 1,
topHolderPercent: 9,
mintAuthorityRevoked: true,
freezeAuthorityRevoked: true,
liquidityStatus: "Locked",
    
  },
];




const fairRules = [
  "Fair launch mechanics",
  "No hidden allocations",
  "Transparent token supply",
  "Community first",
  "Rug scan & safety checks",
];

export default function Home() {
  const [activeLaunchTab, setActiveLaunchTab] = useState("Trending");



  const activeLaunches =
  activeLaunchTab === "New"
    ? newLaunches
    : activeLaunchTab === "Final Stretch"
    ? finalStretchLaunches
    : activeLaunchTab === "Migrated"
    ? migratedLaunches
    : trendingLaunches;




  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050605] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-220px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[#9cff43]/[0.08] blur-[140px]" />
        <div className="absolute right-[-160px] top-[260px] h-[460px] w-[460px] rounded-full bg-[#7dff4d]/[0.04] blur-[130px]" />
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050605]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#9cff43]/25 bg-[#9cff43]/10 text-xl">
              🐱
            </div>

            <div className="flex items-center gap-1">
              <span className="text-xl font-black tracking-tight">DidYou</span>
              <span className="text-xl font-black tracking-tight text-[#9cff43]">
                Jeet
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-white/55 lg:flex">
            <a className="border-b-2 border-[#9cff43] pb-2 text-white" href="#">
              Launchpad
            </a>
            <a className="transition hover:text-white" href="#launches">
              Explore
            </a>
            <a className="transition hover:text-white" href="/create">
              Create
            </a>
            <a className="transition hover:text-white" href="#">
              Leaderboard
            </a>
            <a className="transition hover:text-white" href="#">
              Docs
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden min-w-[280px] items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 lg:flex">
              <span className="mr-2 text-white/25">⌕</span>
              <span className="text-xs text-white/30">
                Search tokens, wallets, or CA...
              </span>
            </div>

            V
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-[1500px] px-5 pb-8 pt-10 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_.9fr_.72fr] lg:items-center">
          <div>
            <h1 className="text-[3.4rem] font-black leading-[0.92] tracking-[-0.055em] sm:text-6xl lg:text-[5.3rem]">
              FAIR LAUNCHES.
              <span className="block text-[#9cff43]">
                NO HIDDEN
                <br />
                BUNDLES.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/55">
              The Solana launchpad for real people.
              <br />
              Transparent launches. Same rules for everyone.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
  href="/create"
  className="rounded-2xl bg-[#9cff43] px-7 py-4 font-black text-black"
>
  Launch a Coin →
</a>

              <a
  href="#launches"
  className="rounded-2xl border border-white/[0.1] bg-white/[0.03] px-7 py-4 font-black transition hover:bg-white/[0.06]"
>
  Explore Launches
</a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-white/40">
              <span>🛡 No hidden allocations</span>
              <span>♙ Fair for everyone</span>
              <span>▥ Built on Solana</span>
            </div>
          </div>

          {/* SINGLE PROMO JEEТ */}
          <div className="relative min-h-[520px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(156,255,67,0.16),transparent_46%)]" />

            <div className="absolute right-3 top-3 z-20 rotate-3 rounded-2xl border border-black/20 bg-white px-5 py-4 text-black shadow-xl">
              <p className="text-lg font-black leading-tight">
                YOU SOLD
                <br />
                THERE?! 💀
              </p>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-center">
              <img
                src="/jeet-promo.png"
                alt="JeeT the Cat giving a thumbs up"
                className="relative z-10 h-[500px] w-auto object-contain drop-shadow-[0_25px_45px_rgba(0,0,0,0.7)]"
              />
            </div>
          </div>

          {/* PAPER HANDS */}
          <div className="rounded-[24px] border border-white/[0.08] bg-[#0a0d0a] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <h3 className="text-2xl font-black leading-tight">
              EXPOSE YOUR
              <br />
              PAPER HANDS
            </h3>

            <p className="mt-3 leading-6 text-white/45">
              Paste any Solana wallet.
              <br />
              Get roasted by JeeT.
            </p>

            <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white/25">
              ◉ &nbsp; Paste your Solana wallet address...
            </div>

            <button className="mt-4 w-full rounded-xl bg-[#9cff43] py-3.5 font-black text-black">
              EXPOSE MY PAPER HANDS →
            </button>

            <p className="mt-4 text-xs text-white/30">
              🛡 Read-only. No signing required.
            </p>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="mx-auto max-w-[1500px] px-5 lg:px-8">
        <div className="grid grid-cols-2 overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#090b09] md:grid-cols-4">
          {[
            ["2,483+", "Tokens Launched"],
            ["$12.4M+", "Volume on JeeT"],
            ["186K+", "Traders & Degens"],
            ["100%", "Fair Launches"],
          ].map(([value, label], index) => (
            <div
              key={label}
              className={`px-6 py-5 ${
                index !== 3 ? "md:border-r md:border-white/[0.06]" : ""
              }`}
            >
              <p className="text-3xl font-black text-[#9cff43]">{value}</p>
              <p className="mt-1 text-sm text-white/40">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TRENDING */}
      <section
        id="launches"
        className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wide text-white/75">
            🔥 {activeLaunchTab} Launches
          </h2>

          <button className="text-xs font-black text-[#9cff43]">
            View All →
          </button>
        </div>


<div className="mb-6 flex flex-wrap gap-2">
  {["New", "Trending", "Final Stretch", "Migrated"].map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveLaunchTab(tab)}
      className={`rounded-xl px-4 py-2 text-sm font-black transition ${
        activeLaunchTab === tab
          ? "bg-[#9cff43] text-black"
          : "border border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {tab}
    </button>
  ))}
</div>



        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {activeLaunches.map((coin) => (
            <article
              key={coin.name}
              className="rounded-[18px] border border-white/[0.08] bg-[#0a0c0a] p-4 transition hover:border-[#9cff43]/25"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-2xl">
                    {coin.image ? (
  <img
    src={coin.image}
    alt={coin.name}
    className="h-full w-full rounded-xl object-cover"
  />
) : (
  <span className="text-xl">🪙</span>
)}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black">{coin.name}</p>
                      <span className="rounded-full bg-[#1b2f1c] px-2 py-0.5 text-[9px] font-black text-[#76ff68]">
                        {coin.status}
                      </span>
                      <span
  className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${
    calculateIntegrityScore(coin) >= 90
      ? "border-[#9cff43]/30 bg-[#9cff43]/10 text-[#9cff43]"
      : calculateIntegrityScore(coin) >= 75
      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
      : "border-red-400/30 bg-red-400/10 text-red-300"
  }`}
>
  Integrity {calculateIntegrityScore(coin)}
</span>
{getIntegrityNotes(coin).length > 0 && (
  <p className="mt-1 text-[10px] text-yellow-300/80">
    {getIntegrityNotes(coin)[0]}
    </p>

)}
                    </div>
                    <p className="text-xs text-white/35">{coin.subtitle}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xl font-black">{coin.price}</p>
                  <p className="mt-1 text-sm font-black text-[#65ff78]">
                    MC {coin.marketCap}
                  </p>
                </div>

                <svg
                  viewBox="0 0 150 55"
                  className="h-14 w-36"
                  preserveAspectRatio="none"
                >
                  <polyline
                    fill="none"
                    stroke="#9cff43"
                    strokeWidth="3"
                    points="0,48 15,46 28,39 40,43 55,32 70,34 84,21 98,24 112,14 126,18 140,8 150,11"
                  />
                </svg>
              </div>


<div className="mt-4">
  <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wide">
    <span className="text-white/40">Bonding Progress</span>
    <span className="text-[#9cff43]">{coin.bondingProgress}%</span>
  </div>

  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
    <div
      className="h-full rounded-full bg-[#9cff43] transition-all"
      style={{ width: `${coin.bondingProgress}%` }}
    />
  </div>
</div>

<div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
    <p className="text-white/35">Dev</p>
    <p className="mt-0.5 font-black text-white">
      {coin.devAllocation}%
    </p>
  </div>

  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
    <p className="text-white/35">Top Holder</p>
    <p className="mt-0.5 font-black text-white">
      {coin.topHolderPercent}%
    </p>
  </div>

  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
    <p className="text-white/35">Liquidity</p>
    <p className="mt-0.5 font-black text-[#9cff43]">
      {coin.liquidityStatus}
    </p>
  </div>
</div>



<div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black">
  <span
    className={`rounded-full border px-2 py-1 ${
      coin.mintAuthorityRevoked
        ? "border-[#9cff43]/30 bg-[#9cff43]/10 text-[#9cff43]"
        : "border-red-400/30 bg-red-400/10 text-red-300"
    }`}
  >
    Mint {coin.mintAuthorityRevoked ? "Revoked ✓" : "Active ⚠"}
  </span>

  <span
    className={`rounded-full border px-2 py-1 ${
      coin.freezeAuthorityRevoked
        ? "border-[#9cff43]/30 bg-[#9cff43]/10 text-[#9cff43]"
        : "border-red-400/30 bg-red-400/10 text-red-300"
    }`}
  >
    Freeze {coin.freezeAuthorityRevoked ? "Revoked ✓" : "Active ⚠"}
  </span>
</div>



<div className="mt-4 grid grid-cols-3 border-t border-white/[0.06] pt-3 text-center">
                <div>
                  <p className="text-sm font-black">
  {coin.volume24h}
</p>
                  <p className="text-[10px] text-white/30">Volume</p>
                </div>
                <div>
                  <p className="text-sm font-black">{coin.holders}</p>
                  <p className="text-[10px] text-white/30">Holders</p>
                </div>
                <div>
                  <p className="text-sm font-black">{coin.age}</p>
                  <p className="text-[10px] text-white/30">Old</p>
                </div>
              </div>






            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1500px] px-5 pb-10 lg:px-8">
        <div className="rounded-[28px] border border-white/[0.07] bg-[#090b09] p-7 lg:p-9">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_.85fr] lg:items-center">
            <div>
              <h2 className="text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-5xl">
                LAUNCH A COIN.
                <span className="block text-[#9cff43]">
                  BUILT FOR THE PEOPLE.
                </span>
              </h2>

              <p className="mt-4 text-lg leading-7 text-white/45">
                No hidden bundles. No team snipes.
                <br />
                Just fair launches on Solana.
              </p>

              <button className="mt-6 rounded-xl bg-[#9cff43] px-6 py-3.5 font-black text-black">
                Create Your Token →
              </button>
            </div>

            <div className="grid gap-3">
              {fairRules.map((rule) => (
                <div key={rule} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#9cff43] text-xs font-black text-black">
                    ✓
                  </span>
                  <span className="text-sm font-semibold text-white/65">
                    {rule}
                  </span>
                </div>
              ))}

              <div className="mt-2 rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                <p className="text-xl font-black leading-tight">
                  REAL PROJECTS.
                  <br />
                  <span className="text-[#9cff43]">REAL COMMUNITIES.</span>
                </p>

                <div className="mt-5 flex h-24 items-end gap-2">
                  {[28, 40, 48, 58, 69, 78, 92, 105].map((height) => (
                    <div
                      key={height}
                      className="flex-1 rounded-t bg-gradient-to-t from-[#58c83a] to-[#9cff43]"
                      style={{ height }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-7 text-xs text-white/25 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p className="font-black text-white/50">JeeT Launch</p>
          <p>Same cat. Different bags.</p>
        </div>
      </footer>
    </main>
  );
}