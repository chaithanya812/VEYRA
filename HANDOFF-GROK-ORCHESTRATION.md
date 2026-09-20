# HANDOFF — Claude orchestrates, GROK builds

**This is the operating manual for running any `HANDOFF-DZYLO-*.md` program with Claude as the
orchestrator and GROK (via CLI) as the sub-agent that does the typing.**

It replaces the "dispatch a `veyra-unit` sub-agent" step in each program file's Part 0/Part 1.
Everything ELSE in those files still applies — the method, the decisions, the findings, the reuse
index, the unit briefs, the six gates.

Written 2026-09-20, after running the **procurement program (U1–U9) to completion** this way.
Every trap below is one that actually happened, not a hypothetical.

---

## PART A — The split

- **Claude is a senior engineer who delegates the typing, not a router that forwards tickets.**
  Claude reads the real code, writes the brief, dispatches Grok, then reviews the diff line by
  line, re-runs every gate personally, verifies against the running app and the database, and
  commits. Grok saying "done, gates green" is an INPUT to review, never the end of it.
- **Grok is a different model with ZERO VEYRA knowledge that starts COLD every time.** It cannot
  see the conversation, the previous unit, or anything Claude knows. The brief must be complete
  or the unit will be wrong.
- **Claude never lets Grok commit, push, or run migrations.** Claude commits. The owner's rule on
  pushing applies (ask unless told otherwise).

---

## PART B — The dispatch command (confirmed working, grok 1.0.34)

Write the brief to a file, then:

```bash
grok --prompt-file <brief.txt> \
  --cwd "C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM" \
  --always-approve --permission-mode bypassPermissions --no-subagents \
  --effort xhigh --max-turns 110 --output-format plain
```

- **`--effort xhigh` is not optional.** Valid values are `xhigh, high, medium, low`. Omitting the
  flag takes the CLI default, which is lower. Always pass `xhigh`.
- `-p "..."` works for short prompts; use `--prompt-file` for real briefs.
- `--model` defaults to `grok-4.6`. Leave it.
- Run it **in the background** so the session stays responsive, and arm the watchdog (Part F).
- `--output-format plain` buffers: the output file stays 0 bytes until the run ENDS. **Do not
  read progress from it.** Use Part F instead.

---

## PART C — The brief. This is the whole job.

A loose brief produces a wrong unit. The briefs that worked had this shape:

1. **A one-paragraph statement of the task** in plain language — what a person gains.
2. **"STATE I ALREADY VERIFIED FOR YOU"** — numbered receipts with `file:line`, written after
   Claude personally read the files. This is the single highest-value section. Include what
   ALREADY EXISTS and must be reused, not just what is missing.
3. **"DESIGN DECISIONS — ALREADY MADE"** — every real choice, decided by Claude, with the WHY.
   Grok must not be handed an open design question; it will pick badly and confidently.
4. **"HARD RULES"** — restate them every time (Part D). Grok has never seen this codebase.
5. **"FILES TO TOUCH"** — the expected list, with "deviate only with a reason in your report".
6. **"OUT OF SCOPE"** — explicit, including things that look adjacent and tempting.
7. **"VERIFY"** — the six gates with the CURRENT baseline numbers, plus numbered V1..Vn bullets
   that each demand REAL PASTED OUTPUT. Make the most important one impossible to fake.
8. **"PROTOCOL"** — inspect-first, no commit/push/migrate, tag test rows, report format.

### The inspect-first mandate, and why it is not boilerplate

On the procurement program the plan was **wrong three times**, and each would have shipped a
defect if the brief had been trusted:

- It said to add `items.category` and `items.good_type`. **`category` already existed** with live
  data. Adding it again splits a real column in two.
- It said to add procurement notifications "on the EXISTING notification surface". **There is no
  notification system in this repo** — no table, no module, no bell. Building one would have been
  a whole unnecessary subsystem.
- It described F1's symptom as "Unknown vendor" on a screen. **That screen did not name a winner
  at all.** The symptom was elsewhere.

So the brief must say, in these words: *"Everything above is my reading of the code, and a
previous brief was wrong. If reality contradicts this brief, SAY SO IN YOUR REPORT and build the
REAL gap — never silently build the wrong thing, never silently skip something."*

---

## PART D — The hard rules to restate in EVERY brief

