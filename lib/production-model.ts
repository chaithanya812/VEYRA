/**
 * Client-safe production model (BOM + Cutlist) — types and PURE helpers with
 * NO server-only import, so client components (the cutlist form's live
 * preview) and the server data module (lib/data/production.ts) share the SAME
 * math: what you see while typing is exactly what gets stored.
 *
 * All quantities here are deterministic arithmetic on user-entered
 * dimensions/config — never an LLM output (HARD RULE 2). There is NO pricing
 * in this slice at all. Units are metric: mm for panel/board dimensions, sqm
 * for area, mm→running-metre for edge-banding.
 */

export type Grain = "length" | "width" | "none";

export interface Bom {
  id: string;
  project_label: string | null;
  title: string;
  source_ref: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BomLine {
  id: string;
  bom_id: string;
  material_name: string;
  uom: string | null;
  qty: number;
  waste_pct: number;
  effective_qty: number;
  notes: string | null;
  created_at: string;
}

export interface Cutlist {
  id: string;
  bom_id: string | null;
  project_label: string | null;
  title: string;
  board_material: string | null;
  board_length_mm: number | null;
  board_width_mm: number | null;
  status: string;
  created_by: string | null;
  created_at: string;
}

export interface CutlistPanel {
  id: string;
  cutlist_id: string;
  panel_name: string;
  room_label: string | null;
  length_mm: number;
  width_mm: number;
  qty: number;
  grain: Grain;
  material: string | null;
  edge_l1: boolean;
  edge_l2: boolean;
  edge_w1: boolean;
  edge_w2: boolean;
  notes: string | null;
  created_at: string;
}

/* ── Rounding helpers ──────────────────────────────────────────────────────── */

/** Round to 2 decimals — mirror quotations-model round2. */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Round to 3 decimals — qty/area precision used across production. */
export function round3(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

/** Coerce + guard: non-finite or negative → 0 (never NaN out of user input). */
function safeQty(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/* ── BOM math ─────────────────────────────────────────────────────────────── */

/**
 * Effective qty = qty × (1 + waste%/100), rounded to 3 dp. Guards NaN and
 * negatives on both inputs — a bad cell degrades to 0, never NaN.
 */
export function effectiveQty(qty: number, wastePct: number): number {
  const q = safeQty(qty);
  const w = safeQty(wastePct);
  return round3(q * (1 + w / 100));
}

/**
 * BOM totals across lines: line count and the sum of effective quantities
 * (server-stamped effective_qty, never recomputed from a client value).
 */
export function bomTotals(lines: Pick<BomLine, "effective_qty">[]): {
  lineCount: number;
  totalEffectiveQty: number;
} {
  const totalEffectiveQty = round3(
    lines.reduce((sum, l) => sum + safeQty(l.effective_qty), 0),
  );
  return { lineCount: lines.length, totalEffectiveQty };
}

/* ── Cutlist math ─────────────────────────────────────────────────────────── */

/**
 * Panel area in sqm: (L/1000) × (W/1000), rounded to 3 dp.
 * Non-finite (or negative) dimensions degrade to 0.
 */
export function panelAreaSqm(length_mm: number, width_mm: number): number {
  const l = safeQty(length_mm);
  const w = safeQty(width_mm);
  return round3((l / 1000) * (w / 1000));
}

/**
 * Edge-banding run for one panel line, in mm: each banded length-edge
 * (edge_l1/edge_l2) contributes length_mm; each banded width-edge
 * (edge_w1/edge_w2) contributes width_mm. Multiplied by qty.
 */
export function panelBandingMm(panel: {
  length_mm: number;
  width_mm: number;
  qty: number;
  edge_l1?: boolean;
  edge_l2?: boolean;
  edge_w1?: boolean;
  edge_w2?: boolean;
}): number {
  const l = safeQty(panel.length_mm);
  const w = safeQty(panel.width_mm);
  const qty = Math.floor(safeQty(panel.qty)) || 0;
  let perPanelMm = 0;
  if (panel.edge_l1) perPanelMm += l;
  if (panel.edge_l2) perPanelMm += l;
  if (panel.edge_w1) perPanelMm += w;
  if (panel.edge_w2) perPanelMm += w;
  return round2(perPanelMm * qty);
}

/** The fields the totals actually read — lets draft form rows share the math. */
export type CutlistPanelLike = Pick<
  CutlistPanel,
  | "length_mm"
  | "width_mm"
  | "qty"
  | "edge_l1"
  | "edge_l2"
  | "edge_w1"
  | "edge_w2"
>;

/**
 * Totals summed across a cutlist's panels:
 *  - panelCount sums `qty` (a panel row of qty 4 is four physical panels),
 *  - totalAreaSqm sums panelAreaSqm × qty,
 *  - totalBandingMm sums panelBandingMm.
 */
export function cutlistTotals(panels: CutlistPanelLike[]): {
  panelCount: number;
  totalAreaSqm: number;
  totalBandingMm: number;
} {
  let panelCount = 0;
  let areaSqm = 0;
  let bandingMm = 0;
  for (const p of panels) {
    const qty = Math.floor(safeQty(p.qty)) || 0;
    panelCount += qty;
    areaSqm += panelAreaSqm(p.length_mm, p.width_mm) * qty;
    bandingMm += panelBandingMm(p);
  }
  return {
    panelCount,
    totalAreaSqm: round3(areaSqm),
    totalBandingMm: round2(bandingMm),
  };
}
