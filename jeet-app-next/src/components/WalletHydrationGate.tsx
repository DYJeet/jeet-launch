"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { WalletReadyGate } from "@solana/kit-plugin-wallet/react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Wallet discovery is browser state; SSR and initial hydration share one fallback. */
export default function WalletHydrationGate(
  props: ComponentProps<typeof WalletReadyGate>,
) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return hydrated ? <WalletReadyGate {...props} /> : props.fallback;
}
