# Dzylo → VEYRA — reports & handoff prompts

This folder holds the competitor-research output for six Dzylo walkthrough videos, plus the maps and
prompts to act on them. **Reports are DRAFTS for owner review** — each ends with numbered open
questions; answer those before building.

Contents:
- `01-Modular-Quotation-2.0.pdf` … `06-AI-Project-Planning.pdf` — the six two-part reports (Part A evidence, Part B instruction).
- `VEYRA-SITE-INVENTORY.md` — per-route buttons/actions + server-action/API surface + DB schema (what exists).
- `VEYRA-BUILD-MAP.md` — deep map of the quotation subsystem + answered code questions.
- `SUBAGENT-VIDEO-PIPELINE.md` + `make_report_template.py` — how to generate more reports.

---

## The six videos analysed (EXCLUDE these when picking new ones)

| # | Video | YouTube id | VEYRA area | Report | Verdict |
|---|-------|-----------|-----------|--------|---------|
| 1 | Create Modular Kitchen & Wardrobe Quotations in Minutes | `KjzrkJjfGYo` | Quotations | `01-Modular-Quotation-2.0.pdf` | **Mostly NEW** — the flagship build |
| 2 | Interior Project Management using Dzylo | `Smqwc6MefC0` | Projects | `02-Project-Management.pdf` | Mostly built; new = CPM engine |
| 3 | End-to-End Procurement (Material Request → Delivery) | `gEW1maGsD_4` | Procurement | `03-Procurement.pdf` | Built but **UNTESTED end-to-end** |
| 4 | Inventory Management (Malayalam) | `xoNsK1AyHj8` | Inventory | `04-Inventory.pdf` | **~90% built** — audit + 6 deltas |
| 5 | Track All Your Business Reports in One Place | `mYWUgAzgRsk` | Reports | `05-Business-Reports.pdf` | ~70–85% built |
| 6 | Create Interior Project Plans in Minutes with AI | `BhlM-84fGgA` | Planning | `06-AI-Project-Planning.pdf` | Built — extend, not build |

All six are from the "Dzylo AI" channel.

---

## Pooled OWNER-ONLY decisions (no code can settle these — answer once, up front)

1. **Un-park "Quotation 2.0"?** It is on HANDOFF-V10 Part 8's parked list. Report 1 assumes yes. (Blocks report 1.)
2. **Plan-tier gating** for modular quotations (Growth = modular-only vs mixed modular+normal for all)? (Report 1.)
3. **Demo-placeholder-box UX** (used across every report): auto-clear on first real row vs manual dismiss; per-tenant seeded rows vs a shared importable sample library?
4. **Inventory Goods Value valuation** — keep ledger arithmetic, or adopt FIFO / weighted-average? (Report 4.)
5. **Business reports**: async generate→S3 `.xlsx` archive + run history, or synchronous filtered views + CSV? And redefine the **Client Report** (VEYRA has no client app — portal is parked) onto a signal VEYRA owns, or keep money-by-client? (Report 5.)
6. **In-app notifications** (dependency "notify on completion" bell) — build them? Telephony/WhatsApp/email stay out (Part 8). (Reports 2 & 6.)
7. **Un-park** the Team task board (`TEAM_VIEW_ENABLED=false`) and Project Insights (stubbed "soon")? (Report 2.)
8. **Weekly-off** config (Sunday-only vs configurable) and do holidays count against plan durations? (Report 6.)

---

## A — REUSABLE REPORT-GENERATION HANDOFF (for a NEW video)

Paste this into a fresh chat, with the new link. It runs the same pipeline that produced these six.

```
Generate a VEYRA build report from a Dzylo (competitor) YouTube walkthrough. This is a heavy
pipeline (download → frames → vision → PDF) — run it in a sub-agent (Opus) so the main context
stays small.

Working dir: C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM
Read first, in order:
  1. dzylo-research/SUBAGENT-VIDEO-PIPELINE.md — the exact steps. Follow them.
  2. dzylo-research/make_report_template.py — the reportlab formatting template. Adapt it verbatim.
  3. dzylo-research/01-Modular-Quotation-2.0.pdf — the QUALITY EXEMPLAR. Match or beat it.
  4. dzylo-research/VEYRA-SITE-INVENTORY.md and VEYRA-BUILD-MAP.md — what VEYRA already has;
     ground the reuse/instruction half and the "already built vs not" verdict on these.

Quality bar: ONE evidence entry per DISTINCT screen/dialog (target 13–24, do NOT skip sub-views);
each entry = the screenshot + ON SCREEN (transcribe every button/field/option literally) + HOW
VEYRA BUILDS IT (map to code with path:line receipts). Evidence (seen) stays separate from
instruction (decided). Do NOT copy the competitor UI — keep the info, drop the density. NO number
ever comes from an LLM. Flag anything on HANDOFF-V10 Part 8 (parked/settled-NO) instead of proposing it.

The video: <PASTE YOUTUBE LINK>
Already analysed — do NOT redo: KjzrkJjfGYo, Smqwc6MefC0, gEW1maGsD_4, xoNsK1AyHj8, mYWUgAzgRsk, BhlM-84fGgA.

Deliver: a two-part PDF report into dzylo-research/, plus a tight summary (evidence index, top reuse
receipts with path:line, numbered open questions, and an "already built vs not" verdict). Do NOT
build the app, edit the repo, run migrations, or use the Supabase MCP.
```

