-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Finance module (v1)  ·  Contracts, milestone billing, payments, P&L
-- ════════════════════════════════════════════════════════════════════════════
-- Contract-based milestone billing (FEATURE-REGISTER OPS-FIN-001/002/003):
--   `contracts`   a project's money agreement — source = client (inflow) or
--                 vendor (outflow). References the project by label (plain
--                 text, like projects reference leads by a plain uuid), so
--                 Projects stays optional and deletable without cascades.
--   `milestones`  billing schedule per contract: seq, pct of contract value
--                 (sums to ~100%), amount, tentative due, work-done flag.
--   `payments`    actual cash movement — inflow (customer receipts) or outflow
--                 (vendor payouts), optionally tied to contract + milestone.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    Every table carries `org_id uuid not null` fk → orgs on delete cascade.
--    `contracts`, `milestones`, `payments` are added to the tenant allowlist
--    in lib/data/tables.ts. Additive migration; idempotent.
-- IMPORTANT: all amounts here are CONFIG the user enters or SUMs of stored
--    values — never an LLM output. No engine produces an amount (HARD RULE 4).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.contracts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_label text,                                 -- free-text project reference (no hard FK)
  name          text not null,
  amount        numeric(14,2) not null default 0,     -- ₹ contract value (user-entered config)
  source        text not null default 'client',       -- client|vendor
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Milestone billing schedule ───────────────────────────────────────────────
create table if not exists public.milestones (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  contract_id   uuid not null,
  seq           int not null default 1,
  name          text not null,
  pct           numeric(5,2) not null default 0,      -- % of contract value; org checks Σ = 100 in UI
  amount        numeric(14,2) not null default 0,     -- ₹ this milestone bills for (config)
  tentative_due date,
  work_done     boolean not null default false,
  actual_due    date,
  created_at    timestamptz not null default now()
);

-- ── Cash movements: inflow (customer receipts) / outflow (vendor payouts) ────
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  contract_id   uuid,                                 -- plain uuid refs, no hard FK (mirrors projects.lead_id)
  milestone_id  uuid,
  project_label text,                                 -- allows payments without a contract
  direction     text not null default 'inflow',       -- inflow|outflow
  amount        numeric(14,2) not null default 0,     -- ₹ actually paid/received (user-entered config)
  mode          text,                                 -- upi|bank_transfer|cash|cheque|other
  paid_on       date,
  reference     text,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_contracts_org_created  on public.contracts(org_id, created_at desc);
create index if not exists idx_milestones_org_contract on public.milestones(org_id, contract_id);
create index if not exists idx_payments_org_direction  on public.payments(org_id, direction);
create index if not exists idx_payments_org_created    on public.payments(org_id, created_at desc);
