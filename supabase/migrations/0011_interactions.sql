-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — REQ-03 / OPS-CALL-001: the Interaction layer (call logs)
-- ════════════════════════════════════════════════════════════════════════════
-- The competitor built their own dialer writing into ONE call-log table that
-- the leads list reads. VEYRA generalises this to a single channel-agnostic
-- `interactions` table spanning call + whatsapp + email + sms + visit — one
-- table, several channel adapters. v1 ships the log + manual entry + read
-- surfaces (no live telephony); adapters append rows later.
--
-- ⛔ RLS IS INTENTIONALLY LEFT OFF (owner decision). Do NOT add RLS policies.
--    Tenant isolation is enforced in app code via lib/data/with-org.ts.
--    `interactions` is added to the tenant allowlist in lib/data/tables.ts.
-- Additive migration only; idempotent `create table if not exists`.
-- No pricing anywhere in this module (nothing for an LLM to invent).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.interactions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,  -- the lead this interaction is about (nullable)
  party_id      uuid references public.parties(id) on delete set null,
  channel       text not null default 'call',       -- call|whatsapp|email|sms|visit
  direction     text not null default 'outbound',   -- inbound|outbound
  status        text not null default 'completed',  -- connected|not_connected|no_answer|completed|failed
  customer_no   text,                               -- phone/email/address the channel reached
  provider      text default 'manual',              -- manual | telephony/adapter name later
  duration_sec  int not null default 0,
  disposition   text,                               -- interested|busy|follow_up|not_interested|wrong_number|no_answer
  note          text,
  recording_url text,
  agent_id      uuid,                               -- org member who owned/handled it
  occurred_at   timestamptz not null default now(),
  created_by    uuid,
  created_at    timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_interactions_org_lead_occurred
  on public.interactions(org_id, lead_id, occurred_at desc);
create index if not exists idx_interactions_org_channel
  on public.interactions(org_id, channel);
create index if not exists idx_interactions_org_occurred
  on public.interactions(org_id, occurred_at desc);
