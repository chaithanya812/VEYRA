-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — projects join by id, not by name
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §7.3. Twelve tables across eight migrations linked to a project by a
-- free-text `project_label`, several with comments claiming *"no projects table
-- in this workspace"* — but `projects` has existed since migration 0007.
-- Parallel workers each invented the same false assumption in isolation.
--
-- The damage is visible at lib/data/reports.ts:288, where projectProfitability()
-- joins `projects.name = payments.project_label`. **A string-equality join
-- produces the flagship per-project P&L.** Rename a project and its P&L
-- silently empties; two projects with the same name merge into one.
--
-- This adds a real FK to all twelve and backfills by name. `project_label` is
-- KEPT, deliberately:
--
--   * rows whose label never matched anything still say what they meant, and
--   * a label typed before the project existed is evidence, not noise.
--
-- Reads move to `project_id` and fall back to the label only for display. The
-- backfill matches on trimmed, case-insensitive name and refuses to guess when
-- a name is ambiguous — two projects called "Sharma Residence" leave their rows
-- unmatched rather than being silently assigned to whichever sorts first.
--
-- Run `node scripts/db.mjs sql "select * from public.v_project_label_unmatched"`
-- afterwards to see what did not match, per table, with counts. Reporting the
-- misses is the point: a backfill that quietly drops rows is worse than no
-- backfill.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── The FK, on every table that carries a label ─────────────────────────────
alter table public.assets               add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.boms                 add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.contracts            add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.cutlists             add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.measurement_variance add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.payments             add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.purchase_orders      add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.rfqs                 add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.site_attendance      add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.site_logs            add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.site_photos          add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.warehouses           add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists idx_assets_org_project               on public.assets(org_id, project_id);
create index if not exists idx_boms_org_project                 on public.boms(org_id, project_id);
create index if not exists idx_contracts_org_project            on public.contracts(org_id, project_id);
create index if not exists idx_cutlists_org_project             on public.cutlists(org_id, project_id);
create index if not exists idx_measurement_variance_org_project on public.measurement_variance(org_id, project_id);
create index if not exists idx_payments_org_project             on public.payments(org_id, project_id);
create index if not exists idx_purchase_orders_org_project      on public.purchase_orders(org_id, project_id);
create index if not exists idx_rfqs_org_project                 on public.rfqs(org_id, project_id);
create index if not exists idx_site_attendance_org_project      on public.site_attendance(org_id, project_id);
create index if not exists idx_site_logs_org_project            on public.site_logs(org_id, project_id);
create index if not exists idx_site_photos_org_project          on public.site_photos(org_id, project_id);
create index if not exists idx_warehouses_org_project           on public.warehouses(org_id, project_id);

-- ── One resolver, used by every backfill below ──────────────────────────────
-- Case-insensitive, whitespace-trimmed, and NULL when the name is ambiguous
-- within the org. Ambiguity is a real condition here: `projects.name` has no
-- unique constraint.
create or replace function public.resolve_project_by_label(p_org uuid, p_label text)
returns uuid
language sql
stable
as $$
  -- Exactly one match, or nothing. Ambiguity is real: projects.name has no
  -- unique constraint, and guessing between two "Sharma Residence" rows would
  -- put money on the wrong project.
  select case when count(*) = 1 then (array_agg(p.id))[1] end
    from public.projects p
   where p.org_id = p_org
     and lower(btrim(p.name)) = lower(btrim(p_label))
$$;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Only touches rows that have a label and no id yet, so re-running is a no-op
-- and a hand-corrected row is never overwritten.
do $$
declare
  t text;
begin
  foreach t in array array[
    'assets', 'boms', 'contracts', 'cutlists', 'measurement_variance',
    'payments', 'purchase_orders', 'rfqs', 'site_attendance', 'site_logs',
    'site_photos', 'warehouses'
  ]
  loop
    execute format(
      'update public.%I set project_id = public.resolve_project_by_label(org_id, project_label)
        where project_id is null
          and project_label is not null
          and btrim(project_label) <> ''''',
      t
    );
  end loop;
end $$;

-- Two tables already carried both columns; bring them onto the same footing.
update public.material_requests
   set project_id = public.resolve_project_by_label(org_id, project_label)
 where project_id is null and project_label is not null and btrim(project_label) <> '';
update public.expense_claims
   set project_id = public.resolve_project_by_label(org_id, project_label)
 where project_id is null and project_label is not null and btrim(project_label) <> '';

-- ── What did not match ──────────────────────────────────────────────────────
-- A view, not a printed count, so it stays checkable long after this ran.
create or replace view public.v_project_label_unmatched as
select 'assets'               as table_name, org_id, project_label, count(*) as rows from public.assets               where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'boms',                 org_id, project_label, count(*) from public.boms                 where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'contracts',            org_id, project_label, count(*) from public.contracts            where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'cutlists',             org_id, project_label, count(*) from public.cutlists             where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'measurement_variance', org_id, project_label, count(*) from public.measurement_variance where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'payments',             org_id, project_label, count(*) from public.payments             where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'purchase_orders',      org_id, project_label, count(*) from public.purchase_orders      where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'rfqs',                 org_id, project_label, count(*) from public.rfqs                 where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'site_attendance',      org_id, project_label, count(*) from public.site_attendance      where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'site_logs',            org_id, project_label, count(*) from public.site_logs            where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'site_photos',          org_id, project_label, count(*) from public.site_photos          where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'warehouses',           org_id, project_label, count(*) from public.warehouses           where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'material_requests',    org_id, project_label, count(*) from public.material_requests    where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3
union all select 'expense_claims',       org_id, project_label, count(*) from public.expense_claims       where project_id is null and coalesce(btrim(project_label), '') <> '' group by 1,2,3;
