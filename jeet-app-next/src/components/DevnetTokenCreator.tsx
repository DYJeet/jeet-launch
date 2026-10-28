"use client";

import { generateKeyPairSigner } from "@solana/kit";
import {
  AuthorityType,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import { useMemo, useState } from "react";
import type { AppClient } from "@/app/providers";
import { getMintAccount, type ParsedMintAccount } from "@/lib/solana-rpc";
import { toTokenBaseUnits } from "@/lib/token-amount";

type Props = {
  tokenName: string;
  ticker: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  logoFileName?: string | null;
  totalSupply: string;
  decimals: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
};

type Stage =
  | "idle"
  | "creating-mint"
  | "minting-supply"
  | "revoking-authorities"
  | "verifying"
  | "success"
  | "error";

type Result = {
  mintAddress: string;
  tokenAccount: string;
  createSignature: string;
  mintSignature: string;
  authoritySignature: string | null;
  verified: ParsedMintAccount | null;
};

const STAGE_LABELS: Record<Stage, string> = {
  idle: "Ready",
  "creating-mint": "Creating mint account…",
  "minting-supply": "Creating token account + minting test supply…",
  "revoking-authorities": "Applying authority choices…",
  verifying: "Verifying mint on Devnet…",
  success: "Devnet test mint created",
  error: "Creation failed",
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function explorerUrl(mint: string) {
  return `https://explorer.solana.com/address/${mint}?cluster=devnet`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function verifyMintWithRetry(address: string) {
  let lastMessage = "Mint verification did not complete.";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await getMintAccount(address);
    if (result.status === "ok") return result.mint;
    lastMessage = result.message;
    await sleep(600 + attempt * 400);
  }

  throw new Error(lastMessage);
}

export default function DevnetTokenCreator({
  tokenName,
  ticker,
  description,
  website,
  twitter,
  telegram,
  logoFileName,
  totalSupply,
  decimals,
  revokeMint,
  revokeFreeze,
}: Props) {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [acknowledged, setAcknowledged] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const amount = useMemo(
    () => toTokenBaseUnits(totalSupply, decimals),
    [decimals, totalSupply],
  );

  const busy = !["idle", "success", "error"].includes(stage);
  const walletAddress = connected ? String(connected.account.address) : null;

  async function createTestMint() {
    if (!connected || !walletAddress) {
      setStage("error");
      setError("Connect a Devnet wallet in the header before creating a test mint.");
      return;
    }

    if (!acknowledged) {
      setStage("error");
      setError("Confirm that this is a Devnet integration test, not a public launch.");
      return;
    }

    if (!amount.ok) {
      setStage("error");
      setError(amount.message);
      return;
    }

    setError(null);
    setResult(null);

    try {
      setStage("creating-mint");
      const mint = await generateKeyPairSigner();

      const createResult = await client.token.instructions
        .createMint({
          newMint: mint,
          decimals,
          mintAuthority: client.payer.address,
          freezeAuthority: client.payer.address,
        })
        .sendTransaction();

      setStage("minting-supply");
      const mintResult = await client.token.instructions
        .mintToATA({
          mint: mint.address,
          owner: client.payer.address,
          mintAuthority: client.payer,
          amount: amount.baseUnits,
          decimals,
        })
        .sendTransaction();

      const [tokenAccount] = await findAssociatedTokenPda({
        mint: mint.address,
        owner: client.payer.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });

      let authoritySignature: string | null = null;
      const authorityInstructions = [];

      if (revokeMint) {
        authorityInstructions.push(
          client.token.instructions.setAuthority({
            owned: mint.address,
            owner: client.payer,
            authorityType: AuthorityType.MintTokens,
            newAuthority: null,
          }),
        );
      }

      if (revokeFreeze) {
        authorityInstructions.push(
          client.token.instructions.setAuthority({
            owned: mint.address,
            owner: client.payer,
            authorityType: AuthorityType.FreezeAccount,
            newAuthority: null,
          }),
        );
      }

      if (authorityInstructions.length > 0) {
        setStage("revoking-authorities");
        const authorityResult = await client.sendTransaction(authorityInstructions);
        authoritySignature = String(authorityResult.context.signature);
      }

      setStage("verifying");
      const verified = await verifyMintWithRetry(String(mint.address));

      setResult({
        mintAddress: String(mint.address),
        tokenAccount: String(tokenAccount),
        createSignature: String(createResult.context.signature),
        mintSignature: String(mintResult.context.signature),
        authoritySignature,
        verified,
      });
      setStage("success");
    } catch (caught) {
      setStage("error");
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[#9cff43]/15 bg-[#9cff43]/[0.035] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9cff43]">
            Devnet transaction test
          </p>
          <h3 className="mt-1 text-base font-black text-white">
            Create a real SPL test mint
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">
            This verifies wallet signing, SPL mint creation, creator ATA creation,
            test-supply minting, authority revocation, and live chain verification.
          </p>
        </div>

        <span className="rounded-full border border-[#9cff43]/20 bg-[#9cff43]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#9cff43]">
          Devnet only
        </span>
      </div>

      <div className="rounded-xl border border-yellow-300/15 bg-yellow-300/[0.04] p-3.5">
        <p className="text-xs font-black text-yellow-200">Not a public JeeT Launch yet</p>
        <p className="mt-1.5 text-[11px] leading-5 text-white/40">
          For this integration test only, the full test supply goes to your connected wallet.
          The production fair-launch flow will instead place launch inventory under the
          bonding-curve/program vault so wallet caps, pricing, migration, and anti-sniper
          rules can actually be enforced on-chain.
        </p>
      </div>

      <div className="grid gap-2 text-[11px] text-white/45 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
          <span className="text-white/25">Test token</span>
          <p className="mt-1 font-black text-white">{tokenName} (${ticker})</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
          <span className="text-white/25">Connected wallet</span>
          <p className="mt-1 break-all font-mono font-bold text-white/75">
            {walletAddress ?? "Not connected"}
          </p>
        </div>
      </div>

      <details className="rounded-xl border border-white/[0.06] bg-black/15 p-3 text-[11px] text-white/40">
        <summary className="cursor-pointer font-black text-white/65">Metadata captured by the UI</summary>
        <div className="mt-2 space-y-1 break-words">
          <p>Description: {description}</p>
          {website ? <p>Website: {website}</p> : null}
          {twitter ? <p>X: {twitter}</p> : null}
          {telegram ? <p>Telegram: {telegram}</p> : null}
          {logoFileName ? <p>Logo file: {logoFileName}</p> : null}
          <p className="pt-1 text-yellow-200/70">
            These fields are not published to Metaplex metadata in this pass. We need a durable
            metadata URI/storage choice before committing metadata on-chain.
          </p>
        </div>
      </details>

      {!amount.ok ? (
        <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs font-semibold text-red-200">
          {amount.message}
        </p>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-black/15 p-3.5">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#9cff43]"
        />
        <span className="text-[11px] leading-5 text-white/50">
          I understand this button creates a <b className="text-white/75">Devnet test token</b>,
          not a production fair launch, and Devnet SOL/tokens have no real-world value.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={createTestMint}
          disabled={busy || !connected || !acknowledged || !amount.ok}
          className="rounded-xl bg-[#9cff43] px-5 py-3 text-sm font-black text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy ? STAGE_LABELS[stage] : result ? "Create Another Devnet Test Mint" : "Create Devnet Test Mint"}
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/25">
          {STAGE_LABELS[stage]}
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-200">
          <p className="font-black">Transaction stopped</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-xl border border-[#9cff43]/20 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-[#9cff43]">✓ Verified on Devnet</p>
            <a
              href={explorerUrl(result.mintAddress)}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-black uppercase tracking-wider text-[#9cff43] underline decoration-[#9cff43]/30 underline-offset-4"
            >
              Open Explorer ↗
            </a>
          </div>

          <div className="grid gap-2 text-[11px] sm:grid-cols-2">
            <ResultLine label="Mint" value={result.mintAddress} />
            <ResultLine label="Creator token account" value={result.tokenAccount} />
            <ResultLine label="Supply" value={result.verified?.supplyFormatted ?? "Verified"} />
            <ResultLine label="Decimals" value={String(result.verified?.decimals ?? decimals)} />
            <ResultLine
              label="Mint authority"
              value={result.verified?.mintAuthorityRevoked ? "Revoked ✓" : "Retained"}
            />
            <ResultLine
              label="Freeze authority"
              value={result.verified?.freezeAuthorityRevoked ? "Revoked ✓" : "Retained"}
            />
          </div>

          <details className="text-[10px] text-white/30">
            <summary className="cursor-pointer font-black uppercase tracking-wider text-white/40">
              Transaction signatures
            </summary>
            <div className="mt-2 space-y-1 break-all font-mono">
              <p>Create mint: {result.createSignature}</p>
              <p>Mint supply: {result.mintSignature}</p>
              {result.authoritySignature ? <p>Authority update: {result.authoritySignature}</p> : null}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.025] p-2.5">
      <p className="text-[9px] font-black uppercase tracking-wider text-white/20">{label}</p>
      <p className="mt-1 break-all font-mono font-bold text-white/65">{value}</p>
    </div>
  );
}
