# HANDOFF V3 — VEYRA

**This is the current, authoritative handoff.** It supersedes `HANDOFF-V2.md`,
`HANDOFF-NEXT.md`, `HANDOFF-FLEET-AGENT.md`, `HANDOFF-PROMPT.md`,
`HANDOFF-BUILD-AGENT.md`, `HANDOFF-WAVE4-QA.md`, `START-HERE.md`. Read it fully
before touching anything.

Working directory: `C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`

---

## 0. READ THIS FIRST

**The design is not yours to invent.** The owner has 116 real competitor
screenshots in `competitor-research/source/frames/video-01|02/` and a feature
register keyed to them. Prior sessions ignored the visuals and shipped generic
AI-slop UI the owner rejected. Before building or changing a screen, open the
matching frames and read the matching rows in
`competitor-research/FEATURE-REGISTER.md` + `analysis/*.md`.

**The owner's actual instruction about those frames** (verbatim intent, from the
last session): *"You need to copy this UI and put the same thing? Not at all.
Understand every single thing and why it is there in the UI. Keep it in a better
way. Add more features if you think you need to."* The competitor's screens carry
the right **information** and the wrong **density**. Take the boxes; lose the
clutter.

**Design language** — `competitor-research/DESIGN-DIRECTION.md` governs. White
background, near-black text. **Red has a closed list of five jobs**: one primary
action per view, active navigation, destructive actions, genuine alerts, the one
hero metric. Status is green/amber/grey with a label. A sixth use of red is wrong.

**Current priority is ARCHITECTURE, not pixels.** Screens should be thin, correct
scaffolds over a strong model/data/engine layer. When in doubt, invest below the UI.

---

## 1. PRIME DIRECTIVES

1. **Never trust a sub-agent's "done".** Re-run the gates yourself; always
   `npm run build` AND `tsc --noEmit` (they are not the same — see §3).
2. **Build to the register + frames**, not to invented design.
3. **Don't rebuild what ships.** Check reality first: `git log --oneline -12`,
   `git status`, the gates. Never trust a number in a doc over what git shows.
4. **Ask the owner before pushing, deploying, or any outward action.** Building
   and local commits are fine.

---

## 2. WHAT VEYRA IS

Multi-tenant B2B SaaS ERP+CRM for the Indian construction / architecture /
interior / modular-furniture industry. Full journey: lead → quotation →
procurement → inventory → project execution → site → finance → handover,
per-industry configurable, multi-company from day one.

Competitor = **Dzylo**, torn down frame-by-frame in `competitor-research/`.
VEYRA matches its CRM+projects+procurement+finance surface and wins on the half
it lacks: the **factory moat** (BOM → cutlist → nesting → panel-QR) and
**site-measurement variance**.

---

## 3. CURRENT STATE

- **Branch** `quotations-v2-plus-fleet`. **HEAD `9172002`** — "Workspace, Lead
  Management and the Quotation studio (0023–0025)". Run `git log --oneline -20`
  for truth.
- **Live prod**: https://veyra-five-beta.vercel.app — **NOT redeployed since
  `c163310`.** Everything in §4 is local-only. Deploying needs the owner's go
  AND the new env vars (§5).
- **Supabase** project ref `vjupynmjzpdzrluwctzd`. **RLS is OFF by owner
  decision — never enable it or write policies.** Migrations **0001–0025 all
  applied** to the live DB.
- ⚠️ **LOGIN IS REMOVED** (owner request, commit `9302fd2`). Replaced this
  session by a **"View as" picker** in the top bar — Admin / Owner / Manager /
  Staff profiles, no passwords. See §6.
- **Stack**: Next.js 16 (App Router, Turbopack), React 19, TypeScript strict,
  Tailwind v4, Supabase over PostgREST, vitest.

### Gate status, actually run at HEAD

| Gate | Result |
|---|---|
| `node ./node_modules/typescript/bin/tsc --noEmit` | ✅ clean |
| `node ./node_modules/eslint/bin/eslint.js app lib components` | ✅ 0 errors, 0 warnings |
| `node ./node_modules/vitest/vitest.mjs run` | ✅ 267/267, 22 files |
| `node ./node_modules/next/dist/bin/next build` | ✅ green, 56 routes |
| `node scripts/verify.mjs` | ✅ 77/77 vs real Supabase |

