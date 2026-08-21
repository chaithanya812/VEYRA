import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Supabase SECRET key must never reach the client bundle. We keep all
  // data access server-side (see lib/data/with-org.ts); nothing here exposes it.
  experimental: {
    // Server Actions are used for mutations through the withOrg accessor.
  },
};

export default nextConfig;
