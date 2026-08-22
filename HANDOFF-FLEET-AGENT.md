# HANDOFF — VEYRA build + fleet-orchestrator agent

**How to use this:** paste everything below into a fresh AI coding agent started in
`C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`. It is self-contained but points to the
deeper docs. Your job has two halves now: **(A)** keep building VEYRA module-by-module, and **(B)**
where a slice is bounded and file-disjoint, **delegate it to a fleet of OpenCode CLI sub-agents and
review their work** before it lands. You are the review gate. Nothing pushes until the owner says so.

---

## ★ YOUR MANDATE (do this — explicitly)
**Complete the rest of the VEYRA backlog (§5), and complete it by USING SUB-AGENTS — not solo.**
This is a direct instruction from the owner: for each remaining slice, **spin up OpenCode CLI
sub-agents (a "fleet") in isolated worker folders, hand each a bounded, file-disjoint task, run
several in parallel on different models, then REVIEW, fix, and integrate their output yourself**
(full workflow in §3). Do not just build everything by hand — orchestrate the fleet and act as the
review gate. Keep going wave after wave until the backlog in §5 is done, pausing only for the owner's
explicit calls (pushing, or a scope decision that is genuinely theirs). Concretely, each wave:
1. Pick 1–3 disjoint slices from §5; write a `WORKER-TASK.md` brief for each (§3.4).
2. Launch a worker per slice (§3.2–3.3), in parallel, on the best available model (Ox Alpha once the
   owner has run `opencode auth login`; else `hy3`).
3. Review every result yourself — re-run the gates **and `npm run build`**, read the diff, fix issues
   (§3.6), apply any migration, extend + run `verify.mjs`.
4. Merge the clean slices into the main working tree; report; move to the next wave.
The only work you should keep for yourself rather than delegate is the pricing-engine-touching,
high-risk slice (measurement-mode qty) — everything else is fair game for the fleet.

---

## 0. Read these first (foundation — don't re-derive it)
1. `HANDOFF-BUILD-AGENT.md` — the original brief: what VEYRA is, the ⛔ rules, the 7-step "add a
   module" pattern, INTERIOR porting, credentials/DB access. **Everything in it still applies.**
2. `ARCHITECTURE.md` — technical foundation + module pattern.
3. Your memory `veyra-crm-project.md` — current state + the fleet findings (this handoff mirrors it).
4. `competitor-research/FEATURE-REGISTER.md` + `competitor-research/source/frames/` — the backlog and
   the real competitor screenshots. **PRIME DIRECTIVE: read the register rows AND open the frames
   before building a screen.** (Note: some "frames" are B-roll stock photos, e.g. EST_01 — ignore those.)
5. `CREDENTIALS.md` + `.env.local` (gitignored) — real Supabase keys. RLS is OFF; see §2.

---

## 1. Current state (2026-08-22) — done + verified, UNCOMMITTED
Built, reviewed, merged to the **local working tree**, and verified (typecheck · vitest **30/30** ·
eslint · `npm run build` ✓ · `scripts/verify.mjs` **26/26** vs real Supabase · migrations applied):

- **Wave-0 + Leads + Item Master v1 + Quotations v1** (prior work).
- **Quotations v2 — GST modes + PDF** (`0004_quotations_gst.sql`): place-of-supply → CGST/SGST
  (intra) vs IGST (inter) split + rate-wise tax summary + works-contract flag; one-click **PDF**
  via jsPDF (`lib/quotations-pdf.ts`, `components/download-quote-button.tsx`) on the authed quote
  page and the public `/q/<token>` page. Engine additions in `lib/quotations-model.ts`
  (`splitGst`, `deriveTreatment`, `gstRateSummary`, `INDIAN_STATES`), unit-tested.
- **Quote version diff** (`lib/quotations-diff.ts`+test, `app/(app)/quotations/[id]/compare/[otherId]/page.tsx`).
- **Subscription / Trial (REQ-04)** (`0005_subscription.sql`): `plans` (platform) +
  `subscriptions` + append-only `usage_events` ledger (tenant); `lib/data/subscription.ts`,
  `lib/subscription-model.ts`(+test), `app/(app)/billing/page.tsx`, nav Billing live.
- **CSV bulk item import** (`lib/items-csv.ts`+test, `bulkCreateItems` in `lib/data/items.ts`,
  `app/(app)/items/import/page.tsx`).

**⚠ Everything above is uncommitted and unpushed** (owner: "don't push until review"). Migrations
0004 + 0005 ARE applied to the real DB. Demo tenant (`demo@veyra.app` / `VeyraDemo!2026`, org
`d46a53af-58b1-4ed7-87be-c675e5803802`) has: a GST quote with a live share link, a trial
subscription + seeded usage. `node scripts/seed-demo.mjs` is idempotent.

