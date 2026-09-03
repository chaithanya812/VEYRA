# HANDOFF V7 — VEYRA

**This is the current, authoritative handoff. It is the only one.** It supersedes `HANDOFF-V6.md`
and every other `HANDOFF-*.md` / `START-HERE.md` in the repo root — do not read those.

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`
Branch: `quotations-v2-plus-fleet` · Live: https://veyra-five-beta.vercel.app

| Part | What | Who reads it |
|---|---|---|
| **0** | The paste block | you, to start a session |
| **1** | Orchestrator handbook — rules, state, gates, work queue | the orchestrator |
| **2** | Agent playbook — dispatch protocol and report contract | orchestrator + every sub-agent |
| **3** | Phase 10 — HR & Admin, unit by unit | only the sub-agent doing it |
| **4** | Phase 11 — Accounting, unit by unit | only the sub-agent doing it |
| **5** | Phase 12 — Reports & polish, unit by unit | only the sub-agent doing it |

---

# PART 0 — Paste this to start a new session

```
Read HANDOFF-V7.md, Parts 1 and 2 only. Stop there — do not read Parts 3-5.

You are the ORCHESTRATOR. Sub-agents write the code; you dispatch, verify and
commit. One sub-agent at a time, never parallel. Work the queue in Part 1 §8
in order, starting from the first unit that is not yet committed.

For each unit:
  1. Dispatch ONE sub-agent by address, using the template in Part 2 §4.
     Do not read the unit brief yourself.
  2. Receive its report.
  3. Re-run the six gates yourself (Part 1 §6) and skim `git diff --stat`.
  4. Commit, with a message explaining why the shape is what it is.
  5. Dispatch the next unit.

Never delegate: lib/data/with-org.ts, the can() permission boundary
(Part 3 Unit 5), the scope_items spine, the vendor portal, `db.mjs migrate`,
or any git command.

