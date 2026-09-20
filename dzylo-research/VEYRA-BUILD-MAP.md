# VEYRA Build Map — for Modular Quotation 2.0

Read-only audit. Every claim cited `path:line`. Working dir: `VEYRA CRM`.

---

## PART 1 — Whole-app map

### Route areas — `app/(app)/**`
Server-component pages per module; each folder pairs a `page.tsx` with an `actions.ts` (server actions) and client `*-form/*-view` components. Modules present: `leads`, `pipeline`, `followups`, `quotations`, `items`, `vendors`, `projects` (with `plan`, `payments`, `site`, `labour`, `documents`, `procurement`, `report` sub-routes), `rfq`, `procurement`, `orders`, `inventory`, `finance` (`petty`, `receivables`, `payments`), `design`, `production`, `approvals`, `hr`, `communication`, `reports`, `settings` (`roles`, `users`, `workspace`, `quotations`, `numbering`), `dashboard`.

### Core domain models — `lib/*-model.ts` (client-safe, pure; NO `server-only`)
- `quotations-model.ts` — quote/section/line types + the **pure pricing engine** (`computeLine`, `computeQuoteTotals`, GST split).
- `measurement-model.ts` — derive line qty from dimensions (`resolveQty`/`deriveQty`), 5 modes.
- `items-model.ts` — item-master enums/types (`ITEM_TYPES`, `UOMS`, `GST_RATES`), `ItemRef`, bulk-import result shapes.
- `items-csv.ts` — CSV parser/validator for bulk item import.
- `scope-model.ts` — the **spine**: `ScopeItem`, tree builders (`buildScopeTree`, `orderableScope`).
- `production-model.ts` — BOM + cutlist geometry (`panelAreaSqm`, `panelBandingMm`, `effectiveQty`, `cutlistTotals`). No pricing.
- `production-nesting-model.ts` — deterministic 2D shelf bin-packing (`nestPanels`), panel stage chain/QR traceability.
- `quotation-templates-model.ts` — template (preset) types (inputs only, no money).
- `ai-boq-model.ts` — AI BOQ contract + validator (AI structures scope, never prices).
- `subscription-model.ts` — metering/limits (`remaining`, `isOverLimit`, `USAGE_METRICS`).
- `can-model.ts` — permission spine (see below).
- Others: `leads`, `pipeline`, `lead-management`, `lead-insights`, `projects`, `milestones`, `gantt`, `smartplan`, `site`, `labour`, `po`, `rfq`, `vendors`, `inventory`, `material-requests`, `finance`, `receivables`, `payments-ledger`, `petty-finance`, `hr`, `design`, `approvals`, `permissions`, `workspace`, `segments`, `saved-views`, `prompt-library`, `comments`, `interactions`, `schedule`, `project-files`, `site-photos`.

### Data layer
- `lib/data/with-org.ts` — **the one tenant-isolation accessor** `withOrg()` → `{ db, ctx }`. `db.table(name)` returns a scoped handle: `.select()` auto-filters `org_id` (`with-org.ts:103`), `.insert()` stamps `org_id` (`:107`), `.updateById`/`.deleteById` scope by `org_id`+`id` (`:114`,`:123`). RLS is OFF — this is the only isolation. Login is currently removed; context is pinned to a DEMO tenant (`with-org.ts:13`,`:57-94`).
- `lib/data/tables.ts` — the tenant-table allowlist (`TENANT_TABLES`, `tables.ts:11-130`). Quotation-relevant registered tables: `quotations`, `quotation_sections`, `quotation_lines` (`:58-60`), `quotation_templates`, `quotation_template_sections`, `quotation_template_lines` (`:63-65`), `boms`, `bom_lines`, `cutlists`, `cutlist_panels`, `nesting_runs`, `nesting_placements`, `panel_tags`, `panel_events`, `work_centers` (`:66-74`), `items` (`:23`), `scope_items` (`:92`), `quotation_terms`, `quotation_settings`, `ai_prompt_templates`, `ai_requests` (`:84-86`), `subscriptions`, `usage_events` (`:61-62`). Platform (non-org) tables: `orgs`, `app_users`, `plans` (`tables.ts:138`).

