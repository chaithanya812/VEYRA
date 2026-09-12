# HANDOFF — Dzylo Procurement chain (orchestrator + sub-agent program)

**Read `HANDOFF-V10.md` first for the standing rules** (Part 3 rules, Part 4 reuse index,
Part 5 gates/verify/deploy). This file is the *program plan* for finishing VEYRA's
procurement chain against the Dzylo "End-to-End Procurement" video. It is written for an
ORCHESTRATOR that dispatches `veyra-unit` sub-agents one unit at a time.

Working dir: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM` · Branch:
`quotations-v2-plus-fleet` · Evidence: `dzylo-research/03-Procurement.pdf` (PROC-00..23) and
`dzylo-research/VEYRA-SITE-INVENTORY.md`.

---

## PART 0 — Paste this to start a fresh orchestrator session

```
Read HANDOFF-DZYLO-PROC.md in full, then HANDOFF-V10.md Parts 3-5. You are the
ORCHESTRATOR for the Dzylo procurement program — a HANDS-ON reviewing engineer, NOT
a ticket-passer. You do not write feature code, but you own the quality of every
unit as if you wrote it. A sub-agent that says "done, gates green" is an INPUT to
your review, never the end of it.

For EACH unit you run this loop (Part 1 has the full mandate):
1. INSPECT FIRST yourself. `git log --oneline -8` + read the real files the unit
   touches, with file:line receipts. Confirm what is actually built vs missing —
   do NOT trust the brief's "already built"/"gap" claims (they were wrong for U3,
   which looked like "verify" but was a real build). Tighten the brief to the REAL
   gap before dispatching. Never dispatch a loose brief.
2. DISPATCH ONE veyra-unit sub-agent (never in parallel) with the tightened brief.
3. REVIEW HARD when it reports back: read the FULL diff line by line, RE-RUN all six
   gates yourself, verify every WRITE in db.mjs and every screen via node-fetch +
   cookie (the browser pane can't paint — Part 7). Never take "green" on faith. If
   anything is off, send it back or fix the dispatch — do not commit slop.
4. COMMIT locally yourself (agents never commit) with a why-shaped message. Never
   push or deploy (rule 10). Then update this file's Part 2 and go to the next unit.

Ask me before a unit only if its brief has a genuine open choice (e.g. F2 freight,
which gates U5/U6). Otherwise decide per the Part 3 heuristic and proceed.

Start by INSPECTING the current state (git log + read the U3 files) and tell me what
you actually found before dispatching anything.
```

---

## PART 1 — The method (orchestrator ↔ veyra-unit)

This mirrors HANDOFF-V10 §1.4–1.6, specialised for this program.

> **ORCHESTRATOR MANDATE — read this before you dispatch anything.**
> You are a senior engineer who happens to delegate the typing, not a router that forwards
> tickets. You are accountable for every line that lands as if you wrote it. Concretely, on every
> unit you personally: (1) **inspect the real code first** and rewrite the brief to the actual gap —
> the U3 brief in this very file was wrong until an orchestrator read the code and found the
> "acceptance queue" was really just a receipt log; assume the other briefs can be wrong too;
> (2) **read the sub-agent's entire diff** and reject hand-waving, dead code, rebuilt engines, or
> unguarded actions; (3) **re-run all six gates yourself** and **re-verify writes in `db.mjs` and
> screens via node-fetch** — a sub-agent's "gates green, verified" is a claim to check, not a fact to
> trust (this project's history: "a green test that examined nothing is the worst outcome");
> (4) **only then commit.** If you find yourself pasting a brief and waiting, you are doing it wrong.

- **The orchestrator does not write feature code.** But it inspects, reviews, gates, and commits —
  hands on the code the whole time.
- **`veyra-unit` sub-agents build.** Each gets ONE self-contained brief (Part 6), writes the
  data layer + action + screen + tests, runs the six gates, verifies against the running app,
  reports, and **stops without committing**. The agent starts cold — the brief must be complete.
- **One at a time, by address, never in parallel.** Parallel writers on one codebase is how you
  get two implementations of the same arithmetic — this project's most common defect. `Explore`
  is the only parallel-safe agent (read-only fan-out).
- **The orchestrator commits.** After the agent reports and you re-confirm the six gates, commit
  with a message that says WHY the shape is what it is (the commit log is the design record).
- **Every sub-agent's non-negotiable protocol** (the briefs are deliberately not exhaustive — this
  protocol is what makes a terse brief safe):
  1. **INSPECT FIRST, with receipts.** A brief's "already built" / "gap" claims are the orchestrator's
     best knowledge, NOT ground truth. Before writing anything, grep/read the named files and confirm
     the ACTUAL current state (cite `file:line`). If reality contradicts the brief — something is
     already done, or a "finish" turns out to be a "build" (this happened on U3) — say so in the
     report and adjust scope to the real gap rather than blindly building or blindly skipping.
  2. **Build only the gap.** Reuse the Part 5 index; never re-implement an engine/table that exists.
  3. **VERIFY FALSIFIABLY, both halves.** Run all six gates (Part 5.1) and hold the baseline. Verify
     app rendering with node-fetch + cookie (Part 7 — the browser pane can't paint here). Verify every
     WRITE in `db.mjs`, never in the pane. Hit each of the brief's VERIFY bullets with actual output —
     a green gate that examined nothing is the worst outcome (HANDOFF-V10 §Tests).
  The orchestrator RE-RUNS the six gates and reviews the diff before committing — it does not take the
  agent's word for green.
- **Dispatch prompt template** for each unit:
  ```
  You are implementing ONE unit on VEYRA. Working dir + branch as in HANDOFF-DZYLO-PROC.md.
  Dev server is running at http://localhost:3010. READ FIRST: HANDOFF-V10.md (rules Part 3,
  reuse Part 4, gates Part 5) and HANDOFF-DZYLO-PROC.md Part 1 (your protocol), Part 5 (reuse),
  Part 7 (env/verify).
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

