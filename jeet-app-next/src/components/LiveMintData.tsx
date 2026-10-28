"use client";

import { useEffect, useState } from "react";
import {
  getMintAccount,
  SOLANA_CLUSTER,
  type MintReadResult,
} from "@/lib/solana-rpc";

export default function LiveMintData({ mint }: { mint: string }) {
  const [result, setResult] = useState<MintReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextResult = await getMintAccount(mint, controller.signal);
        if (active) setResult(nextResult);
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Unable to load mint data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [mint]);

  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#090c09] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/30">
            Live chain read
          </p>
          <h2 className="mt-1 text-lg font-black">Solana mint state</h2>
        </div>
        <span className="rounded-full border border-[#9cff43]/20 bg-[#9cff43]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#9cff43]">
          {SOLANA_CLUSTER}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-8 animate-pulse rounded-lg bg-white/[0.035]" />
          ))}
        </div>
      ) : error ? (
        <Notice tone="error" text={error} />
      ) : result?.status !== "ok" ? (
        <Notice tone="neutral" text={result?.message ?? "No chain data available."} />
      ) : (
        <div className="space-y-3">
          <StatusRow
            label="Mint authority"
            value={result.mint.mintAuthorityRevoked ? "Revoked" : shorten(result.mint.mintAuthority ?? "")}
            good={result.mint.mintAuthorityRevoked}
          />
          <StatusRow
            label="Freeze authority"
            value={result.mint.freezeAuthorityRevoked ? "Revoked" : shorten(result.mint.freezeAuthority ?? "")}
            good={result.mint.freezeAuthorityRevoked}
          />
          <PlainRow label="Supply" value={result.mint.supplyFormatted} />
          <PlainRow label="Decimals" value={String(result.mint.decimals)} />
          <PlainRow label="Initialized" value={result.mint.initialized ? "Yes" : "No"} />
          <PlainRow label="Token program" value={shorten(result.mint.ownerProgram)} mono />
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-3 text-sm last:border-0 last:pb-0">
      <span className="text-white/35">{label}</span>
      <span className={`font-black ${good ? "text-[#9cff43]" : "text-yellow-300"}`}>{value}</span>
    </div>
  );
}

function PlainRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-3 text-sm last:border-0 last:pb-0">
      <span className="text-white/35">{label}</span>
      <span className={`max-w-[60%] truncate font-black text-white/65 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function Notice({ tone, text }: { tone: "neutral" | "error"; text: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${tone === "error" ? "border-red-400/20 bg-red-400/10 text-red-300" : "border-white/[0.08] bg-white/[0.03] text-white/45"}`}>
      {text}
    </div>
  );
}

function shorten(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
