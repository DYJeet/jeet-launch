import LaunchDiscovery from "@/components/LaunchDiscovery";
import FeeConsole from "@/components/FeeConsole";
import SiteHeader from "@/components/SiteHeader";
import { walletModeEnabled } from "@/lib/local-wallet-server";
import { WALLET_NETWORK_LABEL } from "@/lib/wallet-program";
export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const { mint } = await searchParams;
  // Hosted releases never fall back to the legacy direct-signing console.
  const local = walletModeEnabled() || process.env.VERCEL === "1";
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 text-sm text-white/75">
        {local ? <section className="space-y-4">
          <h1 className="text-3xl font-black text-white">Launch revenue</h1>
          <p>Open a launch to inspect accrued and claimable creator and platform fees on {WALLET_NETWORK_LABEL}.</p>
          <LaunchDiscovery />
        </section> : <FeeConsole initialMint={typeof mint === "string" ? mint : ""} />}
      </main>
    </>
  );
}
