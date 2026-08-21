-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Item Master (v1)  ·  Wave 1 · Master Data & Catalogue
-- ════════════════════════════════════════════════════════════════════════════
-- The catalogue six downstream modules reference (quotation lines, MRs, POs,
-- stock, BOM). A line item is a *reference* to a catalogue Item — never a free
-- item_code (FEATURE-REGISTER: PROC-MR-003 / PROC-WH-002).
--
-- Grounded in the real Dzylo item form (frame WH_04_Instant_Item_Registration):
--   required = Name, Category, Goods Type (→ our `type`), Unit of measurement;
--   optional = Item Code, HSN/SAC, Brand, Description, Tax, MRP;
--   Dzylo dedupes on the *name* ("Item name already exists").
-- VEYRA deltas over Dzylo (FEATURE-REGISTER, Master Data & Catalogue):
--   • one `type` enum instead of parallel Material/Labour/Machine/Modular catalogs
--     (OPS-LAB-001: "model as Item types + Party roles");
--   • multi-UOM conversion (purchase_uom + purchase_to_base_factor) — Dzylo is flat.
-- Deferred to later passes: variant matrices, multiple rate books, moving-average
--   valuation, CSV bulk import, image-zip. All attach additively.
--
-- ⛔ RLS stays OFF (owner decision). `org_id` on every row; isolation is enforced
--    only in application code via lib/data/with-org.ts. `items` is added to the
--    tenant allowlist in lib/data/tables.ts. Additive migration; idempotent.
-- IMPORTANT: `base_rate` here is CONFIG the user enters — never an LLM output.
--    Engines compute prices from this rate; an LLM must never produce an amount.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  name          text not null,
  name_key      text not null,                        -- normalised name for dedupe (lower + single-spaced), unique per org
  code          text,                                 -- optional SKU; unique per org WHEN present
  type          text not null default 'material',     -- Goods Type: material|service|labour|machine|module
  category      text,                                 -- grouping (e.g. Plywood, Hardware, Laminate)
  brand         text,
  base_uom      text not null default 'nos',          -- stocking / consumption unit
  purchase_uom  text,                                 -- buying unit; null → same as base_uom
  purchase_to_base_factor numeric(14,4) not null default 1,  -- base units per 1 purchase unit (e.g. 1 sheet = 32 sqft)
  base_rate     numeric(14,2),                        -- default ₹ rate per base_uom (config seed for the rate book)
  hsn_sac       text,                                 -- HSN (goods) / SAC (services) code
  tax_rate      numeric(5,2) not null default 18,     -- GST %  (0 | 5 | 12 | 18 | 28)
  is_active     boolean not null default true,        -- soft-retire instead of delete
  description   text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_items_org_type    on public.items(org_id, type);
create index if not exists idx_items_org_name     on public.items(org_id, name);
create index if not exists idx_items_org_active   on public.items(org_id, is_active);
create index if not exists idx_items_org_created  on public.items(org_id, created_at desc);

-- Catalogue integrity, matching Dzylo's real behaviour + VEYRA's dedupe pattern:
-- one item NAME per org (name_key is normalised in the data layer, mirroring the
-- leads phone_key approach), and one SKU per org when a code is supplied.
create unique index if not exists uq_items_org_namekey
  on public.items(org_id, name_key);
create unique index if not exists uq_items_org_code
  on public.items(org_id, code) where code is not null;
