import LaunchDiscovery from "@/components/LaunchDiscovery";
import SiteHeader from "@/components/SiteHeader";

export default function ExplorePage() {
  return <main className="min-h-screen bg-[#050605] text-white">
    <SiteHeader />
    <section className="mx-auto max-w-[1500px] space-y-6 px-5 pb-16 pt-10 lg:px-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9cff43]">JeeT Launch</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Explore launches</h1>
        <p className="mt-3 text-sm text-white/60">Browse activated launches by stage, then open a token for verified launch details.</p>
      </div>
      <LaunchDiscovery />
    </section>
  </main>;
}
