# HANDOFF V4 — paste this into a new session

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`

---

You are picking up VEYRA, a multi-tenant B2B ERP+CRM for the Indian construction / interior /
modular-furniture industry. Branch `quotations-v2-plus-fleet`.

## Read these four files completely before you touch anything

| File | What it is |
|---|---|
| `HANDOFF-V3.md` | How the codebase works — architecture, credentials, gates, hard rules. |
| `PLAN-V4.md` | **Your instruction set.** 13 phases, in order, each citing its source frames. |
| `FRAME-REGISTER-V4.md` | **The evidence.** One exhaustive entry per owner screenshot. |
| `competitor-research/DESIGN-DIRECTION.md` | The visual system. Governs every screen. |

The owner supplied 50 competitor screenshots in `temp folder 1/`, cited throughout by their
`HHMMSS` timestamp. **Before building any screen, read its entry in `FRAME-REGISTER-V4.md` AND open
the actual PNG.** The register is a reading aid, not a replacement. A previous session got frame
citations wrong by working from summaries instead of the images — do not repeat that.

The owner's standing instruction about those frames: **do not copy the UI.** Understand why every
box is there, keep the information, drop the density, add what is obviously missing.

### Ignore every other handoff file in the repo root

The root also contains `HANDOFF-V2.md`, `HANDOFF-NEXT.md`, `HANDOFF-PROMPT.md`,
`HANDOFF-BUILD-AGENT.md`, `HANDOFF-FLEET-AGENT.md`, `HANDOFF-WAVE4-QA.md` and `START-HERE.md`.
**All of them are superseded and several are actively wrong now** — they describe a login flow that
no longer exists, a Kanban pipeline that is being replaced, and an OpenCode sub-agent fleet you are
not using. Do not read them. The four files in the table above are the only current ones.

## Rules that do not bend

1. **RLS is OFF by owner decision.** Never enable it, never write a policy. `withOrg()` in
   `lib/data/with-org.ts` is the ONLY tenant guard. Every tenant table carries `org_id`, is
   registered in `lib/data/tables.ts`, and is reached only through `withOrg()`.
2. **No LLM ever produces a price, rate, cost, amount or quantity.** Models return structure only.
   A deterministic engine plus tenant config supplies every number. Log every call to `ai_requests`.
3. **Migrations are additive and idempotent**, with `org_id uuid not null references
   public.orgs(id) on delete cascade`. Next free number is **0026**. See the ledger in `PLAN-V4 §15`.
4. **Ledgers are append-only.** A reversal is a new row plus a filter, never a delete.
5. **Indian market:** GST (HSN/SAC, place-of-supply), Indian-FY numbering, ₹ Indian grouping, DPDP.
6. **Red keeps its closed list** of five jobs (`DESIGN-DIRECTION §2`). A sixth use is wrong.
   `PLAN-V4 §4` adds colour without touching red — follow it rather than inventing a palette.
7. **Server-action files export only async functions.** Secret keys stay server-side.
8. **Never push or deploy without the owner.** Local commits are fine.
9. **Do not use the Supabase MCP** — it is authenticated to a different account and every call
   fails. Use `scripts/db.mjs` (DDL via the pooler) and `scripts/verify.mjs` (PostgREST).
10. **Do not delegate** the `scope_items` spine, the vendor portal, or anything touching
    `with-org.ts` to sub-agents. Do those yourself.

## Out of scope (owner decision)

Client/customer portal · warranty module · telephony/dialer · WhatsApp API ingestion.
Calls and lead capture stay **manual**. But **do** build and honour the `client_visible` flags —
they drive the Progress Report, which is what actually reaches the client.

## Already done — do not redo

Phase 0 is partly complete. `git diff` shows two finished, gate-green changes:

- **`components/shell/view-as.tsx` — rewritten.** The "View as" picker was an uncontrolled
  `<select defaultValue>`; React applies `defaultValue` on mount only, so after the server action
  revalidated the layout the DOM kept the stale selection — the page said "Good morning, Rahul"
  while the picker still read "Meghana Rao". Replaced with an avatar + role popover driven by
  server props on every render. Fixes both the stale value and the owner's "too small" complaint.
- **`app/(app)/dashboard/workspace-ui.tsx` — `TabBar` rebuilt** as a segmented control
  (white card on sunken ground, red icon, red active underline). The owner rejected the old pills.
  **This component is reused by every module tab row in Phases 7–12 — do not fork it.**

`tsc --noEmit` and `eslint` are green on both.

## Start here

**Finish Phase 0** (`PLAN-V4 §1`), which is three small items:

1. `StatTile` in `workspace-ui.tsx` — the four dashboard tiles are flat identical grey with no
   hierarchy. Give tones real tinted backgrounds and let `hero` actually stand out.
2. `app/(app)/leads/[id]/lead-detail.tsx:642` —
   `<Disclosure label="New follow-up" defaultOpen={followUps.length === 0}>` collapses the form the
   moment one follow-up exists, so the screen reads "one and done". The owner reported this as
   "you can only create one". **It is not a data bug** — `follow_ups` has no unique constraint on
   `lead_id` and demo leads already carry two each. Replace the disclosure with a persistent
   `+ Add follow-up` primary opening a dialog.
3. Wrap the dashboard panels in Suspense so tiles stream instead of blocking on
   `getMyWorkspace()` + `getDashboard()`.

**Do NOT restructure the lead-detail tabs.** The owner considered it and explicitly said keep
Details · Follow-ups · Call logs · Activity · Location as-is.

**Then work `PLAN-V4.md` phases 1 → 12 in order.** The ordering is not cosmetic:

- Phase 2 builds eight components every later phase consumes. Build them once.
- Phase 3 sets the colour tokens every later screen uses.
- **Phase 6 is a hard gate on Phases 7–12.** `scope_items` was specified as "the architectural
  heart" and never built (`grep -r scope_item` returns zero across all 25 migrations), and eleven
  tables join projects by free text — `projectProfitability()` literally does
  `projects.name === payments.project_label`, so renaming a project empties its P&L. Every screen
  in Phases 7–12 sits on that join. **Do not build project modules before the spine.**
  Prove the spine with: approved quotation → draft Material Request. If that button is more than
  ~40 lines, the spine is wrong — stop and fix the spine.

## Definition of done, per phase

Re-run all five yourself. Never take a sub-agent's word for it.

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/next/dist/bin/next build
node scripts/verify.mjs
```

