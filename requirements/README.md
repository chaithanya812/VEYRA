# Requirements

The client's own words, captured verbatim, each with analysis of what it pins down and what remains open.

**Read these before anything else.** Everything in `prior-work/` and `research/` exists to serve these.

| File | Covers | Status |
|---|---|---|
| `01-platform-direction.md` | The founding brief — 12 business types, the full journey, multi-company from the start, AI de-prioritised, Claude only | ✅ Accepted. North star. |
| `02-ai-ecosystem.md` | The seven AI asks — WhatsApp, voice, design, quotation, workflow, notifications, CRM | ⚠️ Largely superseded, and **already built**. Read for what "working together" means. |
| `03-call-tracking.md` | Automatic call logging against leads, plus the Dzylo investigation | 🔵 Open — technically settled, awaiting the client's route decision |
| `04-subscription-and-trial.md` | Plans, free trial, lifetime usage counters, abuse prevention | ✅ Accepted, awaiting the client's numbers |

---

## What the client has not yet supplied

**The "complete deep-detailed draft of the entire workflow along with a master development prompt"** promised in REQ-01. As of 2026-08-17 it has not arrived. Plan so that it lands as a validation and gap-check pass rather than a restart.

## Decisions the client still owes

Collected from across all four requirement documents:

1. Own factory or job-work? — changes the Production module completely
2. v1 profile: modular alone, or modular plus carpenter/job-work?
3. Does INTERIOR's live data migrate at cutover, or start clean as tenant #1?
4. SaaS pricing model — per user, per company, or per module?
5. Trial length, per-item limits, payment method required up front?
6. Call tracking route — own Android app, cloud telephony, or integrate Runo/Callyzer?
7. What phones does their team use, and is anyone on an iPhone?
8. Target date and business type for the first external tenant

## Requirements-level constraints that apply everywhere

- **Multi-company from day one** — tenancy is a Wave 0 data-layer concern (REQ-01)
- **Claude only** for any AI (REQ-01)
- **AI is skippable in v1**; core modules come first (REQ-01)
- **Never rebuild the existing automation spine** — port it (REQ-02)
- **Metering is lifetime and org-scoped**, via an append-only ledger (REQ-04)
- **Indian market** — GST with HSN/SAC and place of supply, works-contract treatment, Indian financial year, DPDP retention, TRAI/DND, UPI mandate caps
