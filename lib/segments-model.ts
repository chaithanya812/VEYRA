import { seriesColor } from "./palette";

/**
 * One count split across stages, as a proportional bar plus a legend
 * (PLAN-V4 §3, frames `105729` / `105913` / `110458`).
 *
 * `105729` stacks `Pending (39) · RFQ Raised (11) · Ordered (127)` in a single
 * cell — the shape that finally expresses "a request has no single status; its
 * items split across stages". `105913` does the same for payment state. One
 * model, one component.
 *
 * Zero-value segments are kept, not dropped: a legend that silently loses
 * "Partial Done (0)" makes the reader wonder whether the stage exists.
 */

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** Overrides the palette when the segment has a semantic colour already. */
  color?: string;
}

export interface SegmentSlice extends Segment {
  color: string;
  /** Share of the total, 0–100, rounded to 2dp. */
  pct: number;
}

export interface SegmentBar {
  slices: SegmentSlice[];
  total: number;
}

export function toBar(segments: Segment[]): SegmentBar {
  const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const slices = segments.map((s, i) => {
    const value = Number(s.value) || 0;
    return {
      ...s,
      value,
      color: s.color ?? seriesColor(i),
      pct: total ? Math.round((value / total) * 10000) / 100 : 0,
    };
  });
  return { slices, total };
}

/**
 * Roll a list of rows up into segments in a fixed stage order, so the bar
 * reads the same on every screen even when a stage happens to be empty today.
 */
export function countBy<T>(
  rows: T[],
  stages: { key: string; label: string; color?: string }[],
  keyOf: (row: T) => string | null | undefined,
): Segment[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = keyOf(row);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return stages.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    value: counts.get(s.key) ?? 0,
  }));
}
