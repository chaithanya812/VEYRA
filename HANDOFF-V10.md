# HANDOFF V10 — VEYRA

**This is the current, authoritative handoff.** It supersedes HANDOFF-V9 and every other
`HANDOFF-*.md` / `START-HERE.md` in the repo root — do not read those, they describe queues
that are finished.

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`
Branch: `quotations-v2-plus-fleet` · Live: <https://veyra-five-beta.vercel.app>

---

## PART 0 — Paste this to start a session

```
Read HANDOFF-V10.md in full before touching anything. It is short on purpose.

⛔ DO NOT BUILD ANYTHING YET. The build is COMPLETE and DEPLOYED; there is no
queue and nothing is owed. You are waiting for me.

What happens next: I will paste SCREENSHOTS with an explanation of each one —
what it is, what the competitor does there, what I want. Your job then is, in
order:

  1. Turn my explanation + the screenshots into a REPORT, in the format of
     FRAME-REGISTER-V4.md (evidence) and PLAN-V4.md (instruction). Part 1 of
     the handoff describes the method. Do not skip to code.
  2. Show me the report and WAIT. I will correct it.
  3. Only then break the agreed work into 6-12 numbered units and build them,
     one at a time, verifying each.

Until I send that material: answer questions, investigate, and read. Do not
open a file to change it.

