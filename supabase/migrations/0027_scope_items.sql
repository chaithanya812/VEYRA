-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — `scope_items`: the spine every line item hangs off
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §7.2, and the oldest debt in this codebase.
--
-- PLAN §1.1 called the Scope Item *"the architectural heart"* and said
-- *"no module gets its own private line-item table"*. `grep -r scope_item`
-- across migrations 0001–0026 returned zero. Six private line tables were
-- built instead — quotation_lines, material_request_items, rfq_items, po_lines,
-- bom_lines, cutlist_panels — and nothing links a quoted line to the material
-- requested for it, the PO that bought it, or the panel that was cut.
--
-- What that costs, concretely: you cannot answer "we quoted 18 rft of base
-- cabinets — what did we actually buy, cut and install against it?" without a
-- human matching strings. Every screen in PLAN-V4 Phases 7–12 asks a version of
-- that question.
--
-- The shape: one row per thing-in-scope, optionally nested (a room parent with
-- item children, which is exactly how a BOQ reads), owned by a project and
-- traceable back to the quotation it was sold on.
--
-- `scope_item_id` is NULLABLE on every line table on purpose. Nothing breaks on
-- day one, the backfill can be staged, and a line that genuinely has no scope
-- (a miscellaneous freight charge) stays legal.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run. The backfill is re-runnable and
--    never duplicates.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.scope_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,

  -- Where it lives. A scope item usually belongs to a project; one created
  -- while quoting, before the deal is won, has only the quotation.
  project_id   uuid references public.projects(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete set null,

  -- Room → item. A parent carries no quantity; its children do.
  parent_id    uuid references public.scope_items(id) on delete cascade,

  code         text,
  name         text not null,
  room         text,
  uom          text,
  qty          numeric(14,3),
  sort_order   int not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_scope_items_org_project
  on public.scope_items(org_id, project_id, sort_order);
create index if not exists idx_scope_items_org_quotation
  on public.scope_items(org_id, quotation_id);
create index if not exists idx_scope_items_parent
  on public.scope_items(parent_id);

-- ── The six line tables point at it ─────────────────────────────────────────
alter table public.quotation_lines
  add column if not exists scope_item_id uuid references public.scope_items(id) on delete set null;
alter table public.material_request_items
  add column if not exists scope_item_id uuid references public.scope_items(id) on delete set null;
alter table public.rfq_items
  add column if not exists scope_item_id uuid references public.scope_items(id) on delete set null;
alter table public.po_lines
  add column if not exists scope_item_id uuid references public.scope_items(id) on delete set null;
alter table public.bom_lines
  add column if not exists scope_item_id uuid references public.scope_items(id) on delete set null;
alter table public.cutlist_panels
  add column if not exists scope_item_id uuid references public.scope_items(id) on delete set null;

create index if not exists idx_quotation_lines_scope
  on public.quotation_lines(org_id, scope_item_id);
create index if not exists idx_material_request_items_scope
  on public.material_request_items(org_id, scope_item_id);
create index if not exists idx_rfq_items_scope
  on public.rfq_items(org_id, scope_item_id);
create index if not exists idx_po_lines_scope
  on public.po_lines(org_id, scope_item_id);
create index if not exists idx_bom_lines_scope
  on public.bom_lines(org_id, scope_item_id);
create index if not exists idx_cutlist_panels_scope
  on public.cutlist_panels(org_id, scope_item_id);

-- ── Backfill from quotation_lines, the richest existing source ──────────────
-- Sections become room parents; lines become their children.
--
-- Every backfilled row carries its origin in `code` — `QS:<section id>` or
-- `QL:<line id>`. That is what makes this re-runnable and exact: the link-up
-- step joins on the id it came from, not on a name plus a sort order, which
-- would mislink two lines that happen to share both. It also leaves a visible
-- trail showing which scope items were derived rather than authored.

-- 1. A parent per quotation section.
insert into public.scope_items (org_id, quotation_id, project_id, code, name, room, sort_order)
select s.org_id,
       s.quotation_id,
       q.project_id,
       'QS:' || s.id,
       s.title,
       s.title,
       coalesce(s.sort_order, 0)
  from public.quotation_sections s
  join public.quotations q on q.id = s.quotation_id
 where not exists (
   select 1 from public.scope_items x where x.code = 'QS:' || s.id
 );

-- 2. A child per line, under its section's parent when it has one. A line with
--    no section becomes a top-level scope item rather than being skipped.
insert into public.scope_items
       (org_id, quotation_id, project_id, parent_id, code, name, room, uom, qty, sort_order)
select l.org_id,
       l.quotation_id,
       q.project_id,
       parent.id,
       'QL:' || l.id,
       coalesce(nullif(btrim(l.title), ''), 'Line item'),
       coalesce(l.area, s.title),
       l.uom,
       l.qty,
       coalesce(l.sort_order, 0)
  from public.quotation_lines l
  join public.quotations q on q.id = l.quotation_id
  left join public.quotation_sections s on s.id = l.section_id
  left join public.scope_items parent on parent.code = 'QS:' || s.id
 where not exists (
   select 1 from public.scope_items x where x.code = 'QL:' || l.id
 );

-- 3. Point each quotation line at its own scope item — an exact join on the id.
update public.quotation_lines l
   set scope_item_id = x.id
  from public.scope_items x
 where x.code = 'QL:' || l.id
   and l.scope_item_id is distinct from x.id;
