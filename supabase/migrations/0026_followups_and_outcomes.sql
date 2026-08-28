-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Follow-ups: many assignees, and an outcome that actually does
--         something
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §5.1. The owner: *"follow-ups will never just be one single thing.
-- You could have multiple follow-ups and based on those follow-ups, you got to
-- change the status. You should be able to assign to multiple people."*
--
-- Three parts, and only two of them are schema:
--
--  1. MANY PER LEAD was never a data problem — `follow_ups` has no unique
--     constraint on lead_id and demo leads already carry two each. It was one
--     collapsed disclosure in the UI, fixed in Phase 0. No migration.
--
--  2. MANY ASSIGNEES. `follow_up_assignees` mirrors the `lead_assignees`
--     pattern exactly: the join table carries the crowd, and
--     `follow_ups.member_id` stays as the PRIMARY OWNER so every existing read
--     keeps working unchanged.
--
--  3. THE OUTCOME DRIVES THE LEAD. Today an outcome is recorded and nothing
--     happens, which is why the same lead sits in "Contacted" through four
--     conversations. `followup_outcome_rules` maps a tenant's own outcome
--     vocabulary onto a next status and an optional auto-scheduled follow-on.
--     The rule PROPOSES; the user confirms in the completion dialog. Nothing
--     here ever mutates a lead silently — a status that changes without anyone
--     choosing it is how a pipeline stops being trusted.
--
-- Also: `leads.external_ref` so a future lead feed (a web form, a marketplace)
-- can attach its id without another migration. No integration ships with it —
-- lead capture stays manual (PLAN-V4 §0).
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Many assignees per follow-up ────────────────────────────────────────────
create table if not exists public.follow_up_assignees (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  follow_up_id uuid not null references public.follow_ups(id) on delete cascade,
  member_id    uuid not null references public.org_members(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (follow_up_id, member_id)
);

-- ── Outcome → next status, and an optional follow-on ────────────────────────
create table if not exists public.followup_outcome_rules (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,

  -- Matches workspace_options.value where kind = 'followup_outcome'.
  outcome_slug       text not null,
  -- lead_statuses.value to move to; null = leave the lead's status alone.
  next_status        text,
  -- Days out to prefill the follow-on follow-up; null = do not offer one.
  auto_schedule_days int,
  is_active          boolean not null default true,
  is_system          boolean not null default false,

  created_at         timestamptz not null default now(),
  unique (org_id, outcome_slug)
);

-- ── A future lead feed attaches by id, not by re-keying ─────────────────────
alter table public.leads add column if not exists external_ref text;

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_follow_up_assignees_org_followup
  on public.follow_up_assignees(org_id, follow_up_id);
create index if not exists idx_follow_up_assignees_member
  on public.follow_up_assignees(org_id, member_id);
create index if not exists idx_followup_outcome_rules_org
  on public.followup_outcome_rules(org_id, outcome_slug);
create index if not exists idx_leads_org_external_ref
  on public.leads(org_id, external_ref);

-- ── Backfill: the primary owner is also an assignee ─────────────────────────
-- So a read of "who is on this follow-up" never has to union two shapes.
insert into public.follow_up_assignees (org_id, follow_up_id, member_id)
select f.org_id, f.id, f.member_id
  from public.follow_ups f
 where f.member_id is not null
on conflict (follow_up_id, member_id) do nothing;