**`next build` passing does NOT mean the typecheck passes** — Next skips test files, and `tsc` was
silently red for several commits before it was caught. Run both. A shell proxy can swallow exit
codes; when a gate looks suspiciously clean, re-run in PowerShell and check `$LASTEXITCODE`.

Also per phase: every engine is a pure function in `lib/<x>-model.ts` **with tests**; every new
table is in `lib/data/tables.ts` and reached only through `withOrg()`; `scripts/verify.mjs` gains
org-isolation assertions for it; every screen is checked against its frame.

Baseline at handoff: tsc 0 · eslint 0 · vitest 267/267 · next build 56 routes · verify 77/77.

## Running it

```bash
npm run dev          # http://localhost:3010
```

Login is removed; the app opens straight into the demo tenant. **The dashboard lands you in as
"Aditi Pradhan", who owns no seeded work — it will look empty.** Use the View-as control and switch
to Rahul Verma or Meghana Rao to see populated data.

Migrations: `node scripts/db.mjs migrate` (you apply them, never a sub-agent).

## Ask the owner before building — do not guess

1. **Manager dashboard** — parked behind `TEAM_VIEW_ENABLED = false` in `workspace-shell.tsx`.
   The owner will specify its contents. **Do not design it unprompted, and do not delete the
   parked panels.**
2. **MB Sheets** — named in the competitor's nav but never shown in any frame. What goes in it?
3. **2D→3D AI renders** — the competitor's headline differentiator. In or out?
4. **Quotation 2.0** — is the project-scoped quotation view new, or a filter over the existing studio?
5. **Accounting export** ("Push to Zoho" equivalent) — wanted?
6. **Deploy** — nothing since `c163310` is live. Needs the owner's go plus the `AI_*` env vars in Vercel.

Work in order, commit locally per phase, and report what you actually ran.
