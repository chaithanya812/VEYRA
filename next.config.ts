import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Supabase SECRET key must never reach the client bundle. We keep all
  // data access server-side (see lib/data/with-org.ts); nothing here exposes it.
  experimental: {
    // Server Actions are used for mutations through the withOrg accessor.
    serverActions: {
      // Document uploads go through a Server Action, and the default body cap
      // is 1 MB — a floor plan is not. Kept in step with MAX_UPLOAD_BYTES in
      // lib/data/storage.ts (25 MB) plus room for the multipart envelope.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
