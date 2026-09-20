# HANDOFF — Dzylo Modular Quotation 2.0 (orchestrator + sub-agent program)

**Read `HANDOFF-V10.md` first for the standing rules** (Part 3 rules, Part 4 reuse index,
Part 5 gates/verify/deploy). This file is the *program plan* for building VEYRA's **Modular
Quotation 2.0** against the Dzylo "Create Modular Kitchen & Wardrobe Quotations in Minutes"
video. It is written for an ORCHESTRATOR that dispatches `veyra-unit` sub-agents one unit at a
time.

Working dir: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM` · Branch:
`quotations-v2-plus-fleet` · Evidence: `dzylo-research/01-Modular-Quotation-2.0.pdf`
(DZ-00..14, Part A evidence + Part B instruction), `dzylo-research/VEYRA-BUILD-MAP.md`
(quotation subsystem deep-dive, Q-A..Q-F) and `dzylo-research/VEYRA-SITE-INVENTORY.md`.

> ⚠ **This feature is on the PARKED list.** `HANDOFF-V10.md:613-615` lists **"Quotation 2.0"**
> under *"Parked — do not build, do not delete the placeholders."* The report reads the owner
> handing over this video as **un-parking it**, but that is **Q1** below and is **NOT yet
> confirmed**. Do not dispatch a single unit until the owner says "un-park it" in words.

---

## PART 0 — Paste this to start a fresh orchestrator session

```
Read HANDOFF-DZYLO-MODULAR.md in full, then HANDOFF-V10.md Parts 3-5. You are the
ORCHESTRATOR for the Dzylo Modular Quotation 2.0 program — a HANDS-ON reviewing engineer,
NOT a ticket-passer. You do not write feature code, but you own the quality of every unit
as if you wrote it. A sub-agent that says "done, gates green" is an INPUT to your review,
never the end of it.

FIRST: this feature is PARKED (HANDOFF-V10 Part 8). Confirm with me that Quotation 2.0 is
un-parked (Part 3 Q1) BEFORE dispatching anything. Then walk me through the blocking owner
questions in Part 3 (Q2 FK scope, Q3 plan gating, Q5 margin precedence, Q8 visible sides) —
each has a RECOMMENDED default; I must pick before the units that depend on it.

For EACH unit you run this loop (Part 1 has the full mandate):
1. INSPECT FIRST yourself. `git log --oneline -8` + read the real files the unit touches, with
   file:line receipts. Confirm what is actually built vs missing — do NOT trust the brief's
   "already built"/"gap" claims (they were written from the video + a code map and can be wrong;
   a "finish" can turn out to be a "build"). Tighten the brief to the REAL gap before dispatching.
   Never dispatch a loose brief. This plan is idempotent — do not redo done work.
