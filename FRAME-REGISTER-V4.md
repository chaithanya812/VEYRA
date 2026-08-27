# FRAME REGISTER V4 — the 27 Aug 2026 walkthrough

One entry per screenshot in `temp folder 1/`. Frames are cited everywhere by their `HHMMSS`
timestamp. **This file is the evidence; `PLAN-V4.md` is the instruction.** Read the entry before
building the screen it describes, and open the actual PNG — these notes are a reading aid, not a
replacement.

Two competitor tenants appear: **Daizy Designs** (`one.dzylo.com`, the interior firm) and
**Virtuate Technologies** (a sales-heavy tenant used for the Lead Insights frame). Frames
`102211`–`102359` are **VEYRA's own app**, not the competitor.

Owner's standing instruction: *do not copy this UI.* Understand why every box is there, keep the
information, drop the density, improve on it.

---

## Part A — VEYRA's own screens (the complaints)

### `102211` — VEYRA dashboard, first paint
`localhost:3010/dashboard`, browser at 80% zoom. The nav rail is painted; the entire content area
is grey skeleton blocks; the status bar reads "Waiting for localhost…".

**What it tells us:** first paint is slow enough to photograph. The skeleton is honest, but the
dashboard resolves `getMyWorkspace()` + `getDashboard()` serially before anything renders.
**Action:** stream the panels (Suspense boundaries per card) so the tiles fill in independently.
Not urgent, but note it — the owner saw it.

Also visible: the sidebar is a **flat list** under plain headings — `SALES`, `CATALOGUE`,
`OPERATIONS`, `FINANCE`. No collapsible parents. This is the nav the owner wants restructured.

### `102323` — VEYRA dashboard as Aditi (zoomed)
`Good morning, Aditi` · `Thursday, 27 August · Your work today`.

The tab row: five small pills — `Overview` (red tint, active) · `My info` · `Tasks` · `Expenses` ·
`Field visits` — sitting in a white band. Each pill is ~28px tall with a hairline border and a tiny
icon.

Four stat tiles: `HOURS TODAY 0h 00m / Not checked in` · `OPEN TASKS 0 / 0 due today` ·
`OVERDUE 0 / All clear` · `CLIENT FOLLOW-UPS 0 / ₹0 expenses owed to you`.

Then `Today` + a dashed empty state: "Nothing due today".

**The owner's verdict:** *"that buttons could be done way better… what is this bull that you are
kept?"* He is right. Diagnosis: the pills are undersized, uniformly weighted, low-contrast, and the
containing band earns nothing. The four tiles are all identical flat grey with no hierarchy — there
is no hero metric, so the eye has nowhere to land. Every value is `0`, which makes it worse.

### `102359` — VEYRA dashboard as Sneha — **the View-as bug, photographed**
Greeting reads **`Good morning, Sneha`**. Role badge top-right reads **`Staff`**. The picker beside
it still reads **`Aditi Pradhan — Founder`**.

**This is the bug, confirmed by the owner's own screenshot and reproduced live.** The page re-rendered
for the new person; the control did not. Root cause is an uncontrolled `<select defaultValue>` in
`components/shell/view-as.tsx` — React applies `defaultValue` on mount only, so after the server
action re-renders the layout the DOM keeps the stale selection. See `PLAN-V4.md §1.1`.

Also visible: a red **`1 Issue ✕`** badge bottom-left — the Next dev overlay. It corresponds to the
`vc-init` hydration warning, which is injected by preview tooling and **is not in VEYRA's source**
(`grep` across app/lib/components/middleware/config returns nothing).

---

## Part B — Sales

### `103904` — **Lead Insights** (Virtuate tenant) — the frame the owner named
Nav: `Sales` expanded → `Leads` · **`Lead Insights`** (active) · `Follow-Ups`.

**Card 1 — Lead Conversion Analysis.** Toggle top-right: **`SelectedRange`** (red, active) |
`All Time`.
- Row: `Unassigned Leads:` with the count **`2`** right-aligned.
- Four tinted tiles: **`147` Received** (blue) · **`9` Converted** (green) · **`0` Lost** (red) ·
  **`7` Junk** (amber).
- **Conversion Rate** band on green tint: **`6.12%`** with a progress bar, and `9 of 147 leads`
  right-aligned. *The denominator is shown — that is what makes the percentage trustworthy.*

**Card 2 — Lead Count Trends.** Dropdown `Last 7 Days ▾`. Green area chart, y-axis `0 / 10 / 20`,
x-axis `21 Jun → 27 Jun`, peak ≈14 on 26 Jun.

**Card 3 — Lead Source Overview.** `Export ⬇` chip. Donut with legend — `No Source 9 (6.5%)`,
`Dzylo Api …`. Colours purple / red / green / blue.

**Card 4 — Sales Funnel Value Stages.** `Export ⬇` · toggle **`Count`** (red, active) | `Value` ·
`Sort by: Count ↕`. Horizontal bars, one per stage, each a different pastel, count at the bar end,
**sorted descending**:

| Stage | n | Stage | n |
|---|---|---|---|
| DNP | 25 | Demo Done (Not Interested) | 4 |
| Demo Done (Decision Pending) | 24 | Lead Duplicacy | 3 |
| Demo Scheduled | 20 | Sid_DemoDone | 3 |
| DEMO MISSED | 14 | Call-HungUp | 2 |
| Created | 10 | Channel Partner(Prospect) | 1 |
| Not Interested (Close) | 8 | Payment_Pipeline | 1 |
| Qualified | 8 | ToBeDeleted | 1 |
| Junk | 7 | Will Consider in Future | 1 |
| Call-Back-Requested | 6 | | |

**Read this carefully — it is the argument for VEYRA's design.** Seventeen stages, several of them
junk (`Sid_DemoDone`, `ToBeDeleted`, `Lead Duplicacy`), several overlapping. This is what happens
when stages are hardcoded and never curated. VEYRA already distilled these to **14 tenant-editable
`lead_statuses`**. The funnel card must read from `lead_statuses`, never a fixed list.

**Owner's ask:** *"make sure there's a select range and all time… keep it individual, you don't need
to clutter."* → five independent cards, each with its own toggle, plus one global range control.

---

## Part C — Project Insights

### `103749` / `104314` — Project Insights → Overview
Header: `Project Insights` + a **`Financials 👁`** chip (hides every money figure on the page) +
an `All` scope dropdown. Tabs **`Overview`** (active) | `Teams`.

Three hero tiles:
- blue — `Active Projects` **112** | `Value: 22Cr INR`
- green — `On Track` **44**
- red — `Running Late` **68**

*68 of 112 late is the headline. The tile colours do the work; no red button in sight.*

**Project Status card.** Chip `Top 10 On Track` (green) · toggle `Delayed` | **`On Track`** (dark).
Rows: status dot · project name · **stage chip** (colour per stage: Installation navy, Planning
blue, Production green, Designing light blue, On Hold / First stage / Settled and Closed grey) ·
owner avatar · **`8% Ahead` / `5.88% Ahead`** (green) / `0% Ahead` (grey).

