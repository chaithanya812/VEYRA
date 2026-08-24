-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Production / Factory: BOM + Cutlist (v1)  ·  Operations  ·  OPS-PROD-001
-- ════════════════════════════════════════════════════════════════════════════
-- The factory moat: a BOM (bill of materials) is the exploded material list for
-- a project; a Cutlist is the panel-wise board-cutting list derived for
-- manufacturing, with grain direction and edge-banding per edge.
--
-- `project_label` is a plain free-text label (no hard FK to projects), mirroring
-- site_logs / warehouses so these surfaces stay usable before/without a
-- Projects row. A cutlist may optionally reference the bom it was derived from.
--
-- Quantities and dimensions are CONFIG the user enters (metric — mm, sqm,
-- running-metre). Effective qty, panel area and banding length are PURE
-- computations in lib/production-model.ts — never an LLM output. There is NO
-- pricing anywhere in this slice (HARD RULE 2).
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    All four tables are added to the tenant allowlist in lib/data/tables.ts.
--    Additive migration; idempotent (if-not-exists everywhere).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Bills of materials ──────────────────────────────────────────────────────
create table if not exists public.boms (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_label text,
  title         text not null,
  source_ref    text,
  status        text not null default 'draft',
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- ── BOM lines (exploded material rows; effective_qty = qty × (1 + waste%)) ──
create table if not exists public.bom_lines (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  bom_id        uuid not null,
  material_name text not null,
  uom           text,
  qty           numeric(14,3) not null default 0,
  waste_pct     numeric(6,2) not null default 0,
  effective_qty numeric(14,3) not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ── Cutlists (panel-wise board-cutting lists for manufacturing) ─────────────
create table if not exists public.cutlists (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  bom_id          uuid,
  project_label   text,
  title           text not null,
  board_material  text,
  board_length_mm numeric(10,2),
  board_width_mm  numeric(10,2),
  status          text not null default 'draft',
  created_by      uuid,
  created_at      timestamptz not null default now()
);

-- ── Cutlist panels (grain direction + which edges get banded) ───────────────
create table if not exists public.cutlist_panels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  cutlist_id  uuid not null,
  panel_name  text not null,
  room_label  text,
  length_mm   numeric(10,2) not null default 0,
  width_mm    numeric(10,2) not null default 0,
  qty         integer not null default 1,
  grain       text not null default 'none', -- 'length' | 'width' | 'none'
  material    text,
  edge_l1     boolean not null default false,
  edge_l2     boolean not null default false,
  edge_w1     boolean not null default false,
  edge_w2     boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_boms_org_created
  on public.boms(org_id, created_at desc);
create index if not exists idx_bom_lines_org_bom
  on public.bom_lines(org_id, bom_id);
create index if not exists idx_cutlists_org_created
  on public.cutlists(org_id, created_at desc);
create index if not exists idx_cutlist_panels_org_cutlist
  on public.cutlist_panels(org_id, cutlist_id);
