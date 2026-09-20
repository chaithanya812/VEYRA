# HANDOFF — Dzylo Inventory Management (orchestrator + sub-agent program)

**Read `HANDOFF-V10.md` first for the standing rules** (Part 3 rules, Part 4 reuse index,
Part 5 gates/verify/deploy). This file is the *program plan* for finishing VEYRA's
inventory feature against the Dzylo "Inventory Management" video. It is written for an
ORCHESTRATOR that dispatches `veyra-unit` sub-agents one unit at a time.

Working dir: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM` · Branch:
`quotations-v2-plus-fleet` · Evidence: `dzylo-research/04-Inventory.pdf` (INV-00..12) and
`dzylo-research/VEYRA-SITE-INVENTORY.md` / `VEYRA-BUILD-MAP.md`.

> **The one thing to know.** This is the MOST already-built area VEYRA has relative to any
> Dzylo video — roughly **90% done**. `app/(app)/inventory/` + `lib/data/inventory.ts` +
> `lib/inventory-model.ts` already implement the ENTIRE Dzylo screen: the five tabs,
> Company/Project warehouses, the append-only stock ledger, Goods Value, stock-in / stock-out,
> GRN + issue-note documents, AND both the Deliveries StockIn queue and the Expenses StockIn
> queue. So this program is a **REUSE AUDIT + a handful of small additive deltas**, not a
> build. Anyone who reads this video as "build inventory" has missed that VEYRA already runs it.

---

## PART 0 — Paste this to start a fresh orchestrator session

```
Read HANDOFF-DZYLO-INVENTORY.md in full, then HANDOFF-V10.md Parts 3-5. You are the
ORCHESTRATOR for the Dzylo inventory program — a HANDS-ON reviewing engineer, NOT
a ticket-passer. You do not write feature code, but you own the quality of every
unit as if you wrote it. A sub-agent that says "done, gates green" is an INPUT to
your review, never the end of it.

This is the most-complete area VEYRA has (~90% built). Most units are "verify +
small extend" — which makes INSPECT-FIRST more important, not less: the honest gap
is small and easy to over- or under-build. A "verify" can turn out to be a real
build (it did on the procurement program's U3, which looked like a verify and was a
BUILD), and a "build" can turn out already done.

For EACH unit you run this loop (Part 1 has the full mandate):
1. INSPECT FIRST yourself. `git log --oneline -8` + read the real files the unit
   touches, with file:line receipts. Confirm what is actually built vs missing —
   do NOT trust the brief's "already built"/"gap" claims. Tighten the brief to the
   REAL gap before dispatching. Never dispatch a loose brief.
