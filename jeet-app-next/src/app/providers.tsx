"use client";

import { createClient } from "@solana/kit";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { associatedTokenProgram, tokenProgram } from "@solana-program/token";
import { ClientProvider } from "@solana/react";

export const client = createClient()
  .use(walletSigner({ chain: "solana:devnet" }))
  .use(solanaDevnetRpc())
  .use(tokenProgram())
  .use(associatedTokenProgram());

export type AppClient = Awaited<typeof client>;

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