---

## B — SIX "BUILD THIS VIDEO'S FEATURES" HANDOFFS

Each is self-contained. Paste ONE into a fresh chat. It reads the map + that report, confirms the
open questions with you FIRST, then builds and verifies end-to-end. **Answer the pooled owner
decisions above before running any of these.**

### B1 — Modular Quotation 2.0  (flagship / mostly NEW)

```
Implement Dzylo's Modular Quotation 2.0 into VEYRA, end-to-end, so the features work in the app.

Working dir: C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM (branch quotations-v2-plus-fleet)
Read, in order: HANDOFF-V10.md (rules, gates, unit method, Part 8) → dzylo-research/VEYRA-SITE-INVENTORY.md
(what's built) → dzylo-research/01-Modular-Quotation-2.0.pdf (the spec: Part B has numbered UNITS,
a NOT-building list, and OPEN QUESTIONS).

Headline: the second half (quotation builder, GST engine, versioning, PDF, payment plan) already
exists — extend it. Genuinely NEW = the modular CONFIG layer (catalogs, modules, categories, the 8
component types, presets) and ONE deterministic modular-pricing model. `doc_type='modular'` already
exists as an inert hook to light up; rich per-line data uses an FK CHILD TABLE (not jsonb).

Do this in order:
  1. Read the three docs; verify built-vs-new against the live code.
  2. ⛔ STOP and ask me the report's OPEN QUESTIONS first. Owner-only: confirm UN-PARKING Quotation 2.0
     (Part 8) and the plan-tier gating — do NOT build until I answer these.
  3. Build the report's units ONE at a time (veyra-unit, by address, never parallel). The pricing
     model (deterministic, NO LLM numbers) is the expensive unit — do it with full tests first.
  4. Each unit ends with the six gates + a browser pass + a commit explaining the shape.
  5. Verify END-TO-END: build a modular quotation on a lead, apply a preset, confirm the live price
     equals the deterministic breakdown and the quote renders. Do NOT push/deploy without me.
Start by telling me built-vs-new and your numbered questions.
```

### B2 — Interior Project Management  (CPM engine is the one real build)

```
Implement the gaps from Dzylo's Interior Project Management video into VEYRA.

Working dir: C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM (branch quotations-v2-plus-fleet)
Read, in order: HANDOFF-V10.md → dzylo-research/VEYRA-SITE-INVENTORY.md → dzylo-research/02-Project-Management.pdf.

Headline: the plan grid, milestones/activities, dependencies, Gantt engine, AI SmartPlan, milestone
templates and portfolio list ALREADY EXIST — do not rebuild them. The ONE genuinely-new algorithm is
a deterministic critical-path engine (lib/critical-path-model.ts: CPM / float / critical path, NO
LLM), with PERT chart, Recommended Actions and Timeline-Planner editing on top; plus small config
columns (vendor-on-activity, super-milestone, UOM-progress).

Do this in order:
  1. Read the docs; confirm built-vs-new against live code.
  2. ⛔ STOP and ask me the OPEN QUESTIONS first. Owner-only: build CPM in-house (yes); un-park the
     Team task board (TEAM_VIEW_ENABLED) and Project Insights (stubbed); build in-app notifications?
  3. Build the report's units one at a time (CPM engine + tests first), six gates + browser pass +
     commit each.
  4. Verify END-TO-END that each video feature (PERT, Recommended Actions, float) works on a real
     project. Client portal stays OUT (use client_visible). Do NOT push/deploy without me.
Start by telling me built-vs-new and your numbered questions.
```

### B3 — Procurement  (BUILT — this is a FINISH-AND-VERIFY job)

```
Finish and verify VEYRA's procurement chain against Dzylo's End-to-End Procurement video.

Working dir: C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM (branch quotations-v2-plus-fleet)
Read, in order: HANDOFF-V10.md → dzylo-research/VEYRA-SITE-INVENTORY.md → dzylo-research/03-Procurement.pdf.

Headline: the WHOLE chain (MR → RFQ → PO → GRN → stock) is already built — 17 tables, four
state-machine models, landed-cost L1/L2/L3 bid ranking, proxy "fill for vendor", derived
partial-delivery state, an append-only stock ledger — but it is LARGELY UNTESTED end-to-end. So this
is mostly a verify-and-finish task, not a build.

Do this in order:
  1. Read the docs; map each video step to the existing code.
  2. ⛔ STOP and ask me the report's OPEN QUESTIONS first.
  3. For the report's small NEW gaps: build one unit at a time, six gates + browser pass + commit.
  4. VERIFY END-TO-END (the main deliverable): run a full MR→RFQ→PO→GRN→stock flow in the app,
     quoting the figures at each hop and checking them against db.mjs sql. Add tests for the chain
     (Part 7.6 names it a top untested surface). Do NOT push/deploy without me.
Start by telling me what the report says is built vs new, plus your numbered questions.
```