Tell me what you understand the task to be before you start it.
```

---

## PART 1 — How we work: screenshots → report → units

This is the established method. It has produced the whole app, and it is what you should
reproduce rather than invent something new.

### 1. The owner sends screenshots plus a spoken explanation
Frames from a competitor's product, or from VEYRA itself, with narration: what this screen is,
what it does, what is good about it, what he wants. **The explanation is the specification —
the screenshot alone is not.**

### 2. You write the report — TWO documents, not one

**The evidence document** (precedent: `FRAME-REGISTER-V4.md`, 45 frames, 858 lines).
One entry per screenshot, cited by a stable id. Each entry says: what is literally on screen,
then **what it tells us**. Its header states the rule that governs the whole exercise:

> *Owner's standing instruction: do not copy this UI. Understand why every box is there, keep
> the information, drop the density, improve on it.*

**The instruction document** (precedent: `PLAN-V4.md`). What we will actually build, why, in
what order, with the schema changes named and numbered. It cites the evidence document by
frame id so any claim can be traced back to a picture.

Keep them separate. The evidence is what was seen; the instruction is what was decided. Mixing
them is how a competitor's layout quietly becomes a requirement.

### 3. The owner reviews the report — STOP HERE
He corrects it. Expect the correction to be substantial. **Do not start building during this
step.** A feature built from an unreviewed report has twice been the wrong feature — most
recently a whole room-geometry/fit engine that was designed, prototyped and then rejected.

### 4. Break the agreed work into 6–12 numbered units
Each unit is one coherent, shippable slice: a model + its tests, a data layer, a screen. A unit
that cannot be verified on its own is too big.

### 5. Build the units one at a time
Sub-agents are used for this (there is a `veyra-unit` agent type), **dispatched one at a time,
by address, never in parallel.** Parallel writers on one codebase is how you get two
implementations of the same arithmetic — which is the single most common defect in this
project's history.

`Explore` is genuinely parallel-safe and worth using for read-only fan-out: "what already
exists for X" across many files.

### 6. Every unit ends the same way
Six gates (Part 5.1), a browser pass (Part 5.3), then a commit whose message says **why** the
shape is what it is. The commit log is this repo's design record — read `git log` before asking
why something is the way it is.

---

## PART 2 — What VEYRA is, and where it stands

A CRM/ERP for Indian interior-fit-out firms: leads → quotations → projects → procurement →
site/labour → money. Next.js App Router (v16, Turbopack), TypeScript, Supabase Postgres,
Tailwind v4. Multi-tenant by `org_id`. **RLS is OFF by owner decision** and
`lib/data/with-org.ts` is the only tenant guard.

**Login is a passwordless role picker.** `/login` lists the workspace's people grouped by tier;
picking one sets a `veyra_acting_member` cookie and that is the session. It is **not an auth
boundary** — anyone with the URL can start a session as the Owner — and both
`app/(auth)/login/actions.ts` and the coverage-test exemption say so in as many words. The demo
tenant is **pinned** in `getOrgContext()`; see Part 7.2 for why.

### Every route (74, all rendering)

| Area | Routes |
|---|---|
| Sales | `/leads` · `/leads/[id]` · `/leads/insights` · `/pipeline` · `/followups` · `/quotations` (+ builder, templates, compare, `/q/[token]`) |
| Projects | `/projects` · `/projects/[id]` (Summary · Modules) |
| Project modules | `/documents` (+ viewer) · `/plan` · `/finance` (+ Audit) · `/payments` · `/site` · `/labour` · `/procurement` · `/production` · `/report` |
| Company-wide | `/procurement` · `/rfq` · `/orders` · `/inventory` · `/finance` · `/vendors` · `/items` · `/design` (+ `/design/prompts`) · `/production` · `/site` · `/approvals` · `/reports` (9 reports) |
| Accounting | `/finance/payments` · `/finance/petty` · `/finance/receivables` |
| HR | `/hr/attendance` · `/hr/attendance/admin` |
| Admin | `/settings` (+ users, roles, numbering, quotations, workspace) · `/billing` · `/communication` |

**The current baseline. Nothing you do may lower these:**

```
tsc 0 · eslint 0 · 888 tests in 47 files · verify 208/208 · verify-storage 11/11 · build clean
```

Migrations applied: **0001–0043**. Next free number: **0044**. Nothing is reserved.

---

## PART 3 — Rules that do not bend

1. **RLS stays OFF.** Never enable it, never write a policy. `withOrg()` is the ONLY tenant
   guard. Every tenant table carries `org_id`, is registered in `lib/data/tables.ts`, and is
   reached only through `withOrg()`.
2. **No LLM ever produces a price, rate, cost, amount or quantity.** Models return structure
   only; a deterministic engine plus tenant config supplies every number. Log calls to
   `ai_requests`.
3. **Migrations are additive and idempotent**, with
   `org_id uuid not null references public.orgs(id) on delete cascade`. A new table is
   **THREE edits**: the migration, `lib/data/tables.ts`, and org-isolation **and**
   project-isolation assertions in `scripts/verify.mjs`. Miss the second and TypeScript rejects
   `db.table("your_table")` with a wall of union types that looks like an unrelated problem.
4. **Ledgers are append-only.** `payments`, `usage_events`, `audit_events`, `expense_claims`.
   A reversal is a NEW row plus a filter — never a delete.
5. **Projects never share anything.** A folder, file, photo, labour day, request or warehouse
   belongs to exactly one project — enforced by FK, scoped uniqueness, and storage prefix.
6. **Totals are derived, never stored.** `verify.mjs` asserts that selecting a stored total
   FAILS (42703). Prefer making an invariant unrepresentable over documenting it.
7. **Red has a closed list of five jobs**: the one primary action per view, active navigation,
   destructive actions, genuine alerts, the hero metric. A sixth use is wrong. Status chips are
   grey/amber/green and always carry a label, never colour alone.
8. **Indian market**: GST (HSN/SAC, place-of-supply), Indian-FY numbering, ₹ Indian grouping, DPDP.
9. **Server-action files export only async functions.** Secret keys stay server-side.
10. **Never push or deploy without the owner.** Local commits are fine. Part 5.4 — and note
    that pushing is NOT deploying in this project.
11. **Do not use the Supabase MCP** — it authenticates to a different account and every call
    fails. Use `node scripts/db.mjs` and the two verify scripts.
12. **Report a query error as itself.** Never collapse a PostgREST error into a friendlier
    message naming a different cause.
13. **Every server action calls `can()` as its FIRST statement.** A test enforces this.
14. **The same words must mean the same thing on every screen.** Two of this project's worst
    bugs were one label over two quantities — and a third was found in September 2026
    (Part 7.1). When you find a collision, name it on the screen; do not quietly pick one.

---

## PART 4 — The reuse index. Read this before writing anything.

**Most feature requests are already 70% built.** This index has repeatedly prevented a rebuild
of something that already existed — including, twice, entire subsystems the owner believed were
missing.

| Reuse | For |
|---|---|
| `lib/data/with-org.ts` | ALL data access. No generic `.delete()` — only `deleteById(id)` |
| `lib/data/project-files.ts` | `uploadProjectFile({ link })` — one file model. Do NOT add a fifth attachment table |
| `lib/data/config.ts` | `issueDocNumber` / `previewNextNumber`. Issue consumes; preview does not |
| `lib/data/storage.ts` | `storagePath` / `signedUrls` / `ALLOWED_MIME` |
| `lib/can-model.ts` | `CAPABILITIES`, `can`, `resolveRole`, `resolveActor`, `capabilityTree`, `capabilityPath` |
| `lib/scope-model.ts` | **THE SPINE.** `scope_items` — one row a quote line, a material request, a PO and a cut panel all resolve to |
| `lib/finance-model.ts` | all project money: `scheduleTotals`, `actualDueOf`, `rollupContract`, `summarisePlan`, `milestoneOverdue` |
| `lib/payments-ledger-model.ts` | `buildLedger` — hides BOTH halves of a reversed pair |
| `lib/payments-dashboard-model.ts` | `paymentsMatrix`, `summariseMatrix`, `filterMatrix`, `MATRIX_COLUMNS`, `cellTone` |
| `lib/receivables-model.ts` | buckets, receipt allocation, the receivables band. **The reports now share this** |
| `lib/petty-finance-model.ts` | the petty ledger, per person, over `expense_claims` |
| `lib/saved-views-model.ts` | screen registry, `canonicalQuery`, `parseColumns`, `buildCsv` |
| `lib/measurement-model.ts` | `resolveQty` — dimensions → quotation quantity, with a visible formula |
| `lib/production-model.ts` | BOM + cutlist maths: `panelAreaSqm`, `panelBandingMm`, `cutlistTotals`, `effectiveQty` |
| `lib/production-nesting-model.ts` | `nestPanels` — deterministic 2D bin-pack, board count, waste % |
| `lib/prompt-library-model.ts` | `extractVariables`, `assemblePrompt`, `CLAUSES`, `VOCAB` |
| `lib/material-requests-model.ts` | `stageBreakdown`, `procurementTotals` |
| `lib/labour-model.ts` | `totalOf` / `summarise` — the only places labour is added |
| `lib/inventory-model.ts` | `goodsValue`, `buildWarehouseTree`, `movedQty/Amount`, `lastMovement` |
| `lib/vendors-model.ts` | `vendorProjects`, `vendorProjectTotals`, `categorySummary`, the status ladder |
| `lib/workspace-model.ts` | `ROLE_LABELS`, `ROLE_DESCRIPTIONS`, `groupByRole`, `sessionHours`, `managerChain` |
| `lib/hr-model.ts` | the whole HR surface incl. `attendanceCsv` |
| `lib/gantt-model.ts` | any time axis |
| `lib/site-photos-model.ts` | `formatPhotoDate` — formats from the STRING, never through a Date |
| `components/ui/primitives.tsx` | `Card`, `PageHeader`, `StatusChip`, `EmptyState` |
| `components/ui/project-select.tsx` | the ONE project picker. `lockedTo` pins it to one project |
| `components/ui/skeleton.tsx` | the ONE skeleton vocabulary. No `"use client"`, so `loading.tsx` can import it. Compose it; never write a third |
| `components/ui/patterns.tsx` | `SegmentedControl`, `PlannedVsActual`, `MultiValueCell`, `DateRangeControl` |
| `components/ui/charts.tsx` | `AreaTrend`, `Donut`, `BarList` |
| `components/ui/button.tsx` | `Button`, and `asChild` — see 4.2 |
| `components/ui/audit-timeline.tsx` | any audit surface — before → now per changed field |
| `components/ui/permission-limited.tsx` | `PermissionLimited` (route refusal) · `HiddenValue` |
| `components/ui/comment-thread.tsx` | files, photos, orders |
| `components/ui/saved-views.tsx`, `column-chooser.tsx` | saved views on any URL-filtered screen |
| `app/(app)/dashboard/workspace-ui.tsx` | `StatTile`, `TileGrid`, `Empty`, `FormError`, `SubmitButton` |

### 4.1 The permission spine

```ts
// FIRST statement of a server action, before any parse or read:
const denied = await requireCan("procurement.po.approve");
if (denied) return denied;

