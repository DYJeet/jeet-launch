"use client";
import LocalLaunchMetadata from "./LocalLaunchMetadata";
import { useEffect, useState } from "react";
import { address, getAddressDecoder, getBase64Encoder } from "@solana/kit";
import { WalletTransactionExecutor } from "@/lib/wallet-transactions";
import { loadWalletEnvironment, formatUnits } from "@/lib/wallet-environment";
import { walletLaunchAddresses } from "@/lib/wallet-launch";
import { readWalletLaunch, type WalletLaunchSnapshot } from "@/lib/wallet-launch-flow";

/** Read-only local launch inspection. No connected wallet or signing secret required. */
export default function WalletLaunchReader({ mint }: { mint: string }) {
  const [result, setResult] = useState<{ snapshot?: WalletLaunchSnapshot; error?: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const environment = await loadWalletEnvironment(controller.signal);
        const executor = new WalletTransactionExecutor(environment,
          new URL(environment.rpcPath, window.location.origin).toString(),
          () => ({ status: "disconnected", connected: null }),
          { get: () => null, put: () => { throw Error("Read-only page"); }, remove: () => {} });
        await executor.network();
        const key = address(mint);
        const { custody } = await walletLaunchAddresses(key, key);
        const response = await executor.rpc.getAccountInfo(custody,
          { encoding: "base64", commitment: "confirmed" }).send({ abortSignal: controller.signal });
        const account = response.value;
        if (!account || account.owner !== environment.program || account.executable)
          throw Error("No verified JeeT local custody account found for this mint.");
        const data = new Uint8Array(getBase64Encoder().encode(account.data[0]));
        if (data.length !== 89 || new TextDecoder().decode(data.subarray(0, 8)) !== "JEETCST1")
          throw Error("Invalid custody state.");
        const creator = getAddressDecoder().decode(data.subarray(40, 72));
        const snapshot = await readWalletLaunch(executor, key, creator);
        if (!snapshot.mint || !snapshot.state) throw Error("Launch initialization is incomplete.");
        if (active) setResult({ snapshot });
      } catch (e) {
        if (active) setResult({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [mint, refresh]);
  const s = result?.snapshot;
  const u64 = (b: Uint8Array, offset: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(offset, true);
  const row = (label: string, value: string) => <div className="border-b border-white/10 py-3"><dt className="text-xs text-white/50">{label}</dt><dd className="break-all text-sm">{value}</dd></div>;
  return <section className="mx-auto max-w-4xl space-y-5 px-5 py-8" data-testid="launch-reader">
    <h1 className="text-2xl font-black">{s?.metadata?.name ?? "On-chain launch details"}</h1>
    <p className="text-sm text-yellow-200">Local validator only. On-chain facts are checked against canonical accounts. Off-chain images, descriptions and links are not independently verified. No safety guarantee.</p>
    <button className="rounded-xl border border-[#9cff43]/30 px-5 py-3 text-[#9cff43]" onClick={() => setRefresh(n => n + 1)}>Refresh on-chain state</button>
    {!result && <p role="status">Loading launch accounts…</p>}
    {result?.error && <p role="alert">{result.error}</p>}
    {s?.metadata && <LocalLaunchMetadata key={s.metadata.uri} uri={s.metadata.uri} />}
    {s?.mint && s.state && <dl>
      {row("Ticker", s.metadata?.symbol ?? "Metadata unavailable")}
      {row("Mint", mint)}
      {row("Creator", s.addresses.creator)}
      {row("Total issued supply", formatUnits(s.mint.supplyRaw, s.mint.decimals))}
      {row("Decimals", String(s.mint.decimals))}
      {row("Creator allocation at initialization (base units)", s.custodyData ? u64(s.custodyData, 72).toString() : "Unavailable")}
      {row("Current creator token-account balance (base units)", s.creatorTokens?.toString() ?? "Unavailable")}
      {row("Curve custody balance (base units)", s.vaultTokens?.toString() ?? "Unavailable")}
      {row("Reserved migration balance (base units)", s.migrationTokens?.toString() ?? "Unavailable")}
      {row("Mint authority", s.mint.mintAuthority ?? "Revoked")}
      {row("Freeze authority", s.mint.freezeAuthority ?? "Revoked")}
      {row("Custody PDA", s.addresses.custody)}
      {row("Curve state", s.state.migrated ? "Migrated; curve trading closed" : s.state.eligible ? "Graduation eligible; redemption remains available" : "Active curve")}
      {row("Net sold / trading inventory (base units)", `${s.state.sold} / ${s.state.inventory}`)}
      {row("Curve redemption reserve (lamports)", s.state.reserve.toString())}
      {row("Trading fees", "75 bps platform + 25 bps creator; integer rounding applies")}
      {row("Opening wallet cap", s.openingData ? `${s.openingData[96] ? "Enabled" : "Disabled"}; slots ${u64(s.openingData, 80)} through ${u64(s.openingData, 88)} (expiry exclusive)` : "Unavailable")}
      {row("Protected opening", s.curveData ? `Starts slot ${u64(s.curveData, 162)}; duration ${u64(s.curveData, 170)} slots` : "Unavailable")}
      {row("Graduation terms", s.terms ? `Registered; maximum price gap ${s.terms.maxPriceGapBps} bps; ${s.terms.migrated ? "migrated" : "not migrated"}` : "Not registered; activation incomplete")}
      {row("Metadata URI (on-chain)", s.metadata?.uri ?? "Unavailable")}
      {row("Metadata data mutability", s.metadata ? (s.metadata.mutable ? "Mutable" : "Immutable data flag; update authority record still exists") : "Unavailable")}
      {row("Observed slot", s.slot.toString())}
    </dl>}
    <p className="text-sm text-white/50">Market statistics, charts and trading are not part of this creation milestone. Public explorers cannot inspect this disposable local validator.</p>
  </section>;
}
