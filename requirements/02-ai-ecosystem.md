# REQ-02 — AI ecosystem (the seven asks)

**Source:** Client, verbatim. Predates REQ-01.
**Status:** ⚠️ **Largely superseded.** REQ-01 de-prioritises AI, and the client has since confirmed the platform should focus on WhatsApp only, dropping AI voice calling. Kept because it defines what "everything working together" means to the client — and because most of it is already built.

---

## Client's message

> The website and WhatsApp are a good start, but before moving to AI calling, I want the complete AI ecosystem to work together. The system should support the following:
>
> **1. AI WhatsApp Agent**
> - Answer customer queries instantly
> - Qualify leads
> - Collect customer requirements
> - Book appointments
> - Trigger quotation requests
>
> **2. AI Voice Calling Agent**
> - Call new leads automatically
> - Follow up on pending quotations
> - Confirm site visits
> - Send reminders
> - Transfer to a human when required
>
> **3. AI Design Agent**
> - Understand customer requirements
> - Suggest layouts, materials, colors and finishes
> - Generate basic 2D/3D design concepts
> - Share design previews with customers
>
> **4. AI Quotation Agent**
> - Generate quotations automatically from customer requirements
> - Calculate pricing
> - Create PDF quotations
> - Send quotations via WhatsApp and email
>
> **5. AI Workflow Agent**
> - All AI agents should communicate with each other
> - Trigger actions automatically (quotation, appointment, follow-up, payment reminder, etc.)
> - Update CRM without manual work
> - Maintain complete customer conversation history
>
> **6. AI Notification & Messaging**
> - Automatically send WhatsApp messages after every stage
> - Send quotation, reminders, follow-ups and thank-you messages
> - Trigger messages based on customer actions
>
> **7. CRM Integration**
> - Every conversation should create or update a lead
> - Store customer preferences, budget and project details
> - Schedule follow-ups automatically
>
> The goal is to build a complete AI-powered system where WhatsApp AI, Voice AI, Website, CRM, Design, Quotation and Automation work together without manual intervention.

---

## Critical: this is already built

**All seven asks were implemented and deployed in the existing `TOO MUCH/INTERIOR` codebase.** All 11 phases in its `ECOSYSTEM-PHASES.md` are complete (sessions M→Y, last 2026-07-26). INTERIOR carries 105 tests, the WhatsApp app 630.

There is an automated proof: **`npm run test:e2e`** (`scripts/e2e-ecosystem.mjs`) seeds real rows, hits real routes, asserts the resulting `crm_events` / `automation_runs` / `notification_outbox` / `lead_activities` rows, scores 15 checks against these seven asks, then deletes everything it created.

**Run that script rather than re-deriving status from documentation, and do not rebuild the spine.**

| Ask | State |
|---|---|
| 1. WhatsApp agent | ✅ Live — inbound answering, qualifying, requirement collection, appointment booking |
| 2. Voice calling | ✅ Built, gated on a KYC'd `BOLNA_FROM_NUMBER` + consent. **Now out of scope** per the client's WhatsApp-only direction. |
| 3. Design agent | ◐ Upload-and-approve pattern built. Generative 2D/3D never had a provider chosen. Deferred. |
| 4. Quotation agent | ✅ Built — engine, PDF, `/q/<token>` share link, WhatsApp + email delivery |
| 5. Workflow agent | ✅ The spine: `crm_events` → dispatcher → `notification_outbox`, with per-rule owner toggles |
| 6. Notifications | ✅ Outbox with channel adapters; stage messages owner-editable |
| 7. CRM integration | ✅ Lead dedupe by phone across all six intake paths, full activity timeline |

## What carries into the new platform

The **event spine** (`crm_events` → dispatcher → `notification_outbox` → channel senders) is genuinely good architecture and should be ported, not rebuilt — add `org_id`, make rules per-tenant, and expose a rule-builder UI over what the code already does.

Ask 5's real requirement — *"maintain complete customer conversation history"* — is the interactions layer described in REQ-03.
