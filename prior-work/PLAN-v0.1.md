# Interiorlane — Platform Plan

*What we are building, what goes in it, in what order, and what will bite us.*
Planning document, v0.1 · 2026-08-17

---

## 0. Decisions already locked

| Decision | Call |
|---|---|
| Codebase | **New multi-tenant core.** Port the proven engines out of `TOO MUCH/INTERIOR` (quotation engine, automation spine, lead dedupe). INTERIOR stays live and becomes tenant #1 at cutover. |
| v1 proving ground | **Modular interior / turnkey.** Deepest workflow in the industry — it touches every module end to end. Every other business type is a subset or a sibling of it, so we prove the hardest path first. |
| Specification source | This document and what follows from it. The 365 PDF mockups are **not** the spec. |
| AI | De-prioritised for v1 per the client. The existing agents get switched back on in a late wave, unchanged. Claude only. |

---

## 1. What this product actually is

Every generic business suite — Zoho, Odoo, a dozen Indian CRMs — can do leads, invoices and stock. None of them can take *a room* and turn it into *a priced, manufactured, installed, warrantied outcome*. That gap is the whole product.

> **Interiorlane is the operating system for made-to-order built environments.**
> One record for a piece of work, followed from enquiry through design, price, purchase, manufacture, site, money and handover — without anyone retyping it.

Everything below is judged against one test: **does it keep a single piece of scope moving without re-entry?** Features that don't serve that are decoration, however impressive they look in a demo.

### 1.1 The idea that makes the whole thing work: the Scope Item

This is the architectural heart, and getting it right is worth more than any ten features.

A **Scope Item** is one piece of work in one place — *"wardrobe, 10′×8′, bedroom 2, laminate finish, ₹1,850/sq ft."* It is created once, at enquiry or design, and then **every module reads and enriches the same row**:

```
Scope Item
  → quotation line        (priced)
  → sales-order line      (sold, frozen)
  → BOM                   (exploded into materials)
  → cutlist / panels      (manufactured)
  → job cards             (routed through the factory)
  → dispatch package      (packed, QR-tagged)
  → install checklist     (fitted on site)
  → snag / warranty item  (owned after handover)
  → margin line           (quoted vs actual cost, per item)
```

Build it once and "the complete journey" the client asked for is a property of the data model, free of charge. Let each module invent its own line-item table — which is what nearly every competitor did — and you spend the next two years writing sync code between your own modules and losing margin data at every hop.

**Non-negotiable:** no module gets its own private line-item table. Everything hangs off Scope Item.

---

## 2. The core object graph

Sixteen entities carry the platform. Everything else is an attribute of one of these.

| # | Entity | Note |
|---|---|---|
| 1 | **Org** → **Branch** | The tenant, and its business units. Every row in the system carries `org_id`. |
| 2 | **Party** | One table for customer, vendor, contractor, architect, partner — with *roles*, because a vendor is often also a customer, and an architect is both a lead source and a supplier. Separating them into three tables is a mistake you cannot undo cheaply. |
| 3 | **Contact** / **Address** | People and places belong to parties, many-to-many. Site address ≠ billing address ≠ GST address. |
| 4 | **Opportunity** | A party + a possible project. Lives in the pipeline; dies or becomes a Project. |
| 5 | **Project** | The container: type, stage, budget, team, site, documents, money. |
| 6 | **Space** | Building → floor → unit → room. One tree serves a builder's 200 flats and a designer's 4 rooms. Interior work is priced roomwise; this is what makes that natural. |
| 7 | **Scope Item** | §1.1. The spine. |
| 8 | **Item** (catalogue) | Materials, hardware, finished goods, services, labour, and *modules*. See §4. |
| 9 | **Rate** | Rate books, price lists, tiers, project overrides — all effective-dated. Never a bare `price` column on Item. |
| 10 | **Document** | One abstract numbered document: quotation, sales order, PO, GRN, invoice, credit note, challan, work order. They share numbering, versioning, approval, PDF, share link and audit — write that once. |
| 11 | **BOM / Panel** | Derived from Scope Items through module rules. |
| 12 | **Task / Job Card** | Units of execution: assignable, checklisted, evidenced. |
| 13 | **Stock Movement** | Item × location × lot, with a reason. Stock levels are a *projection*, never a stored number you update by hand. |
| 14 | **Ledger Entry** | Money: invoices, receipts, bills, payments, expenses, milestones. |
| 15 | **Event** | The ported automation spine (`crm_events` → dispatcher → outbox). |
| 16 | **Asset** | Files, images, drawings — attachable to any of the above, polymorphic. |