1. **Every server action calls `can()` / `requireCan()` as its FIRST STATEMENT**, before reading
   formData. A public/tokened route is the only exception and must say so in a comment.
2. **No LLM ever produces a number.** Rates, percentages and quantities are human-entered config.
3. **Totals are derived, never stored.** (`purchase_orders.amount` is a pre-existing exception —
   do not extend the pattern.)
4. **Red is reserved** for destructive actions, true alerts, and the primary brand accent. Status
   chips are grey / amber / green and never red. (Documented exception: the inventory
   unlisted-item flag and negative stock, per `lib/inventory-model.ts:24-25`.)
5. **A new table is THREE edits**: the migration + `lib/data/tables.ts` + org- AND
   project-isolation asserts in `scripts/verify.mjs`. A table missing from `tables.ts` cannot be
   reached through the org-scoped db at all.
6. **Rich per-line data is an FK child table, never jsonb.** Zero jsonb precedent in this repo.
7. **Report a query error as itself**: `if (error) return { error: error.message }`. Never
   swallow, never substitute a generic string, never `catch {}` silently.
8. **RLS is OFF by owner decision.** Isolation lives in `lib/data/with-org.ts`. Migrations create
   NO policies. `makeOrgDb(orgId)` is a pure function of orgId — a caller that proved its org
   another way can use it without a session (that is how the public bid portal writes safely).
9. **TypeScript strict**: no `any`, no non-null `!` on something not just checked.
10. **Reuse the engine.** Never re-implement one that exists — check Part 5 of the program file.

### A cross-tenant FK lesson worth repeating

A child table keyed only on `parent_id` will accept a row smuggled from another tenant. Use a
**composite FK** `(parent_id, org_id) REFERENCES parent(id, org_id)` (with a matching unique
constraint), and prove it in `verify.mjs` by ATTEMPTING the smuggled insert and asserting it
fails with `23503`. Grok found this on its own during the PO payment-plan unit; make it standard.

---

## PART E — The six gates, and the two that lie

Claude re-runs ALL SIX personally. Grok's numbers are a claim to check.

```bash
npx tsc --noEmit
node ./node_modules/eslint/bin/eslint.js app lib components
npx vitest run
node scripts/verify.mjs
node scripts/verify-storage.mjs
npx next build          # LAST, then: git checkout next-env.d.ts
```

**Trap 1 — `npx next build` prints a bogus error count.** This repo's commands pass through an
RTK summariser that has printed `Errors: 3` and `Errors: 6` on builds that were completely clean.
If you see an error COUNT with no error TEXT, re-run unfiltered and believe that instead:

```bash
rtk proxy "npx next build"
```

The same applies to any command whose output looks suspiciously summarised (`vitest`, `eslint`).
`rtk proxy "<cmd>"` is the escape hatch.

**Trap 2 — `next build` REPLACES `.next` and wedges the running dev server.** The app then
returns 500 and looks broken. It is not. Always run the build **LAST**, after the app checks,
then restart dev:

```bash
PID=$(netstat -ano | grep ":3010 " | grep LISTENING | head -1 | awk '{print $NF}')
taskkill //PID $PID //F ; rm -rf .next ; (npm run dev > /tmp/veyra-dev.log 2>&1 &)
```

**Tell Grok explicitly: never run a command that does not exit on its own** — no `npm run dev`,
no `tail -f`, no `--watch`, no `docker compose up`. If Grok wedges the dev server it must NOT try
to restart it; it should say so in its report and move on. (A unit hung for 22 minutes on exactly
this and had to be killed.)

---

## PART F — Watching the run (the failure mode that cost the most)

`--output-format plain` buffers, so the task output file is empty until the run ends. A hung Grok
looks identical to a working one. Two things that do NOT work:

- **Counting processes named `grok`** — a separate desktop app ("Grok Bot.exe") matches and gives
  a false positive. The CLI is not named `grok.exe` either.
- **Waiting for the completion notification** — a hang never completes, so it never fires.

What DOES work: **grok writes a live session log.** Find it and watch its mtime.

```
~/.grok/sessions/<url-encoded-cwd>/<session-uuid>/updates.jsonl
```

Newest session dir = the current run. Tail `updates.jsonl` to see the last tool call — that is how
the 22-minute hang was diagnosed (its last entry was a foreground `npm run dev`).

