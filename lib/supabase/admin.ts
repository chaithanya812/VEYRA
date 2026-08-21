import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * The SECRET (service-role) Supabase client.
 *
 * ⛔ DO NOT import this outside `lib/data/`. It has full, unfiltered table
 * access and — because RLS is OFF — no database guard behind it. All feature
 * code must go through the org-scoped accessor in `lib/data/with-org.ts`, which
 * applies `org_id` isolation. A raw query here with a missing `org_id` filter is
 * a cross-tenant leak (PLAN §9 risk #1). Enforced by the lint rule
 * `no-restricted-imports` in eslint.config.mjs.
 */
export const admin: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseSecretKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-veyra-access": "server-admin" } },
  },
);
