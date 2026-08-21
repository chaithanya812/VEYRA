# VEYRA — architecture & how the code is built

This is the technical companion to the specification docs (`prior-work/PLAN-v0.1.md`,
`competitor-research/FEATURE-REGISTER.md`). It documents the **foundation that is
actually built** and the **pattern every future module follows**, so a fresh agent
(or a backend agent) can extend it without re-deriving anything.

**Status:** Wave-0 foundation + one working vertical slice (Leads), on real Supabase.

---

## ⛔ The one rule everything hangs on: RLS is OFF

Row-Level Security is OFF on Supabase project `vjupynmjzpdzrluwctzd` by owner
decision (see `CREDENTIALS.md`). There is **no database-level guard** against a
tenant reading another tenant's rows. The entire burden is in application code:

1. **The browser never queries tables.** No Supabase client with table access
   ships to the client bundle.
2. **All data access is server-side** through the **secret** key.
3. **`org_id` isolation lives in exactly one accessor** — `lib/data/with-org.ts`.
   It is the only thing preventing cross-tenant leakage.
4. A lint rule (`eslint.config.mjs`) **bans importing the raw client** outside
   `lib/data`. A verify script (`scripts/verify.mjs`) asserts isolation holds.

This is why cross-tenant leakage is the **#1 risk**, above the item master.

---

## Stack

Matches the app being ported from (`TOO MUCH/INTERIOR`) so patterns transfer:

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Styling | Tailwind v4 + CSS variable design tokens (`app/globals.css`) |
| Data | Supabase (Postgres) via `@supabase/supabase-js` over PostgREST/HTTPS |
| Auth | Supabase Auth via `@supabase/ssr` (cookie sessions, server-verified) |
| Icons | lucide-react · Validation | zod · Tests | vitest |

The app talks to Supabase over **HTTPS (PostgREST)** at runtime — not a direct
Postgres socket — so it runs anywhere with outbound 443. Direct Postgres (the
`db.*` host) is IPv4-unresolvable from many networks; migrations use the
**Supavisor pooler** (region `ap-northeast-2`) via `scripts/db.mjs`.

---

## Folder map

```
VEYRA CRM/
├── app/
│   ├── (auth)/                login page + auth server actions
│   ├── (app)/                 authenticated shell (layout gates on getViewer)
│   │   ├── layout.tsx         SideNav + TopBar; redirects to /login if no viewer
│   │   └── leads/             ← the reference slice: page, new, [id], actions.ts
│   ├── globals.css            design tokens (white/black/red)
│   ├── layout.tsx  page.tsx   root: redirect to /leads or /login
├── components/
│   ├── ui/                    Button, Field, primitives (Card, StatusChip, …)
│   └── shell/                 SideNav, TopBar
├── lib/
│   ├── env.ts                 server-only validated env (guards the secret key)
│   ├── supabase/
│   │   ├── admin.ts           ⛔ secret-key client — importable ONLY from lib/data
│   │   └── auth-client.ts     SSR auth client (anon key + cookies) — auth only
│   ├── auth/session.ts        getUser / requireUser (verified via getUser())
│   ├── data/
│   │   ├── with-org.ts        ★ THE accessor — org_id isolation
│   │   ├── tables.ts          tenant-table allowlist (every one has org_id)
│   │   ├── context.ts         getViewer() — user + org for the shell
│   │   ├── provisioning.ts    tenant onboarding (create user + org + branch…)
│   │   └── leads.ts           ← reference data module — copy this shape
│   ├── nav.ts  leads-ui.ts  utils.ts
├── supabase/migrations/       0001_foundation.sql (RLS-off schema)
├── scripts/                   db.mjs (migrations) · verify.mjs (e2e checks)
├── middleware.ts              refreshes the auth session cookie
└── (spec docs: requirements/, research/, competitor-research/, prior-work/)
```

---

## The data layer, in detail

