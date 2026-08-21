import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * The Auth SSR client (publishable/anon key + request cookies).
 *
 * This client is used ONLY for Supabase Auth — sign-in/out and reading the
 * verified user from the session cookie. It is NOT used for table access; all
 * data goes through lib/data/with-org.ts. Talking to Supabase *Auth* from the
 * server is fine and expected; talking to *tables* from the browser is not.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore; middleware refreshes cookies.
        }
      },
    },
  });
}
