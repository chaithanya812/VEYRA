-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Wave 0 foundation schema + the first vertical slice (Leads)
-- ════════════════════════════════════════════════════════════════════════════
-- ⛔ RLS IS INTENTIONALLY LEFT OFF on every table below, by owner decision
--    (see CREDENTIALS.md). Do NOT add `enable row level security` or policies.
--    Tenant isolation is enforced in application code via lib/data/with-org.ts.
--    Every tenant table carries `org_id`; a test asserts this invariant.
-- Additive migrations only. Never create a table named `automations`
--    (that belongs to the shared WhatsApp app's schema).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Platform tables (NOT org-scoped) ───────────────────────────────────────

-- The tenant.
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  gstin       text,                       -- one trial per GSTIN (REQ-04); nullable pre-verification
  created_at  timestamptz not null default now()
);

-- Profile mirror of auth.users (auth.users itself is managed by Supabase Auth).
create table if not exists public.app_users (
  id          uuid primary key,           -- == auth.users.id
  email       text,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- ── Tenant-scoped tables (every row carries org_id) ────────────────────────

create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  code        text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Tenant-defined roles (permissions modelled as (module, action, scope) later).
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  is_system   boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Membership: a user belongs to many orgs (consultant serves several companies).
create table if not exists public.org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  user_id     uuid not null,              -- == auth.users.id
  role        text not null default 'owner',
  manager_id  uuid references public.org_members(id),
  status      text not null default 'active',   -- active | invited | disabled
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Unified party (customer / vendor / contractor / architect) — one table, roles.
-- Present for the spine; the Leads slice links to it optionally.
create table if not exists public.parties (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  phone       text,
  phone_key   text,                       -- normalised phone for dedupe (PLAN §6.1)
  email       text,
  roles       text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── Vertical slice: Leads ──────────────────────────────────────────────────

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  branch_id   uuid references public.branches(id),
  party_id    uuid references public.parties(id),
  name        text not null,
  phone       text,
  phone_key   text,                       -- normalised; deduped per org (PLAN §6.1)
  email       text,
  source      text not null default 'manual',  -- manual|walk_in|whatsapp|website|referral|call
  status      text not null default 'new',      -- new|contacted|qualified|quoted|won|lost
  value       numeric(14,2),              -- estimated deal value (₹)
  assigned_to uuid,                       -- org_members.user_id
  notes       text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Channel-agnostic activity timeline (seed of the interactions layer, PLAN §6.1a).
create table if not exists public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  kind        text not null,              -- note|status_change|call|whatsapp|email|created
  note        text,
  meta        jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_branches_org      on public.branches(org_id);
create index if not exists idx_roles_org          on public.roles(org_id);
create index if not exists idx_members_user       on public.org_members(user_id);
create index if not exists idx_members_org        on public.org_members(org_id);
create index if not exists idx_parties_org        on public.parties(org_id);
create index if not exists idx_leads_org_status   on public.leads(org_id, status);
create index if not exists idx_leads_org_created  on public.leads(org_id, created_at desc);
create index if not exists idx_activities_lead    on public.lead_activities(lead_id, created_at desc);

-- Phone dedupe: one lead per normalised phone per org (PLAN §6.1 upsertLeadByPhone).
create unique index if not exists uq_leads_org_phonekey
  on public.leads(org_id, phone_key) where phone_key is not null;