**Project by Stage card.** Toggle **`Count`** (dark) | `Value`. Donut with per-segment counts.
Legend, every stage with a dot: `Delivered 1 (0.9%)` · `Designing 10 (8.9%)` · `Execution 5 (4.5%)`
· `First Deposit Paid 1 (0.9%)` · `First stage 1 (0.9%)` · `Installation 4 (3.6%)` ·
`On Hold 3 (2.7%)` · **`Planning 75 (67.0%)`** · `Production 8 (7.1%)` · `Settled and Closed 2
(1.8%)` · `Settlement Pending 2 (1.8%)`.

*67% of all projects sit in "Planning" — a finding, not a chart. VEYRA should surface that as a
callout, not leave the user to read it off a donut.*

**Project Timeline card.** Legend `● On time` `● Delayed` `● Running late` · controls
`Handover Date ▾` then `This Month` (active) | `Next Month` | `Custom Range`.

### `104406` — Project Insights → Timeline expanded
Gantt rows, bars coloured by lateness and **labelled with the handover date**:
`project - 16od3zl` (red, `08 Jun 26`) · `project - 1wh5kos` (red, `08 Jun 26`) ·
`The Mehta Home` (short red, `02 Ju…`) · `Project - 1319` (long red, `18 Jun 26`).
A **vertical red line marks today**, footer `Today (June 27, 2026)`.

### `104329` — Project Insights → Teams
Heading `Project Owners:`. One row per owner: avatar with initials on a deterministic tint —
`NO` (red) **No Project Owner**, `AP` (purple) Aditi Pradhan, `A` (orange) Akshita, `KA` (purple)
Kshitiz Awasthi, `A` Amrita, `A` Anisha. Each row carries a chip
`⚹ Active Projects: 97 | Total Value: 20Cr INR` and a chevron.

Expanded (Aditi Pradhan) → two cards:
- **Stage Distribution** — `● Planning` with `Project: 2 | Value: 15L INR`
- **Owner Performance Summary** — four tinted rows: blue `Active Project 2 | Value: 15L INR`,
  green `On-track Projects 1`, red `Delayed Projects 1`, green `Projects Delivered 0`

**`No Project Owner` holds 97 of 112 projects.** That is a data-quality catastrophe rendered as a
neutral row. VEYRA should treat unowned projects as an **alert**, surfaced first, in red.

---

## Part D — Projects

### `104420` — Projects list
Header `Projects` · `Projects Count: 2` · column chooser ▥ · filter (red) · Search · duplicate icon ·
**`+ New Project`** (red primary) · kebab.

Filter band: `Project Stage [Planning ×] +13 ▾` · `Filter By [Select Other Filters] ▾` · tag icon ·
`Sort by ↕ ▾`. Active search chip beneath: `daizy ✕`.

Columns: ☐ · `ID` · `Client Name` (person icon, hover tooltip for the full name) · `Project Name` ·
**`Stage`** (filled pill dropdown, colour per stage) · `Assigned To` (avatar stack `AP RR`) ·
**`Milestones`** · `Tentative Start Date` · `Hand-over Date`.

**The `Milestones` cell is the single best idea in this product.** Header carries a sub-legend
`● Last Completed  ● Upcoming`. Each cell is a mini panel:

```
● 17/72   [====----]  47.51%  |  100% est
✓ ModularWoodwork Ordering            18 Jun
→ Installation of Modular Woodw…       5 Aug
```

Count, actual % against estimated %, the last thing finished, and the next thing due — in one cell.
Nobody has to open a project to learn whether it is healthy. **Build this.**

`Hand-over Date` shows `23-Apr-26` with **`🏃 Running late by 65 days`** in red beneath.

### `104529` — Project Data → **Summary** (the owner: *"the very most important part of the UI"*)
Module tab strip across the top with coloured icons: `Details · Quotation 2.O · Inspirations ·
Documents · Project Plan · Finance Plan · Payments · Site · Labour · Procurement · MB Sheet · …`
with `«` `»` scroll arrows.

Page tabs: **`Summary`** (red, active) | `Modules`. Right: `(Auto Refresh after 24 Hours)` + ⟳.

**Header band:** `Client: Varun Varma | Project: Daizy Interiors | Owner: None` ·
`Start: 05-Aug-25  Hand-over: 23-Apr-26` · right: `Actual: 47.51%` (red bar) `Est: 100%` (blue bar)
· **`View Report`** button + ↗.

**Left column (narrow):**
- **Communication** ↗ — `You have 36 new messages`
- **Site Progress (24)** ↗ — one large photo + a thumbnail strip, `Last Uploaded On : 24-Mar-2026`
- **Design Documents (10)** ↗ — recent files as dated links
  (`New file was added on 24-Jun-2026` → `difference-between-2D-floor-plans-and-3d-floor-plans.webp`)
- **Latest Updates** — initials-prefixed activity:
  `[RR] Updated the stage to Planning (24-Mar-2026)` · `[RR] Assigned to Radhika Rana (24-Mar-2026)`
  · `[AP] Phone number updated from 9999999999 / Alternate Contact number removed: 9999999999`

**Right column (wide):**
- **Project Financials** 👁 · chip `Project Value: 36,12,239.29 INR`
  Five grey figures — `21L Fund` · `1.8L Total Disbursed` · `25,600 Receivable Dues` ·
  `4.7L Total Payables` · `- 78,905.4 Payable Dues` — then two tinted hero tiles:
  **`19L Cash Flow`** (red tint) and **`30L P&L`** (green tint).
- **Milestones** ↗ · toggle **`Milestones`** (dark) | `Tasks`
  Columns `Milestone · Progress · Days Left · Assignee · Last Update`.
  Rows: `Site Measurements 0% 351 days overdue` · `Plan Layout Creation 0% 351 days overdue` ·
  `3D Modelling` · `2D Detailed Drawings` — all `351 days overdue`, all with **empty assignee and
  empty last update**.
- **Procurement** ↗ · toggle **`PO Requests`** (dark) | `Requests` | `Delivery Acceptance`
  Columns `Order ID · Order Name · Vendor · Amount · Delivery State · Payment`.
  `DZY-PO-303 · Wooden material request · Shekhar singh · 14,514 · Fully Delivered · Not Initiated`

**Note the failure mode:** `351 days overdue` is plain grey text. `DESIGN-DIRECTION §7` calls this
out — overdue must be red **plus an icon**, and it belongs in a next-action queue, not buried in a
row.

### `104636` — Progress Report (composable export)
Modal. Left rail **`Preview Settings`**, four collapsible groups of checkboxes:
- **Project Details:** ☑ Project Name · ☑ Project Start Date · ☑ Target Handover Date ·
  ☑ Actual Progress · ☑ Total Project Days
- **Milestones:** ☐ No Milestone · ☑ **All Milestones** · ☐ **Client Visible Only**
- **Charts & Graphs:** ☐ Gantt · ☑ Labor Chart
- **Site Pictures:** ☐ No Site Progress · ☑ **All Site Progress** · ☐ **Client Visible Only**
- Footnote: *"The exported PDF may look slightly different from the preview due to formatting
  adjustments."*

