-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Project Procurement: status moves to the LINE ITEM
-- ════════════════════════════════════════════════════════════════════════════
-- PLAN-V4 §9.7, frames `105729` (requests) and `105800` (new request).
--
-- ⚠ THE MOST IMPORTANT SCHEMA CHANGE IN PHASE 8, and it is one column.
--
-- `105729`'s Stage cell does not hold a status. It holds a BREAKDOWN:
--
--       DZY-REQ-164   Order Requested (3) · Ordered (6) · Pending (3) · In Stock (1)
--
-- A request of thirteen items is not "ordered". Six of them are ordered, three
-- are still waiting on an order, three are untouched and one has already
-- landed in stock. VEYRA's single `material_requests.stage` cannot express
-- that, and no amount of UI can rescue a model that says a request has one
-- status when it has four.
--
-- So: **the procurement status lives on the ITEM, and the request's stage is
-- an aggregation.** The tile in the frame proves it — `Total items (177)` with
-- `Pending (39) · RFQ Raised (11) · Ordered (127)`, and 39 + 11 + 127 = 177.
-- Those are counts of ITEMS, not of requests.
--
-- WHAT HAPPENS TO `material_requests.stage`. It is NOT dropped (dropping is not
-- an additive migration, and half the app reads it). It narrows in meaning to
-- the REQUEST's own lifecycle — `draft` (being composed) → `requested` (raised)
-- → `cancelled` — which is a genuinely different question from "where are its
-- items". Procurement progress is read from the items; whether the request has
-- been raised at all is read from here.
--
-- THE BACKFILL RUNS EXACTLY ONCE, guarded on the column not existing yet:
-- every existing item inherits its parent request's stage, so a request that
-- said "ordered" becomes a request whose items all say "ordered" and nothing
-- appears to change. Re-running this file cannot re-stamp items whose stage a
-- person has since moved.
--
-- ALSO HERE, both from `105800`:
--   `request_type` — the frame's `Request Type*` dropdown. `Material` today;
--                    a tenant's service and labour requests want the same
--                    table, not a parallel one.
--   `number`       — `DZY-REQ-170`. Unique per tenant, nullable so the rows
--                    that predate numbering stay valid.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── The line-item stage, and its one-time backfill ──────────────────────────
do $$
declare
  freshly_added boolean := false;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'material_request_items'
       and column_name  = 'stage'
  ) then
    alter table public.material_request_items
      add column stage text not null default 'pending';
    freshly_added := true;
  end if;

  -- Only on the migration that introduces the column. A second run must never
  -- drag an item somebody has since moved back to its request's stage.
  if freshly_added then
    update public.material_request_items i
       set stage = case r.stage
                     when 'ordered'         then 'ordered'
                     when 'order_requested' then 'order_requested'
                     when 'rfq_raised'      then 'rfq_raised'
                     when 'cancelled'       then 'cancelled'
                     else 'pending'
                   end
      from public.material_requests r
     where r.id = i.mr_id;
  end if;
end $$;

-- When it last moved — the Deliveries and Orders tabs both want "how long has
-- this been sitting", and `created_at` cannot answer it.
alter table public.material_request_items
  add column if not exists stage_changed_at timestamptz;

-- The vocabulary from `105729`, enforced. A typo'd stage does not silently
-- become a fifth column in the breakdown.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'material_request_items_stage_check'
       and conrelid = 'public.material_request_items'::regclass
  ) then
    alter table public.material_request_items
      add constraint material_request_items_stage_check
      check (stage in (
        'pending', 'rfq_raised', 'order_requested', 'ordered', 'in_stock', 'cancelled'
      ));
  end if;
end $$;

-- ── Request-level fields from `105800` ──────────────────────────────────────
alter table public.material_requests
  add column if not exists request_type text not null default 'material';

alter table public.material_requests
  add column if not exists number text;

-- Numbers are unique WITHIN a tenant; two orgs may both run DZY-REQ-1.
create unique index if not exists uq_material_requests_org_number
  on public.material_requests(org_id, number)
  where number is not null;

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- The aggregation behind every Stage cell and every tile.
create index if not exists idx_mr_items_org_stage
  on public.material_request_items(org_id, stage);
create index if not exists idx_mr_items_mr_stage
  on public.material_request_items(org_id, mr_id, stage);
create index if not exists idx_mrs_org_project
  on public.material_requests(org_id, project_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- AWARD IS A JUDGEMENT CALL (PLAN-V4 §9.7, frame `105853`)
-- ════════════════════════════════════════════════════════════════════════════
-- The frame's own data is the finding: on `105853` the CHEAPER bid was not the
-- one ordered. Lowest-price-wins is not how a site buys — the winner may be the
-- one who can deliver on Thursday, or the one whose last three loads were not
-- short. VEYRA's `awardRfq` picked the lowest total automatically, which quietly
-- turned a buyer's decision into arithmetic.
--
-- So the award now records WHO won, WHY, and WHO decided. The ranking survives
-- as a suggestion the screen shows; it stops being the decision.
--
-- Nullable on purpose: RFQs awarded before this migration have no reason on
-- record, and inventing one would be worse than admitting it.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.rfqs add column if not exists awarded_vendor_id uuid
  references public.vendors(id) on delete set null;
alter table public.rfqs add column if not exists award_reason text;
alter table public.rfqs add column if not exists awarded_by   uuid;
alter table public.rfqs add column if not exists awarded_at   timestamptz;

create index if not exists idx_rfqs_org_project
  on public.rfqs(org_id, project_id, created_at desc);
create index if not exists idx_rfqs_awarded_vendor
  on public.rfqs(org_id, awarded_vendor_id);
