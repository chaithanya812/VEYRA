/**
 * Client-safe measurement-mode model — derives a line QUANTITY from user-entered
 * dimensions, with a visible formula. No `server-only` import, so the quotation
 * builder form and the server save path share the exact same derivation.
 *
 * ⛔ Quantity is deterministic arithmetic on dimensions the user enters — never
 * an LLM output (HARD RULE 4). The derived qty then flows unchanged into the
 * existing pricing engine (`computeLine` in quotations-model.ts): measurement
 * mode sits IN FRONT OF the engine and never alters it.
 *
 * Modes (ported from INTERIOR's quotation/measure semantics):
 *   area      qty = length × width      (e.g. sqft/sqm flooring, shutters)
 *   elevation qty = width  × height     (wall/elevation area)
 *   linear    qty = length              (running-metre / running-foot work)
 *   count     qty = count               (discrete units: handles, hinges)
 *   lumpsum   qty = 1                    (a fixed lump — priced as one unit)
 *
 * A MANUAL OVERRIDE always wins: if the user types an explicit qty, that value
 * is used verbatim and the derivation is shown only for reference.
 */

export const MEASURE_MODES = [
  "area",
  "elevation",
  "linear",
  "count",
  "lumpsum",
] as const;
export type MeasureMode = (typeof MEASURE_MODES)[number];

export function isMeasureMode(v: unknown): v is MeasureMode {
  return typeof v === "string" && (MEASURE_MODES as readonly string[]).includes(v);
}

/** Human labels for the mode selector. */
export const MEASURE_MODE_LABELS: Record<MeasureMode, string> = {
  area: "Area (L × W)",
  elevation: "Elevation (W × H)",
  linear: "Linear (length)",
  count: "Count (units)",
  lumpsum: "Lump sum",
};

/** Which dimension inputs a mode consumes — drives which fields the form shows. */
export const MEASURE_MODE_FIELDS: Record<MeasureMode, Array<"length" | "width" | "height" | "count">> = {
  area: ["length", "width"],
  elevation: ["width", "height"],
  linear: ["length"],
  count: ["count"],
  lumpsum: [],
};

export interface MeasureDims {
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  count?: number | string | null;
}

/** Round to 3 decimals — qty precision (areas/lengths can be fractional). */
export function round3(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

/** Coerce a possibly-string/blank numeric input to a finite, non-negative number. */
function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Format a number for the formula string without trailing-zero noise. */
function fmt(n: number): string {
  return String(round3(n));
}

export type QtySource = "derived" | "manual";

export interface DerivedQty {
  /** The quantity to feed the pricing engine. */
  qty: number;
  /** "derived" from dimensions, or "manual" when an override was supplied. */
  source: QtySource;
  /** A human-readable formula, e.g. "2.4 × 0.6 = 1.44" or "manual: 3". */
  formula: string;
}

/**
 * Derive qty purely from dimensions for a mode. Missing/invalid dimensions
 * degrade to 0 (never NaN) with a formula that still shows the attempted math.
 */
export function deriveQty(mode: MeasureMode, dims: MeasureDims): DerivedQty {
  const L = num(dims.length);
  const W = num(dims.width);
  const H = num(dims.height);
  const C = num(dims.count);

  switch (mode) {
    case "area": {
      const qty = round3(L * W);
      return { qty, source: "derived", formula: `${fmt(L)} × ${fmt(W)} = ${fmt(qty)}` };
    }
    case "elevation": {
      const qty = round3(W * H);
      return { qty, source: "derived", formula: `${fmt(W)} × ${fmt(H)} = ${fmt(qty)}` };
    }
    case "linear": {
      const qty = round3(L);
      return { qty, source: "derived", formula: `length = ${fmt(qty)}` };
    }
    case "count": {
      const qty = round3(C);
      return { qty, source: "derived", formula: `count = ${fmt(qty)}` };
    }
    case "lumpsum":
      return { qty: 1, source: "derived", formula: "lump sum = 1" };
    default: {
      // Exhaustiveness guard — unknown mode contributes nothing rather than NaN.
      const _never: never = mode;
      return { qty: 0, source: "derived", formula: String(_never) };
    }
  }
}

/**
 * Resolve the final qty for a line. A finite, non-negative manual override wins;
 * otherwise the qty is derived from the mode + dimensions. `null`/`undefined`/
 * blank/negative overrides are treated as "no override".
 */
export function resolveQty(
  mode: MeasureMode,
  dims: MeasureDims,
  manualOverride?: number | string | null,
): DerivedQty {
  if (manualOverride !== null && manualOverride !== undefined && String(manualOverride).trim() !== "") {
    const o = Number(manualOverride);
    if (Number.isFinite(o) && o >= 0) {
      return { qty: round3(o), source: "manual", formula: `manual: ${fmt(o)}` };
    }
  }
  return deriveQty(mode, dims);
}
