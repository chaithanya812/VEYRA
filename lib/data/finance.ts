import "server-only";
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
  sumBy,
  type Contract,
  type ContractSource,
  type Milestone,
  type Payment,
  type PaymentDirection,
} from "@/lib/finance-model";

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
  const { error } = await db
    .table("milestones")
    .updateById(milestoneId, { work_done: done });
  return error ? { error: error.message } : {};
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
