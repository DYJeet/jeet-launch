"use client";

import { useEffect, useState } from "react";
import { getSolBalance } from "@/lib/solana-rpc";

export function useWalletBalance(address: string | null) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      setLoading(false);
      setError(null);
      return;
    }

    const walletAddress = address;
    const controller = new AbortController();
    let active = true;

    async function refresh() {
      setLoading(true);
      setError(null);

      try {
        const nextBalance = await getSolBalance(walletAddress, controller.signal);
        if (active) setBalance(nextBalance);
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Unable to load wallet balance.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 20_000);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [address]);

  return { balance, loading, error };
}
