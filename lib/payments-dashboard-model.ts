/**
 * The company-wide Payments Dashboard matrix (PLAN-V4 §12.1, frame `110458`).
 *
 * ⛔ THIS FILE COMPUTES NO MONEY OF ITS OWN. Every figure in every row comes
 * out of `lib/finance-model.ts::summarisePlan` — the same function the project
 * Financial Planning band and the project Payments band already call. All this
 * module does is GROUP contracts, milestones and payments by `project_id` and
 * hand each project's slice to that one function.
 *
 * That is the whole point. A second money model is how a company dashboard and
 * the project it drills through to start disagreeing about the same rupee, and
 * the drill-through arrow makes the disagreement one click wide.
 *
 * The vocabulary is the one the owner settled on 2026-09-04 (HANDOFF-V8 §10.1):
 *
 *   Committed = agreed − disbursed   (the whole remaining commitment)
 *   Billed    = milestone work signed off
 *   Dues      = billed − disbursed   (payable today)
 *
 * Grouping is on the real `project_id` FK (migration 0028), never on a name.
 * `lib/data/reports.ts` still honours the legacy `payments.project_label` as a
 * fallback for rows the 0028 backfill could not resolve; this model takes the
 * project's contracts as its spine, so a payment that reaches a project only by
 * label reaches this matrix only through its contract — see `unattached` below
 * for the money that reaches a project directly.
 */

import {
  round2,
  summarisePlan,
  type Contract,
  type Milestone,
  type Payment,
} from "./finance-model";

/* ── Inputs ───────────────────────────────────────────────────────────────── */

export interface MatrixProject {
  id: string;
  name: string | null;
  clientName: string | null;
  projectValue: number | string | null;
  /** Optional; only used by `filterMatrix`. */
  stage?: string | null;
}

export type MatrixContract = Pick<Contract, "id" | "amount" | "source"> & {
  project_id: string | null;
};

export type MatrixPayment = Pick<
  Payment,
  "direction" | "amount" | "contract_id" | "project_id"
>;

export type MatrixMilestone = Pick<Milestone, "amount" | "pct" | "work_done">;

/* ── One row of `110458` ──────────────────────────────────────────────────── */

export interface PaymentsMatrixRow {
  projectId: string;
  projectName: string;
  clientName: string;
  stage: string | null;

  /** Inflow group. */
  projectValue: number;
  fundsReceived: number;
  totalReceivables: number;
  receivableDues: number;

  /** Outflow group. */
  estimatedExpenses: number;
  disbursed: number;
  committed: number;
  billed: number;
  dues: number;

  /** The two derived figures. */
  cashFlow: number;
  expectedPnl: number;

  /** How many contracts this row was built from — a figure's denominator. */
  contractCount: number;
  /**
   * Money that carries this project but no contract at all: an advance paid
   * before the paperwork, or site spend against no schedule. It is FOLDED INTO
   * `fundsReceived` / `disbursed` by direction (that is what `summarisePlan`
   * does with it), and reported separately here so a screen can say how much
   * of a project's cash movement is attached to nothing.
   */
  unattachedInflow: number;
  unattachedOutflow: number;
}

/** The summary band above the matrix. Every field is Σ of the rows below it. */
export interface PaymentsMatrixBand {
  totalProjects: number;
  expectedPnl: number;
  projectValue: number;
  /** Inflow group. */
  totalReceivables: number;
  fundsReceived: number;
  receivableDues: number;
  /** Outflow group. */
  estimatedExpenses: number;
  disbursed: number;
  committed: number;
  /** Not in the frame's band, but the rows carry them and totals must foot. */
  billed: number;
  dues: number;
  cashFlow: number;
}

const NO_CLIENT = "(No client recorded)";
const UNTITLED = "Untitled project";

/**
 * Build `110458`'s matrix.
 *
 * A project with no contracts and no payments still gets a row — its value and
 * its expected P&L are real, and dropping it would make the band disagree with
 * the projects list. A contract or payment whose `project_id` does not resolve
 * to a project in `projects` is skipped rather than inventing a row: the matrix
 * is per PROJECT, and a project nobody can name cannot be drilled into.
 */
