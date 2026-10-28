import Link from "next/link";
import WalletConnectButton from "./WalletConnectButton";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050605]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#9cff43]/25 bg-[#9cff43]/10 text-xl">🐱</div>
          <div className="flex items-center gap-1">
            <span className="text-xl font-black tracking-tight">DidYou</span>
            <span className="text-xl font-black tracking-tight text-[#9cff43]">Jeet</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-semibold text-white/55 lg:flex">
          <Link className="transition hover:text-white" href="/">Launchpad</Link>
          <Link className="transition hover:text-white" href="/explore">Explore</Link>
          <Link className="transition hover:text-white" href="/create">Create</Link>
          <Link className="transition hover:text-white" href="/revenue">Revenue</Link>
          <span className="cursor-not-allowed text-white/20">Docs</span>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden min-w-[280px] items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 lg:flex">
            <span className="mr-2 text-white/25">⌕</span>
            <span className="text-xs text-white/30">Search tokens, wallets, or CA...</span>
          </div>
          <WalletConnectButton />
        </div>
      </div>
    </header>
  );
}
