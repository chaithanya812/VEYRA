# HANDOFF V9 — VEYRA

**This is the current, authoritative handoff. It is the only one.** It supersedes `HANDOFF-V8.md`
and every other `HANDOFF-*.md` / `START-HERE.md` in the repo root — do not read those. V8's Parts 3–4
were unit briefs for a queue that is now finished; nothing in them is still owed.

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`
Branch: `quotations-v2-plus-fleet` · Live: https://veyra-five-beta.vercel.app

**What changed from V8.** V8 was a queue: a fixed list of units to finish, with an orchestrator
dispatching sub-agents at them. **That queue is empty — Phases 0–12 are complete and deployed.**
V9 is a different kind of document: it is for a session that is going to ADD something the plan never
had. So it drops the unit briefs and keeps what stays true — the rules, the reuse index, the gates,
the mistakes, and the decisions nobody has made yet.

---

# PART 0 — Paste this to start a new session

```
Read HANDOFF-V9.md in full before touching anything. It is short on purpose.

The build is COMPLETE and DEPLOYED — Phases 0-12, live at
veyra-five-beta.vercel.app. You are not finishing a plan; you are adding to a
finished one. So the first question for any request is not "how do I build
this" but "what already does most of this" — Part 3 is the reuse index and it
is not optional reading.

For anything you build:
  1. The pure model first, in lib/<x>-model.ts, WITH TESTS. Arithmetic that
     lives in JSX cannot be tested and will drift.
  2. Then the data layer, through withOrg(). Then the screen.
  3. Every server action gets a can() guard as its FIRST statement.
  4. Run the six gates (Part 5). All six, every time.
  5. OPEN THE BROWSER AND CLICK THE THING. A green gate is not a working
     screen — Part 5.3 explains what that has cost before.
  6. Commit with a message that says WHY the shape is what it is.

Never do without asking: enable RLS, push or deploy, run db.mjs migrate on a
migration you have not shown me, or settle anything in Part 7.