// In an action consumed as <form action={...}> (must return void):
if (!(await can("procurement.po.approve"))) return;

// In a page, to render a designed refusal instead of a 404:
if (!(await can("reports.financial.view")))
  return <PermissionLimited capability="reports.financial.view" />;
```

A capability is three segments, `module.entity.action`, and must exist in `CAPABILITIES`.
**An unknown key fails closed and refuses everyone, owner included.**

`lib/can-coverage.test.ts` walks the real files: a new server action with no guard fails the
suite, as does a guard naming an unknown capability or one that is not the first statement.

**Self-service actions are deliberately ungated** (check in/out, own leave, own expense, own
petty entry, own visit, the View-as switch). The test: does the action write a row keyed to the
ACTING member, taken from the session and not from the form? A second, separate category is
**pre-session** (`startSessionAction`, `endSessionAction`, `signIn/signUp/signOut`) — there is
no actor to check yet. Both live in one exemption list, labelled apart.

**Tiers are the floor.** `org_members.role` is a four-value tier used when a member has no
`role_id`. As of 2026-09-06, `member` excludes destructive capabilities, `settings.*`,
`billing.cost.view` and every `.approve` — **but no longer `reports.*`** (Part 7.3). No demo
member has a `role_id`, so the tier floor is what you are testing.

`recordAudit({ entity, entityId, action, before, after })` appends to the ledger. It never
throws and never fails a business write. Capture `before` by reading the row before the update.

### 4.2 A link that looks like a button

```tsx
<Button asChild variant="primary">
  <Link href="/vendors/new">New Vendor</Link>
