-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — OPS-CRM-002/003 + OPS-HR-001: the CRM Pipeline (Kanban + follow-ups)
-- ════════════════════════════════════════════════════════════════════════════
-- Pipeline stages are TENANT-CONFIGURABLE (New Inquiry → … → Won/Lost); the
-- Kanban board groups leads into stage columns by matching leads.status to the
-- stage name. `follow_ups` is the per-lead follow-up scheduler (overdue /
-- today / upcoming). Column value totals are pure SUMs of leads.value — no
-- number anywhere in this module is invented.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    Both tables are added to the tenant allowlist in lib/data/tables.ts.
-- Additive migration only; idempotent `create table if not exists`.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  name       text not null,
  seq        int not null default 0,
  is_won     boolean not null default false,
  is_lost    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table if not exists public.follow_ups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  due_at      timestamptz not null,
  done        boolean not null default false,
  note        text,
  assigned_to uuid,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_pipeline_stages_org_seq
  on public.pipeline_stages(org_id, seq);
create index if not exists idx_follow_ups_org_due
  on public.follow_ups(org_id, due_at);
create index if not exists idx_follow_ups_org_lead
  on public.follow_ups(org_id, lead_id);
