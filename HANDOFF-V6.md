# HANDOFF V6 — VEYRA

**This is the current, authoritative handoff. It supersedes `HANDOFF-V5.md` and
every other `HANDOFF-*.md` / `START-HERE.md` in the repo root. Do not read
those** — they describe a login flow that no longer exists, a Kanban pipeline
that has been replaced, and phases that are now finished.

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`
Branch: `quotations-v2-plus-fleet` · Live: **https://veyra-five-beta.vercel.app**

**Phases 0–8 are complete and deployed. Your job is Phases 9–12.**

---

## 0. Read these three files before touching anything

| File | What it is |
|---|---|
| **`HANDOFF-V6.md`** *(this file)* | where the build is, the rules, and what to do next |
| **`PLAN-V4.md` §10–§13** | your instruction set — Phases 9, 10, 11, 12 |
| **`competitor-research/DESIGN-DIRECTION.md`** | the visual system; governs every screen |

`FRAME-REGISTER-V4.md` is the evidence file — one entry per owner screenshot.
Read the entry for a screen **and open the actual PNG in `temp folder 1/`**
before building it. A previous session got frame citations wrong by working
from summaries; do not repeat that.

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
   return structure only; a deterministic engine plus tenant config supplies
   every number. Log every call to `ai_requests`. `lib/smartplan-model.ts` +
   `lib/ai/smartplan.ts` are the worked example — copy that shape.
3. **Migrations are additive and idempotent**, with
   `org_id uuid not null references public.orgs(id) on delete cascade`.
   See §4 for the ledger and the next free numbers.
4. **Ledgers are append-only.** A reversal is a new row plus a filter, never a
   delete.
5. **Projects never share anything.** A folder, a file, a photo, a labour day, a
   request — each belongs to exactly one project, enforced three ways (FK,
   scoped uniqueness, storage prefix). §3 has the pattern; Phase 9's project
   warehouses must follow it.
6. Indian market: GST (HSN/SAC, place-of-supply), Indian-FY numbering,
   ₹ Indian grouping, DPDP.
7. **Red has a closed list of five jobs** (`DESIGN-DIRECTION §2`): the one
   primary action per view, active navigation, destructive actions, genuine
   alerts, the hero metric. A sixth use is wrong — find the black/grey
   treatment.
8. Server-action files export only async functions. Secret keys stay
   server-side (`admin` is lint-restricted to `lib/data/`).
9. **Never push or deploy without the owner.** Local commits are fine. See §7
   for what is currently live.
10. **Do not use the Supabase MCP** — it authenticates to a different account
    and every call fails. Use `scripts/db.mjs` (DDL via the pooler) and
    `scripts/verify.mjs` / `scripts/verify-storage.mjs`.
11. Do not delegate the `scope_items` spine, the vendor portal, or anything
    touching `with-org.ts` to sub-agents.

### Out of scope (owner decision)

Client/customer portal · warranty module · telephony/dialer · WhatsApp API
ingestion. Calls and lead capture stay manual. **But** honour the
`client_visible` flags — they drive the Progress Report, which is what actually
reaches the client.

### Parked — do not build, do not delete the placeholders

MB Sheets · 2D → 3D renders · manager dashboard (`TEAM_VIEW_ENABLED = false`) ·
Quotation 2.0 · accounting export · the public tokenised vendor-onboarding form
(`PLAN-V4 §10.3` — security-critical, build it yourself when the owner asks).

---

## 2. What exists now

Every route below is built, tested and live. **Do not rebuild any of it.**

| Area | Routes |
|---|---|
| Sales | `/leads` · `/leads/[id]` · `/leads/insights` · `/pipeline` · `/followups` · `/quotations` (+ builder, templates, compare, `/q/[token]`) |
| Projects | `/projects` · `/projects/[id]` (Summary · Modules · Milestones) |
| Project modules (Phase 8) | `/documents` (+ `/[fileId]` viewer) · `/plan` · `/finance` · `/payments` · `/site` · `/labour` · `/procurement` · `/report` |
| Company-wide | `/procurement` · `/rfq` · `/orders` · `/inventory` · `/finance` · `/vendors` · `/items` · `/design` · `/production` · `/site` · `/approvals` · `/reports` |
| Admin | `/settings` (workspace, numbering, quotations, roles) · `/billing` · `/communication` |

**Phase 8 in one paragraph.** Each project now owns its documents (private
bucket, signed URLs, versions as rows, a two-audience comment thread with pins),
its delivery plan (Gantt, dependencies, SmartPlan), its money (contracts →
percentage schedule → append-only payment ledger), its site photo record
(date-grouped, client-gated, per-photo chat), its labour (headcount by trade and
vendor, four Chart|Table breakdowns) and its procurement (requests whose LINE
ITEMS carry the stage, RFQs, orders, deliveries).

**The five things from Phase 8 most likely to trip you up** are in §3.

---

## 3. Schema and architecture facts that will bite you

**Two milestone tables, on purpose.** `milestones` (0015, hangs off `contracts`,
carries `pct / amount / tentative_due / work_done / actual_due`) is the
**payment** schedule — it becomes Account Receivables (§12.3). `project_milestones`
(0032) is the **delivery** schedule. Merging them would mean a project's plan and
its invoicing could never disagree, and on a real site they always do.
`verify.mjs` asserts they stay separate.

**`project_label` is legacy but not dead.** 0028 added real `project_id` FKs to
twelve tables and backfilled them; the label column survives as a display
fallback for rows that never resolved. Query `v_project_label_unmatched` to see
what did not match. **Read `project_id`; fall back to the label only for
display.**

**There is no project-private money model, and there must never be one.**
`contracts` + `milestones` ARE the inflow/outflow model. 0030 extended them;
§12.3 will read the same rows. Do not build a parallel one.

**Status can live on the line, not the parent.** Migration 0036 moved the
procurement stage onto `material_request_items` because a request of sixteen
items is in four places at once. `stageBreakdown` / `procurementTotals` in
`lib/material-requests-model.ts` are the shape to copy whenever one row belongs
to several buckets — they return the slice total AND the real total AND whether
they overlap, so a screen can state a double-count instead of hiding it.

**Totals are derived, never stored.** `labour_entries` has no `total` column and
`verify.mjs` asserts that selecting one *fails*. Prefer making an invariant
unrepresentable over documenting it.

### Per-project isolation, enforced three times

1. **Schema** — `project_id` is `not null` with a real FK; uniqueness is scoped
   to the project, so two projects may each own a folder called "2D".
2. **Data layer** — every write re-checks ownership
   (`assertFolderBelongsToProject`, `assertPhotoBelongsToProject`,
   `assertEntryBelongsToProject`, `assertRequestBelongsToProject`). Never trust
   an id from a form.
3. **Storage path** — `<org_id>/<project_id>/<entity_id>/<name>`. One project's
   objects are not listable from another's prefix even if a query were
   mis-scoped.

### The storage contract

Bucket `project-files`, **private**, created idempotently on first use.
**Signed URLs only**, 10-minute expiry, minted server-side after `withOrg()` has
proved ownership. MIME allowlist and a 25 MB cap in `lib/data/storage.ts`;
`next.config.ts` raises `serverActions.bodySizeLimit` to 26mb to match — **change
one, change the other.** Versions are rows, never overwrites.

---

## 4. Migration ledger

Applied: **0001–0032, 0036, 0037, 0038.**

**Next free numbers: 0033, 0034, 0035, then 0039+.** All three are reserved for
work you are about to do:

| # | Contents | Phase |
|---|---|---|
| **0033** | warehouse `kind` (`company\|project`) + `project_id`; GRN auto-numbering | 9 (§10.2) |
| **0034** | `wfh_requests`, `holidays` | 10 (§11.1) |
| **0035** | `audit_events`; permission enforcement columns | 10 (§11.3–§11.4) |

Numbers were applied out of order (0036–0038 before 0033–0035) because those
phases came first and squatting on a reserved number would have been worse. The
runner applies by filename, so a fresh database still gets them in order once
the gaps are filled. **Do not renumber.**

**A new table is three edits, not one:** the migration, `lib/data/tables.ts`,
and an org-isolation assertion in `scripts/verify.mjs`. Miss the second and
TypeScript rejects `db.table("your_table")` with a wall of union types that
looks like a different problem entirely.

---

## 5. Reuse this — do not write a second one

Reaching for one of these instead of writing your own is the difference between
extending this codebase and forking it.

| Reuse | For | Notes |
|---|---|---|
| `components/ui/patterns.tsx` | every screen | `SegmentedControl`, `SegmentedCountBar`, `PlannedVsActual`, `MultiValueCell`, `ClientVisibleToggle`, `DateRangeControl`. |
| `components/ui/charts.tsx` | every chart | `AreaTrend`, `Donut` (sizes by **count** — for money use `BarList`, which keeps the rupee figure visible), `BarList`. |
| `components/ui/comment-thread.tsx` | files, photos, orders | Takes `threads` already built by the caller, plus controlled `status`/`query`. The caller builds the list once so pins and cards can never disagree. |
| `lib/data/with-org.ts` | all data access | Note: no generic `.delete()` — only `deleteById(id)`. To remove a row matched on other columns, `select` its id first. |
| `lib/data/project-files.ts` → `uploadProjectFile({ link })` | any attachment | Typed `{ contract_id \| payment_id \| labour_entry_id }`. **There is one file model. Do not add a fifth attachment table** — point at `project_files` and add a column. |
| `lib/data/project-files.ts` → `listEntityCommentsBatch` | any grid whose rows carry a thread | Every comment on a SET of objects in one read. |
| `lib/data/config.ts` → `issueDocNumber` / `previewNextNumber` | any numbered document | Issue consumes; preview does not. Two calls on purpose — a preview that burned a number leaves gaps an auditor asks about. GRN numbering (§10.2) should use this. |
| `lib/data/storage.ts` | any upload | `storagePath` / `sitePhotoPath` / `signedUrls` / `ALLOWED_MIME` / `ALLOWED_IMAGE_MIME`. |
| `lib/finance-model.ts` | all project money | Two-way percent↔amount binding, `scheduleTotals` (the 100% rule), `actualDueOf`, `rollupContract`. §12.3 reads what this writes. |
| `lib/payments-ledger-model.ts` | any append-only ledger | `buildLedger` hides BOTH halves of a reversed pair and excludes them from the total in either mode. §12.2 needs exactly this. |
| `lib/material-requests-model.ts` | anything whose parts are in different places | `stageBreakdown`, `procurementTotals`, `PROC_TABS`, `procTabOf`. |
| `lib/labour-model.ts` | headcounts, and any breakdown that can double-count | `totalOf`/`summarise` are the only places labour is added. |
| `lib/gantt-model.ts` | any time axis | Pure geometry: bars as percentages of a derived window, month ticks, today marker. |
| `lib/site-photos-model.ts` | anything date-grouped | `formatPhotoDate` formats from the STRING, never through a `Date` — `2026-03-24` parsed and re-read locally becomes the 23rd. |
| `lib/permissions-model.ts` | Phase 10 | `(module, action, scope)` vocabulary + `DOC_TYPES` + `formatDocNumber`. Already defined; **nothing reads it yet** — that is §11.3's whole job. |
| `workspace_options` kind `labour_category` | trades, anywhere | Nine trades from `105659`, seeded, shared by vendor contracts and labour. One list. |
| `MultiSelect` in `app/(app)/projects/[id]/labour/labour-view.tsx` | searchable checkbox dropdowns | Lift it into `components/ui/` the moment a second module needs it — Phase 9's vendor and warehouse pickers probably will. |

---

## 6. What to build next, in order

### Phase 9 — Company Procurement, Inventory, Vendors (`PLAN-V4 §10`)

1. **§10.1 Procurement company-wide** (`110014`) — **a scope switch over the
   same data layer, NOT a second implementation.** `/procurement` already
   exists; give it a `Project` column and filter and the
   `All Requests / Draft Requests` toggle, reading the same rows
   `lib/data/project-procurement.ts` reads. The per-line stage model is already
   built — reuse `stageBreakdown`.
2. **§10.2 Inventory** (`110101`, `110109`) — **migration 0033**. Tabs
   Warehouse/Site · Deliveries StockIn · Expense StockIn · Transaction History,
   with the `Company Warehouses / Project Warehouses` toggle the owner named.
   Project warehouses must follow §3's isolation pattern. `Expense StockIn` is
   the landing point for the `Stock-In Request` checkbox already written by
   §9.4 (`payments.stock_in_requested`). GRN numbering via `issueDocNumber`.
   **The project procurement screen's Inventory tab is a labelled placeholder
   pointing here** — replace it when this lands.
3. **§10.3 Vendors** (`110146`–`110234`) — list filters, `Working Model`,
   `Created → Verified → Onboarded` status, then the detail's three cards.
   **Vendor Projects** is the owner's verbatim ask and is mostly a read over
   rows that already exist: contracts, payments and POs all carry
   `project_id` and `vendor_id`.

### Phase 10 — HR and Admin (`PLAN-V4 §11`)

4. **§11.1 Attendance** (`110318`, `110339`) — **migration 0034**
   (`wfh_requests`, `holidays`). `work_sessions`, `leave_requests` and
   `field_visits` already exist (0023). **Hours stay derived from stamps, never
   stored.**
5. **§11.2 Users** (`110349`) — `org_members.manager_id` already exists; surface
   it as the real `Manager` column.
6. **§11.3 Permission enforcement** — **the biggest single item left in the
   whole plan, and it is not a screen.** `lib/permissions-model.ts` defines the
   vocabulary and the settings matrix writes rows, and **nothing reads them**.
   Build a server-side `can(ctx, "procurement.po.approve")` called in *every*
   server action, route guards that render a designed permission-limited state,
   and field-level visibility for the register's P1 case (*a supervisor sees the
   BOQ without cost columns*). Role inheritance (`Inherit From ▾`) collapses the
   permission explosion — build it. Destructive capabilities stay opt-in per
   role, as the frames show. **A permission nothing enforces is worse than
   none: it promises a control that does not exist.**
7. **§11.4 Audit log + metering** — **migration 0035** (`audit_events`). The
   `Audits` tab on the file viewer and the `Audit` button on Financial Planning
   are both already rendered and both need this. Metering is wired to 3 create
   paths; ~20 others are free.

### Phase 11 — Accounting and Finance (`PLAN-V4 §12`)

8. **§12.1 Payments Dashboard** (`110458`) — the per-project matrix with
   drill-through. This is `projectProfitability()` done properly, and the real
   `project_id` FKs it needs are already in place.
9. **§12.2 Petty Finance** (`110521`) — extend `expense_claims` (0023), do not
   duplicate. Reuse `buildLedger` for the reversed-transactions checkbox.
   **Soft-deleted projects must still render in the ledger** — the money is real
   even when the project is gone.
10. **§12.3 Account Receivables** (`110534`) — **nearly free**: it reads the
    `milestones` rows §9.3 already writes. Nothing is re-entered. That is the
    interconnection the owner asked for.

### Phase 12 — Reports and polish (`PLAN-V4 §13`)

11. Wire the Reports permission groups to real reports · saved views, column
    chooser, CSV export, designed empty states, skeleton loading on every list ·
    the accessibility floor (`DESIGN-DIRECTION §8`) · a full red-discipline
    audit · fix the competitor mistakes listed in `FRAME-REGISTER-V4.md`.

---

## 7. Deployment state

`bb872c5` (Phases 0–8) is pushed to `origin/quotations-v2-plus-fleet` and live
in Vercel production at **https://veyra-five-beta.vercel.app**, reading the same
Supabase project the local app does. `main` is untouched — production runs this
branch's code.

**Two things production is missing.** Fix them with the owner, not silently:

1. **No `GEMINI_*` / `AI_*` env vars in Vercel** — only the six Supabase ones.
   Every AI surface (SmartPlan, the BOQ parse) fails in production until the
   owner adds them in the Vercel dashboard. Do not paste their API keys yourself.
2. **Vercel caps a serverless request body at 4.5 MB** while the app accepts
   25 MB uploads. A large drawing or phone photo uploads locally and fails in
   production. The real fix is uploading from the browser straight to Supabase
   storage.

Rule 9 still stands: the owner authorised publishing the work through Phase 8.
**Ask before deploying a new phase.**

---

## 8. Definition of done, per phase

Re-run all six yourself, in PowerShell, checking `$LASTEXITCODE`. **Never take a
sub-agent's word for it.**

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/next/dist/bin/next build
node scripts/verify.mjs
node scripts/verify-storage.mjs
```

