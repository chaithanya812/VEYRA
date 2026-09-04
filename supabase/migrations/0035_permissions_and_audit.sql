-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — the permission spine and the audit ledger
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §11, frames `110403` / `110413`–`110429` (Role Management, Edit Role).
--
--   "A permission nothing enforces is worse than none: it promises a control
--    that does not exist."
--
-- This migration adds no screens and no policies. It adds the four columns and
-- one table without which `can()` cannot be written, and closes two FK holes
-- that Units 3 and 4 found while building on top of them.
--
-- ⛔ RLS STAYS OFF (owner decision). Do NOT add policies. `lib/data/with-org.ts`
--    remains the only tenant guard; every table here is registered in
--    `lib/data/tables.ts` and asserted in `scripts/verify.mjs`.
--    Additive + idempotent; safe to re-run.
--
-- ── 1. `audit_events` — a ledger, not a log ─────────────────────────────────
--
--    Append-only, like `payments` (§2 rule 4). Nothing in the app updates or
--    deletes a row: a correction is a NEW row. An audit trail that can be
--    edited answers the one question it exists to answer — "what actually
--    happened?" — with "whatever somebody last wrote", which is no answer.
--
--    `before` / `after` are jsonb rather than a text diff so the reader can see
--    WHICH field moved, not merely that something did. Both are nullable: a
--    create has no `before` and a delete has no `after`, and forcing `{}` in
--    either slot would make "created" and "changed to empty" the same row.
--
--    `actor_member_id` rather than the brief's bare `actor`, because `actor` in
--    a table that also carries `entity_id` reads as "some id, of something".
--    It is nullable with ON DELETE SET NULL: when a member is removed the
--    events they caused MUST survive, or deleting a person would quietly erase
--    the record of what that person did. `actor_name` is denormalised beside it
--    for exactly the same reason — a null FK still has to render a name.
--
-- ── 2. `roles.inherits_from` — inheritance collapses the explosion ──────────
--
--    Frame `110413`'s `Inherit From ▾`. A role resolves to its own grants PLUS
--    its parent's. Self-reference on one table, no depth limit, so the resolver
--    in `lib/permissions-model.ts` walks it with a seen-set and a cycle guard —
--    the same shape as `managerChain` from Unit 4. ON DELETE SET NULL: deleting
--    a parent role must orphan its children, never cascade-delete roles that
--    people are actively assigned to.
--
-- ── 3. `permissions.entity` — the third segment ─────────────────────────────
--
--    The matrix was (module, action, scope). The frames nest one level deeper:
--    Procurement → Orders → Approve/Reject PO. That is
--    `procurement.po.approve`, which (module, action) cannot express — it would
--    collapse "approve a PO" and "approve a material request" into one grant,
--    and those are different jobs held by different people.
--
--    Defaults to `'*'`, meaning "every entity in this module", so existing
--    two-segment grants keep their meaning and `module.*.action` stays sayable.
--
-- ── 4. `org_members.role_id` — the missing edge ─────────────────────────────
--
--    `roles` has existed since 0001 and NOTHING pointed at it: a member's
--    powers came from `org_members.role`, a four-value tier
--    (admin|owner|manager|member). So the tenant could author a role and never
--    assign it. Nullable on purpose — a member without a custom role falls back
--    to that tier, which is what every member does today. The tier stays; it is
--    the floor, and the role is the refinement.
--
-- ── 5. Same-org FKs — the hole Units 3 and 4 found ──────────────────────────
--
--    `org_members.manager_id`, `wfh_requests.decided_by` and
--    `leave_requests.decided_by` all referenced `org_members(id)` with NOTHING
--    requiring the referenced member to share the row's `org_id`. Postgres would
--    let a Gurugram firm's member report to a Hyderabad firm's manager, or let
--    another tenant's manager approve your leave. `withOrg()` prevents it in app
--    code, but with RLS off that is a single layer, and this is precisely the
--    class of bug nothing in the test suite is guaranteed to notice.
--
--    Fixed the only way Postgres can express it: a UNIQUE (id, org_id) on the
--    parent, then a COMPOSITE FK carrying org_id into the reference. Verified
--    against live data before writing — zero violating rows on all four edges.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The audit ledger ─────────────────────────────────────────────────────
create table if not exists public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,

  actor_member_id uuid references public.org_members(id) on delete set null,
  -- Survives the actor's deletion. See the header.
  actor_name      text,

  entity          text not null,   -- 'leave_request', 'purchase_order', …
  entity_id       uuid,
  action          text not null,   -- 'create' | 'update' | 'delete' | 'approve' | …

  before          jsonb,
  after           jsonb,

  at              timestamptz not null default now()
);

