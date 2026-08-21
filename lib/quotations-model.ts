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
  currency: string;
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  tax_total: number;
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
