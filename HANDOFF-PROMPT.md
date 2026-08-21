# Handoff prompt — platform specification

**Start the agent in:** `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`

*Paste everything below the line into a fresh agent session.*

---

You are the project architect for a B2B SaaS platform serving the Indian construction, architecture, interior and furniture industry. Your job this session is **specification, not coding**: turn a settled strategy into a component-by-component spec a build team can execute without inventing requirements.

## 1. Read these first, in this order

Your working folder is `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`.

1. **`requirements/README.md`**, then all four requirement files. These are the client's own words. Everything else exists to serve them.
2. **`prior-work/PLAN-v0.1.md`** — the strategy pass. The architecture in it is settled; the depth is not sufficient. Extend it, don't restart it.
3. **`research/README.md`** — five conclusions that cost a lot to reach. Do not re-derive them.
4. **`competitor-research/FEATURE-REGISTER.md`** — a 116-frame teardown of **Dzylo** (the closest competitor), regrouped under VEYRA's modules with adopt/beat/reject verdicts and a coverage matrix. It gives the Procurement, Inventory, CRM, Finance and Estimation depth that PLAN-v0.1 lacks. Start from the register; `competitor-research/analysis/*.md` is the evidence.
5. **`CREDENTIALS.md`** — Supabase + Gemini config, and the **RLS-is-OFF** rule (see §8).

| File | Holds |
|---|---|
| `requirements/01-platform-direction.md` | The founding brief — 12 business types, full journey, multi-company from day one, AI de-prioritised, **Claude only** |
| `requirements/02-ai-ecosystem.md` | The seven AI asks. Mostly superseded, and **already built** — read before proposing any AI work |
| `requirements/03-call-tracking.md` | Automatic call logging, and how Dzylo actually does it |
| `requirements/04-subscription-and-trial.md` | Plans, free trial, lifetime usage metering, abuse prevention |
| `research/call-tracking-build.md` | How to build call tracking; the hard platform limits |
| `research/call-tracking-buy-vs-build.md` | Competitors, costs, what cloud telephony is |
| `research/whatsapp.md` | Cloud API, Coexistence mode, the 24-hour rule, banned libraries |
| `research/competitors-and-foundations.md` | Dzylo teardown and the gap they leave; open-source ERP options; **GPL vs AGPL** |
| `research/open-source-repos.md` | Repos by module — cutlist, floor plans, ERP, WhatsApp |
| `research/payments-razorpay-setup.md` | Razorpay/PhonePe setup, documents, activation blockers |
| `client/*.md` | What the client has already been told — don't contradict it |

## 2. The existing codebase

`C:\Users\chait\Downloads\TOO MUCH\INTERIOR` — Next.js 16, live on Vercel, single company. Supabase project `whzxbqxjjeulxlivjnxq`. 26 tables, migrations through `0020`.

| Doc | Why you'd read it |
|---|---|
| `HANDOFF.md` | §0 — session-by-session record, newest first. The history of everything built. |
| `AGENTS.md` | Project rules and conventions |
| `ECOSYSTEM-PHASES.md` | The 11-phase AI plan and completion status |
| `AI-ECOSYSTEM.md` | Architecture map |
| `AI-ECOSYSTEM-ORCHESTRATION.md` | The automation spine spec; §6 is the WhatsApp reverse bridge |
| `INTEGRATIONS.md` | Cross-app contract with the WhatsApp repo |
| `ROADMAP.md` | Product roadmap and principles |
| `SUPABASE.md` | Database conventions |
| `TESTING-ECOSYSTEM.md` | How to test everything |
| `QUOTATION-V2-TODO.md` | Outstanding quotation work |
| `supabase/migrations/0001`–`0020` | **The current schema. Read these.** |
| `src/lib/` | `quotation/`, `quote/`, `automation/`, `crm/`, `whatsapp/`, `materials/`, `bolna/`, `email/` |

`C:\Users\chait\Downloads\TOO MUCH\whatsapp` — the separate WhatsApp app ("wacrm"), sharing the same Supabase project. Read `START_HERE.md` and `WHATSAPP_HANDOFF.md`.

**Mostly ignore:** `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\INTERIOR LANE` — 365 PDF mockup screens the client reviewed and rejected. Not a specification. **Exception:** its `RESEARCH/` subfolder holds the two Dzylo demo videos + 116 Gemini-timestamped screenshots that the `competitor-research/` teardown is built from — that subfolder is primary evidence, the rest of `INTERIOR LANE/` is not.

## 3. External repos worth reading

