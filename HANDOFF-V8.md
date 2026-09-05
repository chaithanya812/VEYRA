# HANDOFF V8 — VEYRA

**This is the current, authoritative handoff. It is the only one.** It supersedes `HANDOFF-V7.md`
and every other `HANDOFF-*.md` / `START-HERE.md` in the repo root — do not read those.

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`
Branch: `quotations-v2-plus-fleet` · Live: https://veyra-five-beta.vercel.app

| Part | What | Who reads it |
|---|---|---|
| **0** | The paste block | you, to start a session |
| **1** | Orchestrator handbook — rules, state, gates, work queue | the orchestrator |
| **2** | Agent playbook — dispatch protocol and report contract | orchestrator + every sub-agent |
| **3** | Phase 11 — Accounting, unit by unit | only the sub-agent doing it |
| **4** | Phase 12 — Reports & polish, unit by unit | only the sub-agent doing it |

**What changed from V7, and why it matters:** V7's sub-agents wrote good code and verified it by
fetching HTML — because V7 told them to. Nobody opened a browser. The code held up under review, but
a whole class of defect (a save that lands in Postgres while the checkbox springs back) is invisible
to a `fetch`. **Part 2 §5 now makes browser verification mandatory, and the orchestrator does its own
click-through before committing.** That is the single substantive change.

---

# PART 0 — Paste this to start a new session

```
Read HANDOFF-V8.md, Parts 1 and 2 only. Stop there — do not read Parts 3-4.

You are the ORCHESTRATOR. Sub-agents write the code; you dispatch, verify and
commit. One sub-agent at a time, never parallel. Work the queue in Part 1 §8
in order, starting from the first unit that is not yet committed.

For each unit:
  1. Dispatch ONE sub-agent by address, using the template in Part 2 §4.
     Do not read the unit brief yourself.
  2. Receive its report.
  3. Re-run the six gates yourself (Part 1 §6) and skim `git diff --stat`.
  4. OPEN THE BROWSER AND CLICK THE THING (Part 1 §7.3). A green gate is not
     a working screen.
  5. Commit, with a message explaining why the shape is what it is.
  6. Dispatch the next unit.

Never delegate: lib/data/with-org.ts, lib/can-model.ts, lib/data/permissions.ts,
the scope_items spine, the vendor portal, `db.mjs migrate`, or any git command.

