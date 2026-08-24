# HANDOFF — VEYRA: wave-4 build + client-perspective QA (fleet orchestrator)

Paste everything below into a fresh AI coding agent started in
`C:\Users\chait\Downloads\TOO MUCH\RESEARCH 2\VEYRA CRM`. You are the **orchestrator +
review gate** driving a fleet of OpenCode CLI sub-agents. Your two jobs: (A) **verify the
whole product works from a client's perspective and fix anything broken**, and (B) build
the remaining feature-register items using the fleet. Do NOT re-do what's already built.

---

## 0. Read these first (don't re-derive)
1. `HANDOFF-FLEET-AGENT.md` + `HANDOFF-PROMPT.md` — the fleet workflow, hard rules, isolation.
2. `fleet-subagents/CLAUDE.md` + `fleet-subagents/fleet-dispatch.mjs` — how to dispatch/review sub-agents.
3. `ARCHITECTURE.md` — the module pattern, the `withOrg()` keystone, RLS-OFF rule.
4. `competitor-research/FEATURE-REGISTER.md` + `competitor-research/analysis/*.md` + the frames in `competitor-research/source/frames/` — THE backlog. Open the frames before building/QA-ing a screen.
5. `competitor-research/DESIGN-DIRECTION.md` — white/black, red is a RESERVED accent (closed list of jobs). Delegated models violate this often — check every diff.
6. `CREDENTIALS.md` + `.env.local` (gitignored) — real Supabase keys.

## 1. Current state (as of this handoff — DONE, do not rebuild)
- **Branch:** `quotations-v2-plus-fleet` (pushed to `origin`). **Latest commit:** `c390026`.
- **Live production:** https://veyra-five-beta.vercel.app (Vercel project `veyra`, linked in `.vercel/`; CLI authed as `chaithanya812`). Deploy again with `npx vercel --prod --yes`.
- **Supabase:** project `vjupynmjzpdzrluwctzd`. **RLS is OFF by owner decision — do NOT enable it / write policies.** Migrations **0001–0019 applied**.
- **15 modules live, 57 routes, 166 unit tests, `verify.mjs` 28/28** (typecheck·vitest·eslint·`next build` all green at commit time).
- Built across 3 fleet waves (all reviewed + gated + merged):
  - Wave 1: Vendors · Projects · Material Requests · Settings/Config (Indian-FY numbering + (module,action,scope) RBAC) · Interaction layer/Call-logs (REQ-03)
  - Wave 2: RFQ + bid-comparison (L1/L2/L3 landed cost) · Purchase Orders (dual order/payment state, partial receipts) · Inventory (append-only stock-movement ledger + GRN) · Finance (contracts/milestones/payments/P&L) · CRM Pipeline (Kanban + follow-ups)
  - Wave 3: Dashboard · Approval engine (thresholds, reject-needs-comment) · Reports (+CSV) · Design vault (pin-comments + digital sign-off) · Site execution (daily logs, geo attendance, **measurement variance** = the wedge)
  - Earlier: Leads, Items (+CSV import), Quotations v2 (GST split + PDF + version-diff + templates), Subscription/Trial (append-only usage ledger), Billing.

## 2. DEMO CREDENTIALS (for client-perspective testing)
- **Login:** `demo@veyra.app` / `VeyraDemo!2026`  — org id `d46a53af-58b1-4ed7-87be-c675e5803802`.
- Seed/refresh demo data (idempotent): `node scripts/seed-demo.mjs`.
- ⚠️ **The demo tenant is seeded ONLY for the original modules** (a lead, a GST quote with a public `/q/<token>` share link, a trial subscription + usage). **The 15 new modules have NO demo data yet** — so client-perspective QA of Vendors/Projects/RFQ/PO/Inventory/Finance/etc. will show empty states until you create data. **First QA task: extend `scripts/seed-demo.mjs`** to seed a realistic slice across all new modules (a project, a couple vendors, an MR→RFQ→PO→GRN chain, a contract with milestones, some interactions, a pipeline with follow-ups), so the client sees a populated, coherent product.
- ⚠️ You **cannot type passwords or do interactive OAuth** (hard boundary). For authed-UI clicking, ask the owner to log into the preview once; otherwise verify via `verify.mjs` and the in-app browser tools against seeded data.

