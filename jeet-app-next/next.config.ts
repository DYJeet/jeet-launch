import type { NextConfig } from "next";
import { publicWriteConfigurationReady } from './src/lib/public-write-policy.ts';

if (process.env.VERCEL === "1" && process.env.NEXT_PUBLIC_JEET_WALLET_NETWORK === "mainnet" &&
    (process.env.VERCEL_ENV !== "preview" || process.env.JEET_MAINNET_READ_PREVIEW !== "1"))
  throw Error("Mainnet builds require the isolated read-only Preview profile.");

const nextConfig: NextConfig = {
  ...(process.env.VERCEL === "1" ? { env: {
    NEXT_PUBLIC_JEET_PUBLIC_BETA: publicWriteConfigurationReady(process.env) ? "0" : "1",
    NEXT_PUBLIC_JEET_WALLET_NETWORK: process.env.NEXT_PUBLIC_JEET_WALLET_NETWORK === "mainnet" ? "mainnet" : "devnet",
  } } : {}),
  // This app is self-contained; never infer a parent checkout as its tracing root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
