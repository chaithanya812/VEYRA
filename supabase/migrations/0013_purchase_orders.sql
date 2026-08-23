-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Procurement: Purchase Orders (v1)  ·  FEATURE-REGISTER PROC-PO-001/002, PROC-DELIV-001
-- ════════════════════════════════════════════════════════════════════════════
-- A PO carries TWO independent state machines (the core modelling idea):
--   order_state   — fulfilment: draft → created → partially_delivered → delivered
--                   (or cancelled). DERIVED from received-vs-ordered once goods
--                   start arriving; never a free-floating status.
--   payment_state — money: not_initiated → partial → paid. Independent of
--                   fulfilment; a PO can be fully delivered and unpaid.
--
-- Standalone/direct POs are raised against a preferred vendor (vendor_id not
-- null). An optional rfq_id links a PO that originated from an RFQ; it stays
-- nullable so this module is independent of the RFQ slice.
--
-- `amount` on the header is the PURE SUM of line totals (poAmount helper in
-- lib/po-model.ts) — computed by code from user-entered config, NEVER an LLM
-- output (PLAN §8). `unit_rate` on a line is CONFIG the user types.
-- line_total = qty * unit_rate (tax_pct is stored for reference/GST reporting;
-- the v1 amount is the pre-tax sum of line totals).
--
-- Partial receipts (PROC-DELIV-001): goods arrive against PO lines in
-- po_receipts + po_receipt_lines batches. order_state derives from
-- Σ received vs Σ ordered via deriveOrderState() — application-side, so the
-- rule lives in one testable place instead of a trigger.
--
-- ⛔ RLS stays OFF (owner decision). org_id on every row; isolation enforced
--    only in application code via lib/data/with-org.ts. All four tables are
--    added to the tenant allowlist in lib/data/tables.ts. Additive; idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Purchase Order header ───────────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,

  name          text not null,
  vendor_id     uuid not null,                 -- → vendors.id (same org by construction; data layer scopes both)
  project_label text,                          -- optional free label ("Malviya Nagar site")
  rfq_id        uuid,                          -- nullable link when this PO originated from an RFQ

  type          text not null default 'purchase_order',
                -- purchase_order|work_order
  amount        numeric(14,2) not null default 0,
                -- SUM of line totals (poAmount) — pure arithmetic on user config
  order_state   text not null default 'draft',
                -- draft|created|partially_delivered|delivered|cancelled
  payment_state text not null default 'not_initiated',
                -- not_initiated|partial|paid

  order_date    date,
  delivery_date date,
  remarks       text,

  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── PO line = item reference + user-entered rate CONFIG ─────────────────────
create table if not exists public.po_lines (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  po_id      uuid not null references public.purchase_orders(id) on delete cascade,

  item_id    uuid references public.items(id), -- catalogue ref; null = uncatalogued ad-hoc label
  item_name  text not null,                    -- label always kept (mirrors MR lines)
  uom        text,

  qty        numeric(14,2) not null default 0,
  unit_rate  numeric(14,2) not null default 0, -- CONFIG entered by the user — never an LLM output
  tax_pct    numeric(5,2) not null default 18, -- GST slab reference for the line
  line_total numeric(14,2) not null default 0, -- computed = qty * unit_rate

  created_at timestamptz not null default now()
);

-- ── Receipt batch (one goods-arrival event against a PO) ────────────────────
create table if not exists public.po_receipts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  po_id       uuid not null references public.purchase_orders(id) on delete cascade,

  received_by uuid,
  received_at timestamptz not null default now(),
  mode        text not null default 'admin_override',
              -- vendor|admin_override
  note        text,

  created_at  timestamptz not null default now()
);

-- ── Receipt lines: how much of each PO line arrived in this batch ───────────
create table if not exists public.po_receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  receipt_id   uuid not null references public.po_receipts(id) on delete cascade,
  po_line_id   uuid not null references public.po_lines(id) on delete cascade,

  qty_received numeric(14,2) not null default 0,

  created_at   timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_pos_org_order_state   on public.purchase_orders(org_id, order_state);
create index if not exists idx_pos_org_payment_state on public.purchase_orders(org_id, payment_state);
create index if not exists idx_pos_org_created       on public.purchase_orders(org_id, created_at desc);
create index if not exists idx_po_lines_org_po       on public.po_lines(org_id, po_id);
create index if not exists idx_po_receipts_org_po    on public.po_receipts(org_id, po_id);
create index if not exists idx_po_receipt_lines_org_receipt on public.po_receipt_lines(org_id, receipt_id);
