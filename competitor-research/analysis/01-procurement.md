# Dzylo teardown — Video 1: Procurement, MR → RFQ → PO → GRN

**Source video:** [youtu.be/gEW1maGsD_4](https://www.youtube.com/watch?v=gEW1maGsD_4) — *"End-to-End Procurement System Explained"*, Dzylo AI, 17:40.
**Product:** Dzylo One (`one.dzylo.com`), tenant shown = "Virtuate Designs", user "Aditi".
**Frames:** 58, in `source/frames/video-01/`. Every frame below carries a verdict.

**Verdict key:** `adopt` = build as shown · `adopt-improved` = build, but better (delta stated) · `already-planned` = PLAN-v0.1 already covers it · `reject` = don't build · `oos` = out of v1 scope.

---

## Product-wide observations (apply to every screen)

- **Palette is already white + coral-red.** Dzylo's own UI is white background, near-black text, a coral-red (~`#F2545B`) primary. The owner's white/black/red brief is not a big departure from the category norm — our differentiation has to be in *density, clarity and the discipline of red* (DESIGN-DIRECTION §2), not in raw colour choice. VEYRA's red is a truer `#D6122B`; Dzylo's is softer/pinker.
- **Left rail, grouped nav.** Sections: (top) Dashboard, Sales▾, Projects, Tasks, Quotations `2.0`, MB Sheets, Communication `99+` · **ACCOUNTING**: Invoice, Finance▾ · **OPERATIONS**: Procurement▾ (Material Request, RFQ, Orders, Acceptance), Inventory, Order Management▾, Vendors▾ · **DESIGNERS**: Inspirations, Virtual Tour · **HR**: Attendance▾ · **ADMIN**: Organizations, Users, Reports, Settings · **OTHERS**: Drive, Profile, Support & Training, Logout. This is the full module map of the competitor — see FEATURE-REGISTER coverage matrix.
- **Document numbering** is per-type with a tenant prefix + running integer: `VID-REQ-139`, `VID-RFQ-129`, `VID-PO-142`, `VID-GRN-124`. Confirms PLAN §3.4 numbering-series design; note the shared `VID-` tenant prefix. **No Indian-FY segment** in Dzylo's series — VEYRA's plan to include FY (PLAN §3.4) is a genuine improvement.
- **"Daizy AI" is a credited feature.** Their AI document-parser ("Read by Daizy AI") shows *"Credit left: 328"*, *"Using 2 credits per page"*. Dzylo meters AI by a credit wallet. Directly relevant to REQ-04 (usage metering) and VEYRA's own trial design — see delta on PROC-MR-002.
- **`org_id` everywhere.** Multi-tenant confirmed (Organizations admin item, tenant-branded vendor portal). Consistent with our Wave-0 tenancy requirement.

---

## 1. Material Request (MR) & intake

### PROC-MR-001 · Material Request list
video-01 @ 00:26 / 02:00 · `01_…`, `07_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=26)
> "Site teams create requests… assigning a title, linking the target project, specifying required delivery deadlines, and flagging item urgency."

**On screen** Page "Requests" with tabs **All Requests / Draft Requests**. Filter (funnel) icon + red **Raise Request** button top-right.
**Columns** ID (`VID-REQ-139`), Name, Project, Expected Delivery, Created Date, **Stage**, Created By, Action(⋮).
**States** Stage is a link/label cycling `Requested → RFQ Raised(126) → Order Requested → Ordered`. The number in `RFQ Raised(126)` is the linked RFQ's id — clickable cross-navigation. Draft vs submitted split by tab.
**Row actions (⋮)** Edit Request · Copy Request · Request Order · **Raise RFQ** · Cancel Request · Delete Request.
**Implies (data)** `material_requests(id, org_id, title, project_id, expected_delivery, stage, created_by, created_at, is_draft)`; stage enum `{draft, requested, rfq_raised, order_requested, ordered, cancelled}`.
**Implies (API)** `GET /material-requests?tab=&filters`, `POST /material-requests/:id/raise-rfq`, `/request-order`, `/copy`, `/cancel`.
**Verdict** already-planned (this is the "indent / purchase request" in PLAN §6.4, but PLAN gives zero screen detail — **this is the screen spec that was missing**).
**VEYRA delta** MR line items must be **Scope-Item / Item-master references, not free text** (PLAN §1.1). Dzylo lets a request carry uncatalogued names (see PROC-WH-003) — we make "promote to master" explicit at creation, not deferred to stock-in. Add a **Source** column (manual / from-quotation / AI-parsed) for traceability.
**Plan ref** PLAN §6.4 · Wave 4 · P1

### PROC-MR-002 · Raise Request dialog (+ AI document parsing) ⭐
video-01 @ 00:26 / 01:04 · `01_…`, `03_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=64)
> "Upload attachments (PDFs, images, specification sheets)… for automated data extraction."

