-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Saved views (one table), for HANDOFF-V8 Part 4 Unit 2
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §13, DESIGN-DIRECTION §6/§8.
--
-- ⚠ The brief says "migration 0041+". 0041 (Petty Finance) and 0042
--   (receivable write-off) have both been consumed since it was written, so
--   this is 0043.
--
-- ONE TABLE, AND ONE COLUMN FOR THE WHOLE FILTER SET. Both are deliberate.
--
-- Every list screen Phase 11 shipped keeps its filter state in the URL and
-- resolves it on the SERVER from `searchParams` — `/finance/payments` reads
-- `stage[] · q · dues`, `/finance/receivables` reads `bucket · q`. So a saved
-- view is a NAME plus a QUERY STRING, and applying one is a plain link.
--
-- A column per filter would have been the obvious alternative and is the wrong
-- shape twice over: it needs a migration every time a screen gains a filter,
-- and it lets the stored filter and the screen's own parser drift apart. The
-- canonicalisation that decides what may go in `query` lives in
-- lib/saved-views-model.ts, where a test can read it, and drops any param the
-- screen does not itself resolve.
--
-- THE CHOSEN COLUMNS RIDE IN THE SAME STRING (`?cols=a,b,c`). "The column
-- chooser persists alongside the saved view" is therefore one stored value,
-- not two that could disagree about which view you are looking at.
--
-- ⚠ SCOPED TO A PERSON, NOT JUST A TENANT. One person's saved filters are not
--   another's. `member_id` is NOT NULL and carries a COMPOSITE foreign key
--   `(member_id, org_id) → org_members(id, org_id)`, per the rule 0035 set:
--   a plain `references org_members(id)` would let a row in tenant A claim a
--   member of tenant B as its owner, and a composite FK is the only way
--   Postgres can express "same tenant" with RLS off.
--
-- ⛔ NO STORED COUNTS, NO STORED RESULTS. A saved view stores the QUESTION,
--    never the answer — the rows are recomputed by the screen's own engine on
--    every visit, so a view saved in March cannot show March's money in
--    September (HARD RULE 6).
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts; the table is
--    registered in lib/data/tables.ts and asserted in scripts/verify.mjs.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,

  -- The owner. CASCADE, not SET NULL: a saved view belongs to a person, and a
  -- view with no owner is a row nothing can ever list, delete or apply.
  member_id  uuid not null,

  -- The screen key from lib/saved-views-model.ts (`finance.payments`). Text
  -- rather than an enum because the registry is application vocabulary and
  -- adding a screen must not need a migration; an unknown key is simply not
  -- listed by any screen.
  screen     text not null,

  name       text not null,

  -- The canonical query string, WITHOUT a leading `?`. Empty string is legal
  -- and means "the unfiltered screen" — a perfectly reasonable view to save.
  query      text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The composite, same-tenant owner FK. Added separately so a re-run over an
-- existing table still installs it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'saved_views_member_same_org'
  ) then
    alter table public.saved_views
      add constraint saved_views_member_same_org
      foreign key (member_id, org_id)
      references public.org_members(id, org_id) on delete cascade;
  end if;

  -- The name cap the UI shows and lib/saved-views-model.ts::validateViewName
  -- enforces. Stated here too, because a limit only the browser knows is not a
  -- limit — the precedent 0040 set for `roles.description`.
  if not exists (
    select 1 from pg_constraint where conname = 'saved_views_name_len'
  ) then
    alter table public.saved_views
      add constraint saved_views_name_len
      check (char_length(name) between 1 and 40);
  end if;
end $$;

-- Saving a name you already used REPLACES that view rather than making a
-- second one with the same label — the screen offers "Save current view" and
-- two chips reading "Overdue only" would be unusable. Case-insensitive for the
-- same reason the holidays index is: "overdue" and "Overdue" are one name to
-- whoever is reading the chip row. Scoped to the OWNER, so two people may each
-- have their own "Overdue only".
create unique index if not exists uq_saved_views_owner_screen_name
  on public.saved_views(org_id, member_id, screen, lower(name));

-- The only read this table has: one person's views for one screen.
create index if not exists idx_saved_views_owner_screen
  on public.saved_views(org_id, member_id, screen);
