# HANDOFF V5 — VEYRA

**This is the current, authoritative handoff.** It supersedes `HANDOFF-V4.md`
and every other `HANDOFF-*.md` / `START-HERE.md` in the repo root. Those older
files describe a login flow that no longer exists, a Kanban pipeline that has
been replaced, and an OpenCode sub-agent fleet you are not using. **Do not read
them.**

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`
Branch: `quotations-v2-plus-fleet`

---

## 0. Read these four files completely before touching anything

| File | What it is |
|---|---|
| **`HANDOFF-V5.md`** *(this file)* | where the build actually is, and the rules |
| **`PLAN-V4.md`** | the instruction set — 13 phases, each citing its source frames |
| **`FRAME-REGISTER-V4.md`** | the evidence — one exhaustive entry per owner screenshot |
| **`competitor-research/DESIGN-DIRECTION.md`** | the visual system; governs every screen |

`HANDOFF-V3.md` is still accurate on *architecture* (the withOrg pattern, the
credentials, the per-module file shape) and is worth reading for that. Where it
disagrees with this file about **what is built**, this file wins.

The owner supplied 50 competitor screenshots in `temp folder 1/`, cited
throughout by their `HHMMSS` timestamp. **Before building any screen, read its
entry in `FRAME-REGISTER-V4.md` AND open the actual PNG.** The register is a
reading aid, not a replacement. A previous session got frame citations wrong by
working from summaries instead of the images — do not repeat that.

The owner's standing instruction about those frames: **do not copy the UI.**
Understand why every box is there, keep the information, drop the density, add
what is obviously missing.

---

## 1. Rules that do not bend

1. **RLS is OFF by owner decision.** Never enable it, never write a policy.
   `lib/data/with-org.ts::withOrg()` is the ONLY tenant guard. Every tenant
   table carries `org_id`, is registered in `lib/data/tables.ts`, and is reached
   only through `withOrg()`.
2. **No LLM ever produces a price, rate, cost, amount or quantity.** Models
   return structure only. A deterministic engine plus tenant config supplies
   every number. Log every call to `ai_requests`.
3. **Migrations are additive and idempotent**, with
   `org_id uuid not null references public.orgs(id) on delete cascade`.
   **Next free numbers: 0030, 0031, 0033–0036.** See §5.
4. **Ledgers are append-only.** A reversal is a new row plus a filter, never a
   delete.
5. **Projects never share anything.** A folder, a file, a milestone and a scope
   item each belong to exactly one project. See §4 — this is the owner's
   explicit instruction and it is enforced in three places.
6. Indian market: GST (HSN/SAC, place-of-supply), Indian-FY numbering,
   ₹ Indian grouping, DPDP.
7. **Red keeps its closed list of five jobs** (`DESIGN-DIRECTION §2`). A sixth
   use is wrong. `PLAN-V4 §4` adds colour without touching red — follow it.
8. Server-action files export only async functions. Secret keys stay
   server-side (`admin` is lint-restricted to `lib/data/`).
9. **Never push or deploy without the owner.** Local commits are fine.
10. **Do not use the Supabase MCP** — it is authenticated to a different account
    and every call fails. Use `scripts/db.mjs` (DDL via the pooler) and
    `scripts/verify.mjs` / `scripts/verify-storage.mjs` (PostgREST + Storage).
11. Do not delegate the `scope_items` spine, the vendor portal, or anything
    touching `with-org.ts` to sub-agents.

### Out of scope (owner decision)

Client/customer portal · warranty module · telephony/dialer · WhatsApp API
ingestion. Calls and lead capture stay manual. **But** build and honour the
`client_visible` flags — they drive the Progress Report, which is what actually
reaches the client.

---

## 2. Where the build is — Phases 0 to 8

Gates at HEAD, all re-run personally:

| Gate | Result |
|---|---|
| `node ./node_modules/typescript/bin/tsc --noEmit` | ✅ 0 |
| `node ./node_modules/eslint/bin/eslint.js app lib components` | ✅ 0 |
| `node ./node_modules/vitest/vitest.mjs run` | ✅ 426/426, 34 files |
| `node ./node_modules/next/dist/bin/next build` | ✅ 59 routes |
| `node scripts/verify.mjs` | ✅ 94/94 |
| `node scripts/verify-storage.mjs` | ✅ 8/8 |

Baseline when this run started: 267 tests · 56 routes · 77 verify.

**Do not rebuild any of the following.**

- **Phase 0** — StatTile tones (hero + semantic tints), the follow-up dialog
  (the old disclosure collapsed once one follow-up existed), dashboard
  streaming. `getDashboard()` no longer runs when nothing renders it.
- **Phase 1** — `lib/nav.ts` is a two-level accordion tree with
  longest-prefix matching, collapse-to-icons with flyouts, and module identity
  colours on the six group icons.
- **Phases 2–3** — the shared component set (`components/ui/patterns.tsx`:
  SegmentedControl, SegmentedCountBar, PlannedVsActual, MultiValueCell,
  ClientVisibleToggle, DateRangeControl; `comment-thread.tsx`; `charts.tsx`:
  AreaTrend, Donut, BarList) over four tested engines (`date-range`,
  `schedule-model`, `segments-model`, `comments-model`), plus the chart palette
  in `globals.css` and `lib/palette.ts`. **Reuse these. Do not write a second
  segmented control.**
- **Phase 4** — migration 0026: `follow_up_assignees`,
  `followup_outcome_rules`, `leads.external_ref`. Completing a follow-up now
  PROPOSES a status move and a follow-on date, preselected, and a person
  confirms. `/leads/insights` ships with five cards.
- **Phase 5** — `/pipeline` is a funnel over a grouped table with **days in
  stage**. `/pipeline/stages` is deleted; the real lead-status editor lives on
  `/settings/workspace`.
- **Phase 6 — THE SPINE.** Migrations 0027 (`scope_items` + `scope_item_id` on
  all six line tables) and 0028 (real `project_id` on twelve `project_label`
  tables). `projectProfitability()` reads the FK. The quote builder keeps scope
  items in step with lines and sections. **Proven live:** approved quotation →
  draft Material Request whose items each carry `scope_item_id`.
- **Phase 7** — the Milestones cell on `/projects`, the project Summary and
  Modules tabs, the composable Progress Report at `/projects/[id]/report`.
  Migration 0032: `project_milestones`, `project_milestone_deps`,
  `milestone_templates`.
- **Phase 8, partly** — `/projects/[id]/plan` (milestone editor with scope
  bands and templates) and `/projects/[id]/documents` (migration 0029 —
  `project_folders`, `project_files`, `project_file_versions`,
  `entity_comments`, plus the private storage bucket).

---

## 3. Two schema facts that will bite you if you don't know them

**`milestones` is NOT the delivery plan.** It has existed since 0015, hangs off
`contracts`, and carries `pct / amount / tentative_due / work_done /
actual_due` — it is the **payment** schedule (frame `105238`), the one that
becomes Account Receivables (`110534`). The **delivery** schedule (frame
`105010`) is `project_milestones`, added in 0032. Two schedules, two tables, on
purpose: merging them would mean a project's plan and its invoicing could never
disagree, and on a real site they always disagree. `verify.mjs` asserts they
stay separate.

**`project_label` is legacy but not dead.** Migration 0028 added real
`project_id` FKs to twelve tables and backfilled them, but the label column is
kept as a display fallback for rows that never resolved. Query
`v_project_label_unmatched` to see what did not match — currently 5 expense
claims naming projects that do not exist. **Read `project_id`; fall back to the
label only for display.**

---

## 4. Per-project isolation — the owner's explicit instruction

> *"if projects are increasing there should be independent folders — project 1
> and project 2 can't share the same folders."*

This is now enforced three times over, and **any new project-scoped module must
do the same**:

1. **Schema** — `project_id` is `not null` with a real FK; uniqueness is scoped
   to the project (`unique (project_id, name)`), so two projects may each own a
   folder called "2D" and they are different rows.
2. **Data layer** — `assertFolderBelongsToProject()` in
   `lib/data/project-files.ts` re-checks on create, upload and move. Never trust
   a `folder_id` from a form.
3. **Storage path** — `<org_id>/<project_id>/<file_id>/v<n>-<filename>`. One
   project's objects are not listable or fetchable from another's prefix even
   if a query above were mis-scoped.

`scripts/verify-storage.mjs` asserts all of it against the real bucket.

### The storage contract

- Bucket `project-files`, **private**, created idempotently on first use
  (`ensureBucket()` in `lib/data/storage.ts`) — a fresh Supabase project needs
  no console step.
- **Signed URLs only**, 10-minute expiry, minted server-side after `withOrg()`
  has proved ownership. Never a public URL. Never the secret key in the browser.
- MIME allowlist and a 25 MB cap in `lib/data/storage.ts`;
  `next.config.ts` raises `serverActions.bodySizeLimit` to 26mb to match. **If
  you change one, change the other.**
- **Versions are rows, never overwrites.** Each version is its own key. Upload
  writes the row first (so the key can embed the real file id) and rolls the row
  back if the object fails to land.

---

## 5. Migration ledger

Applied: **0001–0029, 0032.**

| # | Contents | § | Status |
|---|---|---|---|
| 0026 | `follow_up_assignees`, `followup_outcome_rules`, `leads.external_ref` | 5 | ✅ applied |
| 0027 | `scope_items` + `scope_item_id` on six line tables + backfill | 7.2 | ✅ applied |
| 0028 | real `project_id` FKs on twelve `project_label` tables + backfill | 7.3 | ✅ applied |
| 0029 | `project_folders`, `project_files`, `project_file_versions`, `entity_comments` | 9.1 | ✅ applied |
| **0030** | `project_contracts`, `contract_milestones`, `contract_documents` | 9.3 | free |
| **0031** | `labour_entries`, `labour_entry_categories`, `labour_entry_vendors` | 9.6 | free |
| 0032 | `project_milestones`, `project_milestone_deps`, `milestone_templates` | 9.2 | ✅ applied |
| **0033** | warehouse `kind` + `project_id`; GRN auto-numbering | 10.2 | free |
| **0034** | `wfh_requests`, `holidays` | 11.1 | free |
| **0035** | `audit_events`; permission enforcement columns | 11.3–11.4 | free |
| **0036** | material-request **per-line stage** model | 9.7 | free |

0032 was applied out of numeric order because Phase 7 needed it. That is fine —
the runner applies by filename, so a fresh database still gets 0029→0036 in
order once the gaps are filled. **Do not renumber.**

---

## 6. What to build next, in order

### Phase 8, the rest (`PLAN-V4 §9`)

1. **§9.1 finish** — the file *viewer* (frame `104841`): full-pane render,
   version selector, INTERNAL/CLIENT threads via `EntityCommentThread` (the
   component already exists), filter chips, numbered pins on the document.
   `entity_comments` already carries `version_id`, `page`, `x`, `y`.
2. **§9.2 finish** — Gantt Chart and Tasks tabs, and **SmartPlan** (AI proposes
   milestone names + day offsets **only**; dates computed deterministically —
   `applyMilestoneTemplates()` is the pattern to follow. Log to `ai_requests`).
3. **§9.3 Financial Planning** — migration 0030. Inflow/outflow contracts, the
   two-way percent↔amount binding, the "total must be 100%" rule, and
   `Actual Due` materialising only when `Work Done` is ticked.
4. **§9.4 Project Payments** — Listing/Analytics, separate Transaction and
   Recorded dates, reversals as a filter not a delete.
5. **§9.5 Site Progress Uploads** — reuse the §9.1 storage layer and
   `client_visible`.
6. **§9.6 Labour Report** — migration 0031.
7. **§9.7 Project Procurement** — migration 0036, the per-line stage model.
   Much of this exists already (`rfq`, `purchase_orders`, `po_lines`); re-point
   it at `project_id` and `scope_items` rather than rebuilding.

Then Phases 9–12 (`PLAN-V4 §10–§13`).

### Ask the owner before building

- **MB Sheets** and **2D → 3D renders** — the owner said *"just keep them but
  don't add any functionality"*. They appear in the rail and the Modules grid
  marked "soon". **Leave them inert until there is a spec.**
- **Manager dashboard** — parked behind `TEAM_VIEW_ENABLED = false` in
  `workspace-shell.tsx`. Do not design it unprompted; do not delete the parked
  panels.
- **Quotation 2.0** — is the project-scoped quotation view new, or a filter over
  the existing studio?
- **Accounting export** ("Push to Zoho" equivalent) — wanted?
- **Deploy** — nothing since `c163310` is live. Needs the owner's go plus the
  `AI_*` env vars in Vercel.

---

## 7. Definition of done, per phase

Re-run all six yourself. **Never take a sub-agent's word for it.**

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/next/dist/bin/next build
node scripts/verify.mjs
node scripts/verify-storage.mjs
```