**On screen** Modal "Procurement Request".
**Fields** Title* (text) · Project* (searchable select, e.g. "DLF Greens (Green Leaf)") · Expected Delivery* (date picker) · **Upload the list of items** (file dropzone) · **☐ Read by Daizy AI (Credit left: 328)** · primary **Next**.
**States** AI checkbox shows remaining credit inline; a later state shows "Using 2 credits per page".
**Implies (data)** `mr_ai_parse_jobs(id, mr_id, file_ref, pages, credits_used, status, extracted_json)`; a per-org `ai_credit_ledger`.
**Verdict** adopt-improved (AI parse of a materials list into line items).
**VEYRA delta** Two things. (1) **The AI extracts facts, never prices** (PLAN rule + REQ constraint) — Dzylo's parse only pulls item/qty/uom, which is compatible; keep it that way and never let it emit a rate. (2) **Meter it through the REQ-04 append-only usage ledger**, not a mutable "credits left" counter — Dzylo's decrementing counter is exactly the resettable pattern REQ-04 warns against. Our ledger gives the same "Used/Allowed/Remaining" display the client asked for, without the reset loophole. This screen is direct evidence the metering module (missing from PLAN-v0.1) is real and table-stakes.
**Plan ref** REQ-04 · PLAN §3.3 · Wave 0/1 · **P0**

### PROC-MR-003 · MR detail — line-item grid, item autocomplete, receipt attach
video-01 @ 01:19 / 01:29 · `04_…`, `05_…`, `06_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=79)
> "The AI extracts text and automatically populates line items, descriptions, units, and quantities…"

**On screen** "Procurement Request" detail. Header card: Title, Project Name, Expected Delivery Date, edit(✎). **Import** + **Raise Request** buttons. **Attach receipt** (outlined red).
**Columns** S.No · Image (thumbnail + add) · Item Name · Item Code · **Uom** (select: Litre, Nos, …) · Qty · Remarks · Action(🗑).
**Interactions** Item Name is a **catalogue autocomplete** ("Search item" → dropdown: Gypsum Screw 6*25, Screw 6*38, Hepo Drywall Screw 3.5*35mm…). **+ Add Item** row. Empty required cells (Qty, Uom) get a **red validation border**. A "Read by Daizy AI (Credits Left: 328) — Using 2 credits per page" mini-panel reappears for attach-receipt parsing.
**Implies (data)** `material_request_items(id, mr_id, item_id?, item_name, item_code, uom, qty, remarks, image_ref)`.
**Verdict** adopt-improved.
**VEYRA delta** `item_id` should be **mandatory-or-explicitly-adhoc** — an item is either a catalogue reference or a flagged ad-hoc pending promotion (PLAN §4.7 "ad-hoc item, promotable to master"). Dzylo's `item_code` free-text column is where catalogue integrity leaks. UOM must be constrained to the item's allowed UOM set with conversion (PLAN §4.4), not a global list.
**Plan ref** PLAN §4.4, §4.7 · Wave 1/4 · P1

### PROC-MR-004 · Direct quotation import into MR
video-01 @ 01:19 / 01:25 · `04_…`, `05_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=79)
> "Auto-populate required materials from pre-approved sales/project quotations… Matching site requests with client scope (BOQ)."

**On screen** (Sequential state of the create flow) an alternative to file upload: pull line items from an approved quotation for the same project.
**Verdict** adopt — but this is **the Scope-Item spine doing its job for free** (PLAN §1.1). In VEYRA, an MR raised against a project reads that project's Scope Items / BOM directly; "import from quotation" isn't a special feature, it's the same row being read downstream. Frame it that way in the spec.
**Plan ref** PLAN §1.1, §6.4 · Wave 4 · P1

---

## 2. RFQ & multi-vendor bidding

