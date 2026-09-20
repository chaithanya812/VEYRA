-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Item Master: Good Type taxonomy axis (v1)
-- ════════════════════════════════════════════════════════════════════════════
-- The catalogue already has two axes:
--   `type`     — closed system enum (material|service|labour|machine|module).
--                Downstream modules branch on this. Dzylo's item form labelled
--                it "Goods Type"; it is NOT a free-text merchandising class.
--   `category` — free-text product grouping (Plywood, Hardware, Laminate, …).
--                Already present; this migration does not add or rename it.
--
-- Owner decision Q5 asked for Category AND Good Type as two separate taxonomy
-- axes, both free-ish text with a suggested vocabulary (no lookup table).
-- `good_type` is that second merchandising axis: Raw Material, Consumable,
-- Finished Good, Trading, … — independent of `type` and of `category`.
--
-- Nullable on purpose: every existing item predates the column and MUST keep
-- working with NULL. No backfill. Last price is derived from stock_movements
-- at read time and is deliberately not a column here.
--
-- ⛔ RLS OFF — owner decision; NO policies are created anywhere in this file.
--   Isolation stays in application code via lib/data/with-org.ts. `items` is
--   already on the tenant allowlist; a new column is not a new table.
--
-- Additive migration; idempotent (`if not exists`).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.items
  add column if not exists good_type text;

create index if not exists idx_items_org_good_type
  on public.items(org_id, good_type);
