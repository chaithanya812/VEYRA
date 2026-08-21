# Dzylo teardown — Video 2: Workspace, CRM, Estimation, Projects, Finance, AI, Reporting

**Source video:** [youtu.be/NYw__DcZEH8](https://www.youtube.com/watch?v=NYw__DcZEH8) — *"Dzylo Product Demo | Complete Business Management ERP"*, Dzylo AI, 11:27.
**Product:** Dzylo One. Tenants shown: "Virtuate Technologies", "Daizy Designs / Daizy Interiors" — **two tenants in one video, confirming multi-tenancy** (and per-tenant doc prefixes: `VID-` vs `DZY-`).
**Frames:** 57 in `source/frames/video-02/`. Verdict key as in `01-procurement.md`.

> **B-roll warning.** Video 2 opens with stock footage and cuts to it between sections, so several timestamped frames are **not UI** — they're a person with a phone (`06`), a call-centre (`03`), a client meeting (`42`). These are flagged `b-roll` below and carry no spec value. This is why video 2's frames are less uniformly useful than video 1's; the Gemini doc's *descriptions* are still accurate to the feature being narrated, so those are used where the frame itself is filler.

---

## 1. Workspace, HR & RBAC

### OPS-HR-001 · Personal workstation dashboard (attendance, action queue) `b-roll frame`
video-02 @ 00:21 / 00:30 · `01_…` `02_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=21)
> "Clock-In/Out widget capturing timestamps and geolocation… assigned active projects, upcoming tasks with priority tags, overdue tasks with delay alerts, expense claim status."
**Cross-ref** The **same dashboard is fully visible in video-01 frame `01`** (Attendance card with Check-In/Out, "office sec 52" geo, Active Projects, My Tasks, Past Due Tasks table, My Expense with running balance).
**Verdict** already-planned. Attendance-with-geo is PLAN §6.3 "site attendance with geofenced check-in (the surviving piece of HR)". The action queue = PLAN §6.1 "next-action queue / what needs me today". Confirms both.
**VEYRA delta** VEYRA's next-action queue is **driven by the automation engine** (PLAN §6.1, ported from INTERIOR Phase 11), not a static overdue list.
**Plan ref** PLAN §6.1, §6.3 · Wave 1/3 · P1

### OPS-HR-002 · Leave & WFH approval + org directory
video-02 @ 09:35 / 09:46 · `50_…` `51_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=575)
> "Managers/HR review, approve, or reject leave and WFH requests… employee master DB grouped by departments (Sales, Design, Project Execution, Procurement, Finance, HR)."
**Verdict** oos (mostly). Full HR/leave is **deferred** per PLAN §5 ("HR & Payroll deferred; exception: site attendance stays"). Leave approval rides the generic approval engine (§3.4) *if* HR is ever enabled. Department grouping of users = a config facet, keep.
**Plan ref** PLAN §5 (deferred) · post-v1 · P3

### OPS-HR-003 · Users, licences & granular RBAC ⭐
video-02 @ 09:58 · `52_…` (`/userActivation`) · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=598)
**On screen** "Users" with a licence bar: **Purchased Licenses 20 · Active 12 · Unused 08**, "Add new user". Tabs **Active / Role Management / Groups / Deactivated**. Filter + search.
**Columns** User Name (+email) · DOB · Mobile No. · **Role** (free-form: "Sr Sales Development Executive", "OnboardingSalesManager", "OfficeBoy", "Telecalling Ex with Project Access", "Business Development", "DzyloSupportTeam", "Finance Manager"…) · a **Global 🌐** scope flag on some roles · **2FA** badge · **Activity** (Last Login + Last Active timestamps) · **Manager** (reporting hierarchy) · Actions(⋮).
**Implies (data)** `org_members(user_id, org_id, role_id, manager_id, twofa_enabled, last_login, last_active, status)`; `roles(id, org_id, name, is_global_scope, permissions[])`; a **licence/seat** concept on the subscription.
**Verdict** adopt-improved — **answers a live client question.**
**VEYRA delta** Two big ones. (1) **This is per-seat licensing** ("Purchased Licenses 20 / Active 12 / Unused 08") — direct evidence for **REQ-04 open-question #5** (per-user vs per-company vs per-module pricing): the category norm is **per-seat**, surfaced as Purchased/Active/Unused, which is the *exact* Used/Allowed/Remaining pattern the client asked for. Feed this into the Subscription module. (2) Dzylo's roles are free-text labels with an opaque permission set; VEYRA's model is **(module, action, data-scope=own/team/branch/org) + field-level visibility** (PLAN §3.2) — structurally more powerful. Keep Dzylo's good extras: **2FA per user, reporting-manager hierarchy, deactivate-not-delete, licence counter.**
**Plan ref** PLAN §3.2 · REQ-04 · Wave 0 · **P0**

