import { notFound } from "next/navigation";
import { address } from "@solana/kit";
import WalletLaunchReader from "@/components/WalletLaunchReader";
import { headers } from "next/headers";
import { localReadConfiguration, previewEnabled } from "@/lib/local-wallet-server";
import PreviewHistory from "@/components/PreviewHistory";
import SiteHeader from "@/components/SiteHeader";

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const preview = previewEnabled();
  if (preview) {
    try { localReadConfiguration(new Request("https://" + process.env.JEET_PREVIEW_HOST, { headers: await headers() })); }
    catch { notFound(); }
  } else if (process.env.JEET_LOCAL_WALLET !== "1") notFound();
  const { mint } = await params;
  try { address(mint); } catch { notFound(); }
  return <main className="min-h-screen bg-[#050605] text-white">
    <SiteHeader />
    {preview ? <PreviewHistory mint={mint} /> : <WalletLaunchReader mint={mint} />}
  </main>;
}