-- The two reads the surfaces in Unit 7 actually make: one entity's history, and
-- the tenant's recent activity.
create index if not exists idx_audit_org_entity
  on public.audit_events(org_id, entity, entity_id, at desc);
create index if not exists idx_audit_org_at
  on public.audit_events(org_id, at desc);

-- ── 2. Role inheritance ─────────────────────────────────────────────────────
alter table public.roles
  add column if not exists inherits_from uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'roles_inherits_from_fkey'
  ) then
    alter table public.roles
      add constraint roles_inherits_from_fkey
      foreign key (inherits_from) references public.roles(id) on delete set null;
  end if;

  -- A role inheriting from itself is a zero-length cycle. The resolver guards
  -- longer ones (it must — Postgres cannot express those), but this one is
  -- cheap to make unrepresentable, so it is.
  if not exists (
    select 1 from pg_constraint where conname = 'roles_no_self_inherit'
  ) then
    alter table public.roles
      add constraint roles_no_self_inherit check (inherits_from is null or inherits_from <> id);
  end if;
end $$;

-- ── 3. The third capability segment ─────────────────────────────────────────
alter table public.permissions
  add column if not exists entity text not null default '*';

-- ⚠ The pre-existing UNIQUE (org_id, role_id, module, action) has to GO, and
--   dropping it is the entire point of this section. It predates the entity
--   segment, so it treats `procurement.po.approve` and `procurement.mr.approve`
--   as the same row — the exact collision `entity` was added to end. Left in
--   place, the new column would be decorative: a role could hold one "approve"
--   per module and no more, and the frame's Orders/Requests split could not be
--   expressed at all. (Caught by a verify assertion, not by reading the schema.)
alter table public.permissions
  drop constraint if exists permissions_org_id_role_id_module_action_key;

-- One grant per (role, module, entity, action). Re-granting is not a second row.
-- `org_id` is not in the key because a role belongs to exactly one org already.
create unique index if not exists uq_permissions_role_capability
  on public.permissions(role_id, module, entity, action);

-- ── 4. Bind a member to a role ──────────────────────────────────────────────
alter table public.org_members
  add column if not exists role_id uuid;

-- ── 5. Same-org composite foreign keys ──────────────────────────────────────
-- The parent-side uniqueness a composite FK needs. (id) is already the PK, so
-- these add no new constraint on the data — only a target to reference.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'uq_org_members_id_org') then
    alter table public.org_members add constraint uq_org_members_id_org unique (id, org_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'uq_roles_id_org') then
    alter table public.roles add constraint uq_roles_id_org unique (id, org_id);
  end if;
end $$;

-- Swap each bare FK for a same-org composite one. Dropped by name (captured
-- from pg_constraint before writing this file) and re-added only if absent, so
-- a re-run is a no-op rather than a second constraint.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_members_manager_same_org') then
    alter table public.org_members drop constraint if exists org_members_manager_id_fkey;
    alter table public.org_members
      add constraint org_members_manager_same_org
      foreign key (manager_id, org_id) references public.org_members(id, org_id)
      on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'org_members_role_same_org') then
    alter table public.org_members
      add constraint org_members_role_same_org
      foreign key (role_id, org_id) references public.roles(id, org_id)
      on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'wfh_decided_by_same_org') then
    alter table public.wfh_requests drop constraint if exists wfh_requests_decided_by_fkey;
    alter table public.wfh_requests
      add constraint wfh_decided_by_same_org
      foreign key (decided_by, org_id) references public.org_members(id, org_id)
      on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leave_decided_by_same_org') then
    alter table public.leave_requests drop constraint if exists leave_requests_decided_by_fkey;
    alter table public.leave_requests
      add constraint leave_decided_by_same_org
      foreign key (decided_by, org_id) references public.org_members(id, org_id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_org_members_role on public.org_members(org_id, role_id);
