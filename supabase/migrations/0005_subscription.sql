-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — REQ-04: Plans, subscription & free trial (usage ledger)
-- ════════════════════════════════════════════════════════════════════════════
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
-- Additive migration only; idempotent `create table if not exists`.
-- Core mechanic (REQ-04): usage is an APPEND-ONLY LEDGER, metered on LIFETIME
-- counts, never a mutable counter. At trial/plan expiry data goes read-only,
-- never deleted. `plans` is platform/global (no org_id); `subscriptions` and
-- `usage_events` are tenant-scoped (org_id).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Platform table: plan catalogue (NOT org-scoped) ───────────────────────────
create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,            -- e.g. "trial", "starter", "pro"
  name          text not null,
  price_inr     numeric(12,2) not null default 0,
  is_trial      boolean not null default false,
  limits        jsonb not null default '{}'::jsonb,  -- {"quotations":50,"items":200,"users":3}
  created_at    timestamptz not null default now()
);

-- Seed the free-trial plan (lifetime-metered limits; numbers to be set by client).
insert into public.plans (code, name, price_inr, is_trial, limits)
values ('trial', 'Free Trial', 0, true,
  '{"quotations":50,"designs":50,"boqs":50,"cutlists":50,"exports":50,"projects":10,"items":200,"users":3}'::jsonb)
on conflict (code) do update
  set name = excluded.name,
      is_trial = excluded.is_trial,
      limits = excluded.limits;

-- ── Tenant-scoped: the org's current subscription ────────────────────────────
create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  plan_code           text not null,
  status              text not null default 'trialing',  -- trialing|active|expired|cancelled
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  unique (org_id)
);

-- ── Tenant-scoped: the append-only usage ledger (NEVER updated/deleted) ───────
create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  metric      text not null,                    -- e.g. "quotations", "exports"
  quantity    integer not null default 1,
  ref         text,                             -- optional entity id / note
  created_at  timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_subscriptions_org         on public.subscriptions(org_id);
create index if not exists idx_usage_events_org_metric    on public.usage_events(org_id, metric);
create index if not exists idx_usage_events_created       on public.usage_events(org_id, created_at desc);
