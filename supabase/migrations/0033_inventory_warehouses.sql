-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Inventory: company vs project warehouses, bins, and stock documents
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §10.2, frames `110109` (Warehouse/Site) and `110101` (Transaction
-- History).
--
-- THREE THINGS, and each is a shape the current schema cannot express.
--
-- 1. `Company Warehouses` | `Project Warehouses` — the split the owner named.
--    0014's `warehouses` has neither a kind nor a project; 0028 gave it a
--    `project_id`, which is half the answer. The other half is `kind`, because
--    "no project" and "company-owned" are not the same statement: the first is
--    missing data, the second is a decision.
--
--    ⚠ ONLY HALF OF THAT INVARIANT IS A DATABASE CHECK, on purpose.
--    `kind = 'company' ⇒ project_id is null` is always true and is enforced
--    here. The mirror — `kind = 'project' ⇒ project_id is not null` — is NOT,
--    because 0028 attached this FK `on delete set null` and a check would then
--    turn "delete a project" into "delete refused", or force a cascade that
--    would take a warehouse's whole stock history with it. Stock is real after
--    the project is gone, the same way the money is (§12.2). So the second
--    half is enforced on write in lib/data/inventory.ts, and a warehouse whose
--    project has since been removed renders as orphaned rather than silently
--    re-labelling itself a company warehouse.
--
-- 2. Sub-locations / bins — `110109` shows `1st Warehouse ❯`, an expander.
--    A bin is a warehouse inside a warehouse: `parent_id`, self-referencing,
--    cascading, so emptying a warehouse cannot leave orphan bins behind.
--
--    Uniqueness is SCOPED, exactly as project folders are (0029): two projects
--    may each own a "Site store", and two warehouses may each own a "Rack A".
--    A name is unique within its container, never globally.
--
-- 3. `110101`'s `Id` column is `DZY-GRN-nnn` — a stock movement belongs to a
--    DOCUMENT, and Transaction History lists documents, not raw ledger rows.
--    0014 created `grns` and `stock_movements` and never linked them, so a
--    receipt of nine lines was nine unrelated rows and its GRN number pointed
--    at nothing. `stock_movements.grn_id` is that link.
--
--    `direction` on the document, because the frame's toggle is
--    `Stock In | Stock Out` over one Id column. An inward note is a GRN; an
--    outward one is an issue note, numbered from its own series (DOC_TYPES
--    gains `stock_issue`). Calling an issue note a GRN would be a naming lie
--    in a register an auditor reads.
--
--    ⛔ NO `qty` AND NO `amount` COLUMN ON `grns`. Both are SUMS over the
--    linked movements. A stored total is a second answer to a question the
--    ledger already answers, and the two drift the first time a line is
--    corrected. scripts/verify.mjs asserts selecting either one fails.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Company vs project warehouses ────────────────────────────────────────
alter table public.warehouses
  add column if not exists kind text not null default 'company';

-- 0028 already added this; repeated so a fresh database built from these files
-- in filename order does not depend on 0028 having run first.
alter table public.warehouses
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- One-time backfill: a warehouse 0028 matched to a project IS a project
-- warehouse. Guarded so a second run cannot re-classify a row somebody has
-- since moved back to the company.
do $$
begin
  if not exists (
    select 1 from public.warehouses where kind = 'project'
  ) then
    update public.warehouses
       set kind = 'project'
     where project_id is not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'warehouses_kind_check'
       and conrelid = 'public.warehouses'::regclass
  ) then
    alter table public.warehouses
      add constraint warehouses_kind_check check (kind in ('company', 'project'));
  end if;

  -- The half that is always true (see the header for why only this half).
  if not exists (
    select 1 from pg_constraint
     where conname = 'warehouses_company_has_no_project'
       and conrelid = 'public.warehouses'::regclass
  ) then
    alter table public.warehouses
      add constraint warehouses_company_has_no_project
      check (kind <> 'company' or project_id is null);
  end if;
end $$;

-- ── 2. Sub-locations / bins ─────────────────────────────────────────────────
alter table public.warehouses
  add column if not exists parent_id uuid references public.warehouses(id) on delete cascade;

create index if not exists idx_warehouses_org_parent
  on public.warehouses(org_id, parent_id);
create index if not exists idx_warehouses_org_kind
  on public.warehouses(org_id, kind);

-- Scoped uniqueness, three ways — the 0029 pattern. Case-insensitive, because
-- "Site Store" and "site store" are the same shelf to the person standing at it.
create unique index if not exists uq_warehouses_company_name
  on public.warehouses(org_id, lower(name))
  where parent_id is null and kind = 'company';

create unique index if not exists uq_warehouses_project_name
  on public.warehouses(org_id, project_id, lower(name))
  where parent_id is null and kind = 'project';

create unique index if not exists uq_warehouses_bin_name
  on public.warehouses(org_id, parent_id, lower(name))
  where parent_id is not null;

-- ── 3. Stock documents ──────────────────────────────────────────────────────
alter table public.grns
  add column if not exists direction text not null default 'in';

alter table public.grns
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

-- Who typed it, and against what. `recorded_by` (0014) is the user id; the
-- reference is the vendor's own bill/challan number.
alter table public.grns
  add column if not exists reference text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'grns_direction_check'
       and conrelid = 'public.grns'::regclass
  ) then
    alter table public.grns
      add constraint grns_direction_check check (direction in ('in', 'out'));
  end if;
end $$;

-- Numbers are unique WITHIN a tenant; two orgs may both run GRN/2026-27/0001.
create unique index if not exists uq_grns_org_number
  on public.grns(org_id, grn_no)
  where grn_no is not null;

create index if not exists idx_grns_org_direction
  on public.grns(org_id, direction, recorded_at desc);
create index if not exists idx_grns_org_warehouse
  on public.grns(org_id, warehouse_id);

-- The link 0014 forgot. `set null` and not `cascade`: discarding a document
-- must never delete the ledger rows that prove goods moved.
alter table public.stock_movements
  add column if not exists grn_id uuid references public.grns(id) on delete set null;

create index if not exists idx_stock_moves_org_grn
  on public.stock_movements(org_id, grn_id);
create index if not exists idx_stock_moves_org_warehouse
  on public.stock_movements(org_id, warehouse_id, created_at desc);

-- ── 4. The Expense StockIn queue (PLAN-V4 §10.2 ← §9.4) ────────────────────
-- 0037 gave a payment `stock_in_requested`. What was missing is what happened
-- NEXT: a flagged expense is a queue item, and a queue with no way to leave it
-- is a list that only grows. `stock_in_grn_id` is the receipt that answers it.
alter table public.payments
  add column if not exists stock_in_grn_id uuid references public.grns(id) on delete set null;

create index if not exists idx_payments_org_stock_in
  on public.payments(org_id, stock_in_requested)
  where stock_in_requested = true;

-- ── 5. The link that was already there, in text ─────────────────────────────
-- Before 0033 a stock-in wrote its GRN number into `source_doc` as a STRING.
-- That is not invented history — it is a link that was recorded and then had
-- nowhere to go. Matching it back is exact: same tenant, and `source_doc`
-- equal to a real `grn_no`, which is unique per tenant (the index above).
--
-- Anything that does NOT match stays unlinked and is shown as such. A movement
-- whose document cannot be proved does not get given one, the same way an RFQ
-- awarded before the award reason existed says "No reason recorded".
update public.stock_movements m
   set grn_id = g.id
  from public.grns g
 where g.org_id = m.org_id
   and g.grn_no is not null
   and m.grn_id is null
   and m.source_doc = g.grn_no;