Tell me what you understand the task to be before you start it.
```

---

# PART 1 — What VEYRA is, and where it stands

A CRM/ERP for Indian interior-fit-out firms: leads → quotations → projects → procurement →
site/labour → money. Next.js App Router, TypeScript, Supabase Postgres, Tailwind.
Multi-tenant by `org_id`. **RLS is OFF by owner decision** and `lib/data/with-org.ts` is the only
tenant guard. Login is removed — the app opens straight into the demo tenant as Aditi Pradhan; use
**View as** in the top bar to switch users.

**Phases 0–12 are complete and live.** Every route below works. **Do not rebuild any of it.**

| Area | Routes |
|---|---|
| Sales | `/leads` · `/leads/[id]` · `/leads/insights` · `/pipeline` · `/followups` · `/quotations` (+ builder, templates, compare, `/q/[token]`) |
| Projects | `/projects` · `/projects/[id]` (Summary · Modules · Milestones) |
| Project modules | `/documents` (+ viewer) · `/plan` · `/finance` (+ Audit tab) · `/payments` · `/site` · `/labour` · `/procurement` · `/report` |
| Company-wide | `/procurement` · `/rfq` · `/orders` · `/inventory` · `/finance` · `/vendors` · `/items` · `/design` · `/production` · `/site` · `/approvals` · `/reports` (9 reports, all gated) |
| **Accounting** | `/finance/payments` (matrix + saved views + column chooser + CSV) · `/finance/petty` · `/finance/receivables` (four buckets, write-off/restore) |
| HR | `/hr/attendance` (Attendance · Leaves · WFH · Holidays) · `/hr/attendance/admin` (Approvals · Report) |
| Admin | `/settings` · `/settings/users` · `/settings/roles` (Edit Role) · `/billing` · `/communication` |

**The current baseline. Nothing you do may lower these:**

```
tsc 0 · eslint 0 · 868 tests in 46 files · verify 208/208 · verify-storage 11/11 · build clean
```

**Migrations applied: `0001–0043`. Next free number: `0044`.** Nothing is reserved.

---

# PART 2 — Rules that do not bend

1. **RLS stays OFF.** Never enable it, never write a policy. `withOrg()` is the ONLY tenant guard.
   Every tenant table carries `org_id`, is registered in `lib/data/tables.ts`, and is reached only
   through `withOrg()`.
2. **No LLM ever produces a price, rate, cost, amount or quantity.** Models return structure only; a
   deterministic engine plus tenant config supplies every number. Log every call to `ai_requests`.
3. **Migrations are additive and idempotent**, with
   `org_id uuid not null references public.orgs(id) on delete cascade`.
   **A new table is THREE edits, not one:** the migration, `lib/data/tables.ts`, and org-isolation
   *and* project-isolation assertions in `scripts/verify.mjs`. Miss the second and TypeScript rejects
   `db.table("your_table")` with a wall of union types that looks like a different problem entirely.
4. **Ledgers are append-only.** `payments`, `usage_events`, `audit_events` and `expense_claims` are
   ledgers. A reversal is a NEW row plus a filter — never a delete, never an update that erases.
5. **Projects never share anything.** A folder, a file, a photo, a labour day, a request, a
   warehouse — each belongs to exactly one project, enforced three ways: FK, scoped uniqueness,
   storage prefix.
6. **Totals are derived, never stored.** `verify.mjs` asserts that selecting a stored total FAILS
   (`42703`). Prefer making an invariant unrepresentable over documenting it.
7. **Red has a closed list of five jobs**: the one primary action per view, active navigation,
   destructive actions, genuine alerts, the hero metric. A sixth use is wrong. Status chips are
   grey/amber/green and always carry a label, never colour alone.
8. **Indian market**: GST (HSN/SAC, place-of-supply), Indian-FY numbering, ₹ Indian grouping, DPDP.
9. **Server-action files export only async functions.** Secret keys stay server-side; `admin` is
   lint-restricted to `lib/data/`.
10. **Never push or deploy without the owner.** Local commits are fine. See Part 5.4 — and note that
    pushing is NOT deploying in this project.
11. **Do not use the Supabase MCP** — it authenticates to a different account and every call fails.
    Use `node scripts/db.mjs` and the two verify scripts.
12. **Report a query error as itself.** Never collapse a PostgREST error into a friendlier message
    that names a different cause.
13. **Every server action calls `can()`** as its FIRST statement. Part 3.1. A test enforces this.
14. **The same words must mean the same thing on every screen.** Two of this project's worst bugs
    were one label over two quantities (Part 7 has the settled pair). When you find a collision,
    name it on the screen — do not quietly pick one.

---

# PART 3 — The reuse index. Read this before writing anything.

Most feature requests are already 70% built. Check here first.

| Reuse | For |
|---|---|
| `lib/data/with-org.ts` | ALL data access. **No generic `.delete()`** — only `deleteById(id)` |
| `lib/data/project-files.ts` | `uploadProjectFile({ link })` — one file model. Do NOT add a fifth attachment table |
| `lib/data/config.ts` | `issueDocNumber` / `previewNextNumber`. Issue consumes; preview does not |
| `lib/data/storage.ts` | `storagePath` / `signedUrls` / `ALLOWED_MIME` |
| `lib/can-model.ts` | `CAPABILITIES`, `can`, `resolveRole`, `resolveActor`, `capabilityTree`, `capabilityPath`, `enableAllKeys`, `parseCapability` |
| `lib/finance-model.ts` | all project money: `scheduleTotals`, `actualDueOf`, `rollupContract`, `summarisePlan`, `milestoneOverdue` |
| `lib/payments-ledger-model.ts` | `buildLedger` — hides BOTH halves of a reversed pair and excludes them from the total |
| `lib/payments-dashboard-model.ts` | `paymentsMatrix`, `summariseMatrix`, `filterMatrix`, `describeFilter`, `MATRIX_COLUMNS`, `cellTone` |
| `lib/receivables-model.ts` | buckets, receipt allocation, the receivables band |
| `lib/petty-finance-model.ts` | the petty ledger, per person, over `expense_claims` |
| `lib/saved-views-model.ts` | screen registry, `canonicalQuery`, `parseColumns`, `buildCsv` |
| `lib/material-requests-model.ts` | `stageBreakdown`, `procurementTotals` |
| `lib/labour-model.ts` | `totalOf` / `summarise` — the only places labour is added |
| `lib/inventory-model.ts` | `goodsValue`, `buildWarehouseTree`, `movedQty/Amount`, `lastMovement` |
| `lib/vendors-model.ts` | `vendorProjects`, `vendorProjectTotals`, `categorySummary`, the status ladder |
| `lib/workspace-model.ts` | `sessionHours`, `totalHours`, `openSession`, `wouldCycle`, `managerChain` |
| `lib/hr-model.ts` | the whole HR surface incl. `attendanceCsv` — **the existing CSV convention** |
| `lib/gantt-model.ts` | any time axis |
| `lib/site-photos-model.ts` | `formatPhotoDate` — formats from the STRING, never through a `Date` |
| `components/ui/primitives.tsx` | `Card`, `PageHeader`, `StatusChip`, `EmptyState` |
| `components/ui/skeleton.tsx` | **the ONE skeleton vocabulary.** No `"use client"`, so `loading.tsx` can import it. Compose it; never write a third |
| `components/ui/patterns.tsx` | `SegmentedControl`, `SegmentedCountBar`, `PlannedVsActual`, `MultiValueCell`, `ClientVisibleToggle`, `DateRangeControl` |
| `components/ui/charts.tsx` | `AreaTrend`, `Donut`, `BarList` (for money — keeps the rupee figure visible) |
| `components/ui/button.tsx` | `Button`, **and `asChild`** — see Part 3.2 |
| `components/ui/audit-timeline.tsx` | any audit surface — renders `before → now` per changed field |
| `components/ui/permission-limited.tsx` | `PermissionLimited` (route refusal) · `HiddenValue` (a hidden cost cell) |
| `components/ui/comment-thread.tsx` | files, photos, orders |
| `components/ui/saved-views.tsx`, `column-chooser.tsx` | saved views on any URL-filtered screen |
| `app/(app)/dashboard/workspace-ui.tsx` | `StatTile`, `TileGrid`, `Empty`, `FormError`, `SubmitButton` |

## 3.1 The permission spine — every server action touches this

```ts
// In a server action, as the FIRST statement — before any parse or read:
const denied = await requireCan("procurement.po.approve");
if (denied) return denied;

