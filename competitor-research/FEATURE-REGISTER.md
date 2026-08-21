# VEYRA feature register — from the Dzylo teardown

The 116-frame Dzylo teardown (`analysis/01-procurement.md`, `analysis/02-operations-crm.md`),
**regrouped under VEYRA's own module names** so it drops straight into the spec / PLAN-v0.2.

**This is the file the task-breakdown AI reads first.** Each row: the feature, our
verdict, the delta (how VEYRA differs/wins), and where it lives in PLAN + build wave.

**Verdicts:** `adopt` build as shown · `adopt+` build but better (delta stated) ·
`planned` PLAN-v0.1 already covers it · `reject` don't build · `oos` out of v1.
**Every row traces to a finding id** in the analysis files (e.g. `PROC-RFQ-007`).

---

## Wave 0 — Platform, Admin & Config

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| Multi-tenant orgs (2 tenants seen: Virtuate, Daizy) | planned | `org_id` in one accessor; **RLS is OFF** so the accessor is the only guard | product-wide | §3.1 | P0 |
| Per-seat licensing (Purchased 20 / Active 12 / Unused 08) | adopt+ | **Answers REQ-04 Q5**: category norm is per-seat, shown as Used/Allowed/Remaining | OPS-HR-003 | REQ-04, §3.2 | P0 |
| Roles + 2FA + reporting-manager hierarchy + global-scope flag | adopt+ | Replace free-text roles with **(module,action,scope)+field-level visibility** | OPS-HR-003 | §3.2 | P0 |
| Data-scoped access (supervisor sees project, not cost) | planned | Field-level visibility is load-bearing (BOQ with/without cost) | PROC-SITE-001 | §3.2 | P1 |
| Settings surface = whole config catalogue | adopt+ | Use as checklist; ours are **data-driven, profile-gated** config layers | PROC-CFG-005 | §3.3 | P0 |
| Numbering series (VID-/DZY- prefix + running int) | planned | **Add Indian-FY segment** (Dzylo lacks it) | product-wide | §3.4 | P1 |
| Doc branding / PDF templates / metadata-visibility toggles | planned | Documents config layer + field-level visibility on PDFs | PROC-CFG-001 | §3.2/§3.3 | P1 |
| Master T&C clause library + auto-attach | planned | terms library | PROC-CFG-003 | §3.3 | P2 |
| Payment-plan / milestone master (reusable) | adopt | reuse across PO **and** customer contracts | PROC-CFG-002 | §3.3/§6.9 | P1 |
| Approval engine (notify→review→approve/reject+comment) | planned | Dzylo = single-step; **ours = chains/thresholds/delegation/escalation** | PROC-APP-001 | §3.4 | P1 |
| Audit log (proxy-entry attribution, change reasons, "Audit" btn) | planned | append-only service, surfaced everywhere | PROC-RFQ-005, OPS-FIN-001 | §3.4 | P1 |
| Comments / @mentions / activity feed (per-document) | planned | one component reused on every doc | PROC-COMM-001 | §3.4 | P2 |