Tell me where the queue stands before you start.
```

---

# PART 1 — Orchestrator handbook

## 0. Why this handoff is shaped like this

> The orchestrator kept running out of context. Not from reading — *coding*. Every file read, every
> failed typecheck, every 2,000-character page dump lands in the session that is also supposed to
> remember the plan.
>
> **The fix: sub-agents do the reading, the coding and the testing. You dispatch, VERIFY IN A
> BROWSER, and commit.**

### The five rules of this session

1. **One sub-agent at a time. Never parallel.** Sequential agents keep your context small and
   linear. Parallel agents return interleaved reports about files that touch each other, and
   reconciling them costs more than doing the work yourself would have.

2. **Never read a unit brief yourself.** Parts 3–4 are for sub-agents. You dispatch by *address*:
   *"Read HANDOFF-V8.md Part 3, do Unit 2 only."* This is the single biggest context saving.

3. **Your own tool calls should produce small output.** Exit codes, `git log --oneline -1`, the last
   three lines of a test run.

4. **Never take a sub-agent's word for it.** "All six gates pass" is a claim. Re-run them (§6). In
   V7 an agent reported `verify 169/169` and the truth was `166/3`; another reported
   `verify-storage 11/11` on a run that gave `10/11`. Both were honest agents. Neither was right.

5. **A green gate is not a working screen.** V7's biggest gap. The Edit Role checkbox wrote
   correctly to Postgres and *sprang back to unticked* — `tsc`, `eslint`, tests, `verify` and
   `build` were all green, and every fetch-based check passed, because `revalidatePath` invalidates
   the cache without re-rendering the client component. **Only clicking it found that.** §7.3.

---

## 1. What VEYRA is, in six lines

A CRM/ERP for Indian interior-fit-out firms: leads → quotations → projects → procurement →
site/labour → money. Next.js App Router, TypeScript, Supabase Postgres, Tailwind.
Multi-tenant by `org_id`. **RLS is OFF by owner decision** and `lib/data/with-org.ts` is the only
tenant guard. Login is removed — the app opens straight into the demo tenant as Aditi Pradhan; use
**View as** in the top bar to switch users.

---

## 2. Rules that do not bend

1. **RLS stays OFF.** Never enable it, never write a policy. `withOrg()` is the ONLY tenant guard.
   Every tenant table carries `org_id`, is registered in `lib/data/tables.ts`, and is reached only
   through `withOrg()`.
2. **No LLM ever produces a price, rate, cost, amount or quantity.** Models return structure only;
   a deterministic engine plus tenant config supplies every number. Log every call to
   `ai_requests`.
3. **Migrations are additive and idempotent**, with
   `org_id uuid not null references public.orgs(id) on delete cascade`. See §4.
4. **Ledgers are append-only.** `payments`, `usage_events` and `audit_events` are all ledgers. A
   reversal is a new row plus a filter, never a delete.
5. **Projects never share anything.** A folder, a file, a photo, a labour day, a request, a
   warehouse — each belongs to exactly one project, enforced three ways: FK, scoped uniqueness,
   storage prefix.
6. **Totals are derived, never stored.** `labour_entries` has no `total`; `grns` has no `qty` and no
   `amount`. `verify.mjs` asserts that selecting them fails. Prefer making an invariant
   unrepresentable over documenting it.
7. **Red has a closed list of five jobs**: the one primary action per view, active navigation,
   destructive actions, genuine alerts, the hero metric. A sixth use is wrong. Status chips are
   grey/amber/green and always carry a label, never colour alone.
8. **Indian market**: GST (HSN/SAC, place-of-supply), Indian-FY numbering, ₹ Indian grouping, DPDP.
9. **Server-action files export only async functions.** Secret keys stay server-side; `admin` is
   lint-restricted to `lib/data/`.
10. **Never push or deploy without the owner.** Local commits are fine.
11. **Do not use the Supabase MCP** — it authenticates to a different account and every call fails.
    Use `node scripts/db.mjs` and the two verify scripts.
12. **Report a query error as itself.** Never collapse a PostgREST error into a friendlier message
    that names a different cause.
13. **NEW — every server action calls `can()`.** §5a. A test enforces this; a new unguarded action
    fails the suite.

### Out of scope (owner decision)
Client/customer portal · warranty module · telephony/dialer · WhatsApp API ingestion. Calls and lead
capture stay manual. But honour the `client_visible` flags — they drive the Progress Report.

### Parked — do not build, do not delete the placeholders
MB Sheets · 2D → 3D renders · manager dashboard (`TEAM_VIEW_ENABLED = false`) · Quotation 2.0 ·
accounting export · the public tokenised vendor-onboarding form.

---

## 3. Where the build is

**Phases 0–12 are COMPLETE.** Every unit in §8 is committed. There is no queue left — see §8 for what a next session might pick up instead.

Every route below is built and working. **Do not rebuild any of it.**

| Area | Routes |
|---|---|
| Sales | `/leads` · `/leads/[id]` · `/leads/insights` · `/pipeline` · `/followups` · `/quotations` (+ builder, templates, compare, `/q/[token]`) |
| Projects | `/projects` · `/projects/[id]` (Summary · Modules · Milestones) |
| Project modules | `/documents` (+ viewer) · `/plan` · `/finance` (+ **Audit** tab) · `/payments` · `/site` · `/labour` · `/procurement` · `/report` |
| Company-wide | `/procurement` · `/rfq` · `/orders` · `/inventory` · `/finance` · `/vendors` · `/items` · `/design` · `/production` · `/site` · `/approvals` · `/reports` (9 reports, all gated) |
| **HR (Phase 10)** | `/hr/attendance` (Attendance · Leaves · WFH · Holidays) · `/hr/attendance/admin` (Approvals · Report) |
| **Accounting (Phase 11)** | **`/finance/payments`** (matrix + saved views + column chooser + CSV) · **`/finance/petty`** (Dashboard · My Expense · My Fund) · **`/finance/receivables`** (four buckets + write-off/restore) |
| Admin | `/settings` · `/settings/users` (real Manager column) · **`/settings/roles` (Edit Role)** · `/billing` · `/communication` |

**Phase 10, just finished**, in four sentences. HR attendance, leave, WFH and holidays are live, with
approvals as one code path over two tables. The permission spine (`can()`, a closed capability
registry, role inheritance with a cycle guard, the audit ledger) is built and **enforced in 134
server actions**. `/settings/roles` is a real Edit Role screen, so a tenant can finally author the
roles the spine checks. Phase 12 Unit 1 wired all six Reports capabilities to real, gated reports.

---

## 4. Migration ledger

**Applied: `0001–0043`.** (0034/0035 filled V7's reserved gaps; 0040 added `roles.description`;
**0041 added `kind` / `reversal_of` / `vendor_id` to `expense_claims` for Petty Finance**;
**0042 added `written_off_at` / `written_off_by` / `write_off_reason` to `milestones`** — both are
columns on an existing table, deliberately NOT a second ledger.)

**Next free number: `0044+`.** Nothing is reserved.

> ⚠ Part 4 Unit 2 (saved views) still says "migration 0040" — V7 was written before 0040 existed,
> and 0041/0042 have since been consumed. **It means `0043`.**

**A new table is three edits, not one:** the migration, `lib/data/tables.ts`, and an org-isolation
assertion in `scripts/verify.mjs`. Miss the second and TypeScript rejects `db.table("your_table")`
with a wall of union types that looks like a completely different problem.

> **⚠ YOU apply migrations, never a sub-agent.** An agent may *write* the `.sql`; you run
> `node scripts/db.mjs migrate` and you read the result.

---

## 5. Reuse index — do not write a second one

| Reuse | For |
|---|---|
| `components/ui/patterns.tsx` | `SegmentedControl`, `SegmentedCountBar`, `PlannedVsActual`, `MultiValueCell`, `ClientVisibleToggle`, `DateRangeControl` |
| `components/ui/charts.tsx` | `AreaTrend`, `Donut`, `BarList` (for money — keeps the rupee figure visible) |
| `components/ui/primitives.tsx` | `Card`, `PageHeader`, `StatusChip`, `EmptyState` |
| `components/ui/comment-thread.tsx` | files, photos, orders |
| **`components/ui/audit-timeline.tsx`** | **any audit surface — `AuditTimeline` renders `before → now` per changed field** |
| **`components/ui/permission-limited.tsx`** | **`PermissionLimited` (route refusal) · `HiddenValue` (a hidden cost cell)** |
| `app/(app)/dashboard/workspace-ui.tsx` | `StatTile`, `TileGrid`, `FormError`, `SubmitButton` |
| `app/(app)/dashboard/workspace-skeleton.tsx` | the existing skeleton pattern — Part 4 Unit 3 |
| `lib/data/with-org.ts` | all data access. **No generic `.delete()`** — only `deleteById(id)` |
| `lib/data/project-files.ts` | `uploadProjectFile({ link })` — one file model. Do NOT add a fifth attachment table |
| `lib/data/config.ts` | `issueDocNumber` / `previewNextNumber`. Issue consumes; preview does not |
| `lib/data/storage.ts` | `storagePath` / `signedUrls` / `ALLOWED_MIME` |
| `lib/finance-model.ts` | all project money: `scheduleTotals`, `actualDueOf`, `rollupContract`, `summarisePlan`, `milestoneOverdue` |
| `lib/payments-ledger-model.ts` | `buildLedger` — hides BOTH halves of a reversed pair and excludes them from the total |
| `lib/material-requests-model.ts` | `stageBreakdown`, `procurementTotals` |
| `lib/labour-model.ts` | `totalOf` / `summarise` — the only places labour is added |
| `lib/inventory-model.ts` | `goodsValue`, `buildWarehouseTree`, `movedQty/Amount`, `lastMovement` |
| `lib/vendors-model.ts` | `vendorProjects`, `vendorProjectTotals`, `categorySummary`, the status ladder |
| `lib/workspace-model.ts` | `sessionHours`, `totalHours`, `openSession`, `sessionsOnDay`, `wouldCycle`, `managerChain` |
| `lib/hr-model.ts` | the whole HR surface: `attendanceRows/Totals`, `leaveTiles`, `approvalQueue`, `approvalReport`, `holidayCalendar`, `attendanceCsv` |
| **`lib/can-model.ts`** | **`CAPABILITIES`, `can`, `resolveRole`, `resolveActor`, `capabilityTree`, `enableAllKeys`, `parseCapability`** |
| `lib/gantt-model.ts` | any time axis |
| `lib/site-photos-model.ts` | `formatPhotoDate` — formats from the STRING, never through a `Date` |

### 5a. The permission spine — every unit touches this

Built in Phase 10 Units 5–6. **Read this before writing any server action.**

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
  suite**, as does a guard naming a capability the registry does not know, or a guard that is not
  the first statement. If you add a capability, add it to `lib/can-model.ts` first.
- **Self-service actions are deliberately ungated** (check in/out, your own leave, your own expense,
  your own visit, the View-as switch). The exemption list is asserted — gating one of these locks a
  member out of their own attendance.
- `recordAudit({ entity, entityId, action, before, after })` appends to the ledger. It never throws
  and never fails a business write. Capture `before` by reading the row **before** the update.

---

## 6. The six gates

**You run these, after every unit, yourself.**

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/next/dist/bin/next build
node scripts/verify.mjs
node scripts/verify-storage.mjs
```

**Current baseline — nothing may lower these:**
tsc 0 · eslint 0 · **868 tests in 46 files** · **verify 208/208** · verify-storage 11/11 ·
build clean.

`next build` passing does NOT mean the typecheck passes — Next skips test files. Run both.
`verify-storage` is occasionally flaky at 10/11 against remote storage — **re-run before believing
a failure there**, and check whether the diff touched storage at all.

Also required of every unit:
- Every engine is a pure function in `lib/<x>-model.ts` **with tests**.
- Every new table is in `lib/data/tables.ts` and reached only through `withOrg()`.
- `verify.mjs` gains org-isolation assertions for it — and project-isolation assertions too.
- Every new server action is behind `can()` (§5a).
- Red discipline audited (§2 rule 7).

---

## 7. Running and verifying it

