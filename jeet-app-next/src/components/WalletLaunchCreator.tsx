"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "@solana/react";
import {
  useConnectedWallet,
  useConnect,
  useDisconnect,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import {
  address,
  generateKeyPairSigner,
  getBase64Decoder,
  type TransactionSigner,
} from "@solana/kit";
import type { AppClient } from "@/app/providers";
import WalletHydrationGate from "./WalletHydrationGate";
import {
  loadWalletEnvironment,
  parseUnits,
  formatUnits,
  type WalletEnvironment,
} from "@/lib/wallet-environment";
import {
  browserPendingStore,
  WalletTransactionExecutor,
  type TransactionNotice,
} from "@/lib/wallet-transactions";
import { validateImageUpload } from "@/lib/launch-image";
import { walletLaunchParameters } from "@/lib/wallet-launch";
import {
  executeWalletLaunch,
  launchJob,
  parametersFromJob,
  type SavedWalletLaunch,
} from "@/lib/wallet-launch-flow";

const button =
  "rounded-xl border border-[#9cff43]/30 bg-[#9cff43]/10 px-5 py-3 font-black text-[#9cff43] disabled:opacity-30";
const inputStyle =
  "w-full rounded-xl border border-white/15 bg-black/30 p-3 text-white";
function Creation({ environment }: { environment: WalletEnvironment }) {
  const client = useClient<AppClient>(),
    connected = useConnectedWallet(client),
    wallets = useWallets(client),
    connect = useConnect(client),
    disconnect = useDisconnect(client);
  const wallet = connected?.account.address ?? null;
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    website: "",
    twitter: "",
    telegram: "",
    supply: "1000000000",
    decimals: "9",
    creatorPercent: "1",
    capPercent: "1",
    capDuration: "10000",
    openingDuration: "100",
    openingDelay: "1000",
    openingLimit: "0.5",
  });
  const [capEnabled, setCapEnabled] = useState(true),
    [image, setImage] = useState<File | null>(null),
    [job, setJob] = useState<SavedWalletLaunch | null>(null);
  const [stage, setStage] = useState("ready"),
    [notice, setNotice] = useState<TransactionNotice | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false);
  const running = useRef(false),
    mintSigner = useRef<TransactionSigner | null>(null),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const storageKey = wallet
    ? `jeet-launch-job-v1:${environment.genesis}:${wallet}`
    : null;
  const current = job?.creator === wallet ? job : null;
  const executor = useMemo(
    () =>
      new WalletTransactionExecutor(
        environment,
        new URL(environment.rpcPath, window.location.origin).toString(),
        () => client.wallet.getState(),
        browserPendingStore(),
        setNotice,
      ),
    [client, environment],
  );
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (loadedKey !== storageKey) {
    setLoadedKey(storageKey);
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as SavedWalletLaunch;
          address(saved.mint);
          parametersFromJob(saved);
          if (saved.creator !== wallet || saved.genesis !== environment.genesis)
            throw Error("Saved launch identity mismatch.");
          setJob(saved);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }
  const save = (value: SavedWalletLaunch) => {
    if (!storageKey || value.creator !== wallet)
      throw Error("Wallet identity changed.");
    localStorage.setItem(storageKey, JSON.stringify(value));
    setJob({ ...value, signatures: { ...value.signatures } });
  };
  function parameters(uri = "https://example.invalid/not-uploaded.json") {
    return {
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      uri,
      supply: form.supply,
      decimals: Number(form.decimals),
      creatorPercent: form.creatorPercent,
      capPercent: form.capPercent,
      capEnabled,
      capDuration: parseUnits(form.capDuration, 0),
      openingDuration: parseUnits(form.openingDuration, 0),
      openingDelay: parseUnits(form.openingDelay, 0),
      openingLimitBps: Number(parseUnits(form.openingLimit, 2)),
    };
  }
  let preview: ReturnType<typeof walletLaunchParameters> | null = null;
  try {
    preview = current
      ? parametersFromJob(current)
      : walletLaunchParameters(parameters());
  } catch {}
  async function begin() {
    if (!wallet || !storageKey || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      if (!navigator.locks)
        throw Error("A secure browser with Web Locks is required.");
      await navigator.locks.request(
        `jeet-create:${environment.genesis}:${wallet}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw Error("Another tab is creating a launch for this wallet.");
          let saved = current;
          if (!saved) {
            // Recheck persistent state while holding the cross-tab creation lock.
            if (localStorage.getItem(storageKey))
              throw Error(
                "A saved launch already exists. Reload to resume it.",
              );
            if (!image) throw Error("Select a token image before launching.");
            walletLaunchParameters(parameters());
            await validateImageUpload(image);
            await executor.network();
            setStage("uploading");
            const response = await fetch("/api/local-assets", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                ...form,
                name: form.name.trim(),
                symbol: form.symbol.trim(),
                mime: image.type,
                imageBase64: getBase64Decoder().decode(
                  new Uint8Array(await image.arrayBuffer()),
                ),
              }),
              signal: controller.current!.signal,
            });
            const uploaded = await response.json();
            if (!response.ok) throw Error(uploaded.error ?? "Upload failed");
            const uri = new URL(uploaded.uri);
            if (
              !(uploaded.storage === "local-workspace" && uri.origin === window.location.origin && /^\/api\/local-assets\/[a-f0-9]{64}\.json$/.test(uri.pathname)) &&
              !(uploaded.storage === "pinata" && uri.origin === "https://gateway.pinata.cloud" && /^\/ipfs\/[a-zA-Z0-9]{46,100}$/.test(uri.pathname) && !uri.search && !uri.hash)
            )
              throw Error("Upload returned an unexpected URI.");
            const documentResponse = await fetch(uri, {
              cache: "no-store",
              signal: controller.current!.signal,
            });
            if (!documentResponse.ok)
              throw Error("Uploaded metadata is unavailable.");
            const documentBytes = new Uint8Array(
              await documentResponse.arrayBuffer(),
            );
            const digest = new Uint8Array(
              await crypto.subtle.digest("SHA-256", documentBytes),
            );
            const hash = Array.from(digest, (b) =>
              b.toString(16).padStart(2, "0"),
            ).join("");
            if (hash !== uploaded.sha256 || (uploaded.storage === "local-workspace" && uri.pathname !== `/api/local-assets/${hash}.json`))
              throw Error("Uploaded metadata hash mismatch.");
            const document = JSON.parse(
              new TextDecoder().decode(documentBytes),
            );
            if (
              document.name !== form.name.trim() ||
              document.symbol !== form.symbol.trim() ||
              document.description !== form.description
            )
              throw Error("Uploaded metadata differs from the review.");
            mintSigner.current = await generateKeyPairSigner();
            saved = launchJob(
              parameters(uri.toString()),
              mintSigner.current.address,
              address(wallet),
              environment.genesis,
            );
            save(saved);
          }
          await executeWalletLaunch(
            executor,
            saved,
            mintSigner.current,
            save,
            setStage,
            controller.current!.signal,
          );
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const textField = (name: keyof typeof form, label: string) => (
    <label key={name} className="block space-y-2 text-sm font-bold">
      <span>{label}</span>
      <input
        aria-label={label}
        className={inputStyle}
        value={form[name]}
        onChange={(e) => {
          setReview(false);
          setForm((f) => ({
            ...f,
            [name]:
              name === "symbol" ? e.target.value.toUpperCase() : e.target.value,
          }));
        }}
        disabled={busy}
      />
    </label>
  );
  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-yellow-300/20 p-4 text-sm text-yellow-100">
        Local validator and disposable wallets only. Default image/JSON storage is
        temporary workspace storage. If the operator explicitly configures Pinata,
        uploads are public IPFS files dependent on continued provider pinning.
        Do not upload private information. No mainnet or Devnet launch is enabled.
      </p>
      {!wallet ? (
        <div className="flex flex-wrap gap-3">
          {wallets.map((w) => (
            <button
              key={w.name}
              className={button}
              disabled={connect.isRunning}
              onClick={() => connect.dispatch(w)}
            >
              Connect {w.name}
            </button>
          ))}
          {!wallets.length && (
            <p>Open a supported Wallet Standard wallet browser.</p>
          )}
        </div>
      ) : (
        <>
          <p className="break-all text-xs text-white/50">
            Creator wallet: {wallet}
          </p>
          {!current && (
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("name", "Token name")}
              {textField("symbol", "Ticker")}
              <label className="block space-y-2 text-sm font-bold sm:col-span-2">
                Description
                <textarea
                  aria-label="Description"
                  className={inputStyle}
                  value={form.description}
                  disabled={busy}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </label>
              <label className="block space-y-2 text-sm font-bold sm:col-span-2">
                Token image
                <input
                  aria-label="Token image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    setImage(e.target.files?.[0] ?? null);
                    setReview(false);
                  }}
                />
              </label>
              {textField("website", "Website (optional HTTPS)")}
              {textField("twitter", "X (optional HTTPS)")}
              {textField("telegram", "Telegram (optional HTTPS)")}
              {textField("supply", "Total supply")}
              {textField("decimals", "Decimals (0–9)")}
              {textField("creatorPercent", "Creator allocation (%)")}
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={capEnabled}
                  disabled={busy}
                  onChange={(e) => {
                    setCapEnabled(e.target.checked);
                    setReview(false);
                  }}
                />
                Enable cumulative opening wallet cap
              </label>
              {textField("capPercent", "Wallet cap (%)")}
              {textField("capDuration", "Wallet-cap duration (slots)")}
              {textField("openingLimit", "Protected cumulative limit (%)")}
              {textField("openingDelay", "Launch delay (slots)")}
              {textField("openingDuration", "Protected duration (slots)")}
            </div>
          )}
          {preview && (
            <div
              className="rounded-2xl border border-white/10 p-5 text-sm leading-7"
              data-testid="launch-review"
            >
              <p className="font-black">
                {preview.name} (${preview.symbol}) · {preview.decimals} decimals
              </p>
              <p>
                Creator: {formatUnits(preview.creatorAmount, preview.decimals)}{" "}
                · Curve:{" "}
                {formatUnits(preview.tradingInventory, preview.decimals)} ·
                Reserved liquidity:{" "}
                {formatUnits(preview.migrationInventory, preview.decimals)}{" "}
                tokens
              </p>
              <p>
                Curve: 42 → 126 lamports per whole token. Minimum increment: one
                whole token.
              </p>
              <p>
                Platform 0.75% + creator 0.25% trading fees. JeeT creation fee:
                0 SOL.
              </p>
              <p>
                Five signing stages: mint, supply, custody/curve, metadata,
                atomic activation. Estimated base network fees: 0.00003 SOL;
                account rent is additional. Metadata has a maximum 0.02 SOL
                budget including its rent and external protocol charge (observed
                protocol charge 0.01 SOL). Actual network fees appear at each
                signature.
              </p>
              <p>
                Protected schedule starts at custody/curve initialization, not
                at the final signing step. Slow signing can consume the
                configured delay/window; it is never reset.
              </p>
              <p>
                Graduation eligibility preserves curve redemptions until
                successful migration. Immutable terms: 60-bps maximum opening
                price gap, separate setup funding, no JeeT migration fee.
                External AMM upgrade/admin trust remains.
              </p>
              <p>
                Interrupted creation must be resumed with this wallet.
                Tokens/rent may already be in custody; no automatic
                cancellation/refund is promised.
              </p>
            </div>
          )}
          {!current && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={review}
                disabled={busy}
                onChange={(e) => setReview(e.target.checked)}
              />
              I reviewed the allocations, five signing stages, slot timing,
              temporary local storage or operator-configured public IPFS uploads, and cost budgets.
            </label>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              disabled={
                busy ||
                stage === "confirmed" ||
                (!current && (!review || !preview || !image))
              }
              onClick={() => void begin()}
            >
              {busy
                ? "Working…"
                : current
                  ? "Resume saved launch"
                  : "Sign and create coin"}
            </button>
            <button
              className={button}
              disabled={busy || disconnect.isRunning}
              onClick={() => disconnect.dispatch()}
            >
              Disconnect wallet
            </button>
          </div>
          {current && (
            <p className="break-all text-sm">
              Saved mint: <span data-testid="created-mint">{current.mint}</span>
            </p>
          )}
          <p role="status" data-testid="launch-stage">
            {stage}
          </p>
          {notice && (
            <p role="status" className="break-all text-xs">
              {notice.phase}
              {notice.signature ? ` · ${notice.signature}` : ""}
              {notice.networkFee !== undefined
                ? ` · network fee ${formatUnits(notice.networkFee)} SOL`
                : ""}
            </p>
          )}
          {current && Object.keys(current.signatures).length > 0 && (
            <details className="rounded-xl border border-white/10 p-4 text-xs">
              <summary>Confirmed setup transactions</summary>
              <dl>{Object.entries(current.signatures).map(([name, signature]) => (
                <div key={name} className="mt-3 break-all"><dt className="font-bold">{name}</dt><dd>{signature}</dd></div>
              ))}</dl>
              <p className="mt-3 text-white/50">These signatures belong to the configured local validator. Public explorers cannot resolve this disposable local chain.</p>
            </details>
          )}
          {stage === "confirmed" && current && (
            <p className="rounded-xl border border-[#9cff43]/30 p-4 text-[#9cff43]">
              Launch confirmed: supply, metadata, custody, revoked mint/freeze
              authorities and graduation terms verified. Mint: {current.mint}
              <Link className="mt-3 block underline" href={`/token/${current.mint}`}>Open token details</Link>
            </p>
          )}
        </>
      )}
      {!!(connect.error || disconnect.error) && (
        <p role="alert">{String(connect.error ?? disconnect.error)}</p>
      )}
      {error && (
        <p
          role="alert"
          className="break-words text-red-300"
          data-testid="creation-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
export default function WalletLaunchCreator() {
  const client = useClient<AppClient>();
  const [environment, setEnvironment] = useState<WalletEnvironment | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    loadWalletEnvironment(c.signal)
      .then(setEnvironment)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  return (
    <main className="min-h-screen bg-[#050605] px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/" className="text-[#9cff43]">
          ← JeeT Launch
        </Link>
        <h1 className="text-3xl font-black">Create a local coin</h1>
        <p className="text-white/50">
          Your wallet signs. JeeT never receives its private keys.
        </p>
        {error ? (
          <p role="alert">{error}</p>
        ) : environment ? (
          <WalletHydrationGate
            client={client}
            fallback={<p>Loading wallet…</p>}
          >
            <Creation environment={environment} />
          </WalletHydrationGate>
        ) : (
          <p>Verifying local validator…</p>
        )}
      </div>
    </main>
  );
}