**First thing to consider:** offer to commit this reviewed work to a local branch (snapshot; still
no push) so it isn't lost.

---

## 2. Hard rules (unchanged — never break)
- **RLS is OFF** on Supabase `vjupynmjzpdzrluwctzd` by owner decision. Don't enable it / write
  policies. `lib/data/with-org.ts` (`withOrg()`) is the ONLY tenant guard. Every tenant table has
  `org_id`, is listed in `lib/data/tables.ts`, and is reached only via `withOrg()`. Platform tables
  (no org_id: `orgs`, `app_users`, `plans`) go in `PLATFORM_TABLES`.
- **No LLM ever produces a price/amount.** Rates are config; an engine computes; a validator
  verifies. This applies to delegated code too — review for it.
- **Claude-only for the PRODUCT's AI features** (REQ-01). Using OpenCode/Gemini/etc. as your *coding
  tools* is fine — that's dev tooling, not a product AI provider.
- **Design:** white bg, near-black text, **red is a reserved accent (closed list of jobs)** — status
  uses green/amber, never decorative red. Delegated models violate this often — check every diff.
- Additive, idempotent migrations only; `org_id` on every tenant table; never a table named
  `automations`. Indian GST (HSN/SAC, place-of-supply, works-contract) + Indian FY numbering + DPDP.
- Secret key is server-only; the lint rule bans importing `lib/supabase/admin` outside `lib/data`.
- **You cannot type passwords / do interactive OAuth logins** (hard boundary). Verify auth-gated
  flows via `verify.mjs`; the owner logs into the preview once for you to click the authed UI.

---

## 3. The fleet workflow (delegate to OpenCode sub-agents; you review)

### 3.1 The golden rule
Delegate **bounded, file-disjoint** slices. **Treat every worker's "✅ all green" as UNVERIFIED.**
Re-run the gates yourself **and always `npm run build`** — models skip the build, and that is exactly
how a `"use server"` bug (a server-action file may only export async functions; a worker re-exported
a *type*) sailed past typecheck+vitest+eslint. The review gate is the whole point.

### 3.2 Set up an isolated worker (one folder per task)
Sibling folder `../VEYRA-workerN`:
1. `robocopy "<repo>" "<worker>" /E /XD node_modules .git .next frames /XF .env.local tsconfig.tsbuildinfo`
   (exit ≤7 = success). **PowerShell gotcha:** a script containing both robocopy `/E` and
   `Remove-Item` trips a path-protection guard — run them as separate commands.
2. Strip secrets: delete `CREDENTIALS.md` and `.vercel` from the copy. Write a **dummy** `.env.local`
   with fake Supabase values (keys: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_JWKS_URL, DATABASE_URL) so
   build/typecheck don't crash. **Never copy the real `.env.local` into a worker.**
3. `git init` + baseline commit → your `git diff HEAD` later == exactly what the model changed.
4. `npm install`.
5. Write a `WORKER-TASK.md` brief in the folder (see 3.4).

### 3.3 Run a worker (headless, background)
```
cd <worker> && export OPENCODE_DISABLE_AUTOUPDATE=1 && \
export GOOGLE_GENERATIVE_AI_API_KEY="$GEMINI_API_KEY" && \
opencode run --model <model> --auto "Read WORKER-TASK.md and IMPLEMENT it — actually create/edit \
files, do not just read. Then run npm run typecheck; npx vitest run; npx eslint app lib components \
and fix until all pass. Do NOT run build/dev/migrations/verify. Do NOT push or commit to a remote. \
Print files changed + final pass/fail."
```
Run it with a background runner; you're notified on completion.

