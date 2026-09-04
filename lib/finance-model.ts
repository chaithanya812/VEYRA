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
  /** The real FK (migration 0028). Read this; `project_label` is display fallback. */
  project_id?: string | null;
  project_label: string | null;
  /** Vendor contracts only (migration 0030). Null IS the "Unlisted Vendor" row. */
  vendor_id?: string | null;
  name: string;
  amount: number;
  source: ContractSource;
  notes?: string | null;
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
  project_id?: string | null;
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


/* ══════════════════════════════════════════════════════════════════════════
   Financial Planning (PLAN-V4 §9.3, frames `105238` / `105325`)
   ══════════════════════════════════════════════════════════════════════════
   These live HERE, beside `milestonesFoot` and `pnl`, rather than in a module
   of their own. `contracts` + `milestones` (migration 0015) already are the
   inflow/outflow model the frame shows, and a second file computing the same
   money is how two screens start disagreeing about one project — the same
   mistake the scope-item spine had to repair across six line-item tables.

   ⛔ No model goes near any of this (HARD RULE 2). A payment schedule is money;
   money is computed or typed, never proposed.
   ────────────────────────────────────────────────────────────────────────── */

export function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Money, to the paisa. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sourceOf(c: Pick<Contract, "source">): ContractSource {
  return c.source === "vendor" ? "vendor" : "client";
}

/* ── The two-way binding (`105238`'s ⟲) ───────────────────────────────────── */

/** Percentage → amount, against the contract value. */
export function amountFromPct(pct: number, contractAmount: number): number {
  return round2((clampPct(pct) / 100) * num(contractAmount));
}

/**
 * Amount → percentage. A zero-value contract has no percentage to speak of —
 * returning 0 rather than dividing by zero keeps the row editable while the
 * user is still typing the contract's value.
 */
export function pctFromAmount(amount: number, contractAmount: number): number {
  const total = num(contractAmount);
  if (total <= 0) return 0;
  return round2((num(amount) / total) * 100);
}

/** A percentage outside 0–100 is a typo, not a schedule. */
export function clampPct(pct: number): number {
  const n = num(pct);
  return Math.min(100, Math.max(0, round2(n)));
}

export interface ScheduleTotals {
  pct: number;
  amount: number;
  /** The contract value the schedule is measured against. */
  contractAmount: number;
  /** Σ amounts − contract value. Non-zero is a rounding remainder to show. */
  drift: number;
  /** True only when the schedule bills exactly 100%. */
  isComplete: boolean;
  /** What is left to allocate — prefilled into the next milestone. */
  remainingPct: number;
  remainingAmount: number;
}

/**
 * Totals for a contract's schedule, and whether it is allowed to be saved.
 *
 * `isComplete` is the gate `105238` implies with its bold **Total 100%** row.
 * A hair of rounding slack is allowed on the percentage — three milestones of
 * 33.33% sum to 99.99 and refusing that would be pedantry, not a safeguard.
 */
export function scheduleTotals(
  rows: Pick<Milestone, "pct" | "amount">[],
  contractAmount: number | string,
): ScheduleTotals {
  const total = num(contractAmount);
  const pct = round2(rows.reduce((a, r) => a + num(r.pct), 0));
  const amount = round2(rows.reduce((a, r) => a + num(r.amount), 0));

  return {
    pct,
    amount,
    contractAmount: total,
    drift: round2(amount - total),
    isComplete: Math.abs(pct - 100) < 0.05,
    remainingPct: round2(100 - pct),
    remainingAmount: round2(total - amount),
  };
}

/**
 * `Actual Due` only exists once the work is done (`105238`, contract 2's row 1
 * has an unticked Work Done and no Actual Due at all).
 *
 * Falls back to the tentative date when nobody recorded a real one — the
 * milestone is billable either way, and a billable milestone with no due date
 * would simply vanish from the receivables ageing.
 */
export function actualDueOf(
  m: Pick<Milestone, "work_done" | "actual_due" | "tentative_due">,
): string | null {
  if (!m.work_done) return null;
  return m.actual_due ?? m.tentative_due ?? null;
}

/** Billable = the work is done. This one predicate drives receivables. */
export function isBillable(m: Pick<Milestone, "work_done">): boolean {
  return !!m.work_done;
}

/* ── Rollups (the per-contract figures in `105238` / `105325`) ────────────── */

export interface ContractRollup {
  contractAmount: number;
  /** Σ of milestones whose work is done — what may be invoiced. */
  billable: number;
  /** Cash that actually moved against this contract. */
  settled: number;
  /** Billable − settled. Negative means more came in than was billed. */
  due: number;
  /** Planned but not yet billable — the rest of the schedule. */
  unbilled: number;
  milestoneCount: number;
  billableCount: number;
}

/**
 * One contract's money, in the four figures the frame shows.
 *
 * For a client contract these read Funds Received · Billed · Receivable Dues;
 * for a vendor contract, Disbursed · Billed · Payable Dues. They are the same
 * arithmetic seen from opposite ends, which is why there is one function and
 * not two.
 */
export function rollupContract(
  contract: Pick<Contract, "amount">,
  milestones: Pick<Milestone, "pct" | "amount" | "work_done">[],
  payments: Pick<Payment, "amount">[],
): ContractRollup {
  const contractAmount = num(contract.amount);
  const billable = round2(
    milestones.filter(isBillable).reduce((a, m) => a + num(m.amount), 0),
  );
  const planned = round2(milestones.reduce((a, m) => a + num(m.amount), 0));
  const settled = round2(payments.reduce((a, p) => a + num(p.amount), 0));

  return {
    contractAmount,
    billable,
    settled,
    due: round2(billable - settled),
    unbilled: round2(planned - billable),
    milestoneCount: milestones.length,
    billableCount: milestones.filter(isBillable).length,
  };
}