```bash
npm run dev                    # http://localhost:3010
node scripts/db.mjs migrate    # YOU run this, never a sub-agent
node scripts/db.mjs sql "<query>"
node scripts/seed-demo.mjs     # idempotent; tops up the demo tenant
node scripts/seed-workspace.mjs  # HR data: sessions, leave, visits, WFH, holidays
```

The demo project **Malviya Nagar 3BHK** carries a 12-milestone plan, six site photos, eight labour
days, three material requests, an RFQ, a partially-delivered PO, two warehouses, three numbered
stock notes, and a vendor contract with signed-off milestones. Six members; **use View as** —
Aditi (owner) has almost no personal HR data, so HR screens look empty as her. Rahul Verma and
Meghana Rao are the ones to test with.

### 7.1 Reading a rendered page

A 200 with only the shell is Next streaming a `notFound()` — check the BODY, not the status code:

```bash
node -e "fetch('http://localhost:3010/projects').then(r=>r.text()).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').slice(0,2000)))"
```

### 7.2 Exercising a server action over HTTP

Pull the action id out of the dev client chunk:

```bash
node -e "(async()=>{const h=await fetch('http://localhost:3010/PAGE').then(r=>r.text());for(const c of [...new Set([...h.matchAll(/\/_next\/static\/chunks\/[^\"']+?\.js/g)].map(m=>m[0]))]){const js=await fetch('http://localhost:3010'+c).then(r=>r.text()).catch(()=>'');const m=/\{\"([0-9a-f]{40,})\":\{\"name\":\"YOUR_ACTION\"\}\}/.exec(js);if(m){console.log(m[1]);break}}})()"
```

Then POST with header `Next-Action: <id>`. For a FormData action, every entry keyed `_1_<field>`
**appended BEFORE** the `0` args key — reversed, every field decodes as null and you get a
misleading validation error. For an action taking plain arguments, the body is just
`JSON.stringify([arg1, arg2])`. Use the DEV ids, not the build manifest's.

**To test as another user, send the acting-member cookie:**
`Cookie: veyra_acting_member=<org_members.id>`. This is how permission refusals are proven.

### 7.3 ⚠ THE BROWSER PASS — mandatory, not optional

**This is the rule V7 was missing.** Before you commit a unit, open the screen and use it.

```
mcp__Claude_Browser__preview_start  { name: "veyra" }     # starts dev + opens the tab
mcp__Claude_Browser__resize_window  { width: 1280, height: 900 }
mcp__Claude_Browser__navigate / computer / find / javascript_tool
```

- **Click the primary action and watch what happens to the UI**, not just to Postgres. A write that
  lands while the control reverts is the defect class every fetch-based check misses.
- **Then confirm the row** with `db.mjs sql`.
- **Switch users with View as** and confirm the permission-limited state renders.
- The pane is genuinely flaky: screenshots time out and need a retry, and it sometimes resets its
  zoom. **When a screenshot looks wrong, check the DOM before believing it** —
  `javascript_tool` with `document.querySelector(...)` is the reliable read. Twice in Phase 10 a
  screenshot showed an unticked checkbox that the DOM reported as `checked: true`.
- A stale dev server from another session will answer on 3010. If fetches behave oddly, confirm
  whose server it is before debugging your own code. If one is already there, `preview_start
  { name: "veyra" }` fails with a port-in-use error and you cannot stop another chat's server —
  use `preview_start { url: "http://localhost:3010/..." }` instead.
- **The pane stalls on "Loading…" after a repeat navigation in the same tab** — first load renders,
  the second (a reload, or a GET-form submit) can sit on the Suspense fallback forever while the
  server is returning complete HTML in ~2s and the network log shows `200 OK`. Seen three times in
  Phase 11. **Open a FRESH TAB before concluding you have found a streaming bug**; a first load of
  the exact same URL renders fine. Discriminate it properly — server fetch, network status, fresh
  tab — because the DOM genuinely reading `Loading…` is stronger evidence than a bad screenshot and
  deserves more than a shrug.

### 7.4 When every route suddenly 404s

Next's generated route manifest can corrupt (`.next/dev/types/routes.d.ts` acquires a truncated
entry, and `next build` fails type-checking a file nobody wrote). Symptom: routes that have always
worked start returning 404 while the index still renders.

```bash
rm -rf .next && node ./node_modules/next/dist/bin/next build
```

This cost an hour in Phase 12 Unit 1. **No application code is at fault — do not go looking.**
Note also that clearing `.next` rewrites the generated `next-env.d.ts` import path; `git checkout
next-env.d.ts` and re-run tsc rather than committing that churn.

---

## 8. The work queue

Dispatch **in order, one agent each**. Do not read the briefs — hand over the address.

### Phase 11 — Accounting · **Part 3**

| Unit | What | Notes |
|---|---|---|
| ~~1~~ | ~~The `Total Payables` rename + the per-project matrix model~~ | **DONE.** Shipped `Committed`/`Billed` per §10.1; `lib/payments-dashboard-model.ts` is the matrix Unit 2 consumes. Also corrected contract-less payments — see the commit. |
| ~~2~~ | ~~`/finance/payments` — the Payments Dashboard with drill-through~~ | **DONE.** Read-only by design — no server action; the route is gated by `can("billing.payment.view")` as the page's first statement. Band = Σ visible rows. |
| ~~3~~ | ~~`/finance/petty` — Petty Finance, extending `expense_claims`~~ | **DONE.** Migration **0041 applied.** Three columns on `expense_claims`, not a second ledger. `recordPettyEntryAction` is self-service and ungated (§5a) because `member_id` comes from the acting context; reverse/decide carry `billing.payment.approve`. |
| ~~4~~ | ~~`/finance/receivables` — Account Receivables~~ | **DONE. Migration 0042 applied.** §10.8 shipped as `Contracted` / `Billed` / `Dues` across all four money screens. Write-off keeps the row and its amount; Restore is audited too. |

**Phase 11 is complete.** All four units are committed and the money vocabulary is now consistent
across `/finance/receivables`, `/finance/payments`, `/projects/[id]/finance`, `/projects/[id]/payments`
and the project Summary band.

> **THE QUEUE IS EMPTY.** Every unit below is committed. What a next session might pick up, in
> rough order of value — none of it is scheduled, and the first two are the owner's call, not an
> agent's:
> 1. **Deploy.** §9 — Phases 9-12 are committed locally and NOT deployed; the owner authorised
>    publishing through Phase 8 only. Production also still lacks the `GEMINI_*` / `AI_*` env vars,
>    so every AI surface fails there.
> 2. **The still-open decisions in §10** — vendor documents (2), the marketplace (3), the goods-value
>    method (4), the legacy `wfh` leave rows (5), whether visit requests are approvable (6), applying
>    for leave on someone's behalf (7), and the sales owner column (9).
> 3. **`<Link><Button>` is two tab stops and a button inside a link** (invalid HTML), across ~50 call
>    sites. Found by Unit 4, not fixed because it needs a `Button asChild` / `buttonClasses` API
>    change. This is the largest remaining a11y item.
> 4. **Saved views cover only `/finance/payments` and `/finance/receivables`.** `/finance/petty` is
>    mixed-permission and `/reports` has no URL filters yet.
> 5. **The demo tenant has ONE project and ZERO `project_files`**, so several finished screens cannot
>    be demonstrated — the matrix is a one-row table and the file viewer's Audits tab has nothing to
>    show. Seeding a second project would make more of the build demonstrable than any new code.

