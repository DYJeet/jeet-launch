import type { NextConfig } from "next";
import { publicWriteConfigurationReady } from './src/lib/public-write-policy.ts';

const nextConfig: NextConfig = {
  ...(process.env.VERCEL === "1" ? { env: {
    NEXT_PUBLIC_JEET_PUBLIC_BETA: publicWriteConfigurationReady(process.env) ? "0" : "1",
    NEXT_PUBLIC_JEET_WALLET_NETWORK: "devnet",
  } } : {}),
  // This app is self-contained; never infer a parent checkout as its tracing root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
