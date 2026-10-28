"use client";

import { useCallback, useEffect, useState } from "react";
import { toTokenBaseUnits } from "@/lib/token-amount";

type Props = {
  tokenName: string;
  ticker: string;
  totalSupply: string;
  decimals: number;
  devAllocation: string;
  revokeMint: boolean;
  revokeFreeze: boolean;
};

type ValidatorState = "checking" | "ready" | "offline";
type CreateState = "idle" | "creating" | "success" | "error";

type LocalResult = {
  mintAddress: string;
  payerAddress: string;
  creatorAddress: string;
  creatorTokenAccount: string | null;
  launchVaultAddress: string;
  launchVaultTokenAccount: string;
  createSignature: string;
  creatorMintSignature: string | null;
  launchMintSignature: string;
  authoritySignature: string | null;
  supplyBaseUnits: string;
  creatorAllocationBps: number;
  creatorAllocationBaseUnits: string;
  launchInventoryBaseUnits: string;
  decimals: number;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  allocationVerified: boolean;
};

export default function LocalTokenCreator({
  tokenName,
  ticker,
  totalSupply,
  decimals,
  devAllocation,
  revokeMint,
  revokeFreeze,
}: Props) {
  const [validatorState, setValidatorState] = useState<ValidatorState>("checking");
  const [validatorMessage, setValidatorMessage] = useState("Checking local validator…");
  const [createState, setCreateState] = useState<CreateState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null);
  const amount = toTokenBaseUnits(totalSupply, decimals);

  const checkValidator = useCallback(async () => {
    setValidatorState("checking");
    setValidatorMessage("Checking local validator…");

    try {
      const response = await fetch("/api/local-test/health", { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean; message?: string };

      if (response.ok && payload.ok) {
        setValidatorState("ready");
        setValidatorMessage("Local validator connected on localhost:8899");
      } else {
        setValidatorState("offline");
        setValidatorMessage(payload.message ?? "Local validator is offline.");
      }
    } catch {
      setValidatorState("offline");
      setValidatorMessage("Local validator is offline. Start it with: npm run validator");
    }
  }, []);

  useEffect(() => {
    void checkValidator();
  }, [checkValidator]);

  async function createLocalMint() {
    if (validatorState !== "ready") {
      setError("Start the local validator first: npm run validator");
      return;
    }

    if (!amount.ok) {
      setError(amount.message);
      return;
    }

    setCreateState("creating");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/local-test/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          totalSupply,
          decimals,
          devAllocation,
          revokeMint,
          revokeFreeze,
        }),
      });

      const payload = (await response.json()) as
        | ({ ok: true } & LocalResult)
        | { ok: false; message?: string };

      if (!response.ok || payload.ok === false) {
        const message = "message" in payload ? payload.message : undefined;
        throw new Error(message ?? "Local mint creation failed.");
      }

      setResult(payload);
      setCreateState("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setCreateState("error");
    }
  }

  const statusClass =
    validatorState === "ready"
      ? "border-[#9cff43]/25 bg-[#9cff43]/10 text-[#9cff43]"
      : validatorState === "checking"
        ? "border-yellow-300/20 bg-yellow-300/10 text-yellow-200"
        : "border-red-400/20 bg-red-400/10 text-red-200";

  const disclosedAllocation = Number(devAllocation || "0");

  return (
    <div className="space-y-4 rounded-2xl border border-[#9cff43]/20 bg-[#9cff43]/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9cff43]">
            Local test launch
          </p>
          <h3 className="mt-1 text-base font-black text-white">Create + verify the launch allocation</h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">
            The server creates a temporary test payer, funds it locally, creates the mint, splits the
            supply between a disclosed creator account and a separate launch-inventory vault, applies
            authority choices, then verifies every balance on-chain.
          </p>
        </div>

        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
          localhost only
        </span>
      </div>

      <div className={`rounded-xl border px-3.5 py-3 text-xs font-bold ${statusClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{validatorMessage}</span>
          <button
            type="button"
            onClick={() => void checkValidator()}
            className="rounded-lg border border-current/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
          >
            Recheck
          </button>
        </div>
      </div>

      <div className="grid gap-2 text-[11px] text-white/45 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
          <span className="text-white/25">Test token</span>
          <p className="mt-1 font-black text-white">{tokenName} (${ticker})</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
          <span className="text-white/25">Creator allocation</span>
          <p className="mt-1 font-black text-white">{Number.isFinite(disclosedAllocation) ? disclosedAllocation : 0}% disclosed</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
          <span className="text-white/25">Test funding</span>
          <p className="mt-1 font-black text-white">Automatic local airdrop</p>
        </div>
      </div>

      <div className="rounded-xl border border-yellow-300/15 bg-yellow-300/[0.04] p-3.5 text-[11px] leading-5 text-white/45">
        <p className="font-black text-yellow-200">Creator allocation is verified in this local test</p>
        <p className="mt-1.5">
          Temporary test owners are generated for this local proof; this is not a program-controlled vault. Creator amounts round down to whole base units, with the remainder kept in launch inventory. The disclosed creator percentage is minted to its own token account. Every remaining token is
          minted to a separate launch-inventory vault. The test fails unless both balances and the total
          mint supply match exactly. Wallet caps, curve pricing, migration, and anti-sniper logic still
          come in later passes.
        </p>
      </div>

      {!amount.ok ? (
        <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs font-semibold text-red-200">
          {amount.message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={createLocalMint}
        disabled={validatorState !== "ready" || createState === "creating" || !amount.ok}
        className="w-full rounded-xl bg-[#9cff43] px-5 py-3 text-sm font-black text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {createState === "creating"
          ? "Creating + Verifying Allocation…"
          : result
            ? "Run Allocation Test Again"
            : "Create Local Test Mint + Allocation"}
      </button>

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-200">
          <p className="font-black">Local test stopped</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-xl border border-[#9cff43]/20 bg-black/20 p-4 text-[11px]">
          <p className="text-sm font-black text-[#9cff43]">✓ Local mint + creator allocation verified</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <ResultLine label="Mint" value={result.mintAddress} />
            <ResultLine label="Temporary payer" value={result.payerAddress} />
            <ResultLine label="Creator owner" value={result.creatorAddress} />
            <ResultLine label="Creator token account" value={result.creatorTokenAccount ?? "No creator ATA (0% allocation)"} />
            <ResultLine label="Launch vault owner" value={result.launchVaultAddress} />
            <ResultLine label="Launch vault token account" value={result.launchVaultTokenAccount} />
            <ResultLine label="Create signature" value={result.createSignature} />
            {result.creatorMintSignature ? (
              <ResultLine label="Creator mint signature" value={result.creatorMintSignature} />
            ) : null}
            <ResultLine label="Launch inventory signature" value={result.launchMintSignature} />
            {result.authoritySignature ? (
              <ResultLine label="Authority signature" value={result.authoritySignature} />
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="Creator allocation" value={`${(result.creatorAllocationBps / 100).toFixed(2)}%`} />
            <Metric label="Creator base units" value={result.creatorAllocationBaseUnits} />
            <Metric label="Launch inventory base units" value={result.launchInventoryBaseUnits} />
          </div>

          <p className="text-white/35">
            Total supply: {result.supplyBaseUnits} base units · Decimals: {result.decimals} · Allocation: {result.allocationVerified ? "verified" : "unverified"} · Mint authority: {result.mintAuthorityRevoked ? "revoked" : "retained"} · Freeze authority: {result.freezeAuthorityRevoked ? "revoked" : "retained"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.025] p-2.5">
      <p className="text-[9px] font-black uppercase tracking-wider text-white/20">{label}</p>
      <p className="mt-1 break-all font-mono text-white/70">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#9cff43]/10 bg-[#9cff43]/[0.035] p-2.5">
      <p className="text-[9px] font-black uppercase tracking-wider text-white/25">{label}</p>
      <p className="mt-1 break-all font-mono font-black text-[#9cff43]">{value}</p>
    </div>
  );
}
