/**
 * The categorical data palette (PLAN-V4 §4.1) as values code can read.
 *
 * Two rules make this work, and they are the whole point of centralising it:
 *
 * 1. **Order is fixed.** Series 0 is the same colour on every screen, so a
 *    reader who learns "blue = pending" on one chart is not re-learning it on
 *    the next.
 * 2. **Charts and module identity only.** Never a button, a border, a nav pill
 *    or text emphasis — those stay black/grey/white, and red keeps its closed
 *    list of five jobs (DESIGN-DIRECTION §2).
 */

export const CHART_SERIES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const;

export const CHART_SERIES_TINT = [
  "var(--color-chart-1-tint)",
  "var(--color-chart-2-tint)",
  "var(--color-chart-3-tint)",
  "var(--color-chart-4-tint)",
  "var(--color-chart-5-tint)",
  "var(--color-chart-6-tint)",
] as const;

/** Colour for the nth series. Cycles — a legend with 9 slices still renders. */
export function seriesColor(index: number): string {
  return CHART_SERIES[((index % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length];
}

export function seriesTint(index: number): string {
  return CHART_SERIES_TINT[
    ((index % CHART_SERIES_TINT.length) + CHART_SERIES_TINT.length) % CHART_SERIES_TINT.length
  ];
}

/**
 * Stable colour for a named category, so "Carpentry Woodwork" is the same hue
 * on the labour donut, the expense donut and the vendor chip — even though the
 * two charts sort their categories differently. A hash, not an index.
 */
export function colorForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return seriesColor(Math.abs(h));
}

/**
 * Module identity (PLAN-V4 §4.3). One hue per top-level group, used only on
 * its rail icon and, later, its card in the project Modules grid (`104705`).
 * Never on a button or an active state.
 */
export const MODULE_COLOR: Record<string, string> = {
  sales: "var(--color-chart-1)",
  execution: "var(--color-chart-2)",
  operations: "var(--color-chart-4)",
  accounting: "var(--color-chart-5)",
  hr: "var(--color-chart-3)",
  admin: "var(--color-chart-6)",
};