---

## 3. The foundation layer — Wave 0, and the reason we're starting fresh

The client said *"multi-company and scalable from the beginning."* That sentence is a data-layer instruction, not a feature request. INTERIOR has **zero tenancy columns across all 26 tables**. Every module built before this layer exists gets rewritten after it.

Wave 0 ships nothing a user can see. It is still the most important wave in the plan.

### 3.1 Tenant isolation
`org_id` on every row, enforced in **one** data-access layer, not sprinkled across route handlers. Cross-tenant leakage is a company-ending bug in B2B SaaS; it must be structurally impossible, not carefully avoided. One `withOrg()` accessor, a lint rule banning raw table access, and a test that asserts every table has the column.

### 3.2 Identity, roles, permissions
- Users belong to many orgs (a consultant serves several companies) — membership is its own record.
- Permission granularity: **(module, action, data-scope)**. Scope = own / team / branch / org.
- **Field-level visibility** is a first-class requirement, not a nicety: a site supervisor sees the BOQ without cost, the customer sees a different subset again, the partner sees only their branch. Building this late means retrofitting every query and every PDF.
- Role templates per industry profile, fully editable by the tenant.

### 3.3 The configuration engine (this is what "fully customizable" actually means)

Six independent layers. Each one is data, not code:

| Layer | What the tenant controls |
|---|---|
| **Module registry** | Which modules are on. A carpenter doesn't get Procurement; a builder doesn't get Cutlist. |
| **Vocabulary** | What things are called. Builder says "unit", designer says "room", carpenter says "job". Same table, tenant-chosen label. |
| **Custom fields** | Typed, validated, per-entity fields on any core object — with display rules and reporting support. Typed definitions + indexed values, *not* a JSON blob (you will need to filter and report on these). |
| **Custom item types** | Tenants define their own item types and attribute schemas. §4.2 — this is the heart of the inventory ask. |
| **Workflow** | Pipeline stages, project stages, approval chains, thresholds, SLAs, automation rules. |
| **Documents** | Numbering series, templates, terms library, tax rules, print layout, branding. |

### 3.4 Cross-cutting services built once, used everywhere
Numbering series (per doc type, per branch, per **Indian financial year**) · generic multi-level approval engine with threshold rules · audit log · attachments · comments and @mentions · bulk import/export on every entity · notifications · search · soft delete and restore.

Every one of these is cheap now and brutal to retrofit. Approvals in particular: bolting an approval step onto an existing document flow means touching every state transition in the system.

---

## 4. Master Data & Catalogue — the module everything else depends on

The client's own example. It is also, correctly, the hardest thing in the plan. Quotation, BOM, cutlist, procurement, inventory, production and invoicing are *all* downstream of the item master. **If the item model is wrong, six modules are wrong**, and no amount of good UI upstream saves it.

### 4.1 Item types shipped out of the box
Sheet & board · edge band · hardware SKU · consumable (adhesive, screws, polish) · fabric & soft furnishing · tile / stone / area-goods · finished product · appliance · **service / labour** · **module** (parametric assembly) · kit / bundle.

### 4.2 Tenant-defined item types and attribute schemas
The tenant can create a new type — say *Curtain Fabric* — and define its attributes: width, GSM, pattern repeat, composition, washability. Those attributes then behave like native fields: filterable, searchable, reportable, printable on a quote, usable in a pricing rule.

Without this the platform is furniture-shaped and dies the first time a tile dealer or a mattress maker signs up. With it, "works for the whole industry" becomes true rather than aspirational.

### 4.3 Variants
An item carries an attribute matrix that generates SKUs: *Laminate 1mm × 30 shades = one parent, thirty children.* Stock, price and images live at the variant; specification and media live at the parent. Skip variants and a 50,000-SKU catalogue becomes unmanageable inside a month.

### 4.4 Units of measure — where ERP implementations go to die
Buy in **sheets**, store in **sheets**, consume in **sq ft**, sell in **running ft**, cost in **kg**. Multi-UOM with per-item conversion factors, and a rule about which UOM each document defaults to. Get this wrong and every number in the system is subtly wrong in a way nobody catches for six months.

