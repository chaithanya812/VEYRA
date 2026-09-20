# HANDOFF — Dzylo Interior Project Management (orchestrator + sub-agent program)

**Read `HANDOFF-V10.md` first for the standing rules** (Part 3 rules, Part 4 reuse index,
Part 5 gates/verify/deploy). This file is the *program plan* for extending VEYRA's project
plan into the Dzylo "Interior Project Management" feature. It is written for an ORCHESTRATOR
that dispatches `veyra-unit` sub-agents one unit at a time.

Working dir: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM` · Branch:
`quotations-v2-plus-fleet` · Evidence: `dzylo-research/02-Project-Management.pdf` (DZ-00..12) and
`dzylo-research/VEYRA-SITE-INVENTORY.md` + `VEYRA-BUILD-MAP.md`.

> **Sibling program running on the same branch.** `HANDOFF-DZYLO-PROC.md` (procurement) is in
> flight on this same branch and **reserves migration slots 0044–0047** for units it has not yet
> landed. Do NOT trust the report's printed "0044" (Part B§2) — it is STALE. The literal next slot
> on disk today is 0044 (latest applied is `0043_saved_views.sql`), but procurement will consume
> 0044+ before or between these units. **Every unit that adds a migration MUST run
> `ls supabase/migrations/ | tail -1` at dispatch time and take the true next free number** (expect
> ≥ 0048 once procurement lands). Never hardcode a migration number from this file.

---

## PART 0 — Paste this to start a fresh orchestrator session

```
Read HANDOFF-DZYLO-PROJECT.md in full, then HANDOFF-V10.md Parts 3-5. You are the
ORCHESTRATOR for the Dzylo Interior Project Management program — a HANDS-ON reviewing
engineer, NOT a ticket-passer. You do not write feature code, but you own the quality of
every unit as if you wrote it. A sub-agent that says "done, gates green" is an INPUT to
your review, never the end of it.

For EACH unit you run this loop (Part 1 has the full mandate):
1. INSPECT FIRST yourself. `git log --oneline -8` + read the real files the unit
   touches, with file:line receipts. Confirm what is actually built vs missing —
   do NOT trust the brief's "already built"/"gap" claims. The report says the Timeline
   Planner is "buildGantt reuse, no engine change" — but `gantt.tsx` has ZERO drag/
   resize/mouse handlers, so U4 is a real BUILD, not a wiring job. Assume the other
   briefs can be wrong the same way. Tighten the brief to the REAL gap before
   dispatching. Never dispatch a loose brief.
