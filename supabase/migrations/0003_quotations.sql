-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Quotations (v1)  ·  Wave 2 · Estimation & Quotation
-- ════════════════════════════════════════════════════════════════════════════
-- The money path. A quotation groups section BOQ lines; each line is a SCOPE ITEM
-- (PLAN §1.1) that references a catalogue `items` row and flows downstream. Ported
-- from INTERIOR's quotation engine, adapted to multi-tenant (org_id + withOrg()).
--
-- Grounded in the real Dzylo quotation frame (EST_02_Line_Items_Taxes_Terms):
--   columns S.No · Description · Image · QTY · USP(unit price) · UOM · Price ·
--   Discount · Final Price; lines carry Area(room) + Category + spec; grouped in
--   sections ("Wood Work"). Verified pricing:
--     line_subtotal = qty × unit_price
--     line_total    = (line_subtotal − discount_amount) × (1 + tax_rate/100)
--   (frame row1: (21×2160 − 4536)×1.18 = 48,172.32 ✓; row2: (2160−216)×1.18 = 2,293.92 ✓)
--
-- VEYRA deltas over Dzylo: line = catalogue Item ref (rate/UOM/HSN/GST pulled from
--   the item); internal cost roll-up + margin (the screen Dzylo never shows);
--   place-of-supply captured for CGST/SGST-vs-IGST; visible version diff; share link.
-- Prices are computed by the engine (lib/data/quotations.ts) + verified — NEVER by
--   an LLM (PLAN §8). Stored money columns are snapshots the engine writes.
--
-- ⛔ RLS stays OFF (owner decision). org_id on every row; isolation via withOrg().
--    Tables added to lib/data/tables.ts. Additive migration; idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Quotation header ────────────────────────────────────────────────────────
create table if not exists public.quotations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  branch_id         uuid references public.branches(id),
  lead_id           uuid references public.leads(id),          -- Leads → Quote flow
  party_id          uuid references public.parties(id),        -- customer (unified party)

  number            text not null,                             -- running series w/ Indian-FY segment (QT/2026-27/0001)
  version_group     uuid not null default gen_random_uuid(),   -- shared across versions of the same quote
  version           integer not null default 1,
  title             text not null default 'Quotation',
  status            text not null default 'draft',             -- draft|sent|approved|rejected|expired|won|lost

  -- Denormalised customer + supply snapshot for the document (survives party edits).
  customer_name     text,
  customer_phone    text,
  customer_email    text,
  site_address      text,
  place_of_supply   text,                                      -- Indian state (code/name) → CGST/SGST vs IGST

  -- Money snapshots written by the engine (never hand-entered, never LLM).
  currency          text not null default 'INR',
  subtotal          numeric(14,2) not null default 0,          -- Σ line_subtotal
  discount_total    numeric(14,2) not null default 0,          -- Σ line discount
  taxable_total     numeric(14,2) not null default 0,          -- Σ (subtotal − discount)
  tax_total         numeric(14,2) not null default 0,          -- Σ line tax
  grand_total       numeric(14,2) not null default 0,          -- Σ line_total
  cost_total        numeric(14,2) not null default 0,          -- Σ line internal cost (roll-up)
  margin_total      numeric(14,2) not null default 0,          -- taxable_total − cost_total

  notes             text,
  terms             text,
  valid_until       date,

  -- Public tokenised share link  (= INTERIOR /q/<token>).
  share_token       text,
  share_enabled     boolean not null default false,

  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Section (BOQ group, e.g. "Wood Work") ───────────────────────────────────
create table if not exists public.quotation_sections (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  quotation_id   uuid not null references public.quotations(id) on delete cascade,
  title          text not null default 'Section',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ── Line = Scope Item (references the catalogue) ─────────────────────────────
create table if not exists public.quotation_lines (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  quotation_id   uuid not null references public.quotations(id) on delete cascade,
  section_id     uuid references public.quotation_sections(id) on delete set null,
  item_id        uuid references public.items(id),             -- catalogue ref; null = ad-hoc (flagged)

  sort_order     integer not null default 0,
  title          text not null,                                -- e.g. "01 Wooden Partition"
  area           text,                                         -- room / location (e.g. Bedroom, All Area)
  category       text,                                         -- e.g. "Wood Work / Partitions"
  description    text,                                         -- spec text
  image_url      text,
  hsn_sac        text,

  qty            numeric(14,3) not null default 1,
  uom            text not null default 'nos',
  unit_price     numeric(14,2) not null default 0,             -- USP (sale price per UOM) — config/engine, not LLM

  discount_type  text not null default 'amount',               -- amount | percent
  discount_value numeric(14,2) not null default 0,             -- as entered
  discount_amount numeric(14,2) not null default 0,            -- resolved ₹ (engine)
  tax_rate       numeric(5,2) not null default 18,             -- GST %

  cost_rate      numeric(14,2) not null default 0,             -- internal cost per UOM (from item.base_rate or manual)

  -- Money snapshots written by the engine.
  line_subtotal  numeric(14,2) not null default 0,             -- qty × unit_price
  taxable        numeric(14,2) not null default 0,             -- line_subtotal − discount_amount
  tax_amount     numeric(14,2) not null default 0,             -- taxable × tax_rate/100
  line_total     numeric(14,2) not null default 0,             -- taxable + tax_amount
  line_cost      numeric(14,2) not null default 0,             -- qty × cost_rate

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_quotations_org_status   on public.quotations(org_id, status);
create index if not exists idx_quotations_org_created   on public.quotations(org_id, created_at desc);
create index if not exists idx_quotations_lead          on public.quotations(lead_id);
create index if not exists idx_quotations_vgroup        on public.quotations(version_group);
create index if not exists idx_qsections_quotation      on public.quotation_sections(quotation_id, sort_order);
create index if not exists idx_qlines_quotation         on public.quotation_lines(quotation_id, sort_order);
create index if not exists idx_qlines_section           on public.quotation_lines(section_id);
create index if not exists idx_qlines_item              on public.quotation_lines(item_id);

-- One quote number per org; one live share token globally (nullable → partial).
create unique index if not exists uq_quotations_org_number
  on public.quotations(org_id, number);
create unique index if not exists uq_quotations_share_token
  on public.quotations(share_token) where share_token is not null;