</Button>
```

Never `<Link><Button/></Link>` — that nests a `<button>` in an `<a>`, which is invalid and
gives a keyboard user two tab stops on one control. All 57 former call sites were converted.

### 4.3 A clickable table row

The project and lead rows use a **stretched link**: `relative` on the `<tr>`, and
`after:absolute after:inset-0` on the name's `<Link>`. One link, one tab stop, whole row
clickable. Anything else interactive in that row needs `relative z-10` to sit above the overlay
— `FollowUpCell` in the leads table is the worked example.

---

## PART 5 — Gates, verifying, deploying

### 5.1 The six gates

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/next/dist/bin/next build
node scripts/verify.mjs
node scripts/verify-storage.mjs
```

`next build` passing does **not** mean the typecheck passes — Next skips test files. Run both.
`verify-storage` is occasionally flaky at 10/11 against remote storage — re-run before
believing a failure. After `next build`, `git checkout next-env.d.ts` — the build rewrites its
import path and that churn should never be committed.

### 5.2 Running it

```bash
npm run dev                    # http://localhost:3010
node scripts/db.mjs sql "<query>"
node scripts/db.mjs migrate    # the OWNER runs this — show the migration first
node scripts/seed-demo.mjs     # idempotent; tops up the demo tenant
node scripts/seed-workspace.mjs  # HR data
```

**The demo tenant** — `Veyra Demo Interiors`, `d46a53af-58b1-4ed7-87be-c675e5803802`.
Project **Malviya Nagar 3BHK** (`c1d3b37a-9c0c-4263-bfd1-431b935d0597`): a 12-milestone plan,
six site photos, eight labour days, three material requests, an RFQ, a partially-delivered PO,
two warehouses, three numbered stock notes, a vendor contract with signed-off milestones.

Money to check any change against:
- Client: Contracted **₹18,00,000** · Billed **₹12,60,000** · Received **₹5,60,000** · Dues **₹7,00,000**
- Vendor: Agreed **₹2,40,000** · Billed **₹96,000** · Disbursed **₹50,000** · Committed **₹1,90,000** · Dues **₹46,000**

Members — Aditi Pradhan (owner) `ae9569dc-c875-4d80-9129-ca83d169b396` · Chaithanya V (admin)
`37607afd-c363-478a-ba28-248ed2ee68b0` · Meghana Rao (manager) `18042742-2a71-447d-82c6-2f71d9753916`
· Sneha Iyer, Karthik Nair, Rahul Verma (staff) — Rahul is `8be8a043-1aca-42e9-9230-cc145eff3db1`.
Switch with `Cookie: veyra_acting_member=<id>`.