---

## 2. Sales CRM

### OPS-CRM-001 · Lead insights dashboard (KPIs, trends, sources, geo) `b-roll frames`
video-02 @ 00:51 / 00:59 / 01:08 · `03_…` `04_…` `05_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=51)
> "Total Leads Received, Converted, Lost, Conversion Rates, Active Pipeline Value… weekly/monthly conversion velocity… source breakdown (Meta Ads, Google, Referrals, Walk-ins, Website) + regional map."
**Note** frames `03`/`05` are stock footage; the real KPI numbers appear on the **leads list** (OPS-CRM-003): Leads Count 374, Leads Value ₹1,29,35,382.
**Verdict** already-planned — PLAN §6.10 "sales funnel and conversion" report + §6.1 "source attribution with campaign/cost". Source list (Meta/Google/Referral/Walk-in/Website) confirms **source is an attribute, not a silo** (PLAN §6.1 — the exact thing PLAN says to fix). **Referral tracking** matters most here (architects/builders are the real channel, PLAN §6.1).
**Plan ref** PLAN §6.1, §6.10 · Wave 1/6 · P2

### OPS-CRM-002 · Kanban pipeline + configurable stages `b-roll frame`
video-02 @ 01:20 · `06_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=80)
> "Fully customizable Kanban or List-view pipeline stages (New Inquiry, Contacted, Site Measurement, Design Pitch, Quotation, Negotiation, Won, Lost)."
**Note** frame is B-roll; stage list from the narration. The stage set is **industry-specific** ("Site Measurement", "Design Pitch") — evidence that pipeline stages must be **tenant/profile-configurable** (PLAN §3.3 workflow config), not hard-coded.
**Verdict** already-planned. PLAN §6.1 "pipeline with tenant-defined stages, weighted value, stage SLA, ageing/rot alerts". VEYRA adds the SLA/rot alerts Dzylo doesn't show.
**Plan ref** PLAN §3.3, §6.1 · Wave 1 · P1

### OPS-CRM-003 · Leads list — inline status, multi-assignee, call chips, dispositions ⭐
video-02 @ 01:30 · `07_…` (`/leadListing`) · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=90)
**On screen** "Leads". **Leads Count 374 · Leads Value ₹1,29,35,382.1**. Column-picker, filter, search, **+ New Lead**, **Lead Form** (public capture form link). Filters: **Lead Status (Created +21 → 22 stages)**, Other Filters, Sort by. Pagination 25/page, 374 total.
**Columns** ☐ · ID (`17522`, copy) · Client Name (chat icon) · **Status** (inline-editable coloured chip: Assigned / Pending on Client Decision / Follow Up / Created) · Phone · **Follow Up** (`+ Add follow-up`, or **"4 calls · 23 Apr 5:30 PM · 3 overdue"** in red) · **Assigned To** (avatar stack — multi-assignee) · **Latest Remark** (disposition-prefixed: `[AP] Busy on another call`, `[Ss] Interested in 3BHK`, `[RRD] Call Attempted… not connected`).
**Implies (data)** `leads(id, org_id, name, phone, phone_key, status, value, source, created_at)`; `lead_assignees(lead_id, user_id)` (M:N); `follow_ups(lead_id, due_at, done, ...)`; the call chips read from an **interactions/call-log table** (see OPS-CALL-001). Dispositions are a controlled vocab.
**Verdict** adopt-improved.
**VEYRA delta** (1) **One party, deduped on phone** — Dzylo shows duplicate-looking rows ("Radhika rana" 17518 and "Radhika Rana" 17466 with the *same* phone +918233277044): that is the **exact forked-customer bug** PLAN §6.1 says `upsertLeadByPhone` + `phone_key` already solved in INTERIOR. Concrete win — **port that dedupe.** (2) The call chips prove the interaction layer is real; VEYRA surfaces the **full channel-agnostic timeline** (call+WhatsApp+email+visit) here, not just calls (PLAN §6.1a). (3) Inline status editing and multi-assignee: adopt as-is.
**Plan ref** PLAN §6.1, §6.1a · Wave 1 · **P1**

