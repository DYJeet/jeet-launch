import Link from "next/link";
import WalletLaunchReader from "@/components/WalletLaunchReader";
import SiteHeader from "@/components/SiteHeader";
import LiveMintData from "@/components/LiveMintData";
import { calculateIntegrityScore, findLaunch, getIntegrityNotes, launches } from "@/lib/launches";

export function generateStaticParams() {
  return launches.map((coin) => ({
    mint: coin.mint,
  }));
}

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const coin = findLaunch(mint);

  if (!coin) return <main className="min-h-screen bg-[#050605] text-white"><SiteHeader /><WalletLaunchReader mint={mint} /></main>;

  const integrity = calculateIntegrityScore(coin);
  const notes = getIntegrityNotes(coin);

  return (
    <main className="min-h-screen bg-[#050605] text-white">
      <SiteHeader />

      <section className="mx-auto max-w-[1500px] px-5 pb-16 pt-8 lg:px-8">
        <Link href="/explore" className="text-xs font-black text-white/35 transition hover:text-[#9cff43]">← Back to Explore</Link>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
          <div className="space-y-5">
            <div className="rounded-[28px] border border-white/[0.08] bg-[#090c09] p-6 lg:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] text-4xl">
                    {coin.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coin.image} alt={coin.name} className="h-full w-full object-cover" />
                    ) : "🪙"}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-3xl font-black tracking-[-0.03em]">{coin.name}</h1>
                      <span className="rounded-full bg-[#1b2f1c] px-2.5 py-1 text-[10px] font-black text-[#76ff68]">{coin.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-white/40">${coin.ticker} · {coin.subtitle}</p>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">{coin.description}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#9cff43]/20 bg-[#9cff43]/[0.06] px-4 py-3 text-right">
                  <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Integrity</p>
                  <p className="text-3xl font-black text-[#9cff43]">{integrity}<span className="text-sm text-white/30">/100</span></p>
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Price" value={coin.price} />
                <Metric label="Market cap" value={coin.marketCap} accent />
                <Metric label="24h volume" value={coin.volume24h} />
                <Metric label="24h change" value={coin.change24h} accent />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-[#090c09] p-6 lg:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-white/35">Price chart</p>
                  <h2 className="mt-1 text-xl font-black">Live chart foundation</h2>
                </div>
                <span className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] font-black text-white/35">24H</span>
              </div>

              <div className="mt-6 flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-[linear-gradient(to_bottom,rgba(156,255,67,0.03),transparent)]">
                <div className="text-center">
                  <div className="text-4xl">📈</div>
                  <p className="mt-3 text-sm font-black text-white/55">Live chart plugs in here</p>
                  <p className="mt-1 text-xs text-white/25">Ready for real market data after the Solana data layer is connected.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Launch integrity">
                <Check label="Mint authority revoked" passed={coin.mintAuthorityRevoked} />
                <Check label="Freeze authority revoked" passed={coin.freezeAuthorityRevoked} />
                <Check label={`Dev allocation ${coin.devAllocation}%`} passed={coin.devAllocation <= 5} />
                <Check label={`Top holder ${coin.topHolderPercent}%`} passed={coin.topHolderPercent <= 20} />
                <Check label={`Liquidity ${coin.liquidityStatus.toLowerCase()}`} passed={coin.liquidityStatus !== "Pending"} />
                {notes.length > 0 && <p className="pt-2 text-xs text-yellow-300/70">Watch: {notes.join(" · ")}</p>}
              </Panel>

              <Panel title="Launch stats">
                <Row label="Holders" value={coin.holders} />
                <Row label="Transactions 24h" value={coin.transactions24h} />
                <Row label="Age" value={coin.age} />
                <Row label="Creator" value={shorten(coin.creator)} />
                <Row label="Mint" value={shorten(coin.mint)} />
              </Panel>

              <LiveMintData mint={coin.mint} />
            </div>
          </div>

          <aside className="space-y-5">
            <div className="sticky top-24 rounded-[28px] border border-white/[0.08] bg-[#090c09] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">Trade ${coin.ticker}</h2>
                <Link href={`/revenue?mint=${encodeURIComponent(mint)}`} className="mt-2 block text-xs font-bold text-[#9cff43]">On-chain fee quotes and creator rewards · Devnet</Link>
                <span className="text-xs font-black text-[#9cff43]">{coin.bondingProgress}%</span>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-[#9cff43]" style={{ width: `${coin.bondingProgress}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-white/30">Bonding curve progress</p>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-1">
                <button className="rounded-lg bg-[#9cff43] py-2.5 text-sm font-black text-black">Buy</button>
                <button className="rounded-lg py-2.5 text-sm font-black text-white/45">Sell</button>
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#050605] px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/35">Amount</span>
                  <span className="text-xs font-black text-white/60">SOL</span>
                </div>
                <input disabled placeholder="0.00" className="mt-2 w-full bg-transparent text-2xl font-black outline-none placeholder:text-white/15" />
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                {["0.1", "0.5", "1", "MAX"].map((amount) => (
                  <button key={amount} disabled className="rounded-lg border border-white/[0.07] bg-white/[0.03] py-2 text-[11px] font-black text-white/30">{amount}</button>
                ))}
              </div>

              <button disabled className="mt-4 w-full rounded-xl bg-[#9cff43]/40 py-3.5 font-black text-black/50">Connect wallet to trade</button>
              <p className="mt-3 text-center text-[10px] leading-4 text-white/25">Trading is intentionally disabled until the real Solana transaction layer is connected and tested.</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-white/30">{label}</p><p className={`mt-2 text-xl font-black ${accent ? "text-[#9cff43]" : "text-white"}`}>{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-[24px] border border-white/[0.08] bg-[#090c09] p-5"><h2 className="mb-4 text-lg font-black">{title}</h2><div className="space-y-3">{children}</div></div>;
}

function Check({ label, passed }: { label: string; passed: boolean }) {
  return <div className="flex items-center gap-3 text-sm"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${passed ? "bg-[#9cff43] text-black" : "bg-yellow-400/15 text-yellow-300"}`}>{passed ? "✓" : "!"}</span><span className="text-white/60">{label}</span></div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-3 text-sm last:border-0 last:pb-0"><span className="text-white/35">{label}</span><span className="max-w-[55%] truncate font-black text-white/65">{value}</span></div>;
}

function shorten(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
