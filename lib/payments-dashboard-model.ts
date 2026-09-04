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

/* ── The screen's vocabulary (Part 3 Unit 2) ──────────────────────────────── */

/**
 * ⚠ This lives in the MODEL, not in the screen. A `"use client"` module's
 * exported const is a client reference on the server: `tsc` passes, the build
 * passes, and every request throws (HANDOFF-V8 §11). Column names, the note
 * under each one and the tint rule are all vocabulary, so they live here where
 * a test can read them.
 */
export type MatrixColumnKey =
  | "projectValue"
  | "fundsReceived"
  | "totalReceivables"
  | "receivableDues"
  | "estimatedExpenses"
  | "disbursed"
  | "committed"
  | "billed"
  | "dues"
  | "cashFlow"
  | "expectedPnl";

export interface MatrixColumn {
  key: MatrixColumnKey;
  label: string;
  group: "Project" | "Inflow" | "Outflow" | "Result";
  /**
   * What the figure actually counts, in one short line. Every derived figure
   * travels with the two numbers it came from — a column header that only names
   * a word is how two screens end up meaning different things by it.
   */
  note: string;
  /**
   * A warning that belongs on the column but NOT in a summary tile, because it
   * is a paragraph. Only `totalReceivables` carries one, and it must: the same
   * two words mean a different quantity on the project Summary band, and that
   * collision is not settled (HANDOFF-V8 §10.8). Naming it is the alternative
   * to picking one quietly.
   */
  caution?: string;
}

/** The full text for a column's `title` — its note, plus any caution. */
export function columnTitle(c: MatrixColumn): string {
  return c.caution ? `${c.note} ${c.caution}` : c.note;
}

export const MATRIX_COLUMNS: readonly MatrixColumn[] = [
  {
    key: "projectValue",
    label: "Project Value",
    group: "Project",
    note: "The project's own recorded value.",
  },
  {
    key: "totalReceivables",
    label: "Total Receivables",
    group: "Inflow",
    note: "Client milestones signed off.",
    caution:
      "⚠ The project Summary band shows the contracted client total under " +
      "these same two words — both figures are real and the collision is NOT " +
      "settled (HANDOFF-V8 §10.8).",
  },
  {
    key: "fundsReceived",
    label: "Funds Received",
    group: "Inflow",
    note: "Client payments actually received, including any not attached to a contract.",
  },
  {
    key: "receivableDues",
    label: "Receivable Dues",
    group: "Inflow",
    note: "Total Receivables − Funds Received.",
  },
  {
    key: "estimatedExpenses",
    label: "Est. Expenses",
    group: "Outflow",
    note: "Sum of every vendor contract's value.",
  },
  {
    key: "disbursed",
    label: "Disbursed",
    group: "Outflow",
    note: "Money actually paid out, including spend attached to no contract.",
  },
  {
    key: "committed",
    label: "Committed",
    group: "Outflow",
    note: "Est. Expenses − Disbursed — what you still owe over the life of the job.",
  },
  {
    key: "billed",
    label: "Billed",
    group: "Outflow",
    note: "Vendor milestones signed off — work you have accepted.",
  },
  {
    key: "dues",
    label: "Dues",
    group: "Outflow",
    note: "Billed − Disbursed — payable today.",
  },
  {
    key: "cashFlow",
    label: "Cash Flow",
    group: "Result",
    note: "Funds Received − Disbursed.",
  },
  {
    key: "expectedPnl",
    label: "Expected P&L",
    group: "Result",
    note: "Project Value − Est. Expenses.",
  },
];

export type CellTone = "neutral" | "positive" | "warning" | "negative";

/** Money received, and the hero metric when it is healthy. */
const POSITIVE_KEYS = new Set<MatrixColumnKey>([
  "totalReceivables",
  "fundsReceived",
  "expectedPnl",
]);
/** Money still owed in either direction — pending, not wrong. */
const PENDING_KEYS = new Set<MatrixColumnKey>(["receivableDues", "dues"]);

/**
 * The tint for one cell.
 *
 * §2 rule 7 gives red a closed list of five jobs, and "a big number" is not one
 * of them. Red here means one thing only: the figure is NEGATIVE, which on this
 * table is always a genuine alert — over-disbursed against a contract, or cash
 * gone out faster than it came in. Everything else is green for money in, amber
 * for money still pending, and plain ink for the rest.
 */
export function cellTone(key: MatrixColumnKey, value: number): CellTone {
  if (value < 0) return "negative";
  if (POSITIVE_KEYS.has(key)) return value > 0 ? "positive" : "neutral";
  if (PENDING_KEYS.has(key)) return value > 0 ? "warning" : "neutral";
  return "neutral";
}