2. DISPATCH ONE veyra-unit sub-agent (never in parallel) with the tightened brief.
3. REVIEW HARD when it reports back: read the FULL diff line by line, RE-RUN all six
   gates yourself, verify every WRITE in db.mjs and every screen via node-fetch +
   cookie (the browser pane can't paint — Part 7). Never take "green" on faith. If
   anything is off, send it back or fix the dispatch — do not commit slop.
4. COMMIT locally yourself (agents never commit) with a why-shaped message. Never
   push or deploy (rule 10). Then update this file's Part 2 and go to the next unit.

Ask me before a unit only if its brief has a genuine open choice. The decisions here
are NOT settled — Part 3 lists the OPEN questions with a recommended default per the
owner heuristic. Q1 (valuation method) and Q2 (transfer semantics) BLOCK work: get
them answered before U3 and before anything that touches Goods Value.

Start by INSPECTING the current state (git log + read the inventory model + data
layer + the latest migration number) and tell me what you actually found before
dispatching anything.
```

---

## PART 1 — The method (orchestrator ↔ veyra-unit)

This mirrors HANDOFF-V10 §1.4–1.6, specialised for this program.

> **ORCHESTRATOR MANDATE — read this before you dispatch anything.**
> You are a senior engineer who happens to delegate the typing, not a router that forwards
> tickets. You are accountable for every line that lands as if you wrote it. Concretely, on every
> unit you personally: (1) **inspect the real code first** and rewrite the brief to the actual gap —
> a "verify" brief on this 90%-built area is exactly where an orchestrator gets lazy and stamps
> something that was never checked; the procurement program's U3 brief in that very file was wrong
> until an orchestrator read the code and found the "acceptance queue" was really just a receipt log,
> so assume these briefs can be wrong too; (2) **read the sub-agent's entire diff** and reject
> hand-waving, dead code, a rebuilt ledger, or unguarded actions; (3) **re-run all six gates
> yourself** and **re-verify writes in `db.mjs` and screens via node-fetch** — a sub-agent's "gates
> green, verified" is a claim to check, not a fact to trust (this project's history: "a green test
> that examined nothing is the worst outcome"); (4) **only then commit.** If you find yourself pasting
> a brief and waiting, you are doing it wrong.

- **The orchestrator does not write feature code.** But it inspects, reviews, gates, and commits —
  hands on the code the whole time.
- **`veyra-unit` sub-agents build.** Each gets ONE self-contained brief (Part 6), writes the
  migration (if any) + data layer + action + screen + tests, runs the six gates, verifies against
  the running app, reports, and **stops without committing**. The agent starts cold — the brief must
  be complete.
- **One at a time, by address, never in parallel.** Parallel writers on one codebase is how you get
  two implementations of the same arithmetic — this project's most common defect. And here they
  would fight over the same three files (`inventory-view.tsx`, `stock-in-form.tsx`,
  `data/inventory.ts`) and the same migration slot. `Explore` is the only parallel-safe agent
  (read-only fan-out).
- **The orchestrator commits.** After the agent reports and you re-confirm the six gates, commit
  with a message that says WHY the shape is what it is (the commit log is the design record).
- **Every sub-agent's non-negotiable protocol** (the briefs are deliberately not exhaustive — this
  protocol is what makes a terse brief safe):
  1. **INSPECT FIRST, with receipts.** A brief's "already built" / "gap" claims are the orchestrator's
     best knowledge, NOT ground truth. Before writing anything, grep/read the named files and confirm
     the ACTUAL current state (cite `file:line`). If reality contradicts the brief — something is
     already done, or a "verify/extend" turns out to be a "build" — say so in the report and adjust
     scope to the real gap rather than blindly building or blindly skipping.
  2. **Build only the gap.** Reuse the Part 5 index; never re-implement the ledger, the GRN document,
     `goodsValue`, `projectStock`, `postStockMovement`, or the numbering series. Every figure on every
     inventory screen is ledger arithmetic or user-typed config — **no LLM ever produces a number**
     (HARD RULE 1).
  3. **Never add a stored total.** `grns` has no `qty` and no `amount` column ON PURPOSE; levels and
     values are summed from `stock_movements`. A migration that adds a counter is wrong. `verify.mjs`
     asserts this (Part 7) — keep it asserting the ledger sum, not a stored total.
  4. **VERIFY FALSIFIABLY, both halves.** Run all six gates (Part 5.1) and hold the baseline. Verify
     app rendering with node-fetch + cookie (Part 7 — the browser pane can't paint here). Verify every
     WRITE in `db.mjs`, never in the pane. Hit each of the brief's VERIFY bullets with actual output —
     a green gate that examined nothing is the worst outcome (HANDOFF-V10 §Tests).
  The orchestrator RE-RUNS the six gates and reviews the diff before committing — it does not take the
  agent's word for green.
- **Dispatch prompt template** for each unit:
  ```
  You are implementing ONE unit on VEYRA. Working dir + branch as in HANDOFF-DZYLO-INVENTORY.md.
  Dev server is running at http://localhost:3010. READ FIRST: HANDOFF-V10.md (rules Part 3,
  reuse Part 4, gates Part 5) and HANDOFF-DZYLO-INVENTORY.md Part 1 (your protocol), Part 5 (reuse),
  Part 7 (env/verify).
  FOLLOW THE PART 1 PROTOCOL: inspect the real code state first (with file:line receipts) before
  building — the brief's "already built"/"gap" claims are a starting point, not ground truth; if
  reality differs, report it and build the real gap. If your unit adds a migration, DO NOT hardcode a
  number — run `ls supabase/migrations/ | tail -1` and take the next slot (procurement + project
  programs run on this same branch and reserve slots). Then verify falsifiably (six gates + node-fetch
  render + db.mjs on every write + each VERIFY bullet with real output).
  [PASTE THE UNIT BRIEF FROM PART 6]
  REPORT BACK, DO NOT COMMIT: (a) files changed, (b) six-gate numbers, (c) what you inspected and
  what you verified in the app + db.mjs with actual output, (d) deviations / where reality differed
  from the brief. No git commit, no push, no db.mjs migrate.
  ```

---

## PART 2 — State (as of 2026-09-13)

**The whole inventory screen is BUILT and tested.** Confirmed by inspection this session
(receipts in Part 4/5): three tenant tables (`warehouses`, `stock_movements`, `grns`), the pure
model `lib/inventory-model.ts` (`projectStock`, `goodsValue`, `movedQty/Amount`, `lastMovement`,
`buildWarehouseTree`, `signedQty`, `INVENTORY_TABS`, `StockNote`, `GRN_STATUSES`,
`WAREHOUSE_KINDS`, `MOVEMENT_DIRECTIONS`), the data layer `lib/data/inventory.ts`
(`createWarehouse`, `postStockMovement`, `addStockIn`, `stockLevels`, `listGrns`, `getInventory`,
`getProjectInventory`, `searchCatalogueItems`, `assertWarehouseBelongsToProject`), BOTH queues
(`DeliveryStockInRow`, `ExpenseStockInRow`), the five-tab screen `app/(app)/inventory/`, and
isolation asserts in `scripts/verify.mjs`. This program EXTENDS with additive columns and one
convenience wrapper — it is not a from-zero build. See `dzylo-research/04-Inventory.pdf` Part B§1
for the receipts.

**Nothing built yet under this program.** No inventory-program commits exist. `git log` head is
`277ec59` (a procurement-program handoff commit). **Next unit: U1.** (Always `git log --oneline -8`
first — this plan is idempotent.)

**⚠ The report's migration slot "0044" is STALE — do not hardcode it.** Highest migration on disk
right now is **0043** (`ls supabase/migrations/` → `0043_saved_views.sql`). BUT the **procurement**
program (`HANDOFF-DZYLO-PROC.md`, reserves 0044+) and the **project** program run on this SAME
branch and will land migrations. So the next free slot is a moving target. **Every unit that adds a
migration MUST run `ls supabase/migrations/ | tail -1` at dispatch and take the next number** —
never the report's hardcoded 0044/0045/0046.

**Baseline nothing may lower** (HANDOFF-V10 §2): `tsc 0 · eslint 0 · vitest all-pass · verify
pass · verify-storage 11/11 · build clean`. Re-establish the exact counts by running the six gates
once before the first dispatch (the procurement/project programs may have moved them), and hold
THAT as the floor.

---

## PART 3 — Decisions (OPEN — get Q1 & Q2 answered before building anything valuation- or
transfer-touching)

Unlike the procurement program, these are **NOT settled**. The report (`04-Inventory.pdf` §7) poses
seven open questions. Below is each with a **RECOMMENDED default** per the owner's standing heuristic
(*best for everyone · more features · dedicated not merged*). Ordered by how much each changes the
work. Q1 and Q2 are BLOCKING.

- **Q1 — Valuation method (BIGGEST, BLOCKING).** Goods Value today is the ledger's own
  `goodsValue()` — signed qty×unit_rate summed at the rate recorded on each line, explicitly
  *"not FIFO and not a weighted average"* (`inventory-model.ts:269-276`). The video prices a
  stock-out at the same rate the stock came in at (450), consistent with this.
  **RECOMMEND: KEEP ledger-arithmetic Goods Value.** FIFO / weighted-average is a parked FINANCE
  decision the code cannot make. This gates **any valuation-touching delta** — no unit changes how
  a value is computed until the owner explicitly asks for a valuation method. (If the owner ever
  says yes, it is its own program, not a delta in this one.)
- **Q2 — Transfer semantics (BLOCKING for U3).** Dzylo's Transfer books an OUT at the source and an
  IN at the destination, linked by one GDN — the destination's Goods Value rose (INV-08). VEYRA's
  `transfer` direction currently nets **0** and books no destination level (`signedQty` returns 0
  for transfer, `inventory-model.ts:17-19,154-160`). **RECOMMEND: adopt the paired transfer**
  (matches the video, "more features"). U3 is the build; do not dispatch U3 until this is a yes.
  If the owner prefers to keep transfers as a simple out, U3 is cut.
- **Q3 — Stock-out reason set.** Confirm the three states `Consumed / Return / Transferred` are the
  full set, and whether `Return` should link to a vendor / a return document.
  **RECOMMEND: ship the three as an enum now** (U2); leave a vendor-linked return document as a
  later delta, not folded in.
- **Q4 — Demo data behaviour.** Auto-clear the demo warehouse on the first real warehouse/movement,
  or a manual "dismiss demo"? Per-tenant seeded rows, or a shared sample the tenant imports?
  **RECOMMEND: auto-clear + exclude demo rows from real totals** (matches the procurement program's
  Q7 so the two programs share ONE convention). See Part 4 F2 — there is no existing `is_demo`
  column, so this is a new convention, not a reuse.
- **Q5 — Bulk warehouse create.** Dzylo's Add-Project-Warehouse multi-selects several projects at
  once; VEYRA creates one at a time. **RECOMMEND: a thin loop over the existing
  `createWarehouse`** (create N in one action) — small, "more features". Optional; not on the
  critical path.
- **Q6 — Warehouse Analytics tab.** Build charts over the ledger, or leave Inventory + Transaction
  History as the two warehouse tabs? **RECOMMEND: optional (U7)** — charts over the same ledger, no
  new data. Ship only if the owner wants it.
- **Q7 — OCR receipt reading ("Read by Daizy AI").** **SETTLED-NO.** OCR receipt-reading is an AI
  dependency VEYRA does not have; the designer types the lines. It would only extract text, never
  price (HARD RULE 1 still holds), but it stays out of scope. Do not build it.

---

## PART 4 — Findings from this session's inspection (where reality tightened the report)

The report's file:line receipts were spot-checked and **hold** (Part 5 lists the confirmed ones).
Three things the inspection CONTRADICTS or tightens — surface these before dispatching:

- **F1 (migration slot is stale).** The report hardcodes 0044/0045/0046 (§2, §5). On disk the
  highest is **0043**; procurement (0044+) and project programs share this branch. **Never hardcode
  a migration number** — every unit runs `ls supabase/migrations/ | tail -1` at dispatch. (Folded
  into Part 1's dispatch template and Part 2.)
- **F2 (`is_demo` does NOT exist yet — the report's "existing seed pattern" is aspirational).**
  Grep for `is_demo` / `isDemo` across the repo hits ONLY the handoff `.md` files and a python
  template — **there is no `is_demo` column and no self-clearing seed pattern in the code today.**
  The report §4a calls U6 "VEYRA's existing seed pattern, flagged and self-clearing." It is not
  existing. So U6 introduces a NEW column + convention (bigger than a pure "seed"), and it MUST
  share one convention with the procurement program's U9 (which plans the same `is_demo` idea) —
  do not fork two demo mechanisms. Re-scope U6 from "S, reuse" to "S/M, introduce the convention"
  and coordinate with whichever program lands it first.
- **F3 (receipt attachment — reuse project-document storage, not pasted URLs).** The report §5/U1
  says "reuse the file-upload pipeline; do NOT paste URLs." Confirmed there IS a real upload
  pipeline: project *documents* have real storage (`project_file_versions.storage_path`,
  `VEYRA-SITE-INVENTORY.md:180,218`), whereas site/design photos are pasted-URL-only v1. U1's
  receipt attach must ride the **project-document storage** path, not the pasted-URL path. If that
  pipeline turns out not to be cleanly reusable for a GRN header, U1's attachment half becomes its
  own decision — flag rather than half-build a second uploader.

Confirmed REAL builds (not "verify"): the delta columns `payment_mode`, `date_of_receipt`,
`default_category`, `receipt_file_id`, `stock_out_reason`, `transfer_group_id`,
`transfer_to_warehouse_id` are **absent from every migration** — so U1/U2/U3 genuinely add schema.
The unlisted-item red flag exists (`inventory-view.tsx:941-944`, "Not in catalogue — promote it in
Items") but there is **no "Add To Catalog" button** — so U4 is a real build, not a wire-up of
something present.

---

## PART 5 — Reuse index (inventory-specific — do not rebuild)

Everything here is checked and present THIS SESSION (receipts verified). HANDOFF-V10 Part 4 has the
app-wide index.

| Reuse | For | Receipt |
|---|---|---|
| `lib/inventory-model.ts` | `INVENTORY_TABS` (5 tabs), `INVENTORY_TAB_LABELS`, `WAREHOUSE_KINDS`, `MOVEMENT_DIRECTIONS`, `GRN_STATUSES` | `:226`, `:235`, `:59`, `:19`, `:39` |
| `lib/inventory-model.ts` | `goodsValue`, `projectStock`, `signedQty`, `movedQty`, `movedAmount`, `lastMovement`, `buildWarehouseTree`, `stockValue` | `:269`, `:176`, `:154`, `:278`, `:285`, `:298`, `:334`, `:163` |
| `lib/inventory-model.ts` | `StockNote` (Transaction-History row shape), `NOTE_KIND_LABELS` (GRN / Issue note), `unlinkedCount` | `:403`, `:393`, `:432` |
| `lib/data/inventory.ts` | `postStockMovement` (mints GRN + ledger rows, rolls back a burnt number; `po_id`/`payment_id` optional), `addStockIn` | `:290`, `:385` |
| `lib/data/inventory.ts` | `getInventory` (whole screen in one pass; returns `deliveries` + `expenseQueue`), `getProjectInventory`, `stockLevels`, `listGrns` | `:506` (`:489`,`:490`), `:769`, `:402`, `:418` |
| `lib/data/inventory.ts` | `createWarehouse`, `assertWarehouseBelongsToProject` (server-side project check), `searchCatalogueItems` | `:142`, `:232`, `:866` |
| `lib/data/inventory.ts` | `DeliveryStockInRow` (delivered-PO queue), `ExpenseStockInRow` (`stock_in_requested` payments), close-the-loop via `stock_in_grn_id` stamp | `:469`, `:445`, `:372` |
| `app/(app)/inventory/` | the five-tab screen — `inventory-view.tsx` (37 KB), `page.tsx`, `warehouse-form.tsx`, `actions.ts`, `stock-in/stock-in-form.tsx` (20 KB). **Extend these; do not start a new screen.** | dir |
| `app/(app)/inventory/inventory-view.tsx` | the unlisted-item **red** flag (item_id=null) — "promote it in Items" | `:941-944` |
| `lib/data/config.ts` | `issueDocNumber("grn")` / `issueDocNumber("stock_issue")` — Indian-FY GRN / issue-note numbering | (config) |
| `lib/items-model.ts` + `lib/data/items.ts` `createItem` | item master, `name_key` dedupe — the catalogue `Add To Catalog` (U4) promotes into | (items) |
| `project_file_versions.storage_path` document-upload pipeline | the receipt attachment for U1 (NOT pasted URLs — see F3) | site-inventory `:180,218` |
| `lib/data/tables.ts` | `warehouses`, `stock_movements`, `grns` already registered (org-scoped) | `:39-41` |
| `scripts/verify.mjs` | inventory isolation + ledger asserts: append-only projection + transfer-nets-0 block, and warehouse/GRN isolation + `grns` has-no-qty/amount block | `:386-397`, `:1689-1844` |

**Capabilities that exist** (`lib/can-model.ts`): `inventory.warehouse.view` (`:72`),
`inventory.warehouse.create` (`:73`), `inventory.company_warehouse.view` (`:74`),
`inventory.project_warehouse.view` (`:75`), `inventory.movement.create` (`:76`), plus
`items.item.view/create` (`:70-71`). Actions map: `createWarehouseAction` →
`inventory.warehouse.create`; `addStockInAction` → `inventory.movement.create`;
`deactivate/reactivateWarehouseAction` → `warehouse.create` (can); `searchItemsAction` →
`items.item.view` (`VEYRA-SITE-INVENTORY.md:114`). There is **no** `inventory.movement.view` — a
read-only warehouse/analytics view (U7) guards on `inventory.warehouse.view`. Any NEW settings
surface needs a NEW capability key in `can-model.ts` (an unknown key fails closed for everyone) —
but none of U1–U7 introduce a settings surface, so no new capability is expected. The `Add To
Catalog` button (U4) promotes via `createItem` and so guards on `items.item.create`.

---

## PART 6 — The units (dispatch one at a time; recommended order below)

**Recommended dispatch order:** **U1 → U2 → U4** (three unblocked deltas, no owner gate) → **U3**
(only after Q2 = paired) → **U5 → U6** (needs the demo convention decided, F2/Q4) → **U7**
(optional, only if Q6 = yes). Each is sized S/M/L. New columns are additive/nullable/back-fill-null
and touch only the migration; a new table (none expected here) follows HARD RULE 3 (migration +
`lib/data/tables.ts` + org- AND project-isolation asserts in `scripts/verify.mjs`). **Totals stay
derived, the ledger stays append-only** — no unit adds a `qty`/`amount` counter to `grns`.

> Reminder for every unit below: most of the surrounding machinery is ALREADY BUILT. The agent's
> job is the thin delta, verified end-to-end. Several briefs say "confirm X is built" — per the
> mandate that confirmation is real work with `db.mjs` output, not a checkbox, and it can turn into
> a build if reality differs.

### U1 — Receipt-header parity: payment mode, receipt date, default category, attachment · S
**Already built (don't touch):** `postStockMovement`/`addStockIn` already carry `vendor_id`,
`source_doc`/invoice ref and the `payment_id` link (`data/inventory.ts:290-377`); the line grid,
GRN minting, and Confirm-Stock-In flow (INV-05) all work. **Build:** additive nullable columns on
the `grns` header — `payment_mode` (`company_account|cash`), `date_of_receipt` (date),
`default_category` (text, pre-fills each new line), `receipt_file_id` (FK to the project-document
upload — **reuse `project_file_versions` storage, NOT pasted URLs**, F3). Surface them on the
stock-in receipt header + `stock-in-form.tsx` (INV-04/05). Migration = next free slot (`ls
supabase/migrations/ | tail -1`, NOT hardcoded 0044). **Out of scope:** "Read by Daizy AI" OCR
(Q7, settled-NO) — do not add the checkbox or credits. **Verify (falsifiable):** a stock-in with a
payment mode + receipt date + default category + attached file writes those columns on the `grns`
row (confirm in `db.mjs`); the default category pre-fills a new line; the GRN still mints a number
and the ledger rows still post; totals still derive (`grns` has no qty/amount). If the document-
upload pipeline is not cleanly reusable for a GRN header, STOP and report — do not build a second
uploader.

### U2 — Stock-out reason enum + chip · S
**Already built (don't touch):** the outward movement (`direction:"out"` → Issue note,
`NOTE_KIND_LABELS.out="Issue note"`, `inventory-model.ts:393-396`); the whole stock-out flow and
document. **Build:** an additive `stock_out_reason` enum (`consumed|return|transfer`) on the
outward `grns`/movement (INV-06). Render it as a chip on the Issue note and in Transaction History
— **tones grey/amber/green with a label, NEVER red** (red is reserved for the unlisted-item flag +
negative stock, `inventory-model.ts:23-26`). Confirm Q3's three-state set with the owner first if
unsure. Migration = next free slot. **Out of scope:** a vendor-linked return document for
`Return` (Q3 later delta) — leave a note, don't half-build. **Verify:** a stock-out records its
reason on the `grns` row (`db.mjs`); the chip renders on the note and in Transaction History with a
non-red tone; an out with no reason still posts (nullable, back-fill null).

### U3 — Paired transfer (BLOCKED on Q2 = paired) · M
**Inspected this session — the real current state:** `signedQty` returns **0** for `transfer`
(`inventory-model.ts:154-160`), and the header comment says transfer "books the move without
netting a level change" (`:17-19`). So a transfer today books a movement that contributes nothing
to either warehouse's level — the destination's Goods Value does NOT rise. INV-08 proves Dzylo's
destination DID rise, so a real cross-warehouse move needs a **paired** out-leg (−) at source +
in-leg (+) at destination. **Build (only if Q2=paired):** a destination-warehouse select on the
Stock-Out dialog (shown when reason=`transfer`), plus additive `transfer_to_warehouse_id` and a
`transfer_group_id` linking the out-leg note to the in-leg note so a transfer is ONE act with two
movements (INV-06/07/08). The in-leg must be a real `direction:"in"` at the destination (so
`signedQty` gives it +qty and Goods Value rises there) — do NOT change what `transfer` means for
legacy rows; introduce the pair as the new transfer path. Surface "Transferred To Warehouse" on
the issue note (StockNote has no such field today, `:403-420` — that's the delta). **No stored
totals.** Migration = next free slot. **Verify:** a transfer of N units books an out at source and
an in at destination sharing one `transfer_group_id` (`db.mjs`); `goodsValue`/`projectStock` at the
destination RISES by N×rate and at the source FALLS by the same; the note names its "Transferred
To"; legacy `transfer` rows are untouched.

### U4 — Inline "Add To Catalog" (promote an unlisted line) · S
**Inspected this session:** the unlisted concept exists — a movement with `item_id=null` is
unlisted and shown **red** ("Not in catalogue — promote it in Items", `inventory-view.tsx:941-944`)
— but there is **no button** to promote it; the user is only told to go to Items. **Build:** an
inline `+ Add To Catalog` action on an unlisted line (in the stock-in / delivery grid, INV-11)
that calls the existing `createItem` (dedupe by `name_key`, org stamp) and rewrites the movement's
`item_id` from null to the new item's id. No schema change (reuses `items` + `name_key`). Guards on
`items.item.create`. **Out of scope:** a bulk "promote all". **Verify:** promoting an unlisted line
creates one `items` row (deduped) and updates the `stock_movements.item_id` from null to it
(`db.mjs`); the red flag clears; a second promote of the same name dedupes rather than duplicating;
`projectStock` now groups the promoted line by item_id, not by name.

### U5 — Delivery "Accept Stock" convenience wrapper · M
**Already built (don't touch):** the delivered-PO queue (`DeliveryStockInRow`, `getInventory`
returns `deliveries`, INV-09), the Pending/Recorded/Discarded lifecycle (`GRN_STATUSES`), and the
whole "book a PO into a warehouse" path — `postStockMovement({po_id})` stamps the origin order and
the PO lines seed the stock-in grid (`stock-in-form.tsx`). **Build:** ONE "Accept Stock" modal from
a queue row that (a) picks a destination warehouse, (b) pre-loads ALL of that PO's lines, and (c)
routes into the existing stock-in path (INV-10) — a convenience wrapper over machinery that already
exists, NOT a new ingestion engine. **INSPECT FIRST:** confirm the delivery→stock-in wiring is
actually reachable today and what exactly is missing (this is the "verify that turns into a build"
risk — like procurement U3); scope to the real gap. **Verify:** Accept Stock on a demo delivery PO
pre-loads its lines, books them into the chosen warehouse (one GRN, ledger rows with the `po_id`
stamped), and moves the queue row Pending→Recorded — all confirmed in `db.mjs`; unlisted lines
still flag red and are promotable (U4).

### U6 — Demo self-clearing seed + explainer-copy map + tab (i) tooltips · S/M
**Inspected this session — NOT a reuse (F2):** there is NO `is_demo` column and no self-clearing
seed pattern in the code today (grep hits only handoff docs). So this INTRODUCES the convention.
**Build:** (a) an `is_demo` convention with a "DEMO — sample, replace me" warehouse (e.g. "Main
Store") seeded with a few example rows from the video's own data (18mm Ply @ 450/Sq Ft, Decorative
Plywood @ 560/Sq Meter); the demo banner hides the moment a real warehouse/movement exists and demo
rows are excluded from real Goods Value (Q4 = auto-clear). **This convention must be SHARED with the
procurement program's U9** (same `is_demo` idea) — coordinate; do not fork two demo mechanisms.
(b) the inline-explainer copy authored ONCE as a pure vocabulary map (keyed by option, testable,
NEVER in JSX — like `prompt-library-model` VOCAB), wired to the (i) icons already on every tab
(INV-00). Copy is in `04-Inventory.pdf` §4b (Company vs Project warehouse, Goods Value, Deliveries
StockIn, Expenses StockIn, Consumed/Return/Transferred, Unlisted item, Transaction History).
**Verify:** the demo box disappears after a real row is added; demo rows are excluded from real
totals; explainers render from the map and are covered by a test.

### U7 — Warehouse Analytics tab (OPTIONAL, only if Q6 = yes) · M
**Build:** a third warehouse-detail tab (beside Inventory · Transaction History) with charts over
the SAME ledger — value over time, top items, in-vs-out (INV-03). **No new data, no new table** —
pure projections over `stock_movements` via the existing model functions. Read-only; guards on
`inventory.warehouse.view`. **Verify:** the tab renders charts whose numbers reconcile to
`goodsValue`/`movedQty` over the same movements; no new write path exists.

---

## PART 7 — Environment & verification (read before dispatching)

- **The browser pane does NOT work in this environment** (the app window is hidden/minimised → it
  can't paint, collapses to 0×0, screenshots time out). Verify app rendering with **node fetch +
  the session cookie** (HANDOFF-V10 §5.3), which is reliable:
  ```
  node -e "fetch('http://localhost:3010/inventory',{headers:{cookie:'veyra_acting_member=ae9569dc-c875-4d80-9129-ca83d169b396'}}).then(r=>{console.error('STATUS',r.status);return r.text()}).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').replace(/(\s*\|\s*)+/g,' | ').slice(0,3000)))"
  ```
  A page requires the cookie or it 307s to `/login`. `Loading…` is the skeleton's sr-only label,
  not a stall. Server logs: `preview_logs`. If the owner brings the app window forward, the
  screenshot pane may start working — but the fetch method is enough.
- **Never trust the pane for writes** — verify every write in `db.mjs` and the server log.
- **DB:** `node scripts/db.mjs sql "<query>"` (never the Supabase MCP — rule 11). Migrations:
  `node scripts/db.mjs migrate` is **owner-run**, show the migration first. Local reads/writes hit
  the SAME Supabase project as production, so a migration is live the moment it is applied.
  **Migration numbers are not hardcoded** — run `ls supabase/migrations/ | tail -1` and take the
  next slot (F1: procurement + project programs reserve slots on this branch).
- **Demo tenant** `d46a53af-58b1-4ed7-87be-c675e5803802` (`Veyra Demo Interiors`), project
  **Malviya Nagar 3BHK** `c1d3b37a-9c0c-4263-bfd1-431b935d0597`. Owner **Aditi Pradhan**
  `ae9569dc-c875-4d80-9129-ca83d169b396` (use her cookie for full-permission verification).
  Warehouse **Head Office Store** `cf91eefd-a6d3-42b2-b724-18311160cc87`. Demo vendors: Century Ply
  `466eca5f-a4a5-4170-970e-ceb8978320c6`, Hettich `e7e39271-358f-4147-a9a8-e2984e003a2e`. **Always
  filter `org_members` by `org_id`** — demo names repeat across tenants (four "Rahul Verma"s).
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
  remote storage — re-run before believing a failure. Baseline: Part 2 (re-establish exact counts
  once before the first dispatch and hold them).
- **Restore point** exists (tag `snapshot/pre-chatgpt-2026-09-10`, commit `3804e23`) — re-run its
  RESTORE manual before a session that will touch data if the owner wants a clean rollback.

---

## PART 8 — NOT building (said out loud)

- **Daizy AI receipt-reading (OCR)** — the "Read by Daizy AI" checkbox + credits (INV-04). An AI
  feature outside VEYRA's current scope; the designer types the lines (Q7, settled-NO).
- **"Smart Actions" / "Ask Gemini" and any AI-authored quantity, rate or valuation** — HARD RULE 1.
  No value on any inventory screen is ever an LLM output.
- **An inventory valuation method (FIFO / weighted-average)** — a parked finance decision; Goods
  Value stays ledger arithmetic until the owner chooses one (Q1). If chosen, it is its own program.
- **The competitor's dense multi-column tables** — keep the information, drop the density (standing
  instruction).
- **A second ledger, warehouse model, GRN document, or numbering scheme** — all exist; extend,
  don't fork. No unit adds a stored `qty`/`amount` counter to `grns`.

---

*Next step after the last unit: split the report into the two repo files the method calls for —
`FRAME-REGISTER-DZYLO-INVENTORY.md` (Part A evidence, INV-00..12) and `PLAN-DZYLO-INVENTORY.md`
(Part B instruction) — from `dzylo-research/04-Inventory.pdf`, and persist the frames so a new chat
can open them by id.*