### PROC-RFQ-001 · RFQ creation from MR (vendor select, terms, notify)
video-01 @ 02:00–03:08 · `07_…` `08_…` `09_…` `10_…` `11_…` `12_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=120)
> "Convert approved Material Requests into RFQs with a single click, selecting specific vendors… Vendors instantly receive RFQ notifications via WhatsApp and email containing direct portal access links."

**Flow (from the six frames + doc):** ⋮ **Raise RFQ** on an MR row → multi-select vendors from central DB (by category / region) → set **Expected Delivery Date + supply location** → **custom submission terms / remarks / bid deadline** → dispatch. Vendors receive **WhatsApp + email** with a **direct portal link** (no signup).
**Implies (data)** `rfqs(id, org_id, mr_id, project_id, title, place_of_supply, remark, bid_deadline, status)`; `rfq_vendors(rfq_id, vendor_id, invited_at, portal_token)`; `rfq_items(rfq_id, item_id, qty, uom)`.
**Implies (API)** `POST /rfqs`, `POST /rfqs/:id/vendors`, `POST /rfqs/:id/dispatch` (fans out to WhatsApp/email adapters).
**Verdict** adopt-improved.
**VEYRA delta** The dispatch is exactly our **interaction-layer + notification-outbox** (PLAN §6.1a, §6.8) — an RFQ dispatch writes `interactions` rows (channel=whatsapp/email, external_ref=message id) so delivery/read status is tracked, not fire-and-forget. Dzylo shows no delivery tracking on the invite; we get it for free from the ported spine.
**Plan ref** PLAN §6.4, §6.8, §6.1a · Wave 4 (spine ported Wave 1) · P1

### PROC-RFQ-002 · Revision requests + change-log audit
video-01 @ 03:31 / 03:55 · `13_…` `14_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=211)
> "Resend RFQs back to vendors for pricing revisions with mandatory change logs and remarks."

**On screen** Trigger a re-bid round; a **mandatory reason/remark** is enforced and stored as an audit entry. Response statuses are **versioned** (see next).
**Implies (data)** `rfq_revisions(rfq_id, round_no, requested_by, reason, created_at)`.
**Verdict** adopt. Clean fit with PLAN's generic audit-log service (§3.4).
**Plan ref** PLAN §3.4 · Wave 4 · P2

### PROC-RFQ-003 · Mid-cycle vendor expansion + participation list
video-01 @ 04:10 / 04:18 · `15_…` `16_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=250)
> "Add extra vendors dynamically to an ongoing RFQ cycle at any point before final evaluation."

**On screen** Add vendors to a live RFQ; participation list shows each vendor's submission status across cycles.
**Verdict** adopt. `rfq_vendors` is append-friendly; no schema change beyond `added_in_round`.
**Plan ref** PLAN §6.4 · Wave 4 · P2

### PROC-RFQ-004 · OTP-authenticated vendor portal (public tokenized page) ⭐
video-01 @ 04:35 / 05:08 · `17_…` `18_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=275)
> "Vendors open unique links, enter their mobile phone numbers, authenticate via OTP without full system logins."

**On screen** Public page `one.dzylo.com/vendor-price-form/<n>/<uuid-token>` — **branded with the tenant's logo** (Virtuate Designs), heading "Request for Quotation", "Please enter your phone number to start filling your pricing for RFQ", **4-box OTP**, "(OTP sent to your WhatsApp Inbox)", **Verify OTP**.
**Then (frame 18)** authenticated vendor enters **unit rates, taxes, freight**, and uploads a quotation PDF, per line item.
**Implies (data)** `rfq_vendor_tokens(token, rfq_id, vendor_id, phone, otp_hash, expires_at, verified_at)`; `rfq_bids(id, rfq_id, vendor_id, version, delivery_date, remark, doc_ref, submitted_by, submitted_at)`; `rfq_bid_lines(bid_id, item_id, unit_rate, tax_pct, freight, line_total)`.
**Verdict** adopt-improved — **highest-value single screen in the video for us.**
**VEYRA delta** This is INTERIOR's **`/q/<token>` share-link pattern** re-used for procurement (PLAN §6.2, §8). We already own this mechanism. Reuse the exact token discipline: **the token is the auth, never logged, never indexed** (PLAN §6.2). Improvement over Dzylo: OTP over WhatsApp is good but add **email OTP fallback** (not every vendor is on WhatsApp Business), and rate-limit OTP by token. Vendor-entered **tax must be captured as HSN/SAC + GST rate**, not a free "taxes" number, so the bid feeds landed-cost and ITC correctly (PLAN §4.5, §6.4).
**Plan ref** PLAN §6.2, §6.4, §8 · Wave 4 · **P1**

