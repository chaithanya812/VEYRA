/**
 * Account Receivables — PLAN-V4 §12.3, frame `110534`. HANDOFF-V8 Part 3 Unit 4.
 *
 * ⚠ THIS SCREEN RE-ENTERS NOTHING. Every row here is a `milestones` row that
 * Phase 8 §9.3's Financial Planning schedule already wrote, read through a
 * client `contracts` row. There is no receivables table, no invoice table and
 * no second copy of an amount: ageing a receivable is a QUESTION asked of the
 * payment schedule, not a new record of it. That is the interconnection the
 * owner asked for — "keep the whole system interconnected".
 *
 * The vocabulary is the one the owner settled on 2026-09-04 (HANDOFF-V8 §10.8),
 * deliberately symmetric with the payables side (§10.1):
 *
 *   Contracted = Σ client contracts       (the whole client commitment)
 *   Billed     = client milestones signed off
 *   Dues       = billed − received
 *
 * ⛔ NO MONEY IS INVENTED HERE. Contract-level figures come from
 * `lib/finance-model.ts::rollupContract`, the same function the project
 * Financial Planning band and the Payments Dashboard matrix call. What this
 * file adds is the per-milestone split — which milestone a receipt paid — and
 * the four buckets `110534`'s tiles count.
 */

import {
  actualDueOf,
  milestoneOverdue,
  num,
  round2,
  type Milestone,
} from "./finance-model";
import { buildLedger, type LedgerEntry } from "./payments-ledger-model";

/* ── Inputs ───────────────────────────────────────────────────────────────── */

export interface ReceivableProject {
  id: string;
  name: string | null;
  clientName: string | null;
  /** `110534`'s Sales Owner column. Null is a real state, not a blank. */
  salesOwner: string | null;
  /**
   * WHERE that name came from. `projects` has no `sales_owner_id`, so the name
   * is the originating lead's sales owner where there is a lead, and otherwise
   * whoever raised the client contract — which is a weaker claim and the screen
   * says so rather than presenting the two as the same fact.
   */
  salesOwnerSource?: "lead" | "contract" | "none";
  stage?: string | null;
}

export interface ReceivableContract {
  id: string;
  project_id: string | null;
  name: string | null;
  amount: number | string | null;
}

/**
 * A milestone, plus migration 0042's three write-off columns.
 *
 * They are OPTIONAL on purpose. Until 0042 is applied the data layer's
 * `select("*")` simply does not return them, and every row reads as the plain
 * milestone it is today — rather than a `select` naming a missing column, which
 * empties the WHOLE read silently (HANDOFF-V8 §11).
 */
export type ReceivableMilestone = Pick<
  Milestone,
  "id" | "contract_id" | "seq" | "name" | "pct" | "amount" | "tentative_due" | "work_done" | "actual_due"
> & {
  written_off_at?: string | null;
  written_off_by?: string | null;
  write_off_reason?: string | null;
};

/** A client receipt. `milestone_id` is honoured exactly when it is set. */
export type ReceivableReceipt = Pick<
  LedgerEntry,
  "id" | "contract_id" | "milestone_id" | "direction" | "amount" | "paid_on" | "created_at" | "reversal_of"
>;

/* ── The four tiles of `110534` ───────────────────────────────────────────── */

/**
 * ⚠ `Overdue Payment` and `Milestone Overdue` are DIFFERENT QUESTIONS, and the
 * frame shows both because a fit-out firm chases them separately:
 *
 *   Overdue Payment  — the work IS signed off, the money was due, it has not
 *                      arrived. Somebody rings the client.
 *   Milestone Overdue — the work is NOT signed off and its date has passed.
 *                      Nobody may invoice it; somebody rings the site.
 *
 * `work_done` is exactly what separates them, so the current columns support
 * the distinction with nothing added.
 */
export const RECEIVABLE_BUCKETS = [
  "overdue_payment",
  "milestone_overdue",
  "upcoming",
  "written_off",
  "settled",
] as const;
export type ReceivableBucket = (typeof RECEIVABLE_BUCKETS)[number];

