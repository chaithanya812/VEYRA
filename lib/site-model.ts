/**
 * Client-safe site-execution model — types and PURE helpers with NO
 * server-only import, so client components (forms) and the server data module
 * (lib/data/site.ts) can share them.
 *
 * Variance is VEYRA's wedge: measured qty vs quoted qty. The math here is a
 * pure computation on user-entered quantities — never an LLM output
 * (HARD RULE 4). Red (`alert`) is RESERVED for a large variance: a true alert
 * (DESIGN-DIRECTION §2); small deviations stay neutral/amber.
 */
export interface SiteLog {
  id: string;
  project_label: string | null;
  log_date: string;
  work_summary: string;
  author: string | null;
  created_at: string;
}

export interface SitePhoto {
  id: string;
  site_log_id: string | null;
  project_label: string | null;
  caption: string | null;
  url: string | null;
  created_at: string;
}

export interface SiteAttendance {
  id: string;
  project_label: string | null;
  member_name: string;
  check_in: string;
  check_out: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface MeasurementVariance {
  id: string;
  project_label: string | null;
  item_name: string;
  uom: string | null;
  quoted_qty: number;
  measured_qty: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Variance % = ((measured − quoted) / quoted) × 100, rounded to 1 dp.
 * Quoted of 0 → 0 (never divide by zero). Number() guards against PostgREST
 * returning numerics as strings; non-finite inputs degrade to 0, never NaN.
 */
export function variancePct(quoted: number, measured: number): number {
  const q = Number(quoted);
  const m = Number(measured);
  if (!Number.isFinite(q) || !Number.isFinite(m) || q === 0) return 0;
  const raw = ((m - q) / q) * 100;
  const rounded = Math.round(raw * 10) / 10;
  return rounded === 0 ? 0 : rounded; // normalise −0 → 0 for display
}

/** Tone thresholds on |pct|: <5 neutral · <15 warning · ≥15 alert (red). */
export type VarianceTone = "neutral" | "warning" | "alert";

export function varianceTone(pct: number): VarianceTone {
  const abs = Math.abs(Number(pct));
  if (!Number.isFinite(abs)) return "neutral";
  if (abs < 5) return "neutral";
  if (abs < 15) return "warning";
  return "alert";
}
