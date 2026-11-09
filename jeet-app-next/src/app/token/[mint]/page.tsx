import { notFound } from "next/navigation";
import { address } from "@solana/kit";
import WalletLaunchReader from "@/components/WalletLaunchReader";
import { headers } from "next/headers";
import { localReadConfiguration, previewEnabled } from "@/lib/local-wallet-server";
import PreviewHistory from "@/components/PreviewHistory";
import { activeBuildingReceipts } from "@/lib/still-building";
import { LOCAL_WALLET_PROGRAM } from "@/lib/wallet-environment";
import SiteHeader from "@/components/SiteHeader";

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const preview = previewEnabled();
  if (preview) {
    try { localReadConfiguration(new Request("https://" + process.env.JEET_PREVIEW_HOST, { headers: await headers() })); }
    catch { notFound(); }
  } else if (process.env.JEET_LOCAL_WALLET !== "1") notFound();
  const { mint } = await params;
  try { address(mint); } catch { notFound(); }
  const network = process.env.JEET_LOCAL_WALLET_GENESIS + ":" + LOCAL_WALLET_PROGRAM;
  const receipt = activeBuildingReceipts(network).get(mint);
  return <main className="min-h-screen bg-[#050605] text-white">
    <SiteHeader />
    {receipt && <section aria-labelledby="building-receipt" className="mx-auto max-w-4xl px-5 pt-8">
      <div className="rounded-2xl border border-[#9cff43]/30 p-4">
        <h2 id="building-receipt" className="font-bold text-[#9cff43]">Still Building</h2>
        <p className="mt-2 break-words">{receipt.title}</p>
        <p className="mt-1 text-sm text-white/65">Milestone date <time dateTime={receipt.date}>{receipt.date}</time></p>
        <a href={receipt.url} rel="noreferrer" target="_blank" className="mt-2 inline-flex min-h-11 items-center underline">
          View milestone evidence <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </section>}
    {preview ? <PreviewHistory mint={mint} /> : <WalletLaunchReader mint={mint} />}
  </main>;
}
