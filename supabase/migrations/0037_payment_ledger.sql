-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Project Payments: the expense/fund ledger
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §9.4, frames `105403` (listing), `105429` (add expense),
-- `105444` (add fund).
--
-- ⚠ WHY 0037 AND NOT A RESERVED NUMBER. `PLAN-V4 §15` reserves 0030–0036 and
-- says "do not renumber". Every one of those is spoken for by a different
-- module (0031 labour, 0033 warehouses, 0034 HR, 0035 audit, 0036 material
-- request stages), and §9.4 was never given a slot because the plan assumed
-- Project Payments needed no schema of its own. It does — the listing in
-- `105403` has columns `payments` has never carried. So this takes the next
-- number past the reserved block rather than squatting on someone else's.
--
-- ⚠ WHAT THIS DOES **NOT** ADD, ON PURPOSE:
--
--   Transaction Date and Recorded Date are two separate columns in `105403`
--   ("when it happened" vs "when it was entered"), and `payments` ALREADY has
--   both: `paid_on` is the transaction date a person types, `created_at` is
--   the moment the row was written and can never be typed. Adding a
--   `recorded_on` column would let someone edit the audit trail, which is the
--   opposite of what that column is for.
--
--   Expense Source (`CompanyAccount` / `Cash`) is `mode`, which already exists.
--
-- ⚠ REVERSALS ARE ROWS (HARD RULE 4). `105403` puts "View Reversed
-- Transactions" behind a CHECKBOX, not a delete — because the money really did
-- move and un-happening it is a lie. So a reversal is a NEW row with a negative
-- amount whose `reversal_of` points at the entry it cancels. Both stay in the
-- ledger; the checkbox decides whether you look at them. Nothing is ever
-- deleted, which is what makes the ledger foot.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- Who the money went to. Nullable: `105403` has expenses with no vendor at all.
alter table public.payments
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

-- Who spent or collected it — "Expense By" (`105403`) / "Collected By"
-- (`105444`). A real member, not a typed name, so it can be totalled per person
-- for Petty Finance (§12.2).
alter table public.payments
  add column if not exists member_id uuid references public.org_members(id) on delete set null;

-- `105403`: Material / Labour / Labour+Material / Professional Services.
alter table public.payments
  add column if not exists expense_type text;

-- `105403`: Paint Works / Carpentry Works / Electrical Works / …
-- Vocabulary is workspace_options(kind = 'labour_category') — the SAME trade
-- list as vendor contract categories and labour attendance.
alter table public.payments
  add column if not exists category text;

-- The reversal link. A row with this set is the correcting entry; the row it
-- points at is the one being corrected. Both remain, forever.
alter table public.payments
  add column if not exists reversal_of uuid references public.payments(id) on delete set null;

-- `105429`'s ☐ Stock-In Request — ticking it is what populates "Expense
-- StockIn" in Inventory (`110109`, §10.2).
alter table public.payments
  add column if not exists stock_in_requested boolean not null default false;

-- A receipt is a project file carrying a payment id — the same private bucket,
-- versions and comment thread as every other document. A `payment_receipts`
-- table would have reimplemented all of it.
alter table public.project_files
  add column if not exists payment_id uuid references public.payments(id) on delete set null;

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_payments_org_project_direction
  on public.payments(org_id, project_id, direction);
create index if not exists idx_payments_org_vendor
  on public.payments(org_id, vendor_id);
create index if not exists idx_payments_org_member
  on public.payments(org_id, member_id);
create index if not exists idx_payments_reversal
  on public.payments(org_id, reversal_of);
create index if not exists idx_project_files_payment
  on public.project_files(org_id, payment_id);