### Phase 12 — Reports & polish · **Part 4**

| Unit | What | Notes |
|---|---|---|
| ~~1~~ | ~~Wire the six Reports permission groups~~ | **DONE — committed `b61e791`** |
| ~~2~~ | ~~Saved views · column chooser · CSV export~~ | **DONE. Migration 0043 applied.** Adopted on `/finance/payments` and `/finance/receivables` only — **`/finance/petty` and `/reports` are NOT done** (petty is mixed-permission, `/reports` has no URL filters yet). A saved view is a named query string; the chosen columns ride in it. |
| ~~3~~ | ~~Skeleton loading + designed empty states on every list~~ | **DONE** (in two halves — `f960a63` and the commit after it). `components/ui/skeleton.tsx` is the ONE skeleton vocabulary — no `"use client"`, so `loading.tsx` can import it. **Compose it; never write a third.** 15 routes now carry a `loading.tsx` with a route-specific `sr-only` label. `EmptyState` gained `compact`, and `workspace-ui.tsx`'s `Empty` (21 call sites) delegates to it, so the copy rules live in one place. |
| ~~4~~ | ~~Accessibility floor + full red-discipline audit~~ | **DONE.** Refusals now name all three levels (`Finance → Payments → View`) via the new pure `capabilityPath()`. Four unkeyed GET filter forms fixed (the brief named two; there were four). Red fell, never grew. ~~**Two things Unit 3 found and left for you.**~~ *(both fixed)* (a) **Dead-end empty copy** — `/projects` and `/orders` filtered empties say "clear the filter" with no Clear control in the box, and ~8 `Empty` call sites are bare facts with no way forward ("No leave requested", "No claims awaiting you", "No clauses yet", "No prompts saved", "Nothing has happened yet" — panels-my/team, settings/quotations, lead-detail). An empty state that only reports emptiness leaves the reader where it found them. (b) **`/vendors` and `/orders` GET filter forms use `defaultValue`/`defaultChecked` with NO `key`** — the §11 family. It does not reproduce today because their Reset is a hard navigation, but it is latent the moment either becomes a soft nav; key them like the `/finance/*` forms. **Known defect to fix here:** `components/ui/permission-limited.tsx` renders `${label} (${group})` and DROPS `parent`, so `billing.payment.view` refuses with "It needs the View (Finance) permission" — the word *Payments* is lost, and `billing.invoice.view` would read "View (Invoice)". Cosmetic, but it makes the refusal hard to act on, and it is wrong on **every** gated screen. Found in Phase 11 Unit 2; not fixed there because it changes copy app-wide. |

---

## 9. Deployment state

**`4a9d863` (Phases 0–12, the whole build) is pushed to `origin/quotations-v2-plus-fleet` and LIVE
in Vercel production** at https://veyra-five-beta.vercel.app, deployment `dpl_ETU8994…`, reading the
same Supabase project the local app does. `main` is still untouched. Deployed 2026-09-05 on the
owner's explicit instruction. **Still ask before the next one.**

Migrations 0041–0043 were applied before the deploy, and production shares that database, so the
schema was already live when the code arrived.

### ⚠ How to deploy: NOT by pushing

**`git push` does NOT deploy this project.** The GitHub integration builds every push and **every
one of those builds fails** — six in a row now — with:

```
Error: Missing required environment variable: SUPABASE_URL
```

The env vars are scoped to **Production only**, so the Preview builds the GitHub integration creates
have none. Every successful production deploy in this project's history was made from the CLI:

```bash
npx vercel --prod --yes      # from the repo root; .vercel/project.json links the project
```

Push for the source of truth, then deploy with the CLI. Expect a red preview build in the Vercel
dashboard afterwards — it is that env-var scope gap, not your code. **The real fix is to add the
Supabase vars to the Preview scope too**; until someone does, the Git integration is decorative.

### Three things production is missing. Fix them with the owner, not silently:

1. **No `GEMINI_*` / `AI_*` env vars in Vercel** — every AI surface fails in production until the
   owner adds them. Do not paste their API keys yourself. They fail *gracefully*: the keys are read
   inside functions, `isAiConfigured()` drives a status line, and the call path returns a friendly
   error rather than throwing, so this is a dead feature and not a broken deploy.
2. **Vercel caps a serverless request body at 4.5 MB** while `next.config.ts` sets
   `bodySizeLimit: "26mb"` and `lib/data/storage.ts` allows 25 MB. Any upload over ~4.5 MB fails in
   production while working locally. The real fix is uploading from the browser straight to Supabase
   storage.
3. **The Preview env scope**, per the box above.

---

## 10. Open decisions

### Settled — do not reopen