Right pane — the live preview: `dzylo` letterhead with the firm's address, **`Progress Report`**
title, then four boxes `Project Name: Daizy Interiors` · `Project Timeline: 5-Aug-25–23-Apr-26` ·
`Total Duration: 261 Days` · `Progress: 47.51%`. Then a `Milestones` table —
`Milestone · Progress · Date · Update` with `Completed` in blue, `To Do` in blue, dates stacked
`11-Jul / 11-Jul`, update `-`.

**The `Client Visible Only` options are why the `client_visible` flag matters** even though VEYRA
ships no client portal. This report is what actually reaches the client.

### `104705` — Project → **Modules** grid
Header band: `# ID: 653 · Client: Varun Varma · Project: Daizy Interiors`; right:
`Est.` blue bar `100%`, `Actual` red bar `47.51%`, `Behind schedule, needs attention (52.49%)` in
red; far right a **`View Progress Report`** card.

Module cards, each a colourful illustration on a light rounded square:
`Details · Designs & Documents · Site Progress Uploads · Project Planning · Financial Planning ·
Project Payments · Labour Report · Procurement · MB Sheet · Quotation Generator` (orange **`New
2.0`** ribbon) — then `Inspirations · Virtual Tour · Communication · Warranty ·
Quotations & Site Details` (orange **`Old`** ribbon).

**The `Old` ribbon is visible tech debt** — `DESIGN-DIRECTION §7` names it. VEYRA ships one config
surface, versioned cleanly, never an "(Old)" tile.

---

## Part E — Designs & Documents

### `104742` — Design Document (file browser)
`one.dzylo.com/designUploads`. Breadcrumb `‹ Design Document` + `Client: Varun Varma / Daizy
Interiors / 653`. Right: filter (red outline) · Search · **`+ Add`** (red primary).
Sub-header: `Document` left, **`Storage Usage : 47.29 MB`** right + kebab.

**Folders (10)** — collapsible grid of chips, each a yellow folder icon + name + date + kebab:
`drawingsv1 06 Jun'26` · `2d 27 Feb'26` · `quotation 18 Feb'26` · `Graphic-designs 18 Feb'26` ·
`CAD-DESIGNS 18 Feb'26` · `LabourReport 18 Feb'26` · `Documents 18 Feb'26` · `Finance 18 Feb'26` ·
`design 18 Feb'26` · `3d 17 Dec'25`. **Tenant-created, not a fixed taxonomy.**

**Files (11)** — columns `S.No · Name · 💬 · Version · Internal Status ⓘ · Client Approval ⓘ ·
Description · Uploaded`:

| # | Name | Ver | Internal | Client Approval | Uploaded |
|---|---|---|---|---|---|
| 1 | `01KHNMATHW…webp` 35.21 KB | ver 1 ⊕ | `Draft` (blue) | `Revision Requested` (red) · 0 Comments | AP 17 Feb'26 |
| 2 | `Wooden Demo Quotation - v1` 0 B | ver 1 ⊕ | `Draft` | `Revision Requested` · 0 Comments | RR 26 Feb'26 |
| 3 | `2D Layout.pdf` 90.44 KB | ver 1 ⊕ | `Approved` (green) | `Not shared with client` · 2 Comments \| 0 Pending | RR 27 Feb'26 |
| 4 | `2BHK sHIVANI` 0 B | ver 1 ⊕ | `Draft` | `No Action Taken` (amber) | S 15 Apr'26 |
| 5 | `2bhk-house-plan-east-facing-2 (1).jpg` | ver 1 ⊕ | `Approved` | `Not shared with client` · 2 Comments | AP |
| 6 | `3d-floor-plans.webp` 16.46 KB | **ver 2** ⊕ | `Draft` | `No Action Taken` | S 24 Jun'26 |

**The critical structural insight:** `Internal Status` and `Client Approval` are **two independent
lifecycles on the same file**, and **version is per-file with an inline ⊕ to add one**. Comment
count and *pending* comment count are surfaced in the list, not just the viewer.

### `104841` — File viewer + comments (the owner detailed this one)
Modal. Title `📄 2D Layout.pdf` + `Approved` green chip · centre toggle `View` | **`Review`** (red)
· ✕.

**Left rail:** tabs **`Comment`** (red) · `Communication` · `Audits`.
- `Comment:` row with a **`Ver 1 ▾`** dropdown — *comments are scoped to a version*
- Segmented **`INTERNAL`** (red, active) | `CLIENT` — **two separate threads on one file**
- `Search Comments`
- Filter chips: **`All`** (red) · `Accepted` · `Not Required` · `Pending`
- Comment cards: 📌 + `Accepted` (green) · numbered body
  (`1. Change the current sofa to an L-shaped corner sofa`) · `Radhika, 27 Feb' 26` ·
  `↩ Reply` (red) · `↺ Reopen` (red) · kebab
- Bottom: **`Type a message`** + red send — the owner asked for exactly this

**Right pane:** the floor plan render, `👁 Hide Comments` top-right, and a **numbered green pin
badge `2` placed on the KITCHEN** — comments anchor to coordinates on the document.

---

## Part F — Project Planning

### `105010` — Project Plan → Milestone
Header `‹ Project Plan` + `Client: Varun Varma/Daizy Interiors/653` · **`Add Scope`** (red primary).
Tabs **`Milestone`** (red) · `Gantt Chart` · `Tasks`. Toolbar: ⟳ · ▥ · donut (red, active) · ▽ ·
Search · kebab.

**Milestones Overview** — *"Monitor implementation progress and key delivery checkpoints."*
Four ring tiles: **Total 72** (blue) · **In Progress 7** (amber) · **Completed 17** (green) ·
**Not Started 48** (grey).

**Dates card:** `● Planned Start Date: 11-Jul-25` · `● Actual Start Date: 03-Feb-26` (green chip) ·
`Planned Handover Date: 11-May-26` · `● Actual End Date: -` (amber chip).

**Progress card:** `Estimated` blue bar **100.00%**; `Actual` red bar **47.51%** with
**`Behind schedule, needs attention (▼ 52.49%)`** on red tint.

**Scope band:** `Design Team` + chips `14 Milestones` (blue) `11 Completed` (green) + *"This is the
default project scope."* Right: progress bar **89.48%** · **＋** (tooltip `Add Milestone`) ·
**`SmartPlan`** (tooltip *"…milestones using AI"*) · ••• · ⌄.

**Milestone table:** `⠿ · ☐ · Milestone · Progress · Status · Timeline ⓘ · Assignee ·
Client Visible · Last Update ·` (+ a trailing linked-milestone/dependency column showing chips
`Modu… 3D M… Plan L… 2D De… Electr…`).

The **`Timeline` cell holds three stacked lines** — this is the design worth stealing:

```
1-Jul'25  →  30-Aug'25      (planned)
12-Mar'26 →  13-Jun'26      (actual)
Completed 287 days late      (variance, red on red tint)
```

