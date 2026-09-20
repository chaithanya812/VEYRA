-- ════════════════════════════════════════════════════════════════════════════
-- VEYRA — Procurement: per-vendor RFQ bid-portal token (v1)
--                              ·  FEATURE-REGISTER PROC-RFQ-004 (portal half)
-- ════════════════════════════════════════════════════════════════════════════
-- A vendor's quote can be typed in two ways: the purchase team on their behalf
-- (proxy entry, already shipped) or the vendor themselves via a signed-token
-- public URL (this unit). The token lives on rfq_vendors — ONE per
-- (RFQ, vendor) — NOT on rfqs.
--
-- WHY (the crux): the token must answer "who is bidding?". A single per-RFQ
-- token cannot — it would force a vendor-picker onto a public page, which both
-- leaks the invited-vendor list to anyone holding the link AND lets vendor A
-- submit a bid as vendor B. A per-(rfq, vendor) token IS the vendor's identity.
-- The link identifies the bidder; nothing is picked, nothing is typed, nothing
-- can be spoofed.
--
-- share_enabled gates the link (reuse an existing share_token on re-enable,
-- matching quotations.setShare). The unique partial index makes a token
-- globally unguessable and prevents tenant B from claiming tenant A's token.
--
-- ⚠ CONFIG, NOT LLM (PLAN §8): the portal collects unit_rate / tax_pct /
--   freight typed by the vendor. No LLM ever produces a number. line_total is
--   still derived ONLY by landedLineTotal() in application code. No stored
--   total column is added here.
--
-- ⛔ RLS OFF — owner decision; NO policies are created anywhere in this file.
--   Isolation is enforced exclusively in application code via
--   lib/data/with-org.ts (orgDbForVerifiedOrg after the token lookup).
--
-- Additive migration; idempotent (`if not exists` everywhere).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.rfq_vendors add column if not exists share_token text;
alter table public.rfq_vendors add column if not exists share_enabled boolean not null default false;

create unique index if not exists idx_rfq_vendors_share_token
  on public.rfq_vendors(share_token) where share_token is not null;
