# OpenCode-as-subagents — how it works today + how to scale it

Notes for the agent designing a fleet-orchestration architecture. Part 1 = exactly what I
(the orchestrator, Claude Code) do today. Part 2 = the failure modes I hit. Part 3 = the
architecture to make this efficient and robust, including the Ox Alpha ("oxworld") fix.

---

## 1. The mental model
- **Orchestrator + review gate = me** (one Claude Code session). **Builders = OpenCode CLI
  instances**, each run *headless* (`opencode run`, non-interactive) in its own isolated repo copy,
  on a chosen model. I brief them, launch them in the background, then review + verify + merge.
- The builders are cheap and disposable; the trust lives entirely in **my review**, never in the
  builder's self-report.

## 2. As-is mechanics (reproducible)

### 2.1 Model discovery + auth
- `opencode models` → provider/model list. `opencode auth list` → credentials + env keys.
- **Free OpenCode Zen models run ANONYMOUSLY** (with an empty `~/.local/share/opencode/auth.json`):
  `opencode/hy3-free` (the only *reliable* one), `nemotron-3-ultra-free`, `big-pickle`,
  `mimo-v2.5-free`, `x-preview-f-free`. This is why the fleet works with zero login.
- Google provider models need `GOOGLE_GENERATIVE_AI_API_KEY` (I alias it from the existing
  `GEMINI_API_KEY` in-shell; I never see/handle the value).
- **Ox Alpha ("Ox Alpha Free / Unlimited")** shows in the interactive TUI but is **NOT in the
  headless CLI model list**, and force-calling `opencode/ox-alpha-free` returns a Zen **server
  error**, and the `sk-` API key offered was **rejected** (0 creds registered). Conclusion: it needs
  a real Zen **account login** the headless CLI lacks — see §4.6.

### 2.2 One isolated worker (per task)
Sibling folder `../VEYRA-workerN`:
1. `robocopy <repo> <worker> /E /XD node_modules .git .next frames .vercel /XF .env.local CREDENTIALS.md tsconfig.tsbuildinfo`
   (exit ≤7 = ok). *PowerShell gotcha: robocopy `/E` + `Remove-Item` in one script trips a guard —
   keep them separate.*
2. Write a **dummy** `.env.local` (fake Supabase values) so build/typecheck don't crash. Never copy
   the real `.env.local`, `CREDENTIALS.md`, or `.vercel`.
3. `git init` + baseline commit → `git diff HEAD` later == exactly the model's changes.
4. `npm install`.
5. Write `WORKER-TASK.md` (the brief).

### 2.3 Launch (headless, background)
```
cd <worker> && export OPENCODE_DISABLE_AUTOUPDATE=1 && \
opencode run --model opencode/hy3-free --auto "Read WORKER-TASK.md and IMPLEMENT it — you MUST use \
the write/edit tools (list every deliverable file), do not stop after reading. Then run npm run \
typecheck; npx vitest run; npx eslint app lib components and fix until all pass. Do NOT run \
build/dev/migrations/verify. Do NOT push. Print files changed + pass/fail."
```
Useful flags: `--model provider/model`, `--auto` (auto-approve perms — safe *because* isolated),
`--format json` (machine-readable events — underused, see §4.4), `--agent`, `--continue/--session/
--fork`, `--variant high|max`, `--attach <url>` (attach to a running `opencode serve`).

### 2.4 The review gate (never skipped)
1. `git diff` vs baseline; **read the code**.
2. Re-run `npm run typecheck` · `npx vitest run` · `npx eslint app lib components` · **`npm run build`**.
3. Merge into main; **apply any migration myself** (`node scripts/db.mjs migrate` — workers have
   dummy creds and must not touch the DB); extend + run `node scripts/verify.mjs`.
4. Fix anything the model got wrong; only then is the slice done.

## 3. Failure modes observed (and mitigations)
| Failure | Seen on | Mitigation |
|---|---|---|
| Explore-then-quit (reads files, writes nothing) | x-preview, hy3 (1st CSV try) | Forceful, file-by-file brief ("you MUST write files"); reset + reroll |
| Broken/incomplete code, still reports success | nemotron (CSV) | Re-run gates myself; reset + reroll on a better model |
| **Passes typecheck/vitest/eslint but breaks `npm run build`** | hy3 (CSV: a `"use server"` file re-exported a TYPE — illegal) | **Build is mandatory in review**; encode as an invariant check |
| Design-system violation (reserved **red**) | hy3 (version-diff, subscription) | Read every diff; grep for `color-red` |
| Writes SQL but can't run it | all (dummy creds) | Orchestrator applies migrations |
**Net:** among free models only `hy3` reliably completes, and only with a forceful brief. Model
choice + review gate are load-bearing, not optional.

