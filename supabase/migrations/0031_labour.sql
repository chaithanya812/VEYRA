-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Labour Report: one day's headcount, segregable by trade and vendor
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §9.6, frames `105620` (overview), `105638` (the attendance dialog),
-- `105659` / `105706` (the multi-selects), `105716` (analytics).
--
-- The owner flagged the attendance dialog as the tricky part and he is right.
-- One row is: a DATE, a set of CATEGORIES, a set of VENDORS, one CONTRACT, and
-- three integer counts. Three facts follow from that, and they are the whole
-- schema:
--
-- 1. **THERE IS NO `total` COLUMN.** `105620` shows 34 + 25 + 12 = 71 and those
--    numbers must reconcile every time anyone looks. A stored total is a number
--    that can disagree with its own parts after one bad update; a derived total
--    cannot. Skilled/unskilled/coordinator are the facts, everything else is
--    arithmetic. (Same reason `milestones` stores pct and amount but no running
--    balance.)
--
-- 2. **CATEGORIES AND VENDORS ARE ROWS, NOT COMMA-JOINED STRINGS.** The frame's
--    dialog is a searchable multi-select on both, and `Labour by Category` is a
--    donut — you cannot group by a substring. This is the same shape
--    `contract_categories` took in 0030, for the same reason.
--
-- 3. **`No Vendor` IS A REAL, VALID ANSWER** (it appears in the frame's table).
--    It is modelled as an entry with NO vendor rows, not as a magic vendor
--    called "No Vendor" — a tenant who later creates a vendor with that name
--    must not silently absorb a year of unattributed labour.
--
-- THE TRADE VOCABULARY IS NOT DEFINED HERE. It lives in `workspace_options`
-- under kind `labour_category`, already seeded with the nine trades from
-- `105659` and already shared with vendor contract categories (§9.3). A tenant
-- renames "False Ceiling POP Work" once and both modules follow. Do not seed a
-- second list, and do not add an enum here.
--
-- `client_visible` is per ROW, matching milestones (0032) and site photos
-- (0038) — the flag `components/ui/patterns.tsx::ClientVisibleToggle` says it
-- honours "milestones, site photos, labour". The frame puts a single switch in
-- the header; per-row is strictly more expressive and the header control
-- becomes a filter over it, which is what somebody sending a progress report
-- actually needs.
--
-- ATTACHMENTS ARE PROJECT FILES. `project_files.labour_entry_id` joins them,
-- exactly as `payment_id` (0037) and `contract_id` (0030) do. There is ONE file
-- model in this codebase and this does not become the fourth exception.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── One day's attendance on one project ─────────────────────────────────────
create table if not exists public.labour_entries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  -- NOT NULL: labour that names no project is labour nobody can cost.
  project_id     uuid not null references public.projects(id) on delete cascade,

  entry_date     date not null default current_date,
  -- The labour contract this day sits under. Optional: `No Contract` is a
  -- legend entry in `105716`'s donut, so it is a real state, not missing data.
  contract_id    uuid references public.contracts(id) on delete set null,

  -- The three counts, and nothing derived from them.
  skilled        int not null default 0 check (skilled     >= 0),
  unskilled      int not null default 0 check (unskilled   >= 0),
  coordinator    int not null default 0 check (coordinator >= 0),

  remark         text,
  client_visible boolean not null default false,

  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Trades on that day (workspace_options kind `labour_category`) ───────────
create table if not exists public.labour_entry_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  entry_id   uuid not null references public.labour_entries(id) on delete cascade,
  -- The option's `value` slug, not its label: renaming a trade must not orphan
  -- a year of history.
  category   text not null,
  created_at timestamptz not null default now(),
  unique (entry_id, category)
);

-- ── Vendors who supplied that labour ────────────────────────────────────────
create table if not exists public.labour_entry_vendors (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  entry_id   uuid not null references public.labour_entries(id) on delete cascade,
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entry_id, vendor_id)
);

-- ── An attachment is a project file, not a fourth file model ────────────────
alter table public.project_files
  add column if not exists labour_entry_id uuid
  references public.labour_entries(id) on delete set null;

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_labour_entries_org_project
  on public.labour_entries(org_id, project_id, entry_date desc);
create index if not exists idx_labour_entries_contract
  on public.labour_entries(org_id, contract_id);
create index if not exists idx_labour_entries_client_visible
  on public.labour_entries(org_id, project_id, client_visible);
create index if not exists idx_labour_entry_categories_entry
  on public.labour_entry_categories(org_id, entry_id);
create index if not exists idx_labour_entry_categories_category
  on public.labour_entry_categories(org_id, category);
create index if not exists idx_labour_entry_vendors_entry
  on public.labour_entry_vendors(org_id, entry_id);
create index if not exists idx_labour_entry_vendors_vendor
  on public.labour_entry_vendors(org_id, vendor_id);
create index if not exists idx_project_files_labour_entry
  on public.project_files(org_id, labour_entry_id);
