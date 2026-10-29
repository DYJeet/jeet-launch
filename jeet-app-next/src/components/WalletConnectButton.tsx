"use client";
import WalletReadyGate from "./WalletHydrationGate";

import { useEffect, useRef, useState } from "react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
  useWalletStatus,
} from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import type { AppClient } from "@/app/providers";
import { useWalletBalance } from "@/hooks/useWalletBalance";

function truncate(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function WalletButtonInner({ client }: { client: AppClient }) {
  const status = useWalletStatus(client);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const address = connected ? String(connected.account.address) : null;
  const { balance, loading: balanceLoading, error: balanceError } = useWalletBalance(address);
  const error = connect.error ?? disconnect.error;

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex min-w-[132px] items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-black text-white/65 transition hover:border-[#9cff43]/35 hover:bg-[#9cff43]/[0.07] hover:text-white"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            address
              ? "bg-[#9cff43] shadow-[0_0_10px_rgba(156,255,67,.8)]"
              : "bg-white/25"
          }`}
        />
        {address
          ? truncate(address)
          : status === "connecting"
            ? "Connecting…"
            : "Connect Wallet"}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[100] mt-2 w-[280px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b0d0b]/98 p-3 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                Solana wallet
              </p>
              <p className="mt-1 text-xs font-bold text-[#9cff43]">Devnet</p>
            </div>
            <span className="rounded-full border border-[#9cff43]/20 bg-[#9cff43]/10 px-2 py-1 text-[9px] font-black uppercase text-[#9cff43]">
              Safe test mode
            </span>
          </div>

          {connected ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/30">
                  Connected
                </p>
                <p
                  className="mt-1 font-mono text-sm font-bold text-white"
                  title={address ?? ""}
                >
                  {address ? truncate(address) : ""}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-2.5 py-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/30">Devnet balance</span>
                  <span className="text-xs font-black text-[#9cff43]">
                    {balanceLoading ? "Loading…" : balance !== null ? `${balance.toFixed(4)} SOL` : "—"}
                  </span>
                </div>
                <p className="mt-2 text-[10px] text-white/35">
                  Your wallet keeps custody of its keys. JeeT Launch only reads the public balance here.
                </p>
              </div>
              <button
                role="menuitem"
                type="button"
                disabled={disconnect.isRunning}
                onClick={() => {
                  disconnect.dispatch();
                  setOpen(false);
                }}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-white/65 transition hover:border-red-400/30 hover:text-red-300 disabled:opacity-50"
              >
                {disconnect.isRunning ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {wallets.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-xs text-white/45">
                  No Wallet Standard wallet detected. Install or open Phantom,
                  Solflare, Backpack, or another compatible wallet.
                </div>
              ) : (
                wallets.map((wallet) => (
                  <button
                    role="menuitem"
                    key={wallet.name}
                    type="button"
                    disabled={connect.isRunning || status === "connecting"}
                    onClick={() => {
                      connect.dispatch(wallet);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-left transition hover:border-[#9cff43]/30 hover:bg-[#9cff43]/[0.06] disabled:opacity-50"
                  >
                    <span className="text-xs font-black text-white">
                      {wallet.name}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#9cff43]">
                      {connect.isRunning ? "Opening…" : "Connect"}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {error ? (
            <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[11px] font-semibold text-red-300">
              {error instanceof Error ? error.message : String(error)}
            </p>
          ) : null}

          {balanceError && connected ? (
            <p className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-[11px] font-semibold text-yellow-200">
              Balance unavailable: {balanceError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WalletLoadingButton() {
  return (
    <button
      type="button"
      disabled
      className="flex min-w-[132px] items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-black text-white/40"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white/25" />
      Loading wallets…
    </button>
  );
}

export default function WalletConnectButton() {
  const client = useClient<AppClient>();

  return (
    <WalletReadyGate client={client} fallback={<WalletLoadingButton />}>
      <WalletButtonInner client={client} />
    </WalletReadyGate>
  );
}
