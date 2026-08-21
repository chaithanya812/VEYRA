import "server-only";

/**
 * Server-only environment access.
 *
 * ⛔ RLS is OFF on this Supabase project by decision (see CREDENTIALS.md).
 * The SECRET key below grants full table access. It must NEVER reach the client
 * bundle — this module imports "server-only", so any accidental client import
 * fails the build. Do not re-export these values through a client component.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example / CREDENTIALS.md.`,
    );
  }
  return value;
}

export const env = {
  /** Supabase project URL. */
  supabaseUrl: required("SUPABASE_URL"),
  /** Publishable (anon) key — used only for the Auth SSR client, never for table access. */
  supabaseAnonKey: required("SUPABASE_PUBLISHABLE_KEY"),
  /** SECRET (service-role) key — SERVER ONLY. Full DB access. Never expose. */
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
} as const;
