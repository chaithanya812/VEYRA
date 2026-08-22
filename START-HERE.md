# VEYRA CRM — start here

Home of the platform planning effort. Everything needed is in here or linked from here.

---

## If you are a fresh AI agent

Read **`HANDOFF-FLEET-AGENT.md`** first — it is the current brief (state as of 2026-08-22 + the
mandate to finish the backlog using an OpenCode sub-agent fleet). It points to `HANDOFF-BUILD-AGENT.md`
and `HANDOFF-PROMPT.md` for the foundational detail. Don't start with this file.

## If you are a human

1. **`requirements/`** — the client's own words. Start here; everything else serves these.
2. **`research/README.md`** — the five conclusions that cost the most to reach, then whichever file is relevant.
3. **`prior-work/PLAN-v0.1.md`** — the first strategy pass. Sound thinking, deliberately not a buildable spec.
4. **`client/`** — what the client has already been told, so you don't contradict it.

---

## Folder map

```
VEYRA CRM/
├── START-HERE.md                      ← you are here
├── HANDOFF-BUILD-AGENT.md             ← ★ paste into the next BUILD agent (continues coding)
├── HANDOFF-PROMPT.md                  ← paste into a spec-writing agent (deepen PLAN-v0.2)
├── ARCHITECTURE.md                    ← how the built app works + "how to add a module"
├── CREDENTIALS.md                     ← Supabase + Gemini config; the RLS-is-OFF rule
├── .env.local                         ← real keys (gitignored) · .env.example is the template
├── app/  lib/  components/  supabase/  scripts/   ← the built Next.js app (Wave 0 + Leads slice)
├── requirements/                      ← the client's briefs, verbatim
│   ├── README.md
│   ├── 01-platform-direction.md       ← the founding brief
│   ├── 02-ai-ecosystem.md             ← the 7 AI asks (mostly already built)
│   ├── 03-call-tracking.md            ← call logging + the Dzylo answer
│   └── 04-subscription-and-trial.md   ← plans, trial, usage metering
├── research/                          ← findings, so nobody re-derives them
│   ├── README.md
│   ├── call-tracking-build.md
│   ├── call-tracking-buy-vs-build.md
│   ├── whatsapp.md
│   ├── competitors-and-foundations.md
│   ├── open-source-repos.md
│   └── payments-razorpay-setup.md
├── competitor-research/               ← 116-frame Dzylo teardown → VEYRA spec input
│   ├── README.md
│   ├── FEATURE-REGISTER.md            ← ★ findings by VEYRA module + coverage matrix
│   ├── DESIGN-DIRECTION.md            ← white/black/red design system
│   ├── HANDOFF-NEXT-AI.md             ← cold-start brief for the task-breakdown chat
│   ├── ADD-A-VIDEO.md                 ← how to process the next competitor video
│   ├── analysis/                      ← 01-procurement.md, 02-operations-crm.md
│   └── source/                        ← the Gemini index + 116 frames
├── prior-work/
│   └── PLAN-v0.1.md                   ← first strategy pass
└── client/                            ← messages already sent to the client
    ├── message-call-module.md
    └── message-trial-and-payments.md
```

## Related folders elsewhere on disk

| Path | What it is |
|---|---|
| `TOO MUCH/INTERIOR` | **The existing app.** Next.js 16, live on Vercel, single company. Source of the engines being ported. |
| `TOO MUCH/whatsapp` | The separate WhatsApp app ("wacrm"). Shares INTERIOR's Supabase project. |
| `TOO MUCH/RESEARCH 2/INTERIOR LANE` | ⛔ **Mostly ignore.** 365 PDF mockup screens the client reviewed and rejected — not a specification. **Exception:** its `RESEARCH/` subfolder is the origin of the two Dzylo demo videos + 116 screenshots that `competitor-research/` is built from. |

---

## Where things stand

**Strategy: settled.** The Scope Item spine, object graph, module scope, configuration layers and build waves in `prior-work/PLAN-v0.1.md` were argued through properly and hold up.

**Specification: roughly 15–20% done.** PLAN-v0.1 runs ~6,500 words across 10 modules — about 400 words each. Procurement gets four bullet points. That's an outline, not something anyone can build from without inventing requirements.

**Missing to make it buildable:** table schemas (entities are named, not defined) · state machines · **actual formulas** for valuation, landed cost, BOM explosion and GST place-of-supply · screen inventory · API surface · permission matrix · validation rules · acceptance criteria · exhaustive rather than illustrative feature lists.

**Modules missing from PLAN-v0.1 entirely:** Subscription/Plans/Trial (REQ-04 — a core module that appears nowhere) · tenant onboarding · data migration and import · the interactions layer · approvals engine · notifications · search, audit log, file management, role dashboards, mobile surfaces.

**New since v0.1: a competitor teardown.** `competitor-research/` holds a 116-frame, frame-by-frame teardown of **Dzylo** (the closest competitor), regrouped under VEYRA's modules with adopt/beat/reject verdicts. It supplies the Procurement / Inventory / CRM / Finance / Estimation depth PLAN-v0.1 was missing, confirms the call-tracking architecture (REQ-03) and the per-seat pricing model (REQ-04), and re-confirms the moat: Dzylo has **no factory** (BOM/cutlist/nesting/panel traceability) and no site-measurement variance. Start from `competitor-research/FEATURE-REGISTER.md`.

**Infrastructure is wired.** Supabase project `vjupynmjzpdzrluwctzd` — keys in `.env.local`, documented in `CREDENTIALS.md`. **RLS is OFF by owner decision and must stay off**; the compensating controls are mandatory (see `CREDENTIALS.md`).

**So the next job is the component-by-component specification.** `HANDOFF-PROMPT.md` §7 defines the structure.

---

## Locked decisions — don't reopen without a reason

1. **New multi-tenant core**, porting proven engines from INTERIOR. INTERIOR has *zero* tenancy columns across all 26 tables — that's why we aren't retrofitting.
2. **v1 proving ground: modular interior / turnkey.** Other business types become configuration.
3. **Communications: WhatsApp Cloud API only.** AI voice calling is out of scope.
4. **Stack:** Next.js on Vercel + Supabase.
5. **Payments** behind a provider-agnostic interface.
6. **Mockups are not the spec.**

## Naming

The folder is VEYRA CRM. Documents still refer to the platform as Interiorlane, which is the client's existing product name. **If Veyra is the new product name, say so and the docs get updated in one pass** — it hasn't been assumed either way.
