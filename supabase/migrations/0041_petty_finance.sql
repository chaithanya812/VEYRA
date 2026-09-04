-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Petty Finance: three columns on `expense_claims`
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §12.2, frame `110521`. HANDOFF-V8 Part 3 Unit 3.
--
-- ⚠ EXTENDS `expense_claims` (0023). DOES NOT DUPLICATE IT.
--   A `petty_transactions` table would have been a second expense ledger, and
--   this codebase has already paid for that mistake twice (six private line
--   tables the scope-item spine had to repair; two stage editors writing to two
--   tables). Petty Finance IS the expense claim ledger, seen per person instead
--   of per project. So it takes columns, not a table.
--
-- What was genuinely missing from `110521`, and nothing else:
--
--   `kind`        The frame's centre toggle is `All Expenses | All Funds` and
--                 every user card carries BOTH lines plus a balance. A fund is
--                 petty cash handed TO a person; an expense is what they spent.
--                 Same person, same month, same ledger, opposite sign — which
--                 is one column, not one table.
--
--   `reversal_of` `110521` puts "View Reversed Transactions" behind a CHECKBOX,
--                 exactly as `105403` does for project payments. HARD RULE 4:
--                 a reversal is a NEW row pointing at what it cancels, never a
--                 delete. `lib/payments-ledger-model.ts::buildLedger` already
--                 hides both halves of a pair and excludes them from the total;
--                 this column is what lets `expense_claims` be fed to it.
--
--   `vendor_id`   `110521`'s ledger has a Vendor column. Nullable, because most
--                 petty spend has no vendor at all.
--
-- ⚠ WHAT THIS DOES **NOT** ADD, ON PURPOSE.
--   A `recorded_on` column. Transaction Date and Recorded Date are two separate
--   columns in the frame and `expense_claims` ALREADY has both: `spent_on` is
--   the date a person types, `created_at` is stamped and cannot be. Adding a
--   typeable recorded date would let somebody edit the audit trail.
--   No balance column either — HARD RULE 6, totals are derived. Balance is
--   funds − expenses, computed in `lib/petty-finance-model.ts`.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- Expense (money spent) or fund (petty cash received). Defaulted, so every
-- existing claim stays exactly what it always was.
alter table public.expense_claims
  add column if not exists kind text not null default 'expense';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expense_claims_kind_check'
  ) then
    alter table public.expense_claims
      add constraint expense_claims_kind_check
      check (kind in ('expense', 'fund'));
  end if;
end $$;

-- The reversal link. A row with this set is the correcting entry; the row it
-- points at is the one being corrected. Both remain, forever.
--
-- A COMPOSITE FK, per 0035's rule: a plain `references expense_claims(id)`
-- would let one tenant's row claim to reverse another tenant's, and Postgres
-- has no other way to say "same tenant". The unique below is what makes the
-- composite target legal; `id` is already the primary key, so it costs nothing.
alter table public.expense_claims
  add column if not exists reversal_of uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expense_claims_id_org_key'
  ) then
    alter table public.expense_claims
      add constraint expense_claims_id_org_key unique (id, org_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expense_claims_reversal_same_org_fk'
  ) then
    alter table public.expense_claims
      add constraint expense_claims_reversal_same_org_fk
      foreign key (reversal_of, org_id)
      -- CASCADE, not SET NULL: `org_id` is NOT NULL, so a SET NULL would try to
      -- null half a composite key and fail at delete time. Nothing in the app
      -- deletes a claim (the ledger is append-only and `withOrg` has no generic
      -- delete), so in practice this only ever fires under an org cascade,
      -- where both halves of the pair are going anyway.
      references public.expense_claims(id, org_id) on delete cascade;
  end if;
end $$;

-- `110521`'s Vendor column. Null is the normal case for petty spend.
alter table public.expense_claims
  add column if not exists vendor_id uuid
    references public.vendors(id) on delete set null;

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- The frame's month stepper reads one org, one kind, one month at a time.
create index if not exists idx_expense_claims_org_kind_spent
  on public.expense_claims(org_id, kind, spent_on desc);
create index if not exists idx_expense_claims_org_reversal
  on public.expense_claims(org_id, reversal_of);
