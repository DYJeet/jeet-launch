"use client";

import { useEffect, useState } from "react";
import { getSolBalance } from "@/lib/solana-rpc";

type BalanceState = { address: string; balance: number | null; error: string | null };
export function useWalletBalance(address: string | null) {
  const [state, setState] = useState<BalanceState | null>(null);
  const [identity, setIdentity] = useState(address);
  // Adjust this hook's state when its input identity changes, before displaying
  // data. Reconnecting the same wallet must also request a fresh balance.
  if (identity !== address) {
    setIdentity(address);
    setState(null);
  }
  useEffect(() => {
    if (!address) return;
    const walletAddress = address, controller = new AbortController();
    let active = true, inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const balance = await getSolBalance(walletAddress, controller.signal);
        if (active) setState({ address: walletAddress, balance, error: null });
      } catch (caught) {
        if (active && !controller.signal.aborted)
          setState({ address: walletAddress, balance: null, error: caught instanceof Error ? caught.message : "Unable to load wallet balance." });
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 20_000);
    return () => { active = false; controller.abort(); window.clearInterval(interval); };
  }, [address]);
  // Derive reset/loading from the current identity; an old wallet response can
  // never be rendered for a new wallet or after disconnect.
  const current = address && state?.address === address ? state : null;
  return { balance: current?.balance ?? null, loading: !!address && !current, error: current?.error ?? null };
}