// In an action consumed as <form action={...}> (must return void):
if (!(await can("procurement.po.approve"))) return;

// In a page, to render a designed refusal instead of a 404:
if (!(await can("reports.financial.view"))) return <PermissionLimited capability="reports.financial.view" />;
```

- A capability is **three segments**, `module.entity.action`, and must exist in `CAPABILITIES`.
  An unknown key **fails closed and refuses everyone, owner included.**
- `lib/can-coverage.test.ts` walks the real files. **A new server action with no guard fails the
  suite**, as does a guard naming an unknown capability, or a guard that is not the first statement.
- **Self-service actions are deliberately ungated** (check in/out, your own leave, your own expense,
  your own petty entry, your own visit, the View-as switch). The exemption list is asserted. The test
  of whether something belongs there: does the action write a row keyed to the ACTING member, taken
  from the session and not from the form? If yes it is self-service; gating it locks a member out of
  their own records.
- `recordAudit({ entity, entityId, action, before, after })` appends to the ledger. It never throws
  and never fails a business write. Capture `before` by reading the row **before** the update.
- **Tiers are the floor.** `org_members.role` is a four-value tier used when a member has no
  `role_id`. `member` excludes every `.approve` capability; owner/admin get everything. **No demo
  member has a `role_id`**, so the floor is what you are testing unless you assign one.

## 3.2 A link that looks like a button

```tsx
<Button asChild variant="primary">
  <Link href="/vendors/new">New Vendor</Link>
</Button>
```

**Never `<Link><Button>…</Button></Link>`.** That nests a `<button>` inside an `<a>` — invalid HTML,
and browsers give it two tab stops, so a keyboard user hits the same control twice. All 57 former
call sites were converted; do not reintroduce the pattern.

---

# PART 4 — How to add a feature

1. **Find what already does most of it** (Part 3). The most common failure mode in this codebase has
   been a second implementation of arithmetic that already existed, which then drifts.
2. **Write the pure model first, in `lib/<x>-model.ts`, with tests.** A screen built before its
   arithmetic is a screen whose arithmetic lives in JSX.
3. **Then the data layer**, through `withOrg()`. Check every `.error`. Return the PostgREST message
   verbatim (rule 12).
4. **Then the screen.** Filter state goes in the URL and is resolved on the SERVER from
   `searchParams` — never in a `useEffect`.
5. **Every server action gets its `can()` guard as the first statement** (3.1).
6. **Run all six gates** (Part 5).
7. **Open the browser and click it** (5.3).
8. **Commit** with a message explaining why the shape is what it is. The commit log is this repo's
   design record — read `git log` before asking why something is the way it is.

If a request needs a schema change: write the migration, register the table, add BOTH isolation
assertions, and **show the owner before running it**.

---

# PART 5 — Gates, verifying, deploying

## 5.1 The six gates

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/next/dist/bin/next build
node scripts/verify.mjs
node scripts/verify-storage.mjs
```

