# Handoff — for the task-breakdown chat (read this cold)

You are the next AI in the VEYRA pipeline. A competitor teardown of **Dzylo** has just been
completed. Your job (when the owner starts you) is to break VEYRA's requirements + this
research into buildable tasks. This file gets you oriented from zero.

---

## 1. What VEYRA is (one paragraph)

A multi-tenant B2B SaaS for the Indian construction / architecture / interior / furniture
industry — "the operating system for made-to-order built environments." One record (a
**Scope Item**) flows enquiry → quote → sales order → BOM → cutlist → job cards → dispatch →
install → warranty → margin, without re-entry. v1 proving ground is **modular interior /
turnkey**; other business types are configuration (industry profiles). Stack: **Next.js on
Vercel + Supabase**. Strategy is settled in `prior-work/PLAN-v0.1.md`; the spec is being
deepened into `PLAN.md` (v0.2).

## 1b. Supabase MCP is connected to the WRONG account — use the pooler for DDL

The Supabase MCP server in this environment is authenticated to a **different**
Supabase account (it can see projects `Interior`, `CUTQ`, `campus`, `CANVAS`,
`EATO` — org `tcicbsojwzpwdntoeyqm`), **not** the VEYRA project
`vjupynmjzpdzrluwctzd`. So `apply_migration` / `execute_sql` via MCP **fail with
"You do not have permission"** on VEYRA. Do not rely on the MCP for VEYRA.

Instead, run migrations/SQL through the **Supavisor pooler** with the direct
Postgres creds (already wired):

- `node scripts/db.mjs migrate` — apply `supabase/migrations/*.sql`
- `node scripts/db.mjs sql "select …"` — one-off query
- Uses `DATABASE_POOLER_URL` in `.env.local` (region **ap-northeast-2**; the
  direct `db.<ref>.supabase.co` host is IPv4-unresolvable from most networks).
- The app itself never uses this — it talks to Supabase over HTTPS/PostgREST.

**If the owner connects the VEYRA project to the MCP's account** (they offered to,
for bigger schema work), the MCP `apply_migration`/`list_tables`/`get_advisors`
tools become usable for VEYRA and are a nicer path — but keep `scripts/db.mjs`
working as the fallback, and keep migrations as files either way.

## 2. ⛔ The one rule you must not break: RLS is OFF

> **RLS is OFF on Supabase project `vjupynmjzpdzrluwctzd`, by owner decision. Do not enable
> it. Do not write RLS policies.**
> Because there is no DB-level guard, every task you generate that touches data must:
> 1. go through a **server-side** route/action (never browser→table),
> 2. use the **secret** key server-side only (never `NEXT_PUBLIC_*`, never logged),
> 3. enforce `org_id` in **one** accessor (`withOrg()`) — the only thing stopping
>    cross-tenant leakage,
> 4. verify Supabase Auth JWTs server-side via the JWKS URL.
>
> Treat "add the `org_id` lint rule" and "add the every-table-has-`org_id` test" as P0
> platform tasks. Cross-tenant leakage is the **#1 risk** (above the item master).

Keys and full rationale: [`../CREDENTIALS.md`](../CREDENTIALS.md) · real values `../.env.local`.

## 3. Where everything is

| Path | What |
|---|---|
| `VEYRA CRM/requirements/` | The client's own words (REQ-01..04). **Read first, everything serves these.** |
| `VEYRA CRM/prior-work/PLAN-v0.1.md` | Settled strategy: Scope-Item spine, 16 entities, 6 config layers, 8 waves. Extend, don't restart. |
| `VEYRA CRM/research/` | Settled research (call tracking, WhatsApp, payments, Dzylo, open-source, GPL/AGPL). Don't re-derive. |
| `VEYRA CRM/competitor-research/` | **This folder.** The Dzylo teardown. |
| `VEYRA CRM/competitor-research/FEATURE-REGISTER.md` | ★ Findings by VEYRA module + coverage matrix. Your primary input. |
| `VEYRA CRM/competitor-research/DESIGN-DIRECTION.md` | White/black/red design system. |
| `VEYRA CRM/CREDENTIALS.md`, `.env.local`, `.env.example` | Supabase + Gemini config; the no-RLS rule. |
| `VEYRA CRM/HANDOFF-PROMPT.md` | The spec-writing brief (§7 = what to produce per module). |
| `TOO MUCH/INTERIOR` | **The live app being ported from.** Next.js 16, Supabase `whzxbqxjjeulxlivjnxq`, 26 tables (no tenancy). Port: quotation engine, automation spine (`crm_events`→outbox), `upsertLeadByPhone`/`phone_key` dedupe, `/q/<token>` share link, consent gate `src/lib/bolna/gate.ts`. |
| `TOO MUCH/whatsapp` | Separate WhatsApp app ("wacrm"), shares INTERIOR's Supabase. Never name a table `automations` (it's theirs). |
| `TOO MUCH/RESEARCH 2/INTERIOR LANE/RESEARCH/` | Origin of this teardown's videos/frames (the Gemini pass ran here). **Not the old rejected mockups** — those are `INTERIOR LANE/` proper, which you ignore. |

## 4. How to read a finding

Each analysis entry and register row has a **verdict**:
`adopt` (build as shown) · `adopt+` (build, but the **VEYRA delta** says how we differ/win) ·
`planned` (PLAN-v0.1 already covers it — deepen it) · `reject` · `oos` (out of v1).
Every finding cites a **frame** and a **PLAN section**, and infers the **data model** and
**API** the screen needs. Turn `adopt`/`adopt+`/`planned` rows into tasks; skip `reject`/`oos`.

## 5. The five things this teardown changed

1. **Procurement is now specced.** Video 1 (17 min) gave PLAN §6.4's four bullets a full
   screen inventory: MR → AI-parse → RFQ → OTP vendor portal → L1/L2/L3 bid matrix → PO →
   approval → acceptance → stock-in-with-GST → GRN. See `analysis/01-procurement.md`.
2. **Call tracking is answered** (REQ-03): Dzylo's own dialer writes to one call-log table;
   build the interactions layer (PLAN §6.1a), don't chase a browser extension.
3. **Pricing model leans per-seat** (REQ-04): Dzylo shows Purchased/Active/Unused licenses.
4. **Meter AI via the append-only ledger** (REQ-04), not a decrementing counter.
5. **The moat is confirmed**: Dzylo has no factory (BOM/cutlist/nesting/panel QR) and no
   site-measurement variance. Those are VEYRA's differentiators — prioritise them.

## 6. Client decisions still open (don't stall — assume + flag)

Factory own-vs-jobwork · v1 profile depth · INTERIOR data migration at cutover · exact SaaS
pricing numbers · trial length/limits · telephony provider · team phone mix (any iPhones) ·
first external tenant date · **and: does the Claude-only rule get an exception for generative
image/3D (Dzylo uses Google's model for Imagino)?** Full list in `requirements/README.md`.

## 7. What has NOT been done yet

- **PLAN-v0.2 is not written.** It waits on the owner's promised "deep-detailed workflow
  draft + master development prompt." When it arrives, fold in: this register, the design
  direction, the no-RLS §3.1 rewrite, the procurement/inventory/finance depth, and the seven
  modules missing from v0.1 (`HANDOFF-PROMPT.md` §7).
- **No code, no schema, nothing written to Supabase.** This is all still specification.