export interface FinancialPlanSummary {
  projectValue: number;
  /** Client side. */
  funds: number;
  /**
   * `Contracted` — Σ of every CLIENT contract's value: the whole commitment
   * the client has signed up to, whether or not the work is signed off.
   * SETTLED 2026-09-04 (HANDOFF-V8 §10.8): this figure and `receivableBilled`
   * are both real and both wanted, and the bug was one label — "Total
   * Receivables" — over the two of them. Deliberately symmetric with
   * `estimatedExpenses`/`billed` on the vendor side.
   */
  contracted: number;
  /**
   * `Billed` — client milestone amounts whose work has been signed off: what
   * may be invoiced today. This field used to be called `totalReceivables`.
   */
  receivableBilled: number;
  /** `Receivable Dues` — billed less received. Unchanged by §10.8. */
  receivableDues: number;
  /** Vendor side. */
  estimatedExpenses: number;
  disbursed: number;
  /**
   * `Committed` — agreed less disbursed: the whole remaining commitment to
   * every vendor on this project, whether or not the work is signed off.
   * NOT clamped: disbursing more than was agreed happens on a real site, and
   * a figure floored at zero hides the one row somebody needed to see.
   */
  committed: number;
  /**
   * `Billed` — the milestone amounts whose work has been signed off. This
   * field used to be called `totalPayables`, a phrase frame `110234` used for
   * `committed`; one label over two meanings was the bug. SETTLED 2026-09-04:
   * keep both figures, name them apart. (HANDOFF-V8 §10.1.)
   */
  billed: number;
  /** `Dues` — billed less disbursed: what is payable today. Unchanged. */
  payableDues: number;
  /** The two hero tiles (`105403`). Both derived, never stored. */
  cashFlow: number;
  expectedPnl: number;
}

/**
 * The header band of `105238` and the hero tiles of `105403`, in one pass.
 *
 * **Every figure here is derived.** Storing any of them is how a project's
 * summary and its ledger start disagreeing — and the ledger is always the one
 * telling the truth.
 */
export function summarisePlan(input: {
  projectValue: number | string;
  contracts: Pick<Contract, "id" | "amount" | "source">[];
  milestonesByContract: Map<string, Pick<Milestone, "amount" | "pct" | "work_done">[]>;
  paymentsByContract: Map<string, Pick<Payment, "amount">[]>;
  /**
   * Payments that carry this project but NO contract — an advance paid before
   * the paperwork, or site spend against no schedule. They are real money that
   * left or entered the project's bank, so they count toward `funds` and
   * `disbursed` by DIRECTION. Omitting them is why the Financial Planning band
   * used to read a cash flow the ledger printed directly underneath it
   * contradicted, and why it disagreed with both the project Summary band and
   * the Vendor Projects screen about the same rupee.
   */
  unattachedPayments?: readonly Pick<Payment, "direction" | "amount">[];
}): FinancialPlanSummary {
  let funds = 0;
  let contracted = 0;
  let receivableBilled = 0;
  let estimatedExpenses = 0;
  let disbursed = 0;
  let billed = 0;

  for (const c of input.contracts) {
    const ms = input.milestonesByContract.get(c.id) ?? [];
    const ps = input.paymentsByContract.get(c.id) ?? [];
    const r = rollupContract(c, ms, ps);

    if (sourceOf(c) === "client") {
      funds += r.settled;
      contracted += r.contractAmount;
      receivableBilled += r.billable;
    } else {
      estimatedExpenses += r.contractAmount;
      disbursed += r.settled;
      billed += r.billable;
    }
  }

  for (const p of input.unattachedPayments ?? []) {
    if (p.direction === "inflow") funds += num(p.amount);
    else disbursed += num(p.amount);
  }

  funds = round2(funds);
  contracted = round2(contracted);
  receivableBilled = round2(receivableBilled);
  estimatedExpenses = round2(estimatedExpenses);
  disbursed = round2(disbursed);
  billed = round2(billed);

  return {
    projectValue: num(input.projectValue),
    funds,
    contracted,
    receivableBilled,
    receivableDues: round2(receivableBilled - funds),
    estimatedExpenses,
    disbursed,
    committed: round2(estimatedExpenses - disbursed),
    billed,
    payableDues: round2(billed - disbursed),
    // Cash in hand on this project: what came in, less what went out.
    cashFlow: round2(funds - disbursed),
    // What the project is expected to be worth when everyone has been paid.
    expectedPnl: round2(num(input.projectValue) - estimatedExpenses),
  };
}

/**
 * Spread a contract value across n equal milestones without losing paise.
 *
 * The remainder lands on the LAST milestone rather than being scattered, so the
 * schedule sums to the contract value exactly and the discrepancy sits in one
 * visible place instead of three invisible ones.
 */
export function splitEvenly(
  contractAmount: number | string,
  count: number,
): { pct: number; amount: number }[] {
  const total = num(contractAmount);
  const n = Math.max(0, Math.trunc(count));
  if (n === 0) return [];

  const pct = round2(100 / n);
  const each = round2(total / n);
  const rows = Array.from({ length: n }, () => ({ pct, amount: each }));

  rows[n - 1] = {
    pct: round2(100 - pct * (n - 1)),
    amount: round2(total - each * (n - 1)),
  };
  return rows;
}