| Repo | Read it for |
|---|---|
| [frappe/erpnext](https://github.com/frappe/erpnext) | **Highest value.** Item master, UOM conversion, BOM explosion, stock valuation — a decade of refinement, solving every trap in PLAN-v0.1 §4. GPL-3: reference architecture, not foundation. |
| [frappe/crm](https://github.com/frappe/crm) | Its Exotel/Twilio telephony integration — working click-to-call plus webhook code. AGPL-3. |
| [shridarpatil/frappe_whatsapp](https://github.com/shridarpatil/frappe_whatsapp) | Mature Cloud API integration — templates, webhooks, status tracking |
| [bozokopic/opcut](https://github.com/bozokopic/opcut) | Cutting-stock optimiser with a REST API — callable as a service |
| [geri1701/freecut](https://github.com/geri1701/freecut) | Kerf-width handling |
| [mru00/cutlet](https://github.com/mru00/cutlet) | Readable guillotine cutting — understand the algorithm |
| [charmlinn/blueprint3d-modern](https://github.com/charmlinn/blueprint3d-modern) | Floor plan / 3D editor, TypeScript |
| [furnishup/blueprint3d](https://github.com/furnishup/blueprint3d) | Its module separation: floorplanner / items / model / three |
| [theLodgeBots/open3dFloorplan](https://github.com/theLodgeBots/open3dFloorplan) | Auto room detection |
| [laanlabs/openPlan3D](https://github.com/laanlabs/openPlan3D) | iOS LiDAR scanning — relevant to site measurement |
| [MarkoBL/AndroidCallLogSync](https://github.com/MarkoBL/AndroidCallLogSync) | Android call-log sync loop. GPL-3: read, never copy. |

## 4. Locked decisions — do not reopen

1. **New multi-tenant core.** Build fresh; port the proven engines from INTERIOR (quotation engine, automation spine, `upsertLeadByPhone` dedupe). INTERIOR stays live and becomes tenant #1 at cutover. Reason: it has **zero tenancy columns** across all 26 tables and RLS is off. Retrofitting `org_id` on a live app costs more than a clean core.
2. **v1 proving ground: modular interior / turnkey.** Other business types become configuration.
3. **Communications: WhatsApp Cloud API only.** AI voice calling out of scope.
4. **Stack:** Next.js on Vercel + Supabase (Postgres + Storage).
5. **Payments** behind a provider-agnostic interface.

## 5. Settled research — do not repeat it

- **iOS cannot read the call log, ever.** Confirmed against Apple's docs and by market behaviour — Runo, the category leader, has no iOS call tracking either.
- **Call audio cannot be recorded on an unmodified Android phone.** Needs `CAPTURE_AUDIO_OUTPUT`, a system permission. **The client has confirmed recording is not mandatory**, which removes the fragile part.
- **Android call logs are readable** under Google Play's **"Enterprise CRM — corporate login required"** exception. Dzylo ships this as a *separate* app, keeping the restricted permission off the main app. Copy that.
- **WhatsApp Coexistence** runs the Business app and Cloud API on one number, real-time two-way sync, six months of history import.
- **The AI ecosystem is finished, not missing.** All 11 phases deployed. **Run `npm run test:e2e` in INTERIOR** rather than re-deriving status from docs.
- **UPI AutoPay mandates cap at ~₹5,000–₹15,000**, constraining annual plan pricing.
- **Dzylo's gap** is everything downstream of the quote — BOM, cutlist, nesting, panel traceability, factory routing, site measurement variance. That gap is the product's wedge.

## 6. Architecture established — build on it

**The Scope Item is the spine.** One record — *"wardrobe, 10ft x 8ft, bedroom 2, laminate finish, Rs 1,850/sq ft"* — created once and enriched by every module:

```
Scope Item → quotation line → sales-order line → BOM → cutlist/panels
           → job cards → dispatch package → install checklist
           → snag / warranty item → margin line (quoted vs actual)
```

**No module may have its own private line-item table.**

**Sixteen core entities:** Org/Branch · Party (customer, vendor, contractor, architect — one table with roles) · Contact/Address · Opportunity · Project · Space (building → floor → unit → room) · Scope Item · Item · Rate · Document (one abstract numbered document) · BOM/Panel · Task/Job Card · Stock Movement · Ledger Entry · Event · Asset.

**Six configuration layers**, data not code: module registry · vocabulary · custom fields (typed and indexed, not JSON soup) · **tenant-defined item types with attribute schemas** · workflow · documents.

Detail in PLAN-v0.1 §3 and §4.

## 7. What to produce

**Specify every module below.** The first group is from PLAN-v0.1; the second was missing from it entirely and must be added.

**From PLAN-v0.1:** Platform & Admin · Master Data & Catalogue · CRM & Sales · Estimation & Quotation · Projects & Site Execution · Procurement & Vendors · Inventory & Warehouse · Production/Factory (profile-gated) · Finance & Billing · Reporting · Customer Portal · Automation & Notifications.

**Missing — add these:**

1. **Subscription, Plans & Trial** — see `requirements/04`. Append-only usage ledger, **org-scoped**, lifetime counters, Used/Allowed/Remaining, read-only-not-deleted at expiry, one trial per GSTIN, owner controls with actor-and-reason audit.
2. **Tenant onboarding and provisioning** — signup, industry profile selection, company and branch setup, team invitation, role assignment, seed data.
3. **Data migration and import** — every tenant arrives with Excel and Tally. Bulk import per entity with validation, preview, error reporting, rollback.
4. **The interactions layer** — one table across call / whatsapp / email / sms / site visit, with an adapter per channel.
5. **Approvals engine** — chains, thresholds, delegation, escalation, parallel vs sequential, audit.
6. **Notifications** — in-app centre, per-user preferences, digests, channel routing.
7. **Platform services** — search, audit log, file management with versioning, role dashboards, mobile surfaces for site and factory.

For **each component**, produce:

1. **Purpose** — one paragraph.
2. **Data model** — tables, every column with type and constraint, relationships, indexes that matter.
3. **State machine** — every status, allowed transitions, who triggers each, side effects.
4. **Features** — grouped and **exhaustive**, at the level of individual screens and actions.
5. **Calculations and business rules** — **explicit formulas.** Pricing, GST with place of supply, stock valuation, BOM explosion, landed cost. Highest-risk area; never leave these as phrases.
6. **Screens** — page inventory, key elements, available actions.
7. **API surface** — endpoints, request and response shapes.
8. **Permissions** — an actual roles × actions matrix, including field-level visibility.
9. **Validation and edge cases** — what's rejected, and the awkward paths (deleting a PO that has a GRN, stock going negative, a quote revised after acceptance).
10. **Integration points** — what reads and writes this, and the events it emits.
11. **Port vs build** — from INTERIOR, or new.
12. **Open questions** for the client.

Write one file per module into `VEYRA CRM/spec/`, plus `spec/00-architecture.md` for the cross-cutting foundation.

**Calibration:** PLAN-v0.1 §4 (Master Data) is the *minimum* acceptable depth and still only about half what a real spec needs. PLAN-v0.1 §6.4 (Procurement — four bullet points) is what you must **not** produce.

## 8. Rules

- **Indian market throughout:** GST with HSN/SAC and place-of-supply logic, works-contract treatment for turnkey interior work, Indian financial year in numbering series, DPDP Act retention, TRAI/DND for messaging.
- **Prices are never produced by an LLM.** Rates live in configuration, the engine computes, a validator verifies. AI extracts facts, never amounts.
- **Multi-tenancy is structural** — one data-access layer, not sprinkled through route handlers.
- **⛔ RLS is OFF on the Supabase project `vjupynmjzpdzrluwctzd`, by owner decision. Do not enable it. Do not write RLS policies.** Because there is no database-level guard, the one data-access layer is the *only* thing preventing cross-tenant leakage: the browser never queries tables directly, all access is server-side with the **secret** key (never `NEXT_PUBLIC_*`), and `org_id` is enforced in one `withOrg()` accessor plus a lint rule and an every-table-has-`org_id` test. This makes cross-tenant leakage the **#1 risk** (above the item master). Full detail in `CREDENTIALS.md`; keys in `.env.local`.
- **Additive migrations only.** Never name a table `automations`; that belongs to the WhatsApp app in the shared database.
- **Design direction:** white background, near-black text, red as the single disciplined accent — see `competitor-research/DESIGN-DIRECTION.md`.
- Ask the user when a decision is genuinely theirs. Don't stall the whole spec on one question — state an assumption, flag it, keep going.
- Do not spawn subagents unless the user asks.

## 9. Client decisions still outstanding

1. Own factory or job-work? Changes the Production module completely.
2. v1 profile: modular alone, or modular plus carpenter/job-work?
3. Does INTERIOR's live data migrate at cutover, or start clean as tenant #1?
4. SaaS pricing model — per user, per company, or per module?
5. Trial length, per-item limits, payment method required up front?
6. Call tracking route — own Android app, cloud telephony, or integrate Runo/Callyzer?
7. What phones does the team use; is anyone on an iPhone?
8. Target date and business type for the first external tenant.

Also outstanding: the client promised **"a complete deep-detailed draft of the entire workflow along with a master development prompt"** which has not arrived. Structure the spec so it lands as a validation and gap-check pass, not a restart.
