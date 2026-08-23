-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Procurement: RFQ + multi-vendor bid comparison (v1)
--                              ·  FEATURE-REGISTER PROC-RFQ-001/004/007/008
-- ════════════════════════════════════════════════════════════════════════════
-- An approved Material Request becomes an RFQ: vendors are invited, their
-- per-line bids (unit rate + tax % + freight) are collected, and a side-by-side
-- comparison matrix ranks each line L1/L2/L3 on LANDED COST
-- (qty × unit_rate + freight — computed by the pure engine helper
-- `landedLineTotal` in lib/rfq-model.ts). One click awards the RFQ; actual PO
-- creation is a separate downstream module and deliberately NOT here.
--
-- ⚠ CONFIG, NOT LLM (PLAN §8): rfq_bid_lines.unit_rate / tax_pct / freight are
--   typed by a human (purchase-team proxy entry) or by the vendor. No LLM ever
--   produces a number; line_total is derived ONLY by landedLineTotal().
--
-- ⛔ RLS OFF — owner decision; NO policies are created anywhere in this file.
--   org_id uuid not null references public.orgs(id) on delete cascade guards
--   every table, and isolation is enforced exclusively in application code via
--   lib/data/with-org.ts. All five tables join the tenant allowlist in
--   lib/data/tables.ts.
--
-- Additive migration; idempotent (`if not exists` everywhere).
-- ════════════════════════════════════════════════════════════════════════════

-- ── RFQ header ──────────────────────────────────────────────────────────────
create table if not exists public.rfqs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,

  mr_id            uuid,                        -- nullable source material request → material_requests.id
                                                --   (no hard FK: deleting an MR must never cascade away procurement history)
  title            text not null,
  project_label    text,                        -- free label ("Malviya Nagar site")
  place_of_supply  text,
  bid_deadline     date,

  status           text not null default 'draft',
                   -- draft|sent|comparing|awarded|closed

  remarks          text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Invited vendors + response tracking ─────────────────────────────────────
create table if not exists public.rfq_vendors (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  rfq_id          uuid not null references public.rfqs(id) on delete cascade,

  vendor_id       uuid not null,               -- → vendors.id (same org by construction; data layer scopes both)

  response_status text not null default 'invited',
                  -- invited|submitted|declined
  invited_at      timestamptz not null default now()
);

-- ── RFQ line items (what vendors quote against) ─────────────────────────────
create table if not exists public.rfq_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  rfq_id      uuid not null references public.rfqs(id) on delete cascade,

  item_id     uuid references public.items(id), -- catalogue ref; null = uncatalogued ad-hoc line…
  item_name   text not null,                    -- …label ALWAYS kept (mirrors material_request_items)

  uom         text,
  qty         numeric(14,2) not null default 0, -- quantities only — rates live on bids

  created_at  timestamptz not null default now()
);

-- ── A vendor's bid (versioned — re-entry supersedes, never overwrites) ──────
create table if not exists public.rfq_bids (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  rfq_id         uuid not null references public.rfqs(id) on delete cascade,

  vendor_id      uuid not null,                -- → vendors.id (data-layer scoped)
  version        int not null default 1,       -- latest version wins in the comparison

  delivery_date  date,
  remark         text,

  entry_mode     text not null default 'proxy',-- portal|proxy (proxy = purchase-team entry on behalf of vendor)
  submitted_by   uuid,                         -- app_users.id of the proxy entrant (null for portal entry)
  submitted_at   timestamptz not null default now()
);

-- ── Bid lines: the per-item quote. RATES ARE CONFIG — user/vendor entered,
--    never an LLM output. line_total is COMPUTED by the pure helper
--    landedLineTotal() (qty × unit_rate + freight) in application code. ──────
create table if not exists public.rfq_bid_lines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  bid_id       uuid not null references public.rfq_bids(id) on delete cascade,
  rfq_item_id  uuid not null,                  -- → rfq_items.id (same rfq by construction; data layer scopes both)

  unit_rate    numeric(14,2) not null default 0, -- CONFIG entered by user/vendor — NEVER an LLM output
  tax_pct      numeric(5,2)  not null default 18,
  freight      numeric(14,2) not null default 0,
  line_total   numeric(14,2) not null default 0, -- computed = qty × unit_rate + freight (landedLineTotal)

  created_at   timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_rfqs_org_status   on public.rfqs(org_id, status);
create index if not exists idx_rfqs_org_created  on public.rfqs(org_id, created_at desc);
create index if not exists idx_rfq_vendors_org_rfq on public.rfq_vendors(org_id, rfq_id);
create index if not exists idx_rfq_items_org_rfq   on public.rfq_items(org_id, rfq_id);
create index if not exists idx_rfq_bids_org_rfq    on public.rfq_bids(org_id, rfq_id);
create index if not exists idx_rfq_bid_lines_org_bid on public.rfq_bid_lines(org_id, bid_id);
