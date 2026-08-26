-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Quotation line measurement mode (v1)  ·  Estimation  ·  OPS-EST-002
-- ════════════════════════════════════════════════════════════════════════════
-- Adds optional measurement-mode fields to quotation_lines: the qty can be
-- DERIVED from dimensions (area L×W, elevation W×H, linear, count, lumpsum) with
-- a visible formula, while a manual override always wins. The derived qty feeds
-- the EXISTING pricing engine (computeLine) unchanged — this is a qty-derivation
-- layer in front of the engine, not a change to it.
--
-- ⛔ qty is deterministic arithmetic on user-entered dimensions (lib/measurement-
--    model.ts resolveQty) — never an LLM output (HARD RULE 4). No pricing change.
-- Additive + idempotent: nullable columns via `add column if not exists`.
-- RLS stays OFF; quotation_lines is already org-scoped via lib/data/with-org.ts.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.quotation_lines
  add column if not exists measure_mode         text,
  add column if not exists measure_length       numeric(14,3),
  add column if not exists measure_width         numeric(14,3),
  add column if not exists measure_height        numeric(14,3),
  add column if not exists measure_count         numeric(14,3),
  add column if not exists measure_qty_override  numeric(14,3);
