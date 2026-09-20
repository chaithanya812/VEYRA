/**
 * Quote → PO import arithmetic. The only new number on this path is a
 * human-typed negative-margin % that strips markup off the quoted SELL rate
 * to get the BUY rate. Pure; no server-only import.
 *
 *   buyRate(sellRate, marginPct) = round2(sellRate × (1 − marginPct/100))
 *
 * 0% (or blank) buys at the quoted rate. ≥ 100% would be a free PO and is
 * refused; a negative margin is refused too. The quotation's cost_rate /
 * line_cost are internal and are never read here.
 */

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type MarginParse =
  | { ok: true; pct: number }
  | { ok: false; error: string };

function validateMarginPct(n: number): MarginParse {
  if (n < 0) {
    return { ok: false, error: "Margin % cannot be negative." };
  }
  if (n >= 100) {
    return {
      ok: false,
      error: "Margin % of 100 or more would produce a free purchase order.",
    };
  }
  return { ok: true, pct: n };
}

/**
 * Parse the human-typed margin field. Blank / omitted → 0 (buy at the quoted
 * sell rate). Names the problem when the value is not a number, is negative,
 * or would zero the PO (≥ 100).
 */
export function parseMarginPct(raw: unknown): MarginParse {
  if (raw == null) return { ok: true, pct: 0 };
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return { ok: true, pct: 0 };
    const n = Number(t);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Margin % must be a number." };
    }
    return validateMarginPct(n);
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { ok: false, error: "Margin % must be a number." };
    }
    return validateMarginPct(raw);
  }
  return { ok: false, error: "Margin % must be a number." };
}

/** BUY rate from a quoted SELL rate and a validated margin % (0 ≤ pct < 100). */
export function buyRate(sellRate: number, marginPct: number): number {
  const sell = Number(sellRate) || 0;
  return round2(sell * (1 - marginPct / 100));
}

/** The quotation-line fields this import copies. cost_rate is not among them. */
export interface QuoteLineForPo {
  title: string;
  uom: string | null;
  qty: number;
  unit_price: number;
  tax_rate: number;
  item_id?: string | null;
}

export interface PoLineDraft {
  item_id: string | null;
  item_name: string;
  uom: string | null;
  qty: number;
  unit_rate: number;
  tax_pct: number;
}

/**
 * Map quotation lines onto PO line drafts. unit_rate is the BUY rate from
 * buyRate(); totals are left to poAmount / lineTotal at write time.
 */
export function quoteLinesToPoLines(
  lines: QuoteLineForPo[],
  marginPct: number,
): PoLineDraft[] {
  return lines
    .filter((l) => l.title.trim())
    .map((l) => ({
      item_id: l.item_id ?? null,
      item_name: l.title.trim(),
      uom: (l.uom ?? "").trim() || null,
      qty: Number(l.qty) || 0,
      unit_rate: buyRate(l.unit_price, marginPct),
      tax_pct: l.tax_rate == null ? 18 : Number(l.tax_rate),
    }));
}
