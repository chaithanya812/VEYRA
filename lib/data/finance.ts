import "server-only";
import { recordAudit } from "./permissions";
import { withOrg } from "./with-org";
import {
  CONTRACT_SOURCES,
  PAYMENT_DIRECTIONS,
  DIRECTION_META,
  MILESTONE_META,
  SOURCE_LABELS,
  milestonesFoot,
  milestoneOverdue,
  pnl,
  rollupContract,
  scheduleTotals,
  sourceOf,
  sumBy,
  summarisePlan,
  type Contract,
  type ContractRollup,
  type ContractSource,
  type FinancialPlanSummary,
  type Milestone,
  type Payment,
  type PaymentDirection,
} from "@/lib/finance-model";
import { listOptions } from "./workspace";
import { listMembers } from "./team";
import {
  directionFor,
  reversalOf,
  type LedgerEntry,
  type LedgerSide,
} from "@/lib/payments-ledger-model";

/**
 * Finance data module — contracts, milestone billing and payments. Follows the
 * Leads reference pattern exactly: no table is touched directly, everything
 * goes through withOrg() so org_id filtering / stamping is automatic and
 * cross-tenant leakage is impossible by construction.
 *
 * All amounts are CONFIG the user enters or pure SUMs of stored values — this
 * module never computes or invents an amount (HARD RULE 4).
 */
export {
  CONTRACT_SOURCES,
  PAYMENT_DIRECTIONS,
  DIRECTION_META,
  MILESTONE_META,
  SOURCE_LABELS,
  milestonesFoot,
  pnl,
  sumBy,
  milestoneOverdue,
  type Contract,
  type ContractSource,
  type Milestone,
  type Payment,
  type PaymentDirection,
};

export async function listContracts(filter?: {
  source?: ContractSource;
}): Promise<Contract[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("contracts").select("*");
  if (filter?.source) q = q.eq("source", filter.source);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Contract[];
}

