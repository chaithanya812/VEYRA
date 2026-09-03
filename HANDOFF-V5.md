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
   **Next free numbers: 0033–0035, then 0039+.** 0030, 0031, 0032, 0036, 0037
   and 0038 are applied. See §5 — and note 0030 is NOT what `PLAN-V4 §15` reserved.
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

## 2. Where the build is

**State at this handoff: Phases 0–8 complete.** Phase 8 is finished — §9.1
through §9.7 are all built. The next unbuilt thing is **Phase 9** — go to §6.

Gates at HEAD, all re-run personally in PowerShell with
`$LASTEXITCODE` checked. Every number below was verified at this commit, not
carried over from a previous handoff:

| Gate | Result |
|---|---|
| `node ./node_modules/typescript/bin/tsc --noEmit` | ✅ 0 |
| `node ./node_modules/eslint/bin/eslint.js app lib components` | ✅ 0 |
| `node ./node_modules/vitest/vitest.mjs run` | ✅ 560/560, 39 files |
| `node ./node_modules/next/dist/bin/next build` | ✅ 63 page routes |
| `node scripts/verify.mjs` | ✅ 142/142 |
| `node scripts/verify-storage.mjs` | ✅ 11/11 |

Baseline when the Phase 0–8 run started: 267 tests · 56 routes · 77 verify.
Baseline when the Phase 8 completion run started: 426 tests · 57 pages · 94 verify.
Baseline when §9.5 started: 501 tests · 60 pages · 116 verify · 8 storage.
Baseline when §9.6 started: 520 tests · 61 pages · 124 verify · 11 storage.
Baseline when §9.7 started: 544 tests · 62 pages · 135 verify · 11 storage.
(The earlier "34 files" and "59 routes" were miscounts — vitest reports test
*files*, of which there were 33, and the build's route list carries entries that
are not `page.tsx` files. Counting `page.tsx` is unambiguous, so this table now
does that.)

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
- **Phase 8 — COMPLETE. §9.1 through §9.7 are DONE.**
  - `/projects/[id]/documents` — the browser (migration 0029: `project_folders`,
    `project_files`, `project_file_versions`, `entity_comments`, plus the
    private storage bucket).
  - `/projects/[id]/documents/[fileId]` — **the viewer** (`104841`). Full-pane
    render, version selector, INTERNAL/CLIENT threads, filter chips, Accept /
    Not required / Reopen, replies, and **numbered pins placed by clicking the
    drawing**. Pins are fractions of the page, not pixels. Rails: Comments ·
    Versions · Audits.
  - `/projects/[id]/plan` — three tabs, **Milestone · Gantt chart · Tasks**,
    plus the Dates and Progress cards, `Add scope`, a real dependency editor
    over `project_milestone_deps`, and **SmartPlan**.
  - Engines: `lib/gantt-model.ts` (12 tests), `lib/smartplan-model.ts`
    (14 tests), pins in `lib/comments-model.ts`.

  - `/projects/[id]/finance` — **Financial Planning** (§9.3). Inflow ·
    Outflow · Documents, the two-way percent↔amount binding, the
    100%-or-refuse rule, and Actual Due materialising only on Work Done.
  - `/projects/[id]/payments` — **Project Payments** (§9.4). Expenses · Funds,
    each with Listing and Analytics, and reversals as a filter.
  - `/projects/[id]/site` — **Site Progress Uploads** (§9.5). Date-grouped
    grid, the three tabs with counts, per-photo `Client chat`, hover
    expand/delete, a per-card VISIBLE/HIDDEN switch and a bulk bar. Migration
    0038 extends `site_photos`; the bytes go into the SAME private bucket under
    `<org>/<project>/<photo>/photo-<name>`. Engine: `lib/site-photos-model.ts`
    (15 tests). **Two things to know.** (1) The frame groups by *upload* date;
    we group by `taken_on`, the day the work was photographed, because a Friday
    photo uploaded on Monday belongs under Friday — the card still shows when
    it landed when the two differ. (2) `client_visible` now actually reaches
    the Progress Report: `reportPhotoCount` / `withheldPhotoCount` mean "All
    site progress" and "Client visible only" are two different numbers, and the
    preview and the PDF read the same two functions.
  - `/projects/[id]/labour` — **Labour Report** (§9.6). Overview · Analytics,
    the header strip, the searchable multi-selects and the stepper dialog from
    `105638`, four `Chart | Table` breakdowns, a per-row VISIBLE/HIDDEN switch
    and an attachment that is a project file. Migration 0031; engine
    `lib/labour-model.ts` (24 tests).
    **Three things to know.** (1) **There is no `total` column and there must
    never be one** — `verify.mjs` asserts that `select total` FAILS. So
    34 + 25 + 12 = 71 is true by construction, not by discipline. (2) **The
    by-trade and by-vendor slices can sum past the headcount**, because a day
    tagged with two trades belongs to both. `LabourBreakdown` carries
    `sliceTotal`, `reportTotal` and `overlaps`, and the card states the gap
    under the donut rather than presenting an inflated total silently.
    (3) **`No Vendor` is the absence of vendor rows**, never a placeholder
    vendor — a tenant who later creates a vendor with that name must not absorb
    a year of unattributed labour.
  - `/projects/[id]/procurement` — **Project Procurement** (§9.7), the last item
    in Phase 8. Sub-tabs Request · RFQs · Orders · Deliveries · Inventory, the
    four tiles, the `Total items` segmented bar, the two-step `Raise request`
    wizard from `105800`, and a per-LINE stage control. Migration 0036.
    **Three things to know.** (1) **A request does not have a status.** 0036
    moved the procurement stage onto `material_request_items` and
    `material_requests.stage` narrowed to the request's own lifecycle (draft /
    requested / cancelled). Every count on the screen — tiles included — is an
    aggregation from `lib/material-requests-model.ts`. There is no "advance
    this request" action on purpose: it would re-stamp lines somebody has
    already handled. (2) **`awardRfq` no longer picks the cheapest bid.** It
    takes `{ vendorId, reason }`, both required, and stores who decided —
    frame `105853` shows a buyer ordering from the dearer vendor, and the
    ranking is now a suggestion the dialog shows. (3) **The Inventory sub-tab is
    a labelled placeholder** pointing at §10.2. Building it would squat on
    migration 0033 and produce a second stock model.

  **Four things to know before touching this.**
  1. **PDFs do not carry pins.** A raster renders in our own element, so a click
     gives real coordinates. A PDF renders in the browser's own viewer inside an
     iframe, where we cannot know the page or the click position — so pins are
     not drawn over it and the reviewer records a page number instead. Drawing
     a marker at a plausible-looking wrong spot is worse than none. Rendering
     PDF pages ourselves needs a new dependency; `PLAN-V4` says ask first.
  2. **`getProjectFileDetail()` returns BOTH comment threads by default**,
     because the staff viewer switches between them in the browser. It takes an
     `audience` option that narrows the read at the database. Anything
     client-facing MUST pass it — otherwise the internal thread travels to a
     client's browser filtered only by JavaScript, which is not a filter.
  3. **There is no project-private money model, and there must never be one.**
     `contracts` + `milestones` (0015) ARE §9.3's inflow/outflow model —
     `source` = client|vendor, and pct/amount/tentative_due/work_done/actual_due
     is `105238` column for column. Migration 0030 therefore EXTENDS them
     (vendor_id, contract_categories, project_files.contract_id) instead of
     building the `project_contracts` / `contract_milestones` /
     `contract_documents` the ledger reserved. Account Receivables (§12.3) reads
     the same `milestones` rows. Read 0030's header before touching this.
  4. **The payment ledger is append-only and has no delete path.** A correction
     is a new `payments` row with the opposite sign whose `reversal_of` points
     at the entry it cancels. With the "View reversed transactions" checkbox
     off, BOTH halves hide, and the total excludes the pair in either mode.

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

