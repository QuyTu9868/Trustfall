import type { NextConfig } from "next";

// Listing photos live in Supabase Storage, so next/image has to be told that host is
// allowed. Derived from the env var rather than hardcoded, so pointing the app at a
// different Supabase project does not silently break every image.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