`next build` passing does NOT mean the typecheck passes — Next skips test files. Run both.
`verify-storage` is occasionally flaky at 10/11 against remote storage — re-run before believing a
failure there. After `next build`, `git checkout next-env.d.ts` — the build rewrites its import path
and that churn should never be committed.

## 5.2 Running it

```bash
npm run dev                    # http://localhost:3010
node scripts/db.mjs migrate    # the OWNER runs this
node scripts/db.mjs sql "<query>"
node scripts/seed-demo.mjs     # idempotent; tops up the demo tenant
node scripts/seed-workspace.mjs  # HR data
```

The demo project **Malviya Nagar 3BHK** (`c1d3b37a-9c0c-4263-bfd1-431b935d0597`) carries a
12-milestone plan, six site photos, eight labour days, three material requests, an RFQ, a
partially-delivered PO, two warehouses, three numbered stock notes, and a vendor contract with
signed-off milestones. Its money: client contract ₹18,00,000 with ₹12,60,000 signed off and
₹5,60,000 received; vendor contract ₹2,40,000 with ₹96,000 signed off and ₹50,000 paid.

**Demo org members** — Aditi Pradhan (owner) `ae9569dc-c875-4d80-9129-ca83d169b396` · Meghana Rao
(manager) `18042742-2a71-447d-82c6-2f71d9753916` · Rahul Verma (member)
`8be8a043-1aca-42e9-9230-cc145eff3db1`. Switch with `Cookie: veyra_acting_member=<id>`.

## 5.3 ⚠ The browser pass — mandatory, not optional

**Before you commit, open the screen and use it.**

```
mcp__Claude_Browser__preview_start  { name: "veyra" }
mcp__Claude_Browser__resize_window  { width: 1280, height: 900 }
```

- **Click the primary action and watch what happens to the UI**, not just to Postgres. A write that
  lands while the control reverts is the defect class every fetch-based check misses. It has shipped
  here twice.
- **Then confirm the row** with `db.mjs sql`.
- **Switch users with View as** and confirm the refusal renders.
- **The pane is genuinely flaky.** It stalls on a Suspense fallback after a REPEAT navigation in the
  same tab while the server returns correct HTML with 200 — open a FRESH TAB before concluding you
  found a bug. It also intermittently reports `innerWidth === 0` and every `getBoundingClientRect()`
  as 0×0 across the whole document; check whether the WHOLE ancestor chain is 0×0 before believing a
  sizing bug. Note `innerText.includes("Loading…")` is NOT a stall signal — the skeleton's own
  `sr-only` label says that. Use `[aria-busy="true"]`.

Reading a rendered page without the browser (a 200 with only the shell is a streamed `notFound()` —
check the BODY, not the status code):

```bash
node -e "fetch('http://localhost:3010/projects').then(r=>r.text()).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').slice(0,2000)))"
```

## 5.4 ⚠ Deploying: pushing is NOT deploying

**`git push` does not deploy this project and never has.** The GitHub integration builds every push
and **every one of those builds fails** — seven in a row now — with
`Error: Missing required environment variable: SUPABASE_URL`, because all six Supabase vars are
scoped to **Production only** and the integration builds Preview.

```bash
git push origin quotations-v2-plus-fleet   # source of truth
npx vercel --prod --yes                    # THIS is the deploy
```

Then verify against the LIVE domain, not the build log — fetch a few routes and check the figures,
because a 200 can be a streamed `notFound()`.

**Ask the owner before every deploy.** `main` is untouched; production runs off
`quotations-v2-plus-fleet`, and it reads the SAME Supabase project as local — so a migration is live
the moment you apply it, before any deploy.

### What production is still missing

1. **No AI key.** `AI_GEMINI_API_KEY` is unset, so every AI surface is dead in production. It fails
   *gracefully* — the key is read inside functions, `isAiConfigured()` drives a status line, and the
   call path returns a friendly error rather than throwing. `AI_PROVIDER` defaults to `gemini` and
   the model defaults to `gemini-3.5-flash-lite`, so the key is the ONLY variable needed.
   **Never paste the owner's API key yourself** — hand them `npx vercel env add AI_GEMINI_API_KEY`.