### Auth / permissions — `lib/can-model.ts`
Pure, fail-closed. A capability is `module.entity.action` (`can-model.ts:31-45`). Closed registry `CAPABILITIES` (`:51-131`); `can()` denies any unknown key even for owners (`:325-331`). Quotation caps: `quotations.quotation.view/create/approve/delete` (`can-model.ts:57-60`) — note **there is no per-line or per-feature quotation capability; `.create` covers all builder mutations**. Roles resolve through inheritance (`resolveRole`, `:278`); a 4-value tier floor (`TIER_CAPABILITIES`, `:345`) applies when a member has no role. `billing.cost.view` (`:109`) is the one column-level gate (hides cost columns). Server wrapper: `lib/data/permissions.ts` (`can`/`requireCan`).

---

## PART 2 — Quotation subsystem deep dive

### How a user adds/edits a line today
`quote-builder.tsx` renders the quote as **section-grouped tables** (`quote-builder.tsx:157-198`); each row has Edit/Delete (`:281-297`). Add/Edit opens **`line-dialog.tsx`** (a client `<Dialog>`). The dialog:
- Optional **catalogue item** picker (`ItemCombobox`, `line-dialog.tsx:211-213`) → `onPickItem` autofills title/uom/unit_price/tax_rate/hsn_sac from the `ItemRef` (`:131-141`).
- Fields captured (`LineState`, `line-dialog.tsx:35-55`): `item_id`, `title`, `section_id`, `area`, `category`, `description`, `hsn_sac`, `qty`, `uom`, `unit_price`, `discount_type`, `discount_value`, `tax_rate`, `cost_rate`, plus measurement `measure_mode`/`length`/`width`/`height`/`count`.
- **Live preview** via the same `computeLine` the server uses (`line-dialog.tsx:143-150`, `:379-390`).
- Submit builds `FormData` (`:152-179`) → `addLineAction`/`updateLineAction` (`actions.ts:283`,`:316`). Both `requireCan("quotations.quotation.create")`, zod-validate (`lineSchema`, `actions.ts:219-242`), then call `addLine`/`updateLine` in `lib/data/quotations.ts`.

The header/customer/GST meta is a separate form → `updateMetaAction` (`quote-builder.tsx:56`, `actions.ts:107`). Sections added via `addSectionAction` (`actions.ts:190`).

### `lib/quotations-model.ts` — shapes + engine
- **`Quotation`** (`:37-72`): header incl. `gst_treatment`, `works_contract`, and money snapshots `subtotal/discount_total/taxable_total/tax_total/cgst_total/sgst_total/igst_total/grand_total/cost_total/margin_total`.
- **`QuotationSection`** (`:74-79`): `id, quotation_id, title, sort_order`.
- **`QuotationLine`** (`:81-114`): flat columns — `item_id, section_id, title, area, category, description, hsn_sac, qty, uom, unit_price, discount_type, discount_value, discount_amount, tax_rate, cost_rate`, money snapshots `line_subtotal/taxable/tax_amount/line_total/line_cost`, plus **optional flat measure_* columns** (`:106-113`).
- **`LineInput`** (`:123-130`) / **`LineTotals`** (`:132-139`).
- **`computeLine`** (`:142-163`): `line_subtotal = round2(qty×unit_price)`; discount `percent` → `subtotal×value/100` else flat, **clamped to [0, subtotal]** (`:150-155`); `taxable = subtotal − discount`; `tax = taxable×rate/100`; `line_total = taxable+tax`; `line_cost = qty×cost_rate`.
- **`computeQuoteTotals`** (`:176-199`): pure sum of line snapshots; `margin_total = taxable_total − cost_total`.
- **GST**: `splitGst` (`:303-309`) halves tax into CGST/SGST (SGST absorbs rounding) or all-IGST; `gstRateSummary` (`:322-340`) groups by rate slab; `computeGstTotals` (`:343-351`) foots the summary. Treatment auto-derived from seller vs buyer state (`deriveTreatment`, `:282-290`).

