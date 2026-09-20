# HANDOFF — Dzylo AI Project Planning (orchestrator + sub-agent program)

**Read `HANDOFF-V10.md` first for the standing rules** (Part 3 rules, Part 4 reuse index,
Part 5 gates/verify/deploy). This file is the *program plan* for extending VEYRA's SmartPlan +
Project Planning surface against the Dzylo "Create Interior Project Plans in Minutes with AI"
video. It is written for an ORCHESTRATOR that dispatches `veyra-unit` sub-agents one unit at a time.

Working dir: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM` · Branch:
`quotations-v2-plus-fleet` · Evidence: `dzylo-research/06-AI-Project-Planning.pdf` (PP-00..11) and
`dzylo-research/VEYRA-SITE-INVENTORY.md` + `VEYRA-BUILD-MAP.md`.

> **TWO sibling programs are running on the same branch, both on the SAME plan/milestones surface.**
> `HANDOFF-DZYLO-PROJECT.md` (Interior Project Management) touches the exact same files this program
> does — `project_milestones`, `plan-view.tsx`, `gantt.tsx`, `milestones-model.ts`, `smartplan-*`,
> `project_milestone_deps`, `rollupMilestones`, and the plan sub-tabs — and `HANDOFF-DZYLO-PROC.md`
> (procurement) reserves migration slots on this branch. **This is the parallel-writer hazard this
> project fears most: two implementations of one engine.** Part 2 has the "which units belong here
> vs there" split; the orchestrator MUST `git log` the other programs' commits before dispatching any
> unit that touches a shared file, and never fork a second Gantt / milestone model / dependency writer
> / notification surface. Do NOT trust the report's printed migration "0044" (Part B§2) — it is STALE.
> Latest on disk today is `0043_saved_views.sql`; the literal next slot is 0044, but procurement and
> project-management will consume 0044+ before or between these units. **Every unit that adds a
> migration MUST run `ls supabase/migrations/ | tail -1` at dispatch time and take the true next free
> number** — never hardcode one from this file.

---

## PART 0 — Paste this to start a fresh orchestrator session

```
Read HANDOFF-DZYLO-PLANNING.md in full, then HANDOFF-V10.md Parts 3-5. You are the
ORCHESTRATOR for the Dzylo AI Project Planning program — a HANDS-ON reviewing engineer,
NOT a ticket-passer. You do not write feature code, but you own the quality of every
unit as if you wrote it. A sub-agent that says "done, gates green" is an INPUT to your
review, never the end of it.

For EACH unit you run this loop (Part 1 has the full mandate):
1. INSPECT FIRST yourself. `git log --oneline -12` + read the real files the unit
   touches, with file:line receipts. Confirm what is actually built vs missing — do NOT
   trust the brief's "already built"/"gap" claims (they were wrong here: the report says
   tasks are "per milestone" and U2 is "no schema change if tasks link to the milestone",
   but `tasks` has NO `milestone_id` column — 0023_workspace.sql:64-65 — so U2 is a real
   BUILD with a migration, not a rollup tweak). Also `git log` the SIBLING programs
   (HANDOFF-DZYLO-PROJECT.md, HANDOFF-DZYLO-PROC.md) — they write the SAME plan files;
   check whether a shared engine/table/surface already landed before you touch it. Tighten
   the brief to the REAL gap before dispatching. Never dispatch a loose brief.