Applied: **0001–0032, 0036, 0037, 0038.**

| # | Contents | § | Status |
|---|---|---|---|
| 0026 | `follow_up_assignees`, `followup_outcome_rules`, `leads.external_ref` | 5 | ✅ applied |
| 0027 | `scope_items` + `scope_item_id` on six line tables + backfill | 7.2 | ✅ applied |
| 0028 | real `project_id` FKs on twelve `project_label` tables + backfill | 7.3 | ✅ applied |
| 0029 | `project_folders`, `project_files`, `project_file_versions`, `entity_comments` | 9.1 | ✅ applied |
| **0030** | **REDEFINED** — `contracts.vendor_id`, `contract_categories`, `project_files.contract_id`. It is *not* what §15 reserved; read its header for why building `project_contracts` would have been a third parallel money model | 9.3 | ✅ applied |
| **0031** | `labour_entries`, `labour_entry_categories`, `labour_entry_vendors`, `project_files.labour_entry_id` — and deliberately NO `total` column | 9.6 | ✅ applied |
| 0032 | `project_milestones`, `project_milestone_deps`, `milestone_templates` | 9.2 | ✅ applied |
| **0033** | warehouse `kind` + `project_id`; GRN auto-numbering | 10.2 | free |
| **0034** | `wfh_requests`, `holidays` | 11.1 | free |
| **0035** | `audit_events`; permission enforcement columns | 11.3–11.4 | free |
| **0036** | material-request **per-line stage** model (+ `request_type`, `number`, and the RFQ award columns) | 9.7 | ✅ applied |
| 0037 | payment ledger columns (`vendor_id`, `member_id`, `expense_type`, `category`, `reversal_of`, `stock_in_requested`) + `project_files.payment_id` | 9.4 | ✅ applied |
| **0038** | site progress columns on `site_photos` (`storage_path`, `mime_type`, `size_bytes`, `client_visible`, `taken_on`, `uploaded_by`) + the "a stored photo names its project" check | 9.5 | ✅ applied |

