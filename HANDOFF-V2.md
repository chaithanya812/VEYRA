# HANDOFF V2 — VEYRA (orchestrator + review-gate + fleet builder)

> **This is the current, authoritative handoff. It supersedes `HANDOFF-NEXT.md`,
> `HANDOFF-FLEET-AGENT.md`, `HANDOFF-PROMPT.md`, `HANDOFF-BUILD-AGENT.md`,
> `HANDOFF-WAVE4-QA.md`, `START-HERE.md`.** Read it fully before touching anything.
> Your working directory (the repo) is:
> `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`

---

## 0. READ THIS FIRST — the #1 lesson (design)

The owner has a **feature register with 116 real screenshots** of exactly how each
screen should look and behave. Prior AI sessions **ignored the visuals and shipped
generic "AI slop" UI the owner does not want.** Do NOT repeat that.

- **The design is NOT yours to invent.** Before building or changing any screen,
  OPEN the matching frames in `competitor-research/source/frames/video-01|02/`
  and read the matching rows in `competitor-research/FEATURE-REGISTER.md` +
  `competitor-research/analysis/*.md`. Build to *those*, not to your taste.
- The owner's current priority is **ARCHITECTURE, not pixels** — solid data model,
  migrations, engines, tenant isolation, server logic. The UI is expected to be
  reworked heavily later, so keep screens as thin, correct scaffolds over a strong
  backend. When in doubt, invest in the model/data/engine layer, not styling.
- `competitor-research/DESIGN-DIRECTION.md` still governs tokens/red-discipline
  (white bg, near-black text; **red is a reserved accent** — one primary action per
  view, active nav, destructive, genuine alert, one hero metric; status = green/
  amber/grey **with a label**, never decorative red).

---

## 1. PRIME DIRECTIVES

1. **Never trust a sub-agent's "done".** Re-run the gates yourself; always `npm run build`.
2. **Build to the owner's feature register + frames**, not to invented design (see §0).
3. **Don't rebuild what ships.** ~22 modules exist (see §3). Check reality first:
   `git log --oneline -12`, `git status`, `npm run build`, `node scripts/verify.mjs`.
   Never trust a number in a doc over what git + the gates actually show.
4. **Ask the owner before pushing, deploying, or any outward/destructive action.**
   Building + local commits are fine. (Deploy was authorized once and is live; ask again.)

---

## 2. WHAT VEYRA IS

Multi-tenant **B2B SaaS ERP+CRM for the Indian construction / architecture / interior /
modular-furniture industry.** Full journey: lead → quotation/estimation → procurement →
inventory → project execution → site → finance/billing → handover, per-industry
configurable, multi-company from day one.

Competitor = **Dzylo** (torn down frame-by-frame in `competitor-research/`). VEYRA matches
Dzylo's CRM+projects+procurement+finance surface AND wins on the half Dzylo lacks: the
**factory/production moat** (BOM → cutlist → nesting → panel-QR traceability) and
**site-measurement variance**. Both wedges now have real foundations (see §3).

---

## 3. CURRENT STATE (what's DONE — do not rebuild)

- **Branch:** `quotations-v2-plus-fleet`. **HEAD:** `2c0eaa4` (Measurement-mode wiring).
  Run `git log --oneline -14` for the true log.