⚠ `org_members` holds **several tenants'** rows and demo names REPEAT — there are four "Rahul
Verma"s. Picking an id by name alone gets another tenant's member, the cookie is silently
ignored, and a permission test passes while proving nothing. **Always filter by `org_id`.**

### 5.3 ⚠ The browser pane lies — read before believing any UI bug

Before you commit, open the screen and use it. But the pane produced **five** false bug reports
in one session. Every one of these is real and documented:

1. **It shows stale, detached DOM.** After a few navigations in one tab, `document.querySelector`
   returns nodes React no longer owns — clicks do nothing and state never updates. A "broken"
   client component was proven working in a fresh tab. Diagnostic: check whether the element has
   a `__reactFiber$…` own-property. If not, the DOM is detached — **open a NEW TAB**.
2. **It does not follow redirects.** A form submit that redirects leaves the pane on the old URL
   showing a stale error, while the server returned `303` and rendered the new page.
   **Verify writes in the server log and the database, never in the pane.**
3. **It stalls on a Suspense fallback** after a repeat navigation while the server returns 200.
4. **It reports `innerWidth === 0`** and every `getBoundingClientRect()` as 0×0. Check whether
   the whole ancestor chain is 0×0 before believing a sizing bug.
5. `innerText.includes("Loading…")` is NOT a stall signal — the skeleton's own sr-only label
   says that. Use `[aria-busy="true"]`.

**A stale `.next` cache also produces phantom 404s.** An entire built route 404'd locally and
consistently while production served it fine. `rm -rf .next` and restart.

**Reading a rendered page without the browser** (a 200 with only the shell is a streamed
`notFound()` — check the BODY, not the status code):

```bash
node -e "fetch('http://localhost:3010/projects').then(r=>r.text()).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').slice(0,2000)))"
```

### 5.4 Deploying: pushing is NOT deploying

`git push` does not deploy. The GitHub integration builds every push and every one fails,
because all six Supabase vars are scoped to Production only and the integration builds Preview.

```bash
git push origin quotations-v2-plus-fleet   # source of truth
npx vercel --prod --yes                    # THIS is the deploy
```

Then verify against the **live domain**, not the build log. **Ask the owner before every
deploy** — it replaces the URL he is showing a client. `main` is untouched; production runs off
`quotations-v2-plus-fleet`, and it reads the SAME Supabase project as local, so **a migration is
live the moment you apply it**, before any deploy.

**A restore point exists**: tag `snapshot/pre-chatgpt-2026-09-10` (commit `3804e23`, pushed),
plus a full row dump of the demo tenant and a rollback manual at
`RESEARCH 3\VEYRA-SNAPSHOTS\2026-09-10\RESTORE.md`. Re-run it before any session that will
touch data.

### What production is still missing

- **No AI key.** `AI_GEMINI_API_KEY` is unset, so every AI surface is dead in production. It
  fails gracefully — the key is read inside functions, `isAiConfigured()` drives a status line.
  The prompt library deliberately needs **no key** — it calls no model.
- Vercel caps a serverless request body at 4.5 MB while `next.config.ts` sets 26 MB. Uploads
  over ~4.5 MB fail in production while working locally. The real fix is browser-direct upload
  to Supabase storage.

---

## PART 6 — Mistakes already made. Do not re-make them.

### Reads
- **Selecting a column that does not exist empties the WHOLE read, silently.** Known traps:
  `po_lines` has no `received_qty`; `po_receipts` has `received_at` not `received_on`;
  `work_sessions` has `check_in`/`check_out`; `milestones` and `contracts` have `name` not
  `title`; **`milestones` has `work_done`, not `signed_off`**; `contracts` has NO `kind` column
  (a client contract is `vendor_id is null`, or `source = 'client'`); `org_members` has
  `display_name` not `full_name`; `audit_events` has `at` not `created_at`. An unchecked
  `.error` is a lie with a plausible shape.
- `contracts.created_by` holds an AUTH USER id, not an `org_members.id`. It resolves only by
  joining `org_members.user_id`.
- **A percentage without its denominator is not trustworthy.** Every ratio travels with the two
  numbers it came from.
- `db.mjs sql` renders a DATE through a JS Date, printing it a day early in IST. Cast it:
  `select holiday_date::text`.

