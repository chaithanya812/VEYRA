/**
 * The one date-range vocabulary (PLAN-V4 §3, frames `103904` / `104314` /
 * `110521`).
 *
 * Every analytic screen in the plan carries the same control, so the presets
 * are defined once here rather than re-typed per screen. The financial year is
 * Indian — 1 April to 31 March — because "this year" on a construction P&L
 * means the FY, not January.
 *
 * Ranges are inclusive `yyyy-mm-dd` strings, which is what PostgREST filters
 * and `<input type="date">` both speak. `null` means unbounded, so All time is
 * `{ from: null, to: null }` rather than a sentinel date.
 */

export type RangePreset =
  | "this_month"
  | "last_30d"
  | "this_fy"
  | "all_time"
  | "custom";

export interface DateRange {
  from: string | null;
  to: string | null;
}

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "this_fy", label: "This FY" },
  { value: "all_time", label: "All time" },
  { value: "custom", label: "Custom" },
];

export const ALL_TIME: DateRange = { from: null, to: null };

/** `yyyy-mm-dd` from the date's local parts — never `toISOString()`, which
 *  shifts to UTC and silently moves an Indian evening onto the previous day. */
export function isoDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The 1 April that opens the Indian financial year containing `now`. */
export function fyStart(now: Date): Date {
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 3, 1);
}

/** e.g. "FY 2026-27". */
export function fyLabel(now: Date): string {
  const start = fyStart(now).getFullYear();
  return `FY ${start}-${`${start + 1}`.slice(2)}`;
}

export function resolveRange(
  preset: RangePreset,
  now: Date = new Date(),
  custom?: DateRange,
): DateRange {
  switch (preset) {
    case "this_month":
      return {
        from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "last_30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29); // inclusive of today = 30 days
      return { from: isoDate(from), to: isoDate(now) };
    }
    case "this_fy": {
      const start = fyStart(now);
      return {
        from: isoDate(start),
        to: isoDate(new Date(start.getFullYear() + 1, 2, 31)),
      };
    }
    case "custom":
      return custom ?? ALL_TIME;
    case "all_time":
    default:
      return ALL_TIME;
  }
}

/** Inclusive on both ends; an unbounded end never excludes anything. */
export function isWithin(range: DateRange, value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const d = typeof value === "string" ? value.slice(0, 10) : isoDate(value);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

/** What the control shows once a range is chosen. */
export function rangeLabel(preset: RangePreset, range: DateRange, now: Date = new Date()): string {
  if (preset === "all_time") return "All time";
  if (preset === "this_fy") return fyLabel(now);
  const found = RANGE_PRESETS.find((p) => p.value === preset);
  if (preset !== "custom") return found?.label ?? "All time";
  if (!range.from && !range.to) return "Custom";
  return `${range.from ?? "…"} → ${range.to ?? "…"}`;
}