export function paymentsMatrix(input: {
  projects: readonly MatrixProject[];
  contracts: readonly MatrixContract[];
  milestonesByContract: ReadonlyMap<string, readonly MatrixMilestone[]>;
  payments: readonly MatrixPayment[];
}): PaymentsMatrixRow[] {
  const known = new Set(input.projects.map((p) => p.id));

  const contractsByProject = new Map<string, MatrixContract[]>();
  const projectOfContract = new Map<string, string>();
  for (const c of input.contracts) {
    if (!c.project_id || !known.has(c.project_id)) continue;
    projectOfContract.set(c.id, c.project_id);
    const list = contractsByProject.get(c.project_id) ?? [];
    list.push(c);
    contractsByProject.set(c.project_id, list);
  }

  // Payments split two ways, exactly as lib/data/finance.ts splits them: those
  // against a contract feed that contract's rollup; those carrying only the
  // project are money that still moved.
  const paymentsByContract = new Map<string, Payment[]>();
  const unattachedByProject = new Map<string, MatrixPayment[]>();
  for (const p of input.payments) {
    if (p.contract_id && projectOfContract.has(p.contract_id)) {
      const list = paymentsByContract.get(p.contract_id) ?? [];
      list.push(p as unknown as Payment);
      paymentsByContract.set(p.contract_id, list);
      continue;
    }
    if (p.contract_id) continue; // a contract on no project we can name
    if (!p.project_id || !known.has(p.project_id)) continue;
    const list = unattachedByProject.get(p.project_id) ?? [];
    list.push(p);
    unattachedByProject.set(p.project_id, list);
  }

  const rows: PaymentsMatrixRow[] = [];
  for (const project of input.projects) {
    const contracts = contractsByProject.get(project.id) ?? [];
    const unattached = unattachedByProject.get(project.id) ?? [];

    // Only this project's slice of each map — a project must never be able to
    // read another project's milestones or payments through a shared map.
    const ms = new Map<string, MatrixMilestone[]>();
    const ps = new Map<string, Payment[]>();
    for (const c of contracts) {
      ms.set(c.id, [...(input.milestonesByContract.get(c.id) ?? [])]);
      ps.set(c.id, paymentsByContract.get(c.id) ?? []);
    }

    const s = summarisePlan({
      projectValue: project.projectValue ?? 0,
      contracts,
      milestonesByContract: ms,
      paymentsByContract: ps,
      unattachedPayments: unattached,
    });

    rows.push({
      projectId: project.id,
      projectName: project.name?.trim() || UNTITLED,
      clientName: project.clientName?.trim() || NO_CLIENT,
      stage: project.stage ?? null,
      projectValue: s.projectValue,
      fundsReceived: s.funds,
      totalReceivables: s.totalReceivables,
      receivableDues: s.receivableDues,
      estimatedExpenses: s.estimatedExpenses,
      disbursed: s.disbursed,
      committed: s.committed,
      billed: s.billed,
      dues: s.payableDues,
      cashFlow: s.cashFlow,
      expectedPnl: s.expectedPnl,
      contractCount: contracts.length,
      unattachedInflow: round2(
        unattached
          .filter((p) => p.direction === "inflow")
          .reduce((a, p) => a + Number(p.amount || 0), 0),
      ),
      unattachedOutflow: round2(
        unattached
          .filter((p) => p.direction === "outflow")
          .reduce((a, p) => a + Number(p.amount || 0), 0),
      ),
    });
  }

  // Biggest job first, then by name — a stable order that does not reshuffle as
  // payments land.
  return rows.sort(
    (a, b) =>
      b.projectValue - a.projectValue ||
      a.projectName.localeCompare(b.projectName),
  );
}

/**
 * The summary band, summed from the rows it is shown above.
 *
 * It takes the VISIBLE rows, never the unfiltered set. A band that does not
 * move with its own filter is a number without a denominator, and on a finance
 * screen that is the single worst thing available.
 */
export function summariseMatrix(
  rows: readonly PaymentsMatrixRow[],
): PaymentsMatrixBand {
  const sum = (pick: (r: PaymentsMatrixRow) => number) =>
    round2(rows.reduce((a, r) => a + pick(r), 0));

  return {
    totalProjects: rows.length,
    expectedPnl: sum((r) => r.expectedPnl),
    projectValue: sum((r) => r.projectValue),
    totalReceivables: sum((r) => r.totalReceivables),
    fundsReceived: sum((r) => r.fundsReceived),
    receivableDues: sum((r) => r.receivableDues),
    estimatedExpenses: sum((r) => r.estimatedExpenses),
    disbursed: sum((r) => r.disbursed),
    committed: sum((r) => r.committed),
    billed: sum((r) => r.billed),
    dues: sum((r) => r.dues),
    cashFlow: sum((r) => r.cashFlow),
  };
}

export interface MatrixFilter {
  /** Project stages to keep. Empty or absent = every stage. */
  stages?: readonly string[];
  /** Case-folded substring over project name and client name. */
  q?: string | null;
  /** Keep only rows where something is still payable. */
  duesOnly?: boolean;
}

/**
 * Narrow the matrix. Returned rows are the ones a screen renders, and
 * `summariseMatrix` must be given exactly this array — that is the contract the
 * band-equals-rows test enforces.
 */
export function filterMatrix(
  rows: readonly PaymentsMatrixRow[],
  filter: MatrixFilter = {},
): PaymentsMatrixRow[] {
  const stages = new Set((filter.stages ?? []).map((s) => s.toLowerCase()));
  const q = filter.q?.trim().toLowerCase() ?? "";

  return rows.filter((r) => {
    if (stages.size && !stages.has(String(r.stage ?? "").toLowerCase())) {
      return false;
    }
    if (
      q &&
      !r.projectName.toLowerCase().includes(q) &&
      !r.clientName.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (filter.duesOnly && r.dues <= 0) return false;
    return true;
  });
}

/**
 * The applied-filter chip's text (`110458` shows `Project Stage: Planning + 13`).
 *
 * Returns null when nothing is filtered, so a screen can tell "no filter" from
 * "a filter that matched everything" — those are different statements about the
 * band underneath.
 */
export function describeFilter(filter: MatrixFilter = {}): string | null {
  const parts: string[] = [];
  const stages = filter.stages ?? [];
  if (stages.length === 1) parts.push(`Project Stage: ${stages[0]}`);
  else if (stages.length > 1) {
    parts.push(`Project Stage: ${stages[0]} + ${stages.length - 1}`);
  }
  if (filter.q?.trim()) parts.push(`Search: ${filter.q.trim()}`);
  if (filter.duesOnly) parts.push("Dues outstanding");
  return parts.length ? parts.join(" · ") : null;
}
