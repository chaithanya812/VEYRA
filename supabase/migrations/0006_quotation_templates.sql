-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Quotation templates / presets (Wave 2 · "3BHK Premium")  ·  P2
-- ════════════════════════════════════════════════════════════════════════════
-- Reusable BOQ presets: a user snapshots a quotation's section + line STRUCTURE
-- (inputs only — never computed money) into a template, then instantiates a new
-- draft quotation from it. Instantiation re-derives every total with the existing
-- pricing engine (recomputeQuotation) — the template stores raw inputs only.
--
-- Grounded in migration 0003's quotation shape (same input columns). Mirror of
--   quotation_sections / quotation_lines minus the money snapshot columns.
--
-- ⛔ RLS stays OFF (owner decision). Every table carries org_id + withOrg().
--    Tables added to lib/data/tables.ts. Additive migration; idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Template header ───────────────────────────────────────────────────────────
create table if not exists public.quotation_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now()
);

-- ── Template section (BOQ group, e.g. "Wood Work") ────────────────────────────
create table if not exists public.quotation_template_sections (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  template_id  uuid not null references public.quotation_templates(id) on delete cascade,
  title        text not null default 'Section',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ── Template line = Scope Item inputs (NO money snapshot columns) ──────────────
create table if not exists public.quotation_template_lines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  template_id  uuid not null references public.quotation_templates(id) on delete cascade,
  section_id   uuid references public.quotation_template_sections(id) on delete set null,
  item_id      uuid references public.items(id),

  sort_order   integer not null default 0,
  title        text not null,
  area         text,
  category     text,
  description  text,
  hsn_sac      text,

  qty          numeric(14,3) not null default 1,
  uom          text not null default 'nos',
  unit_price   numeric(14,2) not null default 0,

  discount_type  text not null default 'amount',
  discount_value numeric(14,2) not null default 0,
  tax_rate       numeric(5,2) not null default 18,
  cost_rate      numeric(14,2) not null default 0,

  created_at   timestamptz not null default now()
);

-- ── Indexes (FKs) ─────────────────────────────────────────────────────────────
create index if not exists idx_qtemplates_org_created
  on public.quotation_templates(org_id, created_at desc);
create index if not exists idx_qtemplate_sections_template
  on public.quotation_template_sections(template_id, sort_order);
create index if not exists idx_qtemplate_lines_template
  on public.quotation_template_lines(template_id, sort_order);
create index if not exists idx_qtemplate_lines_section
  on public.quotation_template_lines(section_id);
create index if not exists idx_qtemplate_lines_item
  on public.quotation_template_lines(item_id);