0032 was applied out of numeric order because Phase 7 needed it, and 0037/0038
because §9.4 and §9.5 were never given reserved slots — 0033–0036 each belong to a
different module, so taking one would have been squatting. (0031 was reserved
for labour and §9.6 duly used it.) That is all fine: the
runner applies by filename, so a fresh database still gets them in order once
the gaps are filled. **Do not renumber.** The ledger now runs past 0036.

---

## 6. What to build next, in order

### Phase 8 (`PLAN-V4 §9`) — done, nothing to do here

**Phase 8 is COMPLETE — §9.1 through §9.7 are all built** (see §2). Start at
Phase 9.

Phases 9–12 (`PLAN-V4 §10–§13`), in order — **start here**:

- **Phase 9** — company-wide Procurement (§10.1, a scope switch over the same
  data layer, NOT a second implementation) · Inventory (§10.2, migration 0033)
  · Vendors detail + Vendor Projects (§10.3).
- **Phase 10** — HR Attendance (§11.1, migration 0034) · Users (§11.2) ·
  **permission enforcement (§11.3)** · audit log + metering (§11.4, 0035).
  **§11.3 is the biggest single item left in the whole plan** and it is not a
  screen: `lib/permissions-model.ts` defines `(module, action, scope)` and the
  settings matrix writes rows, and **nothing reads them** — re-confirmed by
  grep at this commit. A `can(ctx, "procurement.po.approve")` helper has to be
  called in *every* server action, with route guards that render a designed
  permission-limited state. A permission nothing enforces is worse than none.
- **Phase 11** — Payments Dashboard (§12.1) · Petty Finance (§12.2, extend
  `expense_claims`, do not duplicate) · Account Receivables (§12.3).
  **§12.3 is nearly free now**: it reads the `milestones` rows §9.3 already
  writes. Nothing is re-entered.