**The whole chain is BUILT** (17 tables, 4 state-machine models, landed-cost L1/L2/L3 ranking,
proxy bid entry, derived partial-delivery, append-only stock ledger). This program VERIFIES and
FILLS GAPS — it is not a from-zero build. See `dzylo-research/03-Procurement.pdf` Part B§1 for the
receipts.

**Done & committed (local, not pushed):**
- `bff06eb` — `lib/procurement-chain.test.ts`: pure chain test composing the real engines
  MR→RFQ→PO→GRN→stock over the demo's real figures.
- `ce44934` — `lib/procurement-chain.live.test.ts` (opt-in `U1_LIVE=1`, gated out of the default
  suite) + `vitest.config.mts` (`@/` alias + `server-only` stub in `test/`) + `test/server-only-stub.mjs`.
  This is **U1**: it drove a live MR→RFQ→award→PO→partial-receipt→GRN→stock flow through the app's
  real data layer, tagged `[U1-TEST]`, verified every hop vs `db.mjs` and on `/orders`.

**U1 result:** the chain reconciles end-to-end. `awardRfq` correctly stamps `awarded_vendor_id`;
`poAmount`=96,300; `deriveOrderState`→partially_delivered; GRN posted +40/+10 to the ledger.

- `40fb0b0` — **U2**: RFQ detail add-vendors dialog + remove-vendor control (`addVendorsToRfq` /
  `removeRfqVendor` in `lib/data/rfq.ts`; guarded actions; red destructive remove). Gates re-confirmed
  by the orchestrator before commit.

**Next unit: U3.** (Always `git log --oneline -8` first — this plan is idempotent.)

**Baseline nothing may lower** (HANDOFF-V10 §2): `tsc 0 · eslint 0 · 896 tests (895 pass + 1
skipped live drive) · verify 208/208 · verify-storage 11/11 · build clean`. Migrations applied
0001–0043; **next free number 0044**.

---

## PART 3 — Decisions (owner, settled 2026-09-12 — do not re-open)

Heuristic the owner gave: *best for everyone · more features · dedicated not merged.*

- **Q1 Vendor portal auth** → a **signed token website link** (a public URL the vendor clicks to
  view the RFQ and bid), plus copy-link and email. **NO phone/OTP. NO WhatsApp** (settled-NO).
- **Q2 PO payment-plan / T&C** → **SEPARATE** `po_payment_plans` (+ FK milestone child) **and** a
  **separate PO T&C** library. Do NOT generalise `quotation_terms`.
- **Q3 Quote→procurement** → support **BOTH** MR→PO (as today) **and** direct quote→PO import,
  including **negative-margin %**.