/** Milestone count per contract id — feeds the #milestones column in the list. */
export async function milestoneCounts(): Promise<Record<string, number>> {
  const { db } = await withOrg();
  const { data, error } = await db.table("milestones").select("contract_id");
  if (error) throw error;
  const rows = (data ?? []) as unknown as { contract_id: string }[];
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.contract_id] = (acc[r.contract_id] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getContract(
  id: string,
): Promise<{
  contract: Contract;
  milestones: Milestone[];
  payments: Payment[];
} | null> {
  const { db } = await withOrg();
  const { data: contract, error } = await db
    .table("contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!contract) return null;

  const [milestoneRes, paymentRes] = await Promise.all([
    db
      .table("milestones")
      .select("*")
      .eq("contract_id", id)
      .order("seq", { ascending: true }),
    db
      .table("payments")
      .select("*")
      .eq("contract_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (milestoneRes.error) throw milestoneRes.error;

  return {
    contract: contract as unknown as Contract,
    milestones: (milestoneRes.data ?? []) as unknown as Milestone[],
    payments: (paymentRes.data ?? []) as unknown as Payment[],
  };
}

export async function createContract(input: {
  project_label?: string | null;
  name: string;
  amount?: number;
  source?: ContractSource;
  milestones: {
    seq: number;
    name: string;
    pct: number;
    amount?: number;
    tentative_due?: string | null;
  }[];
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const { data, error } = await db.table("contracts").insert({
    project_label: input.project_label || null,
    name: input.name,
    amount: input.amount ?? 0,
    source: input.source ?? "client",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  if (input.milestones.length > 0) {
    const { error: msError } = await db.table("milestones").insert(
      input.milestones.map((m) => ({
        contract_id: id,
        seq: m.seq,
        name: m.name,
        pct: m.pct ?? 0,
        amount: m.amount ?? 0,
        tentative_due: m.tentative_due || null,
      })),
    );
    if (msError) return { error: msError.message };
  }

  return { id };
}

export async function toggleMilestoneWorkDone(
  milestoneId: string,
  done: boolean,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  // Read the milestone first: marking work done is what makes an amount BILLABLE,
  // so this is the single most consequential toggle on the finance screen, and
  // the ledger has to be able to say which milestone and for how much.
  const { data: before } = await db
    .table("milestones")
    .select("id, name, amount, work_done, contract_id")
    .eq("id", milestoneId)
    .maybeSingle();
  const prev = before as unknown as {
    name: string | null;
    amount: number | null;
    work_done: boolean | null;
    contract_id: string | null;
  } | null;

  const { error } = await db
    .table("milestones")
    .updateById(milestoneId, { work_done: done });
  if (error) return { error: error.message };

  if (prev && prev.work_done !== done) {
    await recordAudit({
      entity: "milestone",
      entityId: milestoneId,
      action: done ? "mark_work_done" : "unmark_work_done",
      before: { work_done: prev.work_done ?? false },
      after: {
        work_done: done,
        name: prev.name,
        amount: prev.amount,
        contract_id: prev.contract_id,
      },
    });
  }
  return {};
}

export async function recordPayment(input: {
  contract_id?: string | null;
  milestone_id?: string | null;
  project_label?: string | null;
  direction: PaymentDirection;
  amount: number;
  mode?: string | null;
  paid_on?: string | null;
  reference?: string | null;
  note?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();
  const { data, error } = await db.table("payments").insert({
    contract_id: input.contract_id || null,
    milestone_id: input.milestone_id || null,
    project_label: input.project_label || null,
    direction: input.direction,
    amount: input.amount ?? 0,
    mode: input.mode || null,
    paid_on: input.paid_on || null,
    reference: input.reference || null,
    note: input.note || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

/**
 * Org-wide cash / P&L summary: SUM payments by direction + Σ client-contract
 * amounts. Pure aggregation of stored config — scoped to the caller's org.
 */
export async function financeSummary(filter?: {
  /** Preferred: the real FK added in migration 0028. */
  project_id?: string;
  /** Legacy display name, kept for rows whose label never resolved. */
  project_label?: string;
}): Promise<{
  inflow: number;
  outflow: number;
  pnl: number;
  contractValue: number;
}> {
  const { db } = await withOrg();

  // Scope by id when we have one — a name filter matched two projects that
  // happened to share a name and silently merged their books.
  let pq = db.table("payments").select("direction, amount, project_id, project_label");
  if (filter?.project_id) pq = pq.eq("project_id", filter.project_id);
  else if (filter?.project_label) pq = pq.eq("project_label", filter.project_label);
  const { data: payments, error: pErr } = await pq;
  if (pErr) throw pErr;

  let cq = db.table("contracts").select("amount, source, project_id, project_label");
  if (filter?.project_id) cq = cq.eq("project_id", filter.project_id);
  else if (filter?.project_label) cq = cq.eq("project_label", filter.project_label);
  const { data: contracts, error: cErr } = await cq;
  if (cErr) throw cErr;

  const payRows = (payments ?? []) as unknown as {
    direction: string;
    amount: number | string | null;
  }[];
  const contractRows = (contracts ?? []) as unknown as {
    amount: number | string | null;
    source: string;
  }[];

  const inflow = sumBy(
    payRows.filter((p) => p.direction === "inflow"),
    (p) => Number(p.amount) || 0,
  );
  const outflow = sumBy(
    payRows.filter((p) => p.direction === "outflow"),
    (p) => Number(p.amount) || 0,
  );

  return {
    inflow,
    outflow,
    pnl: pnl(inflow, outflow),
    contractValue: sumBy(
      contractRows.filter((c) => c.source === "client"),
      (c) => Number(c.amount) || 0,
    ),
  };
}


/* ══════════════════════════════════════════════════════════════════════════
   Financial Planning, per project (PLAN-V4 §9.3, frames `105238` / `105325`)
   ══════════════════════════════════════════════════════════════════════════
   Reads the SAME `contracts` + `milestones` rows the company-wide finance
   screens read, scoped by the real `project_id` FK from migration 0028. There
   is no project-private contract table, so the schedule planned here is
   literally the schedule Account Receivables (§12.3) will age — nothing is
   re-entered, which is the interconnection the owner asked for.
   ────────────────────────────────────────────────────────────────────────── */

export interface ContractWithDetail {
  contract: Contract;
  milestones: Milestone[];
  payments: Payment[];
  categories: string[];
  vendorName: string | null;
  rollup: ContractRollup;
}

export interface ProjectFinancialPlan {
  inflow: ContractWithDetail[];
  outflow: ContractWithDetail[];
  summary: FinancialPlanSummary;
  /** Files filed against a contract — the Documents tab. */
  documents: { id: string; name: string; contract_id: string; created_at: string }[];
  vendors: { id: string; name: string }[];
  categories: string[];
}

export async function getProjectFinancialPlan(
  projectId: string,
  projectValue: number,
): Promise<ProjectFinancialPlan> {
  const { db } = await withOrg();

  const [contractRes, vendorRes, options] = await Promise.all([
    db
      .table("contracts")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    db.table("vendors").select("id, name").order("name", { ascending: true }),
    listOptions("labour_category"),
  ]);
  if (contractRes.error) throw contractRes.error;

  const contracts = (contractRes.data ?? []) as unknown as Contract[];
  const ids = contracts.map((c) => c.id);

  const [msRes, payRes, looseRes, catRes, docRes] = await Promise.all([
    ids.length
      ? db.table("milestones").select("*").in("contract_id", ids).order("seq", { ascending: true })
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.table("payments").select("*").in("contract_id", ids)
      : Promise.resolve({ data: [] }),
    // Money that moved on this project against no contract at all. A separate
    // read rather than a widened one, so the contract rollups keep reading
    // exactly the rows they always did.
    db.table("payments").select("*").eq("project_id", projectId).is("contract_id", null),
    ids.length
      ? db.table("contract_categories").select("contract_id, category").in("contract_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.table("project_files").select("id, name, contract_id, created_at").in("contract_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  const msBy = new Map<string, Milestone[]>();
  for (const m of (msRes.data ?? []) as unknown as Milestone[]) {
    const list = msBy.get(m.contract_id) ?? [];
    list.push(m);
    msBy.set(m.contract_id, list);
  }

  const payBy = new Map<string, Payment[]>();
  for (const p of (payRes.data ?? []) as unknown as Payment[]) {
    if (!p.contract_id) continue;
    const list = payBy.get(p.contract_id) ?? [];
    list.push(p);
    payBy.set(p.contract_id, list);
  }

  // Payments carrying this project but no contract are still money in or out
  // (see `summarisePlan`). An unchecked .error here would silently empty them.
  if (looseRes.error) throw looseRes.error;
  const unattachedPayments = (looseRes.data ?? []) as unknown as Payment[];

  const catBy = new Map<string, string[]>();
  for (const c of (catRes.data ?? []) as unknown as {
    contract_id: string;
    category: string;
  }[]) {
    const list = catBy.get(c.contract_id) ?? [];
    list.push(c.category);
    catBy.set(c.contract_id, list);
  }

  const vendors = (vendorRes.data ?? []) as unknown as { id: string; name: string }[];
  const vendorNames = new Map(vendors.map((v) => [v.id, v.name]));

  const detail = (c: Contract): ContractWithDetail => {
    const milestones = msBy.get(c.id) ?? [];
    const payments = payBy.get(c.id) ?? [];
    return {
      contract: c,
      milestones,
      payments,
      categories: catBy.get(c.id) ?? [],
      // A null vendor_id IS the "Unlisted Vendor / Miscellaneous" row from
      // `105325` — a real state that ad-hoc spend needs, not missing data.
      vendorName: c.vendor_id ? (vendorNames.get(c.vendor_id) ?? "Removed vendor") : null,
      rollup: rollupContract(c, milestones, payments),
    };
  };

  return {
    inflow: contracts.filter((c) => sourceOf(c) === "client").map(detail),
    outflow: contracts.filter((c) => sourceOf(c) === "vendor").map(detail),
    summary: summarisePlan({
      projectValue,
      contracts,
      milestonesByContract: msBy,
      paymentsByContract: payBy,
      unattachedPayments,
    }),
    documents: (docRes.data ?? []) as unknown as {
      id: string;
      name: string;
      contract_id: string;
      created_at: string;
    }[],
    vendors,
    categories: options.map((o) => o.label),
  };
}

export async function createProjectContract(input: {
  projectId: string;
  source: ContractSource;
  name: string;
  amount: number;
  vendorId?: string | null;
  categories?: string[];
  notes?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "A contract needs a name." };
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { error: "The contract value must be zero or more." };
  }

  const { db, ctx } = await withOrg();
  const { data: project } = await db
    .table("projects")
    .select("id, name")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { error: "That project is not in this workspace." };

  const { data, error } = await db.table("contracts").insert({
    project_id: input.projectId,
    // Kept in step for the legacy rows and reports that still read the label.
    project_label: (project as unknown as { name: string }).name,
    name,
    amount: input.amount,
    source: input.source,
    vendor_id: input.source === "vendor" ? (input.vendorId ?? null) : null,
    notes: input.notes?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;
  const cats = [...new Set((input.categories ?? []).map((c) => c.trim()).filter(Boolean))];
  if (cats.length > 0) {
    await db
      .table("contract_categories")
      .insert(cats.map((category) => ({ contract_id: id, category })));
  }
  return { id };
}

export async function updateContractDetails(
  id: string,
  patch: {
    name?: string;
    amount?: number;
    vendorId?: string | null;
    notes?: string | null;
  },
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { error: "A contract needs a name." };
    values.name = n;
  }
  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount) || patch.amount < 0) {
      return { error: "The contract value must be zero or more." };
    }
    values.amount = patch.amount;
  }
  if (patch.vendorId !== undefined) values.vendor_id = patch.vendorId || null;
  if (patch.notes !== undefined) values.notes = patch.notes?.trim() || null;

  const { error } = await db.table("contracts").updateById(id, values);
  return error ? { error: error.message } : {};
}

/**
 * Delete a contract — but never one with cash against it.
 *
 * Ledgers are append-only (HARD RULE 4). A contract with payments recorded is
 * history; the way to undo it is a reversing entry, not a delete that silently
 * detaches real money from the thing it was paid for.
 */
export async function deleteContract(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();

  const { data: paid } = await db
    .table("payments")
    .select("id")
    .eq("contract_id", id)
    .limit(1);
  if (((paid ?? []) as unknown[]).length > 0) {
    return {
      error:
        "This contract has payments against it. Ledgers are append-only — reverse the payments rather than deleting the contract.",
    };
  }

  // Captured BEFORE the delete: after it there is no row left to describe, and
  // "a contract was deleted" without saying WHICH one is not an audit entry.
  const { data: doomed } = await db
    .table("contracts")
    .select("id, name, amount, vendor_id, project_id")
    .eq("id", id)
    .maybeSingle();

  const { data: ms } = await db.table("milestones").select("id").eq("contract_id", id);
  for (const m of (ms ?? []) as unknown as { id: string }[]) {
    await db.table("milestones").deleteById(m.id);
  }
  const { error } = await db.table("contracts").deleteById(id);
  if (error) return { error: error.message };

  await recordAudit({
    entity: "contract",
    entityId: id,
    action: "delete",
    before: doomed ?? null,
    after: null,
  });
  return {};
}

/**
 * Replace a contract's payment schedule.
 *
 * **The 100% rule is enforced HERE, not only in the browser** (`105238`'s bold
 * Total row). A schedule that bills 90% of a contract loses the last 10% for
 * good, and nobody notices until the final invoice comes up short.
 *
 * A milestone that already carries a payment is never removed — that would
 * orphan real cash. The write refuses and says so.
 */
export async function saveSchedule(
  contractId: string,
  rows: {
    id?: string | null;
    name: string;
    pct: number;
    amount: number;
    tentative_due?: string | null;
    work_done?: boolean;
    actual_due?: string | null;
  }[],
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data: contract } = await db
    .table("contracts")
    .select("id, amount")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { error: "That contract is not in this workspace." };

  const clean = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name);
  if (clean.length === 0) return { error: "A schedule needs at least one milestone." };

  const totals = scheduleTotals(clean, (contract as unknown as { amount: number }).amount);
  if (!totals.isComplete) {
    return {
      error: `The schedule totals ${totals.pct}%, not 100%. ${
        totals.remainingPct > 0
          ? `${totals.remainingPct}% is still unallocated.`
          : `It is over by ${Math.abs(totals.remainingPct)}%.`
      }`,
    };
  }

  const { data: existingRows } = await db
    .table("milestones")
    .select("id")
    .eq("contract_id", contractId);
  const existing = new Set(
    ((existingRows ?? []) as unknown as { id: string }[]).map((m) => m.id),
  );
  const kept = new Set(clean.map((r) => r.id).filter(Boolean) as string[]);

  for (const id of existing) {
    if (kept.has(id)) continue;
    const { data: paid } = await db
      .table("payments")
      .select("id")
      .eq("milestone_id", id)
      .limit(1);
    if (((paid ?? []) as unknown[]).length > 0) {
      return {
        error:
          "A milestone with a payment against it cannot be removed from the schedule.",
      };
    }
    await db.table("milestones").deleteById(id);
  }

  for (const [i, r] of clean.entries()) {
    const values = {
      seq: i + 1,
      name: r.name,
      pct: r.pct,
      amount: r.amount,
      tentative_due: r.tentative_due || null,
      work_done: !!r.work_done,
      // Actual Due materialises only when Work Done is ticked — that is the
      // whole receivables engine (`105238`).
      actual_due: r.work_done ? r.actual_due || r.tentative_due || null : null,
    };
    if (r.id && existing.has(r.id)) {
      const { error } = await db.table("milestones").updateById(r.id, values);
      if (error) return { error: error.message };
    } else {
      const { error } = await db
        .table("milestones")
        .insert({ contract_id: contractId, ...values });
      if (error) return { error: error.message };
    }
  }
  return {};
}

export async function setContractCategories(
  contractId: string,
  categories: string[],
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data: contract } = await db
    .table("contracts")
    .select("id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { error: "That contract is not in this workspace." };

  const wanted = new Set(categories.map((c) => c.trim()).filter(Boolean));
  const { data: current } = await db
    .table("contract_categories")
    .select("id, category")
    .eq("contract_id", contractId);
  const rows = (current ?? []) as unknown as { id: string; category: string }[];

  for (const row of rows) {
    if (!wanted.has(row.category)) {
      await db.table("contract_categories").deleteById(row.id);
    }
  }

  const have = new Set(rows.map((r) => r.category));
  const missing = [...wanted].filter((c) => !have.has(c));
  if (missing.length > 0) {
    const { error } = await db
      .table("contract_categories")
      .insert(missing.map((category) => ({ contract_id: contractId, category })));
    if (error) return { error: error.message };
  }
  return {};
}


/* ══════════════════════════════════════════════════════════════════════════
   Project Payments — the ledger (PLAN-V4 §9.4, frames `105403` / `105429` /
   `105444`)
   ══════════════════════════════════════════════════════════════════════════
   Same `payments` table as everywhere else, scoped by `project_id`. Expenses
   are outflow, funds are inflow — one table, one direction column, no
   project-private copy.
   ────────────────────────────────────────────────────────────────────────── */

export interface ProjectLedger {
  expenses: LedgerEntry[];
  funds: LedgerEntry[];
  contracts: { id: string; name: string; source: string }[];
  vendors: { id: string; name: string }[];
  members: { id: string; name: string }[];
  categories: string[];
  summary: FinancialPlanSummary;
}

export async function getProjectLedger(
  projectId: string,
  projectValue: number,
): Promise<ProjectLedger> {
  const { db } = await withOrg();

  const [payRes, contractRes, vendorRes, members, options] = await Promise.all([
    db
      .table("payments")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    db
      .table("contracts")
      .select("id, name, source, amount")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    db.table("vendors").select("id, name").order("name", { ascending: true }),
    listMembers(),
    listOptions("labour_category"),
  ]);
  if (payRes.error) throw payRes.error;

  const all = (payRes.data ?? []) as unknown as LedgerEntry[];
  const contracts = (contractRes.data ?? []) as unknown as {
    id: string;
    name: string;
    source: string;
    amount: number;
  }[];

  // The header band is the same summary the Financial Planning screen shows —
  // one computation, so the two screens cannot disagree about one project.
  const msRes = contracts.length
    ? await db.table("milestones").select("*").in("contract_id", contracts.map((c) => c.id))
    : { data: [] };

  const msBy = new Map<string, Milestone[]>();
  for (const m of (msRes.data ?? []) as unknown as Milestone[]) {
    const list = msBy.get(m.contract_id) ?? [];
    list.push(m);
    msBy.set(m.contract_id, list);
  }
  const payBy = new Map<string, Payment[]>();
  const unattachedPayments: Payment[] = [];
  for (const p of all) {
    if (!p.contract_id) {
      unattachedPayments.push(p as unknown as Payment);
      continue;
    }
    const list = payBy.get(p.contract_id) ?? [];
    list.push(p);
    payBy.set(p.contract_id, list);
  }

  return {
    expenses: all.filter((p) => p.direction === "outflow"),
    funds: all.filter((p) => p.direction === "inflow"),
    contracts: contracts.map((c) => ({ id: c.id, name: c.name, source: c.source })),
    vendors: (vendorRes.data ?? []) as unknown as { id: string; name: string }[],
    members: members.map((m) => ({ id: m.id, name: m.name })),
    categories: options.map((o) => o.label),
    summary: summarisePlan({
      projectValue,
      contracts: contracts as unknown as Contract[],
      milestonesByContract: msBy,
      paymentsByContract: payBy,
      unattachedPayments,
    }),
  };
}

/**
 * Record an expense or a fund.
 *
 * **The asymmetry is deliberate and preserved** (`105444` vs `105429`): a fund
 * MUST be against a client contract, an expense need not be against anything.
 * Money coming in is always against something the client agreed to pay; money
 * going out is sometimes just money going out. Forcing a contract on an expense
 * would push people to invent one.
 */
export async function addLedgerEntry(input: {
  projectId: string;
  side: LedgerSide;
  amount: number;
  paidOn?: string | null;
  contractId?: string | null;
  milestoneId?: string | null;
  vendorId?: string | null;
  memberId?: string | null;
  mode?: string | null;
  expenseType?: string | null;
  category?: string | null;
  reference?: string | null;
  note?: string | null;
  stockInRequested?: boolean;
}): Promise<{ id?: string; error?: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Enter an amount greater than zero." };
  }
  if (input.side === "funds" && !input.contractId) {
    return {
      error:
        "A fund has to be collected against a client contract — that is what makes it a receipt rather than an unexplained credit.",
    };
  }

  const { db, ctx } = await withOrg();
  const { data: project } = await db
    .table("projects")
    .select("id, name")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { error: "That project is not in this workspace." };

  if (input.contractId) {
    const { data: contract } = await db
      .table("contracts")
      .select("id, project_id")
      .eq("id", input.contractId)
      .maybeSingle();
    if (!contract) return { error: "That contract is not in this workspace." };
    // Money on this project may only sit against this project's contracts.
    if ((contract as unknown as { project_id: string | null }).project_id !== input.projectId) {
      return { error: "That contract belongs to a different project." };
    }
  }

  const { data, error } = await db.table("payments").insert({
    project_id: input.projectId,
    project_label: (project as unknown as { name: string }).name,
    contract_id: input.contractId ?? null,
    milestone_id: input.milestoneId ?? null,
    direction: directionFor(input.side),
    amount: input.amount,
    // The transaction date is what a person types; `created_at` records when
    // the row was written and is never typed.
    paid_on: input.paidOn || null,
    mode: input.mode || null,
    vendor_id: input.vendorId ?? null,
    member_id: input.memberId ?? ctx.memberId,
    expense_type: input.expenseType || null,
    category: input.category || null,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    stock_in_requested: !!input.stockInRequested,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

/**
 * Reverse an entry.
 *
 * ⛔ THERE IS NO DELETE HERE, AND THERE MUST NEVER BE ONE (HARD RULE 4). The
 * money moved; the correction is a new row with the opposite sign pointing back
 * at the original. `105403` shows exactly this — reversed transactions sit
 * behind a checkbox, not behind a bin icon.
 */
export async function reverseLedgerEntry(
  id: string,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { data: row } = await db.table("payments").select("*").eq("id", id).maybeSingle();
  if (!row) return { error: "That entry is not in this workspace." };

  const entry = row as unknown as LedgerEntry;
  if (entry.reversal_of) {
    return { error: "That row is itself a reversal — reversing it would be a loop." };
  }

  const { data: already } = await db
    .table("payments")
    .select("id")
    .eq("reversal_of", id)
    .limit(1);
  if (((already ?? []) as unknown[]).length > 0) {
    return { error: "That entry has already been reversed." };
  }

  const { error } = await db.table("payments").insert({
    ...reversalOf(entry),
    project_label: entry.project_label ?? null,
    mode: entry.mode ?? null,
    member_id: entry.member_id ?? ctx.memberId,
    paid_on: new Date().toISOString().slice(0, 10),
    created_by: ctx.userId,
  });
  return error ? { error: error.message } : {};
}