## 3. Job A — CLIENT-PERSPECTIVE VERIFICATION (do this FIRST, it's the priority)
Treat the live site + local dev as a paying customer would. For EVERY module (all 57 routes — enumerate from `lib/nav.ts`):
1. **Does it build & run?** `npm run dev` (http://localhost:3010). Use the browser preview tools to load each route. Check console/network for errors.
2. **Does it work end-to-end?** Create → read → update on each module against seeded data. Follow the real workflows: MR → RFQ → enter bids → comparison → award → PO → receive goods → GRN → stock ledger; Contract → milestones → payments → P&L; Lead → pipeline → follow-up; Quote → GST/PDF/share.
3. **Design conformance** (DESIGN-DIRECTION.md): white/near-black, red RESERVED (no decorative/status red), status = green/amber/grey with labels, ₹ Indian grouping + right-aligned tabular numerals, designed empty states, sticky table headers.
4. **Data integrity / tenancy:** run `node scripts/verify.mjs`. **GAP TO CLOSE:** verify.mjs currently only covers leads/items/quotations/subscription/templates — it does NOT yet test the 15 new modules' org-isolation. **Extend it** to assert org-scoping + key business rules for each new table (they all use `withOrg()`, so isolation should hold, but prove it).
5. **Anything broken, ugly, or wrong from a client's eyes → log it, then FIX it** (or dispatch a sub-agent to fix a bounded batch). Re-gate after each fix: `npm run typecheck` · `npx vitest run` · `npx eslint app lib components` · `npm run build` (build is mandatory — it catches what the others miss). Then redeploy.
Produce a short **QA report**: per module → works / issues found / fixed.

## 4. Job B — BUILD THE REMAINING FEATURE-REGISTER ITEMS (via the fleet)
Not yet built (deliberately deferred — higher risk, so brief hard / review extra / or build yourself):
- **Production / Factory moat** — BOM explosion → cutlist → nesting → panel-QR traceability → work centers (FEATURE-REGISTER Wave 5; **the entire wedge, no competitor has it**; PLAN §6.6). Big — consider splitting into BOM+cutlist, then nesting+QR.
- **Measurement-mode qty derivation** — port INTERIOR `src/lib/quotation/measure.ts` (area L×W, elevation W×H, linear, count, lumpsum; visible formula; manual override wins). **Touches the pricing engine → highest risk; do it yourself or review extra hard.** Remember: **no LLM ever produces a price** — engine computes, validator verifies.
- **AI prompt-to-BOQ** (REQ, OPS-EST-002) — Claude-only; AI structures scope (rooms→items→qty), the **engine prices**, a validator verifies. Meter via the REQ-04 usage ledger.
- **OTP vendor portal** — public tokenized RFQ page (like the existing `/q/<token>`), email/WhatsApp OTP, vendor enters rates. (PROC-RFQ-004.)
- Smaller register gaps to sweep: cost roll-up beside quoted price, threshold discount-approval wired to the approval engine, RFQ→PO one-click wiring (award currently just flips status), 3-way match (PO↔GRN↔bill), inter-site stock transfers, referral/source analytics, project module tab-bar wiring to the real sub-modules.
Check the FEATURE-REGISTER coverage matrix for the full list; partition into **file-disjoint** slices before dispatching.

## 5. The fleet workflow (unchanged — this is where trust lives)
- **Sibling worker dirs** `../VEYRA-worker`…`../VEYRA-worker5` already exist (node_modules + dummy `.env.local`, no real secrets, own `.git`). **Before each wave: refresh them from the CURRENT repo** so they see the latest tables/modules:
  `robocopy "<repo>" "<worker>" /E /XD node_modules .git .next frames .vercel /XF .env.local tsconfig.tsbuildinfo CREDENTIALS.md WORKER-TASK.md .fleet-manifest.json` (run in PowerShell; exit ≤7 = ok), then write a new `WORKER-TASK.md`, then `git -C <worker> add -A && git -C <worker> commit -m baseline`.
- **Dispatch** (background, ~30-min timeout): `node fleet-subagents/fleet-dispatch.mjs --dir <worker> --model opencode/x-preview-f-free --variant max --brief-file WORKER-TASK.md --write --timeout 1800 --quiet`
- **Models:** Ox Alpha (`opencode/x-preview-f-free --variant max`) for real builds; `opencode/big-pickle` as the second lane; `opencode/hy3-free` fallback. **Max ~4–5 concurrent per model** (Zen rate wall) — spread across two models. Never use the dead id `opencode/ox-alpha-free`.
- **Brief HARD** (free models drift): list every deliverable file, embed the hard rules, assign a **distinct migration number** per worker (next is **0020**), forbid build/dev/migrations/push, give the 3 verify commands. Tell workers they MAY edit only their new files + `lib/data/tables.ts` + `lib/nav.ts` (you merge those 1-line hunks by hand).
- **Review gate (yours, per worker — NEVER trust the manifest's "done"):**
  1. Read the manifest (`ok`, `wroteAnything`, `toolErrors`); reset+reroll on failure, escalate model after 2 fails. Note: a **timeout or Zen "Endpoint unavailable" often still wrote all files** — the code is usually complete but self-unverified; gate it yourself.
  2. `git -C <worker> diff HEAD` + read every new file. Enforce **file-ownership** (reject out-of-scope edits). Check: `withOrg()` only (no raw `admin` outside `lib/data`), no-LLM pricing, design tokens (`--color-red` is the real token; red reserved), server-action files export only async fns (type exports are OK in this Next 16 setup), meaningful tests (not fake-green).
  3. Merge the reviewed files into the repo; hand-merge the `tables.ts`/`nav.ts` hunks.
  4. Re-run in the repo: `npm run typecheck` · `npx vitest run` · `npx eslint app lib components` · **`npm run build`** (mandatory). Fix anything the models got wrong — you own final quality (last wave I fixed a self-contradictory currency-rounding test + unused imports the workers' interrupted self-checks missed).
  5. **You** apply the migration: `node scripts/db.mjs migrate`. Then extend + run `node scripts/verify.mjs`.
  6. Commit per wave. Push + `npx vercel --prod --yes` when the owner says.
- RTK proxy summarizes shell output and can hide real errors — run gate binaries directly when in doubt: `node ./node_modules/typescript/bin/tsc --noEmit`, `node ./node_modules/vitest/vitest.mjs run`, `node ./node_modules/eslint/bin/eslint.js app lib components`, `node ./node_modules/next/dist/bin/next build`.

## 6. Hard rules (never break)
RLS stays OFF; `withOrg()` is the only tenant guard; every tenant table has `org_id` + is in `lib/data/tables.ts` (platform tables `orgs`/`app_users`/`plans` go in `PLATFORM_TABLES`). **No LLM ever produces a price/amount** — config + engine + validator. **Claude-only** for the PRODUCT's AI (OpenCode/etc. as your dev tooling is fine). Additive, idempotent migrations only; never a table named `automations`. Design: red reserved. Workers never touch the real DB / migrate / verify / push, and never get the real `.env.local` or `CREDENTIALS.md`. Don't push/deploy without the owner's ok.

## 7. Recommended next moves (tell the owner, get a yes, then go)
- **Wave 4a (QA + seed):** extend `seed-demo.mjs` across all new modules; extend `verify.mjs`; do the full client-perspective sweep; fix everything found. (Do this before building more — a populated, verified product is worth more than more empty modules.)
- **Wave 4b (build, 4–5 disjoint workers):** Production/BOM+cutlist · nesting+panel-QR · AI prompt-to-BOQ (Claude) · OTP vendor portal · the "smaller gaps" sweep. Measurement-mode qty: build yourself (pricing engine).
- If you find the QA sweep surfaces many small UI/design fixes, dispatch a dedicated "polish" sub-agent per module area with an exact defect list.

## 8. Commands
```
npm run dev            # http://localhost:3010
npm run build          # MANDATORY in review
npm run typecheck
npx eslint app lib components
node scripts/db.mjs migrate      # YOU apply migrations (never workers)
node scripts/verify.mjs          # e2e isolation/business-rule checks vs real Supabase
node scripts/seed-demo.mjs       # idempotent demo tenant (EXTEND this for new modules)
npx vercel --prod --yes          # deploy to production (only when owner says)
```