### PROC-RFQ-005 · Proxy rate entry ("fill for vendor") + attribution audit
video-01 @ 05:54 / 06:27 · `19_…` `20_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=354)
> "Internal teams can input quoted prices on behalf of offline vendors via the three-dot action menu… audit log showing the specific internal team member who entered the offline vendor data."

**On screen** ⋮ menu on a vendor row → enter that vendor's rates internally (for vendors who phoned/emailed). The bid then shows **"by Aditi"** under the submitted status (seen on the vendor list) — attribution is surfaced, not hidden.
**Implies (data)** `rfq_bids.submitted_by` + `entry_mode enum {vendor_portal, proxy}`.
**Verdict** adopt. Correct real-world accommodation (many Indian vendors won't use a portal) with the right control (visible attribution).
**Plan ref** PLAN §3.4 · Wave 4 · P2

### PROC-RFQ-006 · RFQ detail — Vendor List tab
video-01 @ 04:35+ · `17_…` (tab context) · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=275)
**On screen** `VID-RFQ-129`, tabs **Vendor List / Item Biding Comparison**. Header: Project Name, Request Title, **Status "In Process(2/3)"** (responded/invited), Created Date/By, **Place of Supply** (full GST address), Remark. Buttons: refresh, **Copy Form Link**, **Request Order**, ⋮.
**Columns** Vendor Name · Delivery Date · **Response Status** (`Submitted(v1)`, `Pending(v2)` — versioned) · Last Response Date · **Total Biding** (₹23,954) · Vendor Remark · Action(⋮).
**Implies** Place-of-supply captured at RFQ level (GST place-of-supply groundwork). Status fraction = simple responded/invited count.
**Verdict** adopt. Place-of-supply capture aligns with PLAN's GST requirement (§6.2, §6.9).
**Plan ref** PLAN §6.4, §6.9 · Wave 4 · P1

### PROC-RFQ-007 · Item Bidding Comparison matrix (L1/L2/L3) ⭐
video-01 @ 06:35 / 06:43 · `21_…` `22_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=395)
> "Side-by-side comparative grid… system automatically calculates and highlights the lowest bidder per line item and overall order."

**On screen** Matrix: **rows = items** (expandable ▸), **columns = vendor+version** (Shub POP v1, RADHE v2, RADHE v1, AP Traders v1, Raghav Das v1). Top row **Total Bidding Amount** per vendor. Legend toggles: **☑ Lowest Bid (green) · ☑ Second Lowest (orange) · ☐ Third Lowest**. Each cell = that vendor's line total for that item (qty×rate), coloured by rank. Vendor filter chip ("AP Traders (v1) x  +4 ▾"). Horizontal scroll for many vendors.
**Data shown** e.g. Fevicol ×12: Shub POP 1,416 (green/L1), RADHE v2 1,699 (orange/L2), RADHE v1 7,080, AP Traders 6,372. Totals: 31,152 / 23,647(L2) / 23,128(L1) / 23,954 / 0.
**Implies (API)** server computes per-line and per-vendor ranks; `GET /rfqs/:id/comparison`.
**Verdict** adopt-improved — build this exactly, it's the heart of the procurement value prop and PLAN §6.4 only says "comparison on landed cost, not unit price" in the abstract.
**VEYRA delta** Dzylo ranks on **bid total (unit rate × qty)**. PLAN's stated requirement is **landed cost** — so VEYRA's rank must factor freight, tax/ITC-recoverability, and vendor lead-time/MOQ, with a toggle between "lowest quoted" and "lowest landed". Also allow **split award** (line 1 to vendor A, line 2 to vendor B) — Dzylo appears to award whole-RFQ (see PO conversion). This is a concrete place we beat them.
**Plan ref** PLAN §4.5, §6.4 · Wave 4 · **P1**

