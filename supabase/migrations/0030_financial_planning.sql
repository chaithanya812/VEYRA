-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Financial Planning: vendor contracts, categories, contract documents
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §9.3, frames `105238` (Inflow) and `105325` (Outflow).
--
-- ⚠ THIS MIGRATION DELIBERATELY DIFFERS FROM THE LEDGER IN `PLAN-V4 §15`.
--
-- The ledger reserves 0030 for `project_contracts`, `contract_milestones` and
-- `contract_documents`. Building those would create a THIRD parallel money
-- model, and the first two already exist:
--
--   `contracts`  (0015) — a project's money agreement, `source` = client
--                 (inflow) or vendor (outflow), with an amount. Migration 0028
--                 already gave it a real `project_id`.
--   `milestones` (0015) — the payment schedule under a contract:
--                 seq · pct · amount · tentative_due · work_done · actual_due.
--                 That is `105238`'s table, column for column.
--
-- Duplicating them is the exact mistake this codebase has already made twice —
-- six private line-item tables that the scope-item spine had to repair, and two
-- editors writing to two different stage tables. `PLAN-V4 §12.2` states the
-- principle for the same situation ("Reuses expense_claims — extend, do not
-- duplicate"), and the owner's standing instruction covers the judgement:
-- *"If you think something's better doing it your way, just do it."*
--
-- So 0030 adds only what is genuinely missing from `105238` / `105325`:
--
--   1. `contracts.vendor_id`   — Outflow attaches a contract to a real vendor,
--                                not a name. Without the FK, Vendor Projects
--                                (`110234`) cannot be built at all.
--   2. `contract_categories`   — `105325` shows Category as MULTI-VALUED per
--                                vendor row ("False Ceiling POP Work, Civil
--                                Masonry Work"), so it is a row per category,
--                                never a comma-joined string.
--   3. `project_files.contract_id` — the Documents tab is *"documents per
--                                vendor, per contract"*. Rather than a second
--                                file table with its own versions, comments and
--                                storage rules, a project file may now also
--                                belong to a contract. One storage layer, one
--                                version model, one comment thread.
--
-- Account Receivables (`110534`, §12.3) therefore reads `milestones` — the same
-- rows planned here. Nothing is re-entered, which is the interconnection the
-- owner asked for.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. A vendor contract points at a real vendor ────────────────────────────
-- Nullable on purpose: `105325` keeps an "Unlisted Vendor / Miscellaneous" row,
-- because ad-hoc spend has to have a home. A null vendor_id IS that row — it is
-- a legitimate state, not missing data.
alter table public.contracts
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

-- What the money is for, when the contract's own name is not enough.
alter table public.contracts
  add column if not exists notes text;

-- ── 2. Categories are rows, not a comma-joined string ───────────────────────
create table if not exists public.contract_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  -- Vocabulary lives in workspace_options (kind = 'labour_category'), shared
  -- with the Labour Report so a tenant renames a trade once, not twice.
  category    text not null,
  created_at  timestamptz not null default now(),
  unique (contract_id, category)
);

-- ── 3. A project file may also belong to a contract ─────────────────────────
-- The whole §9.1 stack comes with it: private bucket, signed URLs, versions as
-- rows, and the shared comment thread. A `contract_documents` table would have
-- had to reimplement every one of those.
alter table public.project_files
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_contracts_org_vendor
  on public.contracts(org_id, vendor_id);
create index if not exists idx_contracts_org_project_source
  on public.contracts(org_id, project_id, source);
create index if not exists idx_contract_categories_contract
  on public.contract_categories(org_id, contract_id);
create index if not exists idx_project_files_contract
  on public.project_files(org_id, contract_id);