> **`next build` passing does NOT mean the typecheck passes.** Next skips test
> files. `tsc --noEmit` was silently red for several commits before this session
> caught it. Run both.

---

## 4. WHAT THIS SESSION BUILT (do not rebuild)

### Migration 0023 — Workspace (`/dashboard`)
The employee's own day, replacing the old read-only KPI dashboard. Top pill
tabs swap panels **in-page** (`history.replaceState`, never a navigation):
**Overview · My info · Tasks · Expenses · Field visits**.

- `work_sessions` — attendance. Hours are **derived** from check-in/check-out
  stamps, never stored as a total. A partial unique index enforces one open
  session per member.
- `tasks` + `task_checklist` — an employee creates their own or receives one;
  same table, same path.
- `expense_claims`, `leave_requests`, `field_visits`.
- `workspace_options` — **the tenant's own vocabularies**: task types,
  priorities, expense categories, leave types, visit purposes, and (from 0024)
  lead sources, budget bands, scope, property types, contact roles, follow-up
  outcomes. Seeded as `is_system` rows the tenant renames or retires.
- Engines + 30 tests in `lib/workspace-model.ts`.

⚠️ **The MANAGER/OWNER view is built, tested and PARKED.** The owner said: *"as
of now don't create the manager dashboard yet, keep it same like employee, I
will tell you what to put in that later."* It lives in
`app/(app)/dashboard/panels-team.tsx` (Overview / Team scorecards / Task board /
Approvals / Setup) behind `TEAM_VIEW_ENABLED = false` in `workspace-shell.tsx`.
**Flip that one constant to bring it back.** Do not delete it, and do not design
its contents — the owner will specify.

### Migration 0024 — Lead Management (`/leads`, `/followups`)
Nav renamed **Leads → Lead Management**.

- **Statuses are data.** `lead_statuses` — the competitor's ~22 hardcoded stages
  distilled to 14 genuinely distinct ones; tenants rename/add/retire. Retiring
  a status with leads on it is refused.
- **The lead carries its brief** — project name, budget band, scope, layout
  sq ft, rooms, theme, property type, address/geo, rating, sales owner, all as
  typed columns so they flow into the quotation instead of being retyped.
- `lead_assignees` — multi-assignee.
- **List**: count + pipeline value, one filter row, toggleable columns, inline
  status change, follow-up chip (calls · next due · overdue in red).
- **Detail**: five in-page tabs — Details · Follow-ups · Call logs · Activity ·
  Location — plus **Promote to project**, which writes a real
  `leads.project_id` FK.
- **Follow-ups**: `kind` = callback | meeting. **A callback is a REMINDER to
  phone someone — VEYRA never dials.** The call that actually happened is logged
  in `interactions` (0011). Intention and fact stay in separate tables so the
  Team tab can compare planned against done.
- **"Missed" is derived from time**, never a stored status someone must
  remember to set. That is the only way the number stays honest.
- `/followups` — Overview · Follow-ups · Call logs · Team, with completion rate,
  connect rate, talk time and streaks. Engines + 26 tests in
  `lib/lead-management-model.ts`.

### Migration 0025 — Quotation studio
- `quotations.source` (lead | project | standalone), `doc_type`, `project_id`
  FK, `ref_no`. The **Source picker** on `/quotations/new` links the quote to
  what it came from and carries the customer snapshot across.
- `quotation_terms` — reusable T&C clause library; defaults auto-attach.
- `quotation_settings` — per-tenant default GST %, margin %, validity days,
  footer, and a cost-column visibility flag.
- `ai_prompt_templates` — the tenant's saved prompts (4 worked examples seeded).
- `ai_requests` — **append-only** log of every AI call: prompt, provider, model,
  attachments, lines created, errors.
- `/settings/quotations` and `/settings/workspace` surface all of it.

### AI is now provider-pluggable
`lib/ai/provider.ts` — one seam, two adapters (Gemini via fetch, Anthropic via
SDK). `lib/ai/boq.ts` holds the prompt-to-BOQ logic.

**The owner overrode REQ-01's Claude-only rule and chose Gemini.**
`AI_PROVIDER=gemini|anthropic` switches backends with zero code change.