- **Live prod:** https://veyra-five-beta.vercel.app (Vercel project `veyra`, CLI authed
  `chaithanya812`, functions pinned to **`icn1`/Seoul** via `vercel.json`, co-located with DB).
  The live deploy contains everything **through `8830b0c`**; the **measurement-mode commit
  `2c0eaa4` and the pending Production-nesting work are NOT deployed yet** — redeploy after
  merging nesting (owner's go).
- **Supabase:** project ref `vjupynmjzpdzrluwctzd`. **RLS is OFF by owner decision — never
  enable it or write policies.** Migrations `0001–0020` + `0022` applied to the live DB.
  (`0021` is the in-flight Production-nesting migration — see §9, not yet merged/applied.)
- **Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4,
  Supabase over PostgREST, vitest. ~60 routes, **196 unit tests**, **`verify.mjs` = 63/63**
  green vs real Supabase, `npm run build` green, eslint clean.
- **22 nav modules** (`lib/nav.ts` = source of truth): Dashboard · Leads · Pipeline ·
  Follow-ups · Communication · Quotations · Items · Vendors · Projects · Procurement(MR) ·
  RFQ · Orders(PO) · Inventory · Design · Site · **Production (BOM+Cutlist — now live)** ·
  Finance · Billing · Approvals · Reports · Settings.

### What this session added (commits `a54ff99` → `2c0eaa4`)
- **Perf:** per-request auth/org lookups deduped with React `cache()` (a page did ~32 serial
  auth+org round-trips → now 2); route-group `loading.tsx` skeletons; `vercel.json` region
  pin to Seoul. This was the fix for "everything feels slow."
- **Production module (Wave 5a):** BOM explosion + Cutlist — migration 0020, `lib/production-model.ts`
  (pure, 15 tests), `lib/data/production.ts`, `app/(app)/production/`. Flips Production nav live.
- **Measurement-mode wedge (OPS-EST-002):** `lib/measurement-model.ts` (pure, 12 tests) +
  wired into the quotation builder — a line derives qty from dimensions (area/elevation/linear/
  count/lumpsum) with a visible formula; manual override wins; server re-derives before
  `computeLine` (never client, never LLM). Migration 0022.
- **Verified bug fixes (from a 4-worker audit sweep):** Kanban board no longer drops
  `new/qualified/quoted` leads (status↔stage vocab mismatch); `deleteSection` no longer
  orphans lines; usage metering was dead code + the read-only gate was ornamental — both now
  enforced (`guardMeteredCreate` wired into `createQuotation`); RFQ award blocked with zero
  bids; a route `error.tsx` boundary; decorative-red cleanup on 12 nav links + 5 checkboxes.

---

## 4. CREDENTIALS & INFRASTRUCTURE (the tools/passwords we use)

**Demo tenant (for testing the app):**
- Login `demo@veyra.app` / `VeyraDemo!2026` — org id `d46a53af-58b1-4ed7-87be-c675e5803802`.
- Seed/refresh demo data (idempotent): `node scripts/seed-demo.mjs`.
- ⚠️ **A Claude agent cannot type a password into a login field** (hard safety limit that does
  not lift even for a demo the owner authorizes). To do authed browser click-throughs, the
  **owner logs in once** in the preview, then the agent drives it. For automated proof use
  `node scripts/verify.mjs` (server-side, real DB) — that needs no login and is the primary gate.

**Supabase (project `vjupynmjzpdzrluwctzd`, RLS OFF):**
- All keys live in **`.env.local`** (root) and are documented in **`CREDENTIALS.md`**:
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (auth only — never table reads from the browser),
  `SUPABASE_SECRET_KEY` (**server-only**, full DB access), `SUPABASE_JWKS_URL`,
  `DATABASE_URL` (direct, **no longer resolves** — Supabase dropped direct IPv4),
  `DATABASE_POOLER_URL` (the working DDL path). **Never embed the secret key anywhere; never
  give a worker the real `.env.local` or `CREDENTIALS.md`.**
- **DO NOT USE the Supabase MCP.** The connected MCP is a *different account* than this project,
  so every MCP call (apply_migration AND execute_sql) returns "no permission." The ONLY DB path
  is the keys in `.env.local` via `scripts/db.mjs` (DDL/SQL, pooler) and `verify.mjs`
  (reads/isolation over PostgREST/HTTPS). PostgREST keeps working during a pooler outage.
- The pooler (`...pooler.supabase.com:5432`) occasionally throws transient
  `(EAUTHQUERY) auth_query secret check timed out` / `Connection terminated` — **retry**, it
  clears in minutes. `db.mjs` has **no migration-tracking table** — it re-runs all
  `if-not-exists` files every time, so re-running is always safe.

**Vercel:** project `veyra`, linked in `.vercel/`, CLI authed as `chaithanya812`. Deploy with
`npx vercel --prod --yes` (owner's go only). `vercel.json` pins functions to `icn1` (Seoul).

**AI (product):** REQ-01 = **Claude-only for the product's AI features** (e.g. prompt-to-BOQ).
`GEMINI_API_KEY` in `.env.local` is only for the competitor-video analysis tooling, not product.

---

## 5. THE FLEET — OpenCode sub-agents (how you parallelize)

Headless `opencode run` workers, each in its own isolated sibling dir with **dummy DB creds**
and its own git. They CANNOT touch the real DB, migrate, verify, or push — **only you do that.**

**Paths (NOT inside the repo — one level up in `RESEARCH 2`):**
- Dispatcher: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\fleet-subagents\fleet-dispatch.mjs`
- Worker dirs (5, pre-set-up): `...\RESEARCH 2\VEYRA-worker` … `VEYRA-worker5`
- Protocol doc: `...\RESEARCH 2\fleet-subagents\CLAUDE.md`

**Models (Zen free tier — pick per reliability, learned this session):**
- `opencode/hy3-free` — **most reliable**; use for audits + when x-preview is flaky.
- `opencode/x-preview-f-free --variant max` ("Ox Alpha") — strongest for real builds, but
  prone to transient `APIError: Provider finish_reason: network_error` (writes nothing → just
  reroll; no `git reset` needed since the dir is unchanged).
- `opencode/big-pickle` — second lane. ⚠️ **NEVER `opencode/ox-alpha-free`** (dead id, Zen 400s).
- Policy: retry a failed dispatch; after 2 fails on a model, switch lane. Keep ~4–5 in flight.

**Dispatch (run from the `RESEARCH 2` folder):**
```
cd "C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2"
node fleet-subagents/fleet-dispatch.mjs --dir "...\VEYRA-worker" --model opencode/x-preview-f-free --variant max --brief-file WORKER-TASK.md --write --timeout 1800 --quiet
```
Read-only audits: drop `--write` (or brief it to write ONLY `AUDIT-REPORT.md`). The dispatcher
returns a **structured JSON manifest** (files written/edited, bash runs, tool errors, timeout/
error flags) — trust the manifest, not the model's prose.

**Per-wave worker prep (PowerShell; robocopy exit ≤7 = success):**
```
robocopy "...\VEYRA CRM" "...\VEYRA-worker" /E /XD node_modules .git .next frames .vercel /XF .env.local tsconfig.tsbuildinfo CREDENTIALS.md WORKER-TASK.md .fleet-manifest.json /NFL /NDL /NJH /NJS /NP
git -C "...\VEYRA-worker" add -A
git -C "...\VEYRA-worker" -c user.email=fleet@veyra.local -c user.name=fleet commit -q -m "baseline before <task>"
```
Then write a HARD `WORKER-TASK.md` (see §6) and dispatch.

**REVIEW GATE (yours — do ALL of it, in the repo, per worker):**
1. Read the manifest (`ok`, `wroteAnything`, `toolErrors`). A timeout/Zen error often STILL
   wrote every file — gate it rather than reroll blindly.
2. `git -C <worker> status --porcelain` (new files are untracked → not in `diff HEAD`) and READ
   every new file. Enforce **file-ownership** (reject edits outside the declared set +
   `tables.ts`/`nav.ts`). Check: `withOrg()` only, no-LLM pricing, design tokens/red discipline,
   additive+idempotent+`org_id` migration, meaningful tests, server-action files export only async fns.
3. Copy reviewed new files into the repo; **hand-merge** the `tables.ts` + `nav.ts` additions
   (workers branch from the same baseline so those two files collide — apply only added lines).
4. Re-run in the repo: `tsc --noEmit` · `vitest run` · `eslint app lib components` · **`npm run build`**.
5. **You** apply the migration (`node scripts/db.mjs migrate`), then extend + run `verify.mjs`.
6. Commit per wave (local). Push/deploy only on owner's go.

**Gotcha:** a shell proxy (RTK) can hide real output. If a gate looks off, run binaries directly:
`node ./node_modules/typescript/bin/tsc --noEmit`, `node ./node_modules/vitest/vitest.mjs run`,
`node ./node_modules/eslint/bin/eslint.js app lib components`, `node ./node_modules/next/dist/bin/next build`.

**Writing a HARD brief** (free models drift): tell it to READ the refs first (`ARCHITECTURE.md`,
`lib/data/with-org.ts`, `lib/data/site.ts` as the reference module, `lib/site-model.ts`+test, a
recent migration like `0020_production_bom_cutlist.sql`, `DESIGN-DIRECTION.md`); list EVERY
deliverable file; embed the hard rules (§8); assign a distinct migration number (next free =
**0023**, plus reserve **0021** for the in-flight nesting merge); allow editing ONLY its new files
+ `tables.ts` + `nav.ts`; FORBID build/dev/migrations/scripts/git/push; end with
"print FILES-CHANGED then STATUS: done".

---

## 6. ARCHITECTURE (the patterns every module follows)

- **Tenant isolation (load-bearing, since RLS is OFF):** `lib/data/with-org.ts` `withOrg()` is
  the ONLY guard. Every tenant table has `org_id`, is listed in `lib/data/tables.ts`
  (`TENANT_TABLES`), and is reached ONLY through `withOrg()` (auto-filters reads by `org_id`,
  auto-stamps inserts, scopes updates/deletes by `org_id`+`id`). Platform tables (`orgs`,
  `app_users`, `plans`) are in `PLATFORM_TABLES`, read via the `admin` client **only inside
  `lib/data/*`** (a lint rule enforces this). `getUser`/`getOrgContext` are `cache()`d per request.
- **No LLM ever produces a price/qty/amount.** Rates are config the user enters; a **pure engine**
  computes (`computeLine`, `landedLineTotal`, `variancePct`, `resolveQty`, `nestPanels`, …); a
  validator verifies. Every `lib/*-model.ts` is client-safe (no `server-only`) and unit-tested.
- **Per-module shape:** `lib/<x>-model.ts` (+ `.test.ts`) pure types/engine · `lib/data/<x>.ts`
  (`"server-only"`, all via `withOrg()`) · `app/(app)/<x>/actions.ts` (`"use server"`, only async
  exports; a `type FormState` export is fine) · `app/(app)/<x>/page.tsx` + client forms.
- **Migrations:** additive + idempotent only (`create table if not exists`, `add column if not
  exists`, `create index if not exists`); `org_id uuid not null references public.orgs(id) on
  delete cascade` on every tenant table; header comment in the `0019/0020` style. Never a table
  named `automations`.
- **Indian market:** GST (HSN/SAC, place-of-supply, works-contract), Indian-FY doc numbering,
  ₹ Indian grouping (1,00,000), DPDP. Ledgers are append-only (inventory stock is a *projection*
  Σ signed qty, never a counter; usage_events; payments).

---

## 7. FOLDER MAP

```
VEYRA CRM/
├─ app/
│  ├─ (app)/                     # authed shell (layout.tsx, loading.tsx, error.tsx)
│  │   ├─ dashboard leads pipeline followups communication quotations items
│  │   ├─ vendors projects procurement rfq orders inventory design site
│  │   ├─ production                # BOM + Cutlist (nesting/panel-QR pending merge)
│  │   ├─ finance billing approvals reports settings
│  │   └─ <module>/{page.tsx, actions.ts, *-form.tsx, [id]/…}
│  ├─ (auth)/                    # login
│  └─ q/[token]/                 # public tokenized quotation share
├─ lib/
│  ├─ data/                      # server-only data modules — ALL via withOrg()
│  │   ├─ with-org.ts  tables.ts  context.ts  provisioning.ts  dashboard.ts  reports.ts
│  │   └─ <module>.ts  (leads, pipeline, quotations, rfq, purchase-orders, inventory,
│  │                    finance, subscription, production, site, …)
│  ├─ <module>-model.ts (+ .test.ts)   # pure engines/types (client-safe, no LLM)
│  ├─ measurement-model.ts  production-model.ts  quotations-model.ts (pricing engine) …
│  ├─ auth/session.ts   supabase/{admin,auth-client}.ts   nav.ts   utils.ts   env.ts
├─ components/ui/                # button dialog field select input badge … (shadcn-style)
├─ components/{shell, reports}/  interaction-timeline.tsx  download-quote-button.tsx
├─ supabase/migrations/          # 0001…0020, 0022 (0021 = nesting, pending)
├─ scripts/db.mjs (migrate|sql|file)  verify.mjs (e2e vs real DB)  seed-demo.mjs
├─ competitor-research/          # ← THE DESIGN SOURCE OF TRUTH (see §0)
│   ├─ FEATURE-REGISTER.md       # the backlog + coverage matrix
│   ├─ DESIGN-DIRECTION.md       # tokens + red discipline
│   ├─ analysis/*.md             # procurement + operations/CRM teardowns
│   └─ source/frames/video-01|02 # 116 real screenshots of how it should look
├─ prior-work/PLAN-v0.1.md       # the original product plan (Production spec = §6.6)
├─ ARCHITECTURE.md  CREDENTIALS.md  vercel.json  .env.local (secrets — not for workers)
└─ HANDOFF-V2.md (this file, authoritative)  + older HANDOFF-*.md (superseded)
```

---

## 8. HARD RULES (enforce on yourself AND every worker diff)

RLS OFF (never enable). `withOrg()` is the only tenant guard; `admin` only inside `lib/data/*`.
No LLM produces a price/qty/amount. Claude-only for product AI (REQ-01). Migrations additive +
idempotent with the `org_id` FK. Indian GST/FY/₹/DPDP. Secret key server-only; never to workers.
Server-action files export only async fns. Don't push/deploy without the owner. Don't rebuild the
shipped modules — extend/fix them. **Build screens to the owner's frames, not invented design.**

---

## 9. THE BACKLOG (ordered; build one-by-one, fleet where disjoint)

> Wave 5 is **deferred by the owner** — do not start it now.

**In flight (finish first):**
- **Production nesting + panel-QR + work centers** — a fleet worker (`VEYRA-worker`, model
  `x-preview-f-free --variant max`) was dispatched with a full brief (`WORKER-TASK.md` in that
  dir). Migration **0021**. On completion: review-gate → merge (owns `app/(app)/production/*`,
  `lib/production-nesting-model.ts`, `lib/data/production-nesting.ts`, +`tables.ts`) → apply 0021
  → extend `verify.mjs` → commit. If it failed with a Zen network_error, reroll on hy3-free.

**Wave 2 (remaining):**
- **Smaller-gaps sweep:** RFQ award → auto-create draft PO(s) · 3-way match (PO↔GRN↔bill) ·
  discount/threshold approval wired to the Approval engine · cost roll-up beside quoted price on
  quotations · inter-site stock transfers. (These edit shipped `rfq`/`orders`/`quotations`/
  `inventory` data modules — do serially / carefully, not in parallel with each other.)

**Wave 3 (differentiators — build the sensitive parts yourself, not free models):**
- **AI prompt-to-BOQ** — Claude-only; AI structures scope (rooms→items→qty/uom), the **engine
  prices**, a validator verifies, metered via `guardMeteredCreate`/`recordUsage` (REQ-04).
- **OTP vendor portal** — public tokenized RFQ page (reuse `/q/[token]` pattern), email/WhatsApp
  OTP, vendor enters HSN+GST rates per line → feeds `rfq_bids`/`rfq_bid_lines`. Token→org
  resolution must be watertight (unauthenticated path — security-critical).

**Wave 4 (hardening — verified audit gaps, fleet-friendly):**
- Server actions swallowing `{error}` (leads + quotations) → surface them.
- Extend metering to the other create paths (projects/items/designs/boqs/cutlists/exports).
- Inventory **stock-out / issue / inter-site transfer** action (only stock-in exists → the
  negative-stock alert is currently unreachable) + GRN auto-numbering (`grn_no` is null).
- Lead KPIs / 360° lead fields / public lead-capture form; RFQ L3 highlight; MR stage guards;
  quotation-number race (non-atomic seq).

**Deferred (Wave 5 — owner said later):** audit log · comments/@mentions/activity feed ·
automation & notification outbox + rule builder · field-level visibility (cost-hidden BOQ) +
doc branding/PDF templates · customer portal.

---

## 10. COMMANDS

```
npm run dev                       # http://localhost:3010 (dev = slow by nature; not prod-representative)
npm run build                     # MANDATORY in review
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/eslint/bin/eslint.js app lib components
node scripts/db.mjs migrate       # YOU apply migrations (pooler; retry on transient timeout)
node scripts/db.mjs sql "<query>" # ad-hoc SQL via the pooler
node scripts/verify.mjs           # e2e isolation/business-rule checks vs real Supabase (63/63)
node scripts/seed-demo.mjs        # idempotent demo tenant
npx vercel --prod --yes           # deploy (owner's go only)
```

## 11. WHAT NOT TO DO
Don't trust worker self-reports. Don't skip `npm run build`. Don't let a worker migrate/verify/
touch the real DB/push, and never give it the real `.env.local`/`CREDENTIALS.md`. Don't use the
Supabase MCP (wrong account). Don't enable RLS. Don't let an LLM produce a price/qty. Don't push/
deploy without the owner. Don't rebuild shipped modules. **Don't invent UI — build to the frames.**
