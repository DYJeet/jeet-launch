"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { address } from "@solana/kit";
import { useClient } from "@solana/react";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import type { AppClient } from "@/app/providers";
import { claimFeeInstruction } from "@/lib/launch-fees";
import { readWalletLaunch, type WalletLaunchSnapshot } from "@/lib/wallet-launch-flow";
import { formatUnits, type WalletEnvironment } from "@/lib/wallet-environment";
import { browserPendingStore, WalletTransactionExecutor, type TransactionNotice } from "@/lib/wallet-transactions";

export default function LaunchFeeClaims({ launch, environment, refresh }: {
  launch: WalletLaunchSnapshot;
  environment: WalletEnvironment;
  refresh: () => void;
}) {
  const client = useClient<AppClient>();
  const wallet = useConnectedWallet(client)?.account.address;
  const [notice, setNotice] = useState<TransactionNotice>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const action = useRef<AbortController | null>(null);
  useEffect(() => () => action.current?.abort(), []);
  const executor = useMemo(() => new WalletTransactionExecutor(environment,
    new URL(environment.rpcPath, window.location.origin).toString(),
    () => client.wallet.getState(), browserPendingStore(), setNotice), [client, environment]);
  const { mint, creator, custody, curve, platformVault, creatorVault } = launch.addresses;
  const pending = wallet && browserPendingStore().get(environment.genesis + ":" + wallet);

  async function submit(kind?: 0 | 1) {
    if (action.current || !wallet) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy(true);
    setError("");
    try {
      if (kind === undefined) await executor.reconcile(wallet);
      else {
        const shown = launch.fees[kind];
        if (!shown || shown.beneficiary !== wallet || shown.claimable === 0n) throw Error("No fees available for this wallet.");
        await executor.execute(async signer => {
          const latest = await readWalletLaunch(executor, mint, creator);
          const fee = latest.fees[kind];
          if (!fee || signer.address !== fee.beneficiary || fee.beneficiary !== wallet ||
            fee.claimable !== shown.claimable) throw Error("Fee balance changed. Refresh before signing.");
          return [{
            ...claimFeeInstruction({ beneficiary: signer, mint, custody, curve,
              feeVault: kind === 0 ? platformVault : creatorVault, kind, amount: shown.claimable }),
            programAddress: address(environment.program),
          }];
        }, 0n, controller.signal);
      }
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to confirm the fee claim.");
    } finally {
      action.current = null;
      setBusy(false);
    }
  }

  return <section id="fee-accounts" className="space-y-3 rounded-2xl border border-white/15 p-4">
    <h2 className="text-lg font-bold">Creator and platform fees</h2>
    <p className="text-sm text-white/65">Claims go to the beneficiary recorded on-chain. The signing wallet pays the network fee.</p>
    {([0, 1] as const).map(kind => {
      const fee = launch.fees[kind];
      return <div key={kind} className="space-y-1 border-t border-white/10 pt-3">
        <h3 className="font-bold">{kind === 0 ? "Platform" : "Creator"}</h3>
        {fee ? <>
          <p className="break-all text-xs text-white/60">Beneficiary {fee.beneficiary}</p>
          <p className="text-sm">{formatUnits(fee.accrued)} SOL accrued · {formatUnits(fee.withdrawn)} SOL claimed</p>
          <p className="text-sm">{formatUnits(fee.claimable)} SOL claimable</p>
          {fee.claimable > 0n && fee.beneficiary === wallet && <button
            disabled={busy || !!pending} onClick={() => void submit(kind)}
            className="rounded-xl border border-[#9cff43]/30 px-3 py-2 text-sm text-[#9cff43] disabled:opacity-40">
            Claim {formatUnits(fee.claimable)} SOL
          </button>}
        </> : <p className="text-sm">Fee account unavailable.</p>}
      </div>;
    })}
    {pending && <button className="text-sm text-[#9cff43] underline" disabled={busy} onClick={() => void submit()}>
      Check pending transaction
    </button>}
    {notice && <p role="status" className="break-all text-sm">Wallet {notice.phase}{notice.signature && ` · ${notice.signature}`}</p>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </section>;
}