**⛔ THE ONE RULE THAT SURVIVED INTACT: no LLM produces a price, rate, cost or
amount.** The model returns rooms → items → qty/uom. `parseAiBoq` strips every
price-shaped field. Lines are created at **₹0** with the tenant's default GST,
and the deterministic engine plus the user supply every rate. Verified live this
session: `gemini-3.5-flash-lite` returned 5 kitchen lines (18 rft base cabinets,
54 sqft granite…) with `unit_price = 0.00` on every row.

The AI generator dialog supports the prompt library, **file attachments**
(images/PDF, ≤4 files, ≤4 MB each — a floor plan says more than a paragraph),
and save-this-brief-to-library.

### Bugs fixed in passing
- `tsc --noEmit` was red on a cast in `lib/ai-boq-model.test.ts`.
- **The Kanban had two competing status ladders** — `pipeline_stages` (display
  names) vs `lead_statuses` (the slugs `leads.status` stores) — so every new
  lead silently fell into the first column. `lead_statuses` is now the single
  source of truth for the board (`lib/data/pipeline.ts` → `boardColumns`).
  `pipeline_stages` still exists but no longer drives the board; **consider
  retiring it properly.**
- `reports.salesFunnel` followed the old hardcoded six statuses.

---

## 5. CREDENTIALS & INFRASTRUCTURE

**Demo tenant** — org id `d46a53af-58b1-4ed7-87be-c675e5803802`, org name
"Veyra Demo Interiors". Login `demo@veyra.app` / `VeyraDemo!2026` (unused while
login is removed).

**Seeding, in this order:**
```bash
node scripts/seed-demo.mjs        # older modules (idempotent)
```
then **load `/dashboard` once in a browser** (this lazily seeds the demo staff
profiles, workspace options and lead statuses), then:
```bash
node scripts/seed-workspace.mjs   # workspace + leads + follow-ups + calls
```
> Order matters. `seed-workspace.mjs` reads `lead_statuses`; if you run it
> before the app has ever rendered, every seeded lead falls back to status
> `new`. That happened this session and had to be repaired with SQL.

**Supabase** — all keys in `.env.local`, documented in `CREDENTIALS.md`.
**DO NOT USE the Supabase MCP** — it is authenticated to a different account and
every call returns "no permission". The only DB paths are `scripts/db.mjs`
(DDL/SQL via the pooler) and `verify.mjs` (PostgREST). The pooler occasionally
throws transient `auth_query secret check timed out` — retry, it clears.
`db.mjs migrate` re-runs every `if-not-exists` file, so it is always safe.

**AI env** (new this session, in `.env.local` and `.env.example`):
```
AI_PROVIDER=gemini
AI_GEMINI_API_KEY=<owner's key>
AI_GEMINI_MODEL=gemini-3.5-flash-lite
```
The older `GEMINI_API_KEY` / `GEMINI_MODEL` pair belongs to the
competitor-video tooling — do not confuse them. **These vars are NOT yet set in
Vercel**; AI will report "not configured" in prod until they are.

> Note: the owner pasted their Gemini key into chat. It is gitignored and never
> given to workers, but it should be treated as exposed and rotated.

**Vercel** — project `veyra`, CLI authed `chaithanya812`, functions pinned to
`icn1` (Seoul). `npx vercel --prod --yes` — **owner's go only.**

**Dev server** — registered as `veyra` in the *root* `RESEARCH 2/.claude/launch.json`
(runs `node "VEYRA CRM/node_modules/next/dist/bin/next" dev -p 3010 "VEYRA CRM"`;
using `npm` there fails on the space in "Program Files").

---

## 6. THE "VIEW AS" PICKER (replaces login)

Owner's instruction: *"instead of login keep view as, with options admin, a
manager, staff and in staff keep profiles like Meghana etc, no password."*

- `components/shell/view-as.tsx` in the top bar, grouped Admin / Owner /
  Manager / Staff.
- `lib/data/team.ts` — `getActingContext()` reads a `veyra_acting_member`
  cookie. **The id is validated against `listMembers()`, which is itself
  org-scoped by `withOrg()`** — so it can only ever move between people inside
  one tenant. It is not a privilege-escalation path.
- `ensureDemoProfiles()` seeds 5 profile rows (Chaithanya=admin,
  Meghana=manager, Rahul/Sneha/Karthik=staff) **only when the org has fewer than
  two members**. These are `org_members` rows with a standalone `user_id` — no
  auth account, no password. A real tenant never trips this.