2. **The Preview env scope**, per 5.4. Ticking Preview on the six existing vars makes the Git
   integration work.
3. **Vercel caps a serverless request body at 4.5 MB** while `next.config.ts` sets
   `bodySizeLimit: "26mb"` and `lib/data/storage.ts` allows 25 MB. Uploads over ~4.5 MB fail in
   production while working locally. The real fix is uploading from the browser straight to Supabase
   storage.

---

# PART 6 — Mistakes already made. Do not re-make them.

**Reads**
- **Selecting a column that does not exist empties the WHOLE read, silently.** Known traps:
  `po_lines` has no `received_qty`; `po_receipts` has `received_at` not `received_on`;
  `work_sessions` has `check_in`/`check_out` not `started_at`/`ended_at`; `milestones` and
  `contracts` have `name` not `title`; `contracts` has NO `kind` column (a client contract is
  `vendor_id is null`); `org_members` has `display_name` not `full_name`; `audit_events` has `at`
  not `created_at`. **An unchecked `.error` is a lie with a plausible shape.**
- **`contracts.created_by` holds an AUTH USER id, not an `org_members.id`.** It resolves only by
  joining `org_members.user_id`.
- **A percentage without its denominator is not trustworthy.** Every ratio travels with the two
  numbers it came from.
- **`db.mjs sql` renders a DATE through a JS `Date`, printing it one day early** in IST. Cast it:
  `select holiday_date::text`.
- **`org_members` holds SEVERAL tenants' rows and the demo names REPEAT** — there are four "Rahul
  Verma"s. Picking an id by name alone gets another tenant's member, the `veyra_acting_member`
  cookie is silently ignored, and the page renders as the default user — so **a permission test
  passes while proving nothing**. Always filter by
  `org_id = (select org_id from projects where id='c1d3b37a-9c0c-4263-bfd1-431b935d0597')`.

**Writes**
- A PostgREST bulk insert sends an explicit NULL for a key one row omits, defeating the column
  default and tripping `not null`. **Batch rows need uniform keys.** Only fires on
  `not null` + `default`; a dozen latent non-uniform batches exist and pass because the omitted
  column is nullable.
- Backfills that match on a name plus a sort order mislink. Carry the origin id. **Do not invent
  history to fill a new column** — a row with nothing to recover gets null, not a guess.
- `scope_items.parent_id` cascades on delete. `deleteSection()` detaches children first;
  `verify.mjs` asserts the cascade so nobody "simplifies" it away.
- A rejected attachment must not throw away the record it was attached to. Save the row, attempt the
  file, report a partial success.
- **A composite FK is the only way Postgres can express "same tenant".** `UNIQUE (id, org_id)` plus a
  composite FK is why another tenant's manager cannot approve your leave. Any new FK pointing at
  `org_members` or `roles` should do the same. FKs to `vendors` are plain, by six migrations of
  precedent.

**React / Next**
- **A `"use client"` module's exported CONST is a client reference on the server.** `tsc` passes,
  `next build` passes, every request throws. Vocabulary belongs in the pure model.
- **Client components resolve their tab/filter from the SERVER, not from an effect.**
- **`revalidatePath` does NOT re-render a client component.** After a successful mutation from a
  client component, call `router.refresh()` — otherwise the write lands and the control springs back,
  which reads to the user as a failed save. **Only a browser click finds this.**
- **An uncontrolled form control does NOT re-read the URL on a client-side navigation — `key` it.**
  `defaultChecked`/`defaultValue` apply ON MOUNT ONLY. A hard load is fine, so this is invisible to
  every gate and every fetch. But arriving by a soft navigation (a `<Link>`, a saved-view chip, a
  tile) re-renders the form without remounting it, so the controls keep the PREVIOUS url's state
  while the table shows the new one — and the next submit silently drops the filter. Key the form on
  its resolved state. **Same family as the `revalidatePath` spring-back: state lands, the control
  disagrees, the next interaction destroys it — and only a CLICK AFTER A SOFT NAVIGATION finds
  either.**
- An action consumed as `<form action={...}>` must return `void`.
- Radix dialog contents are not in the server HTML until opened.
- **Bash heredocs choke on long TSX.** Write files with the Write tool; apply surgical edits with a
  small Python script written to the scratchpad and run by path.

