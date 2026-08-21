# Credentials & infrastructure

Real values live in **`.env.local`** (gitignored). This file explains what each
key is, where it lives, and what it may and may not be used for. **Redacted** —
never paste secret values here.

---

## ⛔ RLS is OFF — read this before writing any data-access code

> **Row-Level Security is OFF on the Supabase project `vjupynmjzpdzrluwctzd`, by
> the owner's decision. Do not enable it. Do not write RLS policies. Do not add
> `create policy` / `alter table … enable row level security` to any migration.**

This is a deliberate choice, consistent with the existing INTERIOR app. But with
RLS off there is **no database-level backstop** against one tenant reading
another's rows. The whole burden of isolation moves into application code, so
these five rules are **mandatory, not hygiene**:

1. **The browser never talks to Supabase tables.** No `createClient(...).from(table)`
   for data in any client component. The publishable key, with RLS off, would
   grant full table access to anyone who opens devtools.
2. **All data access goes through the server** — Next.js route handlers or server
   actions — using the **secret** key.
3. **`org_id` isolation lives in exactly one accessor** (`withOrg()`, per
   PLAN §3.1). Because there is no policy layer beneath it, that accessor is the
   *only* thing preventing cross-tenant leakage. Ship it with:
   - a lint rule banning raw `.from('<table>')` access outside the accessor, and
   - a test asserting every tenant table carries an `org_id` column.
4. **The secret key is server-only.** Never `NEXT_PUBLIC_*`, never logged, never
   in the client bundle.
5. **Auth is unaffected.** Supabase Auth still works — verify the JWT server-side
   against the JWKS URL, then authorize inside the accessor.

**This makes "cross-tenant leakage" the #1 risk on PLAN §9, above the item
master.** One raw query without `org_id` is an incident, not a bug.

---

## Keys

| Key | Where | Scope | Rules |
|---|---|---|---|
| `SUPABASE_URL` | `.env.local`, root | public | Project endpoint. |
| `SUPABASE_PUBLISHABLE_KEY` | `.env.local`, root | public (client-safe) | Auth flows only. **Not** for table reads/writes from the browser (RLS is off). |
| `SUPABASE_SECRET_KEY` | `.env.local`, root | **server only** | Full DB access. Server routes/actions only. Never `NEXT_PUBLIC_`, never logged. |
| `SUPABASE_JWKS_URL` | `.env.local`, root | public | Verify Auth JWTs server-side. |
| `DATABASE_URL` | `.env.local`, root | **server only** | Direct Postgres. Password is URL-encoded in the string. |
| `GEMINI_API_KEY` | `.env.local`, root | **server only** | Competitor-video analysis stage. Run manually for now. |

## Notes

- **Project ref:** `vjupynmjzpdzrluwctzd` (region in the URL).
- **Postgres password:** stored ONLY in `.env.local` (gitignored) inside
  `DATABASE_URL` / `DATABASE_POOLER_URL`, URL-encoded. **Never write the raw value
  in this file or any committed file.** (A previously-committed raw value should be
  rotated — see the last bullet.)
- **Gemini model:** the owner referred to "Gemini 3.5 Flash Lite", which is not a
  real model id. The lightweight flash model is **`gemini-2.5-flash-lite`**.
  Verify against the live model list with the key before relying on it.
- Rotate any key that has been shared in chat or committed by accident.
