import "server-only";
import { cache } from "react";
import { createAuthClient } from "@/lib/supabase/auth-client";

export interface AuthUser {
  id: string;
  email: string | null;
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

/**
 * The verified current user, or null. Uses supabase.auth.getUser(), which
 * validates the JWT against Supabase Auth server-side (not getSession, which
 * only reads the cookie without verifying).
 *
 * Wrapped in React `cache()` so the JWT is validated at most ONCE per request:
 * a page/action that calls withOrg() many times previously re-hit Supabase Auth
 * on every call (the dominant per-navigation latency). Same request = one
 * network validation; the memo is scoped to the request and never shared across
 * users/requests.
 */
export const getUser = cache(async function getUser(): Promise<AuthUser | null> {
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

/** Same as getUser but throws when unauthenticated. Use in server actions/routes. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new NotAuthenticatedError();
  return user;
}
