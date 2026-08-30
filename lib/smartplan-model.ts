/**
 * SmartPlan — the pure half (PLAN-V4 §9.2, frame `105010`'s `SmartPlan` button).
 *
 * The owner: *"sometimes they might need to put some documents in there to
 * create the plan… there's just something about a smart plan, add that
 * feature."*
 *
 * ⛔ HARD RULE 2, restated for this surface. **The model proposes an ORDER, not
 * a calendar and not a number that costs anything.** It returns milestone
 * names, a relative day offset, a duration in days, and which earlier
 * milestones a step waits on. It does not return dates — those are computed
 * here, deterministically, from a start date a person chose. It does not return
 * prices, rates, quantities or amounts, and `parseSmartPlan` strips every
 * price-shaped field even if a model tries, exactly as `parseAiBoq` does.
 *
 * Why offsets rather than dates: a date from a model is a guess about the
 * calendar dressed up as a fact — it will land on a Sunday, or in a month the
 * project has not reached. An offset is a statement about sequence, which is
 * the thing a model is actually good at. `applyMilestoneTemplates()` already
 * turns offsets into dates; this follows the same path so a SmartPlan and a
 * template produce identical rows.
 */

export interface SmartPlanStep {
  name: string;
  /** Days after the plan's start date. Never negative. */
  offsetDays: number;
  /** How many days the step runs. At least one. */
  durationDays: number;
  /** Indices of earlier steps in this same list. Never forward, never itself. */
  dependsOn: number[];
}

export interface SmartPlanProposal {
  steps: SmartPlanStep[];
  /** The model's one-line reasoning, shown above the draft. Never authoritative. */
  note: string | null;
}

/** A model that proposed forty milestones has stopped being useful. */
export const MAX_STEPS = 40;
/** Three years of offset is already implausible for an interior fit-out. */
export const MAX_OFFSET_DAYS = 1095;
export const MAX_DURATION_DAYS = 365;

/** The exact JSON contract the model is asked for, kept beside its validator. */
export const SMARTPLAN_JSON_SHAPE = `{
  "note": "string | null — one short line on how the sequence is organised",
  "milestones": [
    {
      "name": "string — the milestone, e.g. \\"False Ceiling Channel Work\\"",
      "offset_days": "integer — days after the plan start when this begins (the first is 0)",
      "duration_days": "integer — how many days it runs (at least 1)",
      "depends_on": "array of integers — indices of EARLIER milestones in this list"
    }
  ]
}`;

/**
 * Any key that smells of money or measurement. A model that volunteers one is
 * ignored rather than trusted — the same defence `parseAiBoq` uses.
 */
const FORBIDDEN_KEY =
  /(price|rate|cost|amount|budget|total|value|qty|quantity|uom|unit|inr|rupee|currency|₹)/i;

function int(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Validate and sanitise a raw model response.
 *
 * Repairs per step where a repair is obvious (a missing duration becomes one
 * day, a negative offset becomes zero) and rejects only when the top-level
 * structure is unusable — a single malformed row should not cost the user the
 * whole proposal. Everything the model sends beyond the four fields above is
 * dropped on the floor.
 */
export function parseSmartPlan(
  raw: unknown,
): { plan: SmartPlanProposal } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "SmartPlan returned nothing usable." };
  }
  const list = (raw as { milestones?: unknown }).milestones;
  if (!Array.isArray(list)) {
    return { error: "SmartPlan's response had no milestones array." };
  }

  const steps: SmartPlanStep[] = [];
  for (const row of list.slice(0, MAX_STEPS)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;

    // Defence in depth: if the model attached a price to a milestone, the whole
    // step is suspect. Drop it rather than quietly keeping the half we like.
    if (Object.keys(r).some((k) => FORBIDDEN_KEY.test(k))) continue;

    const name = str(r.name);
    if (!name) continue;

    const offset = Math.min(MAX_OFFSET_DAYS, Math.max(0, int(r.offset_days, 0)));
    const duration = Math.min(MAX_DURATION_DAYS, Math.max(1, int(r.duration_days, 1)));

    const here = steps.length;
    const deps = Array.isArray(r.depends_on)
      ? [
          ...new Set(
            r.depends_on
              .map((d) => int(d, -1))
              // A dependency on a later step, or on itself, is a cycle. There is
              // no honest way to render one, so it is dropped.
              .filter((d) => d >= 0 && d < here),
          ),
        ].sort((a, b) => a - b)
      : [];

    steps.push({ name: name.slice(0, 120), offsetDays: offset, durationDays: duration, dependsOn: deps });
  }

  if (steps.length === 0) return { error: "SmartPlan produced no usable milestones." };

  const note = str((raw as { note?: unknown }).note);
  return { plan: { steps, note: note ? note.slice(0, 300) : null } };
}

export interface DatedStep extends SmartPlanStep {
  plannedStart: string;
  plannedEnd: string;
}

/**
 * Turn offsets into real dates. **This is the only place a SmartPlan date comes
 * from**, and it is arithmetic on a date a person picked — identical to what
 * `applyMilestoneTemplates()` does for a template.
 */
export function datePlan(
  steps: SmartPlanStep[],
  startDate: string,
): { dated: DatedStep[]; error?: string } {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start.getTime())) {
    return { dated: [], error: "Pick a start date." };
  }

  const iso = (d: Date) =>
    `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-${`${d.getUTCDate()}`.padStart(2, "0")}`;

  return {
    dated: steps.map((s) => {
      const from = new Date(start);
      from.setUTCDate(from.getUTCDate() + s.offsetDays);
      const to = new Date(from);
      // Inclusive: a one-day step starts and ends on the same day.
      to.setUTCDate(to.getUTCDate() + s.durationDays - 1);
      return { ...s, plannedStart: iso(from), plannedEnd: iso(to) };
    }),
  };
}

/** The last day the plan touches — what the reviewer checks against handover. */
export function planEndDate(dated: DatedStep[]): string | null {
  return dated.reduce<string | null>(
    (latest, s) => (latest === null || s.plannedEnd > latest ? s.plannedEnd : latest),
    null,
  );
}
