-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Lead Management: 360° lead, configurable statuses, real follow-ups
-- ════════════════════════════════════════════════════════════════════════════
-- OPS-CRM-002/003/004 + the owner's walkthrough of the competitor's lead
-- screens. Three things change:
--
--  1. LEAD STATUSES BECOME DATA. The competitor ships ~22 hardcoded stages,
--     which is both too many and the wrong ones for any given firm. Ours are
--     rows a tenant edits, seeded with a set that actually reflects an Indian
--     interior sales cycle. `leads.status` keeps storing the slug, so nothing
--     already stored breaks.
--
--  2. THE LEAD CARRIES ITS BRIEF. Project name, budget band, scope, layout
--     size, theme, property address — captured as TYPED COLUMNS, not free
--     text, so they can flow into the quotation instead of being re-keyed
--     (PLAN §6.1 / OPS-CRM-004).
--
--  3. FOLLOW-UPS BECOME FIRST-CLASS. `follow_ups` gains kind (callback vs
--     meeting), title, priority, reminder, outcome and a real lifecycle. A
--     "callback" is a REMINDER TO PHONE SOMEONE — deliberately not a telephony
--     integration. The call LOG stays in `interactions` (0011), which already
--     has direction/status/duration/provider; nothing is duplicated here.
--
-- Multi-assignee arrives via `lead_assignees`; `leads.assigned_to` stays as the
-- primary owner so existing reads keep working.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tenant-configurable lead statuses ───────────────────────────────────────
create table if not exists public.lead_statuses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,

  value      text not null,                      -- slug stored on leads.status
  label      text not null,
  seq        int  not null default 0,
  tone       text not null default 'neutral',    -- neutral|green|amber|red
  is_won     boolean not null default false,
  is_lost    boolean not null default false,
  is_active  boolean not null default true,
  is_system  boolean not null default false,

  created_at timestamptz not null default now(),
  unique (org_id, value)
);

-- ── The 360° lead ───────────────────────────────────────────────────────────
-- Contact block
alter table public.leads add column if not exists alt_phone      text;
alter table public.leads add column if not exists contact_role   text;      -- Owner / Architect / Spouse
alter table public.leads add column if not exists org_type       text;      -- residential | commercial

-- Project brief block (feeds the quotation)
alter table public.leads add column if not exists project_name   text;
alter table public.leads add column if not exists project_type   text;      -- apartment | villa | office | retail
alter table public.leads add column if not exists budget_band    text;      -- "10-20 L"
alter table public.leads add column if not exists scope          text;      -- "Full execution" / "Design only"
alter table public.leads add column if not exists layout_sqft    numeric(10,2);
alter table public.leads add column if not exists theme          text;
alter table public.leads add column if not exists rooms          text[] not null default '{}';
alter table public.leads add column if not exists description    text;
alter table public.leads add column if not exists tentative_start date;
alter table public.leads add column if not exists financial_year text;

-- Ownership + engagement
alter table public.leads add column if not exists sales_owner_id uuid references public.org_members(id) on delete set null;
alter table public.leads add column if not exists latest_remark  text;
alter table public.leads add column if not exists rating         int;       -- 0..5, hand-set qualification score
alter table public.leads add column if not exists client_portal  boolean not null default false;

-- Location (PROC-SITE-002 — the address a PO's ship-to will later read)
alter table public.leads add column if not exists address_line   text;
alter table public.leads add column if not exists city           text;
alter table public.leads add column if not exists state          text;
alter table public.leads add column if not exists pincode        text;
alter table public.leads add column if not exists lat            numeric(9,6);
alter table public.leads add column if not exists lng            numeric(9,6);

-- Promote-to-project: a real FK, so the lead → project hop is a join, not a
-- string match (the free-text project_label problem this codebase has elsewhere).
alter table public.leads add column if not exists project_id uuid references public.projects(id) on delete set null;

-- ── Multi-assignee ──────────────────────────────────────────────────────────
create table if not exists public.lead_assignees (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  member_id  uuid not null references public.org_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lead_id, member_id)
);

-- ── Follow-ups: kind, lifecycle, reminder ───────────────────────────────────
alter table public.follow_ups add column if not exists kind         text not null default 'callback'; -- callback|meeting
alter table public.follow_ups add column if not exists title        text;
alter table public.follow_ups add column if not exists priority     text not null default 'medium';
alter table public.follow_ups add column if not exists reminder_at  timestamptz;
alter table public.follow_ups add column if not exists status       text not null default 'upcoming';
                                     -- upcoming|completed|missed|rescheduled|cancelled
alter table public.follow_ups add column if not exists outcome      text;
alter table public.follow_ups add column if not exists member_id    uuid references public.org_members(id) on delete set null;
alter table public.follow_ups add column if not exists completed_at timestamptz;
alter table public.follow_ups add column if not exists attachment_url text;
alter table public.follow_ups add column if not exists rescheduled_from uuid;

-- Existing rows predate `status`; derive it once from the old `done` flag so
-- the new lifecycle starts consistent instead of marking history as upcoming.
update public.follow_ups
   set status = case when done then 'completed' else 'upcoming' end
 where status = 'upcoming' and done = true;

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_lead_statuses_org_seq
  on public.lead_statuses(org_id, seq);
create index if not exists idx_lead_assignees_org_lead
  on public.lead_assignees(org_id, lead_id);
create index if not exists idx_lead_assignees_member
  on public.lead_assignees(org_id, member_id);
create index if not exists idx_leads_org_owner
  on public.leads(org_id, sales_owner_id);
create index if not exists idx_leads_org_project
  on public.leads(org_id, project_id);
create index if not exists idx_follow_ups_org_status
  on public.follow_ups(org_id, status, due_at);
create index if not exists idx_follow_ups_org_member
  on public.follow_ups(org_id, member_id, due_at);