### OPS-CRM-004 · 360° lead profile (contact, scope, budget, layout)
video-02 @ 01:30 / 01:44 · `07_…` `08_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=104)
> "Customer contact, project type (Residential/Commercial), scope of work, budget range, property location… layout size (sq ft), interior theme preferences, specific requirements."
**Verdict** already-planned — PLAN §6.1 qualification fields + §1.1 the lead carries the seed of the Scope. **VEYRA delta:** these fields (rooms, sq-ft, theme, budget) are exactly what the **AI transcript extractor** should auto-fill from a call (PLAN §6.1a Wave-7 layer) — capture them as **structured typed fields / custom fields** (§3.3), not free text, so they flow into the quotation.
**Plan ref** PLAN §3.3, §6.1 · Wave 1 · P1

---

## 3. Sales communication & telephony

### OPS-CALL-001 · Integrated dialer, call logs & gamified follow-up wallboard ⭐⭐
video-02 @ 02:40 / 02:52 / 03:03 · `13_…` `14_…` `15_…` (`/followups/team`) · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=183)
> "Direct click-to-call from the portal. Automatic logging of call duration, recording links, and call disposition (Busy, Interested, Follow-up Needed)."
**On screen** "Follow Ups" page. Tabs **Overview / Follow Ups / Call Logs / Team**. Range: Today/This Week/This Month/Custom.
**Team Performance** donuts: **Follow-ups 277/851 (33%) · Calls 1151/4038 (29%) · Meetings 0/0**.
**User Performance** per-agent scorecards: avatar, ★ rating, badge (**Top Performer / On Track / Consistent / Needs Attention**), score /100, three donuts (Follow-ups/Calls/Meetings %), counts (e.g. 707/2761 Calls), **🔥 streak**, motivational line ("Crushing it!", "More follow-ups needed!").
**Team Call Logs** table: **Direction** (in/out arrow) · Lead · **Status** (`NOT_CONNECTED` red chip) · Agent (avatar) · **Customer No.** (+919666693796) · **Provider (`Dzylo Dialer`)** · **Duration** (0s) · Created At (27 Jun 2026 01:11 PM).
**Implies (data)** `call_logs(id, org_id, lead_id, agent_id, direction, status, customer_no, provider, duration_sec, recording_url, disposition, created_at)` — i.e. **exactly the `interactions` table from PLAN §6.1a**, with `provider = "Dzylo Dialer"` as one adapter.
**Verdict** adopt-improved — **the single most important screen for REQ-03.**
**VEYRA delta** This is the direct answer to the client's call-tracking question and it **validates PLAN §6.1a wholesale**: Dzylo does *not* use a magic browser extension — they built **their own dialer** (an Android app / click-to-call, surfaced here as the `Provider` column) writing into one call-log table, and the lead list (OPS-CRM-003) reads it. That is precisely the "one `interactions` table, several adapters" architecture, confirmed in production. VEYRA improvements: (1) **one interactions table across call + WhatsApp + email + SMS + visit**, not a call-only table (PLAN §6.1a); (2) if VEYRA is **in the media path** (bridged/cloud-telephony adapter, PLAN §6.1a), we get **recording + transcription + AI disposition** which Dzylo's device-log approach cannot (their `duration 0s / NOT_CONNECTED` is all the call log yields); (3) the gamified wallboard is a nice-to-have — worth copying the **connect-rate / streak** framing but driven off real bridged data. The DPDP consent gate (`bolna/gate.ts`) applies if we record.
**Plan ref** REQ-03 · PLAN §6.1a · Wave 1 (log) / Wave 4 (telephony) · **P1**

---

## 4. Estimation & Quotation

### OPS-EST-001 · Quotation maker — section-grouped BOQ, versioned, GST ⭐
video-02 @ 01:54 / 02:03 / 02:17 · `09_…` `10_…` `11_…` (`/quotation-maker/…`) · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=123)
> "Group estimates by spatial zones… description, specs, dimensions, UOM, unit price, markup/margin %, discounts, automatic GST/Tax… save '3BHK Premium' as reusable templates."
**On screen** "Daizy Interiors - v1" · status chip **Created** · **New Version** (versioning). Toolbar: split-view, add, **share link**, download, ⋮. Sub-tabs **Items / Preview**. **Templates** dropdown. **Request Approval** (threshold approval).
**PDF preview** header: client, firm, phone, date, **Ref DZY-20260602-123725**. Section band **"Wood Work"** (room/category grouping). Table: S.No · Description (rich: **Area**, **Category**, spec paragraph) · Image · QTY · **USP** (unit selling price) · **UOM** (Sq. Ft) · Price · **Discount** · **Final Price**.
**Worked example** Wooden Partition, 21 Sq.Ft × 2,160 = 45,360; discount 4,536; **Final 48,172.32** = (45,360−4,536) × **1.18** → **GST 18% baked into Final Price**. Confirms the engine computes tax, line-level discount, per-line UOM/area.
**Implies (data)** `quotations(id, org_id, project_id, version, status, ref_no, template_id?)`; `quote_sections(quote_id, name, area)`; `quote_lines(section_id, item_id, description, image, qty, uom, usp, discount, gst_pct, final_price)`.
**Verdict** adopt-improved — but **this is our strongest port asset** (PLAN §6.2, §8: INTERIOR's quotation engine).
**VEYRA delta** (1) **Prices never come from an LLM** — the engine computes, a validator verifies (PLAN §8, hard rule). (2) VEYRA's line is a **Scope Item**, so this same row flows to BOM/cutlist/PO (PLAN §1.1) — Dzylo's quote line is a dead-end string. (3) Add **fast-quote↔deep-BOQ upgrade without retyping** (PLAN §6.2), **cost roll-up beside quoted price** (§6.2 — the owner's screen Dzylo doesn't show), **GST place-of-supply + works-contract** treatment (§6.2), **BOQ with/without cost** via field-level perms (§3.2), and **module configurator** (§6.2). (4) Versioning: keep, add **visible diff** (§6.2 "what changed since last time"). (5) Share link = INTERIOR's `/q/<token>` — reuse.
**Plan ref** PLAN §1.1, §3.2, §6.2, §8 · Wave 2 · **P0**

### OPS-EST-002 · AI prompt-to-BOQ generator
video-02 @ 02:29 · `12_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=149)
> "Input unstructured client text ('3BHK modern… modular kitchen acrylic finish, wardrobe master bedroom, false ceiling living room, budget 15 Lakhs') to auto-populate a structured room-by-room itemized quotation draft."
**Verdict** adopt-improved — **carefully.** This is the highest-risk AI feature against PLAN's hard rule.
**VEYRA delta** The AI may **structure scope** (rooms → items → qty/uom) but **must not emit prices**. It selects catalogue items and lets the **rate engine + validator** price them (PLAN §8, REQ constraint). Dzylo's demo implies AI→priced-BOQ in one step; VEYRA splits it: AI extracts the *bill of scope*, the engine computes the *bill of quantities-with-price*. Meter via the REQ-04 ledger (like Daizy AI credits, but ledger-backed). Claude only (REQ-01).
**Plan ref** PLAN §8 · REQ-01, REQ-04 · Wave 2/7 · P1