**Models** (`opencode models` to list; `opencode auth list` to see credentials):
- **Ox Alpha** (owner's preferred, "Ox Alpha Free (Unlimited)" on OpenCode Zen) — needs a one-time
  `opencode auth login` (Zen) which **the owner does** (you can't log in). After that it appears in
  `opencode models` and the shared `auth.json`; use its exact slug (`opencode/ox-alpha-...`).
- **Free headless models (no login):** `opencode/hy3-free` (the only reliably-completing one so far),
  and the flakier `nemotron-3-ultra-free`, `big-pickle`, `mimo-v2.5-free`, `x-preview-f-free`.
- Google provider needs `GOOGLE_GENERATIVE_AI_API_KEY` (alias it from `GEMINI_API_KEY` as above).

**Reliability reality:** these models flake — they explore-then-quit, or write broken/incomplete
code, while reporting success. Mitigations: (a) a **forceful, file-by-file** brief that lists every
deliverable and says "you MUST use the write/edit tools now, do not stop after reading"; (b) re-run
on failure; (c) reset the worker to baseline (`git reset --hard HEAD && rm untracked`) between rolls;
(d) fall back to `hy3`, or just build it yourself if a task flakes 2–3×.

### 3.4 The brief (`WORKER-TASK.md`)
Ground it in the repo: tell the model to READ the relevant reference files first (e.g.
`ARCHITECTURE.md`, `lib/data/leads.ts`/`quotations.ts`, `lib/*-model.ts`, `lib/data/tables.ts`,
`DESIGN-DIRECTION.md`), state the exact deliverable files, embed the hard rules (withOrg, no-LLM
pricing, red-is-reserved, additive migration), and list the three verification commands. Keep tasks
**file-disjoint** across concurrent workers (partition by module) so merges don't collide — small
shared files (`tables.ts`, `nav.ts`) are 1-line adds you merge by hand.

### 3.5 Migrations / SQL — how it actually works
**Yes, workers write the SQL.** `0005_subscription.sql` was model-authored (tables, indexes, seed).
But workers have **dummy DB creds and must NOT run migrations or verify.mjs.** Flow: the worker
writes `supabase/migrations/000N_*.sql` → you review the DDL (additive, idempotent, `org_id`, no RLS,
right platform/tenant split) → **you** apply it to the real DB with `node scripts/db.mjs migrate` →
you extend and run `scripts/verify.mjs`.

### 3.6 The review gate (do ALL of this in the main repo)
1. `git diff` the worker vs its baseline; **read the code.** Check: org isolation (withOrg + tables.ts),
   no-LLM pricing, design tokens (no reserved red), Next server-action rules (only async exports),
   dedupe/business rules, tests are meaningful (not fake-green).
2. Merge the reviewed files into the main repo (copy them; for shared files apply the hunk).
3. Re-run in main: `npm run typecheck` · `npx vitest run` · `npx eslint app lib components` ·
   **`npm run build`** (mandatory) · apply any migration · extend + run `node scripts/verify.mjs`.
4. Fix anything the models got wrong (you own the final quality). Only then is the slice "done."

---

## 4. GitHub vs. local folders
Stay with **local isolated folders** (proven, private, no worker auth). GitHub PRs are optional and
don't change verification — that always happens in a local checkout against real Supabase. Workers
run headless and must not push. If the owner wants PRs, *you* (the reviewer) create branches/PRs via
`gh` **after** review, never the workers. Repo remote already exists:
`https://github.com/chaithanya812/VEYRA` (branch `main`) — push only when the owner asks.

---

## 5. Remaining backlog (fan these out; keep tasks disjoint)
- **Quotations v2 (remaining):**
  - *Measurement-mode qty derivation* — port INTERIOR `src/lib/quotation/measure.ts` (area L×W,
    elevation W×H, linear, count, lumpsum; qty from dimensions with a visible formula; manual
    override wins). **Touches the pricing engine → highest risk; do it yourself or review extra hard.**
  - *Rate components* (multi-component lines) — structural change to the line model; risky.
  - *Quote templates / presets* ("3BHK Premium": save section/scope sets, instantiate) — self-contained,
    **good to delegate** (needs a new table → the worker writes the migration, you apply it).
  - *Threshold/discount approval* (P1), *AI prompt-to-BOQ* (Claude-only, engine prices — P1).
- **Then:** config/permission engine (`(module,action,scope)` + field-level visibility + numbering
  series + custom fields), Projects, Procurement (deeply specced by the teardown), Inventory,
  Production (the moat: BOM/cutlist/nesting/panel QR + site-measurement variance).

---

## 6. Commands
```
npm run dev            # http://localhost:3010  (.claude/launch.json "veyra")
npm run build          # MANDATORY in review
npm run typecheck
npx eslint app lib components
node scripts/db.mjs migrate      # apply migrations (pooler) — YOU run this, not workers
node scripts/verify.mjs          # e2e isolation/business-rule checks vs real Supabase
node scripts/seed-demo.mjs       # idempotent demo tenant
```

## 7. What NOT to do
Don't trust worker self-reports. Don't skip `npm run build`. Don't let a worker run migrations /
verify / touch the real DB / push, and never give a worker the real `.env.local` or `CREDENTIALS.md`.
Don't push without the owner's ok. Don't break the §2 rules. Don't enable RLS. Don't let scope drift
into re-building the competitor's CRM surface instead of the downstream moat.
