-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Settings / Config (v1) · Numbering series + Roles & Permissions
-- ════════════════════════════════════════════════════════════════════════════
-- Two config layers the rest of the product reads (FEATURE-REGISTER:
-- PROC-CFG-005 document numbering; OPS-HR-003 roles & permissions):
--
--   numbering_series — per doc_type tenant prefix + Indian-FY segment +
--     zero-padded running integer, e.g. VEYRA/2026-27/0042. The FY segment
--     (1 Apr → 31 Mar) is the delta over Dzylo, whose document numbers carry
--     no financial-year context.
--   permissions — the (module, action, scope) matrix that replaces Dzylo's
--     free-text role labels with an explicit grant per role. Each row links a
--     role to one module+action at a scope. The `roles` table itself is NOT
--     touched here — it already exists in migration 0001.
--
-- ⛔ RLS stays OFF (owner decision). `org_id` on every row; isolation is
--    enforced only in application code via lib/data/with-org.ts. Both tables
--    are added to the tenant allowlist in lib/data/tables.ts.
-- Additive migration; idempotent (`if not exists`). Never alters/drops the
--    existing `roles` table — it is only referenced.
-- NOTE: numbers are produced by pure arithmetic over these config rows
--    (lib/permissions-model.ts formatDocNumber). No LLM ever produces a number.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Document numbering series ──────────────────────────────────────────────
-- One config row per (org, doc_type). `current_int` advances ONLY when a
-- document module consumes a number; editing this config must never reset or
-- renumber anything already issued.
create table if not exists public.numbering_series (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  doc_type    text not null,                    -- quotation|material_request|rfq|purchase_order|grn|invoice
  prefix      text not null default 'VEYRA',
  fy_segment  boolean not null default true,    -- include Indian FY "2026-27" (Apr–Mar)
  padding     int not null default 4,           -- zero-pad width of the running integer
  current_int int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, doc_type)
);

-- ── Permissions: role → (module, action, scope) ────────────────────────────
-- `role_id` references the EXISTING public.roles table conceptually (no FK is
-- added so roles stay self-contained); that the role belongs to THIS org is
-- verified in lib/data/config.ts before any write.
create table if not exists public.permissions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  role_id    uuid not null,
  module     text not null,                     -- leads|quotations|items|projects|procurement|inventory|vendors|billing|settings
  action     text not null,                     -- view|create|edit|delete|approve
  scope      text not null default 'org',       -- own|team|branch|org
  created_at timestamptz not null default now(),
  unique (org_id, role_id, module, action)
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_numbering_series_org_doc on public.numbering_series(org_id, doc_type);
create index if not exists idx_permissions_org_role     on public.permissions(org_id, role_id);