### `lib/data/with-org.ts` — the keystone

```ts
const { db, ctx } = await withOrg();          // resolves the caller's org membership
await db.table("leads").select("*").order(...) // read: auto .eq('org_id', ctx.orgId)
await db.table("leads").insert({ name })       // insert: auto-stamps org_id
await db.table("leads").updateById(id, {...})  // update: scoped by org_id AND id
```

`withOrg()` → verifies the auth user (`getUser()`), looks up their active
`org_members` row, and returns a `db` whose every operation is bound to that
`org_id`. Feature code **never** imports `admin` directly; the lint rule enforces it.

Adding a tenant table: put it in `lib/data/tables.ts` (declares "this is
org-scoped"), give it an `org_id uuid not null` column in a migration, done.

### Auth & tenancy

- `middleware.ts` refreshes the session cookie each request.
- `(app)/layout.tsx` calls `getViewer()`; no viewer → redirect to `/login`.
- Sign-up (`app/(auth)/actions.ts`) calls `createUserAndOrg()` which provisions
  a confirmed user + org + default branch + owner role + membership, then signs in.

---

## Schema (migration 0001)

Platform (not org-scoped): `orgs`, `app_users`.
Tenant-scoped (carry `org_id`): `branches`, `roles`, `org_members`, `parties`,
`leads`, `lead_activities`.

Notes tying to the spec: `parties` is the unified customer/vendor table (PLAN
entity 2); `leads.phone_key` + the `uq_leads_org_phonekey` unique index implement
the dedupe that fixed INTERIOR's forked-customer bug (PLAN §6.1); `lead_activities`
is the seed of the interactions layer (PLAN §6.1a). **No table enables RLS.**

---

## How to add a module (the repeatable pattern)

The Leads slice is the template. To add, say, **Quotations**:

1. **Migration** — `supabase/migrations/000N_quotations.sql`: tables with
   `org_id uuid not null`, indexes, no RLS. Run `node scripts/db.mjs migrate`.
2. **Allowlist** — add the table names to `lib/data/tables.ts`.
3. **Data module** — `lib/data/quotations.ts`, copying `leads.ts`: every function
   opens `withOrg()` and goes through `db.table(...)`. Prices are computed by an
   engine + validator, **never by an LLM** (PLAN §8).
4. **Server actions** — `app/(app)/quotations/actions.ts` (zod-validate input →
   call the data module → `revalidatePath`).
5. **Pages** — `app/(app)/quotations/{page,new,[id]}.tsx` using the `components/ui`
   primitives and the design tokens.
6. **Nav** — flip `soon` off for the item in `lib/nav.ts`.
7. **Verify** — extend `scripts/verify.mjs` with the module's isolation + rules.

Design must follow `competitor-research/DESIGN-DIRECTION.md` (white/black/red,
red used only for its closed list of jobs).

---

## Running it

```bash
npm run dev        # http://localhost:3010
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # includes the no-raw-client rule
node scripts/db.mjs migrate   # apply migrations (uses DATABASE_POOLER_URL)
node scripts/verify.mjs       # e2e isolation/dedupe/CRUD checks vs real Supabase
```

First run: open `/login`, click **Create account** (name, company, email,
password) → you're provisioned an org and land on **Leads**. Create a lead;
try the same phone twice to see dedupe; open a lead to change status and add notes.

---

## What's built vs what's next

**Built (Wave 0 + slice):** tenancy + `withOrg` isolation, auth + provisioning,
design system, app shell, Leads (list/create/detail/status/timeline), migrations,
verify harness. All verified against real Supabase (`scripts/verify.mjs`, 8/8).

**Next, by priority (from the register):** the config/permission engine
(`(module,action,scope)` + field-level visibility), the Item master + UOM model
(PLAN §4 — highest-risk), then Quotation (port INTERIOR's engine), then the
procurement depth this teardown specced. Features stream in from the owner and
slot into modules as they arrive.
