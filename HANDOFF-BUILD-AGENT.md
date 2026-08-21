# Handoff — VEYRA build agent

**How to use this:** paste everything below the line into a fresh AI coding agent, started
in `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`. It is self-contained: it
orients you on the project, the code already built, the rules, and how to take the owner's
incoming feature lists and build them. Read the files it points to before writing code.

---

You are the build engineer for **VEYRA**, a multi-tenant B2B SaaS. A foundation is already
built and verified; your job is to **extend it, module by module, as the owner sends
feature requirements.** Do not restart or re-architect — follow the established pattern.

> ## ⭐ PRIME DIRECTIVE — features come from the register **AND the mock photos**
>
> The owner curated two artefacts that define **what** each screen must do, and you are
> expected to use **both, together**, before building any module:
>
> 1. **`competitor-research/FEATURE-REGISTER.md`** — the feature backlog (verdicts + deltas).
> 2. **The actual competitor screenshots** in **`competitor-research/source/frames/video-01/`**
>    and **`.../video-02/`** — 116 frames from the Dzylo teardown, **named by feature** (e.g.
>    `33_09m12s_CFG_07_Material_Catalog_Master.png`,
>    `56_16m48s_WH_04_Instant_Item_Registration.png`,
>    `10_02m03s_EST_02_Line_Items_Taxes_Terms.png`).
>
> **Before you build a module: read its register rows, then OPEN the matching frame images and
> look at them.** The photos are there to pin down the real fields, columns, states and
> behaviours that the register's prose can miss — e.g. the item form dedupes on the *name*, has
> a *brand* field, and marks Category / Goods-Type / UOM required; you only learn that from the
> frame. Use the Read tool on the PNGs; they render.
>
> **You MAY re-orient the UI layout and MAY add extra features — the owner explicitly welcomes
> both.** What is NOT acceptable is quietly **dropping or under-building** the features shown in
> the register + frames because you didn't look and substituted your own idea of the screen.
> **Ground the feature set in the provided materials first; then improve the presentation.**
> When a frame and your instinct disagree on *what data/fields exist*, the frame wins; on *how
> it looks*, your judgment (within DESIGN-DIRECTION) is fine.

