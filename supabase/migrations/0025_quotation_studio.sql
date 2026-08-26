-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Quotation studio: source, type, T&C library, AI prompt library
-- ════════════════════════════════════════════════════════════════════════════
-- OPS-EST-001/002 + PROC-CFG-003. Four things:
--
--  1. A QUOTATION KNOWS WHERE IT CAME FROM. `source` is 'lead' or 'project',
--     and `project_id` is a real FK — so a quote raised against a project joins
--     to it instead of matching a string. Combined with the existing `lead_id`,
--     the lead → quotation → project chain is finally navigable in SQL.
--
--  2. TERMS BECOME A LIBRARY. Reusable clauses a tenant writes once and
--     attaches to any quotation, instead of retyping the same paragraph.
--
--  3. QUOTATION DEFAULTS ARE CONFIG. Default GST rate, margin, validity and
--     footer note per tenant — the "everything must be customizable" rule,
--     applied to the numbers a quote starts from. These are DEFAULTS THE USER
--     SETS, and the pricing engine still computes every amount from them; no
--     model ever produces a rate (HARD RULE 2).
--
--  4. AI PROMPTS BECOME A LIBRARY TOO. `ai_prompt_templates` holds the tenant's
--     own saved prompts, and `ai_requests` is an append-only log of what was
--     asked, which provider answered, and how many lines came back — so AI
--     usage is auditable rather than invisible.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add policies.
--    Isolation is enforced in app code via lib/data/with-org.ts.
--    Additive + idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Where a quotation came from ─────────────────────────────────────────────
alter table public.quotations add column if not exists source     text not null default 'lead';
                                    -- lead | project | standalone
alter table public.quotations add column if not exists doc_type   text not null default 'regular';
                                    -- regular | modular | revision | budget
alter table public.quotations add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.quotations add column if not exists ref_no     text;

-- ── Reusable terms & conditions ─────────────────────────────────────────────
create table if not exists public.quotation_terms (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,

  title      text not null,
  body       text not null,
  is_default boolean not null default false,   -- auto-attached to a new quote
  seq        int not null default 0,
  is_active  boolean not null default true,

  created_by uuid,
  created_at timestamptz not null default now()
);

-- ── Per-tenant quotation defaults ───────────────────────────────────────────
create table if not exists public.quotation_settings (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null unique references public.orgs(id) on delete cascade,

  default_gst_pct    numeric(5,2) not null default 18,
  default_margin_pct numeric(5,2) not null default 0,
  default_validity_days int not null default 15,
  footer_note        text,
  show_cost_column   boolean not null default false,  -- field-level visibility on the PDF

  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

-- ── The tenant's own AI prompts ─────────────────────────────────────────────
create table if not exists public.ai_prompt_templates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,

  name       text not null,
  prompt     text not null,
  kind       text not null default 'quotation',   -- quotation | material_request
  seq        int not null default 0,
  is_system  boolean not null default false,      -- seeded example; renameable
  is_active  boolean not null default true,

  created_by uuid,
  created_at timestamptz not null default now()
);

-- ── Append-only log of AI calls ─────────────────────────────────────────────
-- Never updated in place: one row per request, so "what did the AI actually do
-- for us this month" is answerable and the REQ-04 usage ledger has something to
-- reconcile against.
create table if not exists public.ai_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,

  kind          text not null default 'quotation_boq',
  provider      text not null,                    -- gemini | anthropic
  model         text not null,
  prompt        text not null,
  attachments   int not null default 0,
  status        text not null default 'ok',       -- ok | error | blocked
  lines_created int not null default 0,
  error_message text,
  ref_id        uuid,                             -- the quotation it fed
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_quotations_org_source
  on public.quotations(org_id, source);
create index if not exists idx_quotations_org_project
  on public.quotations(org_id, project_id);
create index if not exists idx_quotation_terms_org_seq
  on public.quotation_terms(org_id, seq);
create index if not exists idx_ai_prompts_org_kind
  on public.ai_prompt_templates(org_id, kind, seq);
create index if not exists idx_ai_requests_org_created
  on public.ai_requests(org_id, created_at desc);
