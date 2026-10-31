import { notFound } from "next/navigation";
import LocalLaunchMetadata from "@/components/LocalLaunchMetadata";
import { resolveMetadataUri } from "@/lib/metadata-storage-uri";

export const dynamic = "force-dynamic";

/** Read-only provider acceptance view. Disabled unless explicitly enabled by the operator. */
export default async function LocalMetadataPage({ searchParams }: {
  searchParams: Promise<{ uri?: string | string[] }>;
}) {
  if (process.env.JEET_LOCAL_METADATA_VERIFY !== "1") notFound();
  const { uri } = await searchParams;
  let valid = false;
  if (typeof uri === "string" && uri.startsWith("ipfs://")) {
    try { resolveMetadataUri(uri, "http://127.0.0.1"); valid = true; } catch {}
  }
  return <main className="min-h-screen bg-[#050605] px-5 py-10 text-white">
    <section className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-black text-[#9cff43]">Metadata storage verification</h1>
      <p className="text-sm text-white/60">Read-only off-chain metadata inspection. This is not a launched token,
        on-chain mint verification, or a wallet transaction. Continued pinning and gateway availability are external dependencies.</p>
      {valid && typeof uri === "string" ? <>
        <p className="break-all text-xs" data-testid="metadata-uri">{uri}</p>
        <LocalLaunchMetadata uri={uri} />
      </> : <p role="alert">Supply a supported ipfs:// metadata URI in the uri query parameter.</p>}
    </section>
  </main>;
}
