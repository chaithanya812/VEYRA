-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Vendors: working model, an onboarding status, and many categories
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §10.3, frames `110146` / `110215` (list), `110227` (detail),
-- `110234` (Vendor Projects).
--
-- FOUR COLUMNS AND ONE TABLE, and the table is the interesting one.
--
-- 1. `working_model` — `Labour + Material only` / `Material only` /
--    `Labour only` (`110215`). This is not a category and not a tag: it is
--    what the vendor is capable of supplying, and it decides which requests
--    they can even be invited to bid on. A free-text field could not be
--    filtered on, which is exactly what the frame's filter band does.
--
-- 2. `status` — `Created` → `Verified` → `Onboarded`. A vendor you have typed
--    in is not a vendor you have checked, and neither is a vendor who has
--    agreed terms. Collapsing the three into `is_active` (0008) loses the two
--    states in the middle, which are the ones a buyer actually asks about.
--    `is_active` stays what it is: archived or not, orthogonal to progress.
--
-- 3. `country` — `110215` filters Country · State · City and 0008 stopped at
--    state. Defaults to India because that is the market (PLAN §0), not
--    because the column is decorative.
--
-- 4. ⚠ `vendor_categories`, A TABLE AND NOT A COMMA-JOINED STRING.
--    `110215` shows `Carpentry Woodwork + 2`, so Category is genuinely
--    multi-valued. `vendors.category` (0008) holds one, and the temptation is
--    to widen it into "a, b, c" — which cannot be filtered, cannot be counted,
--    and turns "which vendors do POP work" into a substring search that also
--    matches "POP Work Removal".
--
--    This is the same call 0031 made for a labour day's trades and the same
--    one `contract_categories` made for a vendor contract's. Three tables with
--    the same shape is not duplication; one comma-joined string in any of them
--    would be.
--
--    `vendors.category` is NOT dropped — dropping is not additive, and it is
--    backfilled into the new table so the two cannot disagree on day one. It
--    survives as the display fallback for anything the backfill did not reach,
--    the same way `project_label` does (0028).
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1–3. The three scalar columns ───────────────────────────────────────────
alter table public.vendors
  add column if not exists working_model text not null default 'labour_material';

alter table public.vendors
  add column if not exists status text not null default 'created';

alter table public.vendors
  add column if not exists country text not null default 'India';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'vendors_working_model_check'
       and conrelid = 'public.vendors'::regclass
  ) then
    alter table public.vendors
      add constraint vendors_working_model_check
      check (working_model in ('labour_material', 'material', 'labour'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'vendors_status_check'
       and conrelid = 'public.vendors'::regclass
  ) then
    alter table public.vendors
      add constraint vendors_status_check
      check (status in ('created', 'verified', 'onboarded'));
  end if;
end $$;

create index if not exists idx_vendors_org_status
  on public.vendors(org_id, status);
create index if not exists idx_vendors_org_working_model
  on public.vendors(org_id, working_model);

-- ── 4. Categories as rows ───────────────────────────────────────────────────
create table if not exists public.vendor_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  category   text not null,
  created_at timestamptz not null default now()
);

-- A vendor may not carry the same trade twice. Case-insensitive, because
-- "Carpentry Woodwork" and "carpentry woodwork" are the same trade to the
-- person searching for it.
create unique index if not exists uq_vendor_categories_vendor_category
  on public.vendor_categories(org_id, vendor_id, lower(category));

create index if not exists idx_vendor_categories_org_category
  on public.vendor_categories(org_id, lower(category));
create index if not exists idx_vendor_categories_org_vendor
  on public.vendor_categories(org_id, vendor_id);

-- One-time backfill from the single-value column, guarded so a second run
-- cannot resurrect a trade somebody has since removed from a vendor.
do $$
begin
  if not exists (select 1 from public.vendor_categories) then
    insert into public.vendor_categories (org_id, vendor_id, category)
    select v.org_id, v.id, trim(v.category)
      from public.vendors v
     where v.category is not null
       and trim(v.category) <> '';
  end if;
end $$;
