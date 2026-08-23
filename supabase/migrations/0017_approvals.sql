-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Generic approval engine (v1) · Threshold rules + request ledger
-- ════════════════════════════════════════════════════════════════════════════
-- FEATURE-REGISTER PROC-APP-001, PLAN §3.4. A draft document above a threshold
-- needs approval: notify → review → approve/reject (mandatory comment on
-- reject). Two layers, reused by POs, quotations and discounts later:
--
--   approval_rules    — per-(org, module) config: the rupee threshold above
--                       which a draft in that module needs sign-off, plus an
--                       optional approver_role hint. threshold_amount is USER
--                       CONFIG; the decision logic itself is pure arithmetic
--                       (lib/approvals-model.ts needsApproval). No LLM ever
--                       produces a number.
--   approval_requests — the append-style ledger of requests and decisions:
--                       who asked for what at which amount, and who approved/
--                       rejected it with a comment. Chains/escalation can
--                       extend on top later; the competitor's single-step
--                       toggle is modelled here as one row + one rule.
--
-- module ∈ procurement|quotations|finance|other (validated app-side via zod,
-- lib/approvals-model APPROVAL_MODULES).
-- status ∈ pending|approved|rejected — pending is amber, approved green,
-- rejected red in the UI (red RESERVED: reject is destructive/alert).
--
-- ⛔ RLS stays OFF (owner decision). `org_id` on every row; isolation is
--    enforced only in application code via lib/data/with-org.ts. Both tables
--    are added to the tenant allowlist in lib/data/tables.ts.
-- Additive migration; idempotent (`if not exists`). Alters/drops nothing.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Threshold rules ────────────────────────────────────────────────────────
-- One config row per (org, module). Deactivating a rule (is_active = false)
-- stops NEW drafts needing approval; already-raised requests are untouched.
create table if not exists public.approval_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  module          text not null,                    -- procurement|quotations|finance|other
  threshold_amount numeric(14,2) not null default 0,
  approver_role   text,                             -- optional role hint, e.g. 'owner'
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, module)
);

-- ── Approval-request ledger ────────────────────────────────────────────────
-- entity_id/entity_label point at the document being approved (loose by design
-- so any module can raise a request without a hard FK). decided_by /
-- decision_comment / decided_at fill in exactly once, at the decision.
create table if not exists public.approval_requests (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  module           text not null,                   -- procurement|quotations|finance|other
  entity_id        uuid,
  entity_label     text,
  amount           numeric(14,2) not null default 0,
  status           text not null default 'pending', -- pending|approved|rejected
  requested_by     uuid,
  decided_by       uuid,
  decision_comment text,
  requested_at     timestamptz not null default now(),
  decided_at       timestamptz
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_approval_requests_org_status on public.approval_requests(org_id, status);
create index if not exists idx_approval_requests_org_module on public.approval_requests(org_id, module);