### 4.5 Costing and pricing
- **Cost:** standard, last purchase, moving average — per warehouse. Landed cost with freight and duty apportionment, GST split into ITC-able and non-ITC-able.
- **Price:** rate books → customer tier price lists → project-level override, each effective-dated. Quantity slabs. Margin rules (cost + %, or fixed rate, or per-sq-ft basis).
- **Rate basis is a first-class field**, because Indian interior work prices on: per sq ft of shutter area · per running ft · per unit · per panel · per kg · per day of labour · lump sum. Hard-coding "unit price" breaks the quotation module on day one.

### 4.6 Media and identity
Multiple images **per variant** (a shade swatch is the product), spec-sheet PDF, brand assets · internal code, HSN/SAC code for GST, barcode/QR · vendor cross-reference: item ↔ vendor many-to-many carrying vendor part number, price, lead time and MOQ.

### 4.7 The workflows that make it usable rather than theoretically complete
- **Bulk upload:** CSV plus a zip of images matched by SKU. The client will onboard thousands of SKUs; manual entry is not an onboarding path, it's an abandonment path.
- **Ad-hoc item on a quote line**, promotable to master later. Designers invent items constantly; if the system forbids that, they keep using Excel and you have lost.
- **Lifecycle:** active / discontinued with a replacement pointer; optional approval before an item may be used in a customer-facing quote.
- **Modules as items:** a parametric module (a 2-door base unit) carries dimensional formulas, a component BOM, labour content and a rate basis. This single construct is what makes modular quotation, BOM explosion and cutlist generation possible from one customer-facing line.

---

## 5. Module scope — what's in v1, what waits, and why

Ten modules in v1. Six of the seventeen in the current sidebar are deliberately out, with reasons.

### In v1

| Module | Why it's in |
|---|---|
| **Platform & Admin** | Wave 0. Everything else is illegal without it. |
| **Master Data & Catalogue** | §4. Six modules depend on it. |
| **CRM & Sales** | Where money enters. Also where the existing AI stack already lives. |
| **Estimation & Quotation** | The single highest-value module in this industry, and the strongest existing asset to port. |
| **Projects & Site Execution** | Turns a won quote into delivered work. Without it the platform is a quoting tool. |
| **Procurement & Vendors** | Where margin leaks. Also the module that makes the platform sticky. |
| **Inventory & Warehouse** | Required by procurement, production and site issue. |
| **Production / Factory** | Profile-gated (modular and furniture only). The real moat — nobody in this market does panel-level traceability well. |
| **Finance & Billing** | GST invoice, receipts, ledgers, project P&L. Not a full accounting system — see §6.9. |
| **Reporting** | Six real reports, not a report builder. |

Plus two thin, disproportionately valuable additions: the **Customer Portal** and the **Automation console** (mostly ported).

### Deferred, and why

| Module | Call |
|---|---|
| **HR & Payroll** | Regulated, low differentiation, high effort, and every tenant already has something. **Exception:** site attendance with geo check-in stays in v1 — it's a project-execution feature wearing an HR costume. |
| **Warranty & Service** | v1.5. Handover and warranty *registration* ship with Projects; the full service desk with AMC and technician dispatch follows. |
| **Franchise / Partner network** | Needs multi-org hierarchy — a Wave 0 concept we should design for but not build until a paying tenant needs it. |
| **Commerce / D2C store** | Different buyer, different product. Out. |
| **Website builder** | A per-tenant micro-site is v2 at best. Building a page builder inside an ERP is a well-known way to lose a year. |
| **Design 2D/3D** | Client already deferred it. The upload-and-approve pattern already built in INTERIOR carries v1. |
| **AI Assistant** | Client explicitly deprioritised. Wave 7 re-attaches what already exists. |

---

## 6. Module feature plans

### 6.1 CRM & Sales

**Fix the thing you already flagged.** Segregating leads into calls / WhatsApp / website is filing by plumbing. Source is an *attribute*, not a silo.

- **One party record.** Every channel — call, WhatsApp, web form, walk-in, architect referral, marketplace — writes to the same party, deduped on phone. (Port `upsertLeadByPhone`; the existing `phone_key` approach already solved the space-formatting bug that silently forked customers.)
- **Channel-agnostic timeline.** Calls, messages, emails, site visits, quotes sent, quotes viewed, payments — one chronological thread. This is the screen the business owner actually opens.
- **Pipeline** with tenant-defined stages, weighted value, stage SLA, ageing and rot alerts.
- **The next-action queue.** The dashboard's job is answering *"what needs me today"* — driven by the automation engine, not a list of 400 rows sorted by date. Phase 11 of INTERIOR already started this; carry the idea forward and make it the default view.
- Qualification fields, budget band, timeline, source attribution with campaign/cost, referral tracking (architects and builders are the real channel in this industry).
- Activities, follow-up scheduling, call outcome logging, lost-reason analysis.
- Assignment rules, round-robin, territory, and a genuine handover trail.
- Bulk import, duplicate detection and merge.