Tell me where the queue stands before you start.
```

---

# PART 1 — Orchestrator handbook

## 0. Why this handoff is shaped like this

> The orchestrator kept running out of context. Not from reading — *coding*. Every file read, every
> failed typecheck, every 2,000-character page dump, every screenshot lands in the session that is
> also supposed to remember the plan. By Phase 11 there was no room left to think.
>
> **The fix: sub-agents do the reading, the coding, the testing and the verifying. You dispatch,
> check, and commit.**

### The four rules of this session

1. **One sub-agent at a time. Never parallel.** Sequential agents keep your context small and
   linear: dispatch → short report → verify → commit → next. Parallel agents return interleaved
   reports about files that touch each other, and reconciling them costs more context than doing the
   work yourself would have.

2. **Never read a unit brief yourself.** Parts 3–5 are for sub-agents. You dispatch by *address*:
   *"Read HANDOFF-V7.md Part 3, do Unit 2 only."* The brief, the frame notes, the file exploration
   and the build output then land in a window you throw away. This is the single biggest saving in
   the whole arrangement.

3. **Your own tool calls should produce small output.** Exit codes, `git log --oneline -1`, the last
   three lines of a test run. If you are reading a 400-line file or dumping a rendered page, that
   was a sub-agent's job.

4. **Never take a sub-agent's word for it.** "All six gates pass" is a claim. Re-run them yourself
   (§6) — six commands, tiny output, and the only thing standing between a confident agent and a
   broken build.

---

## 1. What VEYRA is, in six lines

A CRM/ERP for Indian interior-fit-out firms: leads → quotations → projects → procurement →
site/labour → money. Next.js App Router, TypeScript, Supabase Postgres, Tailwind.
Multi-tenant by `org_id`. **RLS is OFF by owner decision** and `lib/data/with-org.ts` is the only
tenant guard. Login is removed — the app opens straight into the demo tenant as Aditi Pradhan; use
**View as** in the top bar to switch users.

---

## 2. Rules that do not bend

Every sub-agent is told to read this section. You should know it too, because you are the one who
catches a violation in review.

1. **RLS stays OFF.** Never enable it, never write a policy. `withOrg()` is the ONLY tenant guard.
   Every tenant table carries `org_id`, is registered in `lib/data/tables.ts`, and is reached only
   through `withOrg()`.
2. **No LLM ever produces a price, rate, cost, amount or quantity.** Models return structure only;
   a deterministic engine plus tenant config supplies every number. Log every call to
   `ai_requests`. `lib/smartplan-model.ts` + `lib/ai/smartplan.ts` are the worked example.
3. **Migrations are additive and idempotent**, with
   `org_id uuid not null references public.orgs(id) on delete cascade`. See §4.
4. **Ledgers are append-only.** A reversal is a new row plus a filter, never a delete.
5. **Projects never share anything.** A folder, a file, a photo, a labour day, a request, a
   warehouse — each belongs to exactly one project, enforced three ways: FK, scoped uniqueness,
   storage prefix.
6. **Totals are derived, never stored.** `labour_entries` has no `total`; `grns` has no `qty` and no
   `amount`. `verify.mjs` asserts that selecting them fails. Prefer making an invariant
   unrepresentable over documenting it.
7. **Red has a closed list of five jobs**: the one primary action per view, active navigation,
   destructive actions, genuine alerts, the hero metric. A sixth use is wrong — find the black/grey
   treatment. Status chips are grey/amber/green and always carry a label, never colour alone.
8. **Indian market**: GST (HSN/SAC, place-of-supply), Indian-FY numbering, ₹ Indian grouping, DPDP.
9. **Server-action files export only async functions.** Secret keys stay server-side; `admin` is
   lint-restricted to `lib/data/`.
10. **Never push or deploy without the owner.** Local commits are fine.
11. **Do not use the Supabase MCP** — it authenticates to a different account and every call fails.
    Use `node scripts/db.mjs` and the two verify scripts.
12. **Report a query error as itself.** Never collapse a PostgREST error into a friendlier message
    that names a different cause.

### Out of scope (owner decision)
Client/customer portal · warranty module · telephony/dialer · WhatsApp API ingestion. Calls and lead
capture stay manual. But honour the `client_visible` flags — they drive the Progress Report, which
is what actually reaches the client.

### Parked — do not build, do not delete the placeholders
MB Sheets · 2D → 3D renders · manager dashboard (`TEAM_VIEW_ENABLED = false`) · Quotation 2.0 ·
accounting export · the public tokenised vendor-onboarding form.

---

## 3. Where the build is

**Phases 0–9 are complete.** Phases 10, 11 and 12 remain — the queue in §8.

Every route below is built and working. **Do not rebuild any of it.**

| Area | Routes |
|---|---|
| Sales | `/leads` · `/leads/[id]` · `/leads/insights` · `/pipeline` · `/followups` · `/quotations` (+ builder, templates, compare, `/q/[token]`) |
| Projects | `/projects` · `/projects/[id]` (Summary · Modules · Milestones) |
| Project modules | `/documents` (+ viewer) · `/plan` · `/finance` · `/payments` · `/site` · `/labour` · `/procurement` · `/report` |
| Company-wide | `/procurement` · `/rfq` · `/orders` · `/inventory` · `/finance` · `/vendors` · `/items` · `/design` · `/production` · `/site` · `/approvals` · `/reports` |
| Admin | `/settings` (workspace, numbering, quotations, roles) · `/billing` · `/communication` |

**Phase 9, just finished**, in three sentences. `/procurement` is now the project procurement screen
with the project un-pinned — one predicate, not a second module. `/inventory` has the owner's
company-vs-project warehouse split, bins that roll up, and stock movements that finally belong to a
numbered document. `/vendors` has a working model, a Created → Verified → Onboarded ladder, trades
as rows, and a Vendor Projects screen that is a pure read over rows that already existed.

---

## 4. Migration ledger

**Applied: `0001–0034`, `0036–0039`.**

**Next free number: `0035`, then `0040+`.** `0035` is reserved:

| # | Contents | Phase |
|---|---|---|
| **0035** | `audit_events`; permission enforcement columns | 10 |

Numbers were applied out of order (0036–0039 before 0034–0035) because those phases came first and
squatting on a reserved number would have been worse. The runner applies by filename, so a fresh
database still gets them in order once the gaps are filled. **Do not renumber.**

**A new table is three edits, not one:** the migration, `lib/data/tables.ts`, and an org-isolation
assertion in `scripts/verify.mjs`. Miss the second and TypeScript rejects `db.table("your_table")`
with a wall of union types that looks like a completely different problem.

> **⚠ YOU apply migrations, never a sub-agent.** An agent may *write* the `.sql`; you run
> `node scripts/db.mjs migrate` and you read the result. A migration that fails halfway through a
> file is the one genuinely hard thing to unpick in this repo.

---

## 5. Reuse index — do not write a second one

| Reuse | For |
|---|---|
| `components/ui/patterns.tsx` | `SegmentedControl`, `SegmentedCountBar`, `PlannedVsActual`, `MultiValueCell`, `ClientVisibleToggle`, `DateRangeControl` |
| `components/ui/charts.tsx` | `AreaTrend`, `Donut` (sizes by count — for money use `BarList`, which keeps the rupee figure visible), `BarList` |
| `components/ui/primitives.tsx` | `Card`, `PageHeader`, `StatusChip`, `EmptyState` |
| `components/ui/comment-thread.tsx` | files, photos, orders — takes threads the caller already built |
| `app/(app)/dashboard/workspace-ui.tsx` | `StatTile`, `TileGrid`, `FormError`, `SubmitButton` |
| `lib/data/with-org.ts` | all data access. **No generic `.delete()`** — only `deleteById(id)`; select the id first |
| `lib/data/project-files.ts` | `uploadProjectFile({ link })` — one file model. Do NOT add a fifth attachment table; add a column |
| `lib/data/config.ts` | `issueDocNumber` / `previewNextNumber`. Issue consumes; preview does not — two calls on purpose |
| `lib/data/storage.ts` | `storagePath` / `signedUrls` / `ALLOWED_MIME` |
| `lib/finance-model.ts` | all project money: `scheduleTotals`, `actualDueOf`, `rollupContract`, `summarisePlan` |
| `lib/payments-ledger-model.ts` | `buildLedger` — hides BOTH halves of a reversed pair and excludes them from the total |
| `lib/material-requests-model.ts` | `stageBreakdown`, `procurementTotals` — anything whose parts are in several buckets |
| `lib/labour-model.ts` | `totalOf` / `summarise` — the only places labour is added |
| `lib/inventory-model.ts` | `goodsValue`, `buildWarehouseTree`, `movedQty/Amount`, `lastMovement` |
| `lib/vendors-model.ts` | `vendorProjects`, `vendorProjectTotals`, `categorySummary`, the status ladder |
| `lib/workspace-model.ts` | `sessionHours`, `totalHours`, `openSession`, `sessionsOnDay` — **Phase 10 needs these** |
| `lib/permissions-model.ts` | `(module, action, scope)` + `DOC_TYPES` + `formatDocNumber` |
| `lib/gantt-model.ts` | any time axis |
| `lib/site-photos-model.ts` | `formatPhotoDate` — formats from the STRING, never through a `Date` |

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
tsc 0 · eslint 0 · **591 tests in 39 files** · **verify 161/161** · verify-storage 11/11 ·
build clean.

`next build` passing does NOT mean the typecheck passes — Next skips test files. Run both.

Also required of every unit:
- Every engine is a pure function in `lib/<x>-model.ts` **with tests**.
- Every new table is in `lib/data/tables.ts` and reached only through `withOrg()`.
- `verify.mjs` gains org-isolation assertions for it — and, for anything project-scoped,
  project-isolation assertions too.
- Red discipline audited (§2 rule 7).

---

## 7. Running and verifying it

```bash
npm run dev                    # http://localhost:3010
node scripts/db.mjs migrate    # YOU run this, never a sub-agent
node scripts/db.mjs sql "<query>"
node scripts/seed-demo.mjs     # idempotent; tops up the demo tenant
```

The demo project **Malviya Nagar 3BHK** carries a 12-milestone plan, six site photos, eight labour
days, three material requests, an RFQ, a partially-delivered PO, two warehouses (one with a bin),
three numbered stock notes, and a vendor contract with signed-off milestones.

### Verifying without a browser — faster and far more reliable than screenshots

Sub-agents are required to use these, because "it compiles" is not evidence that a screen renders.

**Read a rendered page.** A 200 with only the shell is Next streaming a `notFound()` — check the
BODY, not the status code:

```bash
node -e "fetch('http://localhost:3010/projects').then(r=>r.text()).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').slice(0,2000)))"
```

**Exercise a server action over HTTP**, even one inside a dialog. Pull the action id out of the dev
client chunk:

```bash
node -e "(async()=>{const h=await fetch('http://localhost:3010/PAGE').then(r=>r.text());for(const c of [...new Set([...h.matchAll(/\/_next\/static\/chunks\/[^\"']+?\.js/g)].map(m=>m[0]))]){const js=await fetch('http://localhost:3010'+c).then(r=>r.text()).catch(()=>'');const m=/\{\"([0-9a-f]{40,})\":\{\"name\":\"YOUR_ACTION\"\}\}/.exec(js);if(m){console.log(m[1]);break}}})()"
```

Then POST to the route with header `Next-Action: <id>` and a body React can decode — **every
FormData entry keyed `_1_<field>`**, plus `0 = ["$undefined","$K1"]` as the args (for a plain
`(formData) => void` action the args are `["$K1"]`). Use the DEV ids, not the ones in the build
manifest.

This is how uploads, MIME rejections, cross-project refusals, partial bulk updates and every stock
movement in Phase 9 were proven against the real database.

**The browser pane works but is flaky** — screenshots often need a retry and `read_page` sometimes
returns an empty document. A stale dev server from another session will answer on 3010; if fetches
behave oddly, confirm whose server it is before debugging your own code.

---

## 8. The work queue

Dispatch **in order, one agent each**. Do not read the briefs — hand over the address.

### Phase 10 — HR & Admin · **Part 3**

| Unit | What | Notes |
|---|---|---|
| 1 | Migration 0034 + attendance model & tests | agent writes the `.sql`; **you** run `db.mjs migrate` |
| 2 | `/hr/attendance` — My Dashboard | tabs Attendance · Leaves · WFH · Holidays |
| 3 | `/hr/attendance/admin` — Approvals & Report | per-row Approve / Deny |
| 4 | `/settings/users` — the real Manager column | `org_members.manager_id` already exists |
| 5 | Migration 0035 + `can()` + audit spine | **⚠ DO NOT DELEGATE — build this yourself** |
| 6 | Wire `can()` into every server action | delegate in batches by module, after Unit 5 |
| 7 | Audit log surfaces + metering | two buttons that already exist and do nothing |

### Phase 11 — Accounting · **Part 4**

| Unit | What |
|---|---|
| 1 | Settle the `Total Payables` collision, then the per-project matrix model + tests |
| 2 | `/finance/payments` — the Payments Dashboard with drill-through |
| 3 | `/finance/petty` — Petty Finance, extending `expense_claims` |
| 4 | `/finance/receivables` — Account Receivables (nearly free; reads `milestones`) |

### Phase 12 — Reports & polish · **Part 5**

| Unit | What |
|---|---|
| 1 | Wire the six Reports permission groups to real reports |
| 2 | Saved views · column chooser · CSV export |
| 3 | Skeleton loading + designed empty states on every list |
| 4 | Accessibility floor + full red-discipline audit |

---

## 9. Deployment state

`bb872c5` (Phases 0–8) is pushed to `origin/quotations-v2-plus-fleet` and live in Vercel production,
reading the same Supabase project the local app does. `main` is untouched. **Phase 9 is committed
locally and NOT deployed** — the owner authorised publishing through Phase 8 only. Ask before
deploying.

Two things production is missing. Fix them with the owner, not silently:

1. **No `GEMINI_*` / `AI_*` env vars in Vercel** — only the six Supabase ones. Every AI surface
   (SmartPlan, the BOQ parse) fails in production until the owner adds them. Do not paste their API
   keys yourself.
2. **Vercel caps a serverless request body at 4.5 MB** while the app accepts 25 MB uploads. A large
   drawing or phone photo uploads locally and fails in production. The real fix is uploading from
   the browser straight to Supabase storage.

---

## 10. Open decisions the owner has not made

Do not settle these silently.

1. **`Total Payables` means two different things.** `agreed − disbursed` on the vendor screen
   (frame `110234`), `billed` in `finance-model.ts::summarisePlan`. Both screens agree on *Dues*.
   Part 4 Unit 1 has to settle it — the recommendation there is the frame's reading.
2. **Vendor Documents.** `project_files.project_id` is NOT NULL and a vendor's GST certificate
   belongs to no project. Relaxing the column or adding a fifth attachment table are both real
   choices; the card currently says so instead of one being made quietly.
3. **`Find Vendors` / `My Business Profile`** — the competitor's marketplace. Not in the plan's
   deliverables; not built.
4. **Goods Value is the ledger's own arithmetic**, not FIFO and not weighted average. Choosing a
   valuation method is a finance decision.

5. **`leave_type = 'wfh'` collides with the new `wfh_requests` table.** 0023 seeded a `wfh` leave
   type; 0034 gives WFH its own table, because a WFH day is not leave — the person worked, and it
   must not be deducted from an entitlement. Rows already stored against the old slug still exist
   (Karthik has one). `lib/hr-model.ts::leaveKindOf` currently routes such a row to the WFH tile and
   never to paid leave, so it cannot eat a balance. That is a safe interim, **not a decision**: the
   owner still has to say whether the legacy rows get migrated into `wfh_requests`, left readable
   where they are, or retired. Until then the two tiles count from two tables and the same word
   means two things — the §11 collision rule applies, so name it on the screen.

---

## 11. Mistakes already made — every unit brief cites this section

**Reads**
- **Selecting a column that does not exist empties the WHOLE read, silently.** `po_lines` has no
  `received_qty`; `po_receipts` has `received_at`, not `received_on`. The second shipped a bug that
  printed "—" for every delivery date for a whole phase. An unchecked `.error` is a lie with a
  plausible shape.
- **A percentage without its denominator is not trustworthy.** Every ratio in this codebase travels
  with the two numbers it came from.
- **The same words can mean different things on two screens.** When you find a collision, name it on
  the screen — do not quietly pick one.

**Writes**
- A PostgREST bulk insert sends an explicit NULL for a key that one row in the batch omits,
  defeating the column default and tripping `not null`. **Batch rows need uniform keys.** This bit
  again in Phase 10 Unit 1 and cost a round trip: one non-uniform `holidays` batch surfaced as three
  unrelated-looking assertion failures, because the unchecked `.error` let the empty table look like
  a schema problem. It only bites on `not null` + `default`. Twelve other non-uniform batches are
  known and latent — `verify.mjs:55, 103, 166, 312, 409, 521, 651, 676` and
  `seed-demo.mjs:315, 321, 337, 568` — each omitting a NULLABLE column, which is why they pass.
  Adding a `not null default` to any column they touch turns all of them red at once.
- Backfills that match on a name plus a sort order mislink. Carry the origin id to make it exact and
  re-runnable. **Do not invent history to fill a new column** — an RFQ awarded before the award
  reason existed shows "No reason recorded", and pre-0033 stock movements show as unlinked.
- `scope_items.parent_id` cascades on delete. `deleteSection()` detaches children first;
  `verify.mjs` asserts the cascade so nobody "simplifies" it away.
- A rejected attachment must not throw away the record it was attached to. Save the row, attempt the
  file, report a partial success.

**React / Next**
- **A `"use client"` module's exported CONST is a client reference on the server.** `tsc` passes,
  `next build` passes, every request throws. Types cross that boundary; values do not. Vocabulary
  belongs in the pure model.
- **Client components resolve their tab from the SERVER, not from an effect.** Every tabbed screen
  takes an `initialTab` prop read from `searchParams`. Doing it in `useEffect` server-renders the
  wrong tab and makes the page unverifiable by fetching HTML.
- Radix dialog contents are not in the server HTML until opened — hence the `Next-Action` technique
  in §7.
- **Bash heredocs choke on long TSX.** Write files with the Write tool; apply surgical edits with a
  small Python script written to the scratchpad and run by path.

**Data**
- Demo data can lie, and must be possible. Six leads once carried statuses from a retired ladder, so
  the funnel appeared to have twice its real stages. A seeded photo once had a site date a week
  after its upload date. Seed data that says impossible things teaches the schema wrong.

---
---

# PART 2 — Agent playbook

Read once, at the start of a session. This is the dispatch protocol, the report contract, and the
list of things that must never leave the orchestrator's own hands.

## 1. Sequential, never parallel

**One sub-agent at a time.** Not a performance choice — a context choice.

Parallel agents come back with interleaved reports about files that touch each other: two agents
both edited `lib/data/tables.ts`, both added a `verify.mjs` block, both moved the test count.
Working out what actually landed costs more than doing the unit yourself would have. Sequential
keeps the loop linear and the diff reviewable:

```
dispatch → short report → re-run gates → git diff --stat → commit → next
```

Units are ordered so each builds on a committed, verified predecessor. Running Unit 3 while Unit 2
is unfinished means Unit 3 is coding against a moving file.

## 2. What must never be delegated

| Never delegate | Why |
|---|---|
| Anything touching `lib/data/with-org.ts` | With RLS off, this file *is* tenant isolation. One wrong edit leaks another company's data and nothing in the suite is guaranteed to notice. |
| **`can()` and permission enforcement** (Part 3 Unit 5) | It is the security boundary. A permission that silently fails open is worse than no permission, because it promises a control that does not exist. |
| The `scope_items` spine | Every module's line table points at it. |
| The public tokenised vendor portal | Unauthenticated, public surface. |
| `node scripts/db.mjs migrate` | An agent may *write* the `.sql`; you run it and read the result. |
| `git commit` / `git push` | You write the message — you know what the unit was for. Never push without the owner. |

Everything else is fair game: models, screens, data-layer reads, tests, `verify.mjs` assertions,
seed updates, exploration.

## 3. The dispatch

**Do not paste the brief. Hand over its address.**

```
Read HANDOFF-V7.md Part 3 and do UNIT 2 only. Do not start any other unit.

