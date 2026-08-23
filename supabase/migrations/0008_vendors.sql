-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Vendors / Party master (v1)  ·  Procurement
-- ════════════════════════════════════════════════════════════════════════════
-- A vendor is conceptually "a Party with the vendor role" (the platform has a
-- `parties` table — PLAN entity 2, OPS-LAB-001 "model as Item types + Party
-- roles"). For v1 this is a dedicated `vendors` table: simpler and disjoint.
-- IDEAL (later consolidation): fold into `parties` with a party_role enum +
-- role-specific detail tables; nothing here blocks that — the columns map 1:1.
--
-- Grounded in the dedupe pattern that fixed INTERIOR's forked-customer bug
-- (PLAN §6.1): one vendor per normalised NAME per org (name_key, mirroring
-- items) AND one per normalised PHONE per org (phone_key, mirroring leads).
--
-- `vendor_rate_contracts` records negotiated rates per vendor/item. ⚠ IMPORTANT:
-- `rate` here is CONFIG the user types (like items.base_rate) — never an LLM
-- output. Engines may compare/pick contracts; no model produces an amount.
-- `vendors.rating` is intentionally NULLABLE and stays null until it is computed
-- from real PO/GRN history — never faked or defaulted.
--
-- ⛔ RLS stays OFF (owner decision). `org_id` on every row; isolation is enforced
--    only in application code via lib/data/with-org.ts. Both tables are added to
--    the tenant allowlist in lib/data/tables.ts. Additive migration; idempotent.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.vendors (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  name           text not null,
  name_key       text not null,                        -- normalised name for dedupe (lower + single-spaced), unique per org
  contact_person text,
  phone          text,
  phone_key      text,                                 -- last-10-digits dedupe key (mirrors leads.phone_key)
  email          text,
  gstin          text,
  category       text,                                 -- grouping (e.g. Hardware, Plywood, Electrical)
  payment_terms  text,
  lead_time_days int,
  rating         numeric(3,2),                         -- NULLABLE; computed from PO/GRN history later — never seeded/faked
  address        text,
  city           text,
  state          text,
  pincode        text,
  is_active      boolean not null default true,        -- soft-retire instead of delete
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.vendor_rate_contracts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  vendor_id      uuid not null,                        -- → vendors.id (same org by construction; data layer scopes both)
  item_id        uuid,                                 -- nullable ref to catalogue items; v1 also allows a free item_name
  item_name      text,
  uom            text,
  rate           numeric(14,2) not null,               -- CONFIG entered by the user — never an LLM output
  moq            numeric(14,2),
  lead_time_days int,
  valid_from     date,
  valid_to       date,
  created_by     uuid,
  created_at     timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_vendors_org_active   on public.vendors(org_id, is_active);
create index if not exists idx_vendors_org_category on public.vendors(org_id, category);
create index if not exists idx_vendors_org_created  on public.vendors(org_id, created_at desc);
create index if not exists idx_vrc_org_vendor       on public.vendor_rate_contracts(org_id, vendor_id);

-- Dedupe integrity, matching leads/items: one vendor NAME per org, and one per
-- PHONE per org when a phone is supplied.
create unique index if not exists uq_vendors_org_namekey
  on public.vendors(org_id, name_key);
create unique index if not exists uq_vendors_org_phonekey
  on public.vendors(org_id, phone_key) where phone_key is not null;
