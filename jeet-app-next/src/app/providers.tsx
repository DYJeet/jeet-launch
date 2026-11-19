"use client";

import { createClient } from "@solana/kit";
import { WALLET_NETWORK } from "@/lib/wallet-program";
import { solanaDevnetRpc, solanaMainnetRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { associatedTokenProgram, tokenProgram } from "@solana-program/token";
import { ClientProvider } from "@solana/react";

export const client = createClient()
  .use(walletSigner({ chain: WALLET_NETWORK === "mainnet" ? "solana:mainnet" : "solana:devnet" }))
  .use(WALLET_NETWORK === "mainnet" ? solanaMainnetRpc({ rpcUrl: typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin + "/api/wallet/rpc" }) : solanaDevnetRpc())
  .use(tokenProgram())
  .use(associatedTokenProgram());

export type AppClient = Awaited<typeof client>;

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