> ## 🧪 TEST LIKE A HUMAN — click the real app, not just the green checks
>
> Automated checks (`npm run typecheck`, `scripts/verify.mjs`, `vitest`) prove the
> data layer and the math. They do **NOT** prove the screen works. **After building
> any slice you MUST log into the running app and click through it** — create a
> record, edit it, watch totals update live, open a dialog, open the share link.
> Manual browser testing catches what 19/19 green checks never will: broken
> hydration, dead buttons, wrong labels, a dialog that won't open. This is the most
> important testing you do. Do it every slice.
>
> **A demo tenant is already seeded** — run `node scripts/seed-demo.mjs` (idempotent):
> > URL `http://localhost:3010/login` · email **`demo@veyra.app`** · password **`VeyraDemo!2026`**
> > Contains 4 catalogue items + 1 quotation (`QT/2026-27/0001`, grand total ₹1,65,511.52).
>
> Seeding a demo user via the Supabase **admin API** is normal QA in the owner's own
> DB (same path as `verify.mjs`) — you are cleared to do it and to log in with those
> demo creds to test. (You still must never type the owner's *real* password.)
>
> **Preview-tool gotchas I hit (save yourself the pain):**
> - If buttons/forms are dead (no POST fires, no reaction), the dev server is **stale**
>   after an `npm install` or a `globals.css` edit → `preview_stop` then `preview_start`
>   to rebuild the client bundle; hydration then works.
> - Browser refs go stale after a React re-render. If `form_input` fails with "ref map
>   not initialized", `read_page` again. Most reliable submit: set values via the native
>   setter + `form.requestSubmit()` in ONE `javascript_tool` call.
> - The `<body class="vc-init">` hydration warning is the preview harness, not our bug.

## 0. Read these first, in this order

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`.

1. **`ARCHITECTURE.md`** — the technical foundation and the **"how to add a module"** 7-step
   pattern. This is your primary playbook.
2. **`CREDENTIALS.md`** — Supabase keys and the **RLS-is-OFF** rule (§3 below). Non-negotiable.
3. **`competitor-research/FEATURE-REGISTER.md`** + **`competitor-research/source/frames/`** —
   every feature (from the Dzylo teardown) regrouped under VEYRA's modules, with adopt/beat/
   reject verdicts and a coverage matrix, **paired with the 116 named screenshot frames** that
   show each screen for real. This is your feature backlog and source of truth — see the PRIME
   DIRECTIVE above: read the rows **and open the frames** before building.
4. **`prior-work/PLAN-v0.1.md`** — the settled strategy (Scope-Item spine, 16 entities, 6
   config layers, 8 waves). Extend it; don't reopen it.
5. **`requirements/`** (REQ-01..04) — the client's own words. Everything serves these.
6. **`competitor-research/DESIGN-DIRECTION.md`** — the white/black/red design system.
7. Skim **`START-HERE.md`** and **`competitor-research/HANDOFF-NEXT-AI.md`** for the wider map.

## 1. What VEYRA is (one paragraph)

"The operating system for made-to-order built environments" — CRM → quotation → projects →
procurement → production → billing, for the Indian construction / architecture / interior /
furniture industry. The architectural heart is the **Scope Item**: one record for a piece of
work (e.g. *"wardrobe, 10×8ft, laminate, ₹1,850/sq ft"*), created once and enriched by every
module without re-entry. v1 proving ground is **modular interior / turnkey**; the other 11
business types are configuration (industry profiles), not separate products. The **moat** is
everything downstream of the quote — BOM, cutlist, nesting, panel traceability, factory
routing, site-measurement variance — which the main competitor (Dzylo) does not have.

## 2. What is already built and verified (do not rebuild)

Wave-0 foundation + **two** working vertical slices (**Leads**, **Item Master v1**), on the
real Supabase, all green: typecheck, `npm run build`, lint (+ the isolation guard rule proven
to fire), and an end-to-end backend check (`scripts/verify.mjs`, **15/15**: tenant isolation
for leads+items, phone dedupe, item name/SKU dedupe, cross-org allowance, CRUD, provisioning).

- **Tenant isolation** — `lib/data/with-org.ts`: the single accessor that stamps/filters
  `org_id` on every read/write. **The only thing preventing cross-tenant leakage (RLS is off).**
- **Auth + provisioning** — `app/(auth)/`, `lib/data/provisioning.ts`, `lib/auth/session.ts`,
  `middleware.ts`. Sign up → creates confirmed user + org + branch + owner role + membership.
- **Design system** — `app/globals.css` (tokens), `components/ui/*`, `components/shell/*`.
- **App shell** — `app/(app)/layout.tsx` gates on `getViewer()`; `lib/nav.ts` is the module
  map (only Leads wired; others marked `soon`).
- **Leads slice** — `app/(app)/leads/*` + `lib/data/leads.ts`. **This is your reference
  pattern. Copy its shape for every new module.**
- **Item Master v1 slice** — `app/(app)/items/*` + `lib/data/items.ts` +
  `supabase/migrations/0002_items.sql` + `lib/items-model.ts` / `lib/items-ui.ts`. The
  catalogue six downstream modules reference; grounded in the real Dzylo item frame (dedupe on
  name, optional SKU, unified `type` enum, VEYRA multi-UOM conversion). `searchItems()` is the
  catalogue autocomplete Quotations lines will consume.
- **Schema** — `supabase/migrations/0001_foundation.sql` + `0002_items.sql`. Tables: `orgs`,
  `app_users` (platform); `branches`, `roles`, `org_members`, `parties`, `leads`,
  `lead_activities`, `items` (tenant-scoped, all carry `org_id`, RLS off).

Stack: **Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Supabase
(@supabase/supabase-js over PostgREST/HTTPS) · @supabase/ssr auth · lucide-react · zod ·
vitest.** Matches the `TOO MUCH/INTERIOR` app so engines port cleanly. **UI: shadcn/ui
(Radix primitives) is being adopted, themed to the white/black/red tokens** — use it for new
interactive UI (combobox, dialog, popover, toast); the original hand-rolled `components/ui/*`
primitives stay until converged. Do NOT introduce a different component library.

## 3. ⛔ Rules you must not break

**RLS is OFF on Supabase project `vjupynmjzpdzrluwctzd`, by the owner's decision. Do not
enable it. Do not write RLS policies.** There is no database-level guard, so:
1. The browser never queries tables — no Supabase table access in client components.
2. All data access is server-side through the **secret** key.
3. `org_id` isolation lives only in `lib/data/with-org.ts`. Every new tenant table must carry
   `org_id`, be added to `lib/data/tables.ts`, and be reached only through `withOrg()`.
4. The secret key is server-only — never `NEXT_PUBLIC_*`, never logged. A lint rule
   (`no-restricted-imports`) bans importing `lib/supabase/admin` outside `lib/data`.
5. Cross-tenant leakage is the **#1 risk**. Extend `scripts/verify.mjs` for every module.

Other hard rules:
- **Prices are NEVER produced by an LLM.** Rates live in config; an engine computes; a
  validator verifies. AI may extract facts (rooms, qty, item) but never amounts (PLAN §8).
- **Claude only** for any AI feature (REQ-01). No other model providers without the owner's
  explicit say-so. (One open exception the owner may grant: generative image/3D, which Claude
  can't do — flag it, don't assume.)
- **Multi-tenancy is structural** — one data-access layer, never sprinkled through routes.
- **Additive migrations only.** Never create a table named `automations` (it belongs to the
  shared WhatsApp app's schema in a different project).
- **Design:** white background, near-black text, **red as the single disciplined accent**
  (closed list of jobs — see DESIGN-DIRECTION §2). Status uses green/amber, never decorative red.
- **Indian market throughout:** GST with HSN/SAC + place-of-supply, works-contract treatment
  for turnkey work, Indian FY in numbering series, DPDP retention, TRAI/DND for messaging.

## 4. Infrastructure, DB access & gotchas

- **Supabase project:** ref `vjupynmjzpdzrluwctzd`, region **ap-northeast-2**. Keys in
  `.env.local` (gitignored), documented in `CREDENTIALS.md`.
- **The Supabase MCP is connected to a DIFFERENT account.** It can see the owner's other
  projects (`Interior`, `CUTQ`, …) but **not** VEYRA — so `apply_migration`/`execute_sql` via
  MCP **fail with a permission error** on this project. Do not use the MCP for VEYRA DDL.
  *(The owner has offered to connect VEYRA to the MCP's account if bigger schema work needs
  it — if they do, the MCP tools become usable; still keep migrations as files.)*
- **Run migrations/SQL via the pooler instead:** `node scripts/db.mjs migrate` /
  `node scripts/db.mjs sql "…"`. It uses `DATABASE_POOLER_URL` (Supavisor, port 5432). The
  direct `db.<ref>.supabase.co` host is IPv4-unresolvable from most networks — don't use it.
- **The app runtime** talks to Supabase over **HTTPS/PostgREST**, so it runs anywhere with
  outbound 443 — no direct Postgres needed at runtime.
- **Sandbox note:** the shell tool blocks outbound DB ports; the pooler still worked, but if a
  DB command hangs, re-run it with the sandbox disabled. HTTPS (npm, Supabase REST) is fine.
- **Dev server:** `npm run dev` → http://localhost:3010 (`.claude/launch.json` has a `veyra`
  config for the preview tool).
- **Signing in with a password:** an assistant bound by the standard safety rule **cannot type
  a password to authenticate even if the owner authorizes it** (it's a hard boundary, not a
  setting). Verify auth-dependent flows via `scripts/verify.mjs` (same provisioning/CRUD paths).
  To see the authed UI in the browser preview, **have the owner log in once in the preview tab** —
  after that you can navigate/click/screenshot the authenticated app without touching the password.

## 5. Codebase map

```
app/(auth)/            login page + auth server actions
app/(app)/             authed shell; layout gates on getViewer()
  leads/               ← REFERENCE SLICE: page.tsx, new/, [id]/, actions.ts
components/ui/         Button, Field, primitives (Card, StatusChip, EmptyState)
components/shell/      SideNav, TopBar
lib/env.ts             server-only validated env (guards the secret key)
lib/supabase/admin.ts  ⛔ secret client — import ONLY from lib/data
lib/supabase/auth-client.ts  SSR auth client (anon key + cookies) — auth only
lib/auth/session.ts    getUser / requireUser
lib/data/with-org.ts   ★ the org_id isolation accessor
lib/data/tables.ts     tenant-table allowlist
lib/data/context.ts    getViewer() (user + org for the shell)
lib/data/provisioning.ts  tenant onboarding
lib/data/leads.ts      ← reference data module (copy its shape)
lib/leads-model.ts     client-safe enums/types (no server-only) — pattern for shared types
lib/nav.ts leads-ui.ts utils.ts
supabase/migrations/   0001_foundation.sql
scripts/db.mjs         migration runner (pooler)   scripts/verify.mjs  e2e checks
middleware.ts          refreshes the auth session cookie
```

## 6. How to add a module (the pattern — full detail in ARCHITECTURE.md)

For each module (e.g. Quotations, Items, Procurement):
1. **Migration** `supabase/migrations/000N_<module>.sql` — tables with `org_id uuid not null`,
   indexes, **no RLS**. Apply with `node scripts/db.mjs migrate`.
2. **Allowlist** — add table names to `lib/data/tables.ts`.
3. **Client-safe model** `lib/<module>-model.ts` — enums/types with no `server-only` import
   (so client forms can share them). See `lib/leads-model.ts`.
4. **Data module** `lib/data/<module>.ts` — copy `lib/data/leads.ts`: every function opens
   `withOrg()` and goes through `db.table(...)`. **No raw `admin` import.** Prices via engine
   + validator, never an LLM.
5. **Server actions** `app/(app)/<module>/actions.ts` — `"use server"`, zod-validate input,
   call the data module, `revalidatePath`.
6. **Pages** `app/(app)/<module>/{page,new,[id]}.tsx` — use `components/ui` + the tokens,
   following DESIGN-DIRECTION.
7. **Nav** — flip `soon` off in `lib/nav.ts`.
8. **Verify** — extend `scripts/verify.mjs` with the module's isolation + business-rule checks;
   run `npm run typecheck && npm run build`.

## 7. How to receive and build the owner's NEW feature lists

The owner will send feature requirements incrementally. For each batch:
1. **Map to a module** in the FEATURE-REGISTER / PLAN. If it's new, name the module and note
   which industry-profile it belongs to (don't build 12 products — build config).
2. **Check the register first — then open the frames.** The Dzylo teardown probably already
   specs the screen (fields, columns, states, the schema it implies, and our verdict) in the
   register, and the matching **`competitor-research/source/frames/`** PNG shows it for real.
   Read the row **and look at the image** (Read tool renders PNGs). Reuse that; don't re-derive.
   Where the verdict is "adopt+", implement the **VEYRA delta**, not Dzylo's version. Layout may
   change and extra features are welcome — but do not drop a feature that's in the register/frame.
3. **Confirm scope with the owner** if a decision is genuinely theirs (e.g. own-factory vs
   job-work changes Production entirely — see the open questions in `requirements/README.md`).
   Otherwise state a sensible assumption, flag it, and proceed — don't stall.
4. **Build one slice at a time**, end to end (migration → data → actions → pages → verify),
   using the pattern in §6. Keep each slice shippable.
5. **Never break the §3 rules.** Every new table is org-scoped and reached via `withOrg()`.
6. **Port, don't rewrite, from INTERIOR** where the register says so: the quotation engine,
   the automation spine (`crm_events`→outbox), `upsertLeadByPhone`/`phone_key` dedupe (already
   applied in Leads), the `/q/<token>` share link, the consent gate. INTERIOR lives at
   `C:\Users\chait\Downloads\TOO MUCH\INTERIOR` (read `HANDOFF.md`, `AGENTS.md` there).

## 8. Suggested priority (from the register) — adjust to the owner's list

> **Progress (2026-08-21):** #2 **Item Master v1 DONE** and #3 **Quotation v1 DONE** —
> section-grouped BOQ, catalogue-ref lines (shadcn combobox → `searchItems`), per-line
> qty/UOM/rate/discount/GST, versioning, `/q/<token>` share page, cost roll-up + margin.
> Pricing engine (`lib/quotations-model.ts`) is pure + unit-tested against the Dzylo frame
> (`lib/quotations-model.test.ts`, vitest 7/7); e2e verify is **19/19**. INTERIOR's richer
> engine (measurement-mode qty derivation, rate components, GST modes, templates) is the
> **v2 roadmap**. Next candidates: CSV bulk item import (register P0 fast-follow),
> config/permission engine, Subscription/Trial (REQ-04).

1. **Config / permission engine** — `(module, action, data-scope)` + field-level visibility,
   module registry, tenant vocabulary, custom fields, numbering series. Wave-0 depth.
2. **Item master + UOM model** (PLAN §4) — the **highest-risk** piece; six modules depend on
   it. Variants, multi-UOM conversion, rate books, HSN/SAC. Spend disproportionate care here.
3. **Quotation** — port INTERIOR's engine; section-grouped BOQ, GST, versioning, share link,
   cost roll-up. The strongest asset and the money path.
4. **Subscription / Plans / Trial** (REQ-04) — append-only usage **ledger** (not a counter),
   org-scoped lifetime metering, per-seat licensing. Missing from PLAN-v0.1; the register has it.
5. Then Projects, Procurement (deeply specced by the teardown), Inventory, Production (the moat).

## 9. Commands

```bash
npm run dev         # http://localhost:3010
npm run build       # production build (run before declaring a slice done)
npm run typecheck   # tsc --noEmit
npx eslint app lib components   # lint incl. the no-raw-client guard
node scripts/db.mjs migrate     # apply migrations (pooler)
node scripts/verify.mjs         # e2e isolation/dedupe/CRUD vs real Supabase
```

## 10. What NOT to do

- Don't enable RLS or write policies. Don't import `lib/supabase/admin` outside `lib/data`.
- Don't let an LLM produce a price. Don't add a non-Claude AI provider without the owner's ok.
- Don't build the full frontend for all modules with mock data — build **real vertical
  slices**. Don't rebuild the foundation. Don't rename tables to `automations`.
- Don't rely on the Supabase MCP for VEYRA (wrong account). Don't use the direct `db.*` host.
- Don't over-plan: the owner prefers momentum. Read the register, pick the slice, build it,
  verify it, move on.

---

## 11. Current state, deployment & what's left (2026-08-21)

**DONE & verified (typecheck · lint · build · vitest 7/7 · verify.mjs 19/19 · manual click-through):**
- Wave-0 foundation (tenancy, auth+provisioning, design system, shell).
- **Leads** slice (CRUD, phone dedupe).
- **Item Master v1** (`app/(app)/items/*`, `0002_items.sql`) — catalogue, name/SKU dedupe, types, multi-UOM.
- **Quotations v1** (`app/(app)/quotations/*`, `app/q/[token]`, `0003_quotations.sql`,
  `lib/quotations-model.ts` pure engine) — section BOQ, catalogue-ref lines, live totals,
  discount/GST per line, versioning, share link, cost/margin. **Manually verified** against
  the seeded demo quote (grand total ₹1,65,511.52, matches the Dzylo frame math).
- **shadcn/ui** adopted + themed to tokens. **Git** initialized; pushed to
  `https://github.com/chaithanya812/VEYRA` (branch `main`).
- **DEPLOYED to Vercel (production, public):** project `veyra`
  (`chaithanya812s-projects/veyra`), latest URL
  `https://veyra-c79865288-chaithanya812s-projects.vercel.app`. Env vars set in Vercel
  (SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_JWKS_URL) — **production
  scope only**; add `preview`/`development` scopes if you want preview deploys to work.
  Deployment protection is OFF (public). Vercel CLI is logged in as `chaithanya812` — redeploy
  with `vercel --prod --yes`; env via `vercel env add NAME production`.
- **Demo tenant** seeded (`node scripts/seed-demo.mjs`): `demo@veyra.app` / `VeyraDemo!2026`.

**SECURITY TODO for the owner:** the raw Postgres password was previously in `CREDENTIALS.md`
and `scripts/probe-pooler.mjs` (now redacted before git init, so NOT in history) — **rotate
that DB password** in Supabase. `.env.local` (real keys) is gitignored and was never committed.

**NEXT (owner's queue, pick one and build a real slice):**
1. **CSV bulk item import** (register P0) — pairs with Item Master; makes the catalogue
   populatable at scale (Dzylo frame `CFG_08`).
2. **Config / permission engine** — `(module,action,scope)` + field-level visibility,
   numbering series (Indian FY), custom fields, tenant vocabulary.
3. **Subscription / Plans / Trial (REQ-04)** — append-only usage ledger, per-seat licensing.
4. Then Projects, Procurement (deeply specced by the teardown), Inventory, Production (the moat).
5. **Quotations v2** — port INTERIOR's richer engine (measurement-mode qty derivation, rate
   components, GST modes, templates/presets) + a PDF export for `/q/<token>`.

*PLAN-v0.2 (the deepened spec) still awaits the owner's promised "deep-detailed workflow draft
+ master development prompt" — when it lands, fold it in alongside the register, don't restart.*