---

## 5. Project execution & hub

### OPS-PROJ-001 · Portfolio project dashboard (health, filters)
video-02 @ 03:15 / 03:27 / 03:38 · `16_…` `17_…` `18_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=195)
> "All active site projects… filter by stage, PM, budget utilization, handover deadline… execution health (On Track, Delayed, Budget Exceeded)."
**Verdict** already-planned — PLAN §6.3 projects + §6.10 project-profitability report. **Health status** (On Track/Delayed/Budget Exceeded) is a good derived indicator worth adding to VEYRA's project list; "Budget Exceeded" ties to the P&L (OPS-PROJ-002).
**Plan ref** PLAN §6.3, §6.10 · Wave 3 · P2

### OPS-PROJ-002 · Single-project hub — financials, milestones, embedded procurement ⭐
video-02 @ 03:49 / 04:04 · `19_…` `20_…` (`/leadConfig/161761`) · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=229)
**On screen** "Project Data" (tenant Daizy Designs). **Module tab bar**: Details · **Quotation 2.0** · Inspirations · Documents · Project Plan · Finance Plan · Payments · Site · Labour · Procurement · MB Sheet · … (scrollable). Sub-tabs Summary / Modules.
**Header** Client / Project / Owner, Start & Hand-over dates, **Actual 47.51% vs Est 100%** (physical vs financial progress bars), View Report.
**Project Financials** (tiles): **Project Value 36,12,239.29** · Fund 21L · Total Disbursed 1.8L · Receivable Dues 25,600 · Total Payables 4.7L · Payable Dues −78,905.4 · **Cash Flow 19L** (red tile) · **P&L 30L** (green tile).
**Cards** Communication (36 msgs), Site Progress (24 photos, thumbnails), Design Documents (10, with WhatsApp-image filenames — **WhatsApp files auto-filed to the project**), Latest Updates feed (`[RR] Updated stage to Planning`, phone-number-change audit).
**Milestones** table (Milestone · Progress% · **Days Left "351 days overdue"** red · Assignee · Last Update) + Tasks tab. **Procurement** embedded (Order ID `DZY-PO-303` · Name · Vendor · Amount · **Delivery State** · Payment) with tabs PO Requests / Requests / Delivery Acceptance.
**Implies** the URL is `/leadConfig/161761` and the **quotation for the same job is `/quotation-maker/161761/…`** → **lead, project and quotation share the root id `161761`**. Direct evidence of the **one-record-flows-through spine** (PLAN §1.1), though Dzylo keys it on the lead, not a Scope Item.
**Verdict** adopt-improved — the consolidated hub is excellent and PLAN §6.3 under-specifies it.
**VEYRA delta** (1) **Per-project P&L (quoted vs actual vs collected)** is PLAN §6.9's headline number — build it exactly, but source "actual cost" from the **Scope-Item margin line** (PLAN §1.1) so it's line-accurate, not just tile-level. (2) The module tab bar = per-project module surfacing, gated by the **module registry + profile** (PLAN §3.3). (3) WhatsApp-image auto-filing = the interaction layer writing attachments to the project (PLAN §6.1a). (4) Physical-vs-financial dual progress: adopt.
**Plan ref** PLAN §1.1, §3.3, §6.3, §6.9 · Wave 3/6 · **P1**

### OPS-DES-001 · Design vault + client collaboration + pin-comments & sign-off
video-02 @ 04:13 / 04:25 / 04:36 · `21_…` `22_…` `23_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=253)
> "Repository for 2D plans, electrical/plumbing layouts, 3D renders, BOQs… client portal to review revisions… in-context pin/comment system and formal digital sign-off before site execution."
**Verdict** adopt — maps to PLAN §6.7 Customer Portal ("design & material approval with comments") + §5 note that INTERIOR's **upload-and-approve pattern already carries v1**. **Pin-comments on a drawing + digital sign-off gate** are a concrete, high-perceived-value addition worth specifying. Design files are polymorphic **Assets** (PLAN entity 16).
**Plan ref** PLAN §6.7, entity 16 · Wave 3 · P2