2. DISPATCH ONE veyra-unit sub-agent (never in parallel) with the tightened brief.
3. REVIEW HARD when it reports back: read the FULL diff line by line, RE-RUN all six gates
   yourself, verify every WRITE in db.mjs and every screen via node-fetch + cookie (the browser
   pane can't paint — Part 7). Never take "green" on faith. If anything is off, send it back or
   fix the dispatch — do not commit slop.
4. COMMIT locally yourself (agents never commit) with a why-shaped message. Never push or deploy
   (rule 10). Then update this file's Part 2 and go to the next unit.

Nothing is built for the modular config layer or pricing engine yet — the next unit is U1.
Start by INSPECTING the current state (git log + confirm the builder/GST/PDF/versioning that
U6-U8 extend really exist) and tell me what you actually found + which owner questions are still
open, before dispatching anything.
```

---

## PART 1 — The method (orchestrator ↔ veyra-unit)

This mirrors HANDOFF-V10 §1.4–1.6, specialised for this program.

**ORCHESTRATOR MANDATE — read this before you dispatch anything.** You are a senior engineer who
happens to delegate the typing, not a router that forwards tickets. You are accountable for every
line that lands as if you wrote it. Concretely, on every unit you personally: (1) inspect the real
code first and rewrite the brief to the actual gap — these briefs were written from the video + a
code map, so assume they can be wrong about what is already built (in the procurement program a unit
written as "verify the queue" turned out to be a real "build" once an orchestrator read the code);
(2) read the sub-agent's entire diff and reject hand-waving, dead code, rebuilt engines, or unguarded
actions; (3) re-run all six gates yourself and re-verify writes in db.mjs and screens via node-fetch —
a sub-agent's "gates green, verified" is a claim to check, not a fact to trust (this project's history:
"a green test that examined nothing is the worst outcome"); (4) only then commit. If you find yourself
pasting a brief and waiting, you are doing it wrong.

- **The orchestrator does not write feature code.** But it inspects, reviews, gates, and commits —
  hands on the code the whole time.
- **`veyra-unit` sub-agents build.** Each gets ONE self-contained brief (Part 6), writes the
  data layer + model + action + screen + tests, runs the six gates, verifies against the running
  app, reports, and **stops without committing**. The agent starts cold — the brief must be complete.
- **One at a time, by address, never in parallel.** Parallel writers on one codebase is how you
  get two implementations of the same arithmetic — this project's most common defect, and it is
  *especially* dangerous here because the pricing engine (U5) is a single source of truth every
  later unit reads. `Explore` is the only parallel-safe agent (read-only fan-out).
- **The orchestrator commits.** After the agent reports and you re-confirm the six gates + review the
  diff line by line, commit with a message that says WHY the shape is what it is (the commit log is
  the design record).
- **Gate the owner questions.** Several units (Part 6) cannot be dispatched until the owner
  answers the blocking question in Part 3. Ask BEFORE the dispatch, never mid-unit.

**Every sub-agent's non-negotiable protocol** (the briefs are deliberately not exhaustive — this
protocol is what makes a terse brief safe):
- **INSPECT FIRST, with receipts.** A brief's "already built" / "gap" claims are the orchestrator's
  best knowledge, NOT ground truth. Before writing anything, grep/read the named files and confirm
  the ACTUAL current state (cite file:line). If reality contradicts the brief — something is already
  done, or a "finish" turns out to be a "build" — say so in the report and adjust scope to the real
  gap rather than blindly building or blindly skipping.
- **Build only the gap.** Reuse the Part 5 index; never re-implement an engine/table that exists.
- **VERIFY FALSIFIABLY, both halves.** Run all six gates (Part 5.1) and hold the baseline. Verify app
  rendering with node-fetch + cookie (Part 7 — the browser pane can't paint here). Verify every WRITE
  in db.mjs, never in the pane. Hit each VERIFY bullet with actual output — a green gate that examined
  nothing is the worst outcome. The orchestrator RE-RUNS the six gates and reviews the diff before
  committing — it does not take the agent's word for green.
- **Dispatch prompt template** for each unit:
  ```
  You are implementing ONE unit on VEYRA. Working dir + branch as in HANDOFF-DZYLO-MODULAR.md.
  Dev server is running at http://localhost:3010. READ FIRST: HANDOFF-V10.md (rules Part 3, reuse
  Part 4, gates Part 5) and HANDOFF-DZYLO-MODULAR.md Part 1 (your protocol), Part 5 (reuse), Part 7
  (env/verify).
  FOLLOW THE PART 1 PROTOCOL: inspect the real code state first (with file:line receipts) before
  building — the brief's "already built"/"gap" claims are a starting point, not ground truth; if
  reality differs, report it and build the real gap. Then verify falsifiably (six gates + node-fetch
  render + db.mjs on every write + each VERIFY bullet with real output).
  [PASTE THE UNIT BRIEF FROM PART 6]
  REPORT BACK, DO NOT COMMIT: (a) files changed, (b) six-gate numbers, (c) what you inspected and
  what you verified in the app + db.mjs with actual output, (d) deviations / where reality differed
  from the brief. No git commit, no push, no db.mjs migrate.
  ```

---

## PART 2 — State (as of 2026-09-12)

**Nothing is built for the modular CONFIG layer or the pricing engine.** Unlike the procurement
chain (which was already built and that program merely verified), Modular 2.0 is a **from-zero
build** of a tenant config layer (catalogs, categories, components, presets, modules) plus **one
deterministic pricing model** — none of which exists yet (`VEYRA-BUILD-MAP.md` Part 3: *"No
modular price engine, catalog, presets-of-components, carcass/shutter/component tables exist."*).

**What DOES exist and is EXTENDED, not rebuilt** (the second half of the video is mostly built —
this is the single most valuable finding in the report):
- The quotation **builder** (`app/(app)/quotations/quote-builder.tsx`, `line-dialog.tsx`) — U6 extends the line dialog.
- The **line + quote maths** (`lib/quotations-model.ts` `computeLine`/`computeQuoteTotals`) and the
  **GST engine** (`splitGst`/`computeGstTotals`) — the modular price feeds these unchanged (U7).
- **Versioning, templates, share-link, PDF** (`lib/quotations-pdf.ts`) — U8 makes a modular line
  *render*; it does not fork the document.
- **`doc_type='modular'` already exists** on `quotations` but is **INERT** — captured at create
  (`new-quotation-form.tsx:165-168`) and stored, but **no code path reads it to branch behaviour**
  (`VEYRA-BUILD-MAP.md` Q-F). It is a free hook U7 lights up.

**Done & committed for this program:** nothing yet. `git log` shows the *procurement* program
(`bff06eb`..`72eeada`) and the HANDOFF-V10 work — this modular program has not started.

**Next unit: U1.** (Always `git log --oneline -8` first — this plan is idempotent; if a
`modular_*` table or `lib/modular-pricing-model.ts` already exists, that unit landed.)

**Baseline nothing may lower** (HANDOFF-V10 §2): `tsc 0 · eslint 0 · vitest green · verify pass ·
verify-storage pass · build clean`. Migrations applied through the procurement program; **check
the next free migration number with `ls supabase/migrations | tail` before U1** — the report
pencils in 0044+ but the procurement program consumed slots, so confirm, do not assume.

---

## PART 3 — Decisions (owner, **NOT yet settled** — confirm before dependent units)

Unlike the procurement program (whose Q1–Q8 were settled before dispatch), **these are still
open.** Each is the report's OPEN QUESTION with a **RECOMMENDED default** applied from the owner's
stated heuristic — *best for everyone · more features · dedicated not merged.* **Do not treat a
recommendation as a decision.** The **blocking** ones (🔴) must be answered before the units that
depend on them; get the answer in the owner's words first.

- **🔴 Q1 — Un-park Quotation 2.0.** It is on the PARKED list (`HANDOFF-V10.md:614`). *Recommend:*
  **un-park** (the owner handing over the video reads as intent to build). *Blocks:* **everything.**
  Do not dispatch U1 until confirmed in words.
- **🔴 Q2 — Scope of Components / Categories / Presets: tenant-wide or per-catalog?** The video
  treats them as siblings of Catalogs (tenant-wide). *Recommend:* **tenant-wide** (simpler FK
  graph, "best for everyone"; a catalog is then just a named set of *modules*). *Blocks:* U1, U2,
  U3, U4 — it changes every FK (`org_id`-only vs `(org_id, catalog_id)`).
- **🔴 Q3 — Plan gating.** Dzylo restricts Growth to modular-only, lets Pro/Enterprise mix modular
  + normal lines. VEYRA has **no quotation plan tiers today** (`VEYRA-BUILD-MAP.md` Q-F: the
  metered gate is per-create, not per-feature). *Recommend:* **allow mixed for everyone** — do not
  build a gating tier that doesn't exist; revisit only if the owner wants Growth/Pro tiers.
  *Blocks:* U7 (the `type='modular'` create flow) — cheap to add later, so this is soft-blocking.
- **🔴 Q5 — Margin precedence.** Component margin, module (item) margin and quote margin all appear
  in the video; **multi-level modular margin is NET-NEW** — `computeLine` does **line-discount-
  then-tax only, with no quote-level or component-level margin** (`quotations-model.ts:142`;
  `VEYRA-BUILD-MAP.md` Q-A). *Recommend:* apply **component → module(item) → quote** as an explicit
  cascade, each a deterministic %, documented in the engine's tests. *Blocks:* **U5** — the engine
  cannot be written without the order fixed.
- **🔴 Q8 — Visible sides.** How a line chooses which faces are visible (Top/Bottom/Left/Right) and
  which faces feed the *Visible Price* area. *Recommend:* a **Top/Bottom/Left/Right multiselect** on
  the line; each selected face's area × the shutter's Visible Price. *Blocks:* U5 (the shutter term)
  and U6 (the editor control).
- **Q4 — Modular line storage: child table vs JSON column.** *Recommend (strong):* the FK **child
  table `modular_line_config`** — VEYRA has **zero jsonb precedent** and rich per-line data is
  always an FK child table here (`VEYRA-BUILD-MAP.md` Q-B; precedents `scope_items`, `bom_lines`,
  `cutlist_panels`). This is the repo convention, not really a choice; the engine's *breakdown* may
  be a jsonb snapshot column on that row for audit. *Affects:* U7.
- **Q6 — UOM.** Modules show "Nos" but price by area / running foot internally. *Recommend:* **yes —
  display UOM is cosmetic, the engine derives area/RFT itself** (matches the codebase: *"UOM is
  cosmetic in pricing — `computeLine` multiplies raw qty×unit_price regardless of unit"*,
  `VEYRA-BUILD-MAP.md` Q-C). *Affects:* U5, U6.
- **Q7 — Demo data.** Auto-clear on first real row vs manual dismiss; per-tenant seeded rows vs a
  shared read-only sample library the tenant imports (the video's Import button). *Recommend:*
  **auto-clear on first real row + a shared read-only sample the tenant imports** (mirrors the
  procurement program's settled Q5/Q7). *Affects:* U1–U4 and U9.

---

## PART 4 — Findings (from the evidence + the build-map audit; carry into the units)

- **F1 (the config layer is the expensive half, not the builder).** The report's headline: the
  second half of the video (builder, versioning, reviewers, payment plan, PDF, GST) is *mostly
  built*. The genuinely new work is (a) the config layer (U1–U4) and (b) the **deterministic
  pricing model** (U5) — *"a domain-data problem, not a coding one."* Budget accordingly.
- **F2 (`doc_type='modular'` is a dead selector today).** The plumbing exists (DB column + New-
  quotation form option, `new-quotation-form.tsx:168`) but the builder ignores it — a modular quote
  is byte-identical to a regular one (`VEYRA-BUILD-MAP.md` Q-F). U7 is the unit that makes it live.
- **F3 (no jsonb, ever).** Despite jsonb being the "obvious" way to store a modular spec, the whole
  schema uses FK child tables (`VEYRA-BUILD-MAP.md` Q-B). Follow the convention — this is why Q4's
  recommendation is a near-certainty, not a coin-flip. (The one sanctioned jsonb use is a
  *computed breakdown snapshot* for audit, mirroring how ledgers store a derived record.)
- **F4 (UOM cannot convert).** A modular per-sqft engine must compute qty itself the way
  `measurement-model`'s `resolveQty` does; it cannot rely on `uom` to convert
  (`VEYRA-BUILD-MAP.md` Q-C). The engine *is* a sixth "measure mode" in spirit.
- **F5 (every line already auto-syncs to a scope_item).** `syncScopeItemForLine`
  (`lib/data/quotations.ts:558`) upserts a `QL:<lineId>` scope item on every add/update, and
  `deleteLine` removes it. A modular line **is still a `quotation_line`**, so it keeps this behaviour
  for free — decide (in U7) whether each expanded component becomes its own scope child or the line
  stays one scope node (`VEYRA-BUILD-MAP.md` Q-D + closing note). Recommend: **line stays one scope
  node** (the modular spec is detail *under* the line, not new scope).
- **F6 (AI never prices — HARD RULE 2).** Dzylo's "calculator" is deterministic geometry × tenant
  rates, which is exactly how VEYRA already prices. The whole feature fits the rule with no
  exception; U5 must be pure arithmetic with exhaustive tests, and no rate or number may ever come
  from a model (report Part A intro; `ai-boq-model.ts` strips model-emitted prices).
- **F7 (bulk-insert trap).** PostgREST bulk insert needs **uniform keys across rows** — a blank
  optional module column must be present as `null`, not omitted (report DZ-03; HANDOFF-V10 Mistakes
  §Writes). U3's Excel import must normalise every row to the same key set.
- **F8 (same-tenant composite FK).** A module's `category_id` must reference `(id, org_id)` so
  another tenant's category can't be referenced (report DZ-04; HANDOFF-V10 Mistakes §Writes).

---

## PART 5 — Reuse index (modular-specific — do not rebuild)

Everything here is checked and present with a `path:line` receipt. HANDOFF-V10 Part 4 has the
app-wide index.

| Reuse | Receipt | For |
|---|---|---|
| `computeLine` / `computeQuoteTotals` / `marginPct` | `lib/quotations-model.ts:142` / `:176` / `:202` | line & quote maths — the modular Base Price feeds these UNCHANGED; **line-discount-then-tax only, no quote/component margin** (multi-level modular margin is NET-NEW, Q5) |
| `splitGst` / `computeGstTotals` / `gstRateSummary` / `deriveTreatment` | `lib/quotations-model.ts:303` / `:343` / `:322` / `:282` | GST engine — reuse, do not fork |
| `QuotationLine` / `Quotation` / `QuotationSection` / `LineInput` / `LineTotals` | `lib/quotations-model.ts:81` / `:37` / `:74` / `:123` / `:132` | line shapes; a modular line **is** a `quotation_line` — the spec hangs off it via `modular_line_config` |
| `deriveQty` / `resolveQty` / `MEASURE_MODES` | `lib/measurement-model.ts:91` / `:129` / `:22` | the exact pattern the pricing engine follows (derive from dims, visible formula, RULE 2); UOM cosmetic |
| `panelAreaSqm(l_mm,w_mm)` / `panelBandingMm(panel)` / `effectiveQty` / `cutlistTotals` | `lib/production-model.ts:120` / `:131` / `:94` / `:169` | carcass box/board area + edge-band running length; metric mm, **zero pricing** — the engine adds the rates |
| `ITEM_TYPES` (incl. `"module"`) / `UOMS` / `GST_RATES` | `lib/items-model.ts:13` (`module` at `:18`) / `:25` / `:45` | a module can already be catalogued as an item type; reuse enums |
| `BulkItemOutcome` / `BulkCreateResult` | `lib/items-model.ts:82` / `:87` | per-row import outcome shapes for the module Excel import |
| `lib/items-csv.ts` (parser + `ParsedRow{index,values,status,errors[]}`) | whole module | **clone the pattern** for the module importer — it is items-specific, not generic (`VEYRA-BUILD-MAP.md` Q-E); mind F7 |
| `ScopeItem` / `buildScopeTree` / `orderableScope` | `lib/scope-model.ts:15` / `:34` / `:59` | the spine; a modular line resolves to a scope_item like every other line (F5) |
| `syncScopeItemForLine` / `resolveLineQty` | `lib/data/quotations.ts:558` / `:394` | how a line auto-syncs to scope + derives qty server-side — modular lines inherit this |
| `issueDocNumber` / `previewNextNumber` | `lib/data/config.ts:117` / `:81` | Indian-FY numbering — the quote number is unchanged |
| `lib/quotations-pdf.ts` (jsPDF quote renderer) | `lib/quotations-pdf.ts` (12KB) | U8 makes a modular line render inside it; **do not fork the document** |
| `quote-builder.tsx` / `line-dialog.tsx` / `item-combobox.tsx` | `app/(app)/quotations/quote-builder.tsx`, `/line-dialog.tsx`, `/item-combobox.tsx` | U6 EXTENDS the line dialog; do not start a new builder |
| `doc_type='modular'` (inert hook) | `app/(app)/quotations/new/new-quotation-form.tsx:165-168` | the free create-time hook U7 lights up (F2) |
| `prompt-library-model.ts` `VOCAB` | `lib/prompt-library-model.ts:43` | the pattern for the explainer-copy map (pure vocabulary map, keyed by option, testable, never in JSX) — U9 |
| `lib/data/with-org.ts` (only tenant guard) / `lib/data/tables.ts` (allowlist) | `with-org.ts` / `tables.ts` (quotations `:58-60`, `quotation_templates :63`, `items :18`, `scope_items :92`) | every new `modular_*` table registers in `tables.ts` + isolation asserts in `verify.mjs` (HARD RULE 3) |

**Capabilities that exist:** `quotations.quotation.view/create/approve/delete`
(`lib/can-model.ts:57-60`) — **there is NO per-line or per-feature quotation capability;
`.create` covers all builder mutations** (`VEYRA-BUILD-MAP.md` §can-model). A NEW settings surface
(the Modular Catalog card, U1–U4) needs a **NEW capability key** added to `lib/can-model.ts` (e.g.
`settings.modular.edit`) — an unknown key fails closed for everyone (`can-model.ts:325-331`).

---

## PART 6 — The units (dispatch one at a time; recommended order below)

**Recommended dispatch order:** U1 → U2 → U3 → U4 → U5 → U6 → U7 → U8 → U9. This is
dependency-correct: the config layer (U1–U4) precedes the engine (U5) that reads it; the editor
(U6) needs the engine + presets; persistence (U7) needs the editor; the PDF (U8) needs a persisted
modular line; U9 is a consolidation pass over U1–U4. **New tables follow HARD RULE 3** (the
migration + `lib/data/tables.ts` registration + org- AND project-isolation asserts in
`scripts/verify.mjs`); rich per-line data is an **FK child table, never jsonb** (F3). Confirm the
next free migration number before U1 (Part 2). Each unit is sized S/M/L.

> **Gate check before dispatch:** U1–U4 need **Q2** (FK scope). U5 needs **Q5** (margin) + **Q8**
> (visible sides) + **Q6** (UOM). U6 needs **Q8**. U7 needs **Q3** (plan gating) + **Q4** (storage).
> And **all of it** needs **Q1** (un-parking). Do not dispatch a unit whose question is open.

### U1 — `modular_categories`: table + model + Settings screen + demo rows · S
**Already built (don't touch):** the `/settings` hub and card pattern (`settings/page.tsx`), the
`withOrg` accessor, any VEYRA lookup shape. **Build:** migration for `modular_categories`
(`org_id`, catalog scope per **Q2**, `name`, `parent_id` nullable = subcategory, `seq`), registered
in `lib/data/tables.ts`, isolation asserts in `verify.mjs`. A pure model (types + helpers) for the
two-level taxonomy. A "Modular Catalog" Settings card (NEW capability key `settings.modular.edit`
in `can-model.ts`) with a Categories tab: create category, add subcategory, edit/delete. Seed the
video's categories (`Kitchen Base Unit`, `Kitchen Tall Unit`, `Kitchen Wall Unit`, `Other Storage`,
`Wardrobe`, `Wardrobe Loft`) as `is_demo=true`. **Out of scope:** the other three tabs (U2/U3/U4);
the self-clearing demo *component* (U9 formalises it — here just flag rows). **Verify:** in
`db.mjs`, categories insert org-scoped with a nullable `parent_id`; the card renders via node-fetch
+ Aditi's cookie; a same-tenant composite FK is used for `parent_id` (F8).

### U2 — `modular_components`: typed price model + 8-type tabbed screen + demo + explainer copy · M
**Already built (don't touch):** the Settings card shell (U1), `GST_RATES`/`UOMS`. **Build:**
migration for `modular_components` (`org_id`, `type` enum
`carcass|shutter|drawer|handle|hinge|addon|accessory|edgeband`, `name`, `brand`, `description`,
`margin`, `applies_to` for add-ons, and **typed prices**: carcass `{box, board, shelf_panel,
back_panel, drawer}`, shutter `{price, visible}`, others `{price}`). Recommend a **typed price set
per type**, not a jsonb blob (F3) — five nullable columns or a small typed shape. The Components tab
with 8 sub-tabs. Seed the video's rows as `is_demo=true` (Carcass: Branded BWP 1200/400/400/200/2500,
HDMR 600/200/200/100/1500, WPC, MDF; Shutter: Veneer 1200/600, Acrylic 450/225 …; Edge Bands 0.8mm=5,
2mm=15 per RFT; etc.). Author the **explainer-copy map** for box-vs-board, visible price, add-on,
edge band (report Part B §4b copy) as a pure VOCAB (U9 consolidates it). **Out of scope:** the engine
that reads these rates (U5). **No rate ever comes from a model (RULE 2).** **Verify:** each type's
rows insert with the right price columns populated and others null; `applies_to` present on add-ons;
demo rows flagged; tabs render.

### U3 — `modular_catalogs` + `modular_modules`: tables + model + list + item form + Excel import · M
**Already built (don't touch):** `lib/items-csv.ts` (clone its pattern, don't extend), production
mm geometry. **Build:** migration for `modular_catalogs` (`org_id`, `name`, `is_default`,
`description`; **one default per org** via a scoped-unique partial index) and `modular_modules`
(`org_id`, `catalog_id`, `category_id`, `code`, `name`, `width_mm`, `height_mm`, `depth_mm`,
`shutters`, `shelves`, `panels`, `drawers`, `handles`, `hinges`, `uom`, `margin`, `discount`,
`tax_rate`, `hsn`, `image_ref` optional-upload-NOT-generated). Dims in **mm integers** (production
works in mm). Category FK is composite `(id, org_id)` (F8). A Catalogs tab + a module list + a module
item form. **Excel import cloning `items-csv.ts`** with module columns and per-row outcomes — mind
the **uniform-keys trap** (F7: blank optional column = `null`, not omitted). A "Import starter
library" that fills a blank catalog. **Out of scope:** pricing (U5); the preset that references
modules (U4). **Verify:** exactly one default catalog per org; a module inserts with mm dims + part
counts; import reports per-row created/skipped/error; an uncatalogued category is refused.

### U4 — `modular_presets`: config model + shared spec editor + demo preset · M
**Already built (don't touch):** components (U2), modules (U3). **Build:** migration for
`modular_presets` (`org_id`, scope per **Q2**, `name`, `description`, `is_default`, `config` — this
IS the sanctioned jsonb: component choices + visibility + back panel + drawers/handles/hinges/
accessories + `installation_rate`; **choices not prices** — prices resolve at quote time from
current rates so a rate change reprices future quotes). The **shared spec editor component** (the
DZ-10 modal): Shutter/Visible (shutter, edge band, add-ons), Carcass (carcass, edge band, add-ons,
visible sides per **Q8**, visibility config `Additional Panel|Integrated Carcass`, back panel
`Regular|Thin`), collapsible Drawers/Handles/Hinges/Accessories, installation rate. **Build the
editor ONCE** — it is reused verbatim by U6 (edit-a-line). Enumerations (visibility config, back
panel, drawer type/placement/price-strategy) live in a **pure model as consts** (like
`MEASURE_MODES`), never in JSX. Seed the `Kitchen` + `Wardrobe` demo presets. **Out of scope:** the
live price (U5); mounting the editor in the quote line dialog (U6). **Verify:** a preset stores
choices not prices; `is_default` unique per scope; the editor round-trips a config in `db.mjs`.

### U5 — `lib/modular-pricing-model.ts`: the deterministic engine + exhaustive tests · L / research
**The heart of the feature and the expensive half — a domain-data problem, not a coding one.**
**Blocked on Q5 (margin precedence), Q8 (visible sides), Q6 (UOM).** **Already built (reuse):**
`panelAreaSqm`/`panelBandingMm` (`production-model.ts:120`/`:131`), `computeLine` downstream
(`quotations-model.ts:142`), the `resolveQty` pattern. **Build:** a **pure, tested**
`lib/modular-pricing-model.ts` that, given a module (dims + counts), a resolved component set
(rates), and the line config, returns a **Base Price AND its full breakdown** (for the eye popover
and audit). **Write the tests FIRST** and confirm each formula with the owner — they drive every
rupee:
- Carcass **box** price = two faces only (height × width) × box rate; **board** price = all five
  sides (leaving shutter front) × board rate; box-vs-board chosen per line.
- Shelves (horizontal) & panels (vertical): count × area × shelf/panel rate.
- Back panel: its own cheaper rate; Regular vs Thin picks the rate.
- Shutter: front area × Price; each **visible side** area × Visible Price (visible sides per Q8);
  visibility config (`Additional Panel` adds a shutter on top of the carcass; `Integrated Carcass`
  replaces the carcass, shutter on front) changes what area is charged.
- Edge band: `panelBandingMm` → RFT × per-RFT rate.
- Drawers: Per Unit = fixed × count; Per Board = W×H×D custom + mechanism; Full Body vs Base Back
  changes how many sides are material; External vs Internal is placement.
- Add-ons add to shutter or carcass subtotal per `applies_to`; Handles/Hinges = price × count;
  Accessories = chosen × price; Installation = per-installation rate on the line.
- Margins cascade **component → module(item) → quote** per **Q5**.
- Output flows into `computeLine` → `computeQuoteTotals` exactly as `resolveQty` does — **the engine
  sits in FRONT and never alters GST/discount maths.** **NO value is ever an LLM output (RULE 2, F6).**
Every intermediate travels with its two inputs (a price without its geometry is untrustworthy).
**Out of scope:** the UI (U6), persistence (U7). **Verify:** unit tests reproduce the video's
worked figure (e.g. the ₹52,127 line if the inputs are recoverable) or a hand-computed fixture; the
breakdown foots to the Base Price; feeding the Base Price through `computeLine` reconciles to
`computeQuoteTotals`.

### U6 — Add-Modular-Item editor: extend `line-dialog.tsx` (Apply Preset, live price, eye, validation) · L
**Blocked on Q8.** **Already built (don't touch):** `line-dialog.tsx`, `item-combobox.tsx`, the
shared spec editor (U4), the engine (U5). **Build:** extend `app/(app)/quotations/line-dialog.tsx`
so a modular line offers an **Apply Preset** dropdown (fills the spec from a `modular_presets`
config), the **shared spec editor** (mounted here AND in U4 — one component, two hosts), a **live
Base Price** recomputed via `modular-pricing-model` as inputs change, an **eye popover** showing the
box/board/back-panel/breakdown, and **mechanism-required validation that is SERVER-checked, not just
client**. **Out of scope:** persisting `modular_line_config` (U7); the PDF (U8). **Keep it lean:**
Dzylo's dense form is the density to drop (standing instruction) — keep the information. **Verify:**
opening the dialog on a `type='modular'` quote shows the preset dropdown + live price; picking a
preset fills the spec; the server refuses a submit with no drawer mechanism; the eye breakdown foots
to the live price.

### U7 — `modular_line_config` persistence + modular line into `computeQuoteTotals` + `type='modular'` + columns · M
**Blocked on Q3 (plan gating) + Q4 (storage — recommend the child table).** **Already built (don't
touch):** `computeQuoteTotals`, `syncScopeItemForLine`, the inert `doc_type='modular'` hook (F2).
**Build:** migration for `modular_line_config` (the per-line spec: `line_id` → `quotation_lines(id)`
scoped-unique, `module_id`, `applied_preset_id`, resolved component ids, dims override, `drawers[]`,
`visible_sides`, `visibility_config`, `back_panel`, `installation_rate`, `computed_breakdown` jsonb
snapshot for audit). Persist the U6 spec into it; recompute the line price from config + **current**
rates on read (**totals derived, never stored** — RULE 6; `verify.mjs` should assert no stored
grand-total column). Make `type='modular'` actually branch the create flow (light up F2). Add the
**column customisation** (hide Dimensions etc.). Decide F5 (line stays one scope node — recommended).
Per Q3, gate or allow-mixed. **Out of scope:** the PDF render (U8). **Verify:** a modular line
round-trips its config in `db.mjs`; changing a component rate reprices the line without a stored
total; `type='modular'` is read, not just written; `computeQuoteTotals` foots with a modular line
present.

### U8 — Preview / PDF: make a modular line render in `quotations-pdf.ts` + verify plan/GST unchanged · M
**Already built (don't touch):** the whole quote document — `lib/quotations-pdf.ts` (header,
BOQ table, GST summary, totals, T&C), the payment-plan mapping to milestones, bank/T&C template
config, `computeGstTotals`. **Build:** make a **modular line render** its dimensions/area/breakdown
inside the existing renderer, and wire the **column-visibility** toggles (U7) through to the PDF.
**Do NOT rebuild the quote document, GST engine, or payment plan.** **Out of scope:** a second
renderer; any generated image (uploads or neutral icon only). **Verify:** render a modular quote's
PDF; the modular line shows dims/area/breakdown; the totals equal `computeQuoteTotals` + the GST
split; the payment plan (Advance/Before Production/Before Installation/Handover) is unchanged;
hiding Dimensions changes the output.

### U9 — Shared demo self-clearing + explainer-box component, adopted across U1–U4 · S
**Blocked on Q7.** **Already built (don't touch):** the demo rows each of U1–U4 seeded; the VOCAB
pattern (`prompt-library-model.ts:43`). **Build:** a shared **"DEMO — sample, replace me"** box that
hides the moment a non-demo row exists in that section and excludes demo rows from any real
quotation's pricing (per Q7: auto-clear + shared-sample-import), adopted across every config list
(each Component type, Categories, Presets, Modules). Consolidate the **explainer-copy map** authored
piecemeal in U2/U4 into ONE pure VOCAB keyed by option (box/board price, shelves/panels, back panel,
visible price, Additional Panel vs Integrated Carcass, Full Body vs Base Back, External vs Internal,
Per Unit vs Per Board, add-on, edge band — copy verbatim from report Part B §4b), rendered by a
shared explainer-box component, **never in JSX**, covered by a test. **Verify:** the demo box
disappears after a real row is added; explainers render from the map and are covered by a test; demo
rows never enter a real quote's price.

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
- **Never trust the pane for writes** — verify every write in `db.mjs` and the server log.
- **DB:** `node scripts/db.mjs sql "<query>"` (never the Supabase MCP — rule 11). Migrations:
  `node scripts/db.mjs migrate` is **owner-run**, show the migration first. Local reads/writes hit
  the SAME Supabase project as production, so a migration is live the moment it is applied.
- **Demo tenant** `d46a53af-58b1-4ed7-87be-c675e5803802` (`Veyra Demo Interiors`), project
  **Malviya Nagar 3BHK** `c1d3b37a-9c0c-4263-bfd1-431b935d0597`. Owner **Aditi Pradhan**
  `ae9569dc-c875-4d80-9129-ca83d169b396` (use her cookie for full-permission verification).
  **Always filter `org_members` by `org_id`** — demo names repeat across tenants (four "Rahul
  Verma"s). A modular quote wants a lead/project source; the demo project above is the target.
- **Six gates** (HANDOFF-V10 §5.1), run by the agent AND re-confirmed by the orchestrator before commit:
  ```
  node ./node_modules/typescript/bin/tsc --noEmit
  node ./node_modules/eslint/bin/eslint.js app lib components
  node ./node_modules/vitest/vitest.mjs run
  node ./node_modules/next/dist/bin/next build   # then: git checkout next-env.d.ts
  node scripts/verify.mjs
  node scripts/verify-storage.mjs
  ```
  `next build` skips test files, so run `tsc` too. `verify-storage` is occasionally off-by-one
  against remote storage — re-run before believing a failure. Every new `modular_*` table MUST add
  its org- and project-isolation asserts to `verify.mjs` or the gate fails (HARD RULE 3).
- **Restore point** exists (see HANDOFF-V10 §5) — re-run its RESTORE manual before a session that
  will touch data if the owner wants a clean rollback.

---

## PART 8 — NOT building (said out loud)

- **Module 3D renders / generated images / text-to-image** — 2D→3D and text-to-image are settled-NO
  (HANDOFF-V10 Part 8). Module thumbnails are an **uploaded image or a neutral icon**; generate nothing.
- **The whole Integrations row** (Zoho Books, Dzylo Dialer, Voice API, AI Chat Agent, WhatsApp API &
  Templates, Webhooks, Automations) — VEYRA out-of-scope (HANDOFF-V10 Part 8). Ignore it entirely.
- **"Smart Actions" AI and any AI-authored number, rate or spec** — AI structures, never prices
  (RULE 2, F6). The pricing engine is deterministic arithmetic.
- **The competitor's dense 12-column matrix look** — keep the information, drop the density
  (standing instruction).
- **A second quotation builder, GST engine, or PDF** — all exist; extend, don't fork (U6/U7/U8).
- **Quotation plan tiers (Growth vs Pro/Enterprise gating)** unless the owner says yes at Q3 — VEYRA
  has none today; the recommendation is allow-mixed-for-everyone.

---

*Next step after the last unit: split the report into the two repo files the method calls for —
`FRAME-REGISTER-DZYLO-MODULAR.md` (Part A evidence, DZ-00..14) and `PLAN-DZYLO-MODULAR.md` (Part B
instruction) — from `dzylo-research/01-Modular-Quotation-2.0.pdf`, and persist the frames so a new
chat can open them by id.*
