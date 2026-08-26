-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Production / Factory: Nesting + Panel-QR traceability + Work centers
-- (Wave 5b)  ·  Operations  ·  OPS-PROD-001
-- ════════════════════════════════════════════════════════════════════════════
-- The rest of the factory moat on top of BOM + Cutlist (0020):
--   • nesting_runs / nesting_placements — deterministic sheet-nesting results
--     (shelf / first-fit-decreasing-height in lib/production-nesting-model.ts).
--     Boards used, panel/board areas and waste % are PURE arithmetic computed
--     server-side from the cutlist's panels — never an LLM output, and there
--     is NO pricing anywhere in this slice (HARD RULE 2).
--   • panel_tags / panel_events — panel-level QR traceability: one tag per
--     PHYSICAL panel with a unique token, walked through the stage chain
--     cut → edgebanded → drilled → qc → packed → dispatched → installed.
--     One scan answers "where is bedroom 2's wardrobe shutter" (PLAN §6.6).
--   • work_centers — named factory stations (saw, edge-bander, CNC…) with a
--     nominal daily capacity, seeding future job routing/load views.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    All five tables are added to the tenant allowlist in lib/data/tables.ts.
--    Additive migration; idempotent (if-not-exists everywhere).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Nesting runs (one optimisation pass over a cutlist onto identical boards) ─
create table if not exists public.nesting_runs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  cutlist_id          uuid not null,
  board_length_mm     numeric(10,2) not null,
  board_width_mm      numeric(10,2) not null,
  kerf_mm             numeric(6,2) not null default 3,
  boards_used         integer not null default 0,
  total_panel_area_sqm numeric(14,4) not null default 0,
  board_area_sqm      numeric(14,4) not null default 0,
  waste_pct           numeric(6,2) not null default 0,
  status              text not null default 'computed',
  created_by          uuid,
  created_at          timestamptz not null default now()
);

-- ── Nesting placements (one row per panel rectangle on a board; mm + rotated) ─
create table if not exists public.nesting_placements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  nesting_run_id  uuid not null,
  panel_name      text not null,
  board_index     integer not null default 0,
  x_mm            numeric(10,2) not null default 0,
  y_mm            numeric(10,2) not null default 0,
  w_mm            numeric(10,2) not null default 0,
  h_mm            numeric(10,2) not null default 0,
  rotated         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ── Panel tags (QR token per PHYSICAL panel; qty expands into tags) ──────────
create table if not exists public.panel_tags (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  cutlist_panel_id uuid,
  panel_name       text not null,
  token            text not null,
  stage            text not null default 'cut', -- cut|edgebanded|drilled|qc|packed|dispatched|installed
  created_at       timestamptz not null default now(),
  constraint uq_panel_tags_org_token unique (org_id, token)
);

-- ── Panel events (append-only timeline of stage transitions per tag) ─────────
create table if not exists public.panel_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  panel_tag_id uuid not null,
  stage        text not null,
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

-- ── Work centers (factory stations: saw, edge-bander, drilling, QC, packing) ──
create table if not exists public.work_centers (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  name             text not null,
  kind             text,
  capacity_per_day integer,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_nesting_runs_org_created
  on public.nesting_runs(org_id, created_at desc);
create index if not exists idx_nesting_placements_org_run
  on public.nesting_placements(org_id, nesting_run_id);
create index if not exists idx_panel_tags_org_token
  on public.panel_tags(org_id, token);
create index if not exists idx_panel_events_org_tag
  on public.panel_events(org_id, panel_tag_id);
create index if not exists idx_work_centers_org_name
  on public.work_centers(org_id, name);
