/**
 * Client-safe Purchase Order model — enums, types and PURE helpers with NO
 * server-only import, so both client components (forms) and the server data
 * module can share them. Server logic lives in lib/data/purchase-orders.ts.
 *
 * FEATURE-REGISTER PROC-PO-001/002, PROC-DELIV-001. A PO has TWO independent
 * state machines:
 *   order_state   — fulfilment: draft → created → partially_delivered →
 *                   delivered (or cancelled). Once goods arrive it DERIVES
 *                   from received-vs-ordered via deriveOrderState().
 *   payment_state — money: not_initiated → partial → paid.
 *
 * "No LLM produces a number" (PLAN §8): unit rates are user-entered CONFIG;
 * `amount` is the pure SUM of line totals via poAmount() — arithmetic only.
 */

/** Fulfilment machine: draft parks until sent; delivery states are derived. */
export const ORDER_STATES = [
  "draft",
  "created",
  "partially_delivered",
  "delivered",
  "cancelled",
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

/** Payment machine — independent of fulfilment. */
export const PAYMENT_STATES = ["not_initiated", "partial", "paid"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const PO_TYPES = ["purchase_order", "work_order"] as const;
export type PoType = (typeof PO_TYPES)[number];

/**
 * Chip tone maps — grey/amber/green ONLY except the one true alert/cancel red
 * (DESIGN-DIRECTION §2): cancelled is the terminal destructive state and gets
 * red; a "Not initiated" payment is GREY, never red (it isn't an alarm).
 */
export type PoTone = "neutral" | "active" | "positive" | "red";

export const ORDER_STATE_META: Record<OrderState, { label: string; tone: PoTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  created: { label: "Created", tone: "active" },
  partially_delivered: { label: "Partially delivered", tone: "active" },
  delivered: { label: "Delivered", tone: "positive" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const PAYMENT_STATE_META: Record<PaymentState, { label: string; tone: PoTone }> = {
  not_initiated: { label: "Not initiated", tone: "neutral" },
  partial: { label: "Partially paid", tone: "active" },
  paid: { label: "Paid", tone: "positive" },
};

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface PurchaseOrder {
  id: string;
  org_id: string;
  name: string;
  vendor_id: string;
  project_label: string | null;
  rfq_id: string | null;
  type: PoType;
  /** SUM of line totals (poAmount) — pure arithmetic on user-entered config. */
  amount: number;
  order_state: OrderState;
  payment_state: PaymentState;
  order_date: string | null; // date (YYYY-MM-DD)
  delivery_date: string | null; // date (YYYY-MM-DD)
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoLine {
  id: string;
  org_id: string;
  po_id: string;
  item_id: string | null; // catalogue ref; null = uncatalogued ad-hoc label
  item_name: string; // label always kept
  uom: string | null;
  qty: number;
  unit_rate: number;
  tax_pct: number;
  line_total: number;
  created_at: string;
}

export interface PoReceipt {
  id: string;
  org_id: string;
  po_id: string;
  received_by: string | null;
  received_at: string;
  mode: "vendor" | "admin_override";
  note: string | null;
}

export interface PoReceiptLine {
  id: string;
  org_id: string;
  receipt_id: string;
  po_line_id: string;
  qty_received: number;
}

/* ── Pure helpers ───────────────────────────────────────────────────────────── */

/** One line's total = qty × unit_rate. Rates are user config; this is arithmetic. */
export function lineTotal(qty: number, unitRate: number): number {
  return round2((Number(qty) || 0) * (Number(unitRate) || 0));
}

/** The PO amount is the PURE SUM of line totals — nothing else contributes. */
export function poAmount(lines: { qty: number; unit_rate: number }[]): number {
  return round2(lines.reduce((sum, l) => sum + lineTotal(l.qty, l.unit_rate), 0));
}

/**
 * Derive the fulfilment state from received-vs-ordered totals:
 *   received <= 0            → created
 *   0 < received < ordered   → partially_delivered
 *   received >= ordered      → delivered
 */
export function deriveOrderState(
  ordered: number,
  received: number,
): "created" | "partially_delivered" | "delivered" {
  if (!(received > 0)) return "created";
  if (received < ordered) return "partially_delivered";
  return "delivered";
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * TRUE ALERT (the one delivery-red use in this module): the promised delivery
 * date exists, has fully passed, and the PO hasn't reached `delivered` /
 * `cancelled`. Date-granularity on purpose — delivery day itself isn't late.
 */
export function isDeliveryOverdue(
  deliveryDate: string | null,
  orderState: string,
): boolean {
  if (!deliveryDate) return false;
  if (orderState === "delivered" || orderState === "cancelled") return false;

  // Date-only strings ("YYYY-MM-DD") are parsed on the calendar, not shifted
  // through UTC → local; anything else falls back to Date parsing.
  let y: number, m: number, d: number;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deliveryDate.trim());
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]) - 1;
    d = Number(match[3]);
  } else {
    const parsed = new Date(deliveryDate);
    if (Number.isNaN(parsed.getTime())) return false;
    y = parsed.getFullYear();
    m = parsed.getMonth();
    d = parsed.getDate();
  }

  const now = new Date();
  const deliveryDay = new Date(y, m, d).getTime();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return deliveryDay < today;
}