- **Q4 Ad-hoc receipts** → **allow** "Receive Ad-hoc" (a receipt with no PO line) as its own mode,
  alongside PO-traced receipts. Still posts a GRN so stock stays traceable.
- **Q5 Material-catalog taxonomy** → **Category AND Good-Type** as two separate columns; the
  starter library is **one shared read-only sample** the tenant imports (not per-tenant seeded).
- **Q6 Inventory valuation** → **keep ledger-arithmetic Goods Value** (no FIFO / weighted-average —
  that is a parked finance decision).
- **Q7 Demo data** → seed with `is_demo=true`, **auto-clear** the "DEMO — sample" box the moment a
  non-demo row exists, exclude demo rows from real document totals. Seed: catalog categories, PO
  payment plans, PO T&C.
- **Q8 Approvals + red** → **reuse** the generic `approval_rules` / `approval_requests` (threshold +
  role). **Reject earns reserved red** (destructive/cancel job); a "Not initiated" payment stays grey.

---

## PART 4 — Findings from U1 (fix as noted)

- **F1 (demo-data lie).** The *seeded* RFQ `3c3a751f` is `status=awarded` with `awarded_vendor_id=null`
  → renders "Unknown vendor". The real `awardRfq` (`lib/data/rfq.ts:549`) DOES stamp it (proven in
  U1). Fix = backfill the demo row (fold into U9 demo-data work, or a one-line `db.mjs` update).
- **F2 (open design question — needs owner before U5/U6).** Bids are ranked on landed cost
  **including freight**, but the PO amount **excludes** freight (`po_lines` has no freight column;
  `awardRfq` copies only qty/rate/tax, `rfq.ts:560-573`). Decide: fold freight into the PO, add it
  as a line, or accept it is dropped. Whatever is chosen, the PO PDF (U5) must be consistent.
- **F3 (report inaccuracies — fix when splitting the report to repo files).** `po_receipts` has NO
  `grn_id` (the links are `grns.po_id` and `stock_movements.grn_id`); `rfq_bid_lines` uses
  `tax_pct` not `tax`.

---

## PART 5 — Reuse index (procurement-specific — do not rebuild)

Everything here is checked and present. HANDOFF-V10 Part 4 has the app-wide index.

| Reuse | For |
|---|---|
| `lib/material-requests-model.ts` | `MR_STAGES`, `MR_ITEM_STAGES`, `stageBreakdown`, `procurementTotals`, `requestProgress`, `PROC_TABS` |
| `lib/rfq-model.ts` | `RFQ_STATUSES`, `RESPONSE_STATUSES`, `BID_ENTRY_MODES=[portal,proxy]`, `landedLineTotal`, `rankBids` (tie-safe), `isBidDeadlinePassed` |
| `lib/po-model.ts` | `ORDER_STATES`, `PAYMENT_STATES`, `PO_TYPES`, `poAmount`, `lineTotal`, `deriveOrderState`, `isDeliveryOverdue` |
| `lib/inventory-model.ts` | `projectStock`, `goodsValue`, `movedQty/Amount`, `buildWarehouseTree`, `INVENTORY_TABS`, `signedQty` |
| `lib/data/rfq.ts` | `createRfq`, `createRfqFromMr`, `enterBid`, `awardRfq`, `getRfq`, `bidComparison`, `vendorNames` |
| `lib/data/purchase-orders.ts` | `createPurchaseOrder`, `recordReceipt`, `updateOrderState/PaymentState` |
| `lib/data/inventory.ts` | `addStockIn`, `stockLevels`, `listGrns`, GRN types |
| `lib/data/vendors.ts` | `listVendors(filter)` (vendor picker source) |
| `lib/data/config.ts` | `issueDocNumber` / `previewNextNumber` (Indian-FY numbering — PO/GRN numbers) |
| `lib/quotations-pdf.ts` | jsPDF quote renderer — **clone its structure** for the PO PDF (U5) |
| `lib/data/quotations.ts` `getSharedQuotation` + `app/q/[token]/page.tsx` | the ONLY public route — **mirror it** for the vendor portal (U4) |
| GST: `computeGstTotals` / `splitGst` · comments: `entity_comments` (orders is already an entity_type) · audit: `recordAudit` · approvals: `approval_rules`/`approval_requests` | reuse, do not reinvent |
| `components/ui/primitives.tsx`, `patterns.tsx`, `button.tsx` (asChild), `saved-views.tsx` | UI vocabulary |

