# PLAN V4 — VEYRA build plan (owner walkthrough, 27 Aug 2026)

**Status:** authoritative build plan. Three files govern:

| File | Role |
|---|---|
| `HANDOFF-V3.md` | how this codebase works — architecture, credentials, gates, hard rules |
| **`FRAME-REGISTER-V4.md`** | **the evidence** — one exhaustive entry per owner screenshot |
| `PLAN-V4.md` *(this file)* | **the instruction** — what to build, in what order |
| `competitor-research/DESIGN-DIRECTION.md` | the visual system; governs every screen |

**Source material.** 50 owner screenshots in `temp folder 1/`, cited by their `HHMMSS` timestamp.
**Before building any screen, read its entry in `FRAME-REGISTER-V4.md` and open the actual PNG.**
The register is a reading aid, not a replacement for the image.

**The owner's standing instruction:** do not copy this UI. Understand why every box is there, keep
the information, drop the density, add what is obviously missing.

> *"If you think something's better doing it your way, just do it. It's fine. These are the
> requirements we need — you understand why."*

---

## 0. Rules that do not bend

From `HANDOFF-V3.md` §8. Violating any of these is a rejected change.

1. **RLS is OFF by owner decision.** Never enable it, never write a policy.
   `lib/data/with-org.ts::withOrg()` is the only tenant guard. Every tenant table carries `org_id`,
   is registered in `lib/data/tables.ts`, and is reached only through `withOrg()`.
2. **No LLM ever produces a price, rate, cost, amount or quantity.** Models return *structure*
   (rooms → items → uom, or milestone names → day offsets). A deterministic engine plus tenant
   config supplies every number. `parseAiBoq` already strips price-shaped fields; every new AI
   surface must do the same and log to `ai_requests`.
3. **Migrations are additive and idempotent.** `org_id uuid not null references public.orgs(id) on
   delete cascade` on every tenant table. Next free number is **0026**.
4. **Indian market:** GST (HSN/SAC, place-of-supply, works-contract), Indian-FY numbering,
   ₹ Indian grouping (1,00,000), DPDP. **Ledgers are append-only** — a reversal is a new row and a
   filter, never a delete (`105403` does exactly this; copy it).
5. **Server-action files export only async functions.** Secret keys stay server-side.
6. **Do not push or deploy without the owner.** Local commits are fine.
7. **Red keeps its closed list.** §4 below adds colour *without* touching red.
8. **Do not delegate** the Scope Item spine (§6), the vendor portal, or anything touching
   `with-org.ts` to free-model fleet workers — `HANDOFF-V3 §10`. They drift exactly where it hurts.

### Explicitly OUT of scope (owner decision, this session)