### OPS-PLAN-001 · WBS / tasks / dependencies + AI auto-timeline
video-02 @ 04:49 / 05:01 / 05:12 · `24_…` `25_…` `26_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=289)
> "Break projects into phases, scopes, tasks. Start/end dates, dependencies, priority, assigned contractors/engineers… status (Yet to Start, In Progress, Completed)… AI auto-generates the execution plan/timeline from scope, layout size, target date."
**Verdict** already-planned — PLAN §6.3 "tasks with dependencies, assignees, checklists, photo evidence, geo-stamps" + entity 12 Task/Job Card. AI timeline = a later, optional planning aid (Claude, metered). **VEYRA delta:** tasks are **Job Cards hanging off Scope Items** (PLAN §1.1) so factory/site work traces to the priced line.
**Plan ref** PLAN §6.3, entity 12 · Wave 3 · P2

---

## 6. Site execution & labour

### OPS-SITE-001 · Daily site logs + chronological photo feed
video-02 @ 06:09 / 06:18 · `31_…` `32_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=369)
> "Field engineers upload daily work logs with site photos… chronological photo feed of the site's transformation from civil work to handover."
**Verdict** already-planned — PLAN §6.3 "daily progress report; snag list with photo capture". **VEYRA delta:** mobile capture must **tolerate offline and sync later** (PLAN §9 risk #6 — bad site signal). One field app (PLAN §6.1a "one app, four jobs").
**Plan ref** PLAN §6.3, §6.1a · Wave 3 · P2

### OPS-LAB-001 · Labour master, attendance, cost allocation vs budget
video-02 @ 06:30 / 06:41 · `33_…` `34_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=390)
> "DB of skilled/unskilled labour, sub-contractors (carpenters, electricians, painters, plumbers). Daily headcount per site, contract agreements, wage payouts… labour spend vs allocated budget per phase."
**Verdict** adopt (scoped). Labour is a **Party role** (PLAN entity 2 — contractor) + a **Labour Catalog** (seen in video-01 Settings, PROC-CFG-005) + labour lines as **service/labour Items** (PLAN §4.1). Labour cost feeds the project P&L "actual cost" (§6.9). **VEYRA delta:** don't build a parallel labour module — model it on the existing Party/Item/Ledger spine. Wage *payroll* stays deferred (§5).
**Plan ref** PLAN §4.1, §6.9, entity 2 · Wave 3/5 · P2

---

## 7. Finance & billing

### OPS-FIN-001 · Contract-based customer milestone billing ⭐
video-02 @ 05:22 / 05:34 · `27_…` `28_…` (`/financial-planning`) · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=322)
**On screen** "Financial Planning" (project scoped). Tabs **Inflow / Outflow / Documents**. Summary: Project Value 36,12,239.29 · Funds 20,74,500 · Total Receivables 15,37,839.29 · Receivable Dues 25,600 · **Audit**. **Contracts** (collapsible, e.g. "Civil" amount 2,000,000, **Source: Client**): milestone table **S.No · Name (1st/2nd/3rd) · Percentage (40/20/40, editable, Σ=100%) · Amount (800000/…) · Tentative Due · Work Done ☑ · Actual Due · Actions**; Total row 100% / 2,000,000. Second contract with an "Advance 20%" milestone.
**Implies (data)** `contracts(id, project_id, name, amount, source{client,vendor})`; `milestones(contract_id, seq, name, pct, amount, tentative_due, work_done, actual_due)`; **Inflow (customer) vs Outflow (vendor)** split.
**Verdict** adopt-improved — this is PLAN §6.9 "advance/milestone/progressive billing" + §6.2 "Accept → payment milestone schedule", realised.
**VEYRA delta** (1) Milestones should **auto-import from the accepted quotation** (PLAN §6.2) and reuse the **payment-plan master** (PROC-CFG-002) rather than being re-keyed per project. (2) Add proper **GST tax invoice / e-invoice IRN / e-way-bill** fields (PLAN §6.9) — Dzylo shows a payment *schedule*, not a compliant invoice. (3) "Work Done" milestone gating should tie to **actual project milestone completion** (OPS-PROJ-002), not a manual checkbox. (4) Keep the **Audit** button (append-only, PLAN §3.4). (5) Ledger entries are PLAN entity 14.
**Plan ref** PLAN §6.2, §6.9, entity 14 · Wave 2/6 · **P1**

### OPS-FIN-002 · Site expense & petty cash + receipt/voucher generator
video-02 @ 05:45 / 05:57 · `29_…` `30_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=345)
> "Field teams log expenses (project, vendor, category — Hardware, Site Tea/Snacks, Local Transport — payment mode, receipt attachment)… auto-generate digital receipts and vouchers."
**Cross-ref** the dashboard "My Expense" table (video-01 `01`): Id, Project Name, Transaction Date, Amount, Category, Remark, running Balance.
**Verdict** already-planned — PLAN §6.9 "expenses and petty cash, project-attributed". **VEYRA delta:** these feed the **project P&L actual cost** (§6.9) and, via the "Expenses StockIn" tab (video-01 GRN-001), non-PO material receipts. Ledger entity 14.
**Plan ref** PLAN §6.9, entity 14 · Wave 6 · P2