2. DISPATCH ONE veyra-unit sub-agent (never in parallel) with the tightened brief.
3. REVIEW HARD when it reports back: read the FULL diff line by line, RE-RUN all six
   gates yourself, verify every WRITE in db.mjs and every screen via node-fetch +
   cookie (the browser pane can't paint — Part 7). Never take "green" on faith. If
   anything is off, send it back or fix the dispatch — do not commit slop.
4. COMMIT locally yourself (agents never commit) with a why-shaped message. Never
   push or deploy (rule 10). Then update this file's Part 2 and go to the next unit.

Ask me before a unit only if its brief has a genuine open choice (Part 3 lists them,
each with a recommended default — U1 build-in-house gates the whole PERT/Recommended
layer; the UOM-rollup semantics gate U5/U6; the attachment-upload pipeline gates U7).
Otherwise decide per the Part 3 heuristic and proceed.

Start by INSPECTING the current state (git log + read plan-view.tsx, gantt.tsx,
milestones-model.ts) and tell me what you actually found before dispatching anything.
```

---

## PART 1 — The method (orchestrator ↔ veyra-unit)

This mirrors HANDOFF-V10 §1.4–1.6, specialised for this program.

> **ORCHESTRATOR MANDATE — read this before you dispatch anything.**
> You are a senior engineer who happens to delegate the typing, not a router that forwards
> tickets. You are accountable for every line that lands as if you wrote it. Concretely, on every
> unit you personally: (1) **inspect the real code first** and rewrite the brief to the actual gap —
> the report in this very file claims the Timeline Planner is a no-engine-change reuse of `buildGantt`,
> but `gantt.tsx` is read-only (no drag/resize/link handlers at all), so that "wiring" is really a
> build; assume the other briefs can be wrong too; (2) **read the sub-agent's entire diff** and reject
> hand-waving, dead code, rebuilt engines (there must be exactly ONE Gantt, ONE milestone model, ONE
> CPM engine), or unguarded actions; (3) **re-run all six gates yourself** and **re-verify writes in
> `db.mjs` and screens via node-fetch** — a sub-agent's "gates green, verified" is a claim to check,
> not a fact to trust (this project's history: "a green test that examined nothing is the worst
> outcome"); (4) **only then commit.** If you find yourself pasting a brief and waiting, you are doing
> it wrong.

- **The orchestrator does not write feature code.** But it inspects, reviews, gates, and commits —
  hands on the code the whole time.
- **`veyra-unit` sub-agents build.** Each gets ONE self-contained brief (Part 6), writes the
  model + data layer + action + screen + tests, runs the six gates, verifies against the running
  app, reports, and **stops without committing**. The agent starts cold — the brief must be complete.
- **One at a time, by address, never in parallel.** Parallel writers on one codebase is how you
  get two implementations of the same arithmetic — this project's most common defect (and here the
  CPM float math, the Gantt geometry and the rollup % are all single-source engines that a parallel
  writer would fork). `Explore` is the only parallel-safe agent (read-only fan-out).
- **The orchestrator commits.** After the agent reports and you re-confirm the six gates, commit
  with a message that says WHY the shape is what it is (the commit log is the design record).
- **Every sub-agent's non-negotiable protocol** (the briefs are deliberately not exhaustive — this
  protocol is what makes a terse brief safe):
  1. **INSPECT FIRST, with receipts.** A brief's "already built" / "gap" claims are the orchestrator's
     best knowledge, NOT ground truth. Before writing anything, grep/read the named files and confirm
     the ACTUAL current state (cite `file:line`). If reality contradicts the brief — something is
     already done, or a "reuse" turns out to be a "build" (the read-only Gantt vs the report's
     "no engine change" claim) — say so in the report and adjust scope to the real gap rather than
     blindly building or blindly skipping.
  2. **Build only the gap.** Reuse the Part 5 index; never re-implement an engine/table that exists
     (`buildGantt`, `rollupMilestones`, `datePlan`, `groupByScope`, the deps CRUD, the templates).
  3. **VERIFY FALSIFIABLY, both halves.** Run all six gates (Part 5.1) and hold the baseline. Verify
     app rendering with node-fetch + cookie (Part 7 — the browser pane can't paint here). Verify every
     WRITE in `db.mjs`, never in the pane. Hit each of the brief's VERIFY bullets with actual output —
     a green gate that examined nothing is the worst outcome (HANDOFF-V10 §Tests). For the derived
     surfaces (CPM float, PERT, Insights) verify the NUMBERS reconcile by hand, not just that a page
     renders.
  The orchestrator RE-RUNS the six gates and reviews the diff before committing — it does not take the
  agent's word for green.
- **Dispatch prompt template** for each unit:
  ```
  You are implementing ONE unit on VEYRA. Working dir + branch as in HANDOFF-DZYLO-PROJECT.md.
  Dev server is running at http://localhost:3010. READ FIRST: HANDOFF-V10.md (rules Part 3,
  reuse Part 4, gates Part 5) and HANDOFF-DZYLO-PROJECT.md Part 1 (your protocol), Part 5 (reuse),
  Part 7 (env/verify).
  FOLLOW THE PART 1 PROTOCOL: inspect the real code state first (with file:line receipts) before
  building — the brief's "already built"/"gap" claims are a starting point, not ground truth; if
  reality differs, report it and build the real gap. Then verify falsifiably (six gates + node-fetch
  render + db.mjs on every write + each VERIFY bullet with real output).
  MIGRATIONS: run `ls supabase/migrations/ | tail -1` and take the true next number — do NOT trust a
  number printed in the handoff (procurement is reserving slots on this same branch).
  [PASTE THE UNIT BRIEF FROM PART 6]
  REPORT BACK, DO NOT COMMIT: (a) files changed, (b) six-gate numbers, (c) what you inspected and
  what you verified in the app + db.mjs with actual output, (d) deviations / where reality differed
  from the brief. No git commit, no push, no db.mjs migrate.
  ```

---

## PART 2 — State (as of 2026-09-13)

**MOSTLY BUILT — this is an EXTEND program with ONE real new algorithm, not a from-zero build.**
The spine of the Dzylo video is already live in VEYRA (proven with receipts below). This program
adds a deterministic scheduling-analysis layer and a handful of config columns.

**Already built — do NOT rebuild (checked, with receipts):**
- **Plan grid + activities:** `app/(app)/projects/[id]/plan/plan-view.tsx:81-83` — tabs
  Milestone · Gantt chart · Tasks over `project_milestones`. Dzylo's "activity" = VEYRA's milestone.
- **Milestone rollup / overview strip:** `lib/milestones-model.ts` — `rollupMilestones` (:94),
  `scheduleHealth` (:140), `groupByScope` (:176), `milestoneVariance` (:159), statuses + tones
  (:20-45), `ProjectMilestone` shape with `client_visible` (:46-61).
- **Gantt engine:** `lib/gantt-model.ts` — `buildGantt` (:130) → positioned bars with `dependsOn`,
  a per-bar `BarTone` AND a state word (never colour alone, :25), month ticks, `GANTT_LEGEND` (:231).
  **Read-only today** — see the caveat under "the ONE genuinely-new build".
- **Dependencies:** `project_milestone_deps` (`tables.ts:96`) + `toggleDependencyAction`
  (`plan/actions.ts:140`, imported at `plan-view.tsx:60`) + CRUD `listMilestoneDeps`
  (`data/project-milestones.ts:370`) / `setMilestoneDependency` (:411, insert/delete :435-447).
- **AI SmartPlan:** `lib/smartplan-model.ts` — `parseSmartPlan` (:84) strips every price/qty field,
  `datePlan` (:142) is the ONLY date source (arithmetic on a user-picked start), `planEndDate` (:167);
  + `plan/smartplan-dialog.tsx` + `plan/smartplan-actions.ts` + `applySmartPlan`
  (`data/project-milestones.ts:470`, inserts milestones AND deps). Already obeys RULE 2; already logs
  to `ai_requests`. This IS the "AI Project Planner".
- **Milestone templates:** `applyMilestoneTemplates` (`data/project-milestones.ts:297`) +
  `milestone_templates` (`tables.ts:97`) — the "start from a template" / seeded-plan mechanism.
- **UOM & variance maths:** `lib/site-model.ts` `MeasurementVariance` (:40), `variancePct` (:57),
  `varianceTone` (:69) + `lib/measurement-model.ts` `MEASURE_MODES` (:22), `deriveQty` (:91),
  `resolveQty` (:129).
- **Tasks + checklists:** `dashboard/actions.ts` task/checklist actions + `plan/actions.ts`
  `addProjectTaskAction` (:167) + `plan/tasks-panel.tsx`.
- **Schedule maths:** `lib/schedule-model.ts` — `dueVariance` (:69), `completionVariance` (:50),
  `dayDiff` (:35), `pctOf` (:108), `progressVariance` (:84). The "N days to Deliver / Running late"
  tag and every variance.
- **Portfolio list:** `app/(app)/projects/page.tsx` — portfolio tiles, stage filter, Milestones cell.

**Built but PARKED (owner decision to un-park — Part 3):**
- **Team / All-Works task board:** fully built (data layer + approval actions) but hidden behind
  `TEAM_VIEW_ENABLED = false` (`dashboard/workspace-shell.tsx:73`; gated at `dashboard/page.tsx:40`).
- **Project Insights:** STUBBED — `/projects/insights` is a nav leaf shown disabled with a "soon"
  chip (`lib/nav.ts:96-98`; `sidenav.tsx`). No route body yet.

**The ONE genuinely-new algorithm:** `lib/critical-path-model.ts` (NEW, pure, tested) — a
deterministic CPM forward/backward pass over milestones + `project_milestone_deps` giving each
activity an earliest/latest start + total float + the critical path (float = 0). NO LLM, nothing
stored. Three surfaces read that one result (PERT chart, Recommended Actions, projected-vs-baseline
completion). Plus **Timeline-Planner editing** — which the report frames as "buildGantt reuse, no
engine change" but is really a BUILD: `gantt.tsx` has **no** drag/resize/link-handle handlers today
(grep for `drag|resize|onMouseDown` → zero hits), so the interactive editing layer is net-new on top
of the existing read-only geometry. Plus small config columns (vendor, UOM progress, super-milestone).

**Confirmed absent (net-new files):** `lib/critical-path-model.ts`, `lib/project-insights-model.ts`,
`lib/plan-export.ts` — none exist yet.

**Next unit: U1** (`lib/critical-path-model.ts` + tests — the load-bearing engine). Always
`git log --oneline -8` first — this plan is idempotent.

**Baseline nothing may lower** (HANDOFF-V10 §2): confirm the live numbers with the six gates before
the first dispatch (procurement is moving the test count on this branch). Migrations applied 0001–0043
on disk; **the true next free number is `ls supabase/migrations/ | tail -1` + 1 at dispatch time**
(procurement reserves 0044–0047).

---

## PART 3 — Decisions (NOT settled — recommended defaults for the owner to confirm)

Heuristic the owner gave, applied to every recommendation below: *best for everyone · more features ·
dedicated not merged.* Each item says **which units it gates**. The orchestrator may proceed on the
recommended default unless the owner overrides; the two starred items are worth an explicit yes before
the expensive units.

- **D1 ★ Build the CPM / critical-path engine in-house (Q1).** **Recommend YES.** It is deterministic
  arithmetic on dates + a dependency graph (RULE 2 safe), it is the one load-bearing unit, and PERT
  (U2) + Recommended Actions (U3) + projected-completion both read it. No third-party scheduler, no
  LLM. **Gates: U1 (and therefore U2, U3).** Everything in Part B assumes yes — confirm once.
- **D2 ★ Un-park Team/All-Works board (Q7) AND light up Project Insights (Q6).** **Recommend un-park
  BOTH** — "more features; best for everyone." The Team board is fully built and PARKED only by a flag;
  Insights is a "soon" stub whose aggregate is a pure read. Keep them as *dedicated* surfaces (a Tasks
  board tab; a `/projects/insights` route), not merged into My-work. "Financials" on Insights obeys the
  existing Hide-money gate (`billing.cost.view`). **Gates: U7 board unhide, U10 Insights.** (Un-hiding
  the Team board is a flag flip + verification, not new plumbing; a NEW capability key for the board is
  unnecessary — it reuses the existing team surface.)
- **D3 In-app "notify on completion" bell (super-milestone / activity completion).** **Recommend YES,
  in-app only** — when a super-milestone auto-completes (all its children done) or a critical activity
  is completed, emit an in-app notification on the EXISTING notification surface. **No push, no email,
  no WhatsApp, and NO client portal** (client portal stays settled-NO — the `client_visible` flag only
  marks "what would be shared"). **Gates: U6 (super-milestone completion).** Fold the notification into
  U6 rather than a separate unit.
- **D4 Super-milestone modelling (Q2).** **Recommend: `is_super boolean` flag on `project_milestones`**
  grouping the activities before it, completion DERIVED via `rollupMilestones` (never stored — a stored
  % "is wrong the moment someone ticks a box"). Dedicated marker column, not a `scope_item` band
  overload. **Gates: U6.**
- **D5 UOM-progress storage + authoritative rollup figure (Q3).** **Recommend: new
  `uom`/`target_qty`/`measured_qty` columns on `project_milestones`** (dedicated, not routed through
  `measurement_variance`, which is a site-QA table with different semantics), and `measured_qty` is
  SUMmed from an append-only `activity_progress_entries` ledger (never a stored counter). The
  authoritative rollup stays **percent** (so `rollupMilestones`/`scheduleHealth` keep working
  unchanged); the measured-vs-target quantity is an additional real-unit display. **Gates: U5, and the
  U6 super-milestone auto-complete reads the same rollup.**
- **D6 Vendor-on-activity semantics (Q4).** **Recommend: informational for now** — `vendor_id` on the
  activity is a display/assignment field; it does NOT auto-create a material request, PO or labour
  entry (that cross-module wiring is a later, separate decision). **Gates: U6.**
- **D7 Attachment pipeline (Q5).** **Recommend: reuse project-document storage** for activity/task
  attachments (`project_files` / `project_file_versions.storage_path` already exists) rather than
  shipping the deferred site/design upload pipeline in this program. If that proves too heavy, the
  fallback is pasted-URL parity with site/design and a noted gap. **Gates: U7.** Do NOT half-build a
  new storage pipeline.
- **D8 Task feature columns now vs later (Q8).** **Recommend NOW** — reviewer / recurring / reminder /
  share columns are pure additive columns; ship them in U7 with the attachment + bulk-assign work.
  **Gates: U7.**
- **D9 Demo plan self-clearing (Q9).** **Recommend: a flagged `is_demo` starter plan that auto-clears**
  the moment the tenant adds/imports a real activity (mirrors the procurement Q7 convention), excluded
  from real rollups; author the "DEMO — sample, replace me" copy once. **Gates: U11.**
- **D10 Primary import path + Excel columns (Q10).** **Recommend: SmartPlan (AI order) is the primary
  path; the deterministic "upload Excel, make same activities" importer is the secondary** — a plain
  column parser (clone `items-csv.ts` shape) feeding the same `datePlan` arithmetic. Required Excel
  columns: Activity Name, Description, Status, Planned Date, (Actual Date), Assigned To — the exact
  round-trip of the U9 export (DZ-12). **Gates: U8.**

---

## PART 4 — Findings from inspection (fold in as noted)

- **F1 (report inaccuracy — the read-only Gantt).** Part B frames the Timeline Planner as "reuse
  `buildGantt` geometry; editing writes planned dates … no engine change." Reality: `gantt.tsx` has
  **zero** drag/resize/link-handle handlers (grep `drag|resize|onMouseDown|editable` → 0 hits). The
  geometry (`buildGantt`) is reusable, but the interactive editing layer is **net-new** — U4 is an L
  build, not a wiring job. Tighten U4's brief accordingly.
- **F2 (dependency-action address).** The report cites `toggleDependencyAction` at `plan-view.tsx:60`;
  that line is only the *import*. The action itself lives at `plan/actions.ts:140`, over
  `setMilestoneDependency` (`data/project-milestones.ts:411`). U4 wires link-handles to this existing
  action — do not add a second dep writer.
- **F3 (SmartPlan already writes deps).** `applySmartPlan` (`data/project-milestones.ts:470`) already
  inserts both milestones and `project_milestone_deps` edges (:522). U8's importer feeds the SAME path
  — do not fork a second insert.
- **F4 (demo project has a real plan).** The demo project **Malviya Nagar 3BHK**
  `c1d3b37a-9c0c-4263-bfd1-431b935d0597` has **12 `project_milestones`** already (verified in `db.mjs`).
  That is the fixture to verify CPM/PERT/Insights against — its dates + deps are real, not the video's
  "Ahujas Residency / 48 activity" numbers (which are Dzylo's demo, never reused per the standing rule).
- **F5 (migration slots are contended).** See the banner up top — `ls supabase/migrations/` at dispatch
  time, expect ≥ 0048 once procurement lands 0044–0047.

---

## PART 5 — Reuse index (project-management-specific — do not rebuild)

Everything here is checked and present. HANDOFF-V10 Part 4 has the app-wide index.

| Reuse | For |
|---|---|
| `lib/milestones-model.ts` | `rollupMilestones` (:94, actual vs derived-estimated %), `scheduleHealth` (:140), `groupByScope` (:176, the "Default Scope" band), `milestoneVariance` (:159), `MILESTONE_STATUSES`/`_TONE` (:20-45), `ProjectMilestone` incl. `client_visible` (:46-61) |
| `lib/gantt-model.ts` | `buildGantt` (:130) → bars + `dependsOn` + `BarTone` (:25) + month ticks; `GanttChart`/`GanttBar`/`GanttTick`; `GANTT_LEGEND` (:231). Timeline Planner (U4) + Insights timeline (U10) reuse the geometry — the editing is new |
| `lib/schedule-model.ts` | `dueVariance` (:69, "N days to Deliver / Running late by N"), `completionVariance` (:50), `dayDiff` (:35), `pctOf` (:108), `progressVariance` (:84) — baseline/projected variance in U3 |
| `lib/smartplan-model.ts` | `parseSmartPlan` (:84, strips numbers), `datePlan` (:142, the ONLY date source), `planEndDate` (:167), `MAX_STEPS/OFFSET/DURATION` (:41-44) — U8 |
| `lib/measurement-model.ts` | `MEASURE_MODES` (:22), `deriveQty` (:91), `resolveQty` (:129) — UOM target in U5 |
| `lib/site-model.ts` | `MeasurementVariance` (:40), `variancePct` (:57), `varianceTone` (:69) — U5 |
| `lib/data/project-milestones.ts` | `getProjectPlan` (:65), `createMilestone` (:98), `updateMilestone` (:134), `deleteMilestone` (:178), `applyMilestoneTemplates` (:297), `listMilestoneDeps` (:370), `setMilestoneDependency` (:411), `applySmartPlan` (:470); `milestone_templates` CRUD (:253-297) |
| `app/(app)/projects/[id]/plan/` | `plan-view.tsx` (tabs :81-83; server-resolves `?tab=` :109-113 — mirror for new tabs, NOT a useEffect), `gantt.tsx` (read-only geometry), `tasks-panel.tsx`, `smartplan-dialog.tsx`, `smartplan-actions.ts` |
| `app/(app)/projects/[id]/plan/actions.ts` | `updateMilestoneAction` (:61, "assign owner" links in U3), `toggleDependencyAction` (:140, U4 link handles), `addProjectTaskAction` (:167), `applyTemplatesAction` (:95) |
| `dashboard/actions.ts` + `dashboard/workspace-shell.tsx` | task/checklist actions; `TEAM_VIEW_ENABLED` (:73) — U7 board un-park |
| `app/(app)/projects/page.tsx` | portfolio tiles (value/count/delayed/handover-this-month) — U10 Insights aggregate builds on the same reads |
| `entity_comments` (orders/files/site already use it) · `ai_requests` (append-only AI log) · reports `Export CSV` path (`/reports/[report]`) | activity update thread (DZ-04) · SmartPlan logging · plan export (U9) |
| `components/ui/primitives.tsx`, `patterns.tsx`, `button.tsx` (asChild), `saved-views.tsx` | UI vocabulary |

**Capabilities that exist:** `projects.project.view/create/edit`, `projects.task.delete`,
`billing.cost.view` (the Hide-money / cost-column gate — Insights "Financials" respects it). Plan
mutations guard on `projects.project.edit`; task delete on `projects.task.delete`. There is no
`plan.*` capability — new plan actions guard on `projects.project.edit` (or `.view` for read-only
surfaces). **A NEW settings/insights surface that needs its own key must add it to `lib/can-model.ts`
— an unknown key fails closed for everyone.** Un-parking the Team board reuses the existing team
surface and needs no new key.

**HARD rules that bite here:** new tables follow HARD RULE 3 (migration + `lib/data/tables.ts` +
org- AND project-isolation asserts in `scripts/verify.mjs`); rich per-line data is an FK child table,
never jsonb (zero jsonb precedent in this repo); totals/% stay DERIVED, never stored (RULE 6 —
`verify.mjs` should assert no stored float/critical-path/projected-completion column exists); AI
structures order only, never a date/number (RULE 2); colour + a word, red reserved (RULE 4 — the PERT
critical path is red PLUS the word "critical", never colour alone).

---

## PART 6 — The units (dispatch one at a time; recommended order below)

**Recommended dispatch order:** **U1 (engine) → U2 → U3** (PERT + Recommended both read U1) → **U4**
(Timeline Planner editing) → **U5 → U6** (UOM ledger before super-milestone auto-complete reads it) →
**U7** (tasks) → **U8** (import) → **U9** (export) → **U10** (Insights) → **U11** (demo + explainers).
Each is sized S/M/L. New tables/columns follow HARD RULE 3; confirm the migration number live.

### U1 — `lib/critical-path-model.ts` — the CPM engine · L / research (the load-bearing unit)
**Decision D1 (recommend YES).** **Already built (don't touch):** the milestone shape, the deps CRUD
(`data/project-milestones.ts:370-447`), `buildGantt` (it reads the same deps map). **Build:** a pure,
`server-only`-free model — a forward + backward CPM pass over the activities (duration from
`planned_start`/`planned_end`) and the `project_milestone_deps` edges, yielding for every activity an
`earliestStart`/`latestStart`/`totalFloat`, and the critical path (the chain with `float = 0`). Handle
the real-graph hazards: missing dates (fall back to a default/derived duration, flag it), cycles
(detect + refuse, don't hang), disconnected activities, multiple roots (synthetic Start/Finish).
Return the inputs alongside the result (a projected date without its critical chain is untrustworthy).
**Out of scope:** any rendering, any persistence, any AI. **Verify (falsifiable):** exhaustive unit
tests — a hand-worked small graph whose floats you compute by hand and assert exactly; a diamond
dependency; a cycle (must be refused); the real demo plan's 12 milestones (`db.mjs`) fed through the
engine, critical path printed and checked against the dep chain by hand. No screen yet.

### U2 — PERT Chart tab · M
**Decision D1.** **Already built (don't touch):** U1's engine, the deps store, the plan tab shell
(`plan-view.tsx:81-83`, server-resolved `?tab=`). **Build:** a new **PERT** plan sub-tab rendering the
dependency graph — nodes (activities + synthetic Start/Finish) and edges (the deps VEYRA stores),
deterministic layout from topological order; the critical path drawn **red PLUS the word "critical"**
(RULE 4, never colour alone); zoom −/fit/+. Consumes U1's result on read; **nothing stored**.
**Out of scope:** editing the graph here (that's U4's Timeline Planner); any AI. **Verify:** the tab
renders for the demo project via node-fetch + Aditi's cookie; the critical nodes match U1's tests; a
project with no deps renders a clean Start→activities→Finish; `verify.mjs` still asserts no stored
critical-path column.

### U3 — Recommended Actions tab · M
**Decision D1.** **Already built (don't touch):** U1's engine, `updateMilestoneAction`
(`plan/actions.ts:61`), `schedule-model` variance. **Build:** a new **Recommended Action** plan sub-tab
with four count cards (Baseline completion = plan's planned handover; Projected completion = U1's CPM
finish; Critical activities; Immediate warnings) and three deterministic card lists, ZERO AI:
(a) critical-and-unassigned (`float = 0` AND `assignee_id` null); (b) zero-float (no slack); (c)
dependency-date conflict (an activity's `planned_start` < the `planned_end` of something it depends on
— a pure two-column compare over `project_milestone_deps`, no CPM needed). Each "assign an owner" link
calls the existing `updateMilestoneAction` (set `assignee_id`). **Out of scope:** auto-fixing dates;
notifications (that's D3/U6). **Verify:** the projected-vs-baseline gap on screen equals U1's finish
minus the plan handover (checked by hand against `db.mjs`); an unassigned critical activity appears in
list (a); introducing a conflicting date on the demo plan makes a card appear, removing it clears it.

### U4 — Timeline Planner tab (interactive Gantt) · L
**Decision: none — but see F1.** **Inspected: `gantt.tsx` is READ-ONLY** (no drag/resize/link
handlers). So this is a BUILD, not the "no engine change" the report implies. **Already built (don't
touch):** `buildGantt` geometry (`gantt-model.ts:130`), `toggleDependencyAction` (`plan/actions.ts:140`),
`updateMilestoneAction` for date writes. **Build:** a new **Timeline Planner** plan sub-tab — an
interactive Gantt on top of `buildGantt`'s positions: dragging/resizing a bar writes
`planned_start`/`planned_end` via `updateMilestoneAction`; a link-handle drag from one bar onto another
calls the existing `toggleDependencyAction` (insert/delete an edge). Keep the tone+word colour rule;
reuse the existing bar geometry, do NOT fork a second Gantt. **Out of scope:** a new dependency writer
(reuse F2's action); rebuilding `buildGantt`; touching the read-only `gantt.tsx` Gantt tab (leave it).
**Verify:** dragging a bar changes `planned_start`/`planned_end` in `db.mjs`; a link-handle creates one
`project_milestone_deps` row and re-drag removes it; the change re-flows the PERT tab (U2) with no
stored result; server-resolves the tab from `?tab=`, not a useEffect.

### U5 — Activity UOM progress + append-only ledger · M
**Decision D5 (columns on `project_milestones`; percent stays authoritative).** **Already built (don't
touch):** `MEASURE_MODES`, `MeasurementVariance` maths, `rollupMilestones`. **Build:** migration (live
number) adding `uom text null`, `target_qty numeric null`, `measured_qty numeric null` to
`project_milestones` (register nothing new — same table); a NEW append-only `activity_progress_entries`
table (`org_id`, `milestone_id` → `project_milestones`, `delta_qty`, `note`, `member_id`, `at`; add to
`tables.ts`; org+project isolation asserts in `verify.mjs`) — `measured_qty` is SUMmed from this, never
a stored counter. An "Update Progress" dialog on the activity that appends a `+N sq ft` delta. Reuse
`site-model` variance for the target-vs-measured display. **Out of scope:** changing what
`rollupMilestones` treats as authoritative (stays percent); any AI-authored quantity — the tenant types
every number. **Verify:** two deltas (+90 then +100) sum to 190 in `db.mjs`; `verify.mjs` asserts no
stored `measured_qty` counter drift (the SUM reconciles); the activity shows target/measured/UOM.

### U6 — Vendor-on-activity + super-milestone (+ in-app completion notify) · S/M
**Decisions D4, D6, D3.** **Already built (don't touch):** `rollupMilestones` (derives completion),
`vendors` table + picker source, the existing in-app notification surface. **Build:** migration (live
number) adding `vendor_id uuid null references vendors(id)` and `is_super boolean not null default
false` to `project_milestones`; a vendor selector on the activity (informational — D6, no downstream
MR/PO); a super-milestone marker that groups the activities before it and **auto-completes when its
children complete — DERIVED via `rollupMilestones`, never stored** (D4); and, on that auto-complete
(and on a critical-activity completion), an **in-app notification** on the existing surface (D3 — in-app
ONLY, no push/email/WhatsApp, no client portal). **Out of scope:** a client portal (settled-NO — the
`client_visible` flag only marks intent); vendor→procurement wiring (D6). **Verify:** completing both
children of a super-milestone flips it complete in the rollup (no stored % written — confirm in
`db.mjs` the column doesn't exist); the completion emits exactly one in-app notification; `vendor_id`
persists.

### U7 — Tasks: reviewer/recurring/reminder/share + attachments + bulk assign · M
**Decisions D8 (now), D7 (reuse doc storage).** **Already built (don't touch):** `tasks`/`task_checklist`,
`dashboard/actions.ts` task actions, `addProjectTaskAction`, `project_files` storage. **Build:**
migration (live number) adding `reviewer_id uuid null`, `recurrence text null`, `remind_at timestamptz
null`, `share_token text null` to `tasks`; the matching form fields; a real attachment on a task/activity
**reusing project-document storage** (`project_file_versions.storage_path`) — NOT a new upload pipeline
(D7); a bulk-assign multi-select over the existing update action (UI only). **Out of scope:** building
the deferred site/design upload pipeline; a share PORTAL (the token marks shareability only). **Verify:**
a task saves reviewer/recurrence/remind_at/share_token in `db.mjs`; an attachment lands in the document
storage and is reachable from the task; bulk-assigning four tasks to one member updates four rows.

### U8 — SmartPlan polish + deterministic Excel importer · M
**Decision D10 (SmartPlan primary; Excel importer secondary).** **Already built (don't touch):**
`smartplan-model` (strips numbers, `datePlan` only date source), `smartplan-dialog.tsx`,
`smartplan-actions.ts`, `applySmartPlan` (already inserts milestones + deps — F3). **Build:** an xlsx/csv
column parser (clone the `items-csv.ts` shape — pure parser + per-row errors, NOT a generic extension)
for the "upload Excel, make same activities" path, feeding the SAME `datePlan` → `applySmartPlan` write;
required columns per D10/DZ-12. Polish the dialog to offer both paths. **Out of scope:** any AI-authored
date/number (the importer is deterministic columns; SmartPlan proposes order only); a second insert path
(reuse `applySmartPlan`). **Verify:** importing a known 5-row sheet drafts 5 milestones with dates =
`datePlan(start)` arithmetic (checked in `db.mjs`); a bad row reports a per-row error, nothing silently
dropped; the AI path still logs to `ai_requests`.

### U9 — `lib/plan-export.ts` — plan → Excel/CSV · S
**No decision.** **Already built (don't touch):** the reports `Export CSV` path (`/reports/[report]`).
**Build:** a pure `lib/plan-export.ts` mapping `project_milestones` → the six columns (Activity Name,
Description, Status, Planned Date, Actual Date, Assigned To — the DZ-12 round-trip that U8 imports);
wire it to the existing CSV-export mechanism. **Out of scope:** any new schema (it's a read of what's
stored); a bespoke xlsx writer if the CSV path suffices. **Verify:** the export of the demo plan has one
row per milestone with the right columns; round-trips through U8's importer without loss.

### U10 — `lib/project-insights-model.ts` + un-park `/projects/insights` · L
**Decision D2 (light it up; Financials respects the cost gate).** **Already built (don't touch):** the
`/projects` portfolio tiles, `schedule-model` (on-track vs late), `buildGantt` (portfolio timeline
geometry), the `soon:true` nav leaf (`nav.ts:96-98`). **Build:** a NEW pure `lib/project-insights-model.ts`
aggregating `projects` + `project_milestones` — active / on-track / running-late (handover vs today via
`schedule-model`), by-stage counts (donut), a portfolio timeline reusing `buildGantt`; a `/projects/insights`
route rendering it; flip the nav leaf off "soon". "Financials" tab obeys the existing Hide-money gate
(`billing.cost.view`). **Out of scope:** Dzylo's navy/purple stage colours (keep grey/amber/green + word);
any stored aggregate. **Verify:** the counts on screen reconcile to `db.mjs` (active/on-track/late summed
by hand); the by-stage donut foots to the project count; Financials hidden without `billing.cost.view`;
the nav leaf is now reachable.

### U11 — Shared demo-plan self-clearing + inline explainer boxes · S
**Decision D9 (auto-clear).** **Already built (don't touch):** `milestone_templates` seed,
`applyMilestoneTemplates`. **Build:** an `is_demo` starter plan (values from the video's own activity
list — Project Kickoff → Snag List) inside a "DEMO — sample, replace me" banner that clears the moment
the tenant adds/imports a real activity, demo rows excluded from real rollups; and an inline
explainer-box component fed by a pure VOCAB map (like `measurement-model`'s visible formula — keyed by
control, testable, NEVER in JSX) covering: critical path, schedule float, dependency, super-milestone,
Timeline Planner, UOM/target quantity, client visible, recommended action, SmartPlan (copy in Part B§4b
of the report). Adopt across the plan surfaces. **Out of scope:** a client portal; copy inline in
components. **Verify:** the demo banner disappears after a real activity exists; explainers render from
the map and are covered by a test.

---

## PART 7 — Environment & verification (read before dispatching)

- **The browser pane does NOT work in this environment** (the app window is hidden/minimised → it
  can't paint, collapses to 0×0, screenshots time out). Verify app rendering with **node fetch +
  the session cookie** (HANDOFF-V10 §5.3), which is reliable:
  ```
  node -e "fetch('http://localhost:3010/<path>',{headers:{cookie:'veyra_acting_member=ae9569dc-c875-4d80-9129-ca83d169b396'}}).then(r=>{console.error('STATUS',r.status);return r.text()}).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').replace(/(\s*\|\s*)+/g,' | ').slice(0,3000)))"
  ```
  A page requires the cookie or it 307s to `/login`. `Loading…` is the skeleton's sr-only label,
  not a stall. Server logs: `preview_logs`. The plan lives at
  `/projects/c1d3b37a-9c0c-4263-bfd1-431b935d0597/plan?tab=<milestone|gantt|tasks|pert|recommended|timeline>`.
  If the owner brings the app window forward, the screenshot pane may start working — but the fetch
  method is enough.
- **Never trust the pane for writes** — verify every write in `db.mjs` and the server log. For the
  derived surfaces (CPM float, PERT critical path, Insights counts) verify the NUMBERS reconcile by
  hand against `db.mjs`, not just that a page rendered.
- **DB:** `node scripts/db.mjs sql "<query>"` (never the Supabase MCP — rule 11). Migrations:
  `node scripts/db.mjs migrate` is **owner-run**, show the migration first. Local reads/writes hit
  the SAME Supabase project as production, so a migration is live the moment it is applied.
  **Confirm the next free migration number with `ls supabase/migrations/ | tail -1` at dispatch time**
  — procurement reserves 0044–0047 on this branch; never hardcode a number from this file.
- **Demo tenant** `d46a53af-58b1-4ed7-87be-c675e5803802` (`Veyra Demo Interiors`), project
  **Malviya Nagar 3BHK** `c1d3b37a-9c0c-4263-bfd1-431b935d0597` (has 12 real `project_milestones` —
  the CPM/PERT/Insights fixture). Owner **Aditi Pradhan** `ae9569dc-c875-4d80-9129-ca83d169b396` (use
  her cookie for full-permission verification). **Always filter `org_members` by `org_id`** — demo
  names repeat across tenants. Never reuse the video's "Ahujas Residency / 48 activity" numbers — those
  are Dzylo's demo, quoted only as evidence.
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
  remote storage — re-run before believing a failure. Confirm the live baseline before U1 (procurement
  is moving the count on this branch).
- **Restore point** exists (tag `snapshot/pre-chatgpt-2026-09-10`, commit `3804e23`) — re-run its
  RESTORE manual before a session that will touch data if the owner wants a clean rollback.

---

## PART 8 — NOT building (said out loud)

- **A client portal / client app** — the video's "Client visible → show in the client portal". Client
  portal is on VEYRA's settled-NO list. Keep the `client_visible` flag as "what would be shared"; build
  no portal. The D3 completion bell is **in-app only**.
- **Any AI-authored date, duration, quantity or number** — SmartPlan proposes activity ORDER only; the
  CPM engine, `datePlan`, and every progress delta are deterministic engine + tenant input (RULE 2).
- **Dzylo's colour language** — navy/purple stage chips and the all-red PERT/Gantt. VEYRA keeps
  grey/amber/green + a word, red reserved; the critical path is red PLUS the word "critical".
- **MB Sheets, 2D→3D renders, generated images** — already parked "soon" in VEYRA; not in scope here.
- **Zoho / Dialer / Voice / WhatsApp / push / email notifications** — out of scope; ship in-app only.
- **A second plan grid, Gantt, milestone model, template system, or dependency writer** — all exist;
  extend, don't fork. The CPM engine is the ONE new algorithm.
- **A new upload pipeline** (unless D7 forces it) — reuse project-document storage for attachments.

---

*Next step after the last unit: split the report into the two repo files the method calls for —
`FRAME-REGISTER-PROJECTS.md` (Part A evidence, DZ-00..12) and `PLAN-PROJECTS.md` (Part B instruction) —
from `dzylo-research/02-Project-Management.pdf`, and persist the frames so a new chat can open them by
id.*