### Writes
- **A PostgREST bulk insert sends an explicit NULL for a key one row omits**, defeating the
  column default and tripping `not null`. Batch rows need uniform keys.
- Backfills that match on a name plus a sort order mislink. Carry the origin id. A row with
  nothing to recover gets `null`, not a guess.
- `scope_items.parent_id` cascades on delete; `deleteSection()` detaches children first, and
  `verify.mjs` asserts the cascade so nobody "simplifies" it away.
- A rejected attachment must not throw away the record it was attached to. Save the row,
  attempt the file, report a partial success.
- **A composite FK is the only way Postgres can express "same tenant."** `UNIQUE (id, org_id)`
  plus a composite FK is why another tenant's manager cannot approve your leave.

### React / Next
- **A `"use client"` module's exported CONST is a client reference on the server.** `tsc`
  passes, `next build` passes, every request throws. Vocabulary belongs in the pure model.
- Client components resolve their tab/filter from the SERVER, not from an effect.
- **`revalidatePath` does NOT re-render a client component.** After a successful mutation from
  one, call `router.refresh()` — otherwise the write lands and the control springs back, which
  reads to the user as a failed save. Only a browser click finds this.
- **An uncontrolled form control does not re-read the URL on a client-side navigation** — key
  it. `defaultChecked`/`defaultValue` apply ON MOUNT ONLY, so this is invisible to every gate
  and every fetch, and only a CLICK AFTER A SOFT NAVIGATION finds it.
- An action consumed as `<form action={...}>` must return void.
- **A disabled `<select>` submits nothing.** To pin a value, use a hidden input.
- Radix dialog contents are not in the server HTML until opened.
- **Bash heredocs choke on long TSX.** Write files with the Write tool; apply surgical edits
  with a small Python script written to the scratchpad and run by path.

### Tests
- **A green test that examined nothing is the worst outcome available.** A file-walking test on
  Windows CRLF matched `"{\n"` and found nothing, so every assertion passed vacuously. Any
  file-walking test needs a second assertion that it FOUND something (≥25 files, ≥140 actions).
  Assert the specific SQL error code (23503/23505/23514/42703), not merely that something failed.

### Data
- **Demo data can lie, and must be possible.** Six leads once carried statuses from a retired
  ladder; a seeded photo once had a site date a week after its upload date.
- The demo tenant has **ONE project and ZERO `project_files`**, so several finished screens
  cannot be demonstrated — the payments matrix is a one-row table. **Seeding a second project
  would make more of the build demonstrable than any new feature.**
- `v_project_label_unmatched` still lists demo expense claims tagged to projects that do not
  exist ("DLF Greens", "Skyview Apartment") — residue of the free-text era (Part 7.4).

---

## PART 7 — What changed in September 2026 (since V9)

### 7.1 A report that was lying about money
`/reports/receivables-ageing` computed its own buckets and got both wrong: `outstanding` was
`contracted − received` (booking work nobody had done as a receivable), and the bucket labelled
"Overdue" counted milestones **not** signed off — money that is not yet invoiceable — while
₹7,00,000 genuinely six weeks late was counted nowhere. It said **₹0 overdue**.

It now reads from `receivablesData` + `receivableRows` + `summariseReceivables` — the same model
`/finance/receivables` uses. **Two screens answering one question must not both do the
arithmetic.** Also renamed: "Project Profitability / P&L" → **"Project Cash Flow / Cash flow"**.

### 7.2 The demo tenant is pinned
`getOrgContext()` used to prefer the authenticated user's own membership. With the password form
gone nobody can choose an account — but **a Supabase auth cookie from an earlier sign-up
survives in the browser**, and silently steered the whole app into that user's own workspace.
The owner ended up looking at an org named "1" with one ₹10,000 project and concluded the demo
data was missing. Both `getOrgContext()` and `getViewer()` are now pinned to `DEMO_ORG_ID`, and
they **must agree** — one names the workspace in the top bar while the other scopes every read.

### 7.3 The reports gate was theatre
The `member` tier excluded `reports.*` — but the Accounting screens gate on
`billing.payment.view`, which the tier grants, and `/finance/receivables` is a strict superset of
the Receivables Ageing report it refused. Owner's call: the tier keeps the money screens, so the
exclusion is gone. A test asserts the new intent. `/finance` and `/billing` gained read guards.