Also read, before writing code:
  - HANDOFF-V7.md Part 1 §2 (rules), §5 (reuse index), §6 (gates),
    §7 (verifying), §11 (mistakes)
  - HANDOFF-V7.md Part 2 §4-§6 (your protocol and report shape)

Constraints:
  - Do not run `git commit`, `git push`, or `node scripts/db.mjs migrate`.
  - Do not edit lib/data/with-org.ts.
  - Stop and report if the unit needs a schema change its brief does not name.

Report in the exact shape in Part 2 §6. Keep it under 40 lines.
```

### Follow-ups

If a unit comes back failing, **do not spawn a fresh agent** — it re-derives everything from cold.
Send the failure to the same agent:

```
tsc fails with:
<paste the 5 relevant lines, not the whole wall>
Fix it, re-run all six gates, and re-report.
```

## 4. The sub-agent's protocol

1. **Read your unit's brief in full**, then the Part 1 sections listed in the dispatch.
2. **Open only the files the brief names.** It names them because somebody already paid the cost of
   finding them. If you need one it does not name, open it — but that is a signal the brief is
   wrong, and it goes in your report.
3. **Open a screenshot only if the brief's written description leaves you unable to picture the
   screen.** Frames live in `temp folder 1/Screenshot 2026-08-27 <frameid>.png`. Every brief
   describes its frames in words first, precisely so you usually do not have to.
4. **Write the pure model first, with its tests.** A screen built before its arithmetic is a screen
   whose arithmetic lives in JSX.
5. **Then the data layer, then the screen.**
6. **Run the six gates.** Fix what you broke.
7. **Verify against the running app.** "It compiles" is not evidence that a screen renders or that a
   write lands.
8. **Report. Stop. Do not commit.**

### Things that will cost you an hour if you skip them

- Part 1 §11 is a list of mistakes already made here. The two that bite most often: **selecting a
  column that does not exist empties the whole read silently**, and **a `"use client"` module's
  exported const throws at request time even though `tsc` and `next build` both pass.**
- Tabbed screens resolve their tab from `searchParams` on the server, never in a `useEffect`.
- Bash heredocs choke on long TSX. Use the Write tool for files; for surgical edits, write a small
  Python script to the scratchpad and run it by path.

## 5. The gates a sub-agent runs before reporting

The six commands in Part 1 §6. Baseline that must not drop: **tsc 0 · eslint 0 · 591 tests in 39
files · verify 161/161 · verify-storage 11/11 · build clean.**

**Then verify against the running app** (`npm run dev`, port 3010) using the two techniques in
Part 1 §7: fetch the page and strip tags to confirm it renders real data, and POST to the server
action with a `Next-Action` header to confirm a write lands in Postgres. Check the row with
`node scripts/db.mjs sql "..."`.

The orchestrator re-runs all six anyway. That is not distrust of you — a green report and a green
build are different claims, and only one of them is checkable.

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

DECISIONS I MADE
  <anything the brief did not settle, and what you chose>

PROBLEMS FOUND
  <bugs in existing code, brief inaccuracies, or "none">

NOT DONE
  <anything in the unit you did not finish, and why>
```