### PROC-RFQ-008 · One-click PO from winning bid
video-01 @ 07:00 / 07:08 · `23_…` `24_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=420)
> "Convert winning vendor quotes directly into draft Purchase Orders with one click."

**On screen** From comparison / **Request Order**, a draft PO is generated with the winning vendor's agreed rates, line items and vendor details pre-filled; confirmation shown.
**Verdict** adopt-improved. Add **split-award → multiple draft POs** (one per awarded vendor), which Dzylo's single-vendor conversion doesn't show.
**Plan ref** PLAN §6.4 · Wave 4 · P1

---

## 3. Purchase Order engine & configuration

### PROC-PO-001 · Orders list
video-01 @ 07:42 · `25_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=462)
**On screen** "Orders". Tabs **Orders / Pending Approval**. Filters: Select Project, Created By, Select Vendor, **Order State** (multi), Order Type, date range, reset. Search. Red **Create New Order** (standalone PO, bypasses RFQ).
**Columns** Order Number (`VID-PO-135`) · Order Name · Vendor Name · **Amount** (INR 4,72,000 — Indian grouping) · Type (Purchase Order / Work Order) · **Order State** (Order Created / Partially Delivered) · **Payment State** (Not Initiated / Payment Done) · Project · Order Date · Delivery Date · Created By · Actions(⋮).
**Implies (data)** `purchase_orders(id, org_id, name, vendor_id, project_id, amount, type, order_state, payment_state, order_date, delivery_date, created_by, rfq_id?)`; two independent state machines (**fulfilment** vs **payment**).
**Verdict** already-planned + adopt (PLAN §6.4 "PO with approval matrix"; this is the missing screen spec). Two separate state fields (order vs payment) is the right model — carry it.
**Plan ref** PLAN §6.4 · Wave 4 · P1

### PROC-PO-002 · Standalone / direct PO + preferred supplier
video-01 @ 07:42 / 07:56 · `25_…` `26_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=476)
> "Bypasses RFQ processes to directly raise POs for fixed or preferred suppliers… rate-contract suppliers and pre-negotiated catalog pricing."
**Verdict** adopt. Needs `vendor_rate_contracts(vendor_id, item_id, rate, valid_from, valid_to, moq, lead_time)` (PLAN §4.6 vendor cross-ref, §6.4 rate contracts) so a direct PO auto-fills contracted rates.
**Plan ref** PLAN §4.6, §6.4 · Wave 4 · P1

### PROC-PO-003 · Order setup — address sync + manual override + catalog autosuggest
video-01 @ 10:02 / 10:20 / 10:38 · `35_…` `36_…` `37_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=602)
> "Automatically fetches site delivery addresses from project settings… custom override… suggests items dynamically from the interior material catalog."
**On screen** PO create: ship-to auto-pulled from the project's site address (PROC-SITE-*), with manual override to another warehouse/sub-contractor point; line items via catalogue autocomplete with spec + unit.
**Verdict** adopt. Ship-to = a **Space/Address** on the Project (PLAN entity 3, 6). No new concept.
**Plan ref** PLAN §6.4, entities 3/6 · Wave 4 · P1

### PROC-PO-004 · AI document parsing inside the PO dialog
video-01 @ 11:12 · `38_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=672)
> "Direct document upload and AI item parsing… within the PO creation modal."
**Verdict** adopt-improved — same engine as PROC-MR-002, same delta (facts-not-prices, ledger-metered). Reuse one AI-parse service across MR / PO / stock-in.
**Plan ref** REQ-04, PLAN §3.3 · Wave 4 · P1

### PROC-CFG-001 · PO PDF branding + metadata visibility toggles
video-01 @ 08:02 / 08:26 · `27_…` `28_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=482)
> "Configure default PO layouts by uploading company logos, header banners, footer images… toggling visible metadata fields."
**Verdict** already-planned. This is PLAN §3.3 **Documents config layer** (numbering, templates, branding, print layout) + §3.2 **field-level visibility** (hide project name / show tax IDs on the PDF). Confirms both are table-stakes.
**Plan ref** PLAN §3.2, §3.3 · Wave 0 · P1

### PROC-CFG-002 · Reusable payment-milestone master + attach to PO
video-01 @ 08:34 / 08:51 · `29_…` `30_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=514)
> "Create standardized payment terms (advance %, post-delivery balance) attached during PO creation."
**Verdict** adopt. `payment_plans(id, org_id, name, milestones[{label, pct|amount, trigger}])`, attachable to PO and (per Settings screen) reusable across docs. Feeds Finance milestone billing (PLAN §6.9).
**Plan ref** PLAN §3.3, §6.9 · Wave 0/4 · P1

### PROC-CFG-003 · Master Terms & Conditions clause library + auto-attach
video-01 @ 09:00 / 09:08 · `31_…` `32_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=540)
> "Maintain reusable commercial/legal clauses for automatic attachment to PDF orders."
**Verdict** already-planned — PLAN §3.3 "terms library". Confirmed.
**Plan ref** PLAN §3.3 · Wave 0 · P2