**Discount/margin order** — see Q-A. **There is NO quote-level discount or quote-level margin field.** Margin is a *reported* figure only.

### `lib/measurement-model.ts`
5 modes (`:22-28`): `area`(L×W), `elevation`(W×H), `linear`(L), `count`(C), `lumpsum`(1). `deriveQty` (`:91-122`) returns `{qty, source, formula}`. `resolveQty(mode, dims, manualOverride)` (`:129-141`): a finite non-negative override **wins**, else derive. The builder re-derives qty live as dims change (`line-dialog.tsx:116-124`) and sends the qty field as `measure_qty_override` (`:171-179`). Server persists via `resolveLineQty` (`quotations.ts:394-440`) — qty is authoritatively derived server-side, never trusted from client. Measure mode is stored as **flat columns on `quotation_lines`** (migration 0022).

### `lib/production-model.ts` + `production-nesting-model.ts`
BOM: `effectiveQty = qty×(1+waste%/100)` (`production-model.ts:94-98`). Cutlist geometry reusable for a carcass engine: `panelAreaSqm = (L/1000)×(W/1000)` (`:120-124`); `panelBandingMm` sums banded edges×qty (`:131-149`); `cutlistTotals` (`:169-188`). `CutlistPanel` shape (`:51-67`) has `length_mm/width_mm/qty/grain/material/edge_l1..w2`. `nestPanels` (`nesting-model.ts:210-389`) is deterministic 2D shelf bin-packing → placements + waste%. **No pricing anywhere in production** (explicit, `production-model.ts:9-10`).

### `lib/scope-model.ts` + `scope_items` — the spine
Migration 0027 (`0027_scope_items.sql`). `ScopeItem` (`scope-model.ts:15-27`): `project_id, quotation_id, parent_id, code, name, room, uom, qty, sort_order`. **A quotation line DOES resolve to a scope item** — see Q-D. The six line tables carry a nullable `scope_item_id` FK (`0027_scope_items.sql:63-74`). Room parent (`QS:<section>`) with line children (`QL:<line>`); one-level nesting in practice (`scope-model.ts:11`).

### `lib/items-model.ts` + `items-csv.ts`
`ITEM_TYPES = material|service|labour|machine|**module**` (`items-model.ts:13-19`) — **"module" already exists as an item type.** `UOMS` 15 units (`:25-42`), `GST_RATES = 0,5,12,18,28` (`:45`). `Item`/`ItemRef` (`:48-77`). `BulkCreateResult`/`BulkItemOutcome` (`:82-90`). CSV: header-mapped, order-independent, extras ignored (`items-csv.ts:50-75`); per-row `ParsedRow.errors[]` + in-file dedupe (`:184-248`). Server `bulkCreateItems` (`data/items.ts:238-327`) routes each row through `createItem` (dedupe + org stamp), reports per-row created/skipped_duplicate/error (`:255-326`). See Q-E.

### `lib/quotations-pdf.ts` + templates
Client-side **jsPDF** (`quotations-pdf.ts:97`), renders header band, prepared-for/supply block, **section-grouped BOQ table** (`:162-237`), GST rate-wise summary + totals block (`:239-307`), works-contract note + terms (`:309-338`). **Renders ONLY presentational fields — cost/margin never reach it** (`:8`, and `[id]/page.tsx:37` omits them). No payment-plan/bank-details block — terms is free text; there is no structured payment-schedule on the quote (payment schedule lives on `milestones`/project finance, not the quote). Templates: `quotation-templates-model.ts` stores section+line **inputs only** (`:29-48`); instantiation re-derives money via the engine (`0006_quotation_templates.sql:5-7`).

### DB schema — how structured line data is stored today
`quotation_lines` (`0003_quotations.sql:81-116`) is **all FLAT columns** — no jsonb, no child config table. Migration 0022 added the **flat** `measure_*` columns (`0022_...:16-22`). Migration 0027 added the `scope_item_id` FK (`0027_...:63-64`). `quotations` header gained `seller_state/gst_treatment/works_contract/cgst/sgst/igst_total` (0004) and `source/doc_type/project_id/ref_no` (0025:31-36). **There is NO jsonb column and NO per-line child-config table anywhere in the quotation subsystem.** The nearest precedent for "rich structured detail keyed to a parent line" is the **scope_items self-referential tree** and the **production BOM/cutlist child tables**, both keyed by FK, not jsonb. See Q-B.

