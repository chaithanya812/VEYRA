-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Account Receivables: writing one milestone off
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §12.3, frame `110534`. HANDOFF-V8 Part 3 Unit 4.
--
-- ⚠ EXTENDS `milestones` (0015). DOES NOT ADD A RECEIVABLES TABLE.
--   Account Receivables re-enters nothing: every row on `110534` is a payment
--   milestone the Financial Planning schedule already wrote. The only thing
--   the frame asks for that the schedule cannot answer is its fourth tile,
--   `Written Off Payments` — and "we have stopped expecting this money" is a
--   fact about the milestone, not a second record of it.
--
-- ⚠ WHY THREE COLUMNS AND NOT A FLAG.
--   Writing off a receivable is a DECISION with money attached. A boolean would
--   record that somebody did it and destroy who, when and why — the three
--   things an auditor, a client and next year's principal all ask first.
--   `written_off_by` + `written_off_at` + `write_off_reason` is the smallest
--   honest shape.
--
-- ⚠ WHAT THIS DOES **NOT** DO, ON PURPOSE.
--   It does not zero `amount`, and there is no delete anywhere near it. The
--   milestone keeps its full value forever; what changes is that the firm has
--   given up on collecting it, and both figures stay visible on the screen.
--   HARD RULE 4 in spirit and HARD RULE 6 in fact — no written-off TOTAL is
--   stored either; the tile is Σ of the rows carrying a `written_off_at`.
--
-- The CHECK below is the invariant made unrepresentable rather than documented:
-- a write-off without a reason cannot exist in this database.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.milestones
  add column if not exists written_off_at timestamptz;

alter table public.milestones
  add column if not exists write_off_reason text;

-- A COMPOSITE FK, per 0035's rule: `references org_members(id)` alone would let
-- another tenant's member be recorded as the person who wrote off your money,
-- and a composite key is the only way Postgres can say "same tenant".
alter table public.milestones
  add column if not exists written_off_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'milestones_written_off_by_same_org_fk'
  ) then
    alter table public.milestones
      add constraint milestones_written_off_by_same_org_fk
      foreign key (written_off_by, org_id)
      -- SET NULL is impossible here (org_id is NOT NULL and is half the key),
      -- so the decision outlives the person: removing a member leaves the
      -- write-off standing and RESTRICTs the delete, which is the correct
      -- behaviour for an accounting decision anyway.
      references public.org_members(id, org_id);
  end if;

  -- Who and why travel together or not at all. A write-off nobody can explain
  -- is the one shape this column must not be able to take.
  if not exists (
    select 1 from pg_constraint where conname = 'milestones_write_off_complete_check'
  ) then
    alter table public.milestones
      add constraint milestones_write_off_complete_check
      check (
        (written_off_at is null and write_off_reason is null)
        or (written_off_at is not null and coalesce(btrim(write_off_reason), '') <> '')
      );
  end if;
end $$;

-- `110534` reads one org's written-off milestones as a tile of its own.
create index if not exists idx_milestones_org_written_off
  on public.milestones(org_id, written_off_at)
  where written_off_at is not null;

-- The receivables table is aged by due date across one org.
create index if not exists idx_milestones_org_due
  on public.milestones(org_id, tentative_due);