1. **`Total Payables`. SETTLED 2026-09-04: keep BOTH figures and rename them.** Neither reading
   wins, because both are real and both are wanted; the bug was one label over two meanings. Ship
   **`Committed`** for `agreed − disbursed` (frame `110234`'s reading) and **`Billed`** for what
   `lib/finance-model.ts::summarisePlan` currently calls `totalPayables`. *Dues* is unchanged — both
   screens already agree on it. **Part 3 Unit 1 implements this; it does not choose.**

8. **`Total Receivables` — the receivables twin of the above. SETTLED 2026-09-04 by the owner: the
   same remedy, keep BOTH figures and rename them.** Found doing Phase 11 Unit 1: two screens used
   the same two labels for different numbers on the same project — the Summary band showed
   ₹18,00,000 (Σ client-contract value) with dues ₹12,40,000, while Financial Planning showed
   ₹12,60,000 (signed-off client milestones) with dues ₹7,00,000.

   Ship **`Contracted`** for the sum of client contracts (₹18,00,000 — the whole client commitment)
   and **`Billed`** for client milestones signed off (₹12,60,000). **`Receivable Dues` is unchanged
   and means `billed − received`** (₹7,00,000). This is deliberately symmetric with §10.1, so both
   halves of the money model read the same way: *Contracted/Committed* is the whole commitment,
   *Billed* is what has been earned, *Dues* is what is payable now.

   **Part 3 Unit 4 implements this; it does not choose.** Do not re-litigate, and do not introduce a
   third word for either quantity.

### Still open — do not settle silently

2. **Vendor Documents.** `project_files.project_id` is NOT NULL and a vendor's GST certificate
   belongs to no project. Relaxing the column or adding a fifth attachment table are both real
   choices; the card currently says so instead of one being made quietly.
3. **`Find Vendors` / `My Business Profile`** — the competitor's marketplace. Not in the plan's
   deliverables; not built.
4. **Goods Value is the ledger's own arithmetic**, not FIFO and not weighted average. Choosing a
   valuation method is a finance decision.
5. **`leave_type = 'wfh'` collides with `wfh_requests`.** 0023 seeded a `wfh` leave type; 0034 gave
   WFH its own table, because a WFH day is not leave — the person worked, and it must not be
   deducted from an entitlement. Legacy rows still exist (Karthik has one).
   `lib/hr-model.ts::leaveKindOf` routes them to the WFH tile and never to paid leave, so they
   cannot eat a balance, and the Approvals screen labels such a row "Legacy row". That is a safe
   interim, **not a decision**: the owner must say whether they are migrated, left readable, or
   retired.
6. **Are Visit Requests approvable?** The Approvals frame implies yes, but `field_visits.status` is
   a LIFECYCLE (`planned|in_progress|completed|cancelled`, no CHECK) and carries no `decided_by` /
   `decided_at` / `decision_note`. Approving one would move a status no row could attribute. Phase
   10 shipped it read-only and says so on screen.
7. **Applying for leave on somebody else's behalf.** The audit ledger now exists to record it, but
   *who may do it for whom* is a policy nobody has set. The Approvals screen says so.
*(§10.8 was here and is now SETTLED — it has moved up into "Settled — do not reopen" above, keeping
its number so existing `§10.8` references still resolve.)*

9. **`projects` has no sales owner.** Found doing Phase 11 Unit 4. Frame `110534` wants a Sales Owner
   per receivable, but the only owner in the schema is `leads.sales_owner_id`, and a project created
   without a lead has none — the demo project is exactly that case. The screen currently falls back
   to whoever raised the client contract and **says so in the cell** ("raised the contract — this
   project has no lead to take an owner from") rather than implying an ownership that does not
   exist. A real `projects.sales_owner_id` is the honest fix, and it is a schema change plus a
   backfill policy (**§11: do not invent history to fill a new column** — a project with no lead has
   no owner to recover, so the backfill has to leave it null, not guess).

---

## 11. Mistakes already made — every unit brief cites this section

**Reads**
- **Selecting a column that does not exist empties the WHOLE read, silently.** `po_lines` has no
  `received_qty`; `po_receipts` has `received_at`, not `received_on`; **`work_sessions` has
  `check_in`/`check_out`, NOT `started_at`/`ended_at`**; **`milestones` and `contracts` have `name`,
  not `title`**. The last two were caught in Phase 12 Unit 1 only because the figures were
  cross-checked against raw SQL — the code typechecked perfectly and would have shown every user
  zero hours. An unchecked `.error` is a lie with a plausible shape.
- **A percentage without its denominator is not trustworthy.** Every ratio travels with the two
  numbers it came from.
- **The same words can mean different things on two screens.** When you find a collision, name it on
  the screen — do not quietly pick one.
- **`db.mjs sql` renders a DATE through a JS `Date`, printing it one day early** in IST. Cast it:
  `select holiday_date::text`. Otherwise a correct screen looks like an off-by-one.
- **`contracts.created_by` holds an AUTH USER id, not an `org_members.id`.** It only resolves by
  joining `org_members.user_id`. Joining it straight onto `org_members.id` returns nothing and looks
  like missing data. Found in Phase 11 Unit 4.
- **`org_members` contains several tenants' rows and the demo names REPEAT across them** — there are
  four "Rahul Verma"s. Picking an id by name alone gets you another tenant's member, the
  `veyra_acting_member` cookie is then ignored, and the page silently renders as the default user, so
  a permission test **passes while proving nothing**. Always filter by the demo `org_id`:
  `where org_id = (select org_id from projects where id='c1d3…')`. This cost a false "the agent's
  permission claim does not reproduce" in Phase 11 Unit 4 — the claim was right and the test was wrong.

**Writes**
- A PostgREST bulk insert sends an explicit NULL for a key that one row in the batch omits,
  defeating the column default and tripping `not null`. **Batch rows need uniform keys.** This bit
  again in Phase 10 Unit 1: one non-uniform `holidays` batch surfaced as three unrelated-looking
  assertion failures because the insert's `.error` went unchecked. It only fires on
  `not null` + `default`. Twelve other non-uniform batches are known and latent —
  `verify.mjs:55, 103, 166, 312, 409, 521, 651, 676` and `seed-demo.mjs:315, 321, 337, 568` — each
  omitting a NULLABLE column, which is why they pass.
- Backfills that match on a name plus a sort order mislink. Carry the origin id. **Do not invent
  history to fill a new column.**
- `scope_items.parent_id` cascades on delete. `deleteSection()` detaches children first;
  `verify.mjs` asserts the cascade so nobody "simplifies" it away.
- A rejected attachment must not throw away the record it was attached to. Save the row, attempt the
  file, report a partial success.
- **A composite FK is the only way Postgres can express "same tenant".** 0035 added
  `UNIQUE (id, org_id)` plus composite FKs so another tenant's manager cannot approve your leave.
  Any new FK pointing at `org_members` or `roles` should do the same.

**React / Next**
- **A `"use client"` module's exported CONST is a client reference on the server.** `tsc` passes,
  `next build` passes, every request throws. Vocabulary belongs in the pure model.
- **Client components resolve their tab from the SERVER, not from an effect.** Every tabbed screen
  takes an `initialTab` prop read from `searchParams`.
- **An uncontrolled form control does NOT re-read the URL on a client-side navigation — `key` it.**
  `defaultChecked` / `defaultValue` apply **on mount only**. A hard page load is always fine, so this
  is invisible to `fetch`, to `next build` and to every gate. But arriving by a soft navigation — a
  `<Link>`, a saved-view chip, a bucket tile — re-renders the form *without remounting it*, so the
  controls keep the PREVIOUS url's state while the table shows the new one. On `/finance/payments`
  this meant landing on a saved view carrying `dues=1` showed the filter applied in the chip with its
  checkbox **unticked**, and the next press of Filter silently dropped it — a filter destroyed by an
  ordinary click. Fix: `key` the form on the resolved state
  (`key={`${stages.join(",")}|${q}|${duesOnly}`}`) so it remounts whenever the URL changes.
  All three finance screens now do this. **This is the same family as the `revalidatePath`
  spring-back: state lands, the control disagrees, the next interaction destroys it — and only a
  CLICK AFTER A SOFT NAVIGATION finds either.** Clicking the control on a freshly loaded page is not
  enough.
- **`revalidatePath` does NOT re-render a client component.** It invalidates the cache; the
  component still holds the props it was rendered with. After a successful mutation from a client
  component, call `router.refresh()` — otherwise the write lands and the control springs back, which
  reads to the user as a failed save. **Only a browser click finds this.**
- An action consumed as `<form action={...}>` must return `void`. Adding an `{ error }` return to
  one is a type error at the call site — `tsc` caught 20 of them at once in Phase 10 Unit 6.
- Radix dialog contents are not in the server HTML until opened — hence §7.2.
- **Bash heredocs choke on long TSX.** Write files with the Write tool; apply surgical edits with a
  small Python script written to the scratchpad and run by path. Beware escaping: a botched
  `\r\n` in a Python replacement wrote literal newlines into a test file in Phase 10.

**Tests**
- **A green test that examined nothing is the worst outcome available.** `lib/can-coverage.test.ts`
  walks real files, and on Windows the working tree is CRLF — a walker matching `"{\n"` found
  nothing and every assertion passed vacuously. It now normalises line endings *and* asserts it
  found 25+ files and 140+ actions. Any file-walking test needs that second assertion.

**Data**
- Demo data can lie, and must be possible. Six leads once carried statuses from a retired ladder;
  a seeded photo once had a site date a week after its upload date.
- **The demo tenant has ZERO `project_files`.** The project-file viewer's `Audits` tab is wired to
  the real ledger but cannot be demonstrated. If a unit needs it, seed a file first.

---
---

# PART 2 — Agent playbook

## 1. Sequential, never parallel

**One sub-agent at a time.** Not a performance choice — a context choice. Parallel agents come back
with interleaved reports about files that touch each other. Sequential keeps the loop linear:

```
dispatch → short report → re-run gates → BROWSER PASS → git diff --stat → commit → next
```

## 2. What must never be delegated

| Never delegate | Why |
|---|---|
| Anything touching `lib/data/with-org.ts` | With RLS off, this file *is* tenant isolation. |
| **`lib/can-model.ts` and `lib/data/permissions.ts`** | The security boundary. A permission that silently fails open is worse than no permission. |
| The `scope_items` spine | Every module's line table points at it. |
| The public tokenised vendor portal | Unauthenticated, public surface. |
| `node scripts/db.mjs migrate` | An agent may *write* the `.sql`; you run it and read the result. |
| `git commit` / `git push` | You write the message. Never push without the owner. |

## 3. The dispatch

**Do not paste the brief. Hand over its address.**

```
Read HANDOFF-V8.md Part 3 and do UNIT 2 only. Do not start any other unit.

Also read, before writing code:
  - HANDOFF-V8.md Part 1 §2 (rules), §5 (reuse index), §5a (the permission
    spine — every server action you write needs a can() guard), §6 (gates),
    §7 (verifying, including the MANDATORY browser pass), §11 (mistakes)
  - HANDOFF-V8.md Part 2 §4-§6 (your protocol and report shape)

Constraints:
  - Do not run `git commit`, `git push`, or `node scripts/db.mjs migrate`.
  - Do not edit lib/data/with-org.ts, lib/can-model.ts or lib/data/permissions.ts.
  - Stop and report if the unit needs a schema change its brief does not name.

Baseline that must not drop: tsc 0 · eslint 0 · 729 tests in 42 files ·
verify 186/186 · verify-storage 11/11 · build clean.

Report in the exact shape in Part 2 §6. Keep it under 40 lines.
```

### Follow-ups

If a unit comes back failing, **do not spawn a fresh agent** — it re-derives everything from cold.
Send the failure to the same agent with the 5 relevant lines, not the whole wall.

## 4. The sub-agent's protocol

1. **Read your unit's brief in full**, then the Part 1 sections listed in the dispatch.
2. **Open only the files the brief names.** If you need one it does not name, open it — but that is
   a signal the brief is wrong, and it goes in your report.
3. **Open a screenshot only if the brief's written description leaves you unable to picture the
   screen.** Frames live in `temp folder 1/Screenshot 2026-08-27 <frameid>.png`.
4. **Write the pure model first, with its tests.** A screen built before its arithmetic is a screen
   whose arithmetic lives in JSX.
5. **Then the data layer, then the screen.** Every server action gets its `can()` guard as the
   first statement (§5a).
6. **Run the six gates.** Fix what you broke.
7. **Do the browser pass (§5 below).** Not optional.
8. **Report. Stop. Do not commit.**

## 5. What a sub-agent must do before reporting

**The six gates**, then **verify against the running app** — and verification now has two halves,
both required.

**Half one, the data.** Fetch the page and strip tags to confirm it renders real figures; POST the
server action and confirm the row with `db.mjs sql`. Quote the actual numbers.

**Half two, the browser.** Open it (`preview_start { name: "veyra" }`), resize to 1280×900, and
**click the thing you built**. Then say what you clicked and what happened.

> A save that lands in Postgres while the control springs back passes every fetch-based check ever
> written. That exact defect shipped in Phase 10 and was found only by clicking a checkbox. If your
> unit has a control, you clicked it, or you did not verify it.

When a screenshot looks wrong, read the DOM with `javascript_tool` before reporting a bug — the
pane's screenshots are flaky and have twice shown stale state.

The orchestrator re-runs all six gates and repeats the browser pass anyway. That is not distrust —
a green report and a green build are different claims, and only one is checkable.

## 6. The report contract

**Under 40 lines. No code blocks longer than five lines. No file dumps.**

```
UNIT: <part / unit number / one-line title>
STATUS: done | done-with-caveats | blocked

GATES
  tsc <n> · eslint <n> · tests <n> in <n> files · verify <n>/<n>
  verify-storage <n>/<n> · build <clean|failed>

FILES
  <path> — <what changed, one line>            (new files marked NEW)

SCHEMA
  <migration file written, if any — say explicitly that you did NOT run it>

VERIFIED IN THE APP
  <what you fetched or POSTed, and the actual figure/row that came back>

VERIFIED IN THE BROWSER
  <what you clicked, what the screen did, and what the row said afterwards>

DECISIONS I MADE
  <anything the brief did not settle, and what you chose>

PROBLEMS FOUND
  <bugs in existing code, brief inaccuracies, or "none">

NOT DONE
  <anything in the unit you did not finish, and why>
```

**`VERIFIED IN THE BROWSER` is the section that matters most.** "The page renders" is not a finding.
"Clicked Enable All on Leads; view/create/edit ticked, Delete stayed unticked, and
`permissions` gained three rows with no `leads.lead.delete`" is.

**`PROBLEMS FOUND` is not optional.** If the brief said a column existed and it did not, say so.

## 7. What the orchestrator does with a report

1. **Re-run the six gates.** Small output, and the only real check.
2. **`git diff --stat`** — files the report did not mention are the interesting ones.
3. **Do your own browser pass.** Click the primary action. This is where you catch what the agent's
   fetch-based check could not.
4. **Spot-check one claim** from `VERIFIED IN THE APP`, usually one `db.mjs sql` query.
5. **Read `DECISIONS I MADE` properly.** This is where an agent quietly settles something that was
   the owner's call. Anything belonging in §10 goes there before you commit.
6. **Commit**, with a message that says what changed and *why the shape is what it is* — the commit
   log is the design record in this repo.

## 8. Writing a new unit brief

Each unit should be **one sitting**, **self-contained** (names every file to open, describes every
frame in words), **explicit about what already exists**, and **explicit about what is NOT in scope**
and what must be escalated rather than settled. End it with the standard tail.

---
---

# PART 3 — Phase 11: Accounting & Finance

**Source of record:** `PLAN-V4.md §12`, frames `110458` `110521` `110534`.

The owner: *"I want to keep the whole system interconnected… got to make it simple, but keep it
interconnected."* Sub-modules: **Petty Expenses · Approvals · Payments · Account Receivables.**

## What already exists (do not rebuild)

| Thing | Where |
|---|---|
| `contracts` (`vendor_id`, `project_id`, `amount`, `source`, `name`, `notes`) | 0015 / 0028 / 0030 |
| `milestones` — the PAYMENT schedule (`name`, `pct`, `amount`, `tentative_due`, `work_done`, `actual_due`, `seq`) | 0015 |
| `payments` — the append-only ledger (`vendor_id`, `member_id`, `expense_type`, `category`, `reversal_of`, `project_id`, `project_label`, `direction`) | 0037 |
| `expense_claims` (`member_id`, `project_id`, `spent_on`, `amount`, `category`, `status`, `decided_by`) | 0023 |
| `summarisePlan`, `rollupContract`, `scheduleTotals`, `actualDueOf`, `milestoneOverdue` | `lib/finance-model.ts` |
| `buildLedger` — hides **both** halves of a reversed pair | `lib/payments-ledger-model.ts` |
| `vendorProjects`, `vendorProjectTotals` | `lib/vendors-model.ts` |
| `projectProfitability()` | `lib/data/reports.ts` — **still string-joins `projects.name === payments.project_label`** |
| `clientSummary()` — per-client value/received/outstanding | `lib/data/reports.ts` (Phase 12 Unit 1) |
| Project Financial Planning, with an **Audit** tab | `app/(app)/projects/[id]/finance/` |
| Nav entry `Account Receivables → /finance/receivables` | `lib/nav.ts`, marked `soon: true` |

**⚠ `milestones` (0015, payment schedule) and `project_milestones` (0032, delivery schedule) are two
tables on purpose.** Merging them would mean a project's plan and its invoicing could never
disagree, and on a real site they always do. `verify.mjs` asserts they stay separate.

**⚠ Capabilities you will need already exist** (Part 1 §5a): `billing.payment.view`,
`billing.payment.create`, `billing.payment.approve`, `billing.cost.view`, `billing.invoice.view`,
`billing.invoice.create`, `reports.payment.view`, `reports.financial.view`. If your unit needs a
capability that is not in `lib/can-model.ts`, **stop and report it** — the orchestrator owns that
file.

---

## UNIT 1 — The `Total Payables` rename, then the matrix model

### The decision is MADE. You implement it; you do not choose.

Frame `110234` and `lib/finance-model.ts::summarisePlan` used the words `Total Payables` for two
different quantities. From the frame's own three rows:

```
Sudha Interior   agreed 27,000 · disbursed 13,500 · payables 13,500 · dues 0
Daizy Interiors  agreed 51,200 · disbursed 0      · payables 51,200 · dues 7,100
project-1wh5kos  agreed 0      · disbursed 1,000  · payables -1,000 · dues -1,000
```

Only one pair of formulas fits all three:

```
agreed - disbursed   (the whole remaining commitment)
billed  - disbursed  (payable right now)  <- both screens already agree on this one
```

**The owner settled it on 2026-09-04: keep BOTH figures and rename them.** Neither reading wins,
because both are real and both are wanted; the bug was one label over two meanings.

- **`Committed`** = `agreed - disbursed` — what you still owe this vendor over the life of the job.
- **`Billed`** = what `summarisePlan` currently calls `totalPayables`.
- **`Dues`** = `billed - disbursed`. Unchanged. Both screens already agree.

**Do this:**
- Rename `summarisePlan`'s `totalPayables` field to `billed`, and ADD a `committed` field. The
  rename must be mechanical and complete, **with the tests updated in the same commit.**
- Update every caller. The project Financial Planning screen is the main one — check for others.
- `lib/vendors-model.ts::vendorProjectRow` loses its "the two screens disagree" comment, because
  they no longer do. **Both labels now appear on screen**, so a reader can see the difference
  rather than having to know it.
- **Do not** leave the codebase with one word meaning two things, and do not delete either figure.

### Then the model

`110458`'s matrix, as a pure function in `lib/payments-dashboard-model.ts` **with tests**.

Per project: `Client Name · Project Name · Project Value · Funds Received · Total Receivables ·
Receivable Dues · Estimated Expenses · Disbursed Amount · Committed · Billed · Dues ·
Cash Flow · Expected P&L`.

Every figure is `summarisePlan` applied per project — **do not write a second money model.** The
function's job is to group contracts/milestones/payments by `project_id` and call the existing one.

The summary band above it: `Total Projects · Expected P&L · Project Value`, then an **Inflow** group
(`Total Receivables · Funds Received · Receivable Dues`) and an **Outflow** group (`Est Expenses ·
Disbursed · Committed`). These are sums of the rows — **and a test must assert that the band equals
the sum of the visible rows under every filter**, because a header that disagrees with its own
table is the single worst thing a finance screen can do.

**The real `project_id` FKs this needs are already in place (0028).** `projectProfitability()` in
`lib/data/reports.ts` still string-joins on the label — **fix it in this unit**, or delete it if the
new model supersedes it. Report which you did. Note that `clientSummary()` (Phase 12 Unit 1)
deliberately honours BOTH the FK and the legacy label, so if you change the resolution rule, change
it there too or the two reports will disagree about the same rupee.

**No new tables. No migration.**

---

## UNIT 2 — `/finance/payments` (Payments Dashboard)

**Depends on Unit 1 being committed.**

### Frame `110458` in words

Header `Payments Dashboard`, `Import Payments` (outlined), and the note `Auto refreshes after 24
hours`. **`Summary Applied Filters:` shows the active filter as a chip** — `Project Stage: Planning
+ 13`. That chip matters: a summary band that does not say what it is filtered to is a number
without a denominator.

Then the summary band and the per-project matrix from Unit 1. **Cells are tinted** — receivables
green, dues amber, negatives red. Several cells carry a **drill-through arrow** to that project's
own Payments module.

### Build

- The applied-filter chip is **not optional**. If the table is filtered, the band says so.
- Tinting follows Part 1 §2 rule 7: green for received, amber for pending, red **only** for a
  genuine negative (over-disbursed, negative cash flow). A whole column of red is a bug in the
  design, not a data insight.
- Drill-through goes to `/projects/<id>/payments`, which already exists.
- Numeric columns right-aligned, tabular figures, ₹ with Indian grouping (`inr()` in
  `lib/utils.ts`).
- The table is wide — sticky header, sticky first column, horizontal scroll **inside the table's own
  container**, never the page body.
- Filter state resolves from `searchParams` on the SERVER, never in a `useEffect`.
- Gate the route on `billing.payment.view`; render `PermissionLimited`, not a 404.
- **`Import Payments` is not in scope.** Ship the button disabled with a title saying so, or omit
  it — do not build a half-import.

**Verify in the app:** fetch the page and quote the band figures and one project row, then check
that row against `db.mjs sql` over `contracts`/`payments`. **The band must equal the rows.**
**Then in the browser:** apply a filter and confirm the chip appears AND the band figures move with
it; click a drill-through arrow and confirm it lands on the right project.

---

## UNIT 3 — `/finance/petty` (Petty Finance)

**Depends on nothing in this part.**

### Frame `110521` in words

Header `Petty Finance`, a centre toggle **`All Expenses` | `All Funds`**, and `Approvals`
(outlined). Tabs **Dashboard · My Expense · My Fund** — the owner: *"imagine I click a person's
name… I get petty finance, my dashboard, my expense, my fund."*

**Left rail:** a `[Month) (Year]` stepper · a user search · a **Summary card**
(`Balance` / `Expense` / `Fund`) · then **per-user cards**, each with a balance chip and
expense/fund lines. **Clicking a user scopes the whole page to them.**

**Right:** summary tiles (`Overdrawn Balance` · `Total Expenses` · `Total Funds`) ·
**a `View Reversed Transactions` checkbox** · a ledger `ID · User Name · Project Name ·
Transaction Date · Recorded Date · Amount · Category · Vendor`.

**Note `Deleted Project` appears as a project name.** Soft-deleted projects must still render in the
ledger — the money is real even when the project is gone.

### Build

- **Extend `expense_claims` (0023). Do not duplicate it.** If it needs a column, add one in
  migration **0041** — and say in your report that you did NOT run it.
- **Reuse `buildLedger` from `lib/payments-ledger-model.ts`** for the reversed-transactions
  checkbox. It already hides *both* halves of a reversed pair and excludes them from the total in
  either mode — that is the whole point of it, and re-implementing it will get the totals wrong.
- Transaction Date is typed by a person; Recorded Date is stamped. They are different columns and
  the frame shows both. **Never derive one from the other.**
- A project that no longer resolves renders its name as the frame does, not as a blank cell.
- Per-user scoping is a URL parameter, so the scoped view is shareable and verifiable by fetching
  HTML.
- `submitExpenseAction` is **self-service and deliberately ungated** (Part 1 §5a) — do not add a
  guard to it. Anything that acts on somebody *else's* claim needs `billing.payment.approve`.

**Verify in the browser:** tick `View Reversed Transactions` and confirm both halves of a reversed
pair appear and the total does NOT change; click a user card and confirm the whole page scopes.

---

## UNIT 4 — `/finance/receivables` (Account Receivables)

**Depends on Unit 1's rename only.** The cheapest unit in the phase.

### Frame `110534` in words

Header `Account Receivables`, a filter, `Auto refreshes after 24 hours`. Four tiles, each showing
`n Milestones | ₹`:

- **`Overdue Payment`** · **`Milestone Overdue`** · **`Upcoming Milestone`** ·
  **`Written Off Payments`**

Table: `Project Name · Sales Owner · Milestone (%) · Due Date · Amount · Pending · Received ·
Action`. **`Amount` cells green-tinted, `Pending` amber-tinted.** Milestone names read like
`Design Signoff (20%)`, `Hand Over (50%)`.

### Build

> **This reads directly off the `milestones` rows Phase 8 §9.3 already writes. Nothing is
> re-entered.** That is the interconnection the owner asked for — say so in the page's own comment
> header.

- The four tiles are four filters over one set of milestones. **`Overdue Payment` and `Milestone
  Overdue` are different questions**: one is a payment past its due date, the other is a milestone
  whose *work* slipped. Name the difference on the screen; if the distinction cannot be supported by
  the current columns, say so in `PROBLEMS FOUND` rather than making both tiles the same query.
- **`Written Off` has no column today.** Either add one in migration **0041** (`written_off_at`,
  `written_off_by`, `write_off_reason` — writing off a receivable is a decision that needs a who and
  a why, not a delete) or omit the tile and report it. **Do not fake it.** If you add it, record the
  write-off with `recordAudit` and gate it on `billing.payment.approve`.
- Reuse `milestoneOverdue` and `actualDueOf` from `lib/finance-model.ts`.
- Gate the route on `billing.payment.view`.
- Remove `soon: true` from the nav entry once the route exists.

---
---

# PART 4 — Phase 12: Reports & polish

**Source of record:** `PLAN-V4.md §13` and `competitor-research/DESIGN-DIRECTION.md §6, §8`.

This phase has no new domain model. It is the difference between a product that demos and a product
that ships.

**Unit 1 is DONE** (committed `b61e791`). All six Reports capabilities — Payment, Client, User,
Labour, Lead, Financial — now resolve to real reports at `/reports/<slug>`, the index renders only
the cards you may open, and the route refuses BEFORE running the query. Nine reports exist;
`lib/can-coverage.test.ts` asserts every one declares a real capability.

---

## UNIT 2 — Saved views · column chooser · CSV export

Every list screen gets all three. Build each **once**, in `components/ui/`, and adopt it everywhere —
this is a cross-cutting pattern, and three implementations of a column chooser is how a codebase
starts to rot.

- **Saved views** persist a filter set per user per screen. A new table in migration **0041+**,
  org-scoped, registered in `lib/data/tables.ts`, with org-isolation assertions in `verify.mjs`.
  Scope a view to its owner — one person's saved filters are not another's.
- **Column chooser** persists alongside the saved view.
- **CSV export** honours the *current* filter and the *current* columns, and **says how many rows it
  wrote**. An export that silently ignores the filter is worse than no export.

`components/reports/export-csv-button.tsx` already exists and serialises already-fetched rows in the
browser — extend that rather than writing a second exporter. Note the `exports` usage metric already
exists in `lib/subscription-model.ts` and is only partly wired; meter the export here.

**Verify in the browser:** save a view, reload the page, and confirm it comes back; change the
columns and confirm the CSV matches what is on screen, not the default set.

---

## UNIT 3 — Skeleton loading + designed empty states

`DESIGN-DIRECTION §6` — the states that get forgotten:

- **Empty:** icon + one line of what-this-is + the primary action. Not a blank box.
- **Loading:** skeleton rows for tables, never a spinner over the whole page.
  `app/(app)/dashboard/workspace-skeleton.tsx` is the existing pattern.
- **Error:** inline, actionable, with a retry. Never a raw stack trace.
- **Permission-limited:** `components/ui/permission-limited.tsx`, already built — adopt it
  everywhere a route can refuse, rather than an omitted column in a broken layout.

Audit every list route in Part 1 §3 and report which were missing which.

**Note the demo tenant has ZERO `project_files`**, so the documents list is permanently empty and is
a good place to check the empty state is designed rather than blank. Seeding a file would also make
the file viewer's `Audits` tab demonstrable for the first time — worth doing if it is cheap.

**Verify in the browser:** navigate cold to at least one heavy list and confirm you see skeleton
rows, not a blank page or a full-page spinner.

---

## UNIT 4 — Accessibility floor + red-discipline audit

**Do this last**, so it audits finished screens.

`DESIGN-DIRECTION §8`:

- Text contrast >= 4.5:1. `#D6122B` on white is about 5.3:1 — fine at 14px+, **not** below.
- **Status never by colour alone** — always a label or an icon too.
- Visible focus ring (2px), keyboard-navigable tables and menus, 44px minimum touch targets on
  mobile/site surfaces.

Then the full **red-discipline audit** across every screen built in Phases 9–12. Red is allowed
exactly five jobs (Part 1 §2 rule 7). Walk every route, list every red element, and justify or
replace it. Known offenders the competitor taught us to avoid:

- two competing red buttons in one view;
- a status chip that is red for a state that is not an alarm;
- overdue shown as red text with no icon;
- red used as decoration on a chart series or an icon.

Phase 10 set the precedent worth following: on the Approvals queue, Approve is a GREEN outline and
Deny a RED outline, and there is **no red page-primary at all** — a filled red header button would
have competed with the red Deny on every row, which is how a closed list of five quietly becomes
six.

Report the list of routes audited and every red use you changed.

**Verify in the browser:** tab through at least one table end to end and confirm the focus ring is
visible on every stop.

---

## The tail — every unit in Parts 3–4 ends this way

1. Run the six gates (Part 1 §6). Baseline must not drop:
   tsc 0 · eslint 0 · 729 tests in 42 files · verify 186/186 · verify-storage 11/11 · build clean.
2. Verify against the running app on port 3010 — **both halves** of Part 2 §5: fetch the page and
   POST the action, quoting real figures and row ids; **then open the browser and click it.**
3. Report in the shape in Part 2 §6, under 40 lines, including `VERIFIED IN THE BROWSER`.
4. **Do not commit. Do not run `db.mjs migrate`.**