**`VERIFIED IN THE APP` is the section that matters.** "The page renders" is not a finding.
"`/hr/attendance` returns the four tiles reading `Available 23 · Paid 1 granted / 16 in process`,
and posting `applyLeaveAction` created `leave_requests` row `abc123` with `days = 3`" is.

**`PROBLEMS FOUND` is not optional.** If the brief said a column existed and it did not, say so —
the brief is wrong and the next agent will hit it too.

## 7. What the orchestrator does with a report

1. **Re-run the six gates.** Small output, and the only real check.
2. **`git diff --stat`** — skim the file list. Files the report did not mention are the interesting
   ones.
3. **Spot-check one claim** from `VERIFIED IN THE APP`, cheaply — usually one `db.mjs sql` query.
4. **Read `DECISIONS I MADE` properly.** This is where an agent quietly settles something that was
   the owner's call. Anything that belongs in Part 1 §10 goes there before you commit.
5. **Commit**, with a message that says what changed and *why the shape is what it is* — the commit
   log is the design record in this repo. Then dispatch the next unit.

## 8. Writing a new unit brief

Each unit should be **one sitting** (a model + a data read + a screen + tests; two migrations means
two units), **self-contained** (names every file to open, describes every frame in words),
**explicit about what already exists** (the most expensive thing a cold agent does is rediscover
that `sessionHours` is already written), and **explicit about what is NOT in scope** and what must
be escalated rather than settled. End it with the standard tail.