`next build` passing does **NOT** mean the typecheck passes — Next skips test
files. Run both. A shell proxy can swallow exit codes; when a gate looks
suspiciously clean, re-run it in PowerShell and check `$LASTEXITCODE`.

Also per phase:
- Every engine is a pure function in `lib/<x>-model.ts` **with tests**.
- Every new table is in `lib/data/tables.ts` and reached only through
  `withOrg()`.
- `scripts/verify.mjs` gains org-isolation assertions for it — and, for anything
  project-scoped, **project-isolation assertions too**.
- Every screen is checked against its `FRAME-REGISTER-V4.md` entry *and the
  actual PNG*.
- Red discipline audited (`PLAN-V4 §4.4`).

---

## 8. Running it

```bash
npm run dev          # http://localhost:3010
```

Login is removed; the app opens straight into the demo tenant. The dashboard
lands you in as **Aditi Pradhan**, who owns no seeded work — it will look empty.
Use the **View as** control (top bar) to switch to **Rahul Verma** or **Meghana
Rao** for populated data.

```bash
node scripts/db.mjs migrate            # YOU apply migrations, never a sub-agent
node scripts/db.mjs sql "<query>"
```

**Demo data worth knowing about:** the demo project *Malviya Nagar 3BHK* carries
a seeded 12-milestone plan (3 completed, 7 client-visible) so the Milestones
cell, the Summary band and the Progress Report have something honest to show.
One demo quotation is set to `approved` so the **Raise material request** button
is visible, and the material request it produced is in `/procurement`.

