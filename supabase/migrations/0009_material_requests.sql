-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Procurement: Material Requests (v1)  ·  FEATURE-REGISTER PROC-MR-001/003
-- ════════════════════════════════════════════════════════════════════════════
-- A site team raises a Material Request against a project: a title, an expected
-- delivery date, and a grid of line items (item, UOM, qty, remarks). Stage cycle:
--   draft → requested → rfq_raised → order_requested → ordered   (or cancelled)
--
-- VEYRA's differentiator vs Dzylo (DESIGN-DIRECTION §7, "free-text where a
-- reference belongs"): a line is a CATALOGUE REFERENCE (item_id → items), never
-- a silent free string. When the user types an item that isn't in the catalogue
-- the line is FLAGGED ad-hoc (is_adhoc = true, item_id null) with its label kept
-- in item_name — pending promotion into the Item master.
--
-- MR carries QUANTITIES only (user-entered). There are deliberately NO price /
-- amount columns here: pricing belongs to RFQ/PO downstream, and no LLM ever
-- produces a number (PLAN §8).
--
-- The project link is OPTIONAL free text (project_label) + nullable uuid — this
-- workspace has no `projects` table and this module stays independent of it.
--
-- ⛔ RLS stays OFF (owner decision). org_id on every row; isolation enforced
--    only in application code via lib/data/with-org.ts. Tables are added to the
--    tenant allowlist in lib/data/tables.ts. Additive migration; idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Material Request header ─────────────────────────────────────────────────
create table if not exists public.material_requests (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,

  title              text not null,
  project_id         uuid,                        -- optional link; no projects table in this workspace
  project_label      text,                        -- free label of the project ("Malviya Nagar site")
  expected_delivery  date,

  stage              text not null default 'draft',
                     -- draft|requested|rfq_raised|order_requested|ordered|cancelled
  source             text not null default 'manual',
                     -- manual|from_quotation|ai_parsed

  remarks            text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Line item = catalogue reference or flagged ad-hoc ────────────────────────
create table if not exists public.material_request_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  mr_id       uuid not null references public.material_requests(id) on delete cascade,

  item_id     uuid references public.items(id),  -- catalogue ref; null = uncatalogued…
  item_name   text not null,                     -- …but the label is ALWAYS kept
  is_adhoc    boolean not null default false,    -- true when item_id is null (pending promotion)

  uom         text,
  qty         numeric(14,2) not null default 0,  -- quantities only — never prices
  remarks     text,

  created_at  timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_mrs_org_stage    on public.material_requests(org_id, stage);
create index if not exists idx_mrs_org_created  on public.material_requests(org_id, created_at desc);
create index if not exists idx_mr_items_org_mr  on public.material_request_items(org_id, mr_id);
create index if not exists idx_mr_items_item    on public.material_request_items(item_id);