### 6.1a Communication capture — call tracking, WhatsApp, and the interaction layer

The client asked for a "web-based call tracker extension." The requirement is right and it belongs in core CRM. **The mechanism is wrong, and it will not work** — so this needs saying before anyone builds it.

**A browser extension cannot track phone calls.** An extension runs inside the browser. Calls happen on a SIM, a desk phone or a carrier network — none of which the browser can see. The most an extension can ever know is that somebody *clicked* a `tel:` link. It cannot know whether the call connected, how long it lasted, whether it was answered, or that an incoming call happened at all. That is one of the nine data points the client listed, and the least useful one.

#### The real architecture: one interaction layer, several adapters

Don't build "a call tracker." Build a single **`interactions`** table that every channel writes into:

```
interactions
  channel      call | whatsapp | email | sms | site_visit | in_person
  direction    inbound | outbound
  status       connected | no_answer | busy | failed | missed | delivered | read
  lead_id, user_id, org_id
  started_at, ended_at, duration_sec
  attempt_no, external_ref (provider call/message id)
  recording_url, transcript, content_ref
```

The lead timeline reads it. The automation spine reads it. Analytics reads it. Then each channel is just an adapter writing rows — and "call tracking" stops being a feature and becomes a consequence of the architecture. This is what makes it core CRM rather than a bolt-on, which is precisely what the client is asking for.

#### Channel 1 — Calls: be in the media path *(the principle everything else follows from)*

**Yes, 100% of calls can be recorded, transcribed, analysed and put on a dashboard.** This is exactly how call centres work, and the trick is one architectural decision:

> **Own the media path.** A call centre never lets a call go agent-phone → carrier → customer. Every call is *bridged by the platform*, so the platform sits in the middle of the audio. Once you are in the audio path, recording is server-side and unconditional — no OS permission, no device cooperation, no Android restriction, no app that can be uninstalled.

That is the whole difference between *tracking* calls and *owning* them. Everything the client asked for — and a great deal more — falls out of it for free.

**Three ways to be in the path.** Pick per role, not per company:

| | How it works | Best for | Trade-off |
|---|---|---|---|
| **WebRTC softphone in the CRM** | Agent wears a headset and dials inside the browser. This is a real call-centre desk. | Telecallers, inside sales, the CRM desk | Needs decent internet and a headset |
| **Click-to-call bridge (two-leg)** | Provider rings the agent's ordinary mobile, then the customer, and bridges. | Field sales, designers, anyone on the move | Agent answers their own phone first — a few seconds of friction |
| **SIP extension on a mobile app** | The agent's phone runs a softphone registered to our PBX; calls travel over data. | Field staff we want fully in the path | Needs the companion app installed and data coverage |

All three produce identical data, because all three are bridged. Indian providers to build the adapter against: Exotel, MyOperator, Knowlarity, Ozonetel, Acefone, Tata Smartflo.

**The flow, in full:**

1. User clicks **Call** on a lead. CRM writes an `interactions` row, `status = initiating`, with the attempt number.
2. CRM hits the provider API **passing our own row id through as a custom reference** — so the webhook correlates exactly and we never guess-match on phone number and timestamp. This single detail is where most naive implementations break.
3. The call is bridged, and recorded at the bridge.
4. On hangup the provider POSTs a webhook: direction, connected / no-answer / busy / failed, duration, timestamps, recording URL.
5. We pull the recording into our own storage (never leave the client's audio living only on a vendor's servers), update the same row, and emit `call.completed` — **a handler that already exists in INTERIOR**, so the follow-up task, next-action entry and recap message come free.
6. Unanswered → auto-schedule the retry, increment attempts, escalate lead status after N.

**What being in the path additionally buys:**

