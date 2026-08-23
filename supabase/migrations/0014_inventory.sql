-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Inventory: Warehouses · Stock Movements · GRNs (v1)
--   FEATURE-REGISTER PROC-WH-001/002 · PROC-GRN-001
-- ════════════════════════════════════════════════════════════════════════════
-- Stock is recorded as an APPEND-ONLY LEDGER of movements (in | out | transfer).
-- There is deliberately NO stock-level column anywhere: current stock is a
-- PROJECTION over the ledger (SUM of signed qty per item per warehouse),
-- computed in lib/inventory-model.ts (projectStock) — never a stored counter.
-- This mirrors the REQ-04 ledger idea and keeps every level auditable to its
-- source entries.
--
-- Stock-in captures HSN + GST% per line; a GRN is the posted record of a
-- receipt against a warehouse (optionally a PO). `unit_rate` and `gst_pct`
-- are CONFIG entered by the user — never an LLM output (PLAN §8). Stock value
-- is a pure computation over these config numbers, never produced by an LLM.
--
-- Unlisted items: item_id is nullable — an unmatched label keeps item_id null
-- and stays FLAGGED in the UI (red) so it can be promoted into the catalogue
-- (same reference-or-flagged pattern as material_request_items, PROC-MR-003).
--
-- ⛔ RLS stays OFF (owner decision). org_id on every row; isolation enforced
--    only in application code via lib/data/with-org.ts. Tables are added to
--    the tenant allowlist in lib/data/tables.ts. Additive migration; idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Warehouses ──────────────────────────────────────────────────────────────
create table if not exists public.warehouses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  name          text not null,
  project_label text,                                 -- optional free label ("Malviya Nagar site")
  address       text,
  is_active     boolean not null default true,        -- soft-deactivate instead of delete
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- ── Stock movement ledger (append-only — the single source of truth) ────────
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,

  item_id       uuid references public.items(id),     -- catalogue ref; null = unlisted item…
  item_name     text not null,                        -- …but the label is ALWAYS kept (flagged)
  warehouse_id  uuid not null,                        -- → public.warehouses(id)
  direction     text not null default 'in',           -- in|out|transfer

  qty           numeric(14,2) not null default 0,
  uom           text,                                 -- unit of measure for this entry
  unit_rate     numeric(14,2) not null default 0,     -- CONFIG (user-entered ₹/uom) — never LLM
  gst_pct       numeric(5,2) not null default 18,     -- GST % captured at stock-in (0|5|12|18|28)
  hsn_sac       text,

  source_doc    text,                                 -- invoice / PO / challan ref (free text)
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);
-- Append-only by design: no updated_at column, no UPDATE path in the app.

-- ── GRN — the posted record of a goods receipt ──────────────────────────────
create table if not exists public.grns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  po_id         uuid,                                 -- optional link to the PO that triggered this
  warehouse_id  uuid not null,                        -- → public.warehouses(id)

  grn_no        text,                                 -- human-facing number (nullable until issued)
  status        text not null default 'recorded',     -- pending|recorded|discarded
  recorded_by   uuid,
  recorded_at   timestamptz default now(),
  note          text
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_warehouses_org_active on public.warehouses(org_id, is_active);

create index if not exists idx_stock_moves_org_item      on public.stock_movements(org_id, item_id);
create index if not exists idx_stock_moves_org_warehouse on public.stock_movements(org_id, warehouse_id);
create index if not exists idx_stock_moves_org_created   on public.stock_movements(org_id, created_at desc);

create index if not exists idx_grns_org_status on public.grns(org_id, status);
