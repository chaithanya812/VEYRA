-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — HR: work-from-home requests, and a tenant's own holiday calendar
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §11, frame `110318` (My Dashboard).
--
-- TWO TABLES, and each exists because the frame makes a distinction the
-- current schema cannot express.
--
-- 1. `wfh_requests` — a SEPARATE table, not a `leave_type = 'wfh'` row on
--    `leave_requests`.
--
--    0023 seeded a `wfh` leave type, and that was the wrong shape for two
--    reasons the frame makes plain. The tiles count and approve WFH on its
--    own axis (`8 Granted / 29 In process`) alongside Paid and Unpaid, and the
--    dashboard gives it its own tab next to Leaves — so it is a sibling of
--    leave, not a kind of it.
--
--    The deeper reason is arithmetic, not layout. **A WFH day is not leave:
--    the person worked.** Leave is deducted from an entitlement; a WFH day is
--    not. Folded into `leave_requests` it would either eat somebody's leave
--    balance or require every balance query to carry an exclusion that one
--    future read will forget — and a forgotten exclusion in a leave balance is
--    a silent wrong number, which is the worst kind this codebase ships.
--
--    Shape MIRRORS `leave_requests` exactly (member, dates, days, reason, the
--    approve/reject quartet) so the approval screens in Unit 3 are one code
--    path over two tables rather than two code paths. There is no
--    `leave_type` column: WFH has no sub-kinds.
--
--    The legacy `workspace_options` row `leave_type = 'wfh'` is left in place
--    on purpose — rows already stored against that slug must keep resolving.
--    lib/hr-model.ts names the collision (it counts such a row toward the WFH
--    tile, never toward paid leave) rather than quietly picking one.
--
-- 2. `holidays` — TENANT-OWNED, because a Hyderabad firm and a Gurugram firm
--    do not share a calendar. Bathukamma is a working day in one and a holiday
--    in the other, and there is no national list that makes both right. So
--    `org_id` is not decoration here; it is the whole point of the table.
--
--    `is_optional` because the Indian restricted-holiday convention is real:
--    a floating holiday an employee may claim is a different fact from an
--    office closure, and flattening the two would make the Holidays tab lie
--    about which days the office is shut.
--
--    Uniqueness is `(org_id, holiday_date, lower(name))` — a DATE may carry
--    more than one name (Diwali and Govardhan Puja land adjacently, and firms
--    do list two observances on one day), but the same name may not be
--    entered twice on the same date. Case-insensitive, because "Diwali" and
--    "diwali" are the same day to the person reading the calendar. Two
--    tenants may of course share a date; nothing here is unique across orgs.
--
-- ⛔ NO STORED COUNTS ANYWHERE. Attendance hours stay derived from the
--    check-in/check-out stamps in `work_sessions` (lib/workspace-model.ts
--    `sessionHours`), and the tiles are sums over these rows computed in
--    lib/hr-model.ts. An OPEN session contributes zero hours and is rendered
--    as open — it does not guess a check-out, which is exactly why none of
--    this can be a stored total.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts; both tables
--    are registered in lib/data/tables.ts and asserted in scripts/verify.mjs.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Work-from-home requests ──────────────────────────────────────────────
create table if not exists public.wfh_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  member_id     uuid not null references public.org_members(id) on delete cascade,

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

-- The same closed vocabulary `leave_requests` uses (APPROVAL_STATUSES in
-- lib/workspace-model.ts). Stated as a constraint so the two tables cannot
-- drift into having different ideas of "approved".
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'wfh_requests_status_check'
       and conrelid = 'public.wfh_requests'::regclass
  ) then
    alter table public.wfh_requests
      add constraint wfh_requests_status_check
      check (status in ('pending', 'approved', 'rejected', 'cancelled'));
  end if;

  -- A request that ends before it starts is not a short request, it is a typo.
  if not exists (
    select 1 from pg_constraint
     where conname = 'wfh_requests_dates_ordered'
       and conrelid = 'public.wfh_requests'::regclass
  ) then
    alter table public.wfh_requests
      add constraint wfh_requests_dates_ordered check (to_date >= from_date);
  end if;
end $$;

-- Mirrors 0023's two leave indexes: the member's own history, and the
-- approver's queue.
create index if not exists idx_wfh_org_member
  on public.wfh_requests(org_id, member_id, from_date desc);
create index if not exists idx_wfh_org_status
  on public.wfh_requests(org_id, status);

-- ── 2. The tenant's holiday calendar ────────────────────────────────────────
create table if not exists public.holidays (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,

  holiday_date date not null,
  name         text not null,
  -- A restricted / floating holiday an employee may claim, as against an
  -- office closure everybody gets. Different facts, different column.
  is_optional  boolean not null default false,

  created_at   timestamptz not null default now()
);

-- Case-insensitive, and scoped to the tenant — see the header. Two orgs may
-- both observe 2026-11-08; one org may not list "Diwali" on it twice.
create unique index if not exists uq_holidays_org_date_name
  on public.holidays(org_id, holiday_date, lower(name));

-- The Holidays tab reads a date window in ascending order.
create index if not exists idx_holidays_org_date
  on public.holidays(org_id, holiday_date);