Current baseline: **tsc 0 · eslint 0 · 560 tests in 39 files · 63 page routes ·
verify 142/142 · verify-storage 11/11.** Nothing you add may lower these.

`next build` passing does **NOT** mean the typecheck passes — Next skips test
files. Run both.

Also per phase:
- Every engine is a pure function in `lib/<x>-model.ts` **with tests**.
- Every new table is in `lib/data/tables.ts` and reached only through `withOrg()`.
- `scripts/verify.mjs` gains org-isolation assertions for it — and, for anything
  project-scoped, **project-isolation assertions too**.
- Every screen is checked against its `FRAME-REGISTER-V4.md` entry *and the
  actual PNG*.
- Red discipline audited.

---

## 9. Running and verifying it

```bash
npm run dev                    # http://localhost:3010
node scripts/db.mjs migrate    # YOU apply migrations, never a sub-agent
node scripts/db.mjs sql "<query>"
node scripts/seed-demo.mjs     # idempotent; tops up the demo tenant
```

Login is removed; the app opens straight into the demo tenant as **Aditi
Pradhan**. Use **View as** (top bar) to switch to Rahul Verma or Meghana Rao for
populated data. The demo project *Malviya Nagar 3BHK* carries a 12-milestone
plan, six site photos, eight labour days, three material requests (one with
lines spread across five stages), an RFQ and a partially-delivered PO.

