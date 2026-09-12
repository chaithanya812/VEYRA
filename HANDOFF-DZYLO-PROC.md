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
ORCHESTRATOR for the Dzylo procurement program. Do NOT write feature code yourself.

Method: dispatch ONE veyra-unit sub-agent at a time, by address, NEVER in parallel
(Part 1). Before each dispatch, run `git log --oneline -8` and check the working tree
to see which units already landed — this plan is idempotent, do not redo done work.
For each unit: paste its brief from Part 6, wait for the agent's report, review it,
run the six gates yourself to confirm, then COMMIT locally (agents never commit).
Never push or deploy (rule 10). Verify app rendering with node-fetch + cookie, not the
browser pane (Part 7). Ask me before starting a unit if its brief has an open choice.

Start by telling me the current state from git log and which unit is next.
```

---

## PART 1 — The method (orchestrator ↔ veyra-unit)

This mirrors HANDOFF-V10 §1.4–1.6, specialised for this program.

- **The orchestrator does not write feature code.** It dispatches, reviews, gates, commits.
- **`veyra-unit` sub-agents build.** Each gets ONE self-contained brief (Part 6), writes the
  data layer + action + screen + tests, runs the six gates, verifies against the running app,
  reports, and **stops without committing**. The agent starts cold — the brief must be complete.
- **One at a time, by address, never in parallel.** Parallel writers on one codebase is how you
  get two implementations of the same arithmetic — this project's most common defect. `Explore`
  is the only parallel-safe agent (read-only fan-out).
- **The orchestrator commits.** After the agent reports and you re-confirm the six gates, commit
  with a message that says WHY the shape is what it is (the commit log is the design record).
- **Dispatch prompt template** for each unit:
  ```
  You are implementing ONE unit on VEYRA. Working dir + branch as in HANDOFF-DZYLO-PROC.md.
  Dev server is running at http://localhost:3010. READ FIRST: HANDOFF-V10.md (rules Part 3,
  reuse Part 4, gates Part 5) and HANDOFF-DZYLO-PROC.md Part 5 (reuse) + Part 7 (env/verify).
  [PASTE THE UNIT BRIEF FROM PART 6]
  REPORT BACK, DO NOT COMMIT: (a) files changed, (b) six-gate numbers, (c) what you verified
  in the app + db.mjs with actual output, (d) deviations. No git commit, no push, no db.mjs migrate.
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

### U3 — Delivery acceptance: finish + verify the queue and receipt→GRN→stock · M
**Already built (verified in U1):** `recordReceipt` (writes `po_receipts`+`po_receipt_lines`,
recomputes and stores `order_state` via `deriveOrderState`), `addStockIn` (GRN + `stock_movements`),
the `deliveries` tab in `PROC_TABS`, `receive-goods-form.tsx`. **Build/finish:** the acceptance
QUEUE view (Pending/Partial/Accepted filter chips mapping straight to `deriveOrderState`:
created/partially_delivered/delivered) over `purchase_orders`, Work Orders = same table
`type='work_order'`; confirm the receipt form and ingestion→warehouse→GRN are reachable from the
queue and verified against the ledger. **Ad-hoc receipts (Q4):** allow a receipt/stock-in with no PO
line as its own mode — still writes a GRN. **Out of scope:** photos-on-receipt upload if it needs a
new storage pipeline (site/design still use pasted URLs) — note it, don't half-build. **Verify:** a
partial then a completing receipt moves a PO Pending→Partial→Accepted; `projectStock` reflects the
GRN; an ad-hoc receipt posts stock with a GRN and no PO link.

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