### PROC-CFG-004 · Material Catalog master + bulk CSV import
video-01 @ 09:12 / 09:36 · `33_…` `34_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=552)
> "Centralized master inventory database… instant mass-import of thousands of SKUs, categories, UOMs, and HSN codes from spreadsheet."
**On screen** Catalog master; **CSV import** with SKU/category/UOM/HSN columns.
**Verdict** already-planned + **critical confirmation**. This is PLAN §4 (item master) + §4.7 bulk upload. Dzylo importing "thousands of SKUs, HSN codes" validates PLAN §9 risk #1 (item master) and #7 (migration) as real. VEYRA does this **better**: CSV + image-zip matched by SKU (PLAN §4.7), variants (§4.3), multi-UOM conversion (§4.4) — none of which Dzylo's flat import shows.
**Plan ref** PLAN §4, §4.7 · Wave 1 · **P0**

### PROC-CFG-005 · The Settings surface (whole config catalogue) ⭐
video-01 @ 09:12 · `33_…` (`/componentConfig`) · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=552)
**On screen** "Settings" grid. **Quotation/Estimation:** Quotation Catalogs · **Modular Catalog** · Quotation Settings · **Payment & Tax Settings** · Invoice Templates · **Site Measurements Templates** · **Modules List** · **Module Hardware & Accessories** · Quotation Display & Margin Settings (`Old`). **Procurement & Inventory:** Material Catalog · **Labour Catalog** · **Machine Catalog** · Vendor Categories · PO Templates · **TnC & Payment Plan**. **Project Management:** (below fold).
**Why it matters** This single screen is Dzylo's entire configuration layer, and it maps almost 1:1 onto PLAN §3.3's six config layers — **plus** it reveals catalogue types VEYRA should plan for now: **Labour Catalog** and **Machine Catalog** (PLAN §4.1 lists "service/labour" but not machine/equipment as first-class), **Modular Catalog / Modules List / Module Hardware & Accessories** (PLAN §4.7 "modules as items" — Dzylo splits the parametric module, its hardware and its accessories into three masters; worth mirroring), and **Site Measurement Templates** (PLAN §6.3 measurement variance — templates for it).
**Verdict** adopt-improved — use this as a **checklist for VEYRA's Settings/config module** so nothing is missed. Our advantage: these are all **data-driven config layers** (§3.3), tenant-editable and per-industry-profile-gated, where Dzylo's look like fixed admin screens.
**Plan ref** PLAN §3.3, §4.1, §4.7, §6.3 · Wave 0 · **P0**

### PROC-APP-001 · PO approval — notify, review, approve/reject
video-01 @ 11:37 / 12:01 · `39_…` `40_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=697)
> "Draft POs trigger real-time notifications to procurement heads… review line-items, adjust budget allocations, approve or reject with comments."
**On screen** Draft PO → notification to approver → **Pending Approval** tab → reviewer edits line items / budget, **Approve** or **Reject with comment**.
**Implies (data)** `po_approvals(po_id, approver_id, decision, comment, decided_at)` + threshold rules.
**Verdict** already-planned — PLAN §3.4 **generic approval engine** with thresholds. Dzylo shows a **single-step** approval; VEYRA's engine does **chains, thresholds, delegation, escalation, parallel/sequential** (HANDOFF §7.5). Concrete superiority.
**Plan ref** PLAN §3.4 · Wave 0/4 · P1

### PROC-APP-002 · PO PDF export + multi-channel distribution
video-01 @ 12:44 / 12:53 · `41_…` `42_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=764)
> "One-click PDF export… instant email and WhatsApp dispatch of finalized POs to suppliers."
**Verdict** adopt — again our interaction-layer + outbox. PO dispatch writes `interactions` rows.
**Plan ref** PLAN §6.8, §6.1a · Wave 4 · P1

### PROC-COMM-001 · In-app vendor tagging / communication feed + audit trail
video-01 @ 13:00 / 13:10 · `43_…` `44_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=780)
> "@vendor tag communication feed on individual PO pages… permanent timeline of all buyer-supplier correspondence, attachments, and order modifications."
**On screen** Per-PO activity/comment feed with @vendor tagging; immutable timeline of messages, attachments, order edits.
**Verdict** adopt — this is PLAN §3.4 **comments/@mentions** + the **interactions timeline** scoped to a document. One component, reused on every document, not a PO-only feature.
**Plan ref** PLAN §3.4, §6.1a · Wave 1/4 · P2