### Verifying without a browser

The browser pane works but is flaky — screenshots often need a retry. These two
techniques are faster and more reliable:

**Read a rendered page.** Fetch it and strip tags. A 200 with only the shell is
Next streaming a `notFound()` — check the BODY, not the status code.

```bash
node -e "fetch('http://localhost:3010/projects').then(r=>r.text()).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').slice(0,2000)))"
```

**Exercise a server action over HTTP**, even one inside a dialog. Pull the
action id out of the client chunk
(`createServerReference("<id>", …, "<exportName>")` in one of
`/_next/static/chunks/*`), then POST to the route with header
`Next-Action: <id>` and a body React can decode:

```
_1_<field> = <value>     # every FormData entry, files included
0          = ["$undefined","$K1"]    # the args; $K1 IS that FormData
```

For a plain `(formData) => void` action the args are `["$K1"]`. **Use the DEV
ids, not the ones in `.next/server/server-reference-manifest.json`** — the
build's ids differ and the dev server answers "Server action not found". This is
how uploads, MIME rejections, cross-project refusals and partial bulk updates
were all proven against the real database.

**A stale dev server from another session will answer on 3010.** If fetches
behave oddly, confirm whose server it is before debugging your own code.

---

## 10. Mistakes already made — do not repeat them

**Errors and reads**
- **Report a query error as itself.** A lookup selected a column that did not
  exist, PostgREST errored, the handler collapsed it into "not in this
  workspace" — which reads like a tenancy bug. Cost an hour.