/** The four the frame puts in tiles. `settled` is the remainder, not a tile. */
export const TILE_BUCKETS: readonly ReceivableBucket[] = [
  "overdue_payment",
  "milestone_overdue",
  "upcoming",
  "written_off",
];

export interface BucketMeta {
  label: string;
  /** What the tile actually counts, in one line — never a word on its own. */
  note: string;
  /** Amber = pending, red = a genuine alert, neutral = information. */
  tone: "neutral" | "green" | "amber" | "red";
}

/**
 * ⚠ Vocabulary lives in the MODEL, never in a `"use client"` module: an
 * exported const there is a client reference on the server, `tsc` passes,
 * `next build` passes, and every request throws (HANDOFF-V8 §11).
 *
 * Red appears once, on `Overdue Payment`. That is red's fourth job — a genuine
 * alert — and money signed off, due, and not arrived is the only genuine alert
 * on this screen (§2 rule 7).
 */
export const BUCKET_META: Record<ReceivableBucket, BucketMeta> = {
  overdue_payment: {
    label: "Overdue Payment",
    note: "Work signed off, due date passed, money not received.",
    tone: "red",
  },
  milestone_overdue: {
    label: "Milestone Overdue",
    note: "Work NOT signed off and its date has passed — not yet invoiceable.",
    tone: "amber",
  },
  upcoming: {
    label: "Upcoming Milestone",
    note: "Still to fall due — signed off but not yet payable, or work still to come.",
    tone: "neutral",
  },
  written_off: {
    label: "Written Off Payments",
    note: "Given up on, with a who, a when and a reason. The row is never deleted.",
    tone: "neutral",
  },
  settled: {
    label: "Received in full",
    note: "Nothing pending on this milestone.",
    tone: "green",
  },
};

/* ── Allocation ───────────────────────────────────────────────────────────── */

/**
 * Which milestone a receipt paid.
 *
 * A payment carrying `milestone_id` is applied to that milestone exactly —
 * the user said so. Everything else is a receipt against the CONTRACT with no
 * milestone named, and the schedule is worked through oldest-first: the way
 * every receivables ledger on earth applies an unallocated receipt, and the
 * only rule under which the rows foot to the contract's own `billed − received`
 * without inventing a figure.
 *
 * The alternative — leaving unnamed receipts unallocated — would print
 * `Received ₹0` on every row of a project that has been paid ₹5,60,000, and
 * make Σ Pending disagree with the Receivable Dues the project screens show.
 * Two screens disagreeing about one project is the exact defect §10.8 exists to
 * end, so this is stated on the screen rather than done quietly.
 *
 * Anything left over after every milestone is full is an OVER-receipt — a
 * credit, real and reportable, never silently absorbed.
 */
export function allocateReceipts(
  milestones: readonly ReceivableMilestone[],
  receipts: readonly ReceivableReceipt[],
): { byMilestone: Map<string, number>; unallocated: number } {
  const byMilestone = new Map<string, number>();
  const named = new Map<string, number>();

  let pool = 0;
  for (const r of receipts) {
    const amount = num(r.amount);
    if (r.milestone_id) named.set(r.milestone_id, num(named.get(r.milestone_id)) + amount);
    else pool += amount;
  }

  const ordered = [...milestones].sort(compareByDue);
  for (const m of ordered) {
    const capacity = round2(num(m.amount) - num(named.get(m.id)));
    // A milestone already over-paid by a NAMED receipt keeps that receipt in
    // full; the pool simply has nothing to add to it.
    const fromPool = capacity > 0 ? Math.min(capacity, pool) : 0;
    pool = round2(pool - fromPool);
    byMilestone.set(m.id, round2(num(named.get(m.id)) + fromPool));
  }

  return { byMilestone, unallocated: round2(pool) };
}

