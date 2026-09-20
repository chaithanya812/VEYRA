# HANDOFF — Dzylo Reports & Analytics (orchestrator + sub-agent program)

**Read `HANDOFF-V10.md` first for the standing rules** (Part 3 rules, Part 4 reuse index,
Part 5 gates/verify/deploy). This file is the *program plan* for building VEYRA's company-wide
Reports & Analytics hub against the Dzylo "Track All Your Business Reports in One Place" video. It
is written for an ORCHESTRATOR that dispatches `veyra-unit` sub-agents one unit at a time.

Working dir: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM` · Branch:
`quotations-v2-plus-fleet` · Evidence: `dzylo-research/05-Business-Reports.pdf` (DZ-00..13) and
`dzylo-research/VEYRA-SITE-INVENTORY.md` + `VEYRA-BUILD-MAP.md`.

> **This program is mostly PROMOTION, not construction.** The reports hub, the six-way capability
> taxonomy, the ledger / petty / labour / matrix models, the chart primitives, the Chart|Table
> toggle and CSV export **already exist** (receipts in Part 5, re-checked below). The genuinely new
> work is (a) promoting project-scoped ledger & labour models into **company-wide, filterable**
> report screens, and (b) resolving **two real mismatches** (Client-app activity; async generation).
> Because "new" here usually means "assemble models that already exist into a screen," the
> INSPECT-FIRST discipline matters MORE, not less: a sub-agent that starts rebuilding `buildLedger`
> or a second labour total has already failed.

---

## PART 0 — Paste this to start a fresh orchestrator session

```
Read HANDOFF-DZYLO-REPORTS.md in full, then HANDOFF-V10.md Parts 3-5. You are the
ORCHESTRATOR for the Dzylo reports & analytics program — a HANDS-ON reviewing engineer,
NOT a ticket-passer. You do not write feature code, but you own the quality of every
unit as if you wrote it. A sub-agent that says "done, gates green" is an INPUT to your
review, never the end of it.

For EACH unit you run this loop (Part 1 has the full mandate):
1. INSPECT FIRST yourself. `git log --oneline -8` + read the real files the unit touches,
   with file:line receipts. Confirm what is actually built vs missing — do NOT trust the
   brief's "already built"/"gap" claims. This program's special trap: almost every screen
   already has a working VEYRA counterpart, so a "build" is usually really "call an existing
   model cross-project." Before dispatching, confirm the model the unit will reuse ACTUALLY
   EXISTS and is exported where the brief says, and that no metric is about to be re-derived.
   Tighten the brief to the REAL gap. Never dispatch a loose brief.