## 4. Recommended architecture to scale this (the to-be)

### 4.1 Isolation: git worktrees > full copies
Replace robocopy+`npm install` per folder with `git worktree add ../wt-<task> -b fleet/<task>` off a
shared repo. Cheaper, shares the object store, trivial diffs, natural per-task branch → merge via
rebase/PR. Solve the node_modules cost with **pnpm + a shared content-addressed store** (or a hoisted/
symlinked `node_modules`) so you don't reinstall N times.

### 4.2 Model pool + routing
A registry: `{model, provider, reliability_score, max_concurrency, cost_tier, needs_auth}`. Route by
task risk: risky/engine-touching → best (Ox Alpha/paid), plumbing → cheap/free, **hy3 as universal
fallback**. Smoke-test each model at wave start; back off on rate limits; auto-escalate a task to a
stronger model after N failed rerolls.

### 4.3 Task graph + file-ownership partitioning
Model the backlog as a DAG where each task declares the **files/dirs it will own**. A scheduler picks
a maximal **file-disjoint** set to run in parallel → merges are conflict-free by construction.
Coupled tasks (e.g. anything touching the pricing engine) serialize. Briefs are generated from a
template + the FEATURE-REGISTER row + the matching frame.

### 4.4 Structured I/O (catch failures early + automate)
Run workers with `--format json` and parse the event stream to detect: did it actually write files
(kills "explore-and-quit"), which files, and the gate results. Require the worker to print a
**result manifest** (files changed + each command's pass/fail) you parse — don't trust prose.

### 4.5 Automated review harness
A script that, per finished worker, runs typecheck+vitest+eslint+**build**+verify in the worktree and
**only surfaces gate-passing diffs** to me. Plus repo-invariant static checks (fast, deterministic):
- `import "server-only"` present in every `lib/data/*`; no `lib/supabase/admin` import outside `lib/data`.
- new tenant tables carry `org_id` AND appear in `lib/data/tables.ts`.
- no `export type`/type re-export in a `"use server"` file.
- no reserved-red misuse (grep `color-red` in new UI, allow known destructive/error patterns).
- migrations additive + idempotent (`create table if not exists`), no RLS, never named `automations`.
Encode these as a `scripts/invariants.mjs` so review is 80% automated; I do the judgment 20%.

### 4.6 Auth / the Ox Alpha ("oxworld") fix
The headless CLI reads `~/.local/share/opencode/auth.json`. To use Zen **account** models
(Ox Alpha) headlessly, the **human** runs `opencode auth login` ONCE (OAuth in a browser, or a valid
Zen API key) — that writes `auth.json`, which every worker then inherits. Notes:
- The AI/orchestrator must **never type the key** (hard boundary) — auth is a one-time human step that
  populates a shared credential store the fleet reads.
- The `sk-` key tried was rejected → it's almost certainly **not a Zen key** (wrong provider). Verify
  the provider: `opencode auth login --provider <right-provider>`; an OpenRouter key, e.g., unlocks a
  large model catalogue via `--provider openrouter`.
- Consider running one **`opencode serve`** (authenticated server) and pointing all workers at it via
  `opencode run --attach http://localhost:<port>` — a shared authenticated session pool instead of
  re-auth per invocation.

### 4.7 Control plane
A parent controller (Node/TS, or an **MCP server** I call as a tool) that: creates worktrees,
launches `opencode run --format json` workers, tails/parses their output, runs the review harness, and
reports structured status back to me — so I `spawn_task/collect_result` through a clean interface
instead of hand-rolling bash each wave. **That controller is the thing worth building.**

### 4.8 Safety invariants to preserve (non-negotiable)
Workers get dummy DB creds, no git remote, no real secrets, `--auto` only inside isolation.
Migrations/DB writes/pushes happen only via the reviewer. The AI never enters credentials/keys.

## 5. Minimal first build for the architecture agent
A `fleet` controller that reads `tasks.yaml` (`{id, files_owned, model, brief}`), and per task:
(1) `git worktree add`; (2) `opencode run --format json --model … --auto`; (3) parse the result
manifest; (4) run the gate+build+invariant harness; (5) emit a JSON report. Ship it sequential first,
then add the disjoint-parallel scheduler (§4.3) and model routing (§4.2).
```