---

## PART 3 — Is any modular feature already present?

**No modular price engine, catalog, presets-of-components, carcass/shutter/component tables exist.** What exists and overlaps/reusable:

- **`doc_type = 'modular'` already exists** on `quotations` (`0025_quotation_studio.sql:33-34`) and is a selectable option in the New-quotation form (`new-quotation-form.tsx:165-172`). **BUT it is write-only** — nothing reads `quotation.doc_type` to branch the builder (see Q-F). A modular quote today is byte-identical to a regular one.
- **`ITEM_TYPES` includes `"module"`** (`items-model.ts:18`) — a module can already be catalogued as an item with base_rate/uom/hsn. No sub-component structure, though.
- **Measurement modes** (`measurement-model.ts`) already derive qty from dimensions with a manual override — directly reusable for module sizing.
- **Production geometry** (`panelAreaSqm`, `panelBandingMm`, `nestPanels`, `CutlistPanel`) — reusable math for a carcass/panel BOM + price engine; note it is metric mm and has zero pricing.
- **Quotation templates** = the existing "preset" concept ("3BHK Premium", `0006`), but they preset whole quote structures, not module component lists.
- **scope_items** spine — a modular line and its sub-parts could nest here (parent/child FK already supports depth).
- **`shutter`/`carcass`/`drawer`/`hinge`** appear only as free-text placeholders, AI prompt examples, and test fixtures (e.g. `data/quotation-studio.ts:49`, `ai/boq.ts:31`, production tests) — **no schema, no model**.

---

## PART 4 — Specific questions (from the code)

**Q-A. Margin/discount precedence.**
Only **two** levels exist, applied per-line inside `computeLine` (`quotations-model.ts:142-163`), in this order for each line: (1) `line_subtotal = qty×unit_price`; (2) **line discount** (`discount_type`/`discount_value`, clamped 0..subtotal, `:150-155`); (3) tax on the discounted `taxable`. Quote totals are a **pure sum** of those line results (`computeQuoteTotals:176-199`). There is **no component/item-level margin, no quote-level discount, and no quote-level margin input** — `margin_total = taxable_total − cost_total` is a *derived report figure only* (`:197`), driven by each line's `cost_rate`. `quotation_settings.default_margin_pct` exists (`0025:59`) but is only a starting default, not applied by the engine. → For Modular 2.0, a component→module→line margin cascade is **net-new**; the code is silent on multi-level margin.

**Q-B. Storing a rich per-line spec.**
Idiomatic VEYRA = **a child table keyed by FK to the parent**, NOT jsonb, NOT wide columns. Precedents: `scope_items` self-referential tree (`0027`), and BOM/cutlist child tables (`bom_lines`, `cutlist_panels`, `nesting_placements`). Flat columns are used for a *fixed small* field set (the 6 `measure_*` cols, 0022). **There is zero jsonb precedent in this codebase's schema.** So a modular line's drawers/components should be a `quotation_line_components` (or reuse `scope_items` children) child table with `org_id` + registration in `tables.ts`, accessed via `withOrg`.

**Q-C. UOM vs derived qty.**
`uom` is a plain display string stored on the line (`quotation_lines.uom`, `0003:97`; `QuotationLine.uom`, model `:94`) chosen from `UOMS` (`items-model.ts:25`). **Pricing never reads uom** — `computeLine` multiplies raw `qty×unit_price` regardless of unit (`quotations-model.ts:148`). The *derived* quantity comes from `measure_mode`+dims via `resolveQty` and is written into the same `qty` column (`quotations.ts:405-427`); uom and measure_mode are **independent** (nothing forces uom to match the mode, e.g. area mode + "nos" uom is legal). So "display Nos but internally derive area/length" is achievable today only by: setting measure_mode=area (derives area into qty) while uom="nos" — the derived number lands in qty and uom is cosmetic. There is **no separate "billing qty vs measured qty" field** — one `qty` serves both.