Rows: `Site Marking 100% Completed … AP … VISIBLE … "S Shivani Update 2-Jun-26"` ·
`Site Measurements (1 🔗) … Completed 337 days late … VISIBLE … + Add remark` ·
`3D Modelling … actual row shows placeholder "Actual Start → Actual End" … Completed 346 days late` ·
`Plan Layout Creation … unassigned (add-person icon) … HIDDEN` ·
`False Ceiling Channel Work … Completed 294 days late … HIDDEN`.

`Progress` is an **inline editable `100 %` input**; `Status` is an inline dropdown; `Client Visible`
is a green/grey **toggle** labelled `VISIBLE` / `HIDDEN`.

### `105024` — Project Plan → scope groups collapsed
Five bands, each: layers icon · name · `n Milestones` (blue) · `n Completed` (green) · progress bar
+ % · ＋ · `SmartPlan` · ••• · ⌄

| Scope | Milestones | Completed | Progress |
|---|---|---|---|
| Design Team *(default scope)* | 14 | 11 | 89.48% |
| Execution Team | 12 | 4 | 22.86% |
| Post Handover Team | 4 | 2 | 76.92% |
| Sample | 28 | 0 | 0% |
| Designer Scope | 14 | 0 | 0% |

14+12+4+28+14 = **72** ✓ reconciles with the Total tile.

**This is `scope_items` surfacing in the UI** — the architecture `PLAN §1.1` specified and the
codebase never built. See `PLAN-V4.md §6`.

Milestone names visible across frames, useful as seed templates: `Site Marking · Site Measurements ·
3D Modelling · Plan Layout Creation · 2D Detailed Drawings · False Ceiling Channel Work ·
Electrical Conduiting Work · POP Punning Work · Panelling Work · ModularWoodwork Ordering ·
Installation of Modular work Cabinets · Paint Work · Cleaning`.

---

## Part G — Financial Planning

### `105238` — Financial Planning → **Inflow**
Header `‹ Financial Planning` + **`Learn`** link + `Daizy Interiors /653`.
Tabs **`Inflow`** (red) · `Outflow` · `Documents`.

Summary band (pink): `Client: Varun Varma` · right: `Project Value: 36,12,239.29` ·
`Funds: 20,74,400` (green) · `Total Receivables: 15,37,839.29` · `Receivable Dues: 25,600` ·
**`Audit`** button.

`Contracts:` · right **`+ Contract`** (outlined) and **`Save`** (red).

**Contract card — `Civil`:** name input · `Source [Client ▾]` · assign icon · 🗑 · ⌃
`Amount: [2000000]` · `Funds Received: 19,71,400` (green) · `Total Receivables: 28,600` ·
`Receivables Due: 28,600` · **`+ Milestone`** (red) · ⬇

| S.No | Name | Percentage ⟳ | Amount | Tentative Due | Work Done | Actual Due | Actions |
|---|---|---|---|---|---|---|---|
| 1 | 1st | 40 | 800000 | 20-Mar'26 | ☑ | 20-Mar'26 | 👤 🗑 |
| 2 | 2nd | 20 | 400000 | 04-Apr'26 | ☑ | 04-Apr'26 | |
| 3 | 3rd | 40 | 800000 | 08-Apr'26 | ☑ | 08-Apr'26 | |
| | **Total** | **100%** | **2,000,000** | | | | |

**Contract card 2 — `Contract - 2`:** Amount `120000`, `Funds Received: 1,000`,
`Total Receivables: 1,19,000`, **`Receivables Due: - 1,000`** (red).
Row 1 · `Advance` · 20 · 24000 · 06-Feb'26 · ☐ · *(no Actual Due)*

**Three mechanics to copy:**
1. `Percentage` and `Amount` are **two-way bound** (the ⟳ icon), and the **Total must be 100%**.
2. **`Actual Due` only materialises when `Work Done` is ticked.** Ticking work-done is what makes a
   milestone billable — that is the whole receivables engine.
3. Negative dues render red with a leading minus.

### `105325` — Financial Planning → **Outflow**
**`Add Vendor`** (red primary) + kebab. Summary band: `Estimated Expenses: 6,49,016.63` ·
`Total Payables: 4,69,481.23` (green) · right `Disbursed: 1,79,535.4` (red) + ➦ ·
`Payable Dues: - 78,905.4` (red).

Columns `Vendor Name · Category · Agreed Amount · Contracts · Disbursed Amount · Total Payables ·
Payable Dues · Action`.

`Category` is **multi-valued, comma-joined**: `False Ceiling POP Work, Civil Masonry Work` ·
`Carpentry Woodwork, Wallpaper & ReadyMade Panels, Decorative Bought-out Items` ·
`Electrical Work, Civil Masonry Work` · `Carpentry Woodwork, Hardware supplier`.

Last row: **`Unlisted Vendor` / `Miscellaneous` / Agreed 0** — ad-hoc spend has a home. Keep that.

---

## Part H — Project Payments

### `105403` — Project Payments → Expenses
`one.dzylo.com/payments-project-view`. Header `‹ Project Payments` ❓ +
`Client: Varun Varma / Daizy Interiors / 653` · **`+ Add Expense`** (red primary).

**`Financial Summary`** with a **`Hide`** 👁 toggle. Five grey tiles —
`20,74,400 Funds Received` (green text) · `1,79,535.4 Disbursed Amount` (red) ·
`25,600 Receivable Dues` · `4,69,481.23 Total Payables` · `- 78,905.4 Payables Dues` —
then two green tiles: **`18,94,864.6 Cash Flow`** · **`29,63,222.66 Expected P&L`**.

Tabs **`Expenses`** (red) · `Funds`. Centre toggle **`Listing`** (dark) | `Analytics`.
Right: `💳 Total Expenses: - 1,79,535.4 INR` + filter.
Row above the table: **`Push to Zoho`** (red outline — an accounting export seam) ·
☐ **`View Reversed Transactions`**.

Columns `ID · Transaction Date · Recorded Date · Amount · Expense By · Vendor · Contract ·
Expense Source · Expense Type · Expense Category · Remark`. IDs are short codes (`9V4CX7F`).
`Expense Source`: `CompanyAccount` / `Cash`. `Expense Type`: `Material` / `Labour` /
`Labour+Material` / `Professional Services`. `Expense Category`: `Paint Works` / `Carpentry Works` /
`Electrical Works` / `False Ceiling POP Works`. Footer `Load All` (red) · `Load More`.

**Two things to keep:** `Transaction Date` and `Recorded Date` are **separate columns** (when it
happened vs when it was entered), and reversals are a **filter, not a delete** — the ledger is
append-only, which is already a VEYRA hard rule.