- **Phase 12** — reports wiring, saved views / column chooser / CSV / empty
  states, the accessibility floor, and the full red-discipline audit.

### The owner's current instruction on the parked items

Asked on this session whether to keep waiting, the owner said to **leave them
and push on through Phase 12**. So:

- **MB Sheets**, **2D → 3D renders**, **manager dashboard** (`TEAM_VIEW_ENABLED
  = false`), **Quotation 2.0**, **accounting export** — all still parked. Do not
  build them, do not design them unprompted, and do not delete the parked
  panels or the "soon" cards.
- **Deployed at the owner's instruction.** `bb872c5` (Phase 8, COMPLETE) is
  pushed to `origin/quotations-v2-plus-fleet` and live in Vercel production at
  **https://veyra-five-beta.vercel.app**, reading the same Supabase project the
  local app does. `main` is untouched — production is running this branch's
  code, not main's. Deployed twice: `6afb484` (through §9.5) on the owner's
  first instruction, then `bb872c5` at the Phase 8 boundary.
  **Rule 9 has not changed:** the owner authorised publishing this run's work.
  Do not push or deploy a NEW phase without asking.
  Two things known about production and not yet fixed:
  1. **The Vercel project has only the six Supabase env vars.** No `GEMINI_*` /
     `AI_*` keys, so every AI surface (SmartPlan, the BOQ parse) will fail in
     production until the owner adds them. That was already true of the previous
     deploy.
  2. **Vercel caps a serverless request body at 4.5 MB.** `next.config.ts` sets
     `serverActions.bodySizeLimit` to 26mb and the app accepts 25 MB uploads, so
     a document or site photo over ~4.5 MB will upload locally and fail in
     production. Needs either a client-direct-to-storage upload or a lower,
     honest cap.

---

## 6a. What this session added that you should REUSE, not rewrite

Reaching for one of these instead of writing your own is the difference between
extending this codebase and forking it.

| Reuse this | For | Notes |
|---|---|---|
| `lib/gantt-model.ts` | any time-axis chart | Pure geometry: bars as percentages of a derived window, month ticks, today marker. 12 tests. |
| `lib/smartplan-model.ts` + `lib/ai/smartplan.ts` | **every future AI surface** | The worked example of HARD RULE 2 — model returns structure, `datePlan()` computes dates from a human-chosen date, the parser DROPS any step carrying a rate/cost/qty, and nothing is written until a person accepts an editable draft. Copy this shape. |
| `lib/payments-ledger-model.ts` | any append-only ledger | `buildLedger` hides BOTH halves of a reversed pair and excludes them from the total in either mode. |
| `lib/finance-model.ts` | **all project money** | Two-way percent↔amount binding, `scheduleTotals` (the 100% rule), `actualDueOf`, `rollupContract`, `summarisePlan`, `splitEvenly`. One module computes this project's money — do not start a second. |
| `components/ui/comment-thread.tsx` | files, site photos, orders | **API changed this session**: it now takes `threads` already built by the caller, plus controlled `status`/`query`, and optional `onReply` / `onSetStatus` / `onSelect`. The caller builds the list once so the pins on a document and the cards in the rail can never disagree. |
| `lib/comments-model.ts` → `pinsFor` / `clampPin` | anything anchored to an image | Coordinates are fractions of the page, never pixels. |
| `workspace_options` kind `labour_category` | trades, anywhere | Nine trades from `105659`, seeded. Used by vendor contract categories AND labour. One list. |
| `lib/data/project-files.ts` → `listEntityCommentsBatch` | any grid whose rows each carry a thread | Every comment on a SET of objects in ONE read, keyed by entity id. Forty photos each with a thread is forty round-trips without it. Takes the same `audience` narrowing. |
| `lib/data/storage.ts` → `sitePhotoPath` + `ALLOWED_IMAGE_MIME` | any image-only upload | Same `<org>/<project>/<id>/…` prefix as documents, so `projectStorageUsage` counts it without being taught about it. |
| `lib/material-requests-model.ts` → `stageBreakdown` / `procurementTotals` | anything whose parts are in different places at once | The §9.7 shape: status on the LINE, the parent's stage derived by counting. `PROC_TABS` and `procTabOf` live here too — see the §9.7 lesson about client-module consts. |
| `lib/data/config.ts` → `issueDocNumber` | any numbered document | Consumes the tenant's series; `previewNextNumber` shows the next one WITHOUT consuming it. Two calls on purpose — a preview that burned a number would leave gaps an auditor asks about. |
| `lib/labour-model.ts` | any headcount, and any breakdown that can double-count | `totalOf` / `summarise` are the ONLY places labour is added. `LabourBreakdown` is the shape to copy whenever one row can belong to several slices: it reports `sliceTotal` AND `reportTotal` AND `overlaps`, so the screen can state the double-count instead of hiding it. §9.7's per-line stages will need exactly this. |
| `uploadProjectFile({ link })` | any module that needs an attachment | Typed `{ contract_id \| payment_id \| labour_entry_id }`. **Do not add a fifth attachment table** — point at `project_files` and add a column. |
| `MultiSelect` in `app/(app)/projects/[id]/labour/labour-view.tsx` | any searchable checkbox dropdown | `105659` / `105706`. Lift it into `components/ui/` the moment a second module needs it — §9.7's vendor pickers probably will. |
| `lib/site-photos-model.ts` | anything date-grouped | `groupPhotosByDate` (newest day first, undated last, nothing dropped), `tabCounts`, `selectionSummary` for a bulk bar that states its blast radius, and `formatPhotoDate` — which formats from the STRING, never through a `Date`, because `2026-03-24` parsed and re-read locally becomes the 23rd. |

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