**Q-D. Does a line become a scope_item?**
**Yes, automatically.** On every `addLine`/`updateLine`, `syncScopeItemForLine` (`quotations.ts:558-607`) upserts a scope_item with origin code `QL:<lineId>`, carrying `name`(title), `room`(area), `uom`, `qty`, `project_id` (from the quote), and `parent_id` = the section's `QS:<sectionId>` scope item (`:578-586`). Sections create their parent scope_item in `addSection` (`:290-297`). `deleteLine` removes the derived `QL:` scope item too (`:526-544`). The spine is then consumed by `raiseMaterialRequestAction` (`actions.ts:157-167`) → `createMaterialRequestFromQuotation` (an approved quote's MR lines **are** its scope items). Carried fields: title→name, area→room, uom, qty (NOT price — scope has no money).

**Q-E. Can `items-csv.ts` be extended for a different column set?**
It is **hard-coded to the items schema**: `CsvItemValues` shape (`items-csv.ts:20-31`), `HEADER_MAP` aliases (`:50-70`), and `buildRow` validation (`:120-177`) are all items-specific. It is **not generic**, but it is a clean, copyable pattern (pure parser + `ParsedRow{index,values,status,errors[]}` result). A modular catalog import would clone this module with its own header map/validator rather than extend it. Per-row errors: collected into `row.errors[]` with `status:"error"` (`:206-244`), then surfaced by `bulkCreateItems` as `BulkItemOutcome` (created | skipped_duplicate | error, each with index+name+message) and a summary count (`data/items.ts:255-326`). Nothing is silently dropped.

**Q-F. Quotation-type concept / subscription gate?**
- **Type concept: yes but inert.** `quotations.doc_type` ∈ `regular|modular|revision|budget` (`0025:33-34`), captured at create (`new-quotation-form.tsx:165-172` → `actions.ts:95` → `quotations.ts:212`) and stored — but **no code path reads `quotation.doc_type` to change behavior** (grep: only writes + the numbering-series `doc_type`, which is an unrelated `DOC_TYPES` concept in `config.ts`/`permissions-model.ts`). Also `source` ∈ `lead|project|standalone` (`0025:31`). So a "quotation type" hook already exists to branch on — **owner decision how modular should differ; the code currently treats it identically.**
- **Subscription gate: yes.** `lib/subscription-model.ts` exists. `createQuotation` calls `guardMeteredCreate("quotations")` before minting and `recordUsage` after (`quotations.ts:141-143`,`:224`). `USAGE_METRICS` includes `quotations`, `boqs`, `cutlists`, `items` (`subscription-model.ts:22-31`) — lifetime-metered during trial. **The gate is per-create-of-a-quotation, not per-feature** — there is no existing flag to gate "modular quotations" specifically as a plan feature.

---

## Surprising / contradicts a naive competitor-UI reading
- **No quote-level discount/margin.** A competitor modular UI usually has an overall discount slider and target-margin; VEYRA has neither — discounts are per-line only, margin is display-only. Modular 2.0 must decide whether to add these net-new.
- **`doc_type='modular'` is a dead selector today** — the plumbing exists (DB + form) but the builder ignores it. Cheap hook to light up.
- **UOM is cosmetic in pricing** — no unit conversion; `qty×unit_price` regardless. A modular per-sqft engine must compute qty itself (as measurement modes already do) and cannot rely on uom to convert.
- **jsonb is never used** — despite being the "obvious" way to store a rich modular spec, the whole schema uses FK child tables. Follow that convention.
- **AI never prices** (hard rule): `ai-boq-model.ts` strips any price the model emits (`:71-101`); prices are deterministic engine/config only. A modular price calculator must be deterministic arithmetic, matching `computeLine`'s "engine computes, validator verifies" contract (`quotations-model.ts:6-8`).
- **Every line already auto-creates a scope_item** — so a modular line that expands into sub-components needs a deliberate decision about whether each component is its own scope_item child or the line stays one scope node.
