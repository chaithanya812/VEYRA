# SPEC — Design Prompt Library

**Status:** proposal, scoped down and agreed. Written 2026-09-05.
**Supersedes:** the room/fit-engine proposal, which the owner rejected. Do not build that.
**Read alongside:** HANDOFF-V9.md (authoritative). Nothing here changes a rule in it.
**Prototype:** an interactive demo of the intended behaviour exists as an Artifact.

---

## 1. What this is

Designers do not want an image generator inside the CRM. They are happy to copy a
well-written prompt, paste it into Gemini / ChatGPT / AI Studio with their own reference
photo, and bring the result back. VEYRA supplies the prompt; the external tool does the pixels.

Two surfaces:

1. **A prompt template library** — templates with fill-in variables and reusable guard
   clauses, not a list of fixed strings.
2. **An inspiration board** — where the team posts references they collect.

**No AI is called anywhere in this feature.** Assembling a prompt is string substitution.
That matters more than it sounds: every existing AI surface in VEYRA is dead in production
because `AI_GEMINI_API_KEY` is unset (HANDOFF-V9 §5.4). This feature ships live on day one.

### Explicitly not in scope
Image generation, fabric/material swapping, 2D→3D, text-to-image, room geometry, fit
checking, conflict detection, quotation validation. All previously discussed, all dropped.

---

## 2. Reuse — most of this already exists

### The table exists
`supabase/migrations/0025_quotation_studio.sql`, used by `lib/data/quotation-studio.ts`:

```
ai_prompt_templates (id, org_id, name, prompt, kind, seq, is_system, is_active,
                     created_by, created_at)
    kind: 'quotation' | 'material_request'
```

Per-tenant, seedable with system examples, renameable, soft-deactivatable via `is_active`.
**Adding `'design'` to the `kind` vocabulary is the migration.** Everything else is a screen.

### The image vault exists
`lib/design-model.ts` + `app/(app)/design` — assets with kinds
`2d | 3d | boq | render | photo | other`, pinned comments at `x_pct,y_pct`, and a sign-off
ladder. A render brought back from Gemini is uploaded here and gets client sign-off already.

### The AI log exists — and must not be used here
`ai_requests` is the append-only ledger of real model calls. Copying a prompt calls no model.
**Logging a copy there would corrupt the "what did the AI cost us this month" answer that
table exists to give.** If usage tracking is wanted, `usage_events` is the right ledger.

---

## 3. What is new

### 3.1 Variables

A template body carries `{{name}}` placeholders. The variable list is **derived from the
body**, never stored separately — a stored list and a body that disagree is a bug waiting to
happen, and this is the same "derived, never stored" rule as totals (HANDOFF-V9 §2).

```
Using the attached photo of the {{room}}, replace only the {{surface}}
with {{material}} in {{colour}}, with a {{finish}} finish.
```

A per-tenant **vocabulary** supplies suggested values per variable name (`room`, `surface`,
`material`, `colour`, `style`, `finish`, `hardware`, `lighting`). Unknown variable names fall
back to a free-text input rather than failing — a template must never be unusable because
someone invented a placeholder.

### 3.2 Guard clauses

The single biggest quality difference between a good and bad image-edit prompt is the
instruction to *change only what was asked*. Without it the model regenerates the room and
the designer loses the client's actual space.

So the library ships a clause set, appended under a `CONSTRAINTS` heading:

| Clause | Default |
|---|---|
| Preserve everything else | **Locked on** — this is what makes it an edit, not a regeneration |
| Keep camera & perspective | on |
| Keep lighting | on |
| Realistic scale | on |
| Photorealistic output | on |
| Indian context | off |
| Return N variations | off |
| No text or watermarks | off |

The preserve clause being non-optional is a deliberate product decision, not an oversight.

### 3.3 Assembly

`assemblePrompt(template, values, clauses)` → `{ text, missing[] }`. Pure, testable, no I/O.
Unfilled variables stay visible as `{{name}}` in the output and are counted in `missing`, so a
half-filled prompt is obviously half-filled rather than silently shipping a blank.