### Added by the Phase 8 §9.1–§9.4 session

- **`withOrg()` has no generic `.delete()`** — only `deleteById(id)`. That is
  deliberate: it is what keeps every delete org-scoped. To remove a row matched
  on other columns, `select` its id first, then `deleteById`. Writing
  `db.table(x).delete().eq(...)` does not compile.
- **A new table is three edits, not one.** The migration, `lib/data/tables.ts`,
  and an org-isolation assertion in `scripts/verify.mjs`. Miss the second and
  TypeScript rejects `db.table("your_table")` with a wall of union types that
  looks like a different problem entirely.
- **A new `workspace_options` kind is two edits**: `OPTION_KINDS` *and*
  `OPTION_KIND_LABELS` in `lib/workspace-model.ts`, plus seeds in
  `DEFAULT_WORKSPACE_OPTIONS`.
- **Client components resolve their tab from the SERVER, not from an effect.**
  `/plan`, `/finance` and `/payments` all take an `initialTab` prop read from
  `searchParams`. Doing it in `useEffect` means a deep link server-renders the
  wrong tab and swaps after hydration — which also makes it unverifiable by
  fetching HTML, since the server never emits the tab you linked to.
- **The shared `Donut` sizes segments by `count`, not by an arbitrary value.**
  For money, use `BarList` (it takes `value` + `display`), which also keeps the
  rupee figure visible — a donut hides the amount, and the amount is the point.
- **Bash heredocs choke on some of this content.** Several `cat <<'EOF'` writes
  of long TSX failed with "unexpected EOF". Write the file with the Write tool
  and append with a small Python script instead; that path is reliable.
- **Verifying UI still works the way §8 describes**, and it is worth doing:
  fetch the route and strip tags. Two real defects were caught that way this
  session (a deep-linked tab rendering the wrong panel, and confirming a
  cross-project file URL leaks nothing). Note that a 200 with only the shell is
  Next streaming a `notFound()` — check the BODY, not the status code.
- **A stale dev server from another session will answer on 3010.** If fetches
  behave oddly, confirm whose server it is before debugging your own code.

### Added by the §9.5 session

