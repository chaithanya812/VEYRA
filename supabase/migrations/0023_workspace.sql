-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Personal Workspace + Team Command (OPS-HR-001, owner brief)
-- ════════════════════════════════════════════════════════════════════════════
-- The employee-facing home screen (attendance, tasks, expenses, leave, field
-- visits) AND the manager/owner counterpart that assigns and tracks all of it.
-- Both surfaces read these tables; the difference is scope, not schema.
--
-- Everything the user picks from is CONFIG, not a hardcoded enum:
-- `workspace_options` holds the tenant's own task types, priorities, expense
-- categories, leave types and visit purposes. The seeded rows are defaults a
-- tenant may rename, re-order, deactivate or add to. Only the small set of
-- lifecycle states the engine reasons about (task status, approval status)
-- stays fixed in code.
--
-- Everything is keyed on `org_members.id` (the membership), never on a raw
-- user id: a person is an employee OF an org, and the same human may be a
-- member of several. This is what makes "my tasks" vs "the team's tasks"
-- a real query rather than a guess.
--
-- Amounts are user-entered config (an expense claim is a receipt someone
-- typed). Sums are computed in pure code. No LLM produces any number here
-- (HARD RULE 2).
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    Every table below is added to the allowlist in lib/data/tables.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tenant-editable vocabularies ────────────────────────────────────────────
-- kind: task_type | task_priority | expense_category | leave_type | visit_purpose
create table if not exists public.workspace_options (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,

  kind       text not null,
  value      text not null,                      -- stable slug stored on rows
  label      text not null,                      -- what the user sees (editable)
  seq        int  not null default 0,
  tone       text not null default 'neutral',    -- neutral|green|amber|red (chip tone)
  is_active  boolean not null default true,
  is_system  boolean not null default false,     -- seeded default; renameable, not deletable

  created_at timestamptz not null default now(),
  unique (org_id, kind, value)
);

-- ── Tasks ───────────────────────────────────────────────────────────────────
-- Created by an employee for themselves, or assigned down by a manager. The
-- status set is fixed (the board reasons about it); type and priority are config.
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,

  title        text not null,
  description  text,
  task_type    text not null default 'task',     -- → workspace_options(kind='task_type')
  priority     text not null default 'medium',   -- → workspace_options(kind='task_priority')
  status       text not null default 'created',  -- created|in_progress|blocked|done|cancelled

  due_at       timestamptz,
  assignee_id  uuid references public.org_members(id) on delete set null,
  created_by   uuid references public.org_members(id) on delete set null,

  project_id   uuid references public.projects(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,

  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Free-form checklist under a task (the "fully customizable" sub-steps).
create table if not exists public.task_checklist (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  seq        int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Attendance: one row per check-in → check-out ────────────────────────────
-- Distinct from site_attendance (0019), which is project-scoped field presence
-- keyed on a free-text member_name. This is the workspace clock, keyed on the
-- membership, and hours worked are derived from these rows — never a counter.
create table if not exists public.work_sessions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  member_id      uuid not null references public.org_members(id) on delete cascade,

  check_in       timestamptz not null default now(),
  check_out      timestamptz,
  lat            numeric(9,6),
  lng            numeric(9,6),
  location_label text,
  source         text not null default 'web',    -- web|mobile
  note           text,

  created_at     timestamptz not null default now()
);

-- ── Leave requests (rides the same approve/reject shape as expenses) ────────
create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  member_id     uuid not null references public.org_members(id) on delete cascade,

  leave_type    text not null default 'casual',  -- → workspace_options(kind='leave_type')
  from_date     date not null,
  to_date       date not null,
  days          numeric(5,1) not null default 1,
  reason        text,

  status        text not null default 'pending', -- pending|approved|rejected|cancelled
  decided_by    uuid references public.org_members(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now()
);

-- ── Expense claims (project-attributed; feeds project actual cost later) ────
create table if not exists public.expense_claims (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  member_id     uuid not null references public.org_members(id) on delete cascade,

  project_id    uuid references public.projects(id) on delete set null,
  project_label text,                             -- display fallback when unlinked
  spent_on      date not null default current_date,
  amount        numeric(14,2) not null default 0, -- user-entered receipt value
  category      text not null default 'other',    -- → workspace_options(kind='expense_category')
  remark        text,
  receipt_url   text,

  status        text not null default 'submitted', -- submitted|approved|rejected|reimbursed
  decided_by    uuid references public.org_members(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  created_at    timestamptz not null default now()
);

-- ── Field visits ────────────────────────────────────────────────────────────
create table if not exists public.field_visits (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  member_id      uuid not null references public.org_members(id) on delete cascade,

  purpose        text not null default 'site_visit', -- → workspace_options(kind='visit_purpose')
  project_id     uuid references public.projects(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  title          text,

  started_at     timestamptz,
  ended_at       timestamptz,
  lat            numeric(9,6),
  lng            numeric(9,6),
  location_label text,
  notes          text,
  status         text not null default 'planned',   -- planned|in_progress|completed|cancelled

  created_at     timestamptz not null default now()
);

-- ── Columns added to existing tables ────────────────────────────────────────
-- Display name + designation on the membership, so the team board can render a
-- person without reaching into the platform app_users table on every row.
alter table public.org_members add column if not exists display_name text;
alter table public.org_members add column if not exists designation  text;

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_ws_options_org_kind
  on public.workspace_options(org_id, kind, seq);

create index if not exists idx_tasks_org_assignee_status
  on public.tasks(org_id, assignee_id, status);
create index if not exists idx_tasks_org_due
  on public.tasks(org_id, due_at);
create index if not exists idx_tasks_org_project
  on public.tasks(org_id, project_id);
create index if not exists idx_tasks_org_lead
  on public.tasks(org_id, lead_id);
create index if not exists idx_task_checklist_task
  on public.task_checklist(org_id, task_id, seq);

create index if not exists idx_work_sessions_org_member
  on public.work_sessions(org_id, member_id, check_in desc);
-- At most one open session per member (the check-in/check-out invariant).
create unique index if not exists uq_work_sessions_open
  on public.work_sessions(member_id) where check_out is null;

create index if not exists idx_leave_org_member
  on public.leave_requests(org_id, member_id, from_date desc);
create index if not exists idx_leave_org_status
  on public.leave_requests(org_id, status);

create index if not exists idx_expense_org_member
  on public.expense_claims(org_id, member_id, spent_on desc);
create index if not exists idx_expense_org_status
  on public.expense_claims(org_id, status);
create index if not exists idx_expense_org_project
  on public.expense_claims(org_id, project_id);

create index if not exists idx_field_visits_org_member
  on public.field_visits(org_id, member_id, started_at desc);
create index if not exists idx_field_visits_org_status
  on public.field_visits(org_id, status);