---

## 4. Field operations & site (procurement-facing)

### PROC-SITE-001 · Site supervisor project dashboard (scoped access)
video-01 @ 13:25 / 13:46 · `45_…` `46_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=805)
> "Non-procurement personnel access site-specific material requests, active RFQs, POs, and delivery logs through their assigned project dashboard."
**Verdict** already-planned — PLAN §3.2 **data-scope permissions** (own/team/branch/org) + field-level visibility. A supervisor sees their project's procurement without cost detail. Confirms the permission model is load-bearing.
**Plan ref** PLAN §3.2 · Wave 0 · P1

### PROC-SITE-002 · Project location / geo mapping → dynamic ship-to
video-01 @ 14:01 / 14:09 · `47_…` `48_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=841)
> "Enforces linking site geographic locations within project setup to enable dynamic shipping address selection… mapping to physical project sites and unloading docks."
**Verdict** adopt. Project carries a geocoded site **Address/Space** (PLAN entities 3, 6) that PO ship-to reads. Also feeds site attendance geofence (PLAN §6.3).
**Plan ref** PLAN §6.3, entities 3/6 · Wave 3/4 · P2

---

## 5. Delivery, acceptance, stock-in & GRN

### PROC-DELIV-001 · Acceptance queue (PO & Work Orders)
video-01 @ 14:34 / 14:51 / 15:07 / 15:49 · `49_…` `50_…` `51_…` `52_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=874)
> "Track order progress from Order Created to Order Accepted via vendor links or manual admin overrides… supervisors record actual received quantities against PO line items, moving Partial→Completed."
**On screen** "Acceptance" page. Tabs **Purchase Orders / Work Orders**. Status chips **Pending / Partial / Accepted**. **Receive Ad-hoc** button. Table: S.No, PO Number (link), PO Name, Project, Vendor, **Delivery Date (rendered red when overdue)**.
**Flow** vendor accepts via portal link **or** admin overrides ("accepted on phone confirmation", audit-logged) → supervisor logs **received qty per line** → status **Partial → Completed** with reconciliation vs PO totals.
**Implies (data)** `po_receipts(id, po_id, received_by, received_at, mode{vendor,admin_override})`; `po_receipt_lines(receipt_id, po_line_id, qty_received)`; status derived from Σreceived vs ordered. **Partial receipt is first-class.**
**Verdict** adopt-improved. PLAN §6.4 names "GRN with QC and partial receipt" but no screen; this is it. **VEYRA delta:** add a **QC step** (accept/reject/quarantine qty per line with reason) which Dzylo's flow lacks — PLAN §6.4 "GRN with QC" and §6.5 lot/batch. Overdue-red is a good pattern → DESIGN-DIRECTION §2 alert use.
**Plan ref** PLAN §6.4, §6.5 · Wave 4 · P1

### PROC-WH-001 · Add Stock (stock-in with valuation + GST) ⭐
video-01 @ 16:04 / 16:18 · `53_…` `54_…` `55_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=964)
> "Inventory managers select deliveries in the stock-in log, assign receiving warehouses, and record materials directly into project stock."
**On screen** "Add Stock (DLF Greens)". Header: **Receipt Number** (`VID-PO-142`), Date of Receipt, Vendor, **Payment Mode** (Company Account), **Default Category** (Woodwork Hardware & Adhesives), edit(✎), **Add Receipt**, **Confirm Stock In** (disabled until valid).
**Columns** Searched Name · Item Name · **HSN/SAC** · Category · Quantity · **UOM** · **Unit Rate** · **Price** · **GST %** · **Total** · Action(+ / 🗑). Footer: **Total Quantity 232.00 · Total Price 22,939.20**.
**Data** e.g. Fevicol SR998 (5LTR): HSN 35069110, Misc, 12 Litre, rate 120, price 1,440.00, GST 18, total 1,699.20 — so **Total = Price × (1+GST%)**, i.e. stock value captured **inclusive path with GST broken out per line.**
**Implies (data)** `stock_movements(id, org_id, item_id, warehouse_id, project_id, qty, uom, unit_rate, gst_pct, hsn, source_doc, direction=in, created_by, created_at)` — **stock level is a projection over movements** (matches PLAN §6.5 exactly). Valuation input captured at receipt.
**Verdict** adopt-improved.
**VEYRA delta** (1) **Landed cost**: PLAN §4.5 requires freight/duty apportionment and **ITC-able vs non-ITC-able GST split** — Dzylo captures GST% but not ITC-recoverability or freight allocation. (2) **Lot/batch** capture (dye-lot for finishes, PLAN §6.5) is absent here and must be added. (3) Valuation method (moving-avg per warehouse, PLAN §6.5) — Dzylo shows raw unit rate only.
**Plan ref** PLAN §4.5, §6.5 · Wave 4 · **P1**