/** Oldest first: due date, then the schedule's own order. */
function compareByDue(a: ReceivableMilestone, b: ReceivableMilestone): number {
  const da = dueDateOf(a) ?? "9999-12-31";
  const db = dueDateOf(b) ?? "9999-12-31";
  return da.localeCompare(db) || num(a.seq) - num(b.seq);
}

/**
 * The date `110534`'s Due Date column shows.
 *
 * `actualDueOf` gives the real date once the work is signed off (falling back
 * to the tentative one); an unsigned milestone has no actual due date at all,
 * so it shows the tentative date it was planned for. Both are real; the row
 * says which it is rather than printing a date whose meaning the reader has to
 * guess.
 */
export function dueDateOf(m: ReceivableMilestone): string | null {
  return actualDueOf(m) ?? m.tentative_due ?? null;
}

export function dueKindOf(m: ReceivableMilestone): "actual" | "tentative" | "none" {
  if (actualDueOf(m)) return m.actual_due ? "actual" : "tentative";
  return m.tentative_due ? "tentative" : "none";
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

export interface ReceivableRow {
  milestoneId: string;
  contractId: string;
  contractName: string;
  projectId: string;
  projectName: string;
  clientName: string;
  salesOwner: string;
  salesOwnerSource: "lead" | "contract" | "none";
  stage: string | null;

  /** `Design Signoff (20%)` — the frame's own Milestone (%) column. */
  milestoneLabel: string;
  milestoneName: string;
  pct: number;

  dueDate: string | null;
  dueKind: "actual" | "tentative" | "none";

  amount: number;
  received: number;
  /** amount − received. Never negative: an over-receipt is a credit, below. */
  pending: number;
  /** received − amount, when a milestone has been paid more than it is worth. */
  overReceived: number;

  signedOff: boolean;
  writtenOff: boolean;
  writtenOffAt: string | null;
  writeOffReason: string | null;

  bucket: ReceivableBucket;
}

const NO_CLIENT = "(No client recorded)";
const NO_OWNER = "(Not assigned)";
const UNTITLED = "Untitled project";

/**
 * Today as `YYYY-MM-DD` in the machine's own zone.
 *
 * Taken as a PARAMETER everywhere below rather than read inside the bucket
 * rule, so a test can state what "overdue" meant on a given day instead of
 * being true only until tomorrow.
 */
export function todayIso(now: Date = new Date()): string {
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Which of the four tiles a milestone belongs to. Exactly one, always — the
 * tiles are a PARTITION of every client milestone, which is what lets the band
 * underneath them foot to `Contracted − Received`.
 */
export function bucketOf(
  m: ReceivableMilestone,
  pending: number,
  today: string,
): ReceivableBucket {
  if (m.written_off_at) return "written_off";
  if (pending <= 0) return "settled";
  if (m.work_done) {
    const due = dueDateOf(m);
    return due && due.slice(0, 10) < today ? "overdue_payment" : "upcoming";
  }
  // Not signed off: `milestoneOverdue` is the existing predicate for "the work
  // slipped", reused rather than re-stated (HANDOFF-V8 §5).
  return milestoneOverdue(m.tentative_due, m.work_done) ? "milestone_overdue" : "upcoming";
}

/**
 * Build `110534`'s table.
 *
 * Client contracts only — Account Receivables is money owed TO the firm, and a
 * vendor milestone on this screen would be a payable wearing the wrong hat.
 * A contract whose `project_id` does not resolve to a project is skipped rather
 * than inventing a row: the table's first column is a project, and a project
 * nobody can name cannot be chased.
 */
export function receivableRows(input: {
  projects: readonly ReceivableProject[];
  contracts: readonly ReceivableContract[];
  milestonesByContract: ReadonlyMap<string, readonly ReceivableMilestone[]>;
  receipts: readonly ReceivableReceipt[];
  today?: string;
}): ReceivableRow[] {
  const today = input.today ?? todayIso();
  const projects = new Map(input.projects.map((p) => [p.id, p]));

  // A reversed receipt and its reversal both stop counting — one event, two
  // rows, zero money (HARD RULE 4). `buildLedger` is the one place that rule
  // is implemented, so it is reused rather than repeated.
  const standing = buildLedger(
    input.receipts.filter((r) => r.direction === "inflow") as unknown as LedgerEntry[],
    false,
  ).rows as unknown as ReceivableReceipt[];

  const receiptsByContract = new Map<string, ReceivableReceipt[]>();
  for (const r of standing) {
    if (!r.contract_id) continue;
    const list = receiptsByContract.get(r.contract_id) ?? [];
    list.push(r);
    receiptsByContract.set(r.contract_id, list);
  }

  const rows: ReceivableRow[] = [];
  for (const c of input.contracts) {
    const project = c.project_id ? projects.get(c.project_id) : undefined;
    if (!project) continue;

    const ms = input.milestonesByContract.get(c.id) ?? [];
    const { byMilestone } = allocateReceipts(ms, receiptsByContract.get(c.id) ?? []);

    for (const m of ms) {
      const amount = round2(num(m.amount));
      const received = round2(num(byMilestone.get(m.id)));
      const pending = round2(Math.max(0, amount - received));
      const pct = num(m.pct);

      rows.push({
        milestoneId: m.id,
        contractId: c.id,
        contractName: c.name?.trim() || "Client contract",
        projectId: project.id,
        projectName: project.name?.trim() || UNTITLED,
        clientName: project.clientName?.trim() || NO_CLIENT,
        salesOwner: project.salesOwner?.trim() || NO_OWNER,
        salesOwnerSource: project.salesOwner?.trim()
          ? (project.salesOwnerSource ?? "lead")
          : "none",
        stage: project.stage ?? null,
        milestoneLabel: `${m.name} (${formatPct(pct)}%)`,
        milestoneName: m.name,
        pct,
        dueDate: dueDateOf(m),
        dueKind: dueKindOf(m),
        amount,
        received,
        pending,
        overReceived: round2(Math.max(0, received - amount)),
        signedOff: !!m.work_done,
        writtenOff: !!m.written_off_at,
        writtenOffAt: m.written_off_at ?? null,
        writeOffReason: m.write_off_reason ?? null,
        bucket: bucketOf(m, pending, today),
      });
    }
  }

  // Oldest money first — the row somebody has to chase today sits at the top.
  return rows.sort(
    (a, b) =>
      (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
      a.projectName.localeCompare(b.projectName) ||
      a.milestoneName.localeCompare(b.milestoneName),
  );
}

/** 20 not 20.00; 12.5 kept. A percentage is a label here, not a calculation. */
function formatPct(pct: number): string {
  return String(round2(pct));
}

/* ── The band ─────────────────────────────────────────────────────────────── */

export interface ReceivablesTile {
  bucket: ReceivableBucket;
  label: string;
  note: string;
  tone: BucketMeta["tone"];
  /** `110534` prints `n Milestones | ₹` — the count travels with the money. */
  count: number;
  amount: number;
}

export interface ReceivablesSummary {
  /** Σ client contract values — the whole client commitment (§10.8). */
  contracted: number;
  /** Client milestones signed off — what may be invoiced (§10.8). */
  billed: number;
  /** Client money actually received, reversed pairs excluded. */
  received: number;
  /** `billed − received`. Unchanged by §10.8. */
  dues: number;
  /** Σ of every milestone amount, so schedule drift is visible not hidden. */
  scheduled: number;
  /** `scheduled − contracted`. Non-zero means a schedule does not foot. */
  scheduleDrift: number;
  /** Receipts beyond every milestone's value — a credit, never absorbed. */
  overReceived: number;
  tiles: ReceivablesTile[];
  milestoneCount: number;
  projectCount: number;
}

/**
 * The band above the table, summed from the rows shown BELOW it.
 *
 * `contracted` cannot come from the rows — a milestone schedule can drift from
 * its contract value — so it is passed in from the contracts themselves and the
 * drift is printed rather than quietly reconciled.
 */
export function summariseReceivables(
  rows: readonly ReceivableRow[],
  contracts: readonly ReceivableContract[],
): ReceivablesSummary {
  const sum = (pick: (r: ReceivableRow) => number) =>
    round2(rows.reduce((a, r) => a + pick(r), 0));

  const visibleContracts = new Set(rows.map((r) => r.contractId));
  const contracted = round2(
    contracts
      .filter((c) => visibleContracts.has(c.id))
      .reduce((a, c) => a + num(c.amount), 0),
  );

  const billed = sum((r) => (r.signedOff && !r.writtenOff ? r.amount : 0));
  const received = sum((r) => r.received);
  const scheduled = sum((r) => r.amount);

  const tiles = TILE_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    return {
      bucket,
      label: BUCKET_META[bucket].label,
      note: BUCKET_META[bucket].note,
      tone: BUCKET_META[bucket].tone,
      count: inBucket.length,
      amount: round2(inBucket.reduce((a, r) => a + r.pending, 0)),
    };
  });

  return {
    contracted,
    billed,
    received,
    // `billed − received` (§10.8), with `received` counted over EVERY client
    // milestone, not only the signed-off ones. That is exactly what
    // `rollupContract` does with `billable − settled`, and this figure has to
    // agree with the project screens or the collision §10.8 settled reopens
    // one screen down.
    dues: round2(billed - received),
    scheduled,
    scheduleDrift: round2(scheduled - contracted),
    overReceived: sum((r) => r.overReceived),
    tiles,
    milestoneCount: rows.length,
    projectCount: new Set(rows.map((r) => r.projectId)).size,
  };
}

/* ── The filter ───────────────────────────────────────────────────────────── */

export interface ReceivablesFilter {
  /** One of the four tiles, or null for everything. */
  bucket?: ReceivableBucket | null;
  /** Case-folded substring over project, client, owner and milestone. */
  q?: string | null;
}

export function filterReceivables(
  rows: readonly ReceivableRow[],
  filter: ReceivablesFilter = {},
): ReceivableRow[] {
  const q = filter.q?.trim().toLowerCase() ?? "";
  return rows.filter((r) => {
    if (filter.bucket && r.bucket !== filter.bucket) return false;
    if (
      q &&
      !r.projectName.toLowerCase().includes(q) &&
      !r.clientName.toLowerCase().includes(q) &&
      !r.salesOwner.toLowerCase().includes(q) &&
      !r.milestoneName.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

/** The applied-filter chip's text, or null when nothing is filtered. */
export function describeReceivablesFilter(
  filter: ReceivablesFilter = {},
): string | null {
  const parts: string[] = [];
  if (filter.bucket) parts.push(BUCKET_META[filter.bucket].label);
  if (filter.q?.trim()) parts.push(`Search: ${filter.q.trim()}`);
  return parts.length ? parts.join(" · ") : null;
}

export function parseBucket(value: string | null | undefined): ReceivableBucket | null {
  const v = String(value ?? "").trim();
  return (RECEIVABLE_BUCKETS as readonly string[]).includes(v)
    ? (v as ReceivableBucket)
    : null;
}

/* ── Writing one off ──────────────────────────────────────────────────────── */

/**
 * A write-off is a DECISION, so it needs a who, a when and a why — never a
 * delete and never a silent zero. The amount stays on the row exactly as it
 * was; what changes is that the firm has stopped expecting it.
 */
export function validateWriteOff(input: {
  milestoneId?: string | null;
  reason?: string | null;
}): { ok: true; milestoneId: string; reason: string } | { ok: false; error: string } {
  const milestoneId = String(input.milestoneId ?? "").trim();
  if (!milestoneId) return { ok: false, error: "Nothing to write off." };
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 4) {
    return {
      ok: false,
      error: "Give a reason for writing this off — it is a decision somebody will have to explain.",
    };
  }
  if (reason.length > 500) {
    return { ok: false, error: "Keep the reason under 500 characters." };
  }
  return { ok: true, milestoneId, reason };
}