### 3.4 The inspiration board

A posted reference: an image, a title, where it came from, and tags.

⚠️ **Open question — the one real fork.** `/design` assets are **project-scoped**, and an
inspiration usually is not: a fluted-teak reference is a firm-wide idea that may inform six
projects. Three options:

1. A firm-wide board as its own table. Cleanest semantics; a new table (three edits).
2. Ride `/design` with a new asset kind and a nullable project. Fights the existing model —
   `project_files.project_id` is `not null` and projects never share (HARD RULE).
3. Board belongs to a project, and firm-wide references are simply not supported.

**Recommendation: (1).** It is the honest shape and it avoids relaxing a not-null column that
the whole project-isolation guarantee rests on.

---

## 4. Suggestions worth taking

Ordered by value per unit of work. None is required for a first cut.

1. **Seed genuinely good prompts, and treat that as the feature.** A library of ten mediocre
   prompts is worthless; ten sharp ones are the entire product. The prompts in the prototype
   are a starting draft — they should be reviewed by someone who has actually run them.
2. **Save a filled prompt back as a template.** A designer who fills a template well has
   authored a better template. One button, high value.
3. **Favourites, stored per person.** Cheap, and it is how a library of 40 stays usable.
4. **A "before you send it" checklist** — which images to attach, in which order. Most
   failures with these tools are a missing or misordered attachment, not a bad prompt.
5. **Link a prompt to the project it was used on**, so the render, the prompt and the
   sign-off sit together. Uses `/design` as it already stands.
6. **Character count on the assembled prompt.** Some tools truncate; a visible length is a
   cheap guard.
7. **Do not build prompt versioning yet.** It sounds right and nobody will use it. Wait until
   a tenant asks.
8. **Do not build usage analytics yet.** Same reason.

### On the outbound links
Buttons to Gemini / ChatGPT / AI Studio are the honest version of the feature and cost nothing
to run — but they put a competitor's brand on a VEYRA screen and send the user away.
**This is a positioning decision for the owner, not a technical one.** The feature works
without them (copy to clipboard, paste anywhere).

---

## 5. Build order

1. **Migration 0044** — `'design'` in the `kind` vocabulary; the board table if option (1)
   above is chosen. Register in `lib/data/tables.ts`; add BOTH isolation assertions to
   `scripts/verify.mjs`.
2. **`lib/prompt-library-model.ts`** — `extractVariables`, `assemblePrompt`, the clause set,
   the vocabulary. Pure, with tests, before any screen.
3. **Data layer** through `withOrg()`. Return PostgREST errors verbatim.
4. **The screen** — list, search, filter, composer. Filter state in the URL, resolved on the
   server from `searchParams`.
5. **Seed** the system prompts.
6. **The board**, if it is in the first cut.

---

## 6. Rules that apply

- **New capabilities needed.** There is no `design.*` capability group today; `/production`
  guards on `projects.project.edit`. Suggested: `design.prompt.view` / `design.prompt.edit`
  and `design.inspiration.view` / `design.inspiration.edit`. An unknown key **fails closed and
  refuses everyone, owner included** (HANDOFF-V9 §3.1).
- **Every server action opens with `requireCan()`** as its first statement.
  `lib/can-coverage.test.ts` walks the real files and fails the suite otherwise.
- **`org_id uuid not null references public.orgs(id) on delete cascade`** on any new table.
  Additive, idempotent. RLS stays OFF.
- **`<Button asChild><Link/></Button>`**, never the reverse.
- **`router.refresh()`** after a mutation from a client component — the composer and the board
  are both client-side and mutation-heavy, which is exactly where the spring-back defect lives.
- **Key uncontrolled inputs on their resolved state** — a soft navigation re-renders without
  remounting, and the search box would keep the previous query.
- **Red keeps its five jobs.** A locked clause is not an error; the lock chip is neutral, not red.
- **Six gates, then open the browser and click it.**