**Capabilities that exist:** `procurement.rfq.view/create`, `procurement.po.view/create/approve`,
`inventory.warehouse.create`, `inventory.movement.create`, `items.item.view/create`,
`settings.workspace.edit`. There is **no** `rfq.delete` / `po.delete` — destructive RFQ/PO controls
guard on the matching `.create` (or `.approve`) capability. A NEW settings surface (U5/U6) needs a
NEW capability key added to `lib/can-model.ts` — an unknown key fails closed for everyone.

---

## PART 6 — The units (dispatch one at a time; recommended order below)

**Recommended dispatch order:** U2 → U3 → U4 → **U6 → U5** (U5's PDF renders U6's plan/T&C, so
build U6 first) → U7 → U8 → U9. Each is sized S/M/L. New tables follow HARD RULE 3 (the migration +
`lib/data/tables.ts` + org- AND project-isolation asserts in `scripts/verify.mjs`); rich per-line
data is an FK child table, never jsonb (zero jsonb precedent in this repo).

### U2 — RFQ detail: add vendors mid-RFQ + remove an invited vendor · S
**Already built (don't touch):** the vendor list, L1/L2 `ComparisonMatrix`+`rankBids`, proxy
`enter-bid-form.tsx`, award flow. **Build:** `addVendorsToRfq(rfqId, vendorIds[])` and
`removeRfqVendor(rfqId, vendorId)` in `lib/data/rfq.ts` (refuse when awarded/closed; refuse remove
when the vendor has any `rfq_bids` — their quote is part of the record; dedupe on add). Actions in
`app/(app)/rfq/actions.ts` (`addVendorsToRfqAction` → `requireCan("procurement.rfq.create")` first;
`removeRfqVendorAction` → `can("procurement.rfq.create")` first). UI on `app/(app)/rfq/[id]/page.tsx`
Vendors tab, shown only when not awarded/closed: an "Add vendors" client dialog (uninvited active
vendors, checkbox multi-select mirroring `new-rfq-form.tsx`) and a per-row Remove (reserved RED,
only for vendors with no bids). **Out of scope:** Copy Form Link + resend-for-revision → U4.
**Verify:** create a `[U2-TEST]` draft RFQ; add inserts `rfq_vendors`, remove deletes one, remove
refused once a bid exists — confirm in `db.mjs`; controls hidden on the awarded demo RFQ.

### U3 — Delivery acceptance QUEUE + ad-hoc receipts · M (this is a BUILD, not a verify)
**Inspected 2026-09-12 — the real current state (receipts):**
- The Deliveries tab today renders `DeliveryTable` at `app/(app)/projects/[id]/procurement/procurement-view.tsx:775`
  — a **flat receipt LOG** (columns Received-on · Order · Vendor · Note). It is NOT a status queue:
  **no Pending/Partial/Accepted chips, no PO-vs-WO split.** Its empty state points the user to the
  Orders tab to record a receipt. `data.deliveries` comes from `lib/data/project-procurement.ts`.
- Receipt recording WORKS and lives on `/orders/[id]` via `receive-goods-form.tsx` → `recordReceipt`
  (`lib/data/purchase-orders.ts:251`), which recomputes + stores `order_state` via `deriveOrderState`.
  Ingestion→GRN→stock WORKS via `/inventory/stock-in` → `addStockIn` (`lib/data/inventory.ts:385`,
  `po_id` is optional). BOTH proven end-to-end in U1 — do NOT rebuild them.
- `recordReceipt` REQUIRES every receipt line to match a `po_line` ("Receipt references a line that
  does not belong to this order") — so **ad-hoc (no-PO) receipts do not exist yet.**

**Build:**
1. Turn the Deliveries/Acceptance tab into a **QUEUE over `purchase_orders`**: rows = POs, a status
   chip derived from `order_state` (created→**Pending**, partially_delivered→**Partial**,
   delivered→**Accepted**; grey/amber/green — chips never red), and **filter chips Pending · Partial ·
   Accepted** resolved from the URL on the SERVER (not a useEffect). Split **Purchase Orders vs Work
   Orders** (`type`), matching Dzylo's two sub-views. Each row links to `/orders/[id]` to receive.
   Keep the "what was received" info reachable (the current receipt-log becomes the Accepted detail /
   an expandable row) — do not lose it. DECISION (not a menu): the tab BECOMES the status queue; the
   flat log is folded in, not shown as the whole tab.
2. **Ad-hoc receive (Q4):** a "Receive Ad-hoc" entry from the queue that records a delivery with no PO
   line — implement as an ad-hoc `addStockIn` with `po_id: null` (it already supports this) that still
   posts a GRN. Do NOT loosen `recordReceipt`'s PO-line integrity for PO-traced receipts; ad-hoc is a
   SEPARATE path (Q-decision: dedicated, not merged).
**Out of scope:** photos-on-receipt upload (needs a real storage pipeline; site/design still use
pasted URLs) — note it, don't half-build. Do not touch `receive-goods-form.tsx`, `recordReceipt`,
`addStockIn` internals — they work.
**Verify (falsifiable):** the queue lists the demo PO(s) with the right chip; a partial then a
completing receipt on `/orders/[id]` moves a PO Pending→Partial→Accepted in the queue; the PO/WO
filter and status filters resolve from the URL and change the rows; an ad-hoc receive posts a GRN +
`stock_movements` with NO `po_id`, confirmed in `db.mjs`; `projectStock` reflects it.

### U4 — G1 Public vendor bid portal (signed token link) · L
**Decision Q1:** signed token link + copy-link + email; NO OTP, NO WhatsApp. **Build:** a tokenised
public route mirroring `app/q/[token]/page.tsx` + `getSharedQuotation` — e.g. `app/rfq-bid/[token]/`
— that shows the RFQ header + line grid and lets an invited vendor submit a per-line bid, writing
`rfq_bids`/`rfq_bid_lines` with `entry_mode='portal'` and a version bump on re-submit. Add a
`share_token`/`share_enabled` to `rfqs` (or per `rfq_vendors`) via migration 0044 if not present
(check first). **Build the bid-line form ONCE** and mount it in BOTH the portal and the internal
proxy entry (`enter-bid-form.tsx`) — one component, two hosts. Wire "Copy Form Link" on the RFQ
detail (the U2-deferred piece). **Rules:** no LLM touches a rate — the vendor types every number; the
public route must scope strictly by token, never leak other tenants' data. **Verify:** open the token
URL with NO session cookie (must render), submit a bid, confirm `rfq_bids.entry_mode='portal'` and a
version bump on re-submit in `db.mjs`; an invalid/disabled token is refused.

### U6 — G4 PO payment-plan + T&C library · M  (build BEFORE U5)
**Decision Q2:** separate libraries. **Build:** migration 0044/0045 — `po_payment_plans`
(name, is_demo) + `po_payment_plan_milestones` (FK child: label, pct, sort) and `po_terms`
(name, body, is_demo) — org-scoped, registered in `lib/data/tables.ts`, isolation asserts in
`verify.mjs`. A Settings card (new capability key, e.g. `settings.procurement.edit`, added to
`can-model.ts`) to CRUD plans + terms. Selectors on the PO builder (`orders/new`) to attach a plan +
a T&C entry. **Amounts derive at render:** plan milestone % × PO amount, never stored (rule 6).
**Out of scope:** applying a plan to actually schedule payments in the ledger — this is display/PDF
content for now. **Verify:** a plan's milestones sum to 100%; on a PO the rendered rows = pct × amount
and reconcile to the PO total; demo plans (RESIDENTIAL 25/45/30 etc.) seed with `is_demo=true`.

### U5 — G2+G3 PO PDF + template config · L  (needs U6)
**Build:** `lib/po-pdf.ts` cloning `lib/quotations-pdf.ts` structure — company header, shipping +
vendor billing addresses, line table, amount summary (`poAmount` + `splitGst`/`computeGstTotals`),
the payment-plan block (from U6, derived), the T&C block (from U6), bank details, Indian-FY PO number
(`issueDocNumber`). Plus a tenant PO-template config: ONE new org-scoped table (logo/banner/footer/
signature uploads, enable-columns, section toggles) + a Settings card + Preview. **Respect F2** —
the PO amount/PDF must be consistent with whatever freight decision the owner makes. **Keep it lean:**
Dzylo's dense 12-column PO is exactly the density to drop (standing instruction). Images are uploads,
never generated. **Verify:** render a PO PDF for the demo PO; the totals on the PDF equal the PO's
`amount` + GST split and the payment rows reconcile; column/section toggles change the output.

### U7 — g5 Material catalog: Category + Good-Type + starter import + inline create-item · M
**Decision Q5.** **Build:** two nullable columns on `items` (or a small lookup) — `category`,
`good_type`; a shared read-only starter sample the tenant imports per category (reuse
`lib/items-csv.ts` bulk path); inline "create catalogue item during stock-in" reusing `createItem`
(dedupe + org stamp) so a receipt never invents a silent free-string item (this is where
inventory-model's "red = unlisted item" alert legitimately fires). "Last Price" derives from the
newest `stock_movements.unit_rate`, never stored. **Verify:** import seeds N items in a category;
stock-in of an uncatalogued item creates it then confirms stock; category/good-type render + filter.

### U8 — g5 Quote→PO import + in-app procurement notifications · S/M
**Decision Q3.** **Build:** a quote→PO importer mapping an approved quotation's lines to `po_lines`
with an optional negative-margin % (strip markup off the quoted rate to get the buy rate —
deterministic arithmetic on a user-entered %, fine under rule 2). Plus an in-app procurement
notification kind (PO created / approved / rejected) on the EXISTING notification surface — in-app
only, no push/WhatsApp; "Pending Approval" is a filtered view, not a new table; approvals reuse
`approval_rules`/`approval_requests` (Q8). **Verify:** importing a quote drafts a PO whose lines +
amount match the quote (less margin); approving/rejecting a PO emits the in-app notification.

### U9 — Demo self-clearing + inline explainer boxes + F1 backfill · S
**Decision Q7.** **Build:** an `is_demo` convention with a shared "DEMO — sample, replace me" box that
hides the moment a non-demo row exists and excludes demo rows from real totals, adopted across the
config lists (catalog categories, PO payment plans, PO T&C). Author the inline explainer copy ONCE as
a pure vocabulary map (like `prompt-library-model` VOCAB), keyed by option, testable, never in JSX —
the copy is in `dzylo-research/03-Procurement.pdf` Part B§4b (Place of Supply, RFQ vs fill-for-vendor,
Resend for revision, L1/L2/L3, PO vs WO, order vs payment state, partial delivery, company vs project
warehouse, Good Type, negative margin, GRN/Goods Value). Also **fix F1** — backfill the seeded RFQ's
`awarded_vendor_id`. **Verify:** the demo box disappears after a real row; explainers render from the
map and are covered by a test.

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
  `ae9569dc-c875-4d80-9129-ca83d169b396` (use her cookie for full-permission verification). Demo
  vendors: Century Ply `466eca5f-a4a5-4170-970e-ceb8978320c6`, Hettich `e7e39271-358f-4147-a9a8-e2984e003a2e`.
  Warehouse Head Office Store `cf91eefd-a6d3-42b2-b724-18311160cc87`. **Always filter `org_members`
  by `org_id`** — demo names repeat across tenants (four "Rahul Verma"s).
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
  remote storage — re-run before believing a failure. Baseline: Part 2.
- **Restore point** exists (tag `snapshot/pre-chatgpt-2026-09-10`, commit `3804e23`) — re-run its
  RESTORE manual before a session that will touch data if the owner wants a clean rollback.

---

## PART 8 — NOT building (said out loud)

- WhatsApp notifications/ingestion; the whole Integrations row (Zoho Books, Dzylo Dialer, Voice API,
  AI Chat Agent, Automations, Webhooks) — all settled-NO (HANDOFF-V10 Part 8). Ship email + in-app +
  copy-link only.
- Any AI-authored number or rate — AI structures, never prices (rule 2).
- 2D→3D renders / generated item images — thumbnails are uploads or a neutral icon.
- Dzylo's dense 12-column PO / matrix look — keep the information, drop the density.
- A second quotation engine, GST engine, or numbering series — all exist; the PO PDF reuses them.
- Phone/OTP vendor auth (Q1).

---

*Next step after the last unit: split the report into the two repo files the method calls for —
`FRAME-REGISTER-DZYLO-PROC.md` (Part A evidence) and `PLAN-DZYLO-PROC.md` (Part B instruction) — from
`dzylo-research/03-Procurement.pdf`, and persist the frames so a new chat can open them by id.*