---
---

# PART 3 — Phase 10: HR & Admin

**Source of record:** `PLAN-V4.md §11`, frames `110318` `110339` `110349` `110403` `110413`
`110420` `110429`. This part quotes what you need; you should not have to open either document.

**Do exactly one unit.** Do not commit, do not push, do not run `db.mjs migrate`.

The owner's framing: *"the manager side might be same as the staff, but here's the thing — they get
to see the HR."* **HR is role-gated, not a separate dashboard.** This does not unpark
`TEAM_VIEW_ENABLED`, which stays `false`.

## What already exists (do not rebuild)

| Thing | Where | Note |
|---|---|---|
| `work_sessions` | table, 0023 | `member_id, check_in, check_out, lat, lng, location_label, source, note` |
| `leave_requests` | table, 0023 | `member_id, leave_type, from_date, to_date, days, reason, status, decided_by, decided_at, decision_note` |
| `field_visits` | table, 0023 | `member_id, purpose, project_id, lead_id, title, started_at, ended_at, lat, lng, location_label, notes, status` |
| `expense_claims` | table, 0023 | Part 4 extends this — leave it alone here |
| `org_members.manager_id` | column, 0023 | **already exists**; Unit 4 surfaces it |
| `roles` | table, 0001 | `name, is_system, permissions` — `is_system` is the global/custom split |
| `permissions` | table, 0010 | `role_id, module, action, scope` — rows are written and **nothing reads them** |
| `sessionHours`, `totalHours`, `openSession`, `sessionsOnDay` | `lib/workspace-model.ts` | **hours are already derived from stamps. Reuse these.** |
| `MEMBER_ROLES`, `roleRank`, `canManageTeam`, `canConfigureOrg` | `lib/workspace-model.ts` | the coarse role check that exists today |
| `MODULES`, `ACTIONS`, `SCOPES`, `MODULE_LABELS` | `lib/permissions-model.ts` | the `(module, action, scope)` vocabulary |
| `listRoles`, `listPermissions`, `setPermission`, `removePermission` | `lib/data/config.ts` | the settings matrix writes through these |
| `/settings/roles` + `permission-matrix.tsx` | `app/(app)/settings/roles/` | the decorative matrix |
| Nav entry `HR → Attendance → /hr/attendance` | `lib/nav.ts` | marked `soon: true`. **Unit 2 removes that flag.** |

**Hours stay derived from stamps, never stored.** Already honoured by `lib/workspace-model.ts`; it
must survive this phase.

---

## UNIT 1 — Migration 0034 + the attendance model

**Goal:** the two missing tables, and the pure arithmetic behind `110318`'s table, with tests.
No screens.

### Frame `110318` in words (My Dashboard)

Four tiles: **Available/Paid Leaves** (one number, green) · **Paid Leaves** (`1 Granted` /
`16 In process`) · **Unpaid Leaves** (`0 Granted` / `0 In process`) · **Work From Home**
(`8 Granted` / `29 In process`). The last three are *pairs*, not single figures.

Tabs **Attendance · Leaves · WFH · Holidays**. A filter band `FILTER BY: [This Month ▾] [All ▾]`.

Attendance columns: `Date · No. of Check-In · No. of Check-Out · Total Check-In Hours ·
Total Visit Count · Total Visit Hours · Time Difference`. Values look like `9 Hrs 0 Min` and
`On-time`. **One row reads `1 check-in / 0 check-out / 0 Hr 0 Min / -`** — a session still open. That
row is the reason none of this can be a stored total.

### Write the migration (do NOT run it)

`supabase/migrations/0034_hr_wfh_holidays.sql`, additive and idempotent, following the header style
of `0033_inventory_warehouses.sql` — a header that explains *why the shape is what it is*, not what
the SQL does.

- `wfh_requests` — mirror `leave_requests` exactly (`member_id, from_date, to_date, days, reason,
  status, decided_by, decided_at, decision_note`). A separate table, not a `leave_type` on
  `leave_requests`, because the frame counts and approves them separately and **a WFH day is not
  leave — the person worked.**
- `holidays` — `(org_id, holiday_date, name, is_optional boolean default false)`, unique on
  `(org_id, holiday_date, lower(name))`. Tenant-owned, because a Hyderabad firm and a Gurugram firm
  do not share a calendar.
- Both get `org_id uuid not null references public.orgs(id) on delete cascade` and an index on
  `(org_id, ...)`.
- Register **both** in `lib/data/tables.ts`.

### Write `lib/hr-model.ts` (pure, no server imports) with tests

Reuse `sessionHours` / `openSession` from `lib/workspace-model.ts` — do not re-derive them.

- `attendanceDay(sessions, visits, now)` → `{ date, checkIns, checkOuts, sessionHours, visitCount,
  visitHours, open }`. **An open session contributes `0` hours and sets `open: true`** — it does not
  guess a check-out. The frame's `0 Hr 0 Min / -` row is exactly this state.
- `formatHours(n)` → `"9 Hrs 0 Min"`. Print `"—"` for an open day.
- `timeDifference(day, expectedStart)` → `"On-time" | "Late" | null`. Null on an open day: you
  cannot call somebody late for a day that has not finished.
- `leaveTiles(leaves, wfh, entitlement)` → the four tiles, each `{ granted, inProcess }`, and
  `available = entitlement − granted(paid)`. **`entitlement` is a parameter, never a constant** — it
  is tenant config.
- `holidayCalendar(holidays, from, to)` — the Holidays tab's rows.

**Dates:** format from the `YYYY-MM-DD` string, never through a `Date`. See
`lib/site-photos-model.ts::formatPhotoDate` — `2026-03-24` parsed and re-read locally becomes the
23rd.

### Also
- Org-isolation assertions for both new tables in `scripts/verify.mjs`, plus one that a holiday name
  is unique per date per tenant and that two tenants may share a date.
- Extend `scripts/seed-demo.mjs` (idempotent) with a few holidays, two WFH requests in different
  states, and one **open** work session, so the screens have the awkward case to render.

### Not in scope
Screens. Payroll. Anything touching `expense_claims`.

---

## UNIT 2 — `/hr/attendance` (My Dashboard)

**Depends on Unit 1 being committed.**

Build the route the nav already points at, and **remove `soon: true` from the HR entry in
`lib/nav.ts`.**

- Server component reads the tab from `searchParams` and passes `initialTab` — never a `useEffect`
  (Part 1 §11).
- Tabs **Attendance · Leaves · WFH · Holidays** via `SegmentedControl`.
- Four tiles via `StatTile`/`TileGrid`. The three granted/in-process tiles show **both numbers** — a
  single figure hides the pair the frame is making a point of.
