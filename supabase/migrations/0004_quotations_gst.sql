-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Quotations v2 · GST modes (place-of-supply → CGST/SGST vs IGST)
-- ════════════════════════════════════════════════════════════════════════════
-- Additive only. Adds the Indian GST supply model to the quotation header so a
-- quote can present a compliant tax breakdown (the piece Dzylo never shows):
--   • seller_state   — the seller's place of business (registered state)
--   • place_of_supply (already present) — the buyer's state
--   • gst_treatment  — intra-state (CGST+SGST) | inter-state (IGST), auto-derived
--                      from seller_state vs place_of_supply but stored + overridable
--                      (edge cases: SEZ, exports, bill-to/ship-to differences)
--   • works_contract — turnkey works-contract supply flag (SAC 9954 nature); adds
--                      a document note, does not alter the split
--   • cgst/sgst/igst_total — engine-written snapshots partitioning tax_total
--
-- The split is pure arithmetic over the existing per-line tax (lib/quotations-model.ts):
--   intra → cgst = sgst = tax/2 ;  inter → igst = tax.  Never produced by an LLM.
--
-- ⛔ RLS stays OFF (owner decision). These columns live on `quotations`, already
--    org-scoped + in lib/data/tables.ts. Idempotent (add column if not exists).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.quotations
  add column if not exists seller_state    text,
  add column if not exists gst_treatment   text    not null default 'intra',  -- intra | inter
  add column if not exists works_contract  boolean not null default false,
  add column if not exists cgst_total      numeric(14,2) not null default 0,  -- Σ CGST (intra)
  add column if not exists sgst_total      numeric(14,2) not null default 0,  -- Σ SGST (intra)
  add column if not exists igst_total      numeric(14,2) not null default 0;  -- Σ IGST (inter)