- **Recording of every call**, regardless of the agent's device or OS.
- **Live supervisor tools** — monitor (listen silently), whisper (coach the agent, customer can't hear), barge (join the call). Standard call-centre capability, and the reason quality actually improves rather than just being measured.
- **Number masking.** The customer never sees the agent's personal number, and the agent cannot take the relationship off-platform. In an industry where salespeople leave and take their contacts with them, that is a business feature wearing a technical costume.
- **Inbound.** A virtual number with an IVR routes to the lead owner, logs the call, and auto-creates a lead from an unknown caller. Per-campaign numbers give true source attribution.

#### The dashboard layer — what call centres actually watch

Recording is the input. These are the outputs worth building:

- **Live wallboard:** who's online / on-call / idle, calls waiting, longest wait, abandon rate.
- **Per agent:** calls made, talk time, connect rate, average handle time, disposition mix, follow-up compliance.
- **Per lead:** the full timeline with recordings playable inline, next to the quote and the project.
- **Quality:** call scoring against a rubric, flagged calls, coaching queue.
- **The operational insight nobody has:** connect rate by hour of day (so the team calls when people actually answer), attempts-to-connect distribution, and the source → connect → quote → won funnel with real numbers at each hop.

#### The AI layer on top *(cheap, later, disproportionate)*

Client deprioritised AI, so this is a **Wave 7** item — but the recordings we bank from day one are what make it possible, which is why the storage decision matters now.

Recording → transcription → Claude. Indian-language reality matters here: Hindi, Telugu, Tamil, Kannada and heavy code-switching, so the transcription provider needs to handle Indic and Hinglish (Sarvam, Deepgram, Whisper large-v3 — evaluate on the client's own recordings, not on marketing claims).

Then Claude turns a transcript into: auto-disposition, a summary on the timeline, extracted requirements (budget, timeline, rooms, materials, competitor mentions), objection detection, sentiment, and a suggested next action. **The agent types nothing at all.** That is "least manual work" taken to its actual conclusion, and it is the Gong-for-Indian-interiors capability nobody in this market has.

#### Cost, storage and compliance reality

Audio is ~1 MB/minute compressed — 50 calls a day at 5 minutes is roughly 7.5 GB a month, which is nothing. Per-minute telephony charges and transcription are the real costs, not storage.

Compliance is not optional: a recording announcement at call start, consent captured per lead, and — under India's DPDP Act — purpose limitation, a **configurable retention period per tenant**, and actual deletion when it expires. Outbound marketing calls carry TRAI/DND obligations on top. INTERIOR's existing consent gate (`src/lib/bolna/gate.ts`) is the right pattern to carry over.

#### Channel 2 — Android companion app *(coverage for field staff)*

Site supervisors and carpenters call straight from their phones and will not use click-to-call. An Android app reads the device call log, matches numbers to leads and syncs the events up. Three honest constraints:

- `READ_CALL_LOG` is a **restricted Play permission**. A CRM dialer is an approved use case, but it needs declaration and review, and rejection is a real risk. Distributing privately through Managed Google Play per tenant avoids the review entirely for v1.
- **iOS cannot do this at all.** Apple exposes no call-log API. iOS staff get click-to-call or an in-app softphone; there is no third path.
- Android 10+ blocks third-party recording of *carrier* calls. **This limit disappears entirely if the call runs through our SIP app instead of the carrier** — see the media-path principle above. Log-sync is the fallback for calls we didn't carry; it is not the strategy.

#### Channel 3 — The browser extension, repositioned

It has real value, just not as a tracker. As a **lead-capture and click-to-call trigger** it earns its place: pull enquiries out of IndiaMART, 99acres, Housing.com and JustDial into the CRM, and put a call button with lead context onto any page the team uses. Keep the extension in the roadmap; move it off the critical path for call data.

#### Channel 4 — WhatsApp *(the easy one, and mostly already built)*

WhatsApp is better than calls here, because the Cloud API webhooks give us everything automatically: inbound messages, and outbound **sent / delivered / read / failed** status. Every message — agent-typed or automated — lands in `interactions` against the lead. So "quote delivered, read two days ago, no reply" becomes a queryable state that drives a nudge with no human involved.

What to add on top of the existing build: a **team inbox** so agents reply from inside the CRM, and visible 24-hour session-window state so agents understand when a template is required.

#### The real complaint: "the API number can't be used in the WhatsApp app"

This is correct, and it is the single most common reason businesses resist the Cloud API. Once a number is registered on the API it is API-only — it cannot be opened in WhatsApp or WhatsApp Business on a phone. Agents lose the interface they know.

Three genuine answers, in order of preference:

1. **Coexistence mode.** Meta now supports running the WhatsApp Business *app* and the Cloud API on the **same number**, with contact and chat-history sync — precisely so a business isn't forced to choose. This directly dissolves the complaint. Availability and feature limits have moved around as it rolled out, so **confirm the current state with the BSP before designing around it** rather than assuming.
2. **Our own mobile inbox.** The real constraint is "not the *WhatsApp app*" — not "not on a phone." A mobile team inbox with push notifications gives agents phone-based chat with everything the WhatsApp app lacks: lead context, quote sending, templates, assignment, canned replies, internal notes. This is exactly what every Indian WhatsApp CRM already is — Wati, Interakt, AiSensy, DoubleTick, Respond.io are all Cloud API plus their own app. Solved product pattern, and ours is better because the CRM is underneath it.
3. **Two numbers.** Keep the owner's existing number on the Business app for relationships that should stay personal; put a fresh number on the API for the platform. Crude, instant, sometimes exactly right.

**And the reframe worth giving the client:** for a company rather than a shopkeeper, the API constraint is *protective*. It means every customer conversation lives in the company's system instead of on a salesperson's phone — surviving that person's resignation, visible to a manager, searchable, and attached to the lead. The property that feels annoying is the same property that turns conversations into a company asset.

**The hole to name honestly:** if an agent messages a customer from their *personal* WhatsApp on their own phone, no API on earth sees it. The fix is policy plus making our inbox genuinely better than the phone — not technology.

**And the trap to refuse:** unofficial WhatsApp Web automation libraries (Baileys, WPPConnect, Venom) can scrape personal WhatsApp. Several Indian CRM vendors ship exactly this. It violates WhatsApp's terms and gets the client's business number **banned** — taking their entire customer communication history with it. We use the official Cloud API only.

#### One field app, four jobs

The Android companion app, the mobile WhatsApp inbox and the site-execution mobile surfaces are **not three projects**. One app for field staff carries: SIP calling (so their calls are in the media path and recorded) · WhatsApp inbox · geo site check-in · measurement, snag and progress photo capture. Built once, in Wave 3 when site execution needs it anyway, with the telephony piece landing in Wave 4.

#### What this means for "least manual work"

Auto-captured with zero typing: call metadata and recordings · every WhatsApp message and its read state · email opens · **quote views** (already built) · portal logins · geo site check-ins · document approvals.

The only thing a human should ever enter is *outcome and intent* — and that reduces to a two-tap disposition on the call-end screen. Later, transcript summarisation (Claude) can propose even that, with the agent confirming rather than typing.

### 6.2 Estimation & Quotation

The most valuable module, and the strongest existing code to port.

- **Two fidelities, one document.** *Fast quote* (area × rate, for a walk-in enquiry) and *deep BOQ* (room → section → module → component). A fast quote upgrades into a deep BOQ **without retyping** — that conversion is the feature.
- Roomwise structure, mirroring how the trade actually thinks and prices.
- **Module configurator** — pick a parametric module, set dimensions and finish, get price + component BOM + labour.
- Carpenter / job-work calculators for site-built work: panel area, running feet, hardware counts.
- Optional lines, alternates (Option A / Option B), inclusions and exclusions, terms library.
- Discounting at line / section / total, with **threshold-triggered approval** — the main margin leak in this industry, and a two-line rule if the approval engine exists from Wave 0.
- **GST done properly:** HSN/SAC per line, CGST/SGST/IGST by place of supply, and the works-contract vs goods distinction that turnkey interior work runs into constantly.
- **Versioning with a visible diff.** Customers ask "what changed since last time" on every single revision.
- **Cost roll-up beside quoted price, per line and per project.** The most valuable screen in the product for an owner, and the one generic CRMs never show.
- **BOQ with or without cost** — the same document, two audiences, driven by field-level permissions from §3.2.
- Customer-facing share link with view tracking, line-level comments, accept/reject with e-sign. *(Exists in INTERIOR; the share token is the auth and must never be logged or indexed.)*
- Templates: save a room or a whole scope set for reuse.
- **Accept → generates** the project, the scope items, the payment milestone schedule and the material forecast, in one action.

### 6.3 Projects & Site Execution

- Project created from a won quote, carrying its scope items. Stages configurable per profile.
- **Site measurement capture** (mobile, photos, dimension sheet) and — critically — the **variance workflow**: measured versus quoted, which triggers a priced revision. This is where the client's own business bleeds money today, and almost nothing on the market handles it.
- Tasks with dependencies, assignees, checklists, photo evidence, geo-stamps.
- Daily progress report; snag list with photo capture and closure evidence.
- Site material requisition, flowing into Inventory and Procurement.
- Milestone billing tied to project stages.
- Site attendance with geofenced check-in (the surviving piece of HR).
- Team chat scoped to the project, with a customer-visible and an internal channel.
- **Handover pack:** checklist, digital sign-off, warranty registration, document bundle.

### 6.4 Procurement & Vendors

- Indent / purchase request → **RFQ to multiple vendors** → comparison on **landed** cost, not unit price → PO with approval matrix → GRN with QC and partial receipt → 3-way match against the vendor bill → payment.
- Vendor master: rate contracts, lead times, MOQ, payment terms, performance rating, document expiry (GST, MSME).
- **Project-linked procurement** — buy against project X, reserve it against project X. Without this, site teams steal each other's material and nobody can explain the cost overrun.
- Reorder rules per item per warehouse; purchase returns and debit notes.

### 6.5 Inventory & Warehouse

- Multi-location: godown, factory, **site**, in-transit, vendor-held. Site is a location — that single decision removes an entire class of reconciliation pain.
- Movements: receipt, issue to project/job, transfer, return, adjustment, scrap. **Stock level is always a projection over movements**, never a stored counter.
- **Lot/batch tracking on finishes.** Dye-lot matters — two laminate sheets from different batches on adjacent shutters is a rejected job. Serial tracking for appliances.
- Barcode/QR for stock and for panels.
- Cycle count with variance approval; ageing and dead-stock reporting.
- **Reservation and allocation against projects**, so the same stock is never promised twice.
- Moving-average valuation, per warehouse.

### 6.6 Production / Factory *(profile-gated)*

The moat. Also the thing that makes the modular-interior profile the right proving ground.

- **BOM explosion** from scope items via module rules.
- **Cutlist** generation, roomwise and panel-wise, with edge-band rules and grain direction.
- **Sheet nesting / cutting optimisation** with a wastage report. *(Port whatever exists in INTERIOR; this is a real algorithmic asset.)*
- Panel labels with QR; CNC/DXF export.
- Work centers, job routing, capacity and load view.
- QC checklist with a rework loop and rework cost attribution.
- Packing list → dispatch challan → installation kit.
- **Panel-level traceability via QR:** cut → edgebanded → drilled → QC → packed → dispatched → installed. One scan answers "where is bedroom 2's wardrobe shutter" — a question that currently costs a supervisor an hour on the phone.

### 6.7 Customer Portal

Thin to build, disproportionate in effect, and near-absent in this market.

Quote view and approval · design and material approval with comments · project progress and photos · payment schedule and receipts · snag raising · document pack at handover. Every item visibility-controlled by tenant configuration.

### 6.8 Automation & Notifications

Mostly **ported, not built.** The existing `crm_events` → dispatcher → `notification_outbox` spine with per-rule toggles is genuinely good architecture. It needs: `org_id`, per-tenant rules, and a rule-builder UI over what the code already does.

Then the client's own list — message after every stage, quotation delivery, reminders, follow-ups, payment nudges — is configuration, not development.

### 6.9 Finance & Billing

- GST tax invoice with correct HSN/SAC, e-invoice (IRN) and e-way-bill fields ready.
- Advance / milestone / progressive billing; receipts with allocation across invoices.
- Customer and vendor ledgers with ageing; credit and debit notes; TDS/TCS fields.
- Expenses and petty cash, project-attributed.
- **Project P&L:** quoted vs actual cost vs collected. The number the owner cares about most.
- **Explicitly not** a double-entry accounting system in v1. Ledger plus clean export to Tally and Zoho Books. Building accounting is a year-long detour that competes with incumbents on their strongest ground and wins nothing.

### 6.10 Reporting

Six reports that get used, rather than a builder nobody opens: sales funnel and conversion · project profitability · receivables ageing and cash forecast · inventory turns and dead stock · vendor performance and price trend · production throughput and wastage.

---

## 7. Build sequence

Waves, gated by dependency. Nothing starts before its gate is genuinely done.

| Wave | Content | Gate it opens |
|---|---|---|
| **0** | Tenancy · auth · RBAC · config engine · numbering · approvals · audit · files · custom fields | Everything. Zero user-visible output; skipping it costs the project. |
| **1** | Master data & catalogue · parties · CRM pipeline · unified inbox · **interaction layer + telephony adapter** | Quotation, procurement, inventory |
| **2** | Quotation & estimation (port + extend) · sales order · **billing lite** (invoice + receipt) | Money can enter the system |
| **3** | Projects · site execution · measurement variance · customer portal | Delivery is trackable; the journey closes end to end |
| **4** | Procurement · inventory | Production, real costing |
| **5** | Production / factory | The moat, and the modular profile is complete |
| **6** | Finance full · project P&L · reporting | The owner's numbers |
| **7** | Automation console · AI re-attach (switch on existing WhatsApp + voice) | The client's original seven asks, on a multi-tenant base |
| **8+** | Profiles 2..n — builder, contractor, architect, furniture, dealer | Market expansion, as *configuration* |

Two notes on sequencing. **Billing lite rides with Wave 2**, not Wave 6 — a platform that can quote but can't invoice isn't usable by a real company, and early tenants need to transact. And **Wave 3 is the first wave that could carry a paying customer**: quote → project → deliver → invoice is a complete loop.

---

## 8. Port vs. build

| From INTERIOR | Call |
|---|---|
| Quotation engine (`quote_presets`, computed lines, validator, PDF, `/q` share) | **Port.** Highest-value asset. Keep the rule that prices never come from an LLM. |
| Automation spine (`crm_events`, dispatcher, `notification_outbox`, rules) | **Port + generalise.** Add `org_id` and per-tenant rules. |
| `upsertLeadByPhone` dedupe + `phone_key` | **Port.** A solved bug worth carrying. |
| WhatsApp bridge + Bolna voice integration | **Port in Wave 7**, unchanged. Built and credential-gated already. |
| Sheet-cutting / cutlist logic | **Port in Wave 5**, audit first. |
| Schema (26 tables, no tenancy) | **Redesign.** This is the reason we're starting fresh. |
| Admin UI | **Rebuild.** Single-tenant assumptions run through it. |

---

## 9. What will bite us

Ranked by how expensive they are once they've happened.

1. **The item master and UOM model.** Wrong here means rewriting six modules. Spend disproportionate time on §4 before writing a line of quotation code.
2. **Cross-tenant leakage.** One shared query without `org_id` and you have an incident, not a bug. Structural enforcement, not discipline.
3. **Scope creep across twelve industries.** The profile layer is the discipline. Every "can it also do X" gets answered with *"which profile, and is it configuration?"* — never with a new module.
4. **GST and works-contract complexity.** The tax treatment of turnkey interior work is genuinely ambiguous; model it as configurable rules rather than baking in one interpretation.
5. **Copy-paste porting.** The temptation to lift INTERIOR files wholesale will carry single-tenant assumptions into the clean core. Port behaviour and tests; retype the data access.
6. **Field connectivity.** Sites and factories have bad signal. Mobile surfaces — measurement, attendance, QR scan, snag capture — need to tolerate offline and sync later. Designed in from Wave 3, not patched in later.
7. **Migration.** Every tenant arrives with Excel and Tally. Bulk import on every entity is an onboarding feature, not a nice-to-have.
8. **Scale shapes nobody tests:** a 50,000-SKU catalogue, a 2,000-line quotation, a project with 400 units. Set these as performance targets in Wave 1 rather than discovering them in production.
9. **Unofficial WhatsApp automation.** Tempting, common in this market, and it gets the client's business number permanently banned along with their communication history. Official Cloud API only — see §6.1a.
10. **Play Store restricted permissions.** If the Android companion app (§6.1a) is on the critical path, its review risk is on the critical path too. Keep it in a later wave and distribute privately per tenant to start.

---

## 10. Open questions for the next session

1. **Profile depth for v1** — do we ship the modular profile alone, or the modular + carpenter/job-work pair (they share most of the model and would prove the profile layer actually works)?
2. **Factory reality** — does the client run their own factory, or job-work it out? Wave 5's shape changes completely between the two.
3. **Existing data** — how much live data is in INTERIOR now, and does it migrate into the new core at cutover, or does the client start clean as tenant #1?
4. **Pricing model for the SaaS itself** — per user, per company, per module? This shapes the subscription and metering design, which belongs in Wave 0's config layer, not bolted on later.
5. **Target for first external tenant** — what date, and which business type? That answer sets the cut line for everything above.
6. **Telephony provider** — Exotel / MyOperator / Knowlarity / Acefone. The adapter is provider-agnostic, but one has to be first. Needs a call on cost per minute, inbound number rental and KYC turnaround.
7. **How does the client's team call today?** Personal mobiles, a desk setup, or already on a cloud dialer? If it's personal mobiles for field staff, the Android companion app (§6.1a) moves earlier and its Play review risk becomes real.
8. **Call recording and consent** — recording changes the consent posture, and outbound marketing calls carry TRAI/DND obligations. INTERIOR already has a consent gate (`src/lib/bolna/gate.ts`) worth carrying across.