### 7.4 Pick a project, do not type one
`PLAN-V4 §7.1` flagged that eleven tables link to projects by free-text `project_label`; §7.3
scheduled the fix; **migration 0028 added the `project_id` FK and backfilled it — but the FORMS
were never moved across.** Now one shared `ProjectSelect` feeds the add-asset, BOM, cutlist, site
log, photo and check-in forms. Writes stamp `project_id` and **derive** `project_label` from the
project's real name. `"No project (company-wide)"` is first and is the default.

**Production is now both**: `/projects/[id]/production` carries the per-job BOMs and cutlists
with the project pinned; `/production` keeps nesting, panel QR traceability and work centres.

### 7.5 The prompt library
`/design/prompts`. Twelve seeded templates with `{{blanks}}`, a vocabulary per blank, and guard
clauses. **"Preserve everything else" is locked on.** No migration (`ai_prompt_templates` already
had a `kind` column) and **no AI call** — assembly is a pure function.

### 7.6 The full end-to-end test
`TEST-REPORT.md` is a route-by-route test of all 74 routes plus a 45-route × 3-persona permission
matrix. Findings 1–4 are fixed; §2's "not covered" list is still owed:

> the quotation builder end to end, the procurement chain (MR → RFQ → PO → GRN → stock), HR,
> inventory movements, design sign-off, saved views, CSV exports, settings.

**The quotation builder and the procurement chain are the two largest untested surfaces, and both
carry money.**

---

## PART 8 — Decisions

### Settled — do not reopen
- **Total Payables** → keep BOTH figures, named apart. `Committed = agreed − disbursed`.
  `Billed` = work signed off. `Dues = billed − disbursed`.
- **Total Receivables** → symmetric. `Contracted` = Σ client contracts. `Billed` = client
  milestones signed off. `Dues = billed − received`. **Do not introduce a third word for either.**
- **Room/fit engine, AI image generation, fabric swapping, 2D→3D, text-to-image** — proposed,
  prototyped and **rejected by the owner**. Do not build them, and do not re-propose them when a
  competitor video shows them. The prompt library is the agreed alternative.
- **Reports are visible to every tier** (7.3).

### Still open — do not settle silently
1. **Vendor Documents.** `project_files.project_id` is NOT NULL and a vendor's GST certificate
   belongs to no project. Relaxing the column or adding a fifth attachment table are both real
   choices.
2. **Inspiration board scope.** A design reference is usually firm-wide, but `/design` is
   project-scoped. Recommended: its own table rather than relaxing a not-null column.
3. **Goods Value** is the ledger's own arithmetic, not FIFO and not weighted average.
4. **`leave_type = 'wfh'` collides with `wfh_requests`.** Legacy rows exist; `leaveKindOf` routes
   them so they cannot eat a leave balance. Migrate, leave readable, or retire?
5. **Are Visit Requests approvable?** `field_visits.status` is a lifecycle with no
   `decided_by`/`decided_at`. Shipped read-only, and the screen says so.
6. **Applying for leave on somebody else's behalf** — the ledger can record it; the policy is unset.
7. **`projects` has no sales owner.** The only owner in the schema is `leads.sales_owner_id`.
8. **The global focus ring is red** — arguably a sixth job for a colour with a closed list of five.

### Out of scope (owner decision)
Client portal · warranty module · telephony/dialer · WhatsApp API ingestion. Calls and lead
capture stay manual. But honour the `client_visible` flags — they drive the Progress Report.

### Parked — do not build, do not delete the placeholders
MB Sheets · 2D → 3D renders · manager dashboard (`TEAM_VIEW_ENABLED = false`) · Quotation 2.0 ·
accounting export · the public tokenised vendor-onboarding form.

---

## PART 9 — If the owner asks what to pick up

Nothing here is scheduled. In rough order of value:

1. **Seed a second demo project.** More of the finished build becomes demonstrable than any new
   feature would add.
2. **Finish the end-to-end test** — the quotation builder and the procurement chain (Part 7.6).
3. **Browser-direct uploads** to Supabase storage, lifting the 4.5 MB production ceiling.
4. Saved views cover only `/finance/payments` and `/finance/receivables`.
5. The `settings.*` surface is the least exercised area of the permission spine.