### OPS-FIN-003 · Organizational cash-flow dashboard & analytics
video-02 @ 10:09 / 10:21 · `53_…` `54_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=609)
> "Petty cash balances, project payments received, customer receipts, vendor payables, receivables, overall cash flow… monthly inflow vs expenditure trends."
**Verdict** already-planned — PLAN §6.9 (project P&L, ledgers with ageing) + §6.10 (receivables ageing & cash forecast). Org-level roll-up of the per-project financials (OPS-PROJ-002).
**Plan ref** PLAN §6.9, §6.10 · Wave 6 · P2

---

## 8. Procurement & inventory (recap in this video)

### OPS-PROC-RECAP · MR→RFQ→PO + real-time material lifecycle, stock, inter-site transfer
video-02 @ 06:52–07:35 · `35_…` `36_…` `37_…` `38_…` `39_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=412)
> "MR initiation… RFQ compare… PO conversion… trace materials from request→RFQ→PO→delivery→consumption… stock availability, inter-site transfers, wastage logging."
**Cross-ref** fully torn down in `01-procurement.md`. **New detail here: `Order Management` / inter-site transfers** — `stock_movements` with `type=transfer` between site warehouses, with transit approval (PLAN §6.5 "transfer" movement + "site is a location"). **Real-time lifecycle trace** = the Scope-Item / movement projection (PLAN §1.1, §6.5).
**Verdict** already-planned. See `01-procurement.md` for the full spec.
**Plan ref** PLAN §6.4, §6.5 · Wave 4 · P1