## Wave 0/1 — Subscription, Plans & Trial (REQ-04, missing from PLAN-v0.1)

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| AI usage credits ("Daizy AI — 328 credits, 2/page") | adopt+ | **Meter via REQ-04 append-only ledger, NOT a decrementing counter** (Dzylo's counter is the resettable loophole REQ-04 warns of) | PROC-MR-002, OPS-EST-002 | REQ-04 | P0 |
| Seat counter (Purchased/Active/Unused) | adopt | the Used/Allowed/Remaining display the client asked for, applied to seats | OPS-HR-003 | REQ-04 | P0 |
| Metered items (quotations, BOQs, AI parses, exports, users) | adopt+ | one ledger, org-scoped, lifetime counters; read-only-not-deleted at expiry | REQ-04 | REQ-04 | P0 |

## Wave 1 — Master Data & Catalogue

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| Material catalog master + **bulk CSV import** (SKU/UOM/HSN) | planned | **+ image-zip by SKU, variants, multi-UOM conversion** (Dzylo flat) | PROC-CFG-004 | §4, §4.7 | P0 |
| Catalogue autocomplete on every line entry | adopt | item is a **reference or flagged ad-hoc**, never free `item_code` | PROC-MR-003 | §4.7 | P1 |
| Labour Catalog / Machine Catalog / Modular Catalog | adopt+ | model as Item types + Party roles, not parallel modules | PROC-CFG-005, OPS-LAB-001 | §4.1 | P1 |
| Module + Hardware + Accessories masters (parametric) | adopt | mirror the 3-master split for "modules as items" | PROC-CFG-005 | §4.7 | P1 |
| Ad-hoc item promote-to-master (at receiving gate) | adopt+ | enforce **earlier** (at line entry); keep receiving as backstop | PROC-WH-002 | §4.7 | P1 |

## Wave 1 — CRM & Sales

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| Leads list: inline status, multi-assignee, remarks | adopt+ | **port `upsertLeadByPhone`/`phone_key`** — Dzylo shows the forked-duplicate bug (same phone, 2 rows) | OPS-CRM-003 | §6.1 | P1 |
| Configurable pipeline stages / Kanban (22 stages seen) | planned | + stage SLA, ageing, rot alerts | OPS-CRM-002 | §3.3/§6.1 | P1 |
| Lead KPIs, source breakdown, conversion trends | planned | source is an **attribute**; referral tracking (architects) key | OPS-CRM-001 | §6.1/§6.10 | P2 |
| 360° lead profile (scope, budget, rooms, theme) | planned | capture as **typed/custom fields** so they flow to the quote | OPS-CRM-004 | §3.3/§6.1 | P1 |
| Public lead-capture form link | adopt | writes to the interaction/dedupe layer | OPS-CRM-003 | §6.1 | P2 |
| Follow-up scheduler + manager activity monitor | planned | driven by automation next-action queue | OPS-HR-001, OPS-CALL-001 | §6.1 | P2 |

## Wave 1/4 — Interaction layer & telephony (REQ-03)

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| **Call logs** (direction/status/duration/agent/provider) | adopt+ | **Confirms PLAN §6.1a**: Dzylo built their own dialer (`Provider: Dzylo Dialer`) into one call-log table — no magic extension | OPS-CALL-001 | REQ-03, §6.1a | P1 |
| One interactions table across channels | adopt+ | ours spans **call+WhatsApp+email+sms+visit**; Dzylo call-only | OPS-CALL-001, OPS-CRM-003 | §6.1a | P1 |
| RFQ/PO dispatch via WhatsApp + email | adopt | writes `interactions` rows via ported outbox spine | PROC-RFQ-001, PROC-APP-002 | §6.8/§6.1a | P1 |
| Recording + transcription + AI disposition | adopt+ | only if **in the media path** (bridged) — Dzylo's device log can't | OPS-CALL-001 | §6.1a (Wave 7) | P2 |
| Gamified wallboard (streaks, badges, connect-rate) | adopt | copy connect-rate framing off **real bridged data** | OPS-CALL-001 | §6.1a | P3 |

## Wave 2 — Estimation & Quotation

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| Section/room-grouped BOQ, per-line area/UOM/margin/discount, GST-in-total | adopt+ | **port INTERIOR engine**; line = **Scope Item** flowing downstream; **prices never from LLM** | OPS-EST-001 | §1.1/§6.2/§8 | P0 |
| Quote versioning + status + share link | adopt+ | add **visible diff**; share link = INTERIOR `/q/<token>` | OPS-EST-001 | §6.2 | P1 |
| Quotation templates ("3BHK Premium") | planned | save room/scope sets for reuse | OPS-EST-001 | §6.2 | P2 |
| Threshold approval on quote (Request Approval) | planned | discount approval = margin-leak control | OPS-EST-001 | §3.4/§6.2 | P1 |
| AI prompt-to-BOQ | adopt+ | AI structures scope; **engine prices, validator verifies**; Claude only | OPS-EST-002 | §8/REQ-01 | P1 |
| Cost roll-up beside quoted price | planned | the owner's screen Dzylo never shows | OPS-EST-001 | §6.2 | P1 |
| GST place-of-supply + works-contract | planned | Dzylo captures place-of-supply on RFQ; extend to works-contract | OPS-EST-001, PROC-RFQ-006 | §6.2/§6.9 | P1 |

## Wave 3 — Projects & Site Execution

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| Single-project hub (module tab bar, financials, milestones, embedded procurement) | adopt+ | **per-project P&L from Scope-Item margin lines**; module bar gated by registry/profile | OPS-PROJ-002 | §1.1/§3.3/§6.3/§6.9 | P1 |
| Portfolio dashboard + health (On Track/Delayed/Budget Exceeded) | planned | add health indicator to project list | OPS-PROJ-001 | §6.3/§6.10 | P2 |
| Design vault + client collab + pin-comments + digital sign-off | adopt | upload-and-approve (already in INTERIOR); sign-off gate | OPS-DES-001 | §6.7 | P2 |
| WBS / tasks / dependencies / AI timeline | planned | tasks = **Job Cards off Scope Items** | OPS-PLAN-001 | §6.3 | P2 |
| Daily site logs + chronological photo feed | planned | **offline-tolerant** mobile capture; one field app | OPS-SITE-001 | §6.3/§6.1a | P2 |
| Site attendance + geo check-in | planned | the surviving piece of HR | OPS-HR-001 | §6.3 | P1 |
| Site measurement variance (measured vs quoted) | planned | **Dzylo has NO variance workflow — our wedge** (site-measurement templates only) | (gap) | §6.3 | P1 |
| Labour master / attendance / cost-vs-budget | adopt | Party role + service Item; feeds P&L; payroll deferred | OPS-LAB-001 | §4.1/§6.9 | P2 |

## Wave 4 — Procurement, Inventory & Vendors

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| Material Request (list, stages, row actions, AI parse) | planned | line = Scope-Item ref; add Source column | PROC-MR-001/002/003 | §6.4 | P1 |
| Import MR from approved quotation | adopt | free from the Scope-Item spine | PROC-MR-004 | §1.1/§6.4 | P1 |
| RFQ (multi-vendor, terms, dispatch, revisions, expansion) | planned | dispatch = interaction layer; versioned bids | PROC-RFQ-001/002/003 | §6.4 | P1 |
| **OTP vendor portal (public tokenized, tenant-branded)** | adopt+ | = INTERIOR `/q/<token>`; add **email-OTP fallback**; capture HSN+GST not free "tax" | PROC-RFQ-004 | §6.2/§6.4 | P1 |
| Proxy rate entry + attribution | adopt | real-world (offline vendors) with visible audit | PROC-RFQ-005 | §3.4 | P2 |
| **Bid comparison matrix (L1/L2/L3 green/orange)** | adopt+ | rank on **landed cost** (freight+ITC+lead-time), allow **split award** | PROC-RFQ-007 | §4.5/§6.4 | P1 |
| One-click PO from winning bid | adopt+ | **split-award → multiple draft POs** | PROC-RFQ-008 | §6.4 | P1 |
| Orders list (2 state machines: order + payment) | planned | keep the dual-state model | PROC-PO-001 | §6.4 | P1 |
| Standalone/direct PO + rate-contract supplier | adopt | `vendor_rate_contracts` autofill | PROC-PO-002 | §4.6/§6.4 | P1 |
| PO ship-to auto-sync from project site + override | adopt | ship-to = Space/Address on Project | PROC-PO-003, PROC-SITE-002 | §6.4 | P1 |
| Acceptance queue (partial/accepted, overdue-red) | adopt+ | **add QC step** (accept/reject/quarantine per line) | PROC-DELIV-001 | §6.4/§6.5 | P1 |
| Stock-in / Add Stock (qty, unit-rate, GST%, total, warehouse) | adopt+ | **+ landed cost, ITC split, lot/batch, moving-avg valuation** | PROC-WH-001 | §4.5/§6.5 | P1 |
| Unlisted-item gate (confirm disabled until catalogued) | adopt+ | enforce earlier; register with full item attrs | PROC-WH-002 | §4.2-4.4/§4.7 | P1 |
| GRN auto-gen + PO→GRN link + Excel export | adopt+ | **add 3-way match** (PO↔GRN↔bill); Excel = stopgap vs Tally export | PROC-GRN-001 | §6.4/§6.5/§6.9 | P1 |
| Stock movements ledger (projection, not counter) | planned | inter-site transfer w/ transit approval; site is a location | PROC-GRN-001, OPS-PROC-RECAP | §6.5 | P1 |
| Vendor master + performance rating | planned | rating **computed** from PO/GRN history; vendor = Party role | OPS-VEND-001 | §6.4 | P2 |

## Wave 5 — Production / Factory (the moat — Dzylo has NONE of this)

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| BOM explosion, cutlist, nesting, panel QR traceability, CNC/DXF, work centers | build | **Dzylo stops at the quote — zero factory. This is the entire wedge.** No competitor frame exists to teardown; build from PLAN §6.6 | (gap — no Dzylo evidence) | §6.6 | P1 |

## Wave 6 — Finance & Reporting

| Feature | Verdict | VEYRA delta / note | Finding | PLAN | P |
|---|---|---|---|---|---|
| Contract-based customer milestone billing (%/work-done/inflow-outflow) | adopt+ | auto-import from accepted quote; **add GST invoice / e-invoice IRN / e-way-bill** | OPS-FIN-001 | §6.2/§6.9 | P1 |
| Vendor milestone payment schedules | adopt | outflow side of the same contract model | OPS-FIN-001 | §6.9 | P2 |
| Site expense / petty cash + voucher generator | planned | feeds project P&L actual cost | OPS-FIN-002 | §6.9 | P2 |
| Org cash-flow dashboard + trends | planned | roll-up of per-project financials | OPS-FIN-003 | §6.9/§6.10 | P2 |
| Multi-department reports + Excel/PDF export | planned | six real reports, incl. audit-trail report | OPS-REP-001 | §6.10/§3.4 | P2 |

## Deferred / rejected / out-of-scope

| Feature | Verdict | Why | Finding | PLAN |
|---|---|---|---|---|
| Imagino generative 2D→3D render (Google "Nano Banana") | oos | Generative design deferred + **Claude-only (REQ-01)** — can't match like-for-like; **open question** for client re: model exception | OPS-AI-001 | §5/REQ-01 |
| Inspiration wall / 360 virtual tour | adopt (thin) | Asset gallery + iframe embed, no AI | OPS-EXP-001 | §6.7 |
| Full HR / leave / WFH / payroll | oos | deferred; only site attendance survives v1 | OPS-HR-002 | §5 |
| Warranty service desk (AMC, technician dispatch) | oos (v1.5) | handover + warranty **registration** in v1; full desk later | OPS-SUPP-001 | §5 |
| Training / onboarding video hub | reject | static docs, low differentiation | OPS-TRAIN-001 | — |

---

## Coverage matrix — Dzylo vs VEYRA-v1, and the gaps

| VEYRA module (PLAN) | Dzylo demos it? | Our verdict | The gap we exploit |
|---|---|---|---|
| Platform / Admin / Config | ✅ strong (Settings, Users, RBAC) | planned/adopt+ | Data-driven **profile-gated** config; structured perms; FY numbering |
| **Subscription/Plans/Trial** | ◐ (AI credits, seat counter) | adopt+ | **Append-only usage ledger** (no reset loophole) — REQ-04, *missing from PLAN-v0.1* |
| Master Data & Catalogue | ✅ (catalog + CSV) | planned | Variants, multi-UOM conversion, image-zip, tenant item types |
| CRM & Sales | ✅ strong | adopt+ | **Phone dedupe** (Dzylo forks duplicates); channel-agnostic timeline |
| **Interaction layer / call tracking** | ✅ (own dialer, call logs) | adopt+ | One table all channels; **media-path recording+AI** (REQ-03) |
| Estimation & Quotation | ✅ strong | adopt+ | Scope-Item spine; cost roll-up; works-contract GST; no-LLM-pricing |
| Projects & Site Execution | ✅ strong (hub) | adopt+ | **Site-measurement variance** (Dzylo has none); offline mobile |
| Procurement & Vendors | ✅ **very strong** (whole video 1) | planned/adopt+ | **Landed-cost** ranking, split award, QC, 3-way match, lot/batch |
| Inventory & Warehouse | ✅ (stock-in, transfers) | planned | Moving-avg valuation, lot/batch, ITC split |
| **Production / Factory** | ❌ **nothing** | build | **BOM→cutlist→nesting→panel QR→CNC. The entire moat.** |
| Finance & Billing | ✅ (milestones, cash flow) | adopt+ | GST e-invoice/IRN/e-way-bill; P&L from margin lines |
| Reporting | ✅ | planned | Six focused reports, not a builder |
| Customer Portal | ✅ (client collab, sign-off) | adopt | Visibility-controlled per config |
| Automation & Notifications | ◐ (WhatsApp/email dispatch) | planned | Ported `crm_events`→outbox spine + rule-builder UI |
| Design 2D/3D (generative) | ✅ (Imagino) | oos | Deferred + Claude-only constraint |

**The one-line strategic read:** Dzylo is a genuinely strong **CRM + projects + procurement + light-finance** product for design firms — stronger and more polished than PLAN-v0.1 assumed, especially in procurement. VEYRA matches that surface by **porting INTERIOR's quotation/automation/dedupe engines** and specifying the procurement depth this teardown now provides — then **wins on the half Dzylo doesn't have: the factory** (BOM/cutlist/nesting/panel traceability) and **site-measurement variance**, exactly as `research/competitors-and-foundations.md` predicted, now proven frame-by-frame.
