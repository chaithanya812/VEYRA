/**
 * Planned vs actual, in one place (PLAN-V4 §3, frames `105010` / `104529` /
 * `104420` / `105913`).
 *
 * The competitor writes this variance five different ways — "Completed 287
 * days late", "Running late by 65 days", "351 days overdue", "3 Days Left",
 * "300 Days Passed" — and renders the worst of them as plain grey text
 * (`104529`). VEYRA computes it once, states it the same way everywhere, and
 * lets the caller render `late` as red **plus an icon**
 * (DESIGN-DIRECTION §7: red text alone is too easy to miss).
 *
 * Pure and timezone-safe: everything reduces to a `yyyy-mm-dd` day, so a late
 * evening in IST never reads as the previous day.
 */

export type VarianceState = "early" | "on_time" | "late" | "pending";

export interface Variance {
  /** Whole days. Positive = late/overdue, negative = early/remaining. */
  days: number;
  state: VarianceState;
  label: string;
}

const MS_PER_DAY = 86_400_000;

function dayKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${value.getFullYear()}-${m}-${d}`;
}

/** Whole days from `a` to `b`. Positive when `b` is later. */
export function dayDiff(a: string | Date, b: string | Date): number {
  const from = Date.parse(dayKey(a) + "T00:00:00Z");
  const to = Date.parse(dayKey(b) + "T00:00:00Z");
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / MS_PER_DAY);
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * How a finished thing compares to its plan — the third line of the Timeline
 * cell in `105010`.
 */
export function completionVariance(
  plannedEnd: string | Date | null | undefined,
  actualEnd: string | Date | null | undefined,
): Variance {
  if (!plannedEnd || !actualEnd) {
    return { days: 0, state: "pending", label: "Not yet completed" };
  }
  const days = dayDiff(plannedEnd, actualEnd);
  if (days > 0) return { days, state: "late", label: `Completed ${plural(days, "day")} late` };
  if (days < 0) {
    return { days, state: "early", label: `Completed ${plural(-days, "day")} early` };
  }
  return { days: 0, state: "on_time", label: "Completed on time" };
}

/**
 * How an unfinished thing is tracking against its due date — the handover
 * strap in `104420` and the delivery cell in `105913`.
 */
export function dueVariance(
  due: string | Date | null | undefined,
  now: string | Date = new Date(),
): Variance {
  if (!due) return { days: 0, state: "pending", label: "No date set" };
  const days = dayDiff(due, now);
  if (days > 0) return { days, state: "late", label: `Running late by ${plural(days, "day")}` };
  if (days < 0) return { days, state: "early", label: `${plural(-days, "day")} left` };
  return { days: 0, state: "on_time", label: "Due today" };
}

/**
 * Estimated against actual progress — the header band in `104529` / `105010`.
 * Both are percentages; the shortfall is what the callout names.
 */
export function progressVariance(
  estimatedPct: number,
  actualPct: number,
): { deltaPct: number; behind: boolean; label: string } {
  const delta = round2(actualPct - estimatedPct);
  if (delta < 0) {
    return {
      deltaPct: delta,
      behind: true,
      label: `Behind schedule, needs attention (▼${Math.abs(delta)}%)`,
    };
  }
  if (delta > 0) {
    return { deltaPct: delta, behind: false, label: `${delta}% ahead of plan` };
  }
  return { deltaPct: 0, behind: false, label: "On plan" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentage of a total, safe on a zero denominator. Always shown with its
 *  denominator in the UI — a bare 6.12% is not trustworthy (PLAN-V4 §5.2). */
export function pctOf(part: number, total: number): number {
  if (!total) return 0;
  return round2((part / total) * 100);
}