- Roles rank `admin > owner > manager > member`; `canManageTeam` /
  `canConfigureOrg` in `lib/workspace-model.ts`.

**When auth returns**: delete the cookie branch in `team.ts`, delete
`app/(app)/actions.ts`, delete `ensureDemoProfiles`, restore the `/login`
redirect in `app/(app)/layout.tsx`, and restore the demo-tenant fallbacks in
`lib/data/with-org.ts` + `lib/data/context.ts` (both carry TEMPORARY notes).

---

## 7. ARCHITECTURE (the patterns every module follows)

- **Tenant isolation is load-bearing** (RLS is OFF): `lib/data/with-org.ts`
  `withOrg()` is the ONLY guard. Every tenant table carries `org_id`, is listed
  in `lib/data/tables.ts`, and is reached only through `withOrg()`. Platform
  tables (`orgs`, `app_users`, `plans`) are read via the `admin` client **only
  inside `lib/data/*`** — a lint rule enforces this.
- **No LLM ever produces a price/qty/amount.** Rates are config; a pure engine
  computes; a validator verifies.
- **Per-module shape**: `lib/<x>-model.ts` (+ `.test.ts`) pure and client-safe ·
  `lib/data/<x>.ts` (`"server-only"`, all via `withOrg()`) ·
  `app/(app)/<x>/actions.ts` (`"use server"`, only async exports) · pages.
- **Migrations**: additive + idempotent only; `org_id uuid not null references
  public.orgs(id) on delete cascade` on every tenant table. Never a table named
  `automations`. **Next free number: 0026.**
- **In-page tabs**: `useState` + `history.replaceState`, never `router.push`.
  Reusable pieces live in `app/(app)/dashboard/workspace-ui.tsx` (TabBar,
  StatTile, Section, List, Row, Disclosure, SubmitButton, Chip, Avatar) — the
  Lead detail and Follow-ups screens import from there. Reuse it.
- **Indian market**: GST (HSN/SAC, place-of-supply, works-contract), Indian-FY
  numbering, ₹ Indian grouping, DPDP. Ledgers are append-only.

---

## 8. HARD RULES

RLS OFF (never enable). `withOrg()` is the only tenant guard. No LLM produces a
price/qty/amount. Migrations additive + idempotent with the `org_id` FK. Indian
GST/FY/₹/DPDP. Secret keys server-only, never to sub-agents. Server-action files
export only async functions. Don't push/deploy without the owner. Don't rebuild
shipped modules. Build to the frames, not to taste. Red keeps its closed list.

---

## 9. WHAT'S NEXT

### Immediately pending from the owner
1. **The manager/owner dashboard.** Parked behind `TEAM_VIEW_ENABLED`. The owner
   will specify its contents — ask, don't design it unprompted.
2. **Deploy** — nothing since `c163310` is live. Needs the owner's go plus the
   `AI_*` env vars in Vercel.

### The architectural debt worth raising (from the audit before this session)
The owner deferred this — *"let's deal with what you stated later"* — but it is
still the biggest thing in the codebase and should be re-raised:

**PLAN §1.1's Scope Item — "the architectural heart", "non-negotiable: no module
gets its own private line-item table" — was never built.** `grep -r scope_item`
across all 25 migrations and all of `lib/` returns **zero hits**. Six private
line-item tables exist instead (`quotation_lines`, `material_request_items`,
`rfq_items`, `po_lines`, `bom_lines`, `cutlist_panels`), with no shared row.

Worse: **eleven tables across eight migrations link to projects by a free-text
`project_label`**, with comments claiming "no projects table in this workspace"
— but `projects` has existed since migration 0007. Fleet workers each invented
the same false assumption in isolation. The damage is visible in
`lib/data/reports.ts:288`, where `projectProfitability()` joins
`projects.name === payments.project_label` — a **string-equality join producing
the flagship per-project P&L**.

This session added real FKs on the new tables (`tasks.project_id`,
`leads.project_id`, `quotations.project_id`, `expense_claims.project_id`) as a
down payment. The remaining eleven still need it.