Arm a stall-only watchdog alongside the dispatch (emit ONLY on stall — a heartbeat every few
minutes is pure noise):

```bash
SD="<newest session dir>"
while true; do sleep 180
  [ -d "$SD" ] || { echo "SESSION-GONE"; break; }
  if [ "$(find "$SD" -newermt '-8 minutes' -type f | wc -l)" -eq 0 ]; then
    echo "STALL: session log untouched 8+ min — likely blocked on a non-exiting command"
  fi
done
```

Note a long **inspection** phase writes no PROJECT files while reading — so watch the SESSION log,
not the git tree, or you will false-positive on a healthy run.

If it stalls: stop the task, then **review what is on disk**. In the hung unit the implementation
was complete and green — only the verification never ran, and Claude finished it by hand. Do not
throw the work away.

---

## PART G — Review, then commit

1. **Read the FULL `git diff` line by line.** Specifically check: `can()` guard-first; red usage;
   no stored totals; `tables.ts` + `verify.mjs` for any new table; error handling; dead code; a
   rebuilt engine; a duplicated form or arithmetic.
2. **Grep for duplication** the refactor was supposed to prevent — e.g. confirm the pricing
   helper still has exactly one caller and the shared form markup lives in exactly one file.
3. **Re-run all six gates.** Confirm the count went UP or held; never accept a drop.
4. **Verify writes in `node scripts/db.mjs sql "..."`** and screens with node-fetch + cookie.
5. **Fix small things yourself; send Grok back with SPECIFICS for big ones.** A three-line
   authorization fix is Claude's job, not a re-dispatch.
6. **Commit with a why-shaped message** — the log is the design record. Say what was decided and
   why, what reality contradicted, and what was NOT verified.
7. **Update the program file's Part 2**, then move to the next unit.

**State limitations honestly.** If a check could not be run, say so in the commit and to the
owner rather than implying it passed. Example from this program: after fixing an authorization
gate, a live approve could not be re-executed because server actions need a request context that
a test process lacks. That belongs in the commit message.

---

## PART H — Environment

- Dev server: **port 3010** (`npm run dev`). The browser pane cannot paint here — verify screens
  with node-fetch:

```bash
node -e "fetch('http://localhost:3010/<path>',{headers:{cookie:'veyra_acting_member=ae9569dc-c875-4d80-9129-ca83d169b396'}}).then(r=>{console.error('STATUS',r.status);return r.text()}).then(t=>console.log(t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' | ').slice(0,3000)))"
```

- Demo org `d46a53af-58b1-4ed7-87be-c675e5803802`; project Malviya Nagar 3BHK
  `c1d3b37a-9c0c-4263-bfd1-431b935d0597`; Aditi (owner) cookie above.
- **Always filter `org_members` by `org_id`** — names repeat across tenants.
- Migrations: **next free number is 0049** (0001–0048 applied as of 2026-09-20). Grok may apply
  its OWN additive, idempotent migration with
  `node scripts/db.mjs file supabase/migrations/<file>.sql` — never `db.mjs migrate`.
- `gh` CLI is **not installed**; `git push` over HTTPS works and credentials are live.
- Baseline as of 2026-09-20 (procurement complete): `tsc 0 · eslint 0 · 976 tests (975 pass + 1
  skipped live drive) · verify 230/230 · verify-storage 11/11 · build clean`. **Re-measure at the
  start of each program — do not trust this number later.**
- Tag every test row `[<UNIT>-TEST]` so it is findable. `stock_movements` is append-only.

---

## PART I — Program order and collisions

Procurement (U1–U9) is **DONE** (`e750d82`, pushed).

| Program | File | Notes |
|---|---|---|
| Modular Quotation 2.0 | `HANDOFF-DZYLO-MODULAR.md` | Biggest new feature. Part 3 decisions **NOT settled**. U5 is the pricing engine — the load-bearing unit. |
| Inventory | `HANDOFF-DZYLO-INVENTORY.md` | ~90% built; mostly verify+extend. **Q1 & Q2 gate** valuation/transfer work; U3 blocked on Q2; U7 optional on Q6. |
| Business Reports | `HANDOFF-DZYLO-REPORTS.md` | Many units gated (Q3/Q6/Q7/Q8); **U7 gated on Q1, U8 on Q2** — do not dispatch those until answered. |
| Project Management | `HANDOFF-DZYLO-PROJECT.md` | 11 units; U1 CPM engine is load-bearing. |
| AI Project Planning | `HANDOFF-DZYLO-PLANNING.md` | **RUN ONLY AFTER Project Management** — U9/U10 collide with Project U6/U11 on the same files. |