### OPS-VEND-001 · Vendor master + performance ratings `b-roll frame`
video-02 @ 08:06 / 08:17 · `42_…` `43_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=486)
> "Profiles for suppliers/contractors with PO history, outstanding balances, payment history, linked sites… performance scoring on delivery punctuality, material quality, pricing."
**Note** frame `42` is B-roll; feature from narration + the Vendors nav item.
**Verdict** already-planned — PLAN §6.4 vendor master (rate contracts, lead times, MOQ, payment terms, **performance rating**, doc expiry). Vendor = **Party with vendor role** (PLAN entity 2). Performance rating should be **computed from PO/GRN history** (on-time %, qty variance), not hand-entered.
**Plan ref** PLAN §6.4, entity 2 · Wave 4 · P2

---

## 9. AI design suite (Imagino)

### OPS-AI-001 · Imagino — 2D→3D render, variations, mood boards, 360 tour
video-02 @ 08:30–09:23 · `44_…` `45_…` `46_…` `47_…` `48_…` `49_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=510)
> "AI (powered by Google's Nano Banana) transforms 2D plans/sketches/room photos into photorealistic 3D renders… instant colour/material/lighting/furniture variations… mood boards… embedded 360° walkthroughs in the client portal."
**Verdict** **reject / oos for v1** — with a caveat. (1) Generative 2D/3D is **explicitly deferred** (PLAN §5, REQ-02 ask #3 "no provider chosen; deferred"). (2) Dzylo uses **Google's model ("Nano Banana" = Gemini image)** — VEYRA is **Claude-only** (REQ-01), and Claude does not generate photorealistic renders, so this specific feature can't be matched like-for-like without violating the model constraint; that's a **deliberate client decision**, note it and move on. (3) What VEYRA *does* carry now: the **upload-and-approve** design pattern (OPS-DES-001), Inspirations/mood-board wall (a simple **Asset** gallery), and 360 tour **embedding** (an iframe/asset, not generation). Flag generative render + the model-provider question as an **open question for the client** (they may want an exception to Claude-only for image gen).
**Plan ref** PLAN §5 · REQ-01, REQ-02 · deferred · P3 (open question)

### OPS-EXP-001 · Inspiration wall / virtual tour (client experience)
video-02 @ 09:03–09:23 · `47_…` `48_…` `49_…` · covered under OPS-AI-001.
**Verdict** adopt (thin) — Inspirations + Virtual Tour are their own nav items; build as **Asset galleries + embed**, client-portal-visible (PLAN §6.7). No AI needed for the gallery/embed itself.
**Plan ref** PLAN §6.7 · Wave 3 · P3

---

## 10. Warranty & service

### OPS-SUPP-001 · Post-handover ticket portal + service-desk routing
video-02 @ 07:44 / 07:55 · `40_…` `41_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=464)
> "Clients log warranty claims/maintenance/defects… assign to technicians/contractors, set resolution deadlines, track repair status, historical service record per project."
**Verdict** already-planned (deferred) — PLAN §5: handover + warranty **registration** ships with Projects in v1; the **full service desk (AMC, technician dispatch) is v1.5**. A ticket = a snag/warranty item hanging off a **Scope Item** (PLAN §1.1 "snag/warranty item"). Confirms the phasing.
**Plan ref** PLAN §5, §6.3 · v1.5 · P3

---

## 11. Reporting & onboarding

### OPS-REP-001 · Multi-department reporting + export
video-02 @ 10:34 / 10:45 · `55_…` `56_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=634)
> "Exportable reports: Lead Reports (funnel, dropped), Financial (collections, ageing, gross margins), Labour (attendance, payouts vs productivity), Platform Audit Trails… custom date ranges, multi-site aggregation, Excel/PDF export."
**Verdict** already-planned — PLAN §6.10 "six reports that get used, not a builder". Dzylo's list maps onto ours: funnel/conversion, project profitability (gross margins), receivables ageing, vendor performance, labour productivity. **Platform Audit Trails** = PLAN §3.4 audit-log service surfaced as a report.
**Plan ref** PLAN §6.10, §3.4 · Wave 6 · P2

