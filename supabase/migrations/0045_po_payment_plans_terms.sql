-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Procurement: PO payment-plan library + PO terms library (v1)
-- ════════════════════════════════════════════════════════════════════════════
-- A purchase order today has an amount and a payment_state and nothing about
-- HOW it gets paid. Real POs carry a schedule ("25% advance, 45% on delivery,
-- 30% on installation") and a block of terms. Both are tenant-authored
-- LIBRARIES configured once in Settings, then optionally attached to a PO.
--
-- WHY two new libraries, not a reuse of quotation_terms / quotation-studio:
--   a PO's terms are not a quote's terms (owner decision Q2). `po_terms` is
--   modelled on `quotation_terms` but is its own table. Payment-plan
--   milestones are a child TABLE, never jsonb — rich per-line data is an FK
--   child in this codebase, and there is zero jsonb precedent for it.
--
-- ⚠ CONFIG, NOT LLM (PLAN §8): every pct is typed by a person. The rupee
--   figure on a milestone is DERIVED at render as pct% × purchase_orders.amount
--   (allocateMilestoneAmounts in lib/po-plan-model.ts) and is NEVER stored.
--   `purchase_orders.amount` is the pre-existing stored Σ of line totals and
--   is not touched here.
--
-- Attaching is optional. Both new columns on purchase_orders are nullable
-- SOFT LINKS (mirror rfqs.mr_id): deleting a plan or a terms row must never
-- cascade away a PO, so there is no FK from the PO header to either library.
--
-- ⛔ RLS OFF — owner decision; NO policies are created anywhere in this file.
--   org_id uuid not null references public.orgs(id) on delete cascade guards
--   every new table, and isolation is enforced exclusively in application
--   code via lib/data/with-org.ts. The three new tables join the tenant
--   allowlist in lib/data/tables.ts.
--
-- Additive migration; idempotent (`if not exists` everywhere).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Payment-plan header (the named schedule a tenant reuses) ────────────────
create table if not exists public.po_payment_plans (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,

  name       text not null,
  is_demo    boolean not null default false,
  is_active  boolean not null default true,

  created_by uuid,
  created_at timestamptz not null default now()
);

-- ── Milestones: pct only — the rupee amount is derived at render, never stored
create table if not exists public.po_payment_plan_milestones (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  plan_id    uuid not null references public.po_payment_plans(id) on delete cascade,

  label      text not null,
  pct        numeric(5,2) not null,            -- typed by a person; never an LLM
  sort       int not null default 0,

  created_at timestamptz not null default now()
);

-- ── PO terms library (independent of quotation_terms) ───────────────────────
create table if not exists public.po_terms (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,

  title      text not null,
  body       text not null,
  is_default boolean not null default false,
  seq        int not null default 0,
  is_active  boolean not null default true,
  is_demo    boolean not null default false,

  created_by uuid,
  created_at timestamptz not null default now()
);

-- Soft links on the PO header. Nullable; no FK. Deleting a library row must
-- never cascade away a purchase order (same reasoning as rfqs.mr_id).
alter table public.purchase_orders
  add column if not exists payment_plan_id uuid;
alter table public.purchase_orders
  add column if not exists po_terms_id uuid;

-- Same-org composite FK on the milestone → plan relationship. A plain
-- `references po_payment_plans(id)` would let a row in tenant A claim a plan
-- of tenant B as its parent; the composite is the only way Postgres can say
-- "same tenant" with RLS off (the 0035 rule).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_po_payment_plans_id_org'
  ) then
    alter table public.po_payment_plans
      add constraint uq_po_payment_plans_id_org unique (id, org_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'po_payment_plan_milestones_plan_same_org'
  ) then
    alter table public.po_payment_plan_milestones
      add constraint po_payment_plan_milestones_plan_same_org
      foreign key (plan_id, org_id)
      references public.po_payment_plans(id, org_id)
      on delete cascade;
  end if;
end $$;

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_po_payment_plans_org
  on public.po_payment_plans(org_id, created_at desc);
create index if not exists idx_po_payment_plan_milestones_org_plan
  on public.po_payment_plan_milestones(org_id, plan_id, sort);
create index if not exists idx_po_terms_org
  on public.po_terms(org_id, seq);
create index if not exists idx_pos_org_payment_plan
  on public.purchase_orders(org_id, payment_plan_id);
create index if not exists idx_pos_org_po_terms
  on public.purchase_orders(org_id, po_terms_id);

-- ── Demo seed (known demo tenant only; no-op if that org is absent) ─────────
-- Flagged is_demo = true. The self-clearing "DEMO — sample" box is a later
-- unit; this migration only plants the rows.
insert into public.po_payment_plans (org_id, name, is_demo, is_active)
select o.id, v.name, true, true
from public.orgs o
cross join (values
  ('Residential 25 / 45 / 30'),
  ('Commercial 40 / 40 / 20')
) as v(name)
where o.id = 'd46a53af-58b1-4ed7-87be-c675e5803802'
  and not exists (
    select 1 from public.po_payment_plans p
    where p.org_id = o.id and p.name = v.name
  );

insert into public.po_payment_plan_milestones (org_id, plan_id, label, pct, sort)
select p.org_id, p.id, m.label, m.pct, m.sort
from public.po_payment_plans p
join (values
  ('Residential 25 / 45 / 30', 'Advance',       25.00, 0),
  ('Residential 25 / 45 / 30', 'Delivery',      45.00, 1),
  ('Residential 25 / 45 / 30', 'Installation',  30.00, 2),
  ('Commercial 40 / 40 / 20',  'Advance',       40.00, 0),
  ('Commercial 40 / 40 / 20',  'On dispatch',   40.00, 1),
  ('Commercial 40 / 40 / 20',  'Retention',     20.00, 2)
) as m(plan_name, label, pct, sort) on m.plan_name = p.name
where p.org_id = 'd46a53af-58b1-4ed7-87be-c675e5803802'
  and p.is_demo is true
  and not exists (
    select 1 from public.po_payment_plan_milestones x
    where x.plan_id = p.id and x.label = m.label
  );

insert into public.po_terms (org_id, title, body, is_default, seq, is_active, is_demo)
select o.id, v.title, v.body, v.is_default, v.seq, true, true
from public.orgs o
cross join (values
  (
    'GST exclusive',
    'Prices are exclusive of GST unless stated otherwise. GST will be charged at the rate applicable on the date of invoice, against a tax invoice.',
    true,
    0
  ),
  (
    'Delivery, risk and inspection',
    'Goods remain the vendor''s risk until received at site and inspected. Shortages or damage must be notified within three working days of delivery.',
    false,
    1
  )
) as v(title, body, is_default, seq)
where o.id = 'd46a53af-58b1-4ed7-87be-c675e5803802'
  and not exists (
    select 1 from public.po_terms t
    where t.org_id = o.id and t.title = v.title
  );