- **A server action CAN be exercised over HTTP even from inside a Radix
  dialog** — which §8 said was impossible. Fetch the page, pull the action id
  out of the client chunk (`createServerReference("<id>", …, "<exportName>")`
  in one of `/_next/static/chunks/*`), then POST to the route with header
  `Next-Action: <id>` and a body React can decode:

      _1_<field> = <value>   (every FormData entry, files included — the
                              prefix is literally underscore-refId-underscore)
      0          = ["$undefined","$K1"]   (the args; `$K1` IS that FormData)

  For a plain `(formData) => void` action the args are `["$K1"]`. **Use the
  DEV ids, not the ones in `.next/server/server-reference-manifest.json`** —
  the build's ids are different and the dev server answers
  "Server action not found". This is how the upload, the MIME rejection, the
  cross-project refusals and the bulk-visibility partial were all proven
  against a real database and a real bucket.
- **A cross-project write must be tested by trying it.** Creating a second
  project, aiming project A's delete form at project B's photo and watching the
  row survive is worth more than reading `assertPhotoBelongsToProject` twice.
- **`site_photos` had two kinds of row before this and still does**: 0019's
  pasted URL and 0038's stored object. `signedUrl` falls back to `url`, so both
  render. Do not "clean up" the URL column — it is a real, supported way to
  record a photo, and dropping a column is not an additive migration.
- **Demo data must be possible.** The first cut of the §9.5 seed gave a photo a
  site date a week AFTER its upload date. Nobody photographs a wall next
  Tuesday; seed data that says otherwise teaches the schema wrong.

### Added by the §9.6 session

- **The strongest way to protect an invariant is to make it unrepresentable.**
  §9.6's "totals always derived" is not a code review rule — there is no `total`
  column, and `verify.mjs` asserts that selecting one FAILS. A convention needs
  a reviewer; a missing column needs nobody.
- **When one row can belong to several slices, say so in the return type.**
  `byCategory` / `byVendor` hand back `sliceTotal`, `reportTotal` and
  `overlaps` together, so a caller physically cannot render the slice sum as if
  it were the headcount. §9.7's per-line stages have the same shape — an item
  in `Ordered (4) · Pending (8)` is one request counted twice — so copy this
  rather than re-deriving it.
- **`formData.has(key)` is how a form says "clear this".** The labour dialog
  emits an empty `categories` field before the real ones, so "no trades
  selected" reaches the server as present-but-empty and clears them, while an
  action that never mentions the field leaves them alone. Without the empty
  sentinel, unticking every checkbox silently does nothing.
- **A rejected attachment must not throw away the attendance.** `addLabourEntry`
  saves the headcount, then attempts the file, and reports a partial success if
  the file fails. Deciding that a 30 MB photo means nobody worked that day is
  the kind of "correctness" that loses real data.

### Added by the §9.7 session

- **A `"use client"` module's exported CONST is a client reference on the
  server.** `PROC_TABS` was declared in the view and imported by the page;
  `tsc` passed, `next build` passed, and every request threw
  `PROC_TABS.includes is not a function`. Types cross that boundary, values do
  not. Vocabulary belongs in the pure model — which is where it now lives.
- **Selecting a column that does not exist empties the WHOLE read, silently.**
  `po_lines` has no `received_qty` (receipts live in `po_receipt_lines`, one row
  per load, because a line can arrive in three). Asking for it made PostgREST
  error, the result came back empty, and every order showed "— lines received"
  as if that were the data. This is §9's first lesson wearing a new hat: an
  unchecked `.error` is a lie with a plausible shape.
- **The dev server's action ids are NOT the build's.** Both exist in
  `.next` at once. Pull them from `/_next/static/chunks/*` while the dev server
  is the thing you are testing.
- **Award captures a reason now, and old awards do not have one.** The RFQ list
  prints "No reason recorded" for pre-0036 awards rather than inventing one.
  Backfilling a plausible reason would have been worse than the gap.
