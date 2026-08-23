-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Projects module (v1)  ·  Operations
-- ════════════════════════════════════════════════════════════════════════════
-- The execution hub for the construction/interior business: every live job,
-- its stage (planning → design → execution → handover → closed), its health,
-- and the three financial aggregates the owner steers by — project_value,
-- funds_received, total_payable. `project_updates` is a simple activity feed
-- mirroring `lead_activities` (created / stage_change / note).
--
-- A project may originate from a lead: `lead_id` is a plain uuid reference
-- (no hard FK) so Leads stays optional and deletable without cascades.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    `projects` and `project_updates` are added to the tenant allowlist in
--    lib/data/tables.ts. Additive migration; idempotent.
-- IMPORTANT: all amounts here are CONFIG the user enters or SUMs of stored
--    values — never an LLM output. No engine produces an amount (HARD RULE 4).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.projects (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  name                  text not null,
  client_name           text,
  lead_id               uuid,                                 -- originating lead; plain uuid, no hard FK
  stage                 text not null default 'planning',     -- planning|design|execution|handover|closed
  health                text not null default 'on_track',     -- on_track|delayed|budget_exceeded
  project_value         numeric(14,2) not null default 0,     -- total contract value ₹ (user-entered config)
  funds_received        numeric(14,2) not null default 0,     -- ₹ received to date
  total_payable         numeric(14,2) not null default 0,     -- ₹ payable to vendors/labour to date
  start_date            date,
  handover_date         date,
  city                  text,
  state                 text,
  pincode               text,
  address               text,
  physical_progress_pct numeric(5,2) not null default 0,      -- 0–100, user-maintained
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Activity feed (mirrors lead_activities) ──────────────────────────────────
create table if not exists public.project_updates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  project_id  uuid not null,
  kind        text not null,              -- created|stage_change|note
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_projects_org_stage   on public.projects(org_id, stage);
create index if not exists idx_projects_org_health  on public.projects(org_id, health);
create index if not exists idx_projects_org_created on public.projects(org_id, created_at desc);
create index if not exists idx_project_updates_org_project
  on public.project_updates(org_id, project_id, created_at desc);