- The Attendance table's columns exactly as listed above. Right-align numerics, tabular figures.
- Month + type filter as a GET form, so the filtered view is a shareable URL and verifiable by
  fetching HTML.
- **`Apply (Leave/WFH)` is the one red primary.** `Export to Excel` is a black secondary — the frame
  makes both red, which is a mistake to fix, not copy (Part 1 §2 rule 7).
- An open day renders `—` for hours and no on-time verdict. Do not print `0 Hrs 0 Min` as though the
  day had finished.

New data layer in `lib/data/hr.ts`, everything through `withOrg()`.

**Verify in the app:** fetch the page, confirm the four tiles carry real seed numbers, and POST the
apply-leave action to confirm a `leave_requests` row lands. Report the row id.

---

## UNIT 3 — `/hr/attendance/admin` (Approvals & Report)

**Depends on Unit 2.**

### Frame `110339` in words

Header `Attendance Report`, a centre toggle **`Approvals` | `Report`**, and **`Apply Leave for
employee`** as the red primary.

`Today's status` tiles: `Total Employees` · `Total Checkin` · `On Leave` · `Work From Home`.

Tabs **Leave Requests · WFH Requests · Visit Requests**, a `FILTER BY: [Select User ▾]`, and columns
`☐ · Name · Applied On · Start Date · End Date · Days · Leave Type · Reason · Action` with per-row
**Approve** / **Deny**.

### Build

- Approve/Deny write `status`, `decided_by`, `decided_at` — those columns already exist on
  `leave_requests` and (from Unit 1) `wfh_requests`. `field_visits` has `status` too.
- **Deny requires a reason.** `decision_note` exists; a refusal that cannot be explained is the thing
  people argue about three months later. Approve may leave it blank.
- Approve is a green outline, Deny a red outline — Deny is genuinely destructive, one of red's five
  allowed jobs.
- **Role-gated**: only `canManageTeam(role)` reaches it today. Unit 6 replaces that with `can()` —
  leave a `TODO(§11.3)` comment at the guard so it is findable.
- The `Report` half of the toggle is the same rows aggregated per employee. If it does not fit,
  ship `Approvals` and say so in `NOT DONE` — do not fake the Report tab.

**Verify in the app:** POST an approve and a deny, then `db.mjs sql` the row to show `status`,
`decided_by` and `decided_at` actually changed, and that the denial carries its note.

---

## UNIT 4 — `/settings/users` with a real Manager column

**Depends on nothing in this phase.** Can run any time.

### Frame `110349` in words

Header `Users` with three counters — `Purchased Licenses 20` · `Active 12` · `Unused 08` — and
`Add new user` as the red primary. Tabs **Active · Role Management · Groups · Deactivated**.

Columns `User Name (+ email) · DOB · Mobile No. · Role (+ Global / 2FA chips) · Activity · Manager ·
Actions`. `Activity` stacks `Last Login` and `Last Active`. **`Manager` is a real column** — a
reporting hierarchy, not a label.

### Build

- `org_members.manager_id` **already exists**. Surface it: a Manager column, and an editable picker
  that cannot point a member at themselves or create a cycle. **Write the cycle check as a pure
  function in `lib/workspace-model.ts` with tests** — `wouldCycle(members, memberId, managerId)`.
- Licence counters come from `subscriptions` (`lib/subscription-model.ts`). If seats are not
  modelled, show Active/Deactivated and **omit the purchased-licence tile** rather than inventing a
  number.
- `Deactivated` tab reads `org_members.status`.
- `Groups` is not modelled. **Leave the tab out** rather than shipping an empty one — a tab that
  never has content teaches people to ignore tabs.
- Do **not** build Role Management here; `/settings/roles` exists and Unit 5 rebuilds it.
- `Last Login` / `Last Active`: only show them if a real column backs them. If nothing does, omit
  the Activity column and say so in `PROBLEMS FOUND` — **do not invent activity data.**

---

## UNIT 5 — ⚠ THE ORCHESTRATOR BUILDS THIS. DO NOT DELEGATE.

Migration 0035 + `can()` + the audit spine. The security boundary; Part 2 §2 puts it in your own
hands.

> *"This is very important. This is how they manage everything."* — the owner.
> **A permission nothing enforces is worse than none: it promises a control that does not exist.**

### Frames `110403` / `110413`–`110429` in words

**Role Management (`110403`):** `+ New Role` red primary. Two tiers — **`Custom Roles`** (editable;
columns `Role Name · Description · No of Users · Actions` with view/edit/delete) and **`Global
Roles`** with the note *"View only - global roles cannot be edited or deleted"*. VEYRA's
`roles.is_system` is already this split.

**Edit Role (`110413`–`110429`):** `Role Name` · **`Inherit From ▾`** · `Description (0/155)` ·
`🔍 Search permissions`. Then permission groups, each a card with **`Enable All`** and a collapse
chevron. **Permissions nest** — a parent capability with children:

| Group | Capabilities |
|---|---|
| Tasks | Delete Task · All Task |
| Inventory | Master Catalog add/update · Warehouses add/update · Company Warehouses · All Project Warehouses |
| Procurement | **Acceptance** · **RFQ** → (View, Add/Update) · **Requests** → (Approve/Reject MR, View MR, Delete MR, Add/Update MR) · **Orders** → (Approve/Reject PO, View PO, Add/Update PO) |
| Invoice | *(enable-all only)* |
| Reports | Payment · Client · User · Labour · Lead · Financial |
| Vendors | My Business Profile · Find Vendors · **My Vendors** → (Delete, Add, Documents, Projects) |
| Order Management | Response To Quotation · My Orders |
| + VEYRA's own | Leads · Projects · Finance · HR |

**`Delete Material Request` and `Delete Vendor` are unchecked while their siblings are checked** —
destructive capabilities are opt-in per role. Copy that default.

### The minimum bar

1. **`can(ctx, "procurement.po.approve")`** — one server-side helper, called in **every** server
   action. Not a hook, not a client check.
2. **Role inheritance** (`Inherit From ▾`). Build it — it collapses the permission explosion. A role
   resolves to its own grants plus its parent's, and the resolution is a **pure function with
   tests**, including a cycle guard.
3. **Route guards that render a designed permission-limited state**, not a broken layout or a 404.
4. **Field-level visibility** for the register's P1 case — *a supervisor sees the BOQ without cost
   columns*. `quotation_settings.show_cost_column` is the first hook; the `Financials 👁` toggle on
   Project Insights and the Project Financials 👁 on the Summary are the second and third.