### PROC-WH-002 · Unlisted-item detection + instant registration
video-01 @ 16:26 / 16:48 · `55_…` `56_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=986)
> "Highlights items missing from the master catalog with a + icon, prompting immediate registration before final stock confirmation… without leaving the receiving workflow."
**On screen** In Add Stock, **rows for uncatalogued items are outlined red** with a **+ (register)** action; **Confirm Stock In stays disabled** until every item is a master record. A modal registers the item inline.
**Verdict** adopt-improved — good integrity gate. **VEYRA delta:** this is PLAN §4.7 **"ad-hoc item promotable to master"** but enforced at the *receiving* gate. We enforce it **earlier** (at MR/PO line entry, PROC-MR-003) so uncatalogued items never travel the whole flow; keep this as the **last-chance backstop**. Registration must set UOM-conversion + item-type attributes (§4.2–4.4), not just a name.
**Plan ref** PLAN §4.2–4.4, §4.7 · Wave 1/4 · P1

### PROC-GRN-001 · GRN auto-generation + Excel export + StockIn ledger
video-01 @ 16:04 / 17:07 / 17:14 · `53_…` `57_…` `58_…` · [watch](https://www.youtube.com/watch?v=gEW1maGsD_4&t=1027)
> "Auto-generates official GRN documentation with line-item verification and digital sign-off… one-click raw data exports to Excel."
**On screen** "Inventory Management". Tabs **Warehouse/Site · Deliveries StockIn · Expenses StockIn · Transaction History**. Sub-filters **Pending / Recorded / Discarded**. **Material Search** + stock-cube icon.
**Columns** Number (`VID-PO-142`) · Name · Project · Vendor · Remark · Warehouse · **Transaction (`VID-GRN-124` link)** · Recorded By · Recorded At. Confirming stock-in **auto-creates the numbered GRN** and links PO→GRN. Excel export for accounting/ERP handoff.
**Implies (data)** `grns(id, org_id, po_id, warehouse_id, recorded_by, recorded_at, status)`; GRN is the posted record of a stock-in event; `Expenses StockIn` = non-PO receipts (petty purchases). **Transaction History** = the full stock_movements ledger.
**Verdict** adopt. This is PLAN §6.4 GRN + §6.5 movements ledger, fully realised. **VEYRA delta:** GRN should support the **3-way match** (PO ↔ GRN ↔ vendor bill) that PLAN §6.4 requires and Dzylo doesn't show; the Excel export is a stopgap for the Tally/Zoho export PLAN §6.9 plans natively.
**Plan ref** PLAN §6.4, §6.5, §6.9 · Wave 4 · P1

---

## Frame coverage checklist (all 58)

01 MR-001/002 · 02 MR-002(urgency) · 03 MR-002 · 04 MR-004 · 05 MR-004 · 06 MR-003 · 07 MR-001/RFQ-001 · 08 RFQ-001(actions) · 09-12 RFQ-001 · 13-14 RFQ-002 · 15-16 RFQ-003 · 17 RFQ-004/006 · 18 RFQ-004 · 19-20 RFQ-005 · 21-22 RFQ-007 · 23-24 RFQ-008 · 25 PO-001/002 · 26 PO-002 · 27-28 CFG-001 · 29-30 CFG-002 · 31-32 CFG-003 · 33 CFG-004/005 · 34 CFG-004 · 35-37 PO-003 · 38 PO-004 · 39-40 APP-001 · 41-42 APP-002 · 43-44 COMM-001 · 45-46 SITE-001 · 47-48 SITE-002 · 49-52 DELIV-001 · 53-54 WH-001/GRN-001 · 55 WH-001/002 · 56 WH-002 · 57 GRN-001 · 58 GRN-001(export). **58/58 ✓**