### OPS-TRAIN-001 · Onboarding / training hub
video-02 @ 10:58 · `57_…` · [watch](https://www.youtube.com/watch?v=NYw__DcZEH8&t=658)
> "Built-in help desk: live training calendar sign-ups, step-by-step docs, categorized video library for staff onboarding."
**Verdict** reject (for v1) — a help-content module, low differentiation. Ships as static docs / links, not a built feature. (The `Support & Training` nav item can point to external docs.)
**Plan ref** — · post-v1 · P3

---

## Frame coverage checklist (all 57)

01-02 HR-001 · 03 CRM-001(b-roll) · 04 CRM-001 · 05 CRM-001(b-roll) · 06 CRM-002(b-roll) · 07 CRM-003 · 08 CRM-004 · 09-11 EST-001 · 12 EST-002 · 13-14 CALL-001 · 15 CALL-001 · 16-18 PROJ-001 · 19-20 PROJ-002 · 21-23 DES-001 · 24-26 PLAN-001 · 27-28 FIN-001 · 29-30 FIN-002 · 31-32 SITE-001 · 33-34 LAB-001 · 35-39 PROC-RECAP · 40-41 SUPP-001 · 42 VEND-001(b-roll) · 43 VEND-001 · 44-46 AI-001 · 47-49 EXP-001 · 50-51 HR-002 · 52 HR-003 · 53-54 FIN-003 · 55-56 REP-001 · 57 TRAIN-001 · **58 TRAIN-001** (`TRAIN_02_Video_Onboarding_Library` @ 11:08 — not in the Gemini doc, which stops at frame 57; same training-hub section, verdict reject/post-v1). **58/58 ✓**

*(Frame numbering in the Gemini doc runs 01–57 with the HR/RBAC/Finance/Report frames interleaved out of numeric order; frame 58 exists on disk but was not indexed in the doc. All narrated features are covered above.)*