**Tests**
- **A green test that examined nothing is the worst outcome available.** A file-walking test on
  Windows CRLF matched `"{\n"` and found nothing, so every assertion passed vacuously. Any
  file-walking test needs a second assertion that it FOUND something (`≥25 files`, `≥140 actions`).
  The same trap bit a verify assertion where a missing table satisfied a bare `!!error` — assert the
  specific SQL error code (`23503`/`23505`/`23514`/`42703`), not merely that something failed.

**Data**
- Demo data can lie, and must be possible. Six leads once carried statuses from a retired ladder; a
  seeded photo once had a site date a week after its upload date.
- **The demo tenant has ONE project and ZERO `project_files`.** Several finished screens therefore
  cannot be demonstrated — the payments matrix is a one-row table, and the file viewer's Audits tab
  has nothing to show. **Seeding a second project would make more of the build demonstrable than any
  new feature.**

---

# PART 7 — Decisions

## Settled — do not reopen

1. **`Total Payables` → keep BOTH figures, named apart.** `Committed` = agreed − disbursed.
   `Billed` = work signed off. `Dues` = billed − disbursed, unchanged.
2. **`Total Receivables` → the same remedy.** `Contracted` = Σ client contracts, the whole
   commitment. `Billed` = client milestones signed off. `Dues` = billed − received.
   Deliberately symmetric with the payables side: *Contracted/Committed* is the whole commitment,
   *Billed* is what has been earned, *Dues* is what is payable now. **Do not introduce a third word
   for either quantity.**

## Still open — do not settle silently

3. **Vendor Documents.** `project_files.project_id` is NOT NULL and a vendor's GST certificate
   belongs to no project. Relaxing the column or adding a fifth attachment table are both real
   choices; the card says so instead of one being made quietly.
4. **`Find Vendors` / `My Business Profile`** — the competitor's marketplace. Not in the plan's
   deliverables; not built.
5. **Goods Value is the ledger's own arithmetic**, not FIFO and not weighted average. Choosing a
   valuation method is a finance decision.
6. **`leave_type = 'wfh'` collides with `wfh_requests`.** Legacy rows exist. `leaveKindOf` routes
   them to the WFH tile so they cannot eat a leave balance, and Approvals labels them "Legacy row".
   That is a safe interim, **not a decision**: migrate, leave readable, or retire?
7. **Are Visit Requests approvable?** `field_visits.status` is a LIFECYCLE with no `decided_by` /
   `decided_at`, so approving one would move a status no row could attribute. Shipped read-only, and
   the screen says so.
8. **Applying for leave on somebody else's behalf.** The audit ledger can record it; *who may do it
   for whom* is a policy nobody has set.
9. **`projects` has no sales owner.** The only owner in the schema is `leads.sales_owner_id`, and a
   project created without a lead has none. Receivables falls back to whoever raised the client
   contract and **says so in the cell**. A real `projects.sales_owner_id` is the honest fix, and it
   needs a backfill policy — a project with no lead has no owner to recover, so the backfill leaves
   it null rather than guessing.
10. **The global focus ring is red** (`app/globals.css`). Arguably a sixth job for a colour with a
    closed list of five. Pre-existing and deliberate-looking; the owner's call.

## Out of scope (owner decision)
Client/customer portal · warranty module · telephony/dialer · WhatsApp API ingestion. Calls and lead
capture stay manual. But honour the `client_visible` flags — they drive the Progress Report.

## Parked — do not build, do not delete the placeholders
MB Sheets · 2D → 3D renders · manager dashboard (`TEAM_VIEW_ENABLED = false`) · Quotation 2.0 ·
accounting export · the public tokenised vendor-onboarding form.

---

# PART 8 — Known gaps, if you want something to pick up

None of this is scheduled. In rough order of value:

1. **Seed a second demo project.** More of the finished build becomes demonstrable than any new
   feature would add. See Part 6, "Data".
2. **Saved views cover only `/finance/payments` and `/finance/receivables`.** `/finance/petty` is
   mixed-permission so one screen capability cannot gate its views honestly, and `/reports` has no
   URL filters yet.
3. **Browser-direct uploads to Supabase storage**, which would lift the 4.5 MB production ceiling.
4. **Empty states that still say "clear the filter" without offering a Clear control** — a few
   remain outside the audited set.
5. **The `settings.*` surface** is the least exercised area of the permission spine.