Never run two programs in parallel against this checkout: they share one database, one dev server
on 3010, one migration sequence, and `scripts/verify.mjs` provisions its own test orgs — two
concurrent runs corrupt each other's fixtures and make every count assertion meaningless.

---

## PART J — Known defects, audited 2026-09-20. Fix these in the area you touch.

A four-way read-only audit of the whole app produced the list below. **Each program owns the
items in its own area.** Do not fix another program's items — you will collide with it.

### J1. THE ROOT CAUSE: the guard test has a blind spot

`lib/can-coverage.test.ts:70` matches the filename EXACTLY:

```js
else if (entry === "actions.ts") found.push(full);
```

So any file named `*-actions.ts` is invisible to it — and **every genuinely unguarded write
action in the app lives in one of those three files.** The convention is sound; the enforcement
has a hole, and the hole exactly predicts the bug list.

**The one-line fix** — `entry.endsWith("actions.ts")` — makes the test fail loudly and name all
nine. Whoever touches one of these files first should make that change, guard their own file's
actions, and add the other two files' actions to the test's explicit exemption list ONLY if the
owning program has not run yet. Say in your report that you did it.

Audited counts: **186 exported server actions**; 27 without a guard as the first statement, of
which 5 are pre-session auth, 9 are allowlisted self-service, 1 is the documented token-gated
portal, leaving **9 genuine gaps + 2 probable oversights**.

| File | Unguarded actions | Owning program |
|---|---|---|
| `app/(app)/projects/[id]/plan/smartplan-actions.ts` | `smartPlanAction`, `applySmartPlanAction` — the latter **writes up to 40 milestone rows** | AI Project Planning |
| `app/(app)/production/nesting-actions.ts` | `runNestingAction`, `generateTagsAction`, `advancePanelAction`, `addWorkCenterAction` | Project Management |
| `app/(app)/quotations/ai-boq-actions.ts` | `generateBoqAction` (**writes BOQ lines into any quotationId taken from the form**), `savePromptAction`, `deletePromptAction` | Modular Quotation 2.0 |
| `app/(app)/site/actions.ts` | `checkInAction`, `checkOutAction` — their siblings in the SAME file are guarded, so this reads as oversight | Project Management |

### J2. Reads are largely ungated; writes are not

**59 of 70** in-app pages have no `can()` in the page file. Only 11 guard before reading:
`/billing`, `/design/prompts`, `/finance`, `/finance/payments`, `/finance/petty`,
`/finance/receivables`, `/hr/attendance/admin`, `/projects/[id]/production`, `/reports`,
`/reports/[report]`, `/settings/roles`. Those are the pattern to copy (`can()` then
`<PermissionLimited capability="..." />` on refusal).

This is a defensible trade inside one tenant, but these specific pages render money or
configuration to anyone who types the URL:

| Page | What it exposes | Owning program |
|---|---|---|
| `/finance/[id]` | contract value, milestones, full payment ledger | Business Reports |
| `/approvals`, `/approvals/rules` | every request, amount, requester, threshold | Business Reports |
| `/projects/[id]/finance`, `/projects/[id]/payments`, `/projects/[id]/labour` | project money and labour cost | Project Management |
| `/vendors/[id]/projects` | vendor agreed / disbursed / dues | Inventory (vendors slice) |
| `/orders`, `/orders/[id]` | PO amounts | Inventory |
| `/quotations`, `/quotations/[id]` | quote values **and cost/margin** — see J3 | Modular Quotation 2.0 |
| every `/settings/*` except `/settings/roles` | tenant configuration | whichever program adds a settings card |

### J3. `billing.cost.view` is defined, tickable, and never enforced

It is the capability registry's own headline example — "a supervisor sees the BOQ WITHOUT its
cost columns" — and **nothing checks it**. `app/(app)/quotations/quote-builder.tsx:355-356`
renders `Cost` and `Margin` unconditionally. The member tier already excludes the key, so the
intent exists; only the enforcement is missing. **Modular Quotation 2.0 owns this** and must not
add more money surfaces without wiring it.

