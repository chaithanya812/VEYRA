-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — project milestones: the delivery plan
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §9.2 (frames `105010` / `105024`), needed early by §8.1's Milestones
-- cell. Numbered 0032 because that is the slot the ledger reserves for it —
-- 0029/0030/0031 stay free for the files, contracts and labour migrations, and
-- the runner applies by filename, so a fresh database still gets them in order.
--
-- ⚠ THE NAMING COLLISION WORTH KNOWING ABOUT. `milestones` already exists
-- (migration 0015) and is NOT this. That table hangs off `contracts` and carries
-- pct / amount / tentative_due / work_done / actual_due — it is the PAYMENT
-- schedule from `105238`, the one that becomes Account Receivables in `110534`.
-- What `105010` shows is a different animal entirely: the DELIVERY schedule —
-- Site Measurements, 3D Modelling, Panelling Work — with planned and actual
-- dates, a percentage complete, an assignee and a client-visible flag. Two
-- schedules, two tables. Merging them would mean a project's plan and its
-- invoicing could not disagree, and in construction they always disagree.
--
-- Milestones group under a SCOPE ITEM (`105024`: Design Team 14, Execution Team
-- 12, Post Handover 4, Sample 28, Designer Scope 14 — summing to the project's
-- 72). That is the spine from migration 0027 doing the job it was built for.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.project_milestones (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,

  -- The scope group this milestone belongs to (`105024`'s bands). Null = the
  -- project's default scope.
  scope_item_id uuid references public.scope_items(id) on delete set null,

  name          text not null,
  status        text not null default 'not_started',  -- not_started|in_progress|completed|blocked
  progress_pct  numeric(5,2) not null default 0,

  -- Planned vs actual, kept apart. The variance between them is derived, never
  -- stored — a stored "287 days late" is wrong the moment a date moves.
  planned_start date,
  planned_end   date,
  actual_start  date,
  actual_end    date,

  assignee_id   uuid references public.org_members(id) on delete set null,
  client_visible boolean not null default false,
  last_update   text,
  sort_order    int not null default 0,

  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Dependencies are a graph, so they get their own table rather than an array —
-- `105010` shows a milestone linked to several others.
create table if not exists public.project_milestone_deps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  milestone_id  uuid not null references public.project_milestones(id) on delete cascade,
  depends_on_id uuid not null references public.project_milestones(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (milestone_id, depends_on_id),
  -- A milestone that depends on itself is a typo, not a plan.
  check (milestone_id <> depends_on_id)
);

-- ── Templates: "they don't need to always create" ───────────────────────────
-- The owner: *"keep some normal tasks, like for the execution team you can keep
-- project kickoff, site measurements, understanding line design, final design…
-- so they can just select it as well."* Seeded per scope group as is_system
-- rows the tenant renames, reorders or retires — the same two-tier pattern as
-- lead statuses and workspace options.
create table if not exists public.milestone_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  scope_group text not null,          -- "Design Team", "Execution Team", …
  name        text not null,
  -- Day offsets from the group's start, so a template can be laid onto real
  -- dates deterministically. No LLM supplies these.
  offset_days int not null default 0,
  duration_days int not null default 1,
  seq         int not null default 0,
  is_active   boolean not null default true,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (org_id, scope_group, name)
);

create index if not exists idx_project_milestones_org_project
  on public.project_milestones(org_id, project_id, sort_order);
create index if not exists idx_project_milestones_scope
  on public.project_milestones(org_id, scope_item_id);
create index if not exists idx_project_milestones_assignee
  on public.project_milestones(org_id, assignee_id);
create index if not exists idx_milestone_deps_milestone
  on public.project_milestone_deps(org_id, milestone_id);
create index if not exists idx_milestone_templates_org_group
  on public.milestone_templates(org_id, scope_group, seq);
