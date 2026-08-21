# VEYRA — design direction

The owner's brief, made buildable: **white background, black text, red accents.**
This file is the reference every screen is designed against, and a first-class
section of PLAN-v0.2.

---

## 1. The palette

| Token | Value | Used for |
|---|---|---|
| `--surface` | `#FFFFFF` | Page and card background. The default everywhere. |
| `--surface-sunken` | `#F7F7F8` | Table zebra, sunken panels, page gutter. Barely-there. |
| `--border` | `#E6E6E9` | Hairlines, dividers, input borders, table gridlines. |
| `--border-strong` | `#CFCFD4` | Focus-adjacent borders, hovered rows. |
| `--text` | `#17171A` | Body copy, table cells, headings. Near-black, not pure `#000`. |
| `--text-secondary` | `#6B6B73` | Labels, meta, timestamps, helper text. |
| `--text-disabled` | `#A6A6AD` | Disabled controls, placeholder text. |
| `--red` | `#D6122B` | **The accent.** See the closed list below. |
| `--red-hover` | `#B00E23` | Hover/active on red controls. |
| `--red-tint` | `#FDECEE` | Red-tinted backgrounds: active nav pill, alert row wash, selected chip. |
| `--green` | `#137A3F` | The *only* non-red status colour: paid, in-stock, approved, on-time. |
| `--amber` | `#9A6700` | Warning / pending, used on text+icon, sparingly. |

Greens and ambers exist because a procurement ERP has genuinely different
states (paid vs overdue, in-stock vs out) and forcing them all into red destroys
the signal. But red is the brand; green/amber are status semantics only, never
decoration.

## 2. Red gets a closed list of jobs

This is the rule that makes a red-accented product work. A UI where red appears
everywhere reads as an all-alarm UI and red stops meaning anything — it is the
single most common failure of red-brand products. Red is allowed **only** for:

1. **The one primary action per view** — `Create RFQ`, `Save`, `Send`. Secondary
   actions are outlined/ghost in black, not red.
2. **Active navigation** — the current nav item (red text + `--red-tint` pill).
3. **Destructive actions** — delete, cancel, reject (often red text on hover only).
4. **Genuine alerts** — overdue, failed, over-budget, out-of-stock, expired.
5. **The hero metric** — the one number a dashboard exists to show (pipeline
   value, cash position), not every KPI tile.

Everything else — icons, borders, secondary buttons, chart series, hover states —
is black, grey, or white. If a sixth use for red appears, it's wrong; find the
black/grey treatment instead.

## 3. Layout & density

B2B procurement/CRM screens are dense by nature (see Dzylo's bid grids, PO
tables, GRN forms). Design for information density without clutter:

- **Left rail nav**, collapsible to icons. Module → submodule. Active item in red.
- **Content max-width ~1440px** on data screens; tables may go full-bleed.
- **8px spacing grid.** Card padding 16–24px. Table row height 44px (comfortable)
  or 36px (compact toggle) — B2B users want compact.
- **One primary action, top-right** of each view. Filters top-left.
- Typography: system UI stack, 14px base for data screens, 13px table cells,
  weights 400/500/600 only. Numbers **tabular-figures** and right-aligned in tables.

## 4. Tables — the workhorse component

Half of this product is tables. Get them right once:

- Sticky header, sticky first column on wide grids. Horizontal scroll inside the
  table's own container, never the page body.
- Zebra with `--surface-sunken`; row hover `--border` wash. Selected row uses
  `--red-tint` + a 2px left red border.
- Status as a **chip** (text + dot), colour per §1. Never a full-red row unless
  it's a true alert (overdue) — see §2.
- Column controls: sort, show/hide, resize, saved views. Bulk-action bar slides
  in from the top when rows are selected.
- Numeric columns right-aligned, currency with ₹ and Indian grouping (1,00,000).
- Every table has a designed **empty state** (§6), not a blank box.

## 5. Forms

- Single column by default; two columns only for genuinely paired fields
  (from/to dates, qty/uom). Labels above inputs, `--text-secondary`.
- Required marked with a red asterisk. Inline validation on blur, error text in
  red below the field. Never rely on colour alone — always an error message.
- Sticky footer action bar (`Cancel` ghost-left, primary red-right) on long forms.
- Multi-step flows (RFQ → vendors → terms → send) get a stepper, not one giant page.

## 6. States that are usually forgotten

- **Empty:** icon + one line of what-this-is + the primary action. ("No RFQs yet
  — create one from an approved material request." + button.)
- **Loading:** skeleton rows for tables, not a spinner over the whole page.
- **Error:** inline, actionable, with a retry. Never a raw stack trace.
- **Permission-limited:** a site supervisor sees the BOQ without cost columns
  (PLAN §3.2 field-level visibility) — design the *hidden* state, don't just
  omit and leave a broken layout.

## 7. Where Dzylo's UI falls short — improve on these

From the 116-frame teardown. Each is a concrete, evidence-backed place VEYRA can look better.

- **Red is over-used and under-disciplined.** Dzylo puts coral-red on the logo, primary buttons, *and* status chips *and* nav *and* alerts. On the leads list (video-02 `07`) "Created" status is a red-pink chip while "overdue" is also red — so the eye can't tell brand-red from alarm-red. **Fix:** VEYRA's closed red list (§2) — status gets green/amber/grey, red is reserved.
- **Status chips carry no icon, only colour.** (`07`, `25`, `51`) Fails colour-blind users and photocopies. **Fix:** dot/icon + label always (§8).
- **Duplicate records shown, not merged.** The leads list (`07`) shows "Radhika rana" and "Radhika Rana" as two rows with the *same* phone. Dzylo has no visible dedupe. **Fix:** VEYRA dedupes on `phone_key` and offers merge (PLAN §6.1).
- **Free-text where a reference belongs.** MR line items allow an uncatalogued `item_code` string (`06`), caught only at stock-in (`55`). **Fix:** reference-or-flagged-adhoc at entry.
- **Dense tables with weak hierarchy.** The stock-in grid (`55`) and bid matrix (`21`) are wide with thin visual grouping; the eye works hard. **Fix:** sticky headers, zebra, section bands, right-aligned tabular numerals (§3, §4).
- **AI metering as a raw decrementing counter.** "Credits Left: 328" (`03`, `06` procurement) is opaque and resettable-looking. **Fix:** ledger-backed Used/Allowed/Remaining with a clear progress meter (REQ-04).
- **Two competing red buttons per view.** Some screens show "Import" (outlined red) next to "Raise Request" (filled red) (`06`), diluting the single-primary rule. **Fix:** one filled primary; everything else ghost/outline in black.
- **Overdue shown only as red text, easy to miss** (`51`, `19` "351 days overdue"). **Fix:** red text **+ an alert icon/chip**, and surface overdue in the next-action queue, not just inline.
- **"Old" screens left in the product.** The Settings grid still shows a "Quotation Display & Margin Settings (Old)" tile (`33`) — visible tech-debt. **Fix:** one config surface, versioned cleanly.

## 8. Accessibility floor

- Text contrast ≥ 4.5:1 (`--text` on `--surface` passes; check red-on-white for
  small text — `#D6122B` on white ≈ 5.3:1, OK for 14px+).
- Status never by colour alone — always a label or icon too.
- Focus ring visible (2px, `--red` at 40% or a solid dark ring), keyboard-navigable
  tables and menus, 44px min touch targets on mobile/site surfaces.
