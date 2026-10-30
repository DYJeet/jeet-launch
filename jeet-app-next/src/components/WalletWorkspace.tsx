"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useClient } from "@solana/react";
import { useConnect, useConnectedWallet, useDisconnect, useWallets } from "@solana/kit-plugin-wallet/react";
import { AccountRole, address } from "@solana/kit";
import type { AppClient } from "@/app/providers";
import WalletHydrationGate from "./WalletHydrationGate";
import { formatUnits, loadWalletEnvironment, type WalletEnvironment } from "@/lib/wallet-environment";
import { browserPendingStore, WalletTransactionExecutor, type TransactionNotice } from "@/lib/wallet-transactions";

const button = "rounded-xl border border-[#9cff43]/30 bg-[#9cff43]/10 px-5 py-3 font-bold text-[#9cff43] disabled:opacity-40";
function Workspace({ environment }: { environment: WalletEnvironment }) {
  const client = useClient<AppClient>(), connected = useConnectedWallet(client), wallets = useWallets(client);
  const connect = useConnect(client), disconnect = useDisconnect(client);
  const wallet = connected?.account.address ?? null;
  const [notice, setNotice] = useState<TransactionNotice | null>(null), [error, setError] = useState("");
  const [balance, setBalance] = useState<{ wallet: string; raw: bigint } | null>(null), [refresh, setRefresh] = useState(0);
  const [running, setRunning] = useState(false);
  const executor = useMemo(() => new WalletTransactionExecutor(environment,
    new URL(environment.rpcPath, window.location.origin).toString(), () => client.wallet.getState(),
    browserPendingStore(), setNotice), [client, environment]);
  useEffect(() => {
    if (!wallet) return;
    const controller = new AbortController();
    let active = true;
    const read = async () => {
      try {
        await executor.network();
        const result = await executor.rpc.getBalance(address(wallet), { commitment: "confirmed" }).send({ abortSignal: controller.signal });
        if (active) { setBalance({ wallet, raw: result.value }); setError(""); }
      } catch (e) { if (active) { setBalance(null); setError(e instanceof Error ? e.message : String(e)); } }
    };
    void read();
    return () => { active = false; controller.abort(); };
  }, [executor, wallet, refresh]);
  async function check(reconcile = false) {
    if (!wallet) return;
    setRunning(true); setError("");
    try {
      if (reconcile) await executor.reconcile(wallet);
      else await executor.execute(async (signer) => {
        const data = new Uint8Array(12);
        const view = new DataView(data.buffer);
        view.setUint32(0, 2, true); view.setBigUint64(4, 1n, true);
        return [{ programAddress: address("11111111111111111111111111111111"), data,
          accounts: [{ address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
            { address: signer.address, role: AccountRole.WRITABLE }] }];
      }, 1n);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); setRefresh((n) => n + 1); }
  }
  return <div className="space-y-5">
    <p className="rounded-xl border border-yellow-300/20 p-4 text-sm text-yellow-100">
      Local validator only. Wallet Standard requests use its Devnet-compatible chain label;
      the exact local genesis is independently checked before signing and sending. This does not switch your wallet network.
    </p>
    <p className="break-all text-xs text-white/50">Verified configured genesis: {environment.genesis}</p>
    {wallet ? <>
      <p data-testid="wallet-address" className="break-all font-mono text-sm">{wallet}</p>
      <p>Local SOL: <strong data-testid="local-balance">{balance?.wallet === wallet ? formatUnits(balance.raw) : "Loading…"}</strong></p>
      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={running || disconnect.isRunning} onClick={() => disconnect.dispatch()}>Disconnect wallet</button>
        <button className={button} disabled={running} onClick={() => void check()}>Sign local connection check</button>
        <button className={button} disabled={running} onClick={() => void check(true)}>Check saved transaction</button>
      </div>
      <p className="text-sm text-white/50">The connection check transfers one test lamport to your own account. Only the displayed network fee is spent. Your wallet reviews the exact transaction. No token launch or trade is implied.</p>
    </> : <div className="flex flex-wrap gap-3">{wallets.map((w) => <button key={w.name} className={button} disabled={connect.isRunning} onClick={() => connect.dispatch(w)}>Connect {w.name}</button>)}
      {!wallets.length && <p>No compatible Wallet Standard wallet detected. Open a supported wallet browser or install Phantom/Solflare.</p>}</div>}
    {!!(connect.error || disconnect.error) && <p role="alert">{String(connect.error ?? disconnect.error)}</p>}
    {notice && <div role="status" className="break-all rounded-xl border border-white/10 p-4">
      <p data-testid="transaction-phase">{notice.phase}</p>{notice.signature && <p data-testid="transaction-signature" className="mt-2 text-xs">{notice.signature}</p>}
    </div>}
    {error && <p role="alert" className="break-words text-red-300">{error}</p>}
  </div>;
}
export default function WalletWorkspace() {
  const client = useClient<AppClient>();
  const [environment, setEnvironment] = useState<WalletEnvironment | null>(null), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController();
    loadWalletEnvironment(controller.signal).then(setEnvironment).catch((e) => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort(); }, []);
  return <main className="min-h-screen bg-[#050605] px-5 py-8 text-white"><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/" className="text-[#9cff43]">← JeeT Launch</Link>
    <h1 className="text-3xl font-black">Local wallet workspace</h1>
    <p className="text-white/50">Development verification, disposable wallets and test SOL only.</p>
    {error ? <p role="alert">{error}</p> : environment ? <WalletHydrationGate client={client} fallback={<p>Loading wallets…</p>}><Workspace environment={environment} /></WalletHydrationGate> : <p role="status">Verifying local environment…</p>}
  </div></main>;
}
