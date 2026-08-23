/**
 * Client-safe finance model — enums and types with NO server-only import, so
 * both client components (forms) and the server data module
 * (lib/data/finance.ts) can share them.
 *
 * Every helper here is PURE arithmetic on user-entered config or stored rows —
 * no LLM ever produces a number (HARD RULE 4). Number() guards against
 * PostgREST returning numerics as strings.
 */

export const CONTRACT_SOURCES = ["client", "vendor"] as const;
export type ContractSource = (typeof CONTRACT_SOURCES)[number];

export const PAYMENT_DIRECTIONS = ["inflow", "outflow"] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];

/** Chip tone vocabulary shared with StatusChip. Red is RESERVED for alerts. */
export type FinanceTone = "neutral" | "green" | "amber" | "red";

/**
 * Direction semantics: green = money received, amber = money paid out / due.
 * Never red — red stays reserved for negative P&L and overdue milestones.
 */
export const DIRECTION_META: Record<
  PaymentDirection,
  { label: string; tone: FinanceTone }
> = {
  inflow: { label: "Received", tone: "green" },
  outflow: { label: "Paid", tone: "amber" },
};

/** Milestone work-done state: green when done, neutral grey while pending. */
export const MILESTONE_META: Record<
  "done" | "pending",
  { label: string; tone: FinanceTone }
> = {
  done: { label: "Work done", tone: "green" },
  pending: { label: "Pending", tone: "neutral" },
};

export const SOURCE_LABELS: Record<ContractSource, string> = {
  client: "Client",
  vendor: "Vendor",
};

export interface Contract {
  id: string;
  org_id?: string;
  project_label: string | null;
  name: string;
  amount: number;
  source: ContractSource;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  contract_id: string;
  seq: number;
  name: string;
  pct: number;
  amount: number;
  tentative_due: string | null;
  work_done: boolean;
  actual_due: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  contract_id: string | null;
  milestone_id: string | null;
  project_label: string | null;
  direction: PaymentDirection;
  amount: number;
  mode: string | null;
  paid_on: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Σ of milestone pcts + whether it totals 100% within a rupee-safe epsilon
 * (±0.01) so float noise on user-entered decimals never false-alarms.
 */
export function milestonesFoot(ms: { pct: number }[]): {
  total: number;
  ok: boolean;
} {
  const total = ms.reduce((s, m) => s + (Number(m.pct) || 0), 0);
  return { total, ok: Math.abs(total - 100) <= 0.01 };
}

/** Cash position: inflow − outflow. Pure arithmetic, never invented. */
export function pnl(inflow: number, outflow: number): number {
  return Number(inflow) - Number(outflow);
}

/** Total one numeric column across rows (payments by direction, etc.). */
export function sumBy<T>(rows: T[], pick: (t: T) => number): number {
  return rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
}

/**
 * A milestone is overdue only when it has a tentative due date in the past AND
 * its work is still not done. Done milestones are never overdue; undated ones
 * can't be. Compares ISO `YYYY-MM-DD` strings — safe lexicographic ordering.
 */
export function milestoneOverdue(
  tentative_due: string | null,
  work_done: boolean,
): boolean {
  if (!tentative_due || work_done) return false;
  const now = new Date();
  const today = [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return tentative_due.slice(0, 10) < today;
}