### `105429` — **Add Expense** dialog
`Expense Date *` (27-Jun'26, picker) · `Amount *` · `Source *` (CompanyAccount) ·
`Expense Type` (Select Type) · `Project *` (chip `Daizy Interiors (Varun Va… ✕`) ·
`Vendor` with a red **⊕** for inline create · `Select Contract` · `Category` ·
`Receipt` → `⬆ Upload Receipt` · ☐ **`Stock-In Request`** · `Remarks` (0/250) ·
**`+ Add Expense`** (red, full-width).

**`Stock-In Request` is the interesting one** — ticking it raises an inventory stock-in from the
expense, which is how `Expense StockIn` in `110109` gets populated.

### `105444` — **Add Fund** dialog + Funds tab
Dialog: `Collection Date *` · `Collection Mode *` (CompanyAccount) · `Collected By *` (person chip
with ✕) · `Amount *` · **`Contract *`** (Civil) · `Attachment` → `⬆ Upload Attachment` ·
`Remarks` (0/250) · **`+ Add Fund`** (red, full-width).

Behind it: **`+ Add Fund`** replaces `+ Add Expense` on the Funds tab. Chip
`💰 Total Funds: 20,74,400 INR` (green). Columns `ID · Recorded On · … · Amount · … ·
Approved By · Contract · Remarks · Actions`. Amounts are **green with a leading `+`**
(`+7,00,000` · `+8,00,000` · `+400` · `+1,00,000` · `+1,000`).

**Asymmetry worth preserving:** `Contract` is **required for a Fund**, **optional for an Expense**.
Money in must be against a client contract; money out may be miscellaneous.

---

## Part I — Site & Labour

### `105527` — Site Progress
Header `‹ Site Progress` + `Client Name: Varun Varma/ Daizy Interiors/ 653` ·
**`+ Add Progress`** (red primary). Tabs **`All`** (red) · `Client Visible` · `Client Not Visible` ·
right `Actions ▾` (bulk).

Date-group headers `Uploaded on: 24 Mar 2026` / `09 Feb 2026` / `29 Jan 2026`, each followed by a
4-up photo grid. Card footer `Uploaded by: Radhika Rana`. On hover: ⤢ expand, 🗑 delete, and a
**`💬 Client Chat`** button — per-photo threads, same model as file comments.

### `105620` — Labour Report → Overview
Header `‹ Labour Report` + `Client: Varun Varma / Daizy Interiors / 161761`.
Summary strip: `Total Labour Count: 71` · `Total Skilled: 34` · `Total Unskilled: 25` ·
`Total Coordinator: 12` · filter · **`+ Attendance`** (red) · kebab.
Tabs **`Overview`** (red) · `Analytics` · right `Client Visible` toggle (off).

Columns `Date · Vendor · Contracts · Category · Skilled · Unskilled · Coordinator · Total ·
Remark · Attachment · Action`. `No Vendor` is a valid value. 34+25+12 = **71** ✓ totals reconcile.

### `105638` — **Labour Attendance** dialog
`Date` (6/27/2026) · **`Categories`** (Select Categories — multi) · **`Vendors`** (Select Vendors —
multi) · **`Contracts`** (Select Contract) · then a grouped card of three steppers:
**`Skilled Labour`** ⊖ `0` ⊕ · **`Unskilled Labour`** ⊖ `0` ⊕ · **`Coordinator`** ⊖ `0` ⊕
(⊖ grey, ⊕ red) · `📎 Attachment` · `Remarks` · **`Submit`** (red, full-width).

So one attendance row = date + categories[] + vendors[] + contract + three integer counts.

### `105659` / `105706` — the multi-selects
Searchable checkbox dropdowns. **Categories:** `Carpentry Woodwork · False Ceiling POP Work ·
Civil Masonry Work · Electrical Work · Plumbing Work · MS & Fabrication Works ·
Marble & Tile Works · Paint Works · Cleaning`. **Vendors:** the vendor list, searchable, with
`No Vendor` valid.

**This vocabulary must live in `workspace_options`** so a tenant renames or extends it — that is
what makes labour segregable, which is exactly what the owner asked for.

### `105716` — Labour Report → Analytics
Four cards, each with a **`Chart` | `Table`** toggle (Chart red, active):
- **Daily Labour Trend** — green area chart, y `0/10/20`, x `28-Aug-25 → 18-Jun-26`, hover tooltip
  `24-Mar-26 / ■ Labour Count: 9`
- **Labour by Vendor** — donut; legend `Unknown Vendor · Navneet · Chaganram · Ayushi ·
  hitesh rabu · Aditi Testt · Rahul · Aditi Test`
- **Labour by Category** — donut; `False Ceiling POP Work · Carpentry Woodwork · Marble & Tile Works…`
- **Labour by Contract** — donut; `No Contract · Labour Contract - 1 …`

---

## Part J — Procurement

### `105729` — Procurement → Request (project-scoped)
`procurement-project/161761/material-request`. Sub-tabs **`Request`** (red) · `RFQs` · `Orders` ·
`Deliveries` · `Inventory` · then `( Client: Varun Varma / Daizy Interiors / 653 )`.
Chips `☰ All Requests` (active) · `⊘ Pending Approvals (0)`. Right: donut · filter ·
**`+ Raise Request`** (red primary).

Four tiles, each with a coloured left border and an icon badge:
- **Total Requests `26 Req`** (green) · **In Progress Requests `4 Req`** (amber) ·
  **Due Delivery Date `2 req`** (red)
- **Total items (177)** (purple) with a **segmented bar** + legend
  `● Pending (39)` · `● RFQ Raised (11)` · `● Ordered (127)`

Columns `ID · Name · Type · Expected Delivery · Created Date · Stage · Created By · Action`.
IDs `DZY-REQ-170 … -144`.

**`Stage` is multi-valued per request** — one cell stacks several:

```
DZY-REQ-169 →  ● Ordered (4)   ● Pending (8)   ● In Stock (4)
DZY-REQ-164 →  ● Order Requested (3)  ● Ordered (6)  ● Pending (3)  ● In Stock (1)
```

Stage vocabulary: `Pending · Order Requested · RFQ Raised · Ordered · In Stock`.
**A request has no single status — its items split across stages.** VEYRA's current
single-status material-request model cannot express this and must change.

### `105800` — **New Request** dialog
`Request Type *` (Material) · `Title *` · `Project *` (prefilled, disabled) ·
`Expected Delivery date *` · **`⊕ Add Attachment`** (red) · ☐ **`Read by Daizy Ai`** with a pink
chip **`Credits left : 467`** · `Cancel` / **`Next`** (red).

`Next`, not `Create` — a two-step wizard (details → line items). The AI parse must return
**item names, quantities and UOMs only, never prices** (`PLAN-V4 §0.2`). Note the raw decrementing
credit counter — `DESIGN-DIRECTION §7` says replace it with a ledger-backed Used/Allowed/Remaining
meter.

### `105818` — RFQs list
Columns `ID · Name · Vendors · Expected Delivery · Item Count · Created Date · Status · Action`.
`Vendors` shows `Chaganram +6 more` (link). `Status` is `Ordered` (blue link) or `Pending`.
**`Generate RFQ`** (red primary). Pagination `1 – 23 of 23`.

### `105853` — RFQ detail (`DZY-RFQ-123`)
Tabs **`Vendor List`** (red) · **`Item Biding Comparison`**.

Info card: `Project Name: Daizy Interiors` | `Request Title: wooden material request` ·
`Expected Delivery Date: 20-May-26` | `Status: Ordered` · `Created Date: 20-May-26` |
`Created By: Shivani` · **`Place of Supply:`** full address (`Shop no 10, TOWER-C, Unitech Business
Zone, Nirvana Country, Sector 50, Gurugram, Haryana 122018, India…`) · `Remark: ABC`.

Vendor table `Vendor Name · Delivery Date · Response Status · Last Response Date · Total Biding ·
Vendor Remark · Action`:

| Vendor | Delivery | Response Status | Total Biding |
|---|---|---|---|
| Aditi Test | - | `Pending(v1)` | 0 |
| **Shekhar singh** | 20-May-26 | **`Ordered`** | **60,298** ← row tinted green |
| Vinayak | 20-May-26 | `Submitted(v1)` *by Shivani* | 18,738.4 |

**Two findings.** (1) `(v1)` — RFQ rounds are **versioned**; a second round is `v2`. (2) The
*cheaper* bid (18,738.4) was **not** the one ordered (60,298) — award is a judgement call with a
recorded reason, never lowest-price-wins. (3) *"by Shivani"* — a staff member entered the bid on the
vendor's behalf, which matches the owner's "keep it manual" stance and means the vendor portal is
optional, not required.

`Place of Supply` is GST-critical and already modelled in VEYRA.

### `105913` — Orders list
Chips `⚡ Approved Orders` (active) · `📋 Approval Pending (3)` · `🗂 Ordered Items`.
Right: donut · filter **with a `1` badge** (active filter count) · Search · **`+ Create Order`**
(red) · kebab.

Four tiles: **Total Orders** `37 Orders , 44,22,964.89 value` · **Accepted Orders** `1 Orders ,
0 value` · **Partial Delivered Orders** `3 Orders , 5,03,169.7 value` · **Payment Status** with a
segmented bar + legend `● Not Initiated (36) · ● Partial Done (0) · ● Completed (1)`.

Columns `S.no. · Order Name · Vendor · Purchase Order · Payment State · Created by/date ·
Delivery date · Order State · Actions`.
- `Order Name` carries a grey sub-label — **`Purchase Order`** or **`Work Order`**
- `Purchase Order` is `DZY-PO-299` (blue link + ↗) with the value beneath (`2,832 INR` or `-`)
- `Delivery date` shows the date **and** `3 Days Left` (green) / `1 Day Passed` (red) /
  `28 Days Passed` / `300 Days Passed`
- `Order State`: `Order Created` · `Order Accepted` · `Partially Delivered`
- **`DZY-WO-8` — Work Orders and Purchase Orders share this table.**

### `105927` — Order detail
Modal, title `kitchen interior material request`.

**Left — the rendered PO document** with ⬇ download, page nav `1 / 2`, zoom 🔍- 🔍+:
- Pink letterhead `Daizy Design` + address + `GST-XX55XX44XX06` + email + phones
- `dzylo` logo + firm address + `GST: 7788787`; right **`Purchase Order (DZY-PO-299)`**
- `PO Amount: 0 INR / No. of Items: 1` | `Order Date: 16-Jun-26 / Delivery Date: 30-Jun-26 /
  Project Name: Daizy Interiors`
- **`Shipping Address`** (`P34X+32M, D Block, Avantika, Sector 1, Rohini, Delhi, 110085` + GST) |
  **`Vendor Billing Address`** (`Shekhar singh, F24V+8H4, Sector 15 Part 2, Gurugram, Haryana
  122001`)
- Line table **`S.No · Description · HSN · Qty · UOM · Rate · % Disc · % Tax · Total`** —
  `1 · Hepo Drywall Screw 3.5*35mm · · 100 · Nos · 0 · 0 · 18 · -`
- Totals: `Base Amount 0 INR` / `Total Tax Amount 0 INR` / **`Total Amount 0 INR`**
- Page 2: `Payment Terms`

**Right — the control rail:**
- **`Order State`** dropdown (`Order Created`) · **`Payment Status`** dropdown (`Not Initiated`)
- **Activity feed**, each entry author (red) + timestamp:
  `Order requested for 1 item` 16-Jun-26 12:21 PM →
  `Order for 1 item approved` 12:24 PM →
  `Order state updated to Order Created` 12:24 PM
- Bottom: `📎` + **`Type @ to mention someone...`** + red send

**HSN, UOM, % Disc, % Tax, Base/Tax/Total, both GSTINs and Place of Supply — this document is
GST-correct** and maps straight onto VEYRA's existing GST work. The `@mention` composer is the
audit/comment spine reappearing for the third time (files, site photos, orders) — **build it once.**

### `110014` — Procurement, company-wide
The same four sub-modules across every project, with a `Project` column and project filter, plus an
`All Requests` / `Draft Requests` toggle. **A scope switch over the same data layer, not a second
implementation.**

---

## Part K — Inventory & Vendors

### `110109` — Inventory Management → Warehouse/Site
Header `Inventory Management` · **`Add Warehouse`** (red) · **`🔍 Material Search`** (red outline) ·
a blue icon button. Tabs (each ⓘ): **`Warehouse/Site`** (red) · `Deliveries StockIn` ·
`Expense StockIn` · `Transaction History`.
Toggle **`Company Warehouses`** (red) | **`Project Warehouses`** — the split the owner named.
Right: Search · `Unarchived ▾`.

Columns `S.No · Warehouse · Goods Value · Last Stock In · Last Stock Out · Action`.
Some rows carry a **`❯` expander** (`1st Warehouse ❯`) — sub-locations / bins.

Sidebar confirms the procurement children exactly as the owner described:
**`Procurement` → `Requests · RFQ · Orders · Acceptance`**.

### `110101` — Inventory → Transaction History
Toggle `Stock In` | `Stock Out`. Columns `Id · Date · Warehouse/Site Name · Qty · Amount · Vendor ·
Recorded By · Action`. Ids are **`GRN-nnn`** — GRN auto-numbering, still an open VEYRA register item.

### `110215` — Vendors list
Header `Vendors` + a chip **`📋 Vendor Form ↗`** — a shareable external vendor-onboarding form.
Right: filter (red) · Search · **`+ New Vendor`** (red) · kebab.

Filter band: `Category ▾` · `Working Model ▾` · `Created ✕ +2 ▾` (multi-chip with overflow) ·
`Country ▾` · `State ▾` · `City ▾` · **`⟳ Reset`**.

Columns `Vendor Name · Phone no. · City · Category · Working Model · Status · Action`.
- `Category` overflows as `Carpentry Woodwork + 2`
- **`Working Model`**: `Labour + Material only` / `Material only` / `Labour only`
- **`Status`**: `Created` → `Verified` → `Onboarded`
- Pagination `Items per page: 25 · 1 – 25 of 68`

Sidebar: `Vendors` → **`My Vendors`** (active) · `Find Vendors` · `My Business Profile`.

**`Vendor Form ↗` is the competitor's version of VEYRA's planned OTP vendor portal** — a public
tokenised form. Security-critical; `HANDOFF-V3 §10` says build it yourself, never via fleet workers.

### `110227` — Vendor Data (detail)
Breadcrumb `‹ Vendor Data`. Info bar `ID: 10917 / Name: Chaganram / Location: Nagaur /
Category: False Ceiling POP Work + 1`.
Three module cards: **`Basic Details`** · **`Vendor Projects`** · **`Vendor Documents`**.

### `110234` — Vendor Projects
Header `‹ Vendor Projects` ❓ · Search · **`Assign Project`** (red primary) · kebab.
Info band (pink): `ID- 10917 / Chaganram / Location: Nagaur / Category: False Ceiling POP Work + 1`
· right four figures: `Estimated Expenses: 7,45,000` · `Total Payables: 7,45,000` ·
`Total Disbursed: 14,500` · `Payable Dues: 6,100`.

Columns `ID · Project Name · Client Name · Agreed Amount · Disbursed Amount · Total Payables ·
Payable Dues` — 10 projects (`Interior Company / Radhika Rana / 20,000 / 0 / 20,000 / 0` …).

**This is the owner's ask verbatim** — *"monitor payment history, outstanding balances, procurement
activities, and project associations."* It is only possible once vendors join projects by
`project_id`, which is another reason the spine (`PLAN-V4 §6`) comes first.

---

## Part L — HR & Admin

### `110318` — HR → Attendance → My Dashboard
Header `Attendance Dashboard` · **`Apply (Leave/WFH)`** (red primary).
Four tiles: **`23` Available/Paid Leaves** (green) | **Paid Leaves** `1 Granted` / `16 In process` |
**Unpaid Leaves** `0 Granted` / `0 In process` | **Work From Home** `8 Granted` / `29 In process`.
Tabs **`Attendance`** (red) · `Leaves` · `WFH` · `Holidays`. Right: filter · **`Export to Excel`**
(red). `FILTER BY: [This Month ▾] [All ▾]`.

Columns `Date · No. of Check-In · No. of Check-Out · Total Check-In Hours · Total Visit Count ·
Total Visit Hours · Time Difference`. Values `9 Hrs 0 Min`, `On-time`, and a `25-Jun-26` row with
`1 check-in / 0 check-out / 0 Hr 0 Min / -` (still open).

Sidebar `HR → Attendance` expanded → **`My Dashboard`** (active) · `Admin Report`.

VEYRA already has `work_sessions` (0023) and **hours derive from stamps, never stored** — that rule
holds here.

### `110339` — HR → Attendance → Admin Report
Header `Attendance Report` · centre toggle **`Approvals`** (dark) | `Report` ·
**`Apply Leave for employee`** (red primary).
`Today's status` tiles: `Total Employees 12` · `Total Checkin 1` · `On Leave 0` ·
`Work From Home 1`, each with a coloured circular icon.
Tabs **`Leave Requests`** (red) · `WFH Requests` · `Visit Requests`. `FILTER BY: [Select User ▾]`.
Columns `☐ · Name · Applied On · Start Date · End Date · Days · Leave Type · Reason · Action`
with per-row **`Approve`** (green outline) / **`Deny`** (red outline).

### `110349` — Admin → Users → Active
Header `Users` + `🗂 Purchased Licenses 20` · `👤 Active 12` · `👤 Unused 08` ·
**`✎ Add new user`** (red). Tabs **`Active`** (red) · `Role Management` · `Groups` · `Deactivated`.
Right: filter (red) · Search · kebab.

Columns `User Name (+ email) · DOB · Mobile No. · Role · Activity · Manager · Actions`.
- `Role` carries chips — **`Global 🌐`** and **`2FA 🛡`**
- Roles seen: `Sr Sales Development Executive · OnboardingSalesManager · OfficeBoy · Admin ·
  Telecalling Ex with Project Access · Business Development · DzyloSupportTeam · Finance ·
  Finance Manager · Marketing`
- `Activity` stacks `Last Login: 23-Jun-26, 05:28 PM` / `Last Active: 27-Jun-26, 05:04 PM`
- `Manager` is a real column (`Anita`, `Aditi`, `N/A`) — **a reporting hierarchy**

### `110403` — Admin → Users → Role Management
**`+ New Role`** (red primary). Search Roles · kebab.
**`👥 Custom Roles 12`** collapsible — columns `Role Name · Description · No of Users · Actions`
(👁 view · ✎ edit · 🗑 delete). Rows include `Temp Sales · Business Development ·
Marketing (only project access with edit milestone) · OfficeBoy · Revenue Partner Team L2 / L1 ·
Finance · Telecalling Ex with Project Access · Sales Manager · Sr Sales Development Executive ·
OnboardingSalesManager · DzyloSupportTeam (For Support Team)`.
Below: **`🌐 Global Roles 9`** with the note **"View only - global roles cannot be edited or
deleted"**.

**Two tiers: system-global (immutable) and tenant-custom (editable).** Copy that.

### `110413` / `110420` / `110429` — Admin → Edit Role
Header `‹ Edit Role` · **`Save`** (red).
`Role Name` (`OnboardingSalesManager`) · **`Inherit From ▾`** · `Description (0/155)` ·
`Permissions:` + `🔍 Search permissions`.

Permission groups, each a card with a coloured icon, an **`Enable All ☑`** and a collapse chevron,
containing a checkbox grid. **Permissions nest** — a parent capability with children beneath:

| Group | Capabilities |
|---|---|
| **Tasks** | Delete Task · All Task |
| **Inventory** | Allow add/update to Master Catalog Item List · Allow add/update warehouses · Company Warehouses · All Project Warehouses |
| **Procurement** | **Acceptance** · **RFQ** → (View RFQs, Add/Update RFQ) · **Requests** → (Approve/Reject Material Request, View Material Requests, ☐ Delete Material Request, Add/Update Material Request) · **Orders** → (Approve/Reject PO, View PO, Add/Update PO) |
| **Invoice** | *(Enable All only)* |
| **Reports** | Payment Report · Client Report · User Report · Labour Report · Lead Report · Financial Reports |
| **Vendors** | My Business Profile · Find Vendors · **My Vendors** → (☐ Delete Vendor, Add Vendor, Vendor Documents, Vendor Projects) |
| **Order Management** | Response To Quotation · My Orders |
| **Support & Training** | *(collapsed)* |

Note `Delete Material Request` and `Delete Vendor` are **unchecked** while their siblings are
checked — destructive capabilities are opt-in per role. Good default.

**This is the most valuable screen in Part L and VEYRA's version is currently decorative.**
`lib/permissions-model.ts` defines `(module, action, scope)` and the settings matrix writes rows —
**and nothing reads them.** A permission nothing enforces is worse than none: it promises a control
that does not exist. See `PLAN-V4 §11.3`.

---

## Part M — Accounting

### `110458` — Finance → Payments Dashboard
`one.dzylo.com/payments`. Header `Payments Dashboard` ❓ · **`✎ Import Payments`** (red outline) ·
chart icon · `⟳ Auto refreshes after 24 hours.`
`Summary Applied Filters:` **`Project Stage: Planning + 13`** (a chip showing the active filter).

Summary band: `111 Total Projects` · `19Cr INR Expected P&L` · `22Cr INR Project Value` ‖
**Inflow** group (`19Cr Total Receivables` · `2.5Cr Funds Received` · `3.6Cr Receivable Dues`) with
an **`Inflow`** label chip ‖ **Outflow** group (`2.3Cr Est Expenses` · `83L Disbursed` ·
`1.5Cr Payables`) with an **`Outflow`** chip.

The matrix: `Client Name · Project Name · Project Value · Funds Received · Total Receivables ·
Receivable Dues · Estimated Expenses · Disbursed Amount · Total Payables · Payables Dues ·
Cash Flow · Expected P&L`. **Cells are tinted** — receivables green, dues amber/red, negatives red.
Several cells carry a **➦ drill-through arrow** to the project's own Payments module.
Pagination `1 – 25 of 100`.

**This screen is `projectProfitability()` done properly.** VEYRA's version currently string-joins
`projects.name === payments.project_label` (`lib/data/reports.ts:288`) — rename a project and its
P&L silently empties. Phase 5.3 must land before this screen is built.

### `110521` — Finance → Petty Expenses → Petty Finance
Header `Petty Finance` · centre toggle **`All Expenses`** (dark) | `All Funds` ·
**`✉ Approvals`** (red outline).
Tabs **`Dashboard`** (red) · `My Expense` · `My Fund` — *exactly what the owner described:*
*"imagine I click a person's name… I get petty finance, my dashboard, my expense, my fund."*

Left rail: `‹ [Month: Jun ▾] [Year: 2026 ▾] ›` stepper · `🔍 Search User` ·
**Summary card** (pink) `Balance 34,66,51,632` (green) / `Expense 61,208` / `Fund 10,000` ·
then **per-user cards**, each with a balance chip and expense/fund lines —
`Aditi Pradhan 2,27,100 (Expense 0, Fund -10,000)` · `Siddhart Singh -50,43,991` ·
`Radhika Rana 33,650 (Expense 40,500, Fund 10,000)` · `Akshita 85,200`. Clicking one scopes the page.

Right: `📄 Summary (This Month)` · **`35Cr INR` Overdrawn Balance** (green) ·
**`- 61,208 INR` Total Expenses** (red) · **`10,000 INR` Total Funds** ·
☐ `View Reversed Transactions` · column chooser.
Ledger: `ID · User Name · Project Name · Transaction Date · Recorded Date · Amount · Category ·
Vendor`. Note `Deleted Project` appears as a project name — **soft-deleted projects must still
render in the ledger**, because the money is real even if the project is gone. Footer `⌄ Load More`.

### `110534` — Finance → Account Receivables
Header `Account Receivables` ❓ · filter (red) · `⟳ Auto refreshes after 24 hours.`
Four tiles, each with an icon:
- **`Overdue Payment`** — `39 Milestones | 3.9Cr INR` (amber-bordered, active)
- **`Milestone Overdue`** — `172 Milestones | 9.3Cr INR`
- **`Upcoming Milestone`** — `4 Milestones | 16L INR`
- **`Written Off Payments`** — `4 Milestones | 11L INR`

Columns `Project Name · Sales Owner · Milestone (%) · Due Date · Amount · Pending · Received ·
Action`. `Project Name` and `Amount` carry ↗ edit/drill icons; `Pending` carries a 📅 icon.
**`Amount` cells are green-tinted, `Pending` amber-tinted** — a genuine status use of colour.
Milestones read `Design Signoff (20%)` · `Hand Over (50%)` · `Final Payment (10%)` ·
`Before Site Execution Start (25%)` · `Advance on Project Start (20%)`.

**This reads directly off `contract_milestones` from `105238`.** Nothing is re-entered — the same
percentage schedule that was planned in Financial Planning becomes the receivables ledger here.
That is the interconnection the owner asked for: *"I want to keep the whole system interconnected."*

---

## Cross-cutting patterns worth building once

These recur across many frames. Build each **once**, reuse everywhere.

1. **Comment/activity thread with `@mention`** — appears on files (`104841`), site photos
   (`105527`), and orders (`105927`). One `entity_comments` model keyed by `(entity_type, entity_id)`
   with an `audience` of `internal|client`.
2. **`Client Visible` toggle** — milestones (`105010`), site photos (`105527`), labour (`105620`),
   and it drives the Progress Report filters (`104636`). One boolean, honoured everywhere.
3. **Planned vs Actual with a variance line** — milestones (`105010`), project header (`104529`),
   plan card (`105010`). Always three lines: planned, actual, variance in red.
4. **Segmented count bar + legend** — request items (`105729`), payment status (`105913`),
   inflow/outflow (`110458`). One component.
5. **`Chart | Table` toggle on every analytic** (`105716`) — never a chart without the numbers
   behind it.
6. **Tinted stat tiles carrying semantic colour** (`103904`, `104314`, `105729`, `110534`) — this
   is how the competitor's screens read as colourful without abusing red. See `PLAN-V4 §4`.
7. **Multi-value cells with `+n more` overflow** — vendors on an RFQ (`105818`), categories on a
   vendor (`110215`), stages on a request (`105729`).
8. **Two-tier vocabularies: system rows + tenant rows** — global vs custom roles (`110403`), and
   VEYRA's existing `is_system` pattern in `workspace_options` / `lead_statuses`. Consistent already.

---

## What the frames show that VEYRA should **not** copy

Evidence-backed, extending `DESIGN-DIRECTION §7`:

- **Red used for brand, primary, status, nav and alert simultaneously** — so alarm-red and brand-red
  are indistinguishable. VEYRA's closed list (§2 of DESIGN-DIRECTION) stands.
- **`351 days overdue` as plain grey text** (`104529`) and `300 Days Passed` buried in a cell
  (`105913`) — overdue needs red **plus an icon** and a next-action queue.
- **17 lead stages including `Sid_DemoDone`, `ToBeDeleted`, `Lead Duplicacy`** (`103904`) —
  hardcoded stages rot. VEYRA's 14 tenant-editable `lead_statuses` is the fix, already built.
- **`Quotations & Site Details (Old)` tile** (`104705`) — shipped tech debt, visible to users.
- **`Credits left : 467`** as a raw decrementing counter (`105800`) — opaque and resettable-looking.
  Replace with a ledger-backed Used/Allowed/Remaining meter.
- **97 of 112 projects with `No Project Owner`** (`104329`) rendered as a neutral row — that is an
  alert, not a statistic.
- **Two competing red buttons per view** (`110109`: `Add Warehouse` filled + `Material Search`
  outlined red) — one filled primary, everything else ghost/outline in black.
- **Status chips carry colour only, no icon** — fails colour-blind users and print.