Two more keys are defined and never checked: `settings.user.view` (its consumer should be
`/settings/users`) and `billing.invoice.create`.

### J4. Dead code and orphan routes — delete or wire, do not extend

| Item | Status | Owning program |
|---|---|---|
| `/procurement/new` | orphan route; nothing links to it | Inventory |
| `createRfqFromMrAction` | exported, zero callers | Inventory |
| `addStockIn` (`lib/data/inventory.ts`) | superseded by `postStockMovement`; only a test calls it | Inventory |
| `renameSectionAction`, `rescheduleFollowUpAction`, `updateTaskAction` | exported, no callers | Modular (first two), Project Mgmt |
| `renameFolderAction` | guarded, never imported | Project Management |
| `app/(app)/settings/roles/permission-matrix.tsx` | superseded by `role-editor.tsx`, imported by nothing | Business Reports |
| `pipeline_stages` | marked DEAD in `tables.ts`, still allowlisted | leave it |
| `/projects/insights`, `/projects/mb-sheets`, `/projects/renders` | in `lib/nav.ts` as `soon: true`; **no page files exist** | Project Management (U10 un-parks insights) |

### J5. Per-program notes

- **Modular Quotation 2.0** — two lead-status vocabularies are live at once (`lib/leads-model.ts`
  6 values vs `lib/lead-management-model.ts` 14); `/quotations/new` still reads the old one.
  `/quotations` and `/quotations/templates` have no filter, search, sort or pagination. Every AI
  surface is dark for want of `AI_GEMINI_API_KEY` — build so it degrades honestly.
- **Inventory** — `/rfq` has no filters at all while its sibling lists all do. The `/orders`
  order-state multi-select refetches unfiltered and narrows in JS. `bidComparison(id)` is called
  twice per request on `/rfq/[id]`. `tax_pct` is captured on bid lines but excluded from
  `landedLineTotal` (by design — landed cost is qty×rate+freight; do not "fix" it silently).
  Vendor Documents is explicitly unbuilt (`project_files.project_id` is NOT NULL).
- **Business Reports** — CSV export is metered on `/finance/*` via `meterExportAction` but NOT on
  `/reports/[report]`, a second unaccounted read path. `cutlists` and `users` are declared usage
  metrics with no gate and no recorder. `/finance/receivables` degrades with a visible warning if
  migration 0042 is unapplied — keep that honesty. Four delete actions use bare `can()` plus a
  silent `return`, so a refused delete looks like nothing happened.
- **Project Management** — two parallel site-photo systems both writing `site_photos`: `/site`
  stores pasted URLs ("v1 — no file storage yet"), `/projects/[id]/site` has a real upload
  pipeline. The Summary panel links "Site progress" to company-wide `/site` instead of the
  project-scoped route — likely a bug. BOM/cutlist/nesting `status` has no enum. HR visit
  requests are read-only pending a status-vocabulary decision.
- **AI Project Planning** — SmartPlan is already correct about the number rule and worth
  preserving: `parseSmartPlan` drops any step with a money/measurement-shaped key, clamps offsets
  and durations, and `datePlan()` converts to real dates deterministically from a human-chosen
  start. The model produces `offset_days`/`duration_days` only. Generating writes nothing; only
  applying writes, and the server re-validates. **Do not loosen this.** Its two actions are the
  unguarded pair in J1.

### J6. Authentication is OFF — state it in every report

`lib/data/context.ts:33` — `const AUTH_ENABLED = false`. `getOrgContext()` does not consult auth;
it hard-pins `DEMO_ORG_ID` and takes the oldest active member. `/login` is a person picker with
no password: *"anyone with the URL can pick Owner."* Identity is the `veyra_acting_member` cookie.

Tenant isolation is unaffected — `withOrg()` scopes every query correctly, there is simply one
tenant reachable — but **the capability model currently shapes personas, it does not defend
against an outsider.** Do not describe any permission work as "securing" the app until auth is
restored (the path is documented in `with-org.ts`: restore the `getUser()` lookup above the demo
block, flip `AUTH_ENABLED`, restore the password form from git `9fda188`).