### Verifying UI in this environment

The in-app browser pane could not complete React's streaming swap-in — every
route stalls on its loading skeleton, including routes nobody had touched, and
screenshots time out. Server-rendered HTML is fine, so the reliable check is:

```bash
node -e "fetch('http://localhost:3010/projects').then(r=>r.text()).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').slice(0,2000)))"
```

Server **actions** can be exercised over HTTP without a browser, because Next
renders real POST forms: fetch the page, pull the `$ACTION_ID_<hash>` hidden
input out of the form's HTML, and POST it back as `FormData`. That is how the
quotation → material request path was proven end-to-end. Note this does **not**
work for forms inside a Radix dialog — those are not in the server HTML until
opened.

---

## 9. Things a previous session got wrong — don't repeat them

- **A misleading error message cost an hour.** A lookup selected a column that
  did not exist, PostgREST errored, and the handler collapsed that into "not in
  this workspace" — which reads like a tenancy bug. **Report a query error as
  itself.**
- **A PostgREST bulk insert sends an explicit NULL** for a key that one row in
  the batch omits, defeating the column default and tripping `not null`. Batch
  rows need uniform keys.
- **`scope_items.parent_id` cascades on delete.** Deleting a quotation section's
  scope parent would delete the scope of every line under it — lines that
  survive as "ungrouped". `deleteSection()` detaches children first;
  `verify.mjs` asserts the cascade so nobody "simplifies" that away.
- **Backfills that match on a name plus a sort order mislink.** 0027's first cut
  linked 3 of 8 lines. Carrying the origin id in `code` (`QL:<id>`) made it
  exact and re-runnable.
- **A percentage without its denominator is not trustworthy.** Every ratio in
  this codebase travels with the two numbers it came from.
- **Demo data can lie.** Six leads carried statuses from a pre-0024 ladder, so
  the funnel appeared to have twice the stages it has. The model now flags any
  status that is not a row in `lead_statuses` rather than rendering it as a
  stage.