- **Selecting a column that does not exist empties the WHOLE read, silently.**
  `po_lines` has no `received_qty`; asking for it made every order show no lines
  received, with no error anywhere. An unchecked `.error` is a lie with a
  plausible shape.
- **A percentage without its denominator is not trustworthy.** Every ratio in
  this codebase travels with the two numbers it came from.

**Writes**
- **A PostgREST bulk insert sends an explicit NULL** for a key that one row in
  the batch omits, defeating the column default and tripping `not null`. Batch
  rows need uniform keys.
- **Backfills that match on a name plus a sort order mislink.** Carry the origin
  id (`QL:<id>`) to make it exact and re-runnable.
- **`scope_items.parent_id` cascades on delete.** `deleteSection()` detaches
  children first; `verify.mjs` asserts the cascade so nobody "simplifies" it away.
- **A rejected attachment must not throw away the record it was attached to.**
  Save the row, attempt the file, report a partial success.

**React / Next**
- **A `"use client"` module's exported CONST is a client reference on the
  server.** `tsc` passes, `next build` passes, every request throws. Types cross
  that boundary; values do not. Vocabulary belongs in the pure model.
- **Client components resolve their tab from the SERVER, not from an effect.**
  Every tabbed screen takes an `initialTab` prop read from `searchParams`.
  Doing it in `useEffect` server-renders the wrong tab and makes the page
  unverifiable by fetching HTML.
- **Radix dialog contents are not in the server HTML until opened** — hence the
  `Next-Action` technique in §9.
- **Bash heredocs choke on long TSX.** Write files with the Write tool and
  append with a small Python script.

**Data and demo**
- **Demo data can lie, and must be possible.** Six leads once carried statuses
  from a pre-0024 ladder, so the funnel appeared to have twice its real stages.
  A seeded photo once had a site date a week *after* its upload date. Seed data
  that says impossible things teaches the schema wrong.
- **Do not invent history to fill a new column.** RFQs awarded before the award
  reason existed show "No reason recorded" rather than a plausible fabrication.
