import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is self-contained; never infer a parent checkout as its tracing root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
