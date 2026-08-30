import { num, round2, type Payment } from "./finance-model";

/**
 * The project payment ledger (PLAN-V4 §9.4, frames `105403` / `105429` /
 * `105444`).
 *
 * **The one idea this file exists to enforce: a reversal is a row, not a
 * delete.** `105403` puts "View Reversed Transactions" behind a checkbox, and
 * that is exactly right — the money really did move, and un-happening it is a
 * lie an accountant will eventually have to explain. So a correction is a new
 * row with the opposite sign whose `reversal_of` points at the entry it
 * cancels. Both stay. The checkbox only decides what you are looking at.
 *
 * Which means totals have to be careful: a reversed pair nets to zero and must
 * not be counted twice, or every figure on the screen is wrong by the amount of
 * the mistake somebody already corrected.
 */

export interface LedgerEntry extends Payment {
  vendor_id?: string | null;
  member_id?: string | null;
  expense_type?: string | null;
  category?: string | null;
  reversal_of?: string | null;
  stock_in_requested?: boolean;
}

/** `105403`: Material / Labour / Labour+Material / Professional Services. */
export const EXPENSE_TYPES = [
  "material",
  "labour",
  "labour_material",
  "professional_services",
] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  material: "Material",
  labour: "Labour",
  labour_material: "Labour + Material",
  professional_services: "Professional services",
};

/** `105403` / `105444`: where the money came from or went. */
export const PAYMENT_MODES = [
  "company_account",
  "cash",
  "bank_transfer",
  "upi",
  "cheque",
  "other",
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  company_account: "Company account",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

export type LedgerSide = "expenses" | "funds";

/** Funds are inflow, expenses are outflow. One mapping, stated once. */
export function directionFor(side: LedgerSide): "inflow" | "outflow" {
  return side === "funds" ? "inflow" : "outflow";
}

/* ── Reversals ────────────────────────────────────────────────────────────── */

export interface LedgerView {
  /** What the table shows, newest first. */
  rows: LedgerEntry[];
  /** Ids that have been reversed by a later row. */
  reversedIds: Set<string>;
  /** Ids that ARE reversals of something else. */
  reversalIds: Set<string>;
  /** Σ of everything still standing — reversed pairs excluded entirely. */
  total: number;
  /** How many entries are hidden when the checkbox is off. */
  hiddenCount: number;
}

/**
 * Build the ledger view.
 *
 * `showReversed` is `105403`'s checkbox. With it off, BOTH halves of a reversed
 * pair disappear — showing the original without its correction would state a
 * number that is no longer true, and showing the correction without its
 * original is meaningless. They are one event; they hide together.
 *
 * The total never includes either half, in both modes. Whether you are looking
 * at a corrected entry is a display question; whether it counts is not.
 */
export function buildLedger(
  entries: LedgerEntry[],
  showReversed: boolean,
): LedgerView {
  const reversalIds = new Set<string>();
  const reversedIds = new Set<string>();

  for (const e of entries) {
    if (e.reversal_of) {
      reversalIds.add(e.id);
      reversedIds.add(e.reversal_of);
    }
  }

  const standing = entries.filter(
    (e) => !reversalIds.has(e.id) && !reversedIds.has(e.id),
  );
  const rows = (showReversed ? entries : standing)
    .slice()
    .sort(byRecency);

  return {
    rows,
    reversedIds,
    reversalIds,
    total: round2(standing.reduce((a, e) => a + num(e.amount), 0)),
    hiddenCount: entries.length - standing.length,
  };
}

/** Transaction date first, then when it was recorded — both are real. */
function byRecency(a: LedgerEntry, b: LedgerEntry): number {
  const ad = a.paid_on ?? a.created_at.slice(0, 10);
  const bd = b.paid_on ?? b.created_at.slice(0, 10);
  return bd.localeCompare(ad) || b.created_at.localeCompare(a.created_at);
}

/**
 * The reversing entry for a row: same everything, opposite sign, pointing back.
 *
 * Returned as a plain object for the caller to write — this file computes, it
 * does not touch the database.
 */
export function reversalOf(entry: LedgerEntry): {
  reversal_of: string;
  amount: number;
  direction: string;
  contract_id: string | null;
  milestone_id: string | null;
  project_id: string | null;
  vendor_id: string | null;
  category: string | null;
  expense_type: string | null;
  note: string;
} {
  return {
    reversal_of: entry.id,
    // Negative, so the ledger foots without anybody subtracting by hand.
    amount: round2(-num(entry.amount)),
    direction: entry.direction,
    contract_id: entry.contract_id ?? null,
    milestone_id: entry.milestone_id ?? null,
    project_id: entry.project_id ?? null,
    vendor_id: entry.vendor_id ?? null,
    category: entry.category ?? null,
    expense_type: entry.expense_type ?? null,
    note: `Reversal of ${entry.reference || entry.id.slice(0, 8)}`,
  };
}

/* ── Analytics (`105403`'s Listing | Analytics toggle) ────────────────────── */

export interface Slice {
  key: string;
  label: string;
  value: number;
  count: number;
  /** Share of the total, with the denominator kept alongside it. */
  pct: number;
}

/**
 * Group standing entries by one dimension.
 *
 * Reversed pairs are already gone before this runs, so an analytic can never
 * show spend that was corrected away — which is the whole reason the reversal
 * model exists.
 *
 * Every slice carries its `count` as well as its value: `PLAN-V4 §5.2`'s rule
 * that a percentage without its denominator is not trustworthy applies just as
 * much to a donut segment as to a conversion rate.
 */
export function groupBy(
  entries: LedgerEntry[],
  pick: (e: LedgerEntry) => string | null | undefined,
  label: (key: string) => string = (k) => k,
  emptyLabel = "Unassigned",
): Slice[] {
  const buckets = new Map<string, { value: number; count: number }>();

  for (const e of entries) {
    const raw = pick(e);
    const key = raw && String(raw).trim() ? String(raw) : "__none__";
    const cur = buckets.get(key) ?? { value: 0, count: 0 };
    cur.value += num(e.amount);
    cur.count += 1;
    buckets.set(key, cur);
  }

  const total = [...buckets.values()].reduce((a, b) => a + b.value, 0);

  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: key === "__none__" ? emptyLabel : label(key),
      value: round2(b.value),
      count: b.count,
      pct: total === 0 ? 0 : round2((b.value / total) * 100),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Spend by calendar month, oldest first — the trend, not a ranking. */
export function byMonth(entries: LedgerEntry[]): Slice[] {
  const rows = groupBy(
    entries,
    (e) => (e.paid_on ?? e.created_at).slice(0, 7),
    (k) => monthLabel(k),
    "No date",
  );
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MONTHS[i]} ${y.slice(2)}` : key;
}