### B4 — Inventory  (~90% built — audit + 6 small deltas)

```
Close the small gaps between VEYRA's inventory and Dzylo's Inventory Management video.

Working dir: C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM (branch quotations-v2-plus-fleet)
Read, in order: HANDOFF-V10.md → dzylo-research/VEYRA-SITE-INVENTORY.md → dzylo-research/04-Inventory.pdf.

Headline: VEYRA's inventory already implements the ENTIRE Dzylo screen (five tabs, company/project
warehouses, append-only ledger, Goods Value, stock-in/out, GRN + issue docs, both stock-in queues).
The report is a reuse audit + ~6 small deltas (receipt-header parity, stock_out_reason enum, paired
transfer, inline Add-To-Catalog, delivery "Accept Stock" wrapper, demo-seed + explainers).

Do this in order:
  1. Read the docs; confirm the deltas against live code.
  2. ⛔ STOP and ask me the OPEN QUESTIONS first. Owner-only: the Goods Value VALUATION METHOD
     (ledger arithmetic vs FIFO/weighted-average) — do not change it until I decide.
  3. Build each small delta as its own unit, six gates + browser pass + commit.
  4. Verify END-TO-END: stock-in mints a GRN, stock-out writes an issue doc, a transfer moves value
     between warehouses. Daizy AI receipt-OCR stays OUT. Do NOT push/deploy without me.
Start by telling me built-vs-new and your numbered questions.
```

### B5 — Business Reports  (~70–85% built)

```
Extend VEYRA's reports to cover Dzylo's "Track All Your Business Reports in One Place".

Working dir: C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM (branch quotations-v2-plus-fleet)
Read, in order: HANDOFF-V10.md → dzylo-research/VEYRA-SITE-INVENTORY.md → dzylo-research/05-Business-Reports.pdf.

Headline: the /reports hub, the six-way capability taxonomy, the ledger/petty/labour models, the
chart primitives, the Chart|Table toggle and CSV export ALREADY EXIST. New = promoting project-scoped
ledger/labour models to company-wide FILTERABLE report screens, plus two mismatches (Client Report;
async .xlsx). VEYRA RULE: a company Payment Report must SHARE the existing money models — never fork.

Do this in order:
  1. Read the docs; confirm reuse against live code.
  2. ⛔ STOP and ask me the OPEN QUESTIONS first. Owner-only: redefine the Client Report (no client
     app — portal parked) or keep money-by-client; async S3-.xlsx + run history vs synchronous + CSV.
  3. Build each new report screen as a unit that REUSES the shared models, six gates + browser pass +
     commit. Keep red reserved (no red donut slices / "Lost" tiles).
  4. Verify END-TO-END: each report's totals equal the source models (no re-summing). Do NOT push/deploy without me.
Start by telling me built-vs-new and your numbered questions.
```

### B6 — AI Project Planning  (built — extend only)

```
Extend VEYRA's project planning to match Dzylo's "Create Project Plans with AI" video.

Working dir: C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM (branch quotations-v2-plus-fleet)
Read, in order: HANDOFF-V10.md → dzylo-research/VEYRA-SITE-INVENTORY.md → dzylo-research/06-AI-Project-Planning.pdf.

Headline: VEYRA's SmartPlan + Project Planning already cover the whole video, and the AI surface
already obeys the rules — parseSmartPlan returns STRUCTURE ONLY (names/order/day-offsets), strips
numbers, dates are computed deterministically, calls log to ai_requests. So this is EXTEND, not build.
New = working-days date-skip (holidays table exists, unused), task-weighted milestone progress,
SmartPlan "modify" mode, bulk milestone update, template editor UI, Gantt PDF export, prompt samples.

Do this in order:
  1. Read the docs; confirm the gaps against live code.
  2. ⛔ STOP and ask me the OPEN QUESTIONS first. Owner-only: weekly-off config + do holidays count;
     build the in-app "notify on completion" bell?
  3. Build each extension as a unit, six gates + browser pass + commit. AI stays structure-only — NO
     LLM number ever; fail gracefully when AI_GEMINI_API_KEY is unset.
  4. Verify END-TO-END: generate a plan from an upload, confirm dates skip weekly-offs/holidays and
     progress rolls up. Do NOT push/deploy without me.
Start by telling me built-vs-new and your numbered questions.
```

---

## Recommended sequence to actually RUN

1. **Answer the pooled owner decisions** above (one pass) — several handoffs are blocked on them.
2. **B3 Procurement (verify-and-finish)** — cheapest high-value: it's built, carries money, and is
   the top untested surface. A verification pass de-risks a lot fast.
3. **B1 Modular Quotation 2.0** — the flagship net-new feature (once un-parking is confirmed).
4. **B4 Inventory + B5 Business Reports** — small deltas, quick wins.
5. **B2 Project Management (CPM)** — one real deterministic algorithm.
6. **B6 AI Project Planning** — small extensions.
