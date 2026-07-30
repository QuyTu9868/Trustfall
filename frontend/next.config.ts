import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RainbowKit imports the Base Account connector, which reaches @coinbase/cdp-sdk.
  // That SDK lazily imports optional @x402/* packages for Solana payments, which are
  // not installed and which Trustfall never calls. Keeping these two packages out of
  // the server bundle stops Turbopack from trying to resolve those imports.
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],
};

export default nextConfig;
