import { notFound } from "next/navigation";
import { address } from "@solana/kit";
import WalletLaunchReader from "@/components/WalletLaunchReader";
import SiteHeader from "@/components/SiteHeader";

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  if (process.env.JEET_LOCAL_WALLET !== "1") notFound();
  const { mint } = await params;
  try { address(mint); } catch { notFound(); }
  return <main className="min-h-screen bg-[#050605] text-white">
    <SiteHeader />
    <WalletLaunchReader mint={mint} />
  </main>;
}