- **Client/customer portal and client login.** *"Just keep it for the CRM as of now."*
- **Warranty / after-sales module.**
- **Telephony / dialer.** Calls are logged **manually** — and the competitor does the same
  (`105853` shows a bid entered *"by Shivani"* on the vendor's behalf).
- **WhatsApp API ingestion.** Lead capture stays manual.

**But:** build the `client_visible` flags specified below and honour them everywhere. They are not
speculative — they drive the Progress Report (`104636`), which is what actually reaches the client.
And model `leads.external_ref` now so a future feed attaches without a migration.

---

## 1. Phase 0 — Fix what is broken right now

Small, fast, unblocks the owner's next walkthrough. **Do this first.**

### 1.1 "View as" shows the wrong person — **confirmed bug, photographed**

**Frame `102359`.** Greeting reads `Good morning, Sneha`, role badge reads `Staff`, and the picker
still reads **`Aditi Pradhan — Founder`**.

**Reproduced live** at `localhost:3010`: switching Meghana → Rahul re-rendered the page correctly
(`Good morning, Rahul`, badge `Staff`, Tasks badge `1`) while the select kept the stale
`Meghana Rao — Projects manager`. A full page load then showed the correct value. So the switch
works; **the control lies about who you are**, which is precisely why it felt broken.

**Root cause:** `components/shell/view-as.tsx` renders an uncontrolled
`<select defaultValue={currentId}>`. React applies `defaultValue` on mount only; after the server
action sets the cookie and `revalidatePath("/", "layout")` re-renders, React reconciles the same DOM
node and the browser's dirty-value flag keeps the stale selection.

**Fix:** solve it together with 1.2 — a popover driven by server props on every render cannot go
stale. (A `key={currentId}` on the `<select>` would also work as a one-line stopgap.)

### 1.2 "View as" is too small

> *"That seems to be small to show the view as."*

Replace the 32px `<select>` with a real account control:
- Avatar circle (initials, deterministic tint from the member id) + name + role chip, ~40px tall.
- Click opens a popover (`components/ui/popover.tsx` already exists) grouped
  **Admin / Owner / Manager / Staff**, each row: avatar, name, designation, check on the active one.
- Keep the "temporary, auth returns later" comment block and the server-side validation against
  `listMembers()` — that validation is what makes this not a privilege-escalation path.

### 1.3 Dashboard tabs and tiles look cheap

**Frames `102323`, `102359`.** Five ~28px pills in a white band, all identical weight; four flat grey
tiles with no hierarchy and every value `0`.

> *"that buttons could be done way better. What is this bull that you are kept?"*

**Rebuild `TabBar` in `app/(app)/dashboard/workspace-ui.tsx` as a segmented control:**
- One rounded container on `--color-surface-sunken` with a hairline border.
- Active segment: white card on top, subtle shadow, ink-black label, red icon, 2px red underline.
  Inactive: secondary ink, no border, hover raises to white.
- Counts as tabular-figure badges; alerts red, everything else neutral.
- **Build it once — the lead detail, follow-ups, and every project module tab row in later phases
  import this same component.**

**And fix the tiles:** apply the `tone` prop from §4.2. `HOURS TODAY` is the hero (the thing you act
on); `OVERDUE` is `negative` when >0 and `positive`/neutral when 0. Four identical grey boxes give
the eye nowhere to land.

**Also:** frame `102211` shows the whole content area as skeletons with "Waiting for localhost…".
Wrap the panels in Suspense so tiles fill independently instead of blocking on
`getMyWorkspace()` + `getDashboard()`.

### 1.4 Follow-ups look single-only — **UI, not a data bug**

> *"the follow-ups is only one follow-up, you can't add an extra follow[-up]."*

**Verified false at the data layer.** `follow_ups` has **no** unique constraint on `lead_id`
(checked `pg_indexes`: only pkey + four non-unique indexes), and three demo leads already carry two
follow-ups each. The cause is one line — `app/(app)/leads/[id]/lead-detail.tsx:642`:

```tsx
<Disclosure label="New follow-up" defaultOpen={followUps.length === 0}>
```

The moment one follow-up exists the form **collapses**, so the screen reads "one and done".

**Fix now:** replace the disclosure with a persistent `+ Add follow-up` primary at the top-right of
the tab, opening a dialog. Open/History lists stay. Full rework in §5.1.

### 1.5 Keep the lead-detail tab layout

The owner questioned it, then settled it:

> *"why is it taking me to a damn page with details, follow-ups, call, activity and location? What?
> Never mind. Just keep keep with that way."*

**Do not restructure.** Details · Follow-ups · Call logs · Activity · Location stays.

### 1.6 Not a bug — do not chase it

The `vc-init` hydration warning and the red `1 Issue` badge in `102359` come from preview tooling.
`grep -rn "vc-init"` across `app lib components middleware.ts next.config.ts` returns nothing.
Leave it.

---

## 2. Phase 1 — Navigation: top-down grouped menus

**Frames:** `103749`, `103904`, `104314`, `110014`, `110109`, `110215`, `110318`, `110349`.

> *"do you see how execution … has projects, it has project insights and MB sheets. I need you to do
> it in that way … sales has leads, lead management, and follow-ups. You got to create these kind of
> top-down menus."*

Today `lib/nav.ts` is a flat list under static headings (`102211`). The competitor uses
**collapsible parent groups with children**, accordion-style. That is what makes 40 modules
navigable.

Rewrite `lib/nav.ts` to a two-level tree and `components/shell/sidenav.tsx` to render it:

```
Dashboard                                      (leaf)

SALES
  Lead Management            /leads
  Lead Insights              /leads/insights            [§5.2]
  Follow-ups                 /followups
  Quotations                 /quotations
  Communication              /communication

EXECUTION
  Projects                   /projects                  [§7.1]
  Project Insights           /projects/insights         [§9]
  MB Sheets                  /projects/mb-sheets        [ask first — §14.2]
  Site                       /site
  Production                 /production
  Design                     /design

OPERATIONS
  Procurement                /procurement               [§10.1]
    Requests · RFQ · Orders · Acceptance
  Inventory                  /inventory                 [§10.2]
  Vendors                    /vendors                   [§10.3]
  Items                      /items

ACCOUNTING
  Finance                    /finance                   [§12]
    Petty Expenses · Approvals · Payments · Account Receivables
  Billing                    /billing

HR
  Attendance                 /hr/attendance             [§11.1]
    My Dashboard · Admin Report

ADMIN
  Users & Roles              /settings/roles            [§11.2–11.3]
  Approvals                  /approvals
  Reports                    /reports
  Settings                   /settings
```

**Rules.** Accordion — one group open at a time; the group containing the active route auto-expands.
Active **child**: red text + `--color-red-tint` pill. Active **parent**: ink-black, **not** red —
red marks exactly one thing at a time. Expansion state in `localStorage`, never the DB. Rail
collapses to icons with hover flyouts. `soon: true` items render disabled with a muted chip rather
than being hidden — the shell should show the real product shape.

---

## 3. Phase 2 — Reusable components to build once

Eight patterns recur across the frames (`FRAME-REGISTER-V4.md` § *Cross-cutting patterns*). Build
each **once**, in `workspace-ui.tsx` or `components/ui/`, before the modules that consume them.

| Component | Frames | Notes |
|---|---|---|
| **SegmentedControl** | everywhere | §1.3. Tabs, `Listing/Analytics`, `Count/Value`, `Chart/Table` |
| **StatTile** with `tone` | `103904`, `104314`, `105729`, `110534` | §4.2 |
| **SegmentedCountBar** + legend | `105729`, `105913`, `110458` | e.g. `Pending (39) · RFQ Raised (11) · Ordered (127)` |
| **PlannedVsActual** cell | `105010`, `104529` | three lines: planned, actual, variance in red |
| **EntityCommentThread** | `104841`, `105527`, `105927` | `@mention`, `internal\|client`, versioned, pin coords |
| **ClientVisibleToggle** | `105010`, `105527`, `105620` | one boolean, honoured everywhere |
| **MultiValueCell** `+n more` | `105729`, `105818`, `110215` | overflow chip opens a popover |
| **DateRangeControl** | `103904`, `104314`, `110521` | `This month · Last 30d · This FY · All time · Custom` |

**The comment thread is the highest-leverage one.** It appears on files, site photos and orders. One
`entity_comments` model keyed by `(entity_type, entity_id)` with `audience`, `status`, `parent_id`,
and optional `page/x/y` serves all three. Do not write it three times.

---

## 4. Phase 3 — Design system: add colour without breaking red

> *"for some pages, add some colours or something. a little bit better… follow up pages, maybe."*
> *"I feel it feels a bit more cluttered. Keep it nice."*

The competitor's screens read as colourful because **tiles and charts are tinted**, not because red
is used more. Do the same.

### 4.1 Categorical data palette (charts and module identity only)

Add to `app/globals.css` `@theme`. **Never** for buttons, borders, nav, or text emphasis.

```css
--color-chart-1: #2563eb;  /* blue    */
--color-chart-2: #0d9488;  /* teal    */
--color-chart-3: #7c3aed;  /* violet  */
--color-chart-4: #c2410c;  /* orange  */
--color-chart-5: #4d7c0f;  /* olive   */
--color-chart-6: #be185d;  /* magenta */
```

Each needs a matching `-tint` at ~8% for fills. **Order is fixed** so the same series colour means
the same thing on every screen.

### 4.2 Tinted stat tiles

`103904` uses `Received` (blue) / `Converted` (green) / `Lost` (red) / `Junk` (amber);
`110534` tints `Amount` green and `Pending` amber. That is *semantic* tinting — the colour carries
the meaning, exactly like a status chip. Legitimate.

Extend `StatTile` with `tone: neutral | positive | warning | negative | info`. Tinted background,
coloured numeral, ink label. **`negative` stays rare** — it is the alert tone, not decoration.

### 4.3 Module identity colour

One chart-palette hue per top-level module, used **only** for its nav icon and its card in the
project Modules grid (`104705`). Never a red icon except for genuinely destructive actions.

### 4.4 What must not change

Primary buttons, active nav, destructive actions, genuine alerts, and the single hero metric stay
red. Nothing else does. **If a sixth use of red appears, it is wrong.**
And per `DESIGN-DIRECTION §8`: status is **never colour alone** — always a dot/icon plus a label.

---

## 5. Phase 4 — Lead Management completion

### 5.1 Follow-ups: many per lead, many assignees, outcome drives status

> *"follow-ups will never just be one single thing. You could have multiple follow-ups and based on
> those follow-ups, you got to change the status. You should be able to assign to multiple people."*

Three separate pieces:

**(a) Many per lead** — UI only, done in §1.4. No migration.

**(b) Many assignees** — `follow_ups.member_id` is a single uuid. **Migration 0026:**

```sql
create table if not exists public.follow_up_assignees (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  follow_up_id uuid not null references public.follow_ups(id) on delete cascade,
  member_id    uuid not null references public.org_members(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (follow_up_id, member_id)
);
```

Keep `follow_ups.member_id` as the **primary owner** so existing reads keep working — the same
pattern `lead_assignees` already uses against `leads.assigned_to`. Register in
`lib/data/tables.ts`.

**(c) Outcome drives lead status — the valuable half.** Today `outcome` is recorded and nothing
happens. **Migration 0026:**

```sql
create table if not exists public.followup_outcome_rules (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,
  outcome_slug       text not null,   -- matches workspace_options followup_outcome
  next_status        text,            -- lead_statuses.slug; null = no change
  auto_schedule_days int,             -- null = do not auto-schedule
  is_active          boolean not null default true,
  unique (org_id, outcome_slug)
);
```

On completing a follow-up:
- Look up the rule for the chosen outcome.
- If `next_status` is set, **propose** the transition in the completion dialog with it preselected —
  the user confirms. **Never silently mutate the lead.**
- If `auto_schedule_days` is set, prefill a follow-on follow-up dated that many days out. This is
  the direct answer to *"once you finish with the follow-up… you even had to do multiple
  follow-ups."*
- Write the transition to the lead activity feed either way.

Seed `is_system` rules the tenant edits on `/settings/workspace`:
`interested → negotiation (+3d)` · `callback_requested → contacted (+2d)` ·
`not_interested → not_interested` · `no_answer → no change (+1d)`.

**Engines** go in `lib/lead-management-model.ts` as pure functions with tests. **`missed` stays
derived from time**, never a stored status — that is the only way the number stays honest.

### 5.2 Lead Insights — new page `/leads/insights`

**Frame `103904`** — the owner named this one directly. Read its register entry in full.

Five **independent** cards. Do not merge them into one dashboard blob:

| Card | Contents | Controls |
|---|---|---|
| **Lead Conversion Analysis** | `Unassigned` count · `Received / Converted / Lost / Junk` tinted tiles (§4.2) · `Conversion Rate` with a bar **and the denominator** (`9 of 147 leads`) | `Selected range` \| `All time` |
| **Lead Count Trends** | area chart, leads created per day | `7d / 30d / 90d / custom` |
| **Lead Source Overview** | donut by `leads.source` + legend with `n (x.x%)` · CSV export | range |
| **Sales Funnel Value Stages** | horizontal bars, one per `lead_statuses` row, **sorted descending** | `Count` \| `Value` · `Sort by` · export |
| **Assigned / Unassigned split** | per-member counts, **unassigned surfaced first** | range |

**Hard requirements.**
- The funnel reads from **`lead_statuses`**, never a hardcoded list. The competitor's 17 stages
  include `Sid_DemoDone`, `ToBeDeleted` and `Lead Duplicacy` — that is what hardcoding produces.
  VEYRA's 14 tenant-editable statuses are already the fix; use them.
- **Always show the denominator** next to a percentage. `6.12%` alone is not trustworthy;
  `6.12% — 9 of 147 leads` is.
- One **global date-range control** at the page top (§3). Every card respects it unless its own
  toggle overrides.
- Aggregation in `lib/data/lead-management.ts` through `withOrg()`; pure maths in
  `lib/lead-management-model.ts` with tests.
- Charts are hand-rolled SVG or a tiny helper. **Do not add a charting dependency without asking.**
  Use the §4.1 palette.
- Every card gets a designed empty state.

### 5.3 Lead capture stays manual

`leads.source` is already an open vocabulary in `workspace_options`. Add
`leads.external_ref text` (nullable) in migration 0026 so a future feed attaches an id without a
migration. Ship no integration.

---

## 6. Phase 5 — Replace the Pipeline board

> *"go to the pipeline, dude, it looks mad at me… it looks absolute garbage… you cannot put a kanban
> board… change it."*

`app/(app)/pipeline/page.tsx` is a plain Kanban: a column per stage, a card per lead showing only
name and value. With 14 statuses that is a horizontal-scroll wall carrying almost no information.

### What replaces it

**A funnel header over a grouped table** — same data, an order of magnitude more legible.

1. **Funnel strip.** One horizontal bar per `lead_statuses` row, width by count or value (toggle),
   with count + ₹ + % of total. Clicking a bar filters the table. *This is the same component as the
   Lead Insights funnel card — build it once (§3).*
2. **Grouped table.** Rows grouped by status, collapsible per group: client · project name · budget
   band · owner avatar · **next follow-up** (overdue in red with an icon) · **days in stage** ·
   last activity · value. Sticky header, zebra, right-aligned tabular numerals.
3. **Inline stage change** using the same status dropdown the leads list already has.
4. **`Days in stage`** is the number the Kanban could never show and the one that finds stuck deals.
   Derive from the lead activity feed. `>30d` amber, `>60d` red.

Keep drag-and-drop **out**. It was the weakest part of the old board and is not what was asked for.

### 6.1 Retire `pipeline_stages`

`lead_statuses` is already the single source of truth for the board (`lib/data/pipeline.ts →
boardColumns`), but `pipeline_stages` still exists and `/pipeline/stages` still edits that **dead
table** — so a tenant can "configure" stages and see nothing change. Point `/pipeline/stages` at
`lead_statuses`, or delete the route and link to `/settings/workspace`. **Do not leave two editors.**

---

## 7. Phase 6 — The spine: `scope_items` and real project FKs

> **This phase blocks Phases 7–12. Do it before any project module.**

Raised in `HANDOFF-V3 §9` and deferred by the owner. Every screen in Phases 7–12 joins projects to
money, materials and labour. Building them on the current free-text join would multiply the damage
across a dozen new tables.

### 7.1 The problem, stated precisely

- `PLAN §1.1`'s **Scope Item** — *"the architectural heart"*, *"no module gets its own private
  line-item table"* — was never built. `grep -r scope_item` across all 25 migrations returns **zero**.
  Six private line-item tables exist instead: `quotation_lines`, `material_request_items`,
  `rfq_items`, `po_lines`, `bom_lines`, `cutlist_panels`. Nothing links a quoted line to the material
  requested for it, the PO that bought it, or the panel that was cut.
- **Eleven tables across eight migrations link to projects by a free-text `project_label`**, with
  comments claiming *"no projects table in this workspace"* — but `projects` has existed since
  migration **0007**. Parallel workers each invented the same false assumption in isolation.
- The damage is at `lib/data/reports.ts:288` — `projectProfitability()` joins
  `projects.name === payments.project_label`. **A string-equality join produces the flagship
  per-project P&L.** Rename a project and its P&L silently empties.

**`105024` is what the spine looks like when it exists:** five scope groups (`Design Team`,
`Execution Team`, `Post Handover Team`, `Sample`, `Designer Scope`) whose milestone counts sum
exactly to the project total (14+12+4+28+14 = 72). And `104529`'s Summary joins financials,
milestones and procurement on one project — impossible on a string.

### 7.2 Migration 0027 — `scope_items`

```sql
create table if not exists public.scope_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  quotation_id  uuid references public.quotations(id) on delete set null,
  parent_id     uuid references public.scope_items(id) on delete cascade,  -- room → item
  code          text,
  name          text not null,
  room          text,
  uom           text,
  qty           numeric(14,3),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
```

Then a **nullable** `scope_item_id uuid references public.scope_items(id)` on each of the six line
tables. Nullable is deliberate — nothing breaks on day one and the backfill can be staged.

**Backfill** from `quotation_lines` (the richest source): one `scope_items` row per quotation line,
grouped by section into room parents, then set `quotation_lines.scope_item_id`.

### 7.3 Migration 0028 — real `project_id` FKs

Add `project_id uuid references public.projects(id) on delete set null` to the eleven
`project_label` tables. **Keep `project_label`** as a display fallback for rows that never resolve.
Write one explicit, re-runnable backfill matching on trimmed case-insensitive name, and **report how
many rows failed to match** rather than silently dropping them.

Then move `projectProfitability()` and `financeSummary()` onto `project_id`.

### 7.4 The proof

Wire **approved quotation → draft Material Request** (register `PROC-MR-004`). MR lines come from the
quotation's `scope_items`, not from re-typing.

> If that button is more than ~40 lines, the spine is not right. **Stop and fix the spine.**

---

## 8. Phase 7 — Projects: list, summary, modules

### 8.1 Project list — `/projects` — **frame `104420`**

Columns: ☐ · ID · Client Name · Project Name · **Stage** (inline pill dropdown, colour per stage) ·
Assigned To (avatar stack) · **Milestones** · Tentative Start Date · Hand-over Date.

**The `Milestones` cell is the single best idea in the competitor's product — build it.**
Column header carries a sub-legend `● Last Completed  ● Upcoming`. Each cell:

```
● 17/72   [====----]  47.51%  |  100% est
✓ ModularWoodwork Ordering            18 Jun
→ Installation of Modular Woodw…       5 Aug
```

Count, actual % against estimated %, last thing finished, next thing due — one cell. **Nobody has to
open a project to learn whether it is healthy.**

`Hand-over Date` shows the date **and** `Running late by 65 days` in red with an alert icon —
`DESIGN-DIRECTION §7`: red text alone is too easy to miss.

Header: project count · stage filter (multi-chip with `+n` overflow) · other filters · search ·
column chooser · sort · **`+ New Project`** as the single red primary.

**Project creation is manual.** *"you want to create a new project once a client is fully done…
create manually or something."* Keep the existing `Promote to project` path from a won lead **and**
add a manual `+ New Project` form. Both write a real `leads.project_id` FK.

### 8.2 Project detail — `/projects/[id]` — **frames `104529`, `104705`**

Two page tabs: **Summary** and **Modules**. The owner on Summary: *"the very most important part of
the UI."*

**Header band:** Client · Project · Owner · Start → Hand-over · **`Actual: 47.51%`** (red bar) vs
**`Est: 100%`** (blue bar) · **`View Report`**.
When actual trails estimate, show `Behind schedule, needs attention (▼52.49%)` (`104705`).

**Summary — left column (narrow):**
- **Communication** — unread count, links to the project thread
- **Site Progress (n)** — one large photo + thumbnail strip + `Last uploaded on …`
- **Design Documents (n)** — recent files as dated links
- **Latest Updates** — the activity feed, initials-prefixed:
  `[RR] Updated the stage to Planning (24-Mar-2026)`

**Summary — right column (wide):**
- **Project Financials** with a 👁 hide toggle and a `Project Value` chip. Five derived figures —
  Fund · Total Disbursed · Receivable Dues · Total Payables · Payable Dues — then **two tinted hero
  tiles: `Cash Flow` and `P&L`**. Every one derived, never stored.
- **Milestones / Tasks** toggle — Milestone · Progress · Days Left · Assignee · Last Update.
  **Fix the competitor's mistake:** `351 days overdue` renders as plain grey text in `104529`.
  In VEYRA it is red **with an icon**, and overdue milestones also surface in a next-action queue.
- **Procurement** three-way toggle — **PO Requests · Requests · Delivery Acceptance** —
  Order ID · Order Name · Vendor · Amount · Delivery State · Payment.

**Modules tab** (`104705`): a card grid, each with its identity colour (§4.3), plus the Est/Actual
band and a `View Progress Report` card. Build:

`Details · Designs & Documents · Site Progress Uploads · Project Planning · Financial Planning ·
Project Payments · Labour Report · Procurement · MB Sheet · Quotation`

**Do not build** Inspirations, Virtual Tour, Warranty, Communication-as-module (§0 out of scope) —
render as disabled "Soon" cards or omit. **And never ship an `(Old)` tile** — `104705` shows
`Quotations & Site Details (Old)`, which is visible tech debt (`DESIGN-DIRECTION §7`).

### 8.3 Progress Report — `/projects/[id]/report` — **frame `104636`**

A **composable** export, not a fixed PDF. Left rail of checkbox groups; right pane renders live:

- **Project Details:** Project Name · Start Date · Target Handover · Actual Progress · Total Days
- **Milestones:** `No Milestone` / **`All Milestones`** / **`Client Visible Only`**
- **Charts & Graphs:** `Gantt` · `Labour Chart`
- **Site Pictures:** `No Site Progress` / **`All Site Progress`** / **`Client Visible Only`**

Preview: letterhead, then four boxes `Project Name · Project Timeline · Total Duration · Progress`,
then the Milestones table (`Milestone · Progress · Date · Update`).

Export via the existing `jspdf` + `jspdf-autotable` (`lib/quotations-pdf.ts` is the precedent).
**The `Client Visible Only` options are why the `client_visible` flags matter** even with no client
portal — this report is what reaches the client.

---

## 9. Phase 8 — The project modules

Build in this order. Each is `/projects/[id]/<module>` sharing one module tab bar (§3).

### 9.1 Designs & Documents — **frames `104742`, `104841`**

The owner spent the most words here.

**File browser (`104742`).**
- **Folders (n)** — collapsible grid of chips (name, date, kebab). **Tenant-created**, not a fixed
  taxonomy (`drawingsv1`, `2d`, `quotation`, `Graphic-designs`, `CAD-DESIGNS`, `LabourReport`, …).
- **Files (n)** — `S.No · Name (+size, type icon) · 💬 · Version · Internal Status · Client Approval
  · Description · Uploaded (avatar + timestamp)`.
- **`Storage Usage`** meter in the header. **`+ Add`** the single red primary.

**The critical structural insight:** `Internal Status` (`Draft` / `Approved`) and `Client Approval`
(`Revision Requested` / `No Action Taken` / `Not shared with client` / `Approved`) are **two
independent lifecycles on the same file**. Version is **per-file with an inline `⊕` to add one**.
Comment count *and pending count* appear in the list, not just the viewer.

**File viewer (`104841`)** — the part the owner detailed:
- Full-pane render, `View` / `Review` toggle.
- Right rail tabs **`Comment` · `Communication` · `Audits`**.
- **`Ver 1 ▾` selector — comments are scoped to a version.**
- **`INTERNAL` / `CLIENT` segmented switch — two separate threads on one file.**
- Filter chips `All · Accepted · Not Required · Pending`.
- Each comment: pin icon, status chip, numbered body, author + date, `Reply`, `Reopen`.
- **`Type a message` composer at the bottom** — the owner asked for exactly this:
  *"this should be a message thing… the client has asked us to add TV."*
- **Numbered pin markers on the document itself**, anchored to coordinates. Model `page`, `x`, `y`
  even if the first release renders pins centred.

The owner also asked for *"different versions of the layout"* — that is what the `⊕` on Version and
the version-scoped comment thread deliver together.

**Migration 0029:** `project_folders`, `project_files`, `project_file_versions`, and
`entity_comments` (the shared model from §3 — `entity_type`, `entity_id`, `audience
internal|client`, `status`, `parent_id`, `version_id`, `page`, `x`, `y`).

**Storage:** Supabase Storage bucket per org, path `org_id/project_id/…`. **Signed URLs only,
generated server-side. Never expose the secret key to the browser.**

### 9.2 Project Planning — **frames `105010`, `105024`**

Tabs **Milestone · Gantt Chart · Tasks**.

**Milestones Overview:** ring tiles `Total / In Progress / Completed / Not Started`.
**Dates card:** Planned vs Actual start, Planned vs Actual handover.
**Progress card:** `Estimated 100%` vs `Actual 47.51%` with
`Behind schedule, needs attention (▼52.49%)`.

**Scope groups** — `scope_items` from §7 surfacing in the UI. Each a collapsible band:
name · `n Milestones` · `n Completed` · progress bar + % · `＋` (Add Milestone) · **`SmartPlan`** ·
`•••` · chevron. **`Add Scope`** top-right.

**Milestone table:** `⠿ · ☐ · Milestone · Progress (inline % input) · Status (inline dropdown) ·
Timeline · Assignee · Client Visible toggle · Last Update (+ Add remark) · Dependencies`.

**The `Timeline` cell is three stacked lines — copy this exactly:**

```
1-Jul'25  →  30-Aug'25      planned
12-Mar'26 →  13-Jun'26      actual
Completed 287 days late      variance, red on red tint
```

When actual dates are unrecorded, show the placeholder `Actual Start → Actual End` (`105010` does).

**Task templates — the owner's specific request:**

> *"keep some normal tasks, like for the execution team you can keep project kickoff, site
> measurements, understanding line design, final design… so they can just select it as well. They
> don't need to always create."*

**Migration 0032:** `milestone_templates`, seeded per scope group as `is_system` rows the tenant
edits. Seed from names visible across `105010`/`104636`:
- *Design Team:* Site Measurements · Plan Layout Creation · 3D Modelling · 2D Detailed Drawings ·
  Final Design Signoff
- *Execution Team:* Project Kickoff · Site Marking · False Ceiling Channel Work · Electrical
  Conduiting Work · POP Punning Work · Panelling Work · ModularWoodwork Ordering · Installation of
  Modular Work Cabinets · Paint Work · Cleaning
- *Post Handover:* Snag List · Rectification · Handover Signoff

`Add Milestone` offers **"pick from templates"** or **"write your own"**.

**SmartPlan (AI):**

> *"sometimes they might need to put some documents in there to create the plan… there's just
> something about a smart plan, add that feature."*

Reuse `lib/ai/provider.ts`. Input: project type, scope group, target handover, optional attachments
(floor plan, BOQ). Output: **an ordered list of milestone names with relative day offsets and
dependencies — and nothing else.** No costs, no rates, no quantities (§0.2). Dates computed
deterministically from the handover date and the offsets. Log to `ai_requests`. Present as a
**reviewable draft** the user accepts or edits before anything is written.

### 9.3 Financial Planning — **frames `105238`, `105325`**

Tabs **Inflow · Outflow · Documents**. Header band: Project Value · Funds · Total Receivables ·
Receivable Dues · **`Audit`**.

**Inflow — contracts with the client.** `+ Contract` creates a named contract with a `Source`
(Client) and an Amount. Each holds a payment-milestone table:
`S.No · Name · Percentage · Amount · Tentative Due · Work Done · Actual Due · Actions`.

**Three mechanics to copy exactly:**
1. **Percentage and Amount are two-way bound** — edit either, the other recomputes. A pure engine
   function with tests. No LLM anywhere near it.
2. **The Total must be 100%.** Validate and refuse to save otherwise.
3. **`Actual Due` only materialises when `Work Done` is ticked.** Ticking work-done is what makes a
   milestone billable — that is the entire receivables engine, and it is what `110534` reads.

Per-contract: Funds Received · Total Receivables · Receivables Due (negatives red).

**Outflow — contracts with vendors.** `Add Vendor` attaches a vendor with **one or more
Categories**. Table: `Vendor Name · Category · Agreed Amount · Contracts · Disbursed Amount · Total
Payables · Payable Dues · Action`. Header: Estimated Expenses · Total Payables · Disbursed · Payable
Dues. **Keep an `Unlisted Vendor / Miscellaneous` row** — ad-hoc spend needs a home (`105325`).

**Documents** — per-vendor, per-contract store. *"you get to store your documents per vendor, per
contract."* Reuse the §9.1 file model.

**Migration 0030:** `project_contracts` (`party` = `client|vendor`, `vendor_id`),
`contract_milestones`, `contract_documents`.

### 9.4 Project Payments — **frames `105403`, `105429`, `105444`**

**Financial Summary** with a `Hide` toggle: Funds Received · Disbursed · Receivable Dues · Total
Payables · Payables Dues, then **`Cash Flow`** and **`Expected P&L`** as tinted hero tiles.

Tabs **Expenses · Funds**, each with a **`Listing` / `Analytics`** toggle. Both must exist and both
must be documented — the owner was explicit.

**Expenses listing:** `ID · Transaction Date · Recorded Date · Amount (red) · Expense By · Vendor ·
Contract · Expense Source · Expense Type · Expense Category · Remarks`.
**Keep `Transaction Date` and `Recorded Date` as separate columns** — when it happened vs when it
was entered. **`View Reversed Transactions` is a checkbox filter, not a delete** — ledgers are
append-only (§0.4).

**`+ Add Expense`** (`105429`): `Expense Date* · Amount* · Source* · Expense Type · Project* ·
Vendor (+ inline create) · Select Contract · Category · Upload Receipt · ☐ Stock-In Request ·
Remarks (0/250)`.

**`Stock-In Request` wires to inventory** (§10.2 `Expense StockIn`).

**`+ Add Fund`** (`105444`): `Collection Date* · Collection Mode* · Collected By* · Amount* ·
Contract* · Attachment · Remarks`. Funds render **green with a leading `+`**.

**Preserve the asymmetry:** `Contract` is **required for a Fund, optional for an Expense**. Money in
must be against a client contract; money out may be miscellaneous.

**Analytics** for both: by category, by vendor, by month, by contract. §4.1 palette,
`Chart | Table` toggle on each.

### 9.5 Site Progress Uploads — **frame `105527`**

Date-grouped photo grid. Tabs `All · Client Visible · Client Not Visible`. Card: image,
`Uploaded by`, and on hover expand / delete / **`Client Chat`** (per-photo thread — the §3 comment
component again). `+ Add Progress` primary, `Actions` menu for bulk.

Store and honour `client_visible`; render the three tabs; **ship no client-facing route** (§0).
The flag feeds the Progress Report (§8.3).

### 9.6 Labour Report — **frames `105620`, `105638`, `105659`, `105706`, `105716`**

Header: Total Labour Count · Total Skilled · Total Unskilled · Total Coordinator (must reconcile:
34+25+12 = 71 in `105620`). `Client Visible` toggle. **`+ Attendance`** primary.

**Overview table:** `Date · Vendor · Contracts · Category · Skilled · Unskilled · Coordinator ·
Total · Remark · Attachment · Action`. `No Vendor` is a valid value.

**Labour Attendance dialog (`105638`)** — the owner flagged this as tricky and he is right:
`Date` · **`Categories`** (multi, searchable) · **`Vendors`** (multi, searchable, optional) ·
**`Contracts`** · three steppers **`Skilled Labour` / `Unskilled Labour` / `Coordinator`** ·
`Attachment` · `Remarks` · `Submit`.

**The category vocabulary must live in `workspace_options`** so a tenant renames or extends it —
that is what makes labour segregable, which is exactly what was asked. Seed from `105659`:
`Carpentry Woodwork · False Ceiling POP Work · Civil Masonry Work · Electrical Work · Plumbing Work
· MS & Fabrication Works · Marble & Tile Works · Paint Works · Cleaning`.

**Analytics (`105716`):** Daily Labour Trend (area, hover readout) · Labour by Vendor (donut) ·
Labour by Category (donut) · Labour by Contract (donut). **Each with a `Chart | Table` toggle** —
never a chart without the numbers behind it.

**Migration 0031:** `labour_entries`, `labour_entry_categories`, `labour_entry_vendors`. Counts are
integers; **totals always derived, never stored**.

### 9.7 Project Procurement — **frames `105729`, `105800`, `105818`, `105853`, `105913`, `105927`**

Sub-tabs **Request · RFQs · Orders · Deliveries · Inventory**. The owner named four as
non-negotiable: *"you got RFQs, you got Orders, you got Acceptance… you have got to keep those four
things."*

**Requests (`105729`).** Tiles: Total Requests · In Progress · Due Delivery Date ·
**Total items with a segmented stage bar** (`Pending / RFQ Raised / Ordered`).
Table: `ID · Name · Type · Expected Delivery · Created Date · Stage · Created By`.

> **⚠ The most important schema change in this phase.** `Stage` is **multi-valued per request** —
> one cell stacks `Ordered (4) · Pending (8) · In Stock (4)`. **A request has no single status; its
> items split across stages.** VEYRA's current single-status material-request model cannot express
> this. Move status to the **line item** and derive the request's stage breakdown by aggregation.
> Vocabulary: `Pending · Order Requested · RFQ Raised · Ordered · In Stock`.

**New Request (`105800`):** `Request Type* · Title* · Project* · Expected Delivery date* ·
Add Attachment · ☐ Read by AI`. Note **`Next`, not `Create`** — a two-step wizard (details → line
items). The AI parse returns **item names, quantities and UOMs only, never prices** (§0.2).
**Replace the raw `Credits left : 467` counter** with a ledger-backed Used/Allowed/Remaining meter
(`DESIGN-DIRECTION §7`).

**RFQs (`105818`):** `ID · Name · Vendors (+n more) · Expected Delivery · Item Count · Created Date ·
Status · Action`. `Generate RFQ` primary.

**RFQ detail (`105853`):** tabs `Vendor List` · `Item Bidding Comparison`. Info block includes
**`Place of Supply`** (GST-critical, already modelled in VEYRA). Vendor table:
`Vendor Name · Delivery Date · Response Status · Last Response Date · Total Biding · Vendor Remark`.
Winning row tinted green.

**Two findings to build in.** (1) Response status carries a **version suffix `(v1)`** — RFQ rounds
are versioned. (2) The *cheaper* bid was **not** the one ordered — **award is a judgement call and
must capture a reason**, never lowest-price-wins. (3) `Submitted(v1) by Shivani` — staff can enter a
bid on the vendor's behalf, which means the vendor portal is optional, not required.

**Orders (`105913`):** tiles Total Orders · Accepted Orders · Partial Delivered ·
**Payment Status segmented bar**. Toggle `Approved Orders / Approval Pending (n) / Ordered Items`.
Table: `Order Name (+ sub-label Purchase Order | Work Order) · Vendor · Purchase Order (link + value)
· Payment State · Created by/date · Delivery date (+ N Days Left / N Days Passed) · Order State ·
Actions`. **Work Orders and Purchase Orders share this table** — `DZY-WO-8` alongside `DZY-PO-299`.

**Order detail (`105927`):**
- Left: the **rendered PO document** — letterhead, PO number, **both GSTINs**, Shipping Address,
  Vendor Billing Address, line table
  **`S.No · Description · HSN · Qty · UOM · Rate · % Disc · % Tax · Total`**, then
  `Base Amount / Total Tax Amount / Total Amount`, then **`Payment Terms`** on page 2.
- Right: **`Order State`** dropdown · **`Payment Status`** dropdown · **activity feed**
  (`Order requested for 1 item` → `approved` → `state updated to Order Created`, each with author
  and timestamp) · a **`Type @ to mention someone`** composer (§3, third appearance).

**This document is GST-correct** and maps straight onto VEYRA's existing GST work.

**Much of this already exists** (`rfq`, `purchase_orders`, `po_lines`, migrations 0012–0013).
**Do not rebuild it.** Re-point it at `project_id` (§7.3) and `scope_items` (§7.2), then add what is
missing: the per-line stage model, the activity feed, and the order detail pane.

---

## 10. Phase 9 — Company-level Procurement, Inventory, Vendors

### 10.1 Procurement, company-wide — **frame `110014`**

The same four sub-modules — **Requests · RFQ · Orders · Acceptance** — across every project, with a
`Project` column and filter, plus `All Requests` / `Draft Requests`. **A scope switch over the same
data layer, not a second implementation.**

### 10.2 Inventory — **frames `110101`, `110109`**

Tabs **Warehouse/Site · Deliveries StockIn · Expense StockIn · Transaction History**.

**Warehouse/Site:** **`Company Warehouses` / `Project Warehouses`** toggle — the split the owner
named. Table: `S.No · Warehouse · Goods Value · Last Stock In · Last Stock Out · Action`. Some rows
expand to **sub-locations / bins**. `Add Warehouse` primary, `Material Search` secondary,
`Unarchived` filter.

**Transaction History:** `Stock In` / `Stock Out` toggle. `Id (GRN-nnn) · Date · Warehouse/Site ·
Qty · Amount · Vendor · Recorded By`.

**`Expense StockIn`** is the landing point for the `Stock-In Request` checkbox from §9.4.

Migration 0014 already has inventory. **Migration 0033** adds warehouse `kind` (`company|project`),
`project_id` FK, and **GRN auto-numbering** (an open register item).

### 10.3 Vendors — **frames `110146`, `110215`, `110227`, `110234`**

**List (`110215`):** `Vendor Name · Phone no. · City · Category (+n) · Working Model · Status ·
Action`. Filters: `Category · Working Model · Created · Country · State · City · Reset`.
Sub-nav **`My Vendors` · `Find Vendors` · `My Business Profile`**.

- **`Working Model`**: `Labour + Material only` / `Material only` / `Labour only`
- **`Status`**: `Created` → `Verified` → `Onboarded`

**Detail (`110227`):** three cards — **`Basic Details` · `Vendor Projects` · `Vendor Documents`**.

**Vendor Projects (`110234`)** — the owner's ask verbatim (*"monitor payment history, outstanding
balances, procurement activities, and project associations"*): header figures Estimated Expenses ·
Total Payables · Total Disbursed · Payable Dues, then `ID · Project Name · Client Name · Agreed
Amount · Disbursed Amount · Total Payables · Payable Dues`. `Assign Project` primary.

**This is only possible once vendors join projects by `project_id`** — another reason §7 comes first.

**Note `Vendor Form ↗`** in `110215` — a public tokenised vendor-onboarding form, the competitor's
version of VEYRA's planned OTP vendor portal. Security-critical: **build it yourself, never via
fleet workers** (`HANDOFF-V3 §10`). Defer until the owner asks.

---

## 11. Phase 10 — HR and Admin

The owner: *"the manager side might be same as the staff, but here's the thing — they get to see the
HR."* So HR is **role-gated**, not a separate dashboard. This does **not** unpark
`TEAM_VIEW_ENABLED` — that stays `false` until the owner specifies the manager dashboard (§14.1).

### 11.1 Attendance — **frames `110318`, `110339`**

**My Dashboard (`110318`):** tiles `Available/Paid Leaves` · `Paid Leaves` (Granted / In process) ·
`Unpaid Leaves` · `Work From Home` (Granted / In process). Tabs **Attendance · Leaves · WFH ·
Holidays**. Filter by month + type. Table: `Date · No. of Check-In · No. of Check-Out · Total
Check-In Hours · Total Visit Count · Total Visit Hours · Time Difference (On-time / late)`.
`Apply (Leave/WFH)` primary, `Export to Excel` secondary.

**Admin Report (`110339`):** `Approvals` / `Report` toggle. Today's status tiles: Total Employees ·
Total Checkin · On Leave · Work From Home. Tabs **Leave Requests · WFH Requests · Visit Requests**.
Table with per-row **`Approve` / `Deny`**. `Apply Leave for employee` primary.

`work_sessions`, `leave_requests`, `field_visits` already exist (0023). **Hours stay derived from
stamps, never stored** — that rule holds. **Migration 0034** adds `wfh_requests` and `holidays`.

### 11.2 Users — **frame `110349`**

Tabs **Active · Role Management · Groups · Deactivated**. Header: Purchased Licenses · Active ·
Unused · `Add new user`. Table: `User Name (+ email) · DOB · Mobile · Role (+ Global / 2FA chips) ·
Activity (Last Login / Last Active) · Manager · Actions`.

**`Manager` is a real column** — a reporting hierarchy. `org_members.manager_id` already exists;
surface it.

### 11.3 Roles and permissions — **frames `110403`, `110413`, `110420`, `110429`**

> **The most valuable thing in Phase 10, and VEYRA's version is currently decorative.**

`lib/permissions-model.ts` defines `(module, action, scope)` and the settings matrix writes rows —
**and nothing reads them.** The owner: *"This is very important. This is how they manage
everything."* **A permission nothing enforces is worse than none: it promises a control that does
not exist.**

**Role Management (`110403`):** two tiers — **`Custom Roles`** (editable, with user counts,
view/edit/delete) and **`Global Roles`** (*"View only - global roles cannot be edited or deleted"*).
`+ New Role` primary. Mirrors VEYRA's existing `is_system` pattern.

**Edit Role (`110413`–`110429`):** `Role Name` · **`Inherit From ▾`** (role inheritance — build it,
it collapses the permission explosion) · `Description` · `🔍 Search permissions`.

Permission groups, each with **`Enable All`** and a collapse chevron. **Permissions nest** — a parent
capability with children:

| Group | Capabilities |
|---|---|
| **Tasks** | Delete Task · All Task |
| **Inventory** | Master Catalog add/update · Warehouses add/update · Company Warehouses · All Project Warehouses |
| **Procurement** | **Acceptance** · **RFQ** → (View, Add/Update) · **Requests** → (Approve/Reject MR, View MR, Delete MR, Add/Update MR) · **Orders** → (Approve/Reject PO, View PO, Add/Update PO) |
| **Invoice** | *(enable-all only)* |
| **Reports** | Payment · Client · User · Labour · Lead · Financial |
| **Vendors** | My Business Profile · Find Vendors · **My Vendors** → (Delete, Add, Documents, Projects) |
| **Order Management** | Response To Quotation · My Orders |
| **+ VEYRA's own** | Leads · Projects · Finance · HR |

Note that `Delete Material Request` and `Delete Vendor` are **unchecked while their siblings are
checked** — destructive capabilities are opt-in per role. Good default; copy it.

**Then actually enforce it.** Minimum bar:
- A single server-side `can(ctx, "procurement.po.approve")` helper, called in **every** server action.
- Route-level guards that render a **designed permission-limited state**, not a broken layout
  (`DESIGN-DIRECTION §6`).
- **Field-level visibility** for the register's P1 case — *"a supervisor sees the BOQ without cost
  columns."* `quotation_settings.show_cost_column` is the first hook; the **`Financials 👁` toggle**
  on Project Insights (`104314`) and the Project Financials 👁 on the Summary (`104529`) are the
  second and third.

### 11.4 Also still missing

- **Audit log.** Three register findings call for one and it does not exist. The `Audits` tab on the
  file viewer (`104841`) and the `Audit` button on Financial Planning (`105238`) both need it.
  **Migration 0035:** `audit_events` (org, actor, entity, entity_id, action, before, after, at).
- **Metering** is wired to 3 create paths (quotations, boqs, AI); ~20 others are free.

---

## 12. Phase 11 — Accounting and Finance

**Frames:** `110458`, `110521`, `110534`.

> *"I want to keep the whole system interconnected… got to make it simple, but keep it
> interconnected."*

Sub-modules **Petty Expenses · Approvals · Payments · Account Receivables**.

### 12.1 Payments Dashboard — **`110458`**

Summary band with the **applied-filter chip** visible (`Project Stage: Planning + 13`):
Total Projects · Expected P&L · Project Value ‖ **Inflow** group (Total Receivables · Funds Received
· Receivable Dues) ‖ **Outflow** group (Est Expenses · Disbursed · Payables).

Then the per-project matrix: `Client Name · Project Name · Project Value · Funds Received · Total
Receivables · Receivable Dues · Estimated Expenses · Disbursed Amount · Total Payables · Payables
Dues · Cash Flow · Expected P&L`. Cells tinted (receivables green, dues amber, negatives red), with
**drill-through arrows** to each project's own Payments module.

**This screen is `projectProfitability()` done properly — and it is exactly why §7.3 must land
first.** Today it string-joins `projects.name === payments.project_label`.

### 12.2 Petty Finance — **`110521`**

`All Expenses` / `All Funds` toggle. Tabs **Dashboard · My Expense · My Fund** — the owner:
*"imagine I click a person's name… I get petty finance, my dashboard, my expense, my fund."*

Left: month/year stepper · user search · **Summary card** (Balance / Expense / Fund) · **per-user
cards** that scope the page when clicked.
Right: summary tiles (Overdrawn Balance · Total Expenses · Total Funds) ·
`☐ View Reversed Transactions` · ledger `ID · User Name · Project Name · Transaction Date ·
Recorded Date · Amount · Category · Vendor`.

**Soft-deleted projects must still render in the ledger** — `110521` shows `Deleted Project` rows.
The money is real even when the project is gone.

Reuses `expense_claims` (0023) — **extend, do not duplicate**.

### 12.3 Account Receivables — **`110534`**

Four tiles: **`Overdue Payment`** · **`Milestone Overdue`** · **`Upcoming Milestone`** ·
**`Written Off Payments`**, each showing `n Milestones | ₹`.

Table: `Project Name · Sales Owner · Milestone (%) · Due Date · Amount · Pending · Received ·
Action`. `Amount` green-tinted, `Pending` amber — a genuine status use of colour (§4.2).

**This reads directly off `contract_milestones` from §9.3.** The same percentage schedule planned in
Financial Planning becomes the receivables ledger here. **Nothing is re-entered.** That is the
interconnection the owner asked for.

---

## 13. Phase 12 — Reports and polish

- Wire the **Reports** permission groups (§11.3) to real reports: Payment · Client · User · Labour ·
  Lead · Financial.
- Every list gets: saved views, column chooser, CSV export, designed empty state, skeleton loading.
- Accessibility floor (`DESIGN-DIRECTION §8`): status never by colour alone, visible focus rings,
  keyboard-navigable tables, ≥4.5:1 contrast.
- Full red-discipline audit across every new screen (§4.4).
- **Fix the competitor's mistakes we listed** — see `FRAME-REGISTER-V4.md` § *What VEYRA should not
  copy*.

---

## 14. Ask the owner before building

Do not guess on these:

1. **Manager dashboard** — parked behind `TEAM_VIEW_ENABLED = false`. The owner will specify.
   **Do not design it unprompted.**
2. **MB Sheets** — named in the nav (`104314`) but never shown in any frame. Ask what it contains.
3. **Inspirations / Virtual Tour / 2D→3D renders** — the competitor's headline differentiator
   ("Imagino", Gemini-based), not mentioned in this walkthrough. In or out?
4. **Quotation 2.0** — a project module tab in the frames. VEYRA already has a quotation studio;
   is the project-scoped view new, or filtered?
5. **`Push to Zoho`** (`105403`) — an accounting export seam. Wanted?
6. **Deploy** — nothing since `c163310` is live. Needs the owner's go **and** the `AI_*` env vars in
   Vercel.

---

## 15. Migration ledger

Reserve in this order. **Do not renumber.**

| # | Contents | §  |
|---|---|---|
| 0026 | `follow_up_assignees`, `followup_outcome_rules`, `leads.external_ref` | 5 |
| 0027 | `scope_items` + `scope_item_id` on the six line tables + backfill | 7.2 |
| 0028 | real `project_id` FKs on the eleven `project_label` tables + backfill | 7.3 |
| 0029 | `project_folders`, `project_files`, `project_file_versions`, `entity_comments` | 9.1 |
| 0030 | `project_contracts`, `contract_milestones`, `contract_documents` | 9.3 |
| 0031 | `labour_entries`, `labour_entry_categories`, `labour_entry_vendors` | 9.6 |
| 0032 | `milestone_templates`; milestone `client_visible` + planned/actual dates + dependencies | 9.2 |
| 0033 | warehouse `kind` + `project_id`; GRN auto-numbering | 10.2 |
| 0034 | `wfh_requests`, `holidays` | 11.1 |
| 0035 | `audit_events`; permission enforcement columns | 11.3–11.4 |
| 0036 | material-request **per-line stage** model (see §9.7 ⚠) | 9.7 |

Every one: additive, idempotent, `org_id` FK, registered in `lib/data/tables.ts`.

---

## 16. Definition of done, per phase

No phase is finished until **all five gates pass, re-run by you personally**:

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/next/dist/bin/next build
node scripts/verify.mjs
```

**`next build` passing does NOT mean the typecheck passes** — Next skips test files. Run both.
A shell proxy can swallow exit codes; when a gate looks suspiciously clean, re-run it in PowerShell
and check `$LASTEXITCODE`.

Plus, per phase:
- Every new engine is a pure function in `lib/<x>-model.ts` **with tests**.
- Every new table is in `lib/data/tables.ts` and reached **only** through `withOrg()`.
- `scripts/verify.mjs` gains org-isolation assertions for every new table.
- Every screen is checked against its **`FRAME-REGISTER-V4.md`** entry *and the actual PNG* —
  information kept, clutter dropped.
- Red discipline audited (§4.4).