5. **Migration 0035**: `audit_events (org_id, actor, entity, entity_id, action, before, after, at)`
   plus whatever inheritance needs (`roles.inherits_from`).

**Fail closed.** An unknown capability, a missing role, an unresolvable inheritance chain — all deny.
A permission check that throws must not be caught into an allow.

---

## UNIT 6 — Wire `can()` into every server action

**Depends on Unit 5 being committed.** Delegable, in batches, once the helper exists and you have
reviewed it.

Dispatch one module per agent, smallest blast radius first:
`items` → `vendors` → `inventory` → `procurement` → `leads` → `quotations` → `projects` →
`finance` → `hr` → `settings`.

Each agent: add the `can()` call to every server action in that module's `actions.ts`, add the route
guard, and add a test that the action **refuses** for a role without the capability. Report the
count of actions guarded.

**The refusal test is the deliverable, not the call.** A `can()` never proven to say no is
indistinguishable from a comment.

---

## UNIT 7 — Audit log surfaces + metering

**Depends on Unit 5.**

Two controls already exist and currently do nothing:

- the **`Audits`** tab on the project file viewer (`app/(app)/projects/[id]/documents/[fileId]/`)
- the **`Audit`** button on Financial Planning (`app/(app)/projects/[id]/finance/`)

Wire both to `audit_events`. An entry names the actor, the entity, what changed (`before`/`after`)
and when. Render as a timeline, reusing the comment-thread visual language rather than inventing a
second one.

**Metering** is wired to three create paths (quotations, BOQs, AI); roughly twenty others are free.
Extend `usage_events` to cover the rest. The competitor's `Credits Left: 328` is a raw decrementing
counter — VEYRA's is ledger-backed Used/Allowed/Remaining, and stays that way.

---
---

# PART 4 — Phase 11: Accounting & Finance

**Source of record:** `PLAN-V4.md §12`, frames `110458` `110521` `110534`.

The owner: *"I want to keep the whole system interconnected… got to make it simple, but keep it
interconnected."* Sub-modules: **Petty Expenses · Approvals · Payments · Account Receivables.**

## What already exists (do not rebuild)

| Thing | Where |
|---|---|
| `contracts` (`vendor_id`, `project_id`, `amount`, `source`) | 0015 / 0028 / 0030 |
| `milestones` — the PAYMENT schedule (`pct`, `amount`, `tentative_due`, `work_done`, `actual_due`) | 0015 |
| `payments` — the append-only ledger (`vendor_id`, `member_id`, `expense_type`, `category`, `reversal_of`, `project_id`) | 0037 |
| `expense_claims` (`member_id`, `project_id`, `spent_on`, `amount`, `category`, `status`, `decided_by`) | 0023 |
| `summarisePlan`, `rollupContract`, `scheduleTotals`, `actualDueOf`, `milestoneOverdue` | `lib/finance-model.ts` |
| `buildLedger` — hides **both** halves of a reversed pair | `lib/payments-ledger-model.ts` |
| `vendorProjects`, `vendorProjectTotals` | `lib/vendors-model.ts` |
| `projectProfitability()` | `lib/data/reports.ts` — **currently string-joins `projects.name === payments.project_label`** |
| Nav entry `Account Receivables → /finance/receivables` | `lib/nav.ts`, marked `soon: true` |

**⚠ `milestones` (0015, payment schedule) and `project_milestones` (0032, delivery schedule) are two
tables on purpose.** Merging them would mean a project's plan and its invoicing could never
disagree, and on a real site they always do. `verify.mjs` asserts they stay separate.

---

## UNIT 1 — Settle the vocabulary, then the matrix model

**This unit contains a decision that is the owner's, not yours. Read it carefully.**

### The collision

Frame `110234` (vendor projects) and `lib/finance-model.ts::summarisePlan` use the words
`Total Payables` for two different quantities. From the frame's own three rows:

```
Sudha Interior   agreed 27,000 · disbursed 13,500 · payables 13,500 · dues 0
Daizy Interiors  agreed 51,200 · disbursed 0      · payables 51,200 · dues 7,100
project-1wh5kos  agreed 0      · disbursed 1,000  · payables −1,000 · dues −1,000
```

Only one pair of formulas fits all three:

```
Total Payables = agreed − disbursed   (the whole remaining commitment)
Payable Dues   = billed − disbursed   (payable right now)
```

`summarisePlan` currently calls `billed` itself "totalPayables". **The two agree on Dues and
disagree on Payables.**

**Recommendation: adopt the frame's reading**, because `agreed − disbursed` answers "what do I still
owe this vendor over the life of the job", which is the question the Payments Dashboard exists for,
and `billed` already has a better name (`billed`). Rename `summarisePlan`'s field and update its
callers — the project Financial Planning screen is the only one.

**If you adopt it:** the rename must be mechanical and complete, with the tests updated in the same
commit, and `lib/vendors-model.ts::vendorProjectRow` loses its "the two screens disagree" comment
because they no longer do. **If you would rather not**, say so in `DECISIONS I MADE` and build Unit 2
against both names — but do not leave the codebase with one word meaning two things.

### Then the model

`110458`'s matrix, as a pure function in `lib/payments-dashboard-model.ts` with tests.

Per project: `Client Name · Project Name · Project Value · Funds Received · Total Receivables ·
Receivable Dues · Estimated Expenses · Disbursed Amount · Total Payables · Payables Dues ·
Cash Flow · Expected P&L`.

Every figure is `summarisePlan` applied per project — **do not write a second money model.** The
function's job is to group contracts/milestones/payments by `project_id` and call the existing one.

The summary band above it: `Total Projects · Expected P&L · Project Value`, then an **Inflow** group
(`Total Receivables · Funds Received · Receivable Dues`) and an **Outflow** group (`Est Expenses ·
Disbursed · Payables`). These are sums of the rows — and a test must assert that the band equals the
sum of the visible rows under every filter, because a header that disagrees with its own table is
the single worst thing a finance screen can do.

**The real `project_id` FKs this needs are already in place (0028).** `projectProfitability()` in
`lib/data/reports.ts` still string-joins on the label — **fix it in this unit**, or delete it if the
new model supersedes it. Report which you did.

---

## UNIT 2 — `/finance/payments` (Payments Dashboard)

**Depends on Unit 1.**

### Frame `110458` in words

Header `Payments Dashboard`, `Import Payments` (outlined), and the note `Auto refreshes after 24
hours`. **`Summary Applied Filters:` shows the active filter as a chip** — `Project Stage: Planning
+ 13`. That chip matters: a summary band that does not say what it is filtered to is a number
without a denominator.

Then the summary band and the per-project matrix described in Unit 1. **Cells are tinted** —
receivables green, dues amber, negatives red. Several cells carry a **drill-through arrow** to that
project's own Payments module.

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