2. DISPATCH ONE veyra-unit sub-agent (never in parallel) with the tightened brief.
3. REVIEW HARD when it reports back: read the FULL diff line by line, RE-RUN all six
   gates yourself, verify every WRITE in db.mjs and every screen via node-fetch + Aditi's
   cookie (the browser pane can't paint — Part 7). Never take "green" on faith. If anything
   is off — a forked Gantt, a second dep writer, a stored %, an unguarded action — send it
   back or fix the dispatch. Do not commit slop.
4. COMMIT locally yourself (agents never commit) with a why-shaped message. Never push or
   deploy (rule 10). Then update this file's Part 2 and go to the next unit.

Ask me before a unit only if its brief has a genuine open choice (Part 3 lists them, each
with a recommended default — Q4 notifications gates U9 and collides with the Project
Management program's bell; Q2 working-days config gates U1; Q6 the tasks→milestone link
gates U2). Otherwise decide per the Part 3 heuristic and proceed.

Start by INSPECTING the current state (git log of all three programs + read
smartplan-model.ts, milestones-model.ts, plan/actions.ts, and the tasks table) and tell me
what you actually found before dispatching anything.
```

---

## PART 1 — The method (orchestrator ↔ veyra-unit)

This mirrors HANDOFF-V10 §1.4–1.6, specialised for this program.

> **ORCHESTRATOR MANDATE — read this before you dispatch anything.**
> You are a senior engineer who happens to delegate the typing, not a router that forwards
> tickets. You are accountable for every line that lands as if you wrote it. Concretely, on every
> unit you personally: (1) **inspect the real code first** and rewrite the brief to the actual gap —
> the report in this very file claims U2's task-weighted progress is "no schema change if tasks
> already link to the milestone," but inspection shows `tasks` links only to `project_id`/`lead_id`
> (no `milestone_id`), so U2 needs an enabling migration; assume the other briefs can be wrong the
> same way, and assume a sibling program may already have built a shared piece; (2) **read the
> sub-agent's entire diff** and reject hand-waving, dead code, rebuilt engines (there must be exactly
> ONE SmartPlan model, ONE `datePlan`, ONE Gantt, ONE milestone rollup, ONE dependency writer, ONE
> notification surface across all three programs), or unguarded actions; (3) **re-run all six gates
> yourself** and **re-verify writes in `db.mjs` and screens via node-fetch** — a sub-agent's "gates
> green, verified" is a claim to check, not a fact to trust (this project's history: "a green test
> that examined nothing is the worst outcome"); for the derived surfaces (task-weighted %, working-day
> dates) verify the NUMBERS reconcile by hand, not just that a page renders; (4) **only then commit.**
> If you find yourself pasting a brief and waiting, you are doing it wrong.

- **The orchestrator does not write feature code.** But it inspects, reviews, gates, and commits —
  hands on the code the whole time.
- **`veyra-unit` sub-agents build.** Each gets ONE self-contained brief (Part 6), writes the
  model + data layer + action + screen + tests, runs the six gates, verifies against the running
  app, reports, and **stops without committing**. The agent starts cold — the brief must be complete.
- **One at a time, by address, never in parallel.** Parallel writers on one codebase is how you get
  two implementations of the same arithmetic — this project's most common defect, and here the
  `datePlan` date math, the `rollupMilestones` %, the Gantt geometry, and the `project_milestone_deps`
  writer are all single-source engines that a parallel writer (in this program OR a sibling program)
  would fork. `Explore` is the only parallel-safe agent (read-only fan-out).
- **The orchestrator commits.** After the agent reports and you re-confirm the six gates, commit
  with a message that says WHY the shape is what it is (the commit log is the design record).
- **THE CRITICAL RULE (bake it into every dispatch — RULE 2):** an LLM may return **STRUCTURE ONLY**
  — milestone/task names, their order, and integer day-offsets/durations — **NEVER a price, cost,
  quantity, amount, or a date/duration-as-fact.** A deterministic engine (`datePlan`) plus a
  person-picked start date supplies every date; a deterministic rollup supplies every percentage;
  tenant config supplies any working-day/holiday rule. `parseSmartPlan` already strips every
  price/qty/rate-shaped key (`FORBIDDEN_KEY`, `smartplan-model.ts:63,102`). **Every AI call logs to
  `ai_requests` and must fail gracefully when the key is unset** (`isAiConfigured()`,
  `provider.ts:69`; `AI_GEMINI_API_KEY` is unset in prod). No gap in this program may introduce a
  model-produced number — each is arithmetic or a graph write, and that is the whole reason this
  surface already passes RULE 2 and must keep passing it.
- **Every sub-agent's non-negotiable protocol** (the briefs are deliberately not exhaustive — this
  protocol is what makes a terse brief safe):
  1. **INSPECT FIRST, with receipts.** A brief's "already built" / "gap" claims are the orchestrator's
     best knowledge, NOT ground truth. Before writing anything, grep/read the named files and confirm
     the ACTUAL current state (cite `file:line`). If reality contradicts the brief — something is
     already done, or a "reuse" turns out to be a "build" (the tasks→milestone link that does not
     exist), or a sibling program already landed the piece — say so in the report and adjust scope to
     the real gap rather than blindly building or blindly skipping.
  2. **Build only the gap.** Reuse the Part 5 index; never re-implement an engine/table that exists
     (`parseSmartPlan`, `datePlan`, `rollupMilestones`, `buildGantt`, the deps CRUD, the templates
     apply-path, `isAiConfigured`).
  3. **VERIFY FALSIFIABLY, both halves.** Run all six gates (Part 5.1) and hold the baseline. Verify
     app rendering with node-fetch + Aditi's cookie (Part 7 — the browser pane can't paint here).
     Verify every WRITE in `db.mjs`, never in the pane. Hit each of the brief's VERIFY bullets with
     actual output — a green gate that examined nothing is the worst outcome (HANDOFF-V10 §Tests). For
     any derived surface (working-day dates, task-weighted %) verify the NUMBERS by hand against
     `db.mjs`.
  The orchestrator RE-RUNS the six gates and reviews the diff before committing — it does not take the
  agent's word for green.
- **Dispatch prompt template** for each unit:
  ```
  You are implementing ONE unit on VEYRA. Working dir + branch as in HANDOFF-DZYLO-PLANNING.md.
  Dev server is running at http://localhost:3010. READ FIRST: HANDOFF-V10.md (rules Part 3,
  reuse Part 4, gates Part 5) and HANDOFF-DZYLO-PLANNING.md Part 1 (your protocol + THE CRITICAL
  RULE: AI returns structure only, never a number; every AI call logs to ai_requests and fails
  gracefully when the key is unset), Part 5 (reuse), Part 7 (env/verify).
  FOLLOW THE PART 1 PROTOCOL: inspect the real code state first (with file:line receipts) before
  building — the brief's "already built"/"gap" claims are a starting point, not ground truth; if
  reality differs, report it and build the real gap. Two sibling programs (HANDOFF-DZYLO-PROJECT.md,
  HANDOFF-DZYLO-PROC.md) write the SAME plan files — check their recent commits and do NOT fork a
  shared engine/table/surface. Then verify falsifiably (six gates + node-fetch render + db.mjs on
  every write + each VERIFY bullet with real output).
  MIGRATIONS: run `ls supabase/migrations/ | tail -1` and take the true next number — do NOT trust a
  number printed in the handoff (two programs are reserving slots on this same branch).
  [PASTE THE UNIT BRIEF FROM PART 6]
  REPORT BACK, DO NOT COMMIT: (a) files changed, (b) six-gate numbers, (c) what you inspected and
  what you verified in the app + db.mjs with actual output, (d) deviations / where reality differed
  from the brief. No git commit, no push, no db.mjs migrate.
  ```

---

## PART 2 — State (as of 2026-09-13)

**ALREADY BUILT — this is an EXTEND program, not a from-zero build, and NOT a parked feature to
un-park.** Everything the video demonstrates — an AI that drafts a milestone plan from an uploaded
floor-plan, an editable review-before-write table, a milestone list with progress/status/planned-vs-
actual timeline/assignee/client-visible, a Gantt chart, dependencies, per-milestone tasks, scope
groups, "start from template", and the projects-list Milestones health cell — VEYRA already ships as
**SmartPlan + Project Planning**. And the AI surface **already obeys THE CRITICAL RULE**:
`parseSmartPlan` returns STRUCTURE ONLY and strips every price/qty/rate key (`FORBIDDEN_KEY`,
`smartplan-model.ts:63,102`); dates are computed deterministically by `datePlan`
(`smartplan-model.ts:142`) from a person-picked start; every call logs to `ai_requests`
(`smartplan-actions.ts:25`); `isAiConfigured()` gates the surface with graceful failure
(`provider.ts:69,88`; `AI_GEMINI_API_KEY` unset in prod). See `dzylo-research/06-AI-Project-Planning.pdf`
Part B§1 for the full receipts.

**Already built — do NOT rebuild (checked, with receipts):**
- **SmartPlan (the "AI Project Planner"):** `lib/smartplan-model.ts` — `SmartPlanStep{offsetDays,
  durationDays,dependsOn}` (:24-31), `parseSmartPlan` (:84, strips `FORBIDDEN_KEY` price/qty at :102),
  `datePlan` (:142, the ONLY date source — arithmetic on a picked start), `planEndDate` (:167),
  `MAX_STEPS=40` (:41). Dialog `plan/smartplan-dialog.tsx` (upload `accept=image/png,jpeg,webp,pdf`
  :157; brief; editable draft; `existing`-names passthrough :128; `LateWarning` "runs past handover"
  :194,290). Actions `plan/smartplan-actions.ts` (propose vs apply, `ai_requests` logging, no metering
  by design :25-28). `lib/ai/smartplan.ts`.
- **AI provider + gate:** `lib/ai/provider.ts` — `isAiConfigured()` (:69), `AI_GEMINI_API_KEY` (:65),
  Gemini/Anthropic seam, image+PDF attachments, graceful "AI is not configured" (:88). Degrades
  cleanly when the key is unset (prod).
- **Milestone list + rollups:** `lib/milestones-model.ts` — `ProjectMilestone` incl. `progress_pct`
  (:52) + `client_visible` (:58), `rollupMilestones` (:94, total/by-status/actual/estimated/
  lastCompleted/upcoming — note :112 counts `completed`→100 else the milestone's OWN `progress_pct`,
  never a task rollup), `scheduleHealth` (:140), `groupByScope` (:176), `milestoneVariance` (:159),
  `MILESTONE_STATUS_TONE` grey/amber/green + label (:35). `project_milestones` table. `plan-view.tsx`,
  `plan/actions.ts` (add/update/delete milestone).
- **Planned vs actual:** `lib/schedule-model.ts` — `dueVariance`/`completionVariance` ("Running late
  by N days" / "N days left"), stated once, everywhere. Timezone-safe day arithmetic.
- **Gantt:** `lib/gantt-model.ts` — `buildGantt` (:130, work-derived window, `BarTone` :25 +
  `stateLabel` :35, month ticks, today-line :59, `dependsOn` links :40) + `gantt.tsx`. Already beats
  the competitor's "everything one colour" by pairing colour with a word and reserving red for genuine
  lateness (:105-115). **`gantt.tsx` is read-only** (no drag/resize) — relevant to the Project
  Management program's U4, not to this one.
- **Dependencies:** `project_milestone_deps` (milestone→depends_on) via `setMilestoneDependency`
  (`data/project-milestones.ts:411`, insert/delete :435-447) / `toggleDependencyAction`
  (`plan/actions.ts:140`); consumed by the Gantt links. `applySmartPlan` already inserts both
  milestones and dep edges (`data/project-milestones.ts:470,522`).
- **Tasks:** the EXISTING `tasks` table filtered by **project** (`plan/actions.ts:167`
  `addProjectTaskAction` → `createTask` stamps `project_id` only) + `tasks-panel.tsx` + `task_checklist`.
  **⚠ Tasks are project-scoped, NOT milestone-scoped today** — see Part 4 F1.
- **Scope groups + templates:** `scope_items` bands (`addScopeAction`, `plan/actions.ts:121`);
  `milestone_templates` + `DEFAULT_MILESTONE_TEMPLATES` (`data/project-milestones.ts:206`) +
  `listMilestoneTemplates` (:278) + `applyMilestoneTemplates` (:297) ("Start from template",
  `applyTemplatesAction` `plan/actions.ts:95`). Same plain-calendar-day arithmetic as `datePlan`
  (:335-337) — no working-day skip.
- **Client visibility / report:** `project_milestones.client_visible` + `/projects/[id]/report`
  Progress Report is the agreed alternative to a client portal (Part 8: portal out of scope).
- **Tenant guard / tables:** `lib/data/with-org.ts` (the only guard). `lib/data/tables.ts` registers
  `project_milestones` / `project_milestone_deps` / `milestone_templates` / `scope_items` / `tasks` /
  `ai_requests` / `holidays` (:124). Any new table registers here + `verify.mjs` isolation asserts.

**The genuinely-new work is a short, additive list** (report §2 / Part 6 below): working-days
date-skip (the `holidays` table exists but is UNUSED by planning — Part 4 F3), task-weighted milestone
progress (needs the tasks→milestone link — F1), SmartPlan "modify" mode, bulk milestone update,
milestone-template editor UI, Gantt PDF export, SmartPlan prompt-example samples, and — only if the
owner says yes and only if a sibling program has not already landed it — an in-app "notify on
completion" bell.

### Which units belong to THIS program vs the Project Management program

The two programs overlap heavily because both extend the same plan/milestones surface. To keep exactly
one implementation of each shared piece, the split is:

| Concern | THIS program (AI Planning) | Project Management program (`HANDOFF-DZYLO-PROJECT.md`) |
|---|---|---|
| SmartPlan generate / `datePlan` / `parseSmartPlan` | **owns** the AI *authoring* extensions: working-days skip (U1), modify mode (U3), prompt samples (U7) | consumes SmartPlan; adds a deterministic **Excel importer** (its U8) that feeds the SAME `applySmartPlan` — do not fork |
| `rollupMilestones` % | **owns** task-weighted progress (U2) | its U6 super-milestone auto-complete READS the same rollup — coordinate so the rollup change lands once |
| `project_milestone_deps` writer | **owns** auto-chain n→n-1 (U6) | its U4 Timeline-Planner link-handles write the same edges via the same `setMilestoneDependency` — both must reuse, neither forks |
| Milestone **templates editor** | **owns** it (U5) — unique to this program | not touched there |
| Gantt | **owns** an Export-PDF of the read-only Gantt (U8) | owns the interactive **Timeline Planner** editing layer (its U4) + a CSV/xlsx **plan export** (its U9) — different artifacts, keep them distinct |
| Bulk edit | **owns** bulk *milestone* update (U4) | owns bulk *task* assign (its U7) — different targets |
| Notifications ("notify on completion" bell) | proposes it (U9, if Q4=yes) | **also proposes it** (its D3/U6) — **CONFLICT**, see F2. Whichever lands first owns the `notifications` table + bell; the other reuses |
| Demo self-clearing plan + explainer boxes | proposes it (U10) | **also proposes it** (its U11) — **DUPLICATE**, see F2. Only one builds the convention; the other reuses |
| CPM / critical-path / PERT / Recommended Actions / Insights | not in scope here | **owns** them (its U1-U3, U10) |

**The orchestrator MUST `git log` the Project Management program's commits before dispatching U2, U6,
U9, or U10** (the shared-surface units), and skip/re-scope any piece a sibling already landed.

**Next unit: U1.** (Always `git log --oneline -12` first — this plan is idempotent. Also git-log the
sibling programs.)

**Baseline nothing may lower** (HANDOFF-V10 §2): confirm the live numbers with the six gates before
the first dispatch — two sibling programs are moving the test count on this branch. Migrations applied
0001–0043 on disk (latest `0043_saved_views.sql`); **the true next free number is
`ls supabase/migrations/ | tail -1` + 1 at dispatch time** — procurement and project-management reserve
0044+; never hardcode.

---

## PART 3 — Decisions (NOT settled — recommended defaults for the owner to confirm)

Heuristic the owner gave, applied to every recommendation below: *best for everyone · more features ·
dedicated not merged.* Each item says **which units it gates**. The orchestrator may proceed on the
recommended default unless the owner overrides; the starred items are worth an explicit yes before the
units they gate.

- **Q1 — Confirm the framing: EXTEND, not build.** **Recommend YES.** Everything in Part 2 already
  ships and already obeys THE CRITICAL RULE; the work is only the Part 6 gaps. This is not a feature to
  un-park and not a build from scratch. **Gates: the whole program's scope.**
- **Q2 ★ Working-days rule (drives U1).** *Is the weekly off always Sunday or per-tenant configurable?
  Do `holidays` rows count as non-working days against a milestone's duration?* **Recommend:
  per-tenant CONFIGURABLE, default Sunday** (best for everyone; a Hyderabad firm and a Gurugram firm
  keep different weeks — same reasoning that made `holidays` tenant-owned, 0034 comment), **and YES,
  holidays count — skip them** when spacing the plan out. The `holidays` table already exists
  (`0034_hr_wfh_holidays.sql:118`, registered `tables.ts:124`) and is currently unused by planning.
  Storing the weekly-off default is a small config edit (a `workspace_options` row or one column),
  not a new table. **Gates: U1.**
- **Q3 — SmartPlan gating (credits meter).** Dzylo shows an "AI Credits" meter; VEYRA deliberately does
  NOT meter SmartPlan ("not a BOQ, must not spend a tenant's BOQ allowance", `smartplan-actions.ts:26-28`).
  **Recommend: keep it free/unmetered** — do not add a credits gate. **Gates: nothing to build; a
  standing NOT-building item (Part 8).**
- **Q4 ★ In-app "notify on completion" bell (drives U9) — AND it collides with the Project Management
  program.** *Build the dependency bell, or leave it out?* **Recommend YES, in-app ONLY** (more
  features; best for everyone) — when a milestone with dependents is completed, emit an in-app
  notification on a `notifications` surface + a bell. **Telephony / WhatsApp / SMS / e-mail are all
  settled-NO** (Part 8; HANDOFF-V10 Part 8). **CRITICAL:** VEYRA has **no notification surface today**
  (Part 4 F2), and the sibling Project Management program's D3/U6 *also* wants to emit on "the existing
  notification surface" — there is none, so **both programs would be creating the `notifications` table
  for the first time.** Decide ONE owner of that table + bell; the other program reuses it. **Gates:
  U9, and cross-program coordination with Project Management U6.**
- **Q5 — Modify mode (drives U3).** *Should "modify this plan" replace the band's milestones or only
  propose additions to merge? Should Assign-To at import be multi-select across rows?* **Recommend:
  never silently replace** — the AI proposes a revised structure-only sequence that lands in the SAME
  editable review table (the table IS the diff; nothing is written until the user presses Add), and
  **Assign-To at import is multi-select** across the drafted rows. Reuses the existing `existing`-names
  passthrough (`smartplan-dialog.tsx:128`, `smartplan-actions.ts:95`). **Gates: U3.**
- **Q6 ★ Task-weighted progress — the tasks→milestone link (drives U2).** *Do project tasks already
  carry a milestone link, or only a project link?* **INSPECTION ANSWER: only a project link.** The
  `tasks` table has `project_id` + `lead_id` and **no `milestone_id`** (`0023_workspace.sql:64-65`; no
  later migration adds one); `addProjectTaskAction`/`createTask` stamp `project_id` only; `tasks-panel.tsx:39,45`
  treats the panel as a project task list deliberately distinct from milestones. **Recommend: add
  `milestone_id uuid null references project_milestones(id) on delete set null` on `tasks`** (the
  enabling migration) + an attach-to-milestone control, THEN derive the milestone % from its tasks
  (done/total or weighted) in `rollupMilestones`/the milestone read — still derived, never stored. This
  makes **U2 an M with a migration + UI**, not the "no schema change" the report hoped for. **Gates: U2.**
- **Q7 — Demo data (drives U10; mirrors procurement Q7).** *Auto-clear on first real
  milestone/SmartPlan/template, or manual dismiss? Per-tenant seeded rows or a shared read-only sample?*
  **Recommend: AUTO-CLEAR** on the first real milestone/SmartPlan/template, from a **shared read-only
  sample** the tenant does not own, demo rows excluded from real rollups. **Coordinate with the Project
  Management program's U11**, which builds the same self-clearing convention on the same surface — build
  it once. **Gates: U10.**
- **Q8 — Template editor scope (drives U5).** *Do templates need per-milestone tasks (a
  `milestone_template_tasks` child), or is name + offset + duration + task-count enough?* **Recommend:
  ship the editor first with name + offset + duration + task-count** (create/rename/reorder a named
  group over the existing `milestone_templates` + apply-path); add an OPTIONAL `milestone_template_tasks`
  child table only if the owner wants templates to seed tasks. Both are additive. **Gates: U5.**

---

## PART 4 — Findings from inspection (fold in as noted — where reality differed from the report)

- **F1 (report inaccuracy — tasks are NOT "per milestone").** PP-03/PP-04 and report §1's "Tasks per
  milestone" row read as though a task belongs to a milestone and the parent's % rolls up from its
  tasks. **Reality:** the `tasks` table carries `project_id` + `lead_id` only — **no `milestone_id`**
  (`0023_workspace.sql:51-70`); `addProjectTaskAction` → `createTask` stamps `project_id` only
  (`plan/actions.ts:167-186`); `tasks-panel.tsx:39,45` states the panel is a project task list distinct
  from a milestone; and `rollupMilestones` (`milestones-model.ts:112`) reads each milestone's OWN
  `progress_pct` (completed→100), never a task rollup. So report §2's "no schema change if tasks already
  link to the milestone" is **wrong** — U2 needs the enabling migration (`milestone_id` on `tasks`) plus
  an attach control plus the rollup change. **Tighten U2 to M with a migration.** (This is the Q6 answer.)
- **F2 (cross-program collision — the notification surface does not exist).** A grep for
  `notification`/`notify` across `lib`, `components`, and `app/(app)` returns **zero** hits — VEYRA has
  no notification system at all, confirming the report's own §2 note. BUT the sibling Project Management
  program's **D3/U6 instructs sub-agents to emit "on the EXISTING notification surface"** — there is
  none. So U9 here and Project Management U6 would **both create the `notifications` table + bell for
  the first time** — the exact parallel-writer hazard this project fears. **Before dispatching either,
  the orchestrator must check the other program's commits; whichever lands the surface first OWNS it and
  the other reuses it.** Do not let two programs mint two notification tables.
- **F3 (holidays table exists but is UNUSED by planning).** `public.holidays(org_id, holiday_date, name)`
  exists (`0034_hr_wfh_holidays.sql:118`, registered `tables.ts:124`) but is read ONLY by HR attendance
  (`lib/data/hr.ts:102`, `lib/hr-model.ts:347`, attendance-view). `datePlan` and `applyMilestoneTemplates`
  never consult it — they add plain calendar days (`smartplan-model.ts:157-160`,
  `data/project-milestones.ts:335-337`). U1 reads this existing table (read-only) — **no new table for
  holidays.** Confirms the report's claim.
- **F4 (migration slots are contended).** Latest migration on disk is `0043_saved_views.sql`; the
  literal next slot is 0044, but the procurement program reserves 0044+ and the project-management
  program reserves slots too. The report's printed "0044" is STALE. **Every migration unit runs
  `ls supabase/migrations/ | tail -1` at dispatch and takes the true next number.**
- **F5 (the verification fixture).** The demo project **Malviya Nagar 3BHK**
  `c1d3b37a-9c0c-4263-bfd1-431b935d0597` has **12 real `project_milestones`** (per the Project
  Management program's F4, verified in `db.mjs`) — that is the plan to verify working-days dates,
  task-weighted %, auto-chain, and Gantt PDF against. Never reuse the video's "Ahujas Residency / 48
  activity" numbers — those are Dzylo's demo, quoted only as evidence.

---

## PART 5 — Reuse index (planning-specific — do not rebuild)

Everything here is checked and present. HANDOFF-V10 Part 4 has the app-wide index.

| Reuse | For |
|---|---|
| `lib/smartplan-model.ts` | `SmartPlanStep{offsetDays,durationDays,dependsOn}` (:24-31), `parseSmartPlan` (:84, strips `FORBIDDEN_KEY` :63,102), `datePlan` (:142, the ONLY date source), `planEndDate` (:167), `MAX_STEPS` (:41) — U1 (working-days variant), U3 (modify) |
| `lib/ai/provider.ts` | `isAiConfigured()` (:69), `AI_GEMINI_API_KEY` (:65), attachments, graceful "AI is not configured" (:88) — every AI unit gates through this |
| `lib/ai/smartplan.ts` + `plan/smartplan-actions.ts` | `proposeMilestones`, propose-vs-apply split, `ai_requests` logging (:25), no metering (:26-28), `existing`-names passthrough (:95), `readAttachments` (:59) — U3, U7 |
| `plan/smartplan-dialog.tsx` | upload + brief + editable draft, `existing` passthrough (:128), `LateWarning` "runs past handover" (:194,290) — U1 toggle, U3 modify, U7 samples mount here |
| `lib/milestones-model.ts` | `rollupMilestones` (:94, derived %; :112 the line U2 extends), `scheduleHealth` (:140), `groupByScope` (:176), `milestoneVariance` (:159), `MILESTONE_STATUS_TONE` (:35), `ProjectMilestone` (:46, `progress_pct` :52, `client_visible` :58) — U2 |
| `lib/schedule-model.ts` | `dueVariance`/`completionVariance` variance strings — timeline display |
| `lib/gantt-model.ts` | `buildGantt` (:130) + `BarTone`/`stateLabel` + month ticks + today-line + `dependsOn` — U8 Export PDF reads this; **do not fork** (the Project Management Timeline Planner also depends on exactly one Gantt) |
| `lib/data/project-milestones.ts` | `createMilestone` (:98), `applyMilestoneTemplates` (:297), `listMilestoneTemplates` (:278), `DEFAULT_MILESTONE_TEMPLATES` (:206), `listMilestoneDeps` (:370), `setMilestoneDependency` (:411, insert/delete :435-447), `applySmartPlan` (:470, inserts milestones + deps :522) — U1, U5, U6 |
| `plan/actions.ts` | `addMilestoneAction`/`updateMilestoneAction` (:39,:61 — U4 bulk reuses `updateMilestone`), `applyTemplatesAction` (:95), `addScopeAction` (:121), `toggleDependencyAction` (:140 — U6 reuses, no second dep writer), `addProjectTaskAction` (:167) — all guard `projects.project.edit` |
| `plan/plan-view.tsx` | milestone rows, server-resolved `?tab=` (mirror for any new tab, NOT a useEffect), the dependency toggle form (:838-850) |
| `plan/tasks-panel.tsx` + `tasks` + `task_checklist` | the project task list — U2 adds the `milestone_id` link + attach control here |
| `holidays` table (`tables.ts:124`, `0034:118`) | U1 reads it (read-only) for the working-day skip — no new table |
| `lib/prompt-library-model.ts` + `ai_prompt_templates` (`tables.ts`) | click-to-fill prompt samples — U7 (`kind="smartplan"`) |
| `/projects/[id]/report` Progress Report + `client_visible` | the client-visibility path (NOT a portal) — honour the flag; U8 Gantt PDF respects it |
| `components/ui/primitives.tsx`, `patterns.tsx`, `button.tsx` (asChild), `saved-views.tsx` | UI vocabulary |

**Capabilities that exist:** `projects.project.view/create/edit`, `projects.task.delete`,
`billing.cost.view` (the Hide-money / cost-column gate). Plan mutations guard on
`projects.project.edit`; task delete on `projects.task.delete`. **There is no `plan.*` capability** —
new plan actions guard on `projects.project.edit` (or `.view` for read-only surfaces). A NEW settings
surface (U5 template editor) that needs its own key must add it to `lib/can-model.ts` — an unknown key
fails closed for everyone. The template editor may reuse `projects.project.edit` or introduce
`settings.plantemplate.edit` (owner call at dispatch).

**HARD rules that bite here:** new tables/columns follow HARD RULE 3 (migration + `lib/data/tables.ts`
+ org- AND project-isolation asserts in `scripts/verify.mjs` for any NEW table); rich per-line data is
an FK child table, never jsonb (zero jsonb precedent in this repo); totals/% stay DERIVED, never stored
(RULE 6 — `verify.mjs` should assert no stored task-rollup/working-day-date column exists); AI structures
order only, never a date/number (RULE 2 / THE CRITICAL RULE); colour + a word, red reserved (RULE 4).

---

## PART 6 — The units (dispatch one at a time; recommended order below)

**Recommended dispatch order:** **U1 → U2 → U4 → U6 → U5 → U7 → U3 → U8 → (U9 only if Q4=yes) → U10.**
(Working-days first because `datePlan` is the shared date engine; task-weighted progress early because
its migration is the biggest single edit; the AI-heavy modify mode later; notifications and demo last
because they collide with the Project Management program and want that program's state settled first.)
Each is sized S/M/L. Most units EXTEND existing code — **the agent must INSPECT to confirm the
extension point and coordinate with the Project Management program on the shared plan files.** New
tables/columns follow HARD RULE 3; confirm the migration number live.

### U1 — Working-days scheduling (weekly-off + holiday skip) · S
**Decision Q2 (recommend configurable, default Sunday; holidays count).** **Already built (don't
touch):** `datePlan` (`smartplan-model.ts:142`), `applyMilestoneTemplates` date math
(`data/project-milestones.ts:335-337`), the review table, the `holidays` table (`tables.ts:124`,
`0034:118`). **Build:** a deterministic working-day variant of the date arithmetic — advance over the
calendar but SKIP the tenant weekly-off (default Sunday, per-tenant configurable) and any `holidays`
row, so "Start After 9" means 9 working days. Apply the SAME rule to `datePlan` and
`applyMilestoneTemplates` (one shared helper, not two). Wire the **Only Working Days toggle** in the
SmartPlan review table (`smartplan-dialog.tsx`). Store the weekly-off default as a small config (a
`workspace_options` row or one column — NOT a new table); if the migration number is needed, take it
live. **Out of scope:** any AI-authored date (the model still returns offsets only); a holidays editor
(the table + HR editor already exist). **Verify (falsifiable):** exhaustive pure tests — a plan whose
offsets cross a Sunday and a seeded holiday land on the hand-computed working-day dates; the toggle off
reproduces today's plain-calendar dates exactly; verify against the demo plan's real dates in `db.mjs`.

### U2 — Task-weighted milestone progress · M  (has a migration — see F1/Q6)
**Decision Q6 — INSPECTED: tasks have NO milestone link.** **Already built (don't touch):**
`rollupMilestones` (`milestones-model.ts:94`, the :112 line), the `tasks`/`task_checklist` tables, the
task panel. **Build:** (1) migration (live number) adding `milestone_id uuid null references
project_milestones(id) on delete set null` to `tasks` (same table, no new registration); (2) a control
to attach a task to a milestone (extend `addProjectTaskAction`/`createTask` + `tasks-panel.tsx` to carry
`milestone_id`); (3) derive a milestone's % from its linked tasks (done/total, or a weight) in the
milestone read / `rollupMilestones`, **still derived, never stored** — a milestone with no linked tasks
keeps its current behaviour; (4) the small task-count badge on the row (PP-02). **Out of scope:** a
second task table; storing the rolled-up %; changing what `rollupMilestones` treats as authoritative for
milestones without tasks. **⚠ Coordinate:** the Project Management program's U6 super-milestone
auto-complete reads the same rollup — land the rollup change ONCE. **Verify:** two tasks on a milestone,
one done → milestone reads 50%, both done → 100%, checked against `db.mjs`; `verify.mjs` shows no stored
rollup column; the badge counts linked tasks.

### U3 — SmartPlan "modify" mode · M
**Decision Q5 (propose into the review table, never silent replace; Assign-To multi-select).** **Already
built (don't touch):** `parseSmartPlan` (strips numbers — reused unchanged for the modify pass),
`datePlan`, the review table, the `existing`-names passthrough (`smartplan-dialog.tsx:128`,
`smartplan-actions.ts:95`). **Build:** a "Modify this plan" path that sends the band's current plan as
context and asks the model for a **revised structure-only** sequence, landing in the SAME editable review
table (the table is the diff; nothing written until Add); carry an Assign-To multi-select + Show-To-Client
defaults into the drafted rows at import. Reuses `applySmartPlan` for the write. **Out of scope:** any
AI-authored date/duration/number; a second insert path (reuse `applySmartPlan`). **⚠ Coordinate:** the
Project Management program's U8 adds a deterministic Excel importer over the SAME `smartplan-actions`/
`applySmartPlan` — do not fork the dialog or the write. **Verify:** open the modify flow on the demo
plan; the model's proposal reaches the review table with numbers stripped (confirm no price/qty survives);
Add writes milestones with dates = `datePlan(start)` and assignees set, checked in `db.mjs`; the call
logs to `ai_requests`; with `AI_GEMINI_API_KEY` unset the surface degrades to "AI is not configured".

### U4 — Bulk milestone update (assignee + client-visible) · S
**Decision: none (report §5 U4 / PP-06).** **Already built (don't touch):** `updateMilestoneAction`
(`plan/actions.ts:61`) → `updateMilestone`, the milestone selection UI vocabulary. **Build:** a bulk
variant that applies an assignee and/or a client-visible value to a set of selected milestone ids in ONE
guarded server action (`requireCan("projects.project.edit")`), reusing the same `updateMilestone` write.
Keep it to exactly the two operations the video shows (assignee, client-visible) — do NOT build a general
bulk-edit surface. **⚠ Distinct from** the Project Management program's bulk-*task* assign (its U7) —
different target, do not merge. **Out of scope:** bulk status/date edits; a general bulk editor. **Verify:**
selecting three demo milestones and setting one assignee updates exactly three rows in `db.mjs`; a
client-visible bulk toggle flips the same three; the action is guarded.

### U5 — Milestone template editor (+ optional template tasks) · M
**Decision Q8 (editor first; template-tasks optional).** **Already built (don't touch):**
`milestone_templates` (`tables.ts`), `DEFAULT_MILESTONE_TEMPLATES` (`data/project-milestones.ts:206`),
`listMilestoneTemplates` (:278), `applyMilestoneTemplates` (:297), `applyTemplatesAction`
(`plan/actions.ts:95`). **Build:** an editor screen under `/settings` (create / rename / reorder a named
template group; edit each row's name / offset / duration / show-to-client / task-count) over the existing
data + apply path; a new capability key if the owner wants one (else reuse `projects.project.edit`).
OPTIONAL: a `milestone_template_tasks` child table (`org_id`, `template_id` → `milestone_templates`,
label, seq) ONLY if the owner wants templates to seed tasks — full HARD RULE 3 if built. **This unit is
UNIQUE to this program** (the Project Management program does not touch templates). **Out of scope:**
Dzylo's dense column look; a template versioning system. **Verify:** create a named group with three
rows, reorder them, apply it to a fresh scope band → milestones land with the edited offsets/durations
(dates via `datePlan`), checked in `db.mjs`; if `milestone_template_tasks` is built, `verify.mjs`
asserts its org+project isolation.

### U6 — Auto-chain dependencies (n → n-1) · S
**Decision: none (report §5 U6 / PP-05).** **Already built (don't touch):** `project_milestone_deps`,
`setMilestoneDependency` (`data/project-milestones.ts:411`), `toggleDependencyAction`
(`plan/actions.ts:140`); SmartPlan already proposes `dependsOn` indices and `applySmartPlan` inserts the
edges. **Build:** an "Add automatic dependencies" control that links each milestone n to n-1 across a
band in one click, writing `project_milestone_deps` rows through the EXISTING `setMilestoneDependency` —
pure sequencing over the existing graph, idempotent (skip edges that already exist). **⚠ Coordinate:**
the Project Management program's U4 Timeline-Planner link-handles write the SAME edges via the SAME
action — there must be exactly one dependency writer; do NOT add a second. **Out of scope:** a new dep
writer; the "notify on completion" bell (that's U9/Q4); cycle-detection heuristics beyond skipping the
obvious self/back edge. **Verify:** auto-chaining a 5-milestone band creates 4 edges in `db.mjs` and a
re-run adds none (idempotent); the Gantt re-flows the links with no stored result.

### U7 — SmartPlan Prompt Examples · S
**Decision: none (report §5 U7 / PP-00).** **Already built (don't touch):** `lib/prompt-library-model.ts`,
`ai_prompt_templates` (`tables.ts`), the design-prompt library pattern. **Build:** wire `kind="smartplan"`
samples from the prompt library as click-to-fill chips on the SmartPlan dialog (the "Prompt Examples"
link, PP-00), filling the brief textarea. Reuse the existing prompt-library read; seed a few sample rows
(the video's own brief style — "full interior from scratch, furniture + modular, 40-day deadline, plan
for site/design/production/installation/QC"). **Out of scope:** an AI credits meter (Q3 — NOT building);
authoring prompts inside this surface (the library editor exists). **Verify:** the chips render on the
dialog for the demo tenant via node-fetch + Aditi's cookie; clicking one fills the textarea; the samples
come from `ai_prompt_templates` (confirm the `kind` filter in `db.mjs`).

### U8 — Gantt Export PDF · S/M
**Decision: none (report §5 U8 / PP-07).** **Already built (don't touch):** `buildGantt`
(`gantt-model.ts:130`) + `gantt.tsx`, the `lib/quotations-pdf.ts` jsPDF path, the `/projects/[id]/report`
render path. **Build:** an Export-PDF of the milestone Gantt reusing the existing jsPDF / project-report
rendering path — bars, names, %, month grid, the colour+word tone rule; honour `client_visible` (a
client-facing export shows only client-visible milestones). Reuse the ONE `buildGantt` geometry — do NOT
fork a second Gantt (the Project Management Timeline Planner depends on there being exactly one).
**⚠ Distinct from** the Project Management program's U9 CSV/xlsx *data* export — this is a rendered PDF of
the chart; keep both, don't merge. **Out of scope:** a bespoke chart renderer; a client portal. **Verify:**
render a Gantt PDF for the demo plan; the bars match `buildGantt`'s positions; a client-visible export
omits hidden milestones (checked against the `client_visible` flags in `db.mjs`).

### U9 — In-app "notify on completion" bell · M/L  (only if Q4 = yes; collides with Project Mgmt)
**Decision Q4 (recommend YES, in-app only) — AND F2 (no notification surface exists).** **Already built
(don't touch):** `project_milestones` status/deps, `updateMilestoneAction`. **⚠ INSPECT FIRST across
programs:** there is NO notification surface today, and the Project Management program's U6 also wants to
create one. **Before building, `git log` the Project Management commits — if it already landed a
`notifications` table + bell, REUSE it and build only the milestone-completion trigger here.** If not,
build the surface once: a `notifications` table (`org_id`, `member_id`, `kind`, `entity_type`,
`entity_id`, `body`, `read_at`, `at`; HARD RULE 3 — register + isolation asserts), a bell UI, and fire
exactly one in-app notification to the next dependent's owner when a milestone with dependents is
completed (the dependency bell, PP-05). **In-app ONLY — no push, no e-mail, no WhatsApp, no client
portal** (Part 8). **Out of scope:** any external channel; a client portal; a general activity feed.
**Verify:** completing a milestone with a dependent emits exactly one `notifications` row to the right
member (confirm in `db.mjs`); no duplicate on re-save; the bell renders via node-fetch; nothing fires for
a milestone with no dependents.

### U10 — Demo self-clearing plan + inline explainer boxes · S  (collides with Project Mgmt U11)
**Decision Q7 (auto-clear; shared read-only sample).** **Already built (don't touch):**
`milestone_templates` seed, `applyMilestoneTemplates`. **⚠ INSPECT FIRST across programs:** the Project
Management program's U11 builds the SAME self-clearing demo convention + explainer-box component on the
SAME surface. **`git log` it first — if it landed, REUSE the component and only add planning-specific
copy; do not build a second one.** If not, build: a flagged `is_demo` starter plan (from the video's own
14-step fit-out sequence) inside a "DEMO — sample, replace me" box that auto-clears the moment the tenant
generates a SmartPlan, applies a template, or adds a real milestone, with demo rows excluded from real
rollups; and an inline explainer-box component fed by a pure VOCAB map (like `measurement-model`'s visible
formula — keyed by control, testable, NEVER in JSX) covering Start After, Days To Complete, Only Working
Days, Estimated vs Actual, Client Visible, Dependency, Verify the AI plan (copy in report Part B§4b).
**Out of scope:** a client portal; copy inline in JSX. **Verify:** the demo box disappears after a real
milestone exists; the demo rows are excluded from `rollupMilestones`; explainers render from the map and
are covered by a test.

---

## PART 7 — Environment & verification (read before dispatching)

- **The browser pane does NOT work in this environment** (the app window is hidden/minimised → it
  can't paint, collapses to 0×0, screenshots time out). Verify app rendering with **node fetch +
  the session cookie** (HANDOFF-V10 §5.3), which is reliable:
  ```
  node -e "fetch('http://localhost:3010/<path>',{headers:{cookie:'veyra_acting_member=ae9569dc-c875-4d80-9129-ca83d169b396'}}).then(r=>{console.error('STATUS',r.status);return r.text()}).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').replace(/(\s*\|\s*)+/g,' | ').slice(0,3000)))"
  ```
  A page requires the cookie or it 307s to `/login`. `Loading…` is the skeleton's sr-only label, not a
  stall. Server logs: `preview_logs`. The plan lives at
  `/projects/c1d3b37a-9c0c-4263-bfd1-431b935d0597/plan?tab=<milestone|gantt|tasks>` (server-resolved
  `?tab=`, not a useEffect — mirror that pattern for any new tab). If the owner brings the app window
  forward, the screenshot pane may start working — but the fetch method is enough.
- **Never trust the pane for writes** — verify every write in `db.mjs` and the server log. For the
  derived surfaces (working-day dates, task-weighted %) verify the NUMBERS reconcile by hand against
  `db.mjs`, not just that a page rendered.
- **DB:** `node scripts/db.mjs sql "<query>"` (never the Supabase MCP — rule 11). Migrations:
  `node scripts/db.mjs migrate` is **owner-run**, show the migration first. Local reads/writes hit the
  SAME Supabase project as production, so a migration is live the moment it is applied. **Confirm the
  next free migration number with `ls supabase/migrations/ | tail -1` at dispatch time** — procurement
  and project-management reserve 0044+ on this branch; never hardcode a number from this file.
- **Demo tenant** `d46a53af-58b1-4ed7-87be-c675e5803802` (`Veyra Demo Interiors`), project **Malviya
  Nagar 3BHK** `c1d3b37a-9c0c-4263-bfd1-431b935d0597` (has 12 real `project_milestones` — the working-day
  / task-weighted / auto-chain / Gantt-PDF fixture). Owner **Aditi Pradhan**
  `ae9569dc-c875-4d80-9129-ca83d169b396` (use her cookie for full-permission verification). **Always
  filter `org_members` by `org_id`** — demo names repeat across tenants. Never reuse the video's "Ahujas
  Residency / 48 activity" numbers — those are Dzylo's demo, quoted only as evidence.
- **Six gates** (HANDOFF-V10 §5.1), run by the agent AND re-confirmed by the orchestrator before commit:
  ```
  node ./node_modules/typescript/bin/tsc --noEmit
  node ./node_modules/eslint/bin/eslint.js app lib components
  node ./node_modules/vitest/vitest.mjs run
  node ./node_modules/next/dist/bin/next build   # then: git checkout next-env.d.ts
  node scripts/verify.mjs
  node scripts/verify-storage.mjs
  ```
  `next build` skips test files, so run `tsc` too. `verify-storage` is occasionally 10/11 against remote
  storage — re-run before believing a failure. Confirm the live baseline before U1 (two sibling programs
  are moving the count on this branch).
- **Restore point** exists (tag `snapshot/pre-chatgpt-2026-09-10`, commit `3804e23`) — re-run its RESTORE
  manual before a session that will touch data if the owner wants a clean rollback.

---

## PART 8 — NOT building (said out loud)

- **A client portal / client login.** Client visibility = the `client_visible` flag + the
  `/projects/[id]/report` Progress Report, the agreed alternative. Honour the flags; add no login.
- **E-mail / WhatsApp / SMS notifications and "Share this task on Gmail".** Telephony + WhatsApp are
  settled-NO (HANDOFF-V10 Part 8). Any notify (U9, if Q4=yes) is **in-app ONLY**, on a single shared
  notification surface (coordinate with the Project Management program — F2).
- **Any AI-authored number.** THE CRITICAL RULE: the model returns milestone/task names + integer
  offsets + order ONLY; `parseSmartPlan` strips every price/qty/rate key; `datePlan` computes every date
  from a picked start; `rollupMilestones` derives every percentage; every AI call logs to `ai_requests`
  and fails gracefully when `AI_GEMINI_API_KEY` is unset. No gap may introduce a model-produced date,
  duration-as-fact, quantity, or price.
- **An "AI credits" meter on SmartPlan** (Q3) — VEYRA deliberately does not meter SmartPlan (it is not a
  BOQ, `smartplan-actions.ts:26-28`). No credits gate without a decision.
- **Recurring tasks + Reminders** — no VEYRA precedent, notification-adjacent; leave out unless the owner
  asks. (The Project Management program's U7 adds reviewer/recurrence/reminder columns to `tasks` — if
  that lands, this program does not re-add them.)
- **A second SmartPlan model, `datePlan`, Gantt, milestone rollup, dependency writer, or notification
  surface** — all are (or become) single-source across THREE programs on this branch; extend, don't fork.
  Drop Dzylo's dense 10-column look (standing instruction).
- **Dzylo's colour language** — keep grey/amber/green + a word, red reserved for genuine lateness (the
  Gantt already does this).

---

*Next step after the last unit: split the report into the two repo files the method calls for —
`FRAME-REGISTER-PLANNING.md` (Part A evidence, PP-00..11) and `PLAN-PLANNING.md` (Part B instruction) —
from `dzylo-research/06-AI-Project-Planning.pdf`, and persist the frames so a new chat can open them by
id.*
