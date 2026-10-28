import Link from "next/link";
import {
  calculateIntegrityScore,
  getIntegrityNotes,
  type Launch,
} from "@/lib/launches";

export default function LaunchCard({ coin }: { coin: Launch }) {
  const integrity = calculateIntegrityScore(coin);
  const notes = getIntegrityNotes(coin);

  return (
    <Link
      href={`/token/${coin.mint}`}
      className="group block rounded-[20px] border border-white/[0.08] bg-[#0a0c0a] p-4 transition hover:-translate-y-0.5 hover:border-[#9cff43]/30 hover:bg-[#0d100d]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04] text-2xl">
            {coin.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coin.image} alt={coin.name} className="h-full w-full object-cover" />
            ) : (
              <span>🪙</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-black">{coin.name}</p>
              <span className="rounded-full bg-[#1b2f1c] px-2 py-0.5 text-[9px] font-black text-[#76ff68]">
                {coin.status}
              </span>
            </div>
            <p className="truncate text-xs text-white/35">{coin.subtitle}</p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${
            integrity >= 90
              ? "border-[#9cff43]/30 bg-[#9cff43]/10 text-[#9cff43]"
              : integrity >= 75
                ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
                : "border-red-400/30 bg-red-400/10 text-red-300"
          }`}
        >
          Integrity {integrity}
        </span>
      </div>

      {notes.length > 0 && (
        <p className="mt-2 text-[10px] text-yellow-300/80">{notes[0]}</p>
      )}

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xl font-black">{coin.price}</p>
          <p className="mt-1 text-sm font-black text-[#65ff78]">MC {coin.marketCap}</p>
          <p className="mt-1 text-xs font-bold text-[#9cff43]">{coin.change24h} 24h</p>
        </div>

        <svg viewBox="0 0 150 55" className="h-14 w-36 opacity-80 transition group-hover:opacity-100" preserveAspectRatio="none" aria-hidden="true">
          <polyline fill="none" stroke="#9cff43" strokeWidth="3" points="0,48 15,46 28,39 40,43 55,32 70,34 84,21 98,24 112,14 126,18 140,8 150,11" />
        </svg>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wide">
          <span className="text-white/40">Bonding Progress</span>
          <span className="text-[#9cff43]">{coin.bondingProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-[#9cff43] transition-all" style={{ width: `${coin.bondingProgress}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        <Metric label="Dev" value={`${coin.devAllocation}%`} />
        <Metric label="Top Holder" value={`${coin.topHolderPercent}%`} />
        <Metric label="Liquidity" value={coin.liquidityStatus} accent />
      </div>

      <div className="mt-4 grid grid-cols-3 border-t border-white/[0.06] pt-3 text-center">
        <Stat value={coin.volume24h} label="Volume" />
        <Stat value={coin.holders} label="Holders" />
        <Stat value={coin.age} label="Old" />
      </div>
    </Link>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
      <p className="text-white/35">{label}</p>
      <p className={`mt-0.5 truncate font-black ${accent ? "text-[#9cff43]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-sm font-black">{value}</p>
      <p className="text-[10px] text-white/30">{label}</p>
    </div>
  );
}
