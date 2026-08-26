/**
 * Client-safe quotations model — enums, types, and the PURE PRICING ENGINE.
 * No server-only import, so the builder form computes live line/quote totals with
 * the exact same functions the server uses to write the authoritative snapshot.
 *
 * ⛔ Prices are computed here by deterministic arithmetic — never by an LLM
 * (PLAN §8). The server recomputes on every save and never trusts client totals
 * ("engine computes, validator verifies").
 *
 * Formula verified against the real Dzylo quotation frame (EST_02):
 *   line_subtotal = qty × unit_price
 *   discount_amount = type==='percent' ? line_subtotal × value/100 : value
 *   taxable        = line_subtotal − discount_amount
 *   tax_amount     = taxable × tax_rate/100
 *   line_total     = taxable + tax_amount
 *   line_cost      = qty × cost_rate
 */

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
  "won",
  "lost",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const DISCOUNT_TYPES = ["amount", "percent"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** GST supply treatment (Indian): intra-state → CGST+SGST, inter-state → IGST. */
export const GST_TREATMENTS = ["intra", "inter"] as const;
export type GstTreatment = (typeof GST_TREATMENTS)[number];

export interface Quotation {
  id: string;
  lead_id: string | null;
  party_id: string | null;
  number: string;
  version_group: string;
  version: number;
  title: string;
  status: QuoteStatus;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  site_address: string | null;
  place_of_supply: string | null;
  seller_state: string | null;
  gst_treatment: GstTreatment;
  works_contract: boolean;
  currency: string;
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  tax_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  grand_total: number;
  cost_total: number;
  margin_total: number;
  notes: string | null;
  terms: string | null;
  valid_until: string | null;
  share_token: string | null;
  share_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuotationSection {
  id: string;
  quotation_id: string;
  title: string;
  sort_order: number;
}

export interface QuotationLine {
  id: string;
  quotation_id: string;
  section_id: string | null;
  item_id: string | null;
  sort_order: number;
  title: string;
  area: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  hsn_sac: string | null;
  qty: number;
  uom: string;
  unit_price: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  tax_rate: number;
  cost_rate: number;
  line_subtotal: number;
  taxable: number;
  tax_amount: number;
  line_total: number;
  line_cost: number;
  /** Optional measurement mode (OPS-EST-002): qty derived from dimensions with a
   * visible formula; a manual override wins. See lib/measurement-model.ts. */
  measure_mode?: string | null;
  measure_length?: number | null;
  measure_width?: number | null;
  measure_height?: number | null;
  measure_count?: number | null;
  measure_qty_override?: number | null;
}

/* ── The pricing engine ─────────────────────────────────────────────────── */

/** Round to 2 decimals (paise), the money precision used throughout. */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export interface LineInput {
  qty: number;
  unit_price: number;
  discount_type: DiscountType;
  discount_value: number;
  tax_rate: number;
  cost_rate?: number;
}

export interface LineTotals {
  discount_amount: number;
  line_subtotal: number;
  taxable: number;
  tax_amount: number;
  line_total: number;
  line_cost: number;
}

/** Compute one line's money fields. Deterministic; the sole source of a line's price. */
export function computeLine(input: LineInput): LineTotals {
  const qty = Number(input.qty) || 0;
  const unitPrice = Number(input.unit_price) || 0;
  const taxRate = Number(input.tax_rate) || 0;
  const costRate = Number(input.cost_rate) || 0;

  const line_subtotal = round2(qty * unitPrice);

  const rawDiscount =
    input.discount_type === "percent"
      ? (line_subtotal * (Number(input.discount_value) || 0)) / 100
      : Number(input.discount_value) || 0;
  // Discount cannot exceed the line subtotal or go negative.
  const discount_amount = round2(Math.min(Math.max(rawDiscount, 0), line_subtotal));

  const taxable = round2(line_subtotal - discount_amount);
  const tax_amount = round2((taxable * taxRate) / 100);
  const line_total = round2(taxable + tax_amount);
  const line_cost = round2(qty * costRate);

  return { discount_amount, line_subtotal, taxable, tax_amount, line_total, line_cost };
}

export interface QuoteTotals {
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  tax_total: number;
  grand_total: number;
  cost_total: number;
  margin_total: number;
}

/** Roll a set of computed lines up to the quote header totals. */
export function computeQuoteTotals(
  lines: Array<Pick<LineTotals, "line_subtotal" | "discount_amount" | "taxable" | "tax_amount" | "line_total" | "line_cost">>,
): QuoteTotals {
  const t = lines.reduce(
    (a, l) => ({
      subtotal: a.subtotal + l.line_subtotal,
      discount_total: a.discount_total + l.discount_amount,
      taxable_total: a.taxable_total + l.taxable,
      tax_total: a.tax_total + l.tax_amount,
      grand_total: a.grand_total + l.line_total,
      cost_total: a.cost_total + l.line_cost,
    }),
    { subtotal: 0, discount_total: 0, taxable_total: 0, tax_total: 0, grand_total: 0, cost_total: 0 },
  );
  return {
    subtotal: round2(t.subtotal),
    discount_total: round2(t.discount_total),
    taxable_total: round2(t.taxable_total),
    tax_total: round2(t.tax_total),
    grand_total: round2(t.grand_total),
    cost_total: round2(t.cost_total),
    margin_total: round2(t.taxable_total - t.cost_total),
  };
}

/** Margin as a % of the (pre-tax) sell price. Guards divide-by-zero. */
export function marginPct(taxable_total: number, cost_total: number): number {
  if (!taxable_total) return 0;
  return round2(((taxable_total - cost_total) / taxable_total) * 100);
}

/* ── Indian GST supply model (place-of-supply → CGST/SGST vs IGST) ─────────── */

/**
 * States & UTs with their 2-digit GST state codes. Client-safe reference data
 * shared by the quotation forms and the tax engine. (Kept in the pricing model
 * so the split logic and its data live — and are tested — together.)
 */
export const INDIAN_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

/**
 * Resolve a free-text / dropdown state value to a canonical state code.
 * Tolerant of the historic free-text `place_of_supply` (accepts the name, the
 * 2-digit code, or a "27-Maharashtra" combo). Returns null when unrecognised —
 * the caller then leaves the stored treatment untouched rather than guessing.
 */
export function normalizeState(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  for (const st of INDIAN_STATES) {
    if (
      s === st.name.toLowerCase() ||
      s === st.code ||
      s.startsWith(`${st.code}-`) ||
      s.startsWith(`${st.code} `) ||
      s === `${st.code}-${st.name.toLowerCase()}`
    ) {
      return st.code;
    }
  }
  return null;
}

/**
 * Auto-derive the GST treatment from seller vs buyer state. intra when both
 * resolve to the SAME state, inter when they differ, null when either is
 * unknown (so an explicit override / stored default wins).
 */
export function deriveTreatment(
  sellerState: string | null | undefined,
  placeOfSupply: string | null | undefined,
): GstTreatment | null {
  const a = normalizeState(sellerState);
  const b = normalizeState(placeOfSupply);
  if (!a || !b) return null;
  return a === b ? "intra" : "inter";
}

export interface GstSplit {
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Partition a total GST amount into CGST/SGST (intra-state) or IGST (inter-state).
 * CGST and SGST are each exactly half of the GST for every slab, so splitting the
 * aggregate is correct; sgst absorbs the rounding remainder so cgst+sgst === tax.
 */
export function splitGst(taxTotal: number, treatment: GstTreatment): GstSplit {
  const tax = round2(Number(taxTotal) || 0);
  if (treatment === "inter") return { cgst: 0, sgst: 0, igst: tax };
  const cgst = round2(tax / 2);
  const sgst = round2(tax - cgst);
  return { cgst, sgst, igst: 0 };
}

export interface GstRateRow extends GstSplit {
  rate: number;
  taxable: number;
  tax: number;
}

/**
 * Rate-wise GST summary — what a compliant Indian quote/invoice shows: one row
 * per GST slab (12/18/28…) with its taxable value and CGST/SGST or IGST. The
 * rows foot to the header totals exactly (per-slab splits sum to the aggregate).
 */
export function gstRateSummary(
  lines: Array<{ tax_rate: number; taxable: number; tax_amount: number }>,
  treatment: GstTreatment,
): GstRateRow[] {
  const map = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    const rate = Number(l.tax_rate) || 0;
    const cur = map.get(rate) ?? { taxable: 0, tax: 0 };
    cur.taxable += Number(l.taxable) || 0;
    cur.tax += Number(l.tax_amount) || 0;
    map.set(rate, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => {
      const s = splitGst(v.tax, treatment);
      return { rate, taxable: round2(v.taxable), tax: round2(v.tax), ...s };
    });
}

/** Header CGST/SGST/IGST totals, derived so they foot to the rate summary. */
export function computeGstTotals(
  lines: Array<{ tax_rate: number; taxable: number; tax_amount: number }>,
  treatment: GstTreatment,
): GstSplit {
  return gstRateSummary(lines, treatment).reduce(
    (a, r) => ({ cgst: round2(a.cgst + r.cgst), sgst: round2(a.sgst + r.sgst), igst: round2(a.igst + r.igst) }),
    { cgst: 0, sgst: 0, igst: 0 },
  );
}