2. DISPATCH ONE veyra-unit sub-agent (never in parallel) with the tightened brief.
3. REVIEW HARD when it reports back: read the FULL diff line by line, RE-RUN all six gates
   yourself, verify every WRITE in db.mjs and every screen via node-fetch + Aditi's cookie
   (the browser pane can't paint — Part 7). The single most important review question for
   THIS program: did the unit read the shared model, or did it fork/re-sum a total another
   screen already computes? A parallel total is an automatic reject. Never take "green" on
   faith.
4. COMMIT locally yourself (agents never commit) with a why-shaped message. Never push or
   deploy (rule 10). Then update this file's Part 2 and go to the next unit.

Ask me before a unit only if its brief has a genuine open choice (the Part 3 questions —
Q1 client signal and Q2 async infra actually gate U7/U8). Otherwise decide per the Part 3
heuristic and proceed.

Start by INSPECTING the current state (git log + read app/(app)/reports/ + the reuse
models in Part 5) and tell me what you actually found before dispatching anything.
```

---

## PART 1 — The method (orchestrator ↔ veyra-unit)

This mirrors HANDOFF-V10 §1.4–1.6, specialised for this program.

> **ORCHESTRATOR MANDATE — read this before you dispatch anything.**
> You are a senior engineer who happens to delegate the typing, not a router that forwards
> tickets. You are accountable for every line that lands as if you wrote it. Concretely, on every
> unit you personally: (1) **inspect the real code first** and rewrite the brief to the actual gap —
> the briefs in this file are the best current knowledge, but this codebase has a habit of already
> owning what a competitor video makes look like new work; assume a "build" may already be half-done
> and a "reuse" may need a real lift (cross-project scope); (2) **read the sub-agent's entire diff**
> and reject hand-waving, dead code, **a rebuilt model, or a second copy of a total that
> `payments-dashboard-model` / `payments-ledger-model` / `petty-finance-model` / `labour-model`
> already computes** — the VEYRA RULE (one question, one model) is the sharpest review edge in this
> program; (3) **re-run all six gates yourself** and **re-verify reads in `db.mjs` and screens via
> node-fetch** — a sub-agent's "gates green, verified" is a claim to check, not a fact to trust
> (this project's history: "a green test that examined nothing is the worst outcome"); (4) **only
> then commit.** If you find yourself pasting a brief and waiting, you are doing it wrong.

- **The orchestrator does not write feature code.** But it inspects, reviews, gates, and commits —
  hands on the code the whole time.
- **`veyra-unit` sub-agents build.** Each gets ONE self-contained brief (Part 6), writes the
  data layer + screen + tests (most units add a company-wide read path + a screen, not a table),
  runs the six gates, verifies against the running app, reports, and **stops without committing**.
  The agent starts cold — the brief must be complete.
- **One at a time, by address, never in parallel.** Parallel writers on one codebase is how you
  get two implementations of the same arithmetic — and in a *reports* program that means two
  different "total expense" figures on two screens, the exact defect this whole plan exists to
  prevent. `Explore` is the only parallel-safe agent (read-only fan-out).
- **The orchestrator commits.** After the agent reports and you re-confirm the six gates, commit
  with a message that says WHY the shape is what it is (the commit log is the design record).
- **Every sub-agent's non-negotiable protocol** (the briefs are deliberately not exhaustive — this
  protocol is what makes a terse brief safe):
  1. **INSPECT FIRST, with receipts.** A brief's "already built" / "gap" claims are the orchestrator's
     best knowledge, NOT ground truth. Before writing anything, grep/read the named files and confirm
     the ACTUAL current state (cite `file:line`). In THIS program the specific thing to confirm is:
     *the model I am about to reuse exists and is exported here, and the figure I am about to show is
     the one that model already computes — I am adding a new VIEW, not a new MODEL.* If reality
     contradicts the brief, say so and adjust scope to the real gap.
  2. **Build only the gap — reuse the model, never fork it.** Reuse the Part 5 index. A company report
     calls the existing builder cross-project (through `withOrg()` with no project filter); it does
     NOT re-sum, re-group, or re-derive a total that `/finance/payments`, `/projects/[id]/payments`,
     `/finance/petty`, or `labour-view` already produces. Red stays reserved — categorical palette
     from `charts.tsx` only, never a red donut slice or a red "Lost" tile.
  3. **VERIFY FALSIFIABLY, both halves.** Run all six gates (Part 7) and hold the baseline. Verify
     app rendering with node-fetch + cookie (Part 7 — the browser pane can't paint here). Verify the
     numbers against `db.mjs` — a report's whole job is to be a true reflection of a query, so prove
     the on-screen total equals the `db.mjs` sum, and (the point of the whole program) equals the
     figure the source screen shows. A green gate that examined nothing is the worst outcome.
  The orchestrator RE-RUNS the six gates and reviews the diff before committing — it does not take the
  agent's word for green.
- **Dispatch prompt template** for each unit:
  ```
  You are implementing ONE unit on VEYRA. Working dir + branch as in HANDOFF-DZYLO-REPORTS.md.
  Dev server is running at http://localhost:3010. READ FIRST: HANDOFF-V10.md (rules Part 3,
  reuse Part 4, gates Part 5) and HANDOFF-DZYLO-REPORTS.md Part 1 (your protocol), Part 5 (reuse),
  Part 7 (env/verify).
  FOLLOW THE PART 1 PROTOCOL: inspect the real code state first (with file:line receipts) before
  building — the brief's "already built"/"gap" claims are a starting point, not ground truth. This
  program's specific rule: reuse the shared model cross-project, NEVER fork or re-sum a total another
  screen already computes (the VEYRA RULE), and keep red reserved. Then verify falsifiably (six gates
  + node-fetch render + db.mjs proving the on-screen total equals the source-screen figure + each
  VERIFY bullet with real output).
  If the unit needs a migration, run `ls supabase/migrations/ | tail -1` at dispatch and take the
  NEXT number — do NOT hardcode 0044 (other programs on this branch reserve slots; see Part 2).
  [PASTE THE UNIT BRIEF FROM PART 6]
  REPORT BACK, DO NOT COMMIT: (a) files changed, (b) six-gate numbers, (c) what you inspected and
  what you verified in the app + db.mjs with actual output (including the "same figure on both
  screens" check), (d) deviations / where reality differed from the brief. No git commit, no push,
  no db.mjs migrate.
  ```

---

## PART 2 — State (as of 2026-09-13)

**~70–85% BUILT.** This is a promotion-and-depth program, not a from-zero build. Re-inspected for
this handoff, with receipts:

- **The `/reports` hub exists and is gated.** `app/(app)/reports/page.tsx:17-18` renders cards via
  `canAll(REPORTS.map(r => r.capability))` and shows a card only if the caller holds its capability
  (a hidden link is presentation, never a control — `page.tsx:11-14`). Nine report defs live in
  `reports-config.tsx`; the runner `app/(app)/reports/[report]/page.tsx` guards with `can()` BEFORE
  `def.run()` (`:29`) and renders a clean table + `ExportCsvButton` (`:59-64`) over each def's
  `head`/`rows`/`csv`.
- **The six-group capability taxonomy is already declared** exactly as Dzylo's five cards +
  Financial: `can-model.ts:118-123` — `reports.payment/client/user/labour/lead/financial.view`
  (verified verbatim).
- **The money models exist and are shared today.** `payments-ledger-model.ts`: `LedgerSide` (`:64`),
  `directionFor` (`:67`), `buildLedger` (`:97`), `reversalOf` (`:140`), `EXPENSE_TYPES` (`:29`),
  `PAYMENT_MODES` (`:45`), `groupBy`/`byMonth` (`:189`,`:220`). `petty-finance-model.ts`:
  `PETTY_KINDS` (`:38`), `transactionDateOf`/`recordedAtOf` (`:104`,`:109`), `pettyLedgers` (`:178`),
  `pettyUserCards` (`:210`), `pettySummary` (`:264`), `resolveMonth`/`monthLabel` (`:316`,`:301`),
  `filterClaims` (`:349`). `payments-dashboard-model.ts` (the cross-project spine behind
  `/finance/payments`): `paymentsMatrix` (`:142`), `summariseMatrix` (`:248`), `filterMatrix`
  (`:285`), `describeFilter` (`:315`), `MATRIX_COLUMNS` (`:374`).
- **The labour analytics screen is the single strongest match — already built, per-project.**
  `app/(app)/projects/[id]/labour/labour-view.tsx` imports `{ AreaTrend, Donut }` from
  `components/ui/charts` (`:35`), has an **Analytics tab** (`:195`, `AnalyticsTab` at `:543`), and —
  verbatim the owner's ask — every analytics card carries a **Chart | Table toggle** (`ChartCard`
  at `:600`, toggle at `:622-623`). `labour-model.ts` supplies `dailyTrend` (`:157`), `byCategory`
  (`:206`), `byVendor` (`:224`), `byContract` (`:246`), `bySkill` (`:264`).
- **Chart primitives + CSV export + column chooser exist.** `components/ui/charts.tsx`: `AreaTrend`
  (`:22`), `Donut` (`:126`), `BarList` (`:225`). `saved-views-model.ts`: `buildCsv` (`:354`),
  `csvFilename` (`:387`), `parseColumns` (`:203`), `columnChoices` (`:237`).
- **The server data layer for reports exists**: `lib/data/reports.ts` (21 KB) is where each report
  def's `run()` fetches rows. New company-report read functions belong HERE, cross-project via
  `withOrg()`, not in a new model.

**Genuinely NEW work** = promoting the project-scoped ledger & labour models into **company-wide,
filterable report SCREENS** under `/reports`, plus resolving the two mismatches (Part 4). Almost
nothing here is a new engine.

**Next unit: U1.** This plan is idempotent — **always `git log --oneline -8` first**; a unit already
landed is a no-op.

**Migration numbering — do NOT hardcode.** On disk the latest is `0043_saved_views.sql`, so the
naive next is `0044`. But this branch hosts several programs (procurement, project, inventory,
reports) that each reserve slots — **`0044` is STALE the moment another program lands first.** Every
unit that needs a migration MUST run `ls supabase/migrations/ | tail -1` at dispatch and take the
next number. Most units in THIS program need NO migration at all (they add read paths + screens);
only U8 (async archive, gated on Q2) adds a table.

**Baseline nothing may lower** (HANDOFF-V10 §2): re-confirm the live numbers with the six gates
(Part 7) at the start of the session and hold them — `tsc 0 · eslint 0 · vitest all-green ·
verify NN/NN · verify-storage 11/11 · build clean`.

---

## PART 3 — Decisions (NOT settled — bring these to the owner; recommendations are defaults, not law)

Unlike the procurement program, the reports questions are **open**. Answer them in one pass. Each
recommendation follows the owner's standing heuristic — *best for everyone · more features ·
dedicated not merged* — but the owner decides. Ordered by how much each changes the work; the two
**star mismatches** (Q1, Q2) are the only ones that actually gate a unit.

- **Q1 — Client Report signal (the biggest; STAR MISMATCH). GATES U7.**
  Dzylo's Client Report measures **client-APP login recency** (DZ-07). VEYRA has **no client app** —
  the client portal is PARKED / settled-NO (`VEYRA-SITE-INVENTORY` Part 4; HANDOFF-V10 Part 8). There
  is nothing to measure logins against. VEYRA *does* have a money-based client-summary report today
  (`reports-config.tsx:288`, cap `reports.client.view` — sold / received / outstanding).
  **RECOMMEND:** do **not** build usage/login tracking. Either keep the existing money-based Client
  Summary as-is, **or** define a dedicated "Client engagement" report on a signal VEYRA actually owns
  — **last interaction per client** (`interactions`, `VEYRA-SITE-INVENTORY` Part 3) or **last
  `/q/[token]` quote-share view**. Per the heuristic ("more features; dedicated not merged"), the
  fuller answer is a dedicated engagement report on last-interaction — but it is **gated on the owner
  picking the signal.** Until then U7 does not dispatch.

- **Q2 — Async generation vs synchronous views (STAR MISMATCH). GATES U8.**
  Dzylo's Lead Report generates a monthly report **asynchronously to a pre-signed S3 `.xlsx`**, with
  a Month/Year selector and a **run-history table with Status** (DZ-08). VEYRA reports are
  **synchronous server-component renders with on-demand CSV** — there is no job queue, no
  `report_runs` table, no stored archive. Adding that is real infra (a table under the three-edit
  rule + a generation job + signed-URL storage). **RECOMMEND:** ship **synchronous + a Month/Year
  filter + CSV first** (zero new infrastructure; most tenants want an instant filtered view, not a
  nightly batch). Add the async archive (U8) **only** if the owner explicitly wants **immutable
  monthly snapshots**. This is the only truly "more infra, not more features" call, so it deviates
  from the default heuristic on purpose.

- **Q3 — Cross-project scope. GATES U1, U3.** Confirm the company reports aggregate across all
  projects via `withOrg()` with **no project filter**, reusing `/finance/payments`' existing
  cross-project aggregation (`payments-dashboard-model`) rather than a new one. **RECOMMEND: yes** —
  this is exactly what `/finance/payments` already proves works for money; labour needs the same lift.

- **Q4 — Demo data.** Auto-clear on first real row, or manual dismiss? Per-tenant seeded rows vs a
  shared read-only sample? **RECOMMEND:** auto-clear on first real row (reports are read-only, so the
  risk is only cosmetic) inside a marked "DEMO — sample, replace me" banner; a **shared read-only
  sample**, not per-tenant seeded rows. (Consistent with the procurement program's Q7 convention.)

- **Q5 — Charts palette.** **RECOMMEND (and treat as a standing rule, barely a question):**
  categorical colours from `charts.tsx` for all donuts; **red excluded from decoration** — reserved
  for genuine alerts (overdue, negative, running-late). Dzylo colours donut slices and a "Lost" tile
  red; VEYRA must not.

- **Q6 — User Report shape. GATES U4.** Extend the existing `user-activity` report
  (`reports-config.tsx:323`) with assigned lead/project counts + a Projects↔Leads toggle, or ship a
  separate counts-only user report? **RECOMMEND: extend** — one report, more features via the toggle;
  a second user report would fork a figure. (Here "dedicated not merged" yields to the VEYRA RULE:
  the counts belong on the one user report, not a rival.)

- **Q7 — Export format. GATES U5.** CSV (today; opens in Excel fine) enough, or a true `.xlsx`
  required to match Dzylo? **RECOMMEND: CSV** — zero new dependency, already spreadsheet-clean
  (`reports-config.tsx` emits an unformatted `csv` grid alongside display rows). Add real `.xlsx`
  only if the owner insists on byte-matching Dzylo's download.

- **Q8 — Filter persistence. GATES U6.** Extend `saved-views-model` beyond
  `finance.payments`/`finance.receivables` (the only two `SavedViewScreenKey` values today,
  `saved-views-model.ts:35`) to the report screens, so a tenant can save a filtered report as a named
  view? **RECOMMEND: yes** — small, high-value, reuses the whole saved-views machinery.

---

## PART 4 — Findings from inspection (the two mismatches, plus where the report was slightly off)

The report's receipts are accurate; I re-verified every one against source for this handoff. The
substantive findings:

- **F1 (STAR MISMATCH — Client Report has no VEYRA signal).** As Q1. `reports.client.view` maps to a
  **money** report (`reports-config.tsx:288`), not activity. Dzylo's login-recency signal (DZ-07)
  **cannot be built as-shown** — VEYRA owns no client app. Do not silently build a login report;
  redefine onto last-interaction / last quote-share, or keep the money summary (owner, Q1).

- **F2 (STAR MISMATCH — async archive is real infra VEYRA doesn't have).** As Q2. VEYRA reports are
  synchronous + CSV (`reports/[report]/page.tsx` is a server component that renders `def.run()`
  inline). There is no `report_runs` table, no job queue, no signed-URL archive. Building DZ-08's
  async S3 `.xlsx` + run-history is a genuine infrastructure decision, not a reuse (owner, Q2).

- **F3 (VEYRA RULE — three existing places already answer "where did the money go/come in").**
  `/finance/payments` (`payments-dashboard-model`), `/projects/[id]/payments`
  (`payments-ledger-model`), `/finance/petty` (`petty-finance-model`). The company Payment Report
  (U1/U2) is a **fourth VIEW, never a fourth MODEL**. `projects.funds_received` is the SAME inflow
  figure as Project Fund. Any unit that re-sums these is an automatic reject.

- **F4 (inspection deltas — the report's line cites drift by ~1 in one file; harmless but note it).**
  In `reports-config.tsx` the report cited `client-summary` at `:287` (actually the `slug` is at
  `:288`, `capability` at `:289`) and `user-activity` at `:322` (actually `:323`). The labour toggle
  the report cited at `:67-68` is a **doc comment**; the real `Chart | Table` toggle is
  `ChartCard` at `labour-view.tsx:600-623`, and the Analytics tab is at `:195`/`:543`. Everything
  else (all model exports, `charts.tsx`, `saved-views-model`, `can-model`) matched to the line. **Net:
  the report is trustworthy; sub-agents should still INSPECT and cite fresh line numbers, since this
  branch moves.**

- **F5 (numbering).** On disk latest is `0043`; naive-next `0044` is STALE (Part 2). Only U8 needs a
  migration in this whole program.

---

## PART 5 — Reuse index (reports-specific — do not rebuild)

Everything here is checked and present (Part 2 / F4 receipts). HANDOFF-V10 Part 4 has the app-wide
index. **The one-line rule: a company report is a new screen over an existing model, read
cross-project through `withOrg()`.**

| Reuse | For | Receipt |
|---|---|---|
| `app/(app)/reports/page.tsx` (gated cards via `canAll`) + `reports-config.tsx` (9 defs) + `[report]/page.tsx` (`can()` before `run()`, `ExportCsvButton`) | The hub, the gating, the table+export shell | `page.tsx:17-18`; `[report]/page.tsx:29,:59` |
| `lib/data/reports.ts` | Where each report's `run()` fetches rows — new company-report read paths go HERE (cross-project), not in a new model | 21 KB, exists |
| `lib/can-model.ts` — `reports.payment/client/user/labour/lead/financial.view` | The six report capabilities already exist — no new cap needed for U1-U6 | `can-model.ts:118-123` |
| `lib/payments-ledger-model.ts` — `LedgerSide` (`:64`), `directionFor` (`:67`), `buildLedger` (`:97`), `reversalOf` (`:140`), `EXPENSE_TYPES` (`:29`), `PAYMENT_MODES` (`:45`), `groupBy`/`byMonth` | All Expenses / Project Fund tabs; Source & Expense-Type columns; Incl. Reverted | verified |
| `lib/petty-finance-model.ts` — `pettyLedgers` (`:178`), `pettyUserCards` (`:210`), `filterClaims` (`:349`), `resolveMonth`/`monthLabel` (`:316`,`:301`), `transactionDateOf`/`recordedAtOf` (`:104`,`:109`), `PETTY_KINDS` (`:38`) | Petty Fund tab (per-user credit/debit, the date calendar, recorded-vs-transaction) | verified |
| `lib/payments-dashboard-model.ts` — `paymentsMatrix` (`:142`), `filterMatrix` (`:285`), `summariseMatrix` (`:248`), `describeFilter` (`:315`), `MATRIX_COLUMNS` (`:374`) | The cross-project money spine (`/finance/payments`); the filter bar + running total | verified |
| `lib/labour-model.ts` — `dailyTrend` (`:157`), `byCategory` (`:206`), `byVendor` (`:224`), `byContract` (`:246`), `bySkill` (`:264`) + `LabourFilter` | Company Labour Report: trend + three donuts | verified |
| `app/(app)/projects/[id]/labour/labour-view.tsx` — Analytics tab (`:195`/`:543`), `AreaTrend`/`Donut` (`:35`), `ChartCard` Chart\|Table toggle (`:600-623`) | The screen to PROMOTE cross-project — clone its structure, feed it org-wide labour | verified |
| `components/ui/charts.tsx` — `AreaTrend` (`:22`), `Donut`/`DonutSlice` (`:126`), `BarList` (`:225`) | Every chart; enforces the categorical palette — red stays reserved | verified |
| `lib/saved-views-model.ts` — `buildCsv` (`:354`), `csvFilename` (`:387`), `csvCell` (`:349`), `parseColumns` (`:203`), `columnChoices` (`:237`), `SavedViewScreenKey` (`:35`, only 2 values today) | Export (U5) + column chooser (U2) + saved views (U6) | verified |
| `lib/data/with-org.ts` — `withOrg()` (the ONLY tenant guard; cross-project = no project filter, still org-scoped) | Every company-wide read | — |
| `leads/insights/insights-view.tsx` + `lib/lead-insights.ts`; `dashboard/page.tsx` + `workspace-shell.tsx`; `projects/page.tsx` (stage filter + assignee filter, Milestones cell) | Leads Insights & project-state donut are REUSE CONFIRMATIONS (DZ-12/13); the User-Report drill target already exists (DZ-10) | `VEYRA-SITE-INVENTORY` |
| `entity_comments`, `recordAudit`, `interactions` (last-interaction per client) | For the Q1 engagement redefinition, if chosen | `VEYRA-SITE-INVENTORY` Part 3 |

**Capabilities that exist:** all six `reports.*.view`. **U1–U6 need NO new capability.** A NEW report
surface only needs a new cap key in `lib/can-model.ts` if it is not one of the six groups — none of
these units is. **No new table** for U1–U7; **U8 alone** adds `report_runs` (three-edit rule:
migration + `lib/data/tables.ts` + org-isolation assert in `scripts/verify.mjs`).

---

## PART 6 — The units (dispatch one at a time; recommended order below)

**Recommended dispatch order:** U1 → U2 → U3 → U4 → U5 → U6, then **U7 (only after Q1 is answered)**
and **U8 (only if Q2 says yes)**. Each is sized S/M/L. **Most units add a company-wide read path +
a screen — no migration.** The recurring instruction, per the mandate: *most "new" work here is
"assemble existing models into a company-wide screen" — INSPECT to confirm the model truly exists
and is exported where this brief says, and confirm you are adding a VIEW, not re-deriving a metric.*

### U1 — Company Payment Report under `/reports` — three tabs · M/L  ·  gated by Q3
**Already built (don't touch):** `payments-ledger-model` (All Expenses = `LedgerSide "expenses"`;
Project Fund = `"funds"`/`directionFor→inflow`), `petty-finance-model` (Petty Fund), the
`/finance/payments` cross-project aggregation (`payments-dashboard-model`), the `/reports` shell +
`ExportCsvButton`. **Build:** a Payment Report screen with three pill tabs — **All Expenses / Project
Fund / Petty Fund** — whose panels call the EXISTING builders **cross-project** through `withOrg()`
with no project filter (add read functions to `lib/data/reports.ts`, not a new model). Mount under a
new report slug behind `reports.payment.view` (already declared). **VEYRA RULE:** Project Fund's
"money received from the client" MUST be the same `funds_received` / inflow figure the payments
matrix shows — read it, never re-sum. **Out of scope:** the filter bar + running total + Incl.
Reverted + column chooser (that is U2 — ship the three tabs with the essential columns first).
**Verify (falsifiable):** the three tabs render for Aditi via node-fetch on `:3010`; the All-Expenses
total on screen equals the `db.mjs` sum of the org's outflow ledger AND equals what `/finance/payments`
shows for the same scope; Petty Fund shows per-user credit/debit from `pettyUserCards`; no new model
file, no re-summed total (diff review).

### U2 — Payment Report filter bar + running total + Incl. Reverted + column chooser + explainer · M
**Already built (don't touch):** `filterMatrix`/`summariseMatrix`/`describeFilter`
(`payments-dashboard-model`), `columnChoices`/`parseColumns` (`saved-views-model`), the append-only
reversal model (`reversalOf`; a reversal is a counter-entry, never a delete). **Build:** the filter
row on U1's Payment Report — labelled fields directly (Project / User / Vendor / Category / Source /
Expense Type / Date), improving on Dzylo's two-step "pick a dimension then a value" (DZ-02); a
running **Total Amount** badge from `summariseMatrix`; an **Incl. Reverted Expenses** toggle
(default excludes the reversed pair, on shows it); a **column chooser** (essential columns visible,
the rest behind `columnChoices` — 13 columns is Dzylo's density to drop). Author the **recorded-vs-
transaction** and other explainers ONCE as a pure vocabulary map (like `prompt-library` VOCAB),
keyed by option, testable, never in JSX — copy is in `05-Business-Reports.pdf` Part B§4b (Recorded
vs Transaction, All Expenses, Project Fund, Petty Fund, Incl. Reverted, Source, Expense Type,
Chart\|Table). **Out of scope:** saving a filter as a named view (U6). **Verify:** a filter narrows
the `db.mjs`-confirmed row set; the running total re-foots to the filtered sum; Incl. Reverted flips
the reversed pair in/out; the explainer map is covered by a test and renders from the map.

### U3 — Company Labour Report — promote the Analytics view cross-project · M  ·  gated by Q3
**Already built (don't touch):** `labour-view.tsx` Analytics tab (`:195`/`:543`) with `AreaTrend` +
three donuts + the **Chart | Table toggle** (`:600-623`); `labour-model` `dailyTrend`/`byVendor`/
`byCategory`/`byContract`; `charts.tsx`. This is the strongest match in the whole video — the ONLY
gap is that it lives inside one project. **Build:** a company Labour Report under
`reports.labour.view` that reuses the SAME view structure + `labour-model` fed **org-wide** (no
project filter, via `withOrg()`): Daily Labour Trend area chart + Labour by Vendor / Category /
Contract donuts, each with the Chart|Table toggle. **VEYRA RULE:** share `labour-model` — forking it
would let two labour totals drift. **Red rule:** Dzylo's donuts use red as a category colour; VEYRA
uses the categorical palette in `charts.tsx` — no red slice. **Out of scope:** a new labour metric or
a per-day attendance rebuild (the Overview table already exists per-project). **Verify:** the report
renders cross-project via node-fetch; each donut's slice sum equals the `db.mjs` labour total for the
org; the Chart|Table toggle shows the numbers behind every donut; no red in the palette (inspect the
rendered classes).

### U4 — User Report — assigned lead/project counts + Projects↔Leads toggle + drill · S/M  ·  gated by Q6
**Already built (don't touch):** `user-activity` report (`reports-config.tsx:323`, cap
`reports.user.view`) — Member/Role/Hours/Sessions/Open/Leave/Tasks; the drill target
`projects/page.tsx` (assignee filter + Milestones cell, DZ-10); `/leads` assignee filter. **Build
(Q6 = extend, not fork):** add two count columns to the existing user-activity report — **assigned
leads** (`leads.assigned_to`/`lead_assignees`) and **assigned projects** (member assignment) — a
**Projects↔Leads view toggle**, and a per-user **drill link** into `/projects?assignee=` and
`/leads?assignee=` (no new screen — reuse the existing filters). **Out of scope:** a second,
counts-only user report (Q6 rejects it — one figure, one report). **Verify:** the counts equal the
`db.mjs` assignment counts per member (filtered by `org_id` — demo names repeat across tenants); the
drill link lands on the pre-filtered list; the toggle switches the report's grouping without a second
data model.

### U5 — Export — confirm CSV columns match every report's on-screen table; optional true `.xlsx` · S  ·  gated by Q7
**Already built (don't touch):** `ExportCsvButton` + `buildCsv`/`csvFilename` on every report
(`[report]/page.tsx:59`); each def emits a spreadsheet-clean `csv` grid alongside display rows.
**Build:** confirm each report (including the new U1–U4 screens) exports a `csv` whose columns and
values match the on-screen table (DZ-06 header set for Payment); fix any drift. **Only if Q7 = xlsx:**
add a true `.xlsx` export (a new dependency — flag it) mirroring the CSV columns. **Out of scope by
default:** `.xlsx` unless the owner insists. **Verify:** the exported CSV headers/rows equal the
on-screen table for each report; numbers are unformatted (analysis-ready); `db.mjs` row count equals
CSV row count.

### U6 — Saved filter views on the report screens · S  ·  gated by Q8
**Already built (don't touch):** the whole saved-views machinery — `saved_views` table (stores the
QUESTION not the answer), `SavedViewScreenKey` (`saved-views-model.ts:35`, today only
`finance.payments`/`finance.receivables`), the save/delete-view actions on `/finance/payments`.
**Build:** extend `SavedViewScreenKey` to the report screens (e.g. `reports.payment`,
`reports.labour`) and wire save/name/delete a filtered report as a named view, reusing the existing
actions and UI. **Out of scope:** any new persistence mechanism — this is an extension of one union
type + reuse. **Verify:** saving a filtered Payment Report writes a `saved_views` row scoped to
`member_id`+`screen` in `db.mjs`; reopening restores the filter; delete removes the row.

### U7 — Client engagement report · S/M  ·  **GATED on Q1 — do not dispatch until the owner picks a signal**
**Decision Q1 (open).** VEYRA has no client app; the client portal is PARKED. **Do NOT build login
tracking.** Only after the owner picks a signal VEYRA owns: build a dedicated engagement report on
**last interaction per client** (`interactions`) or **last `/q/[token]` share view** — otherwise keep
the existing money-based Client Summary as-is and ship nothing here. **Out of scope (always):** any
client-app usage/login metric; any new client-facing surface. **Verify (once dispatched):** the
"last activity" per client equals the `db.mjs` max timestamp of the chosen signal; no login/usage
table is created.

### U8 — Async report archive · L  ·  **GATED on Q2 — only if the owner wants immutable monthly snapshots**
**Decision Q2 (open, recommended NO).** VEYRA reports are synchronous by design. Only if the owner
wants stored monthly snapshots: add `report_runs` (three-edit rule — migration `ls
supabase/migrations/ | tail -1` +1 at dispatch, NOT 0044; `lib/data/tables.ts`; org-isolation assert
in `scripts/verify.mjs`) with `org_id` + `status` + `storage_path`, a generation job to VEYRA's
document storage, a signed URL, and a Month/Year run-history table (DZ-08). **Out of scope (always):**
S3 specifically — reuse VEYRA's existing document storage, not a new provider. **Verify (once
dispatched):** a generated run writes a `report_runs` row + a stored file; the run-history lists it
with Status; the signed URL downloads the same rows a synchronous render would produce.

---

## PART 7 — Environment & verification (read before dispatching)

- **The browser pane does NOT work in this environment** (the app window is hidden/minimised → it
  can't paint, collapses to 0×0, screenshots time out). Verify app rendering with **node fetch +
  the session cookie** (HANDOFF-V10 §5.3), which is reliable:
  ```
  node -e "fetch('http://localhost:3010/<path>',{headers:{cookie:'veyra_acting_member=ae9569dc-c875-4d80-9129-ca83d169b396'}}).then(r=>{console.error('STATUS',r.status);return r.text()}).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').replace(/(\s*\|\s*)+/g,' | ').slice(0,3000)))"
  ```
  A page requires the cookie or it 307s to `/login`. `Loading…` is the skeleton's sr-only label,
  not a stall. Server logs: `preview_logs`. If the owner brings the app window forward, the
  screenshot pane may start working — but the fetch method is enough.
- **Never trust the pane for numbers** — a report IS its data, so verify every figure in `db.mjs`
  and, for THIS program, prove the on-screen total equals the figure the source screen already shows.
- **DB:** `node scripts/db.mjs sql "<query>"` (never the Supabase MCP — rule 11). Migrations:
  `node scripts/db.mjs migrate` is **owner-run**, show the migration first. Local reads/writes hit
  the SAME Supabase project as production, so a migration is live the moment it is applied. **Filter
  `org_members` by `org_id`** — demo names repeat across tenants (four "Rahul Verma"s), which matters
  for the User Report counts (U4).
- **Demo tenant** `d46a53af-58b1-4ed7-87be-c675e5803802` (`Veyra Demo Interiors`), project
  **Malviya Nagar 3BHK** `c1d3b37a-9c0c-4263-bfd1-431b935d0597`. Owner **Aditi Pradhan**
  `ae9569dc-c875-4d80-9129-ca83d169b396` (use her cookie for full-permission verification). Demo
  vendors: Century Ply `466eca5f-a4a5-4170-970e-ceb8978320c6`, Hettich
  `e7e39271-358f-4147-a9a8-e2984e003a2e`. Warehouse Head Office Store
  `cf91eefd-a6d3-42b2-b724-18311160cc87`.
- **Six gates** (HANDOFF-V10 §5.1), run by the agent AND re-confirmed by the orchestrator before commit:
  ```
  node ./node_modules/typescript/bin/tsc --noEmit
  node ./node_modules/eslint/bin/eslint.js app lib components
  node ./node_modules/vitest/vitest.mjs run
  node ./node_modules/next/dist/bin/next build   # then: git checkout next-env.d.ts
  node scripts/verify.mjs
  node scripts/verify-storage.mjs
  ```
  `next build` skips test files, so run `tsc` too. `verify-storage` is occasionally 10/11 against
  remote storage — re-run before believing a failure. Hold the Part 2 baseline.
- **Restore point** exists (tag `snapshot/pre-chatgpt-2026-09-10`, commit `3804e23`). Reports are
  read-only, so the data risk in this program is low — but a unit that seeds demo rows (Q4) still
  writes; verify with `db.mjs`.

---

## PART 8 — NOT building (said out loud)

- **A client-app login/usage-activity report** — VEYRA has no client app; the client portal is
  PARKED / settled-NO (HANDOFF-V10 Part 8). Redefine onto a signal VEYRA owns, or drop (Q1).
- **Async S3-backed monthly generation** unless the owner explicitly wants stored immutable snapshots
  (Q2) — VEYRA reports are synchronous by design; reuse VEYRA's own document storage if built, never
  a new S3 pipeline.
- **A fourth copy of the payment / labour / petty models** — the company reports READ the existing
  models cross-project; forking them is forbidden (VEYRA RULE). Two labour totals or two "total
  expense" figures on two screens is the exact defect this program exists to prevent.
- **Red as a decorative chart / tile colour** — Dzylo's donut slices and "Lost" tile use red; VEYRA
  keeps red for genuine alerts only (overdue, negative, running-late). Categorical palette from
  `charts.tsx`.
- **The "Ask Gemini" / "Smart Actions" AI toolbar and any AI-authored figures** — out of scope; every
  number stays deterministic (rule 2).
- **Dzylo's dense 13-column ledger look** — keep the information, drop the density (standing
  instruction): essential columns visible, the rest behind the `columnChoices` chooser.
- **The Quotations 2.0 nav badge** seen in DZ-12 — that is the PARKED Modular Quotation feature,
  unrelated to reports; do not action it from here.

---

*Next step after the last unit: split this report into the two repo files the method calls for —
`FRAME-REGISTER-DZYLO-REPORTS.md` (Part A evidence) and `PLAN-DZYLO-REPORTS.md` (Part B instruction)
— from `dzylo-research/05-Business-Reports.pdf`, and persist the frames so a new chat can open them
by id. Most of this program is EXTEND, not build — and nothing is built until the owner answers Q1
and Q2.*
