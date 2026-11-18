import LaunchDiscovery from "@/components/LaunchDiscovery";
import FeeConsole from "@/components/FeeConsole";
import SiteHeader from "@/components/SiteHeader";
import { walletModeEnabled } from "@/lib/local-wallet-server";
import { WALLET_NETWORK } from "@/lib/wallet-program";
export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const { mint } = await searchParams;
  const local = walletModeEnabled();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 text-sm text-white/75">
        {local ? <section className="space-y-4">
          <h1 className="text-3xl font-black text-white">Launch revenue</h1>
          <p>Open a launch to inspect accrued and claimable creator and platform fees on {WALLET_NETWORK === "devnet" ? "Solana Devnet" : "the local validator"}.</p>
          <LaunchDiscovery />
        </section> : <FeeConsole initialMint={typeof mint === "string" ? mint : ""} />}
      </main>
    </>
  );
}
