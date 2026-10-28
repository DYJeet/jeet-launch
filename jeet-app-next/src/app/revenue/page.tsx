import FeeConsole from "@/components/FeeConsole";
import SiteHeader from "@/components/SiteHeader";
export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const { mint } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 text-sm text-white/75">
        <FeeConsole initialMint={typeof mint === "string" ? mint : ""} />
      </main>
    </>
  );
}