Proposed sequence (do it yourself, not via free models — it touches every
shipped module):
1. Migration 0026 — `scope_items` + nullable `scope_item_id` FKs on the six line
   tables; backfill from `quotation_lines`.
2. Migration 0027 — real `project_id` FKs on the eleven `project_label` tables,
   keeping the label as a display fallback; one explicit backfill; then move
   `projectProfitability` and `financeSummary` onto the id.
3. Prove it with **approved quotation → draft Material Request** (register
   PROC-MR-004). If that button is more than ~40 lines, the spine isn't right.

### Also decorative, also worth fixing
- **Permissions are unenforced.** `lib/permissions-model.ts` defines
  `(module, action, scope)` and the settings matrix writes rows — **nothing
  reads them.** Field-level visibility (register P1, "supervisor sees BOQ
  without cost") does not exist. `quotation_settings.show_cost_column` is the
  first hook for it.
- **Metering** is wired to 3 create paths (`quotations`, `boqs`, AI). ~20 others
  are free.
- **No audit log**, despite three register findings calling for one.
- **`pipeline_stages` is now vestigial** — the board reads `lead_statuses`. The
  `/pipeline/stages` screen still edits the dead table; point it at
  `lead_statuses` or remove it.

### Register backlog still open
3-way match (PO↔GRN↔bill) · discount/threshold approval wired to the approval
engine · inter-site stock transfers · **OTP vendor portal** (public tokenized
RFQ bid entry — security-critical, build it yourself) · MR "AI parse" (reuse
`lib/ai/provider.ts`) · inventory stock-out/issue · GRN auto-numbering ·
public lead-capture form. Wave 5 (audit log, comments/@mentions, automation
outbox, doc branding, customer portal) is deferred by the owner.

---

## 10. THE FLEET (parallel sub-agents)

Headless `opencode run` workers in isolated sibling dirs with dummy DB creds.
They cannot touch the real DB, migrate, verify or push — only you do that.

- Dispatcher: `RESEARCH 2/fleet-subagents/fleet-dispatch.mjs`
- Worker dirs: `RESEARCH 2/VEYRA-worker` … `VEYRA-worker5`
- Protocol: `RESEARCH 2/fleet-subagents/CLAUDE.md`
- Models: `opencode/hy3-free` (most reliable, use for audits) ·
  `opencode/x-preview-f-free --variant max` (strongest for builds, prone to
  transient `network_error` — just reroll) · `opencode/big-pickle`.
  ⚠️ **Never `opencode/ox-alpha-free`** (dead id).

**Review gate — do all of it yourself, per worker:** read the manifest; `git
status --porcelain` in the worker (new files are untracked, so `diff HEAD` hides
them) and READ every new file; enforce file ownership; check `withOrg()` only,
no-LLM pricing, design tokens/red discipline, additive+idempotent+`org_id`
migration, meaningful tests; hand-merge the `tables.ts` + `nav.ts` collisions;
then re-run **all five gates** in the repo and apply the migration yourself.

**Do not use the fleet for**: the Scope Item spine, the OTP vendor portal, or
anything touching `with-org.ts`. Free models drift exactly where it hurts most.

---

## 11. COMMANDS

```bash
npm run dev                       # http://localhost:3010
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/eslint/bin/eslint.js app lib components
node ./node_modules/next/dist/bin/next build
node scripts/db.mjs migrate       # YOU apply migrations
node scripts/db.mjs sql "<query>"
node scripts/verify.mjs           # 77/77 vs real Supabase
node scripts/seed-demo.mjs        # then load /dashboard, then:
node scripts/seed-workspace.mjs
npx vercel --prod --yes           # owner's go ONLY
```

A shell proxy (RTK) can swallow output and mangle exit codes — `echo $?` after a
pipe reports the *last* command's status, not the tool's. When a gate looks
suspiciously clean, re-run it via PowerShell and check `$LASTEXITCODE`.

---

## 12. WHAT NOT TO DO

Don't trust worker self-reports. Don't skip `tsc --noEmit` just because
`next build` passed. Don't let a worker migrate/verify/push or see the real
`.env.local`. Don't use the Supabase MCP. Don't enable RLS. Don't let an LLM
produce a price or a quantity. Don't push or deploy without the owner. Don't
rebuild shipped modules. Don't design the manager dashboard until the owner
specifies it. Don't invent UI — build to the frames, better than the frames.
