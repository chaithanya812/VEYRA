-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Purchase Orders: optional source quotation (soft link)
-- ════════════════════════════════════════════════════════════════════════════
-- A PO can now be imported from an approved quotation. Provenance is a
-- nullable `quotation_id` on the existing header — the same shape as
-- `rfqs.mr_id` and `purchase_orders.rfq_id`.
--
-- SOFT LINK, NO FK, NO CASCADE. Deleting a quotation must never cascade away
-- a purchase order. No new table. No jsonb.
--
-- ⛔ RLS OFF — owner decision; NO policies are created anywhere in this file.
-- Additive; idempotent (`if not exists`).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.purchase_orders
  add column if not exists quotation_id uuid;

create index if not exists idx_pos_org_quotation
  on public.purchase_orders(org_id, quotation_id);
