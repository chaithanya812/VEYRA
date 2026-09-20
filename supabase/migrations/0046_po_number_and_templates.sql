-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Procurement: PO document number + PO PDF template (v1)
-- ════════════════════════════════════════════════════════════════════════════
-- A purchase order today is a screen: it has a name, a vendor, lines and an
-- amount, but no document number and nothing that says how the PDF should
-- look. This migration does two additive things:
--
--   1. `purchase_orders.number` — nullable Indian-FY document number. Every
--      existing PO predates numbering and MUST keep working with NULL. New
--      POs call issueDocNumber('purchase_order') (already seeded; prefix PO).
--      A missing series is a legitimate tenant state: the PO is still created,
--      just unnumbered. No backfill.
--   2. `po_templates` — one org-scoped config row for the PO PDF (footer note,
--      signature label, pasted logo/signature URLs, column/section toggles,
--      optional bank details). Read-or-create-default on first read; never
--      assume a row. Logo/signature are URL fields, not an upload pipeline.
--
-- `purchase_orders.amount` is the pre-existing stored Σ of line totals and is
-- not touched here. Freight on an awarded bid becomes its own po_line (no new
-- column). The PDF computes GST and payment-plan rupees; it stores nothing.
--
-- ⛔ RLS OFF — owner decision; NO policies are created anywhere in this file.
--   org_id uuid not null references public.orgs(id) on delete cascade guards
--   the new table, and isolation is enforced exclusively in application
--   code via lib/data/with-org.ts. `po_templates` joins the tenant allowlist
--   in lib/data/tables.ts.
--
-- Additive migration; idempotent (`if not exists` everywhere).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Document number on the PO header. Nullable on purpose: existing POs
--    predate numbering and must not break. No backfill.
alter table public.purchase_orders
  add column if not exists number text;

create index if not exists idx_pos_org_number
  on public.purchase_orders(org_id, number);

-- ── One PDF-template row per tenant ────────────────────────────────────────
create table if not exists public.po_templates (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null unique references public.orgs(id) on delete cascade,

  footer_note        text,
  signature_label    text,
  logo_url           text,
  signature_url      text,

  show_tax_column    boolean not null default true,
  show_uom_column    boolean not null default true,
  show_payment_plan  boolean not null default true,
  show_terms         boolean not null default true,
  show_bank_details  boolean not null default false,
  bank_details       text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_po_templates_org
  on public.po_templates(org_id);