**Verify in the app:** fetch the page and quote the band figures and one project row, then check
that row against `db.mjs sql` over `contracts`/`payments`. The band must equal the rows.

---

## UNIT 3 — `/finance/petty` (Petty Finance)

**Depends on nothing in this part.**

### Frame `110521` in words

Header `Petty Finance`, a centre toggle **`All Expenses` | `All Funds`**, and `Approvals`
(outlined). Tabs **Dashboard · My Expense · My Fund** — the owner: *"imagine I click a person's
name… I get petty finance, my dashboard, my expense, my fund."*

**Left rail:** a `‹ [Month ▾] [Year ▾] ›` stepper · a user search · a **Summary card**
(`Balance` / `Expense` / `Fund`) · then **per-user cards**, each with a balance chip and
expense/fund lines. **Clicking a user scopes the whole page to them.**

**Right:** summary tiles (`Overdrawn Balance` · `Total Expenses` · `Total Funds`) ·
**`☐ View Reversed Transactions`** · a ledger `ID · User Name · Project Name · Transaction Date ·
Recorded Date · Amount · Category · Vendor`.

**Note `Deleted Project` appears as a project name.** Soft-deleted projects must still render in the
ledger — the money is real even when the project is gone.

### Build

- **Extend `expense_claims` (0023). Do not duplicate it.** If it needs a column, add one.
- **Reuse `buildLedger` from `lib/payments-ledger-model.ts`** for the reversed-transactions
  checkbox. It already hides *both* halves of a reversed pair and excludes them from the total in
  either mode — that is the whole point of it, and re-implementing it will get the totals wrong.
- Transaction Date is typed by a person; Recorded Date is stamped. They are different columns and
  the frame shows both. Never derive one from the other.
- A project that no longer resolves renders its name as the frame does, not as a blank cell.
- Per-user scoping is a URL parameter, so the scoped view is shareable and verifiable by fetching
  HTML.

---

## UNIT 4 — `/finance/receivables` (Account Receivables)

**Depends on Unit 1's vocabulary decision only.** This is the cheapest unit in the phase.

### Frame `110534` in words

Header `Account Receivables`, a filter, `Auto refreshes after 24 hours`. Four tiles, each showing
`n Milestones | ₹`:

- **`Overdue Payment`** · **`Milestone Overdue`** · **`Upcoming Milestone`** ·
  **`Written Off Payments`**

Table: `Project Name · Sales Owner · Milestone (%) · Due Date · Amount · Pending · Received ·
Action`. **`Amount` cells green-tinted, `Pending` amber-tinted** — a genuine status use of colour.
Milestone names read like `Design Signoff (20%)`, `Hand Over (50%)`.

### Build

> **This reads directly off the `milestones` rows Phase 8 §9.3 already writes. Nothing is
> re-entered.** That is the interconnection the owner asked for — say so in the page's own comment
> header.

- The four tiles are four filters over one set of milestones. **`Overdue Payment` and `Milestone
  Overdue` are different questions**: one is a payment past its due date, the other is a milestone
  whose *work* slipped. Name the difference on the screen; if the distinction cannot be supported by
  the current columns, say so in `PROBLEMS FOUND` rather than making both tiles the same query.
- **`Written Off` has no column today.** Either add one in a new migration (`0040`) — writing off a
  receivable is a decision that needs a who and a why, not a delete — or omit the tile and report
  it. Do not fake it.
- Reuse `milestoneOverdue` and `actualDueOf` from `lib/finance-model.ts`.
- Remove `soon: true` from the nav entry once the route exists.

---
---

# PART 5 — Phase 12: Reports & polish

**Source of record:** `PLAN-V4.md §13` and `competitor-research/DESIGN-DIRECTION.md §6, §8`.

This phase has no new domain model. It is the difference between a product that demos and a product
that ships.

---

## UNIT 1 — Wire the Reports permission groups to real reports

The permission matrix (Part 3 Unit 5) names six: **Payment · Client · User · Labour · Lead ·
Financial**. Each must resolve to a real report at `/reports/<report>`, gated by its capability.

`app/(app)/reports/` and `lib/data/reports.ts` already exist — extend them. A report that a
permission names and the product does not have is the same broken promise as a permission nothing
enforces.

---

## UNIT 2 — Saved views · column chooser · CSV export

Every list screen gets all three. Build each **once**, in `components/ui/`, and adopt it everywhere —
this is a cross-cutting pattern, and three implementations of a column chooser is how a codebase
starts to rot.

- **Saved views** persist a filter set per user per screen. A new table (`0040+`), org-scoped.
- **Column chooser** persists alongside the saved view.
- **CSV export** honours the *current* filter and the *current* columns, and says how many rows it
  wrote. An export that silently ignores the filter is worse than no export.

---

## UNIT 3 — Skeleton loading + designed empty states

`DESIGN-DIRECTION §6` — the states that get forgotten:

- **Empty:** icon + one line of what-this-is + the primary action. Not a blank box.
- **Loading:** skeleton rows for tables, never a spinner over the whole page.
  `app/(app)/dashboard/workspace-skeleton.tsx` is the existing pattern.
- **Error:** inline, actionable, with a retry. Never a raw stack trace.
- **Permission-limited:** the designed state from Part 3 Unit 5, not an omitted column in a broken
  layout.

Audit every list route in Part 1 §3 and report which were missing which.

---

## UNIT 4 — Accessibility floor + red-discipline audit

`DESIGN-DIRECTION §8`:

- Text contrast ≥ 4.5:1. `#D6122B` on white is ≈5.3:1 — fine at 14px+, **not** below.
- **Status never by colour alone** — always a label or an icon too.
- Visible focus ring (2px), keyboard-navigable tables and menus, 44px minimum touch targets on
  mobile/site surfaces.

Then the full **red-discipline audit** across every screen built in Phases 9–11. Red is allowed
exactly five jobs (Part 1 §2 rule 7). Walk every route, list every red element, and justify or
replace it. The known offenders the competitor taught us to avoid:

- two competing red buttons in one view;
- a status chip that is red for a state that is not an alarm;
- overdue shown as red text with no icon;
- red used as decoration on a chart series or an icon.

Report the list of routes audited and every red use you changed.

---

## The tail — every unit in Parts 3–5 ends this way

1. Run the six gates (Part 1 §6). Baseline must not drop:
   tsc 0 · eslint 0 · 591 tests in 39 files · verify 161/161 · verify-storage 11/11 · build clean.
2. Verify against the running app on port 3010 using both techniques in Part 1 §7 — fetch the page,
   and POST the server action. Quote the actual figures and row ids you got back.
3. Report in the shape in Part 2 §6, under 40 lines.
4. **Do not commit. Do not run `db.mjs migrate`.**
