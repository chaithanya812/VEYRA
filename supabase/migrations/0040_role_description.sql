-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — a role can say what it is for
-- ════════════════════════════════════════════════════════════════════════════
-- Frame `110413`: `Role Name` · `Inherit From ▾` · `Description (0/155)`.
--
-- One column. `roles` already carries everything else the Edit Role screen
-- needs — `name`, `is_system` (the Custom/Global split), and `inherits_from`
-- from 0035.
--
-- WHY IT IS WORTH A COLUMN. A role name alone is a guess: "Supervisor" does not
-- say whether that person sees costs. The description is where a tenant records
-- the INTENT behind a grant set, and intent is the thing that is impossible to
-- recover later by reading thirty checkboxes. The frame caps it at 155
-- characters, which is a sentence — deliberately too short to become a policy
-- document nobody reads.
--
-- Nullable, with no default. An empty description and a description that has
-- not been written are the same fact here, and inventing "" for existing roles
-- would claim somebody had considered the question.
--
-- ⛔ RLS STAYS OFF (owner decision). Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.roles
  add column if not exists description text;

-- The frame's counter is `0/155`, so the limit is real rather than advisory.
-- Enforced here as well as in the form: a limit only the browser knows is not a
-- limit, and this column is written by a server action.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'roles_description_length'
  ) then
    alter table public.roles
      add constraint roles_description_length
      check (description is null or char_length(description) <= 155);
  end if;
end $$;
