import "server-only";
import { withOrg } from "./with-org";
import { listWarehouses, stockLevels } from "./inventory";
import { vendorNames } from "./purchase-orders";
import { LEAD_STATUSES } from "@/lib/leads-model";

/**
 * Reports data module (FEATURE-REGISTER OPS-REP-001 · PLAN §6.10) — six
 * focused, read-only reports that aggregate ACROSS the existing modules.
 *
 * Follows the reference pattern exactly: no table is ever touched directly —
 * everything goes through withOrg() (or calls an existing module's functions,
 * which do the same), so org_id isolation holds by construction and no raw
 * admin client is ever imported here.
 *
 * Every number below is a pure COUNT or SUM of stored values (HARD RULE 2 /
 * PLAN §8) — no LLM ever produces a figure. Number() guards against PostgREST
 * returning numerics as strings, mirroring the other data modules.
 */

export interface SalesFunnelRow {
  status: string;
  count: number;
  value: number;
}

export interface AgeingRow {
  bucket: string;
  amount: number;
}

export interface VendorPerformanceRow {
  vendorId: string;
  vendorName: string;
  orders: number;
  amount: number;
}

export interface StockSummaryRow {
  item_name: string;
  warehouse: string;
  qty: number;
}

export interface GstSummaryRow {
  rate: number;
  taxable: number;
  tax: number;
}

export interface ProjectProfitabilityRow {
  project: string;
  value: number;
  pnl: number;
}

const num = (v: unknown): number => Number(v) || 0;

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Local calendar day as YYYY-MM-DD — safe lexicographic date comparison. */
function todayISO(): string {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Leads grouped by pipeline status with count + Σ value. One row per
 * canonical status in funnel order (zeros included so the funnel shape
 * reads at a glance); any non-canonical status still surfaces at the end.
 */
export async function salesFunnel(): Promise<SalesFunnelRow[]> {
  const { db } = await withOrg();
  const { data, error } = await db.table("leads").select("status, value");
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    status: string;
    value: number | string | null;
  }[];

  const groups = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    const g = groups.get(r.status) ?? { count: 0, value: 0 };
    g.count += 1;
    g.value += num(r.value);
    groups.set(r.status, g);
  }

  const out: SalesFunnelRow[] = LEAD_STATUSES.map((s) => ({
    status: s,
    count: groups.get(s)?.count ?? 0,
    value: round2(groups.get(s)?.value ?? 0),
  }));
  for (const [status, g] of groups) {
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
      out.push({ status, count: g.count, value: round2(g.value) });
    }
  }
  return out;
}

/**
 * Receivables ageing — outstanding = Σ client-contract amounts − Σ inflow,
 * split into a pragmatic CURRENT vs OVERDUE pair of buckets: a milestone
 * counts as overdue when its tentative_due has passed AND work isn't done
 * (same rule as the finance module); the overdue bucket is clamped so it can
 * never exceed the actual outstanding amount. Pure SUMs throughout.
 */
export async function receivablesAgeing(): Promise<AgeingRow[]> {
  const { db } = await withOrg();

  const [contractsRes, paymentsRes, milestonesRes] = await Promise.all([
    db.table("contracts").select("id, amount, source"),
    db.table("payments").select("direction, amount"),
    db.table("milestones").select("contract_id, amount, tentative_due, work_done"),
  ]);
  if (contractsRes.error) throw contractsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (milestonesRes.error) throw milestonesRes.error;

  const contractRows = (contractsRes.data ?? []) as unknown as {
    id: string;
    amount: number | string | null;
    source: string;
  }[];
  const paymentRows = (paymentsRes.data ?? []) as unknown as {
    direction: string;
    amount: number | string | null;
  }[];
  const milestoneRows = (milestonesRes.data ?? []) as unknown as {
    contract_id: string;
    amount: number | string | null;
    tentative_due: string | null;
    work_done: boolean;
  }[];

  const clientIds = new Set(
    contractRows.filter((c) => c.source === "client").map((c) => c.id),
  );
  const contractTotal = contractRows
    .filter((c) => c.source === "client")
    .reduce((s, c) => s + num(c.amount), 0);
  const inflow = paymentRows
    .filter((p) => p.direction === "inflow")
    .reduce((s, p) => s + num(p.amount), 0);

  const outstanding = Math.max(contractTotal - inflow, 0);
  const today = todayISO();
  const overdueMilestones = milestoneRows
    .filter(
      (m) =>
        clientIds.has(m.contract_id) &&
        !!m.tentative_due &&
        !m.work_done &&
        m.tentative_due.slice(0, 10) < today,
    )
    .reduce((s, m) => s + num(m.amount), 0);

  const overdue = Math.min(overdueMilestones, outstanding);
  const current = Math.max(outstanding - overdue, 0);

  return [
    { bucket: "current", amount: round2(current) },
    { bucket: "overdue", amount: round2(overdue) },
  ];
}

/**
 * Purchase spend grouped by vendor — COUNT of orders + Σ amount per vendor,
 * cancelled POs excluded (no money moved on them). Vendor names are joined
 * through the org-scoped vendors table via the procurement module's helper.
 * Sorted by spend, highest first.
 */
export async function vendorPerformance(): Promise<VendorPerformanceRow[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("purchase_orders")
    .select("vendor_id, amount, order_state");
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    vendor_id: string;
    amount: number | string | null;
    order_state: string;
  }[];

  const groups = new Map<string, { orders: number; amount: number }>();
  for (const r of rows) {
    if (!r.vendor_id || r.order_state === "cancelled") continue;
    const g = groups.get(r.vendor_id) ?? { orders: 0, amount: 0 };
    g.orders += 1;
    g.amount += num(r.amount);
    groups.set(r.vendor_id, g);
  }

  const names = await vendorNames([...groups.keys()]);
  return [...groups.entries()]
    .map(([vendorId, g]) => ({
      vendorId,
      vendorName: names[vendorId] ?? vendorId,
      orders: g.orders,
      amount: round2(g.amount),
    }))
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        b.orders - a.orders ||
        a.vendorName.localeCompare(b.vendorName),
    );
}

/**
 * Current stock by item × warehouse — a thin reshaping of the inventory
 * module's ledger projection (stockLevels()), with warehouse ids resolved to
 * names through the org-scoped warehouses read. Negative totals surface as-is:
 * they are a true alert the UI may flag.
 */
export async function stockSummary(): Promise<StockSummaryRow[]> {
  const [levels, warehouses] = await Promise.all([
    stockLevels(),
    listWarehouses(),
  ]);
  const nameById = new Map(warehouses.map((w) => [w.id, w.name]));
  return levels.map((l) => ({
    item_name: l.item_name,
    warehouse: nameById.get(l.warehouse_id) ?? l.warehouse_id,
    qty: l.qty,
  }));
}

/**
 * GST summary rolled up RATE-WISE from stored quotation-line snapshots
 * (taxable / tax_amount written by the pricing engine — never recomputed
 * here). Best-effort scope note: this spans every quotation line of the org
 * whose quotation is still live (rejected / expired / lost quotes excluded);
 * draft and superseded versions are included because they carry real tax
 * figures the business may still bill against.
 */
export async function gstSummary(): Promise<GstSummaryRow[]> {
  const { db } = await withOrg();
  const [quotesRes, linesRes] = await Promise.all([
    db.table("quotations").select("id, status"),
    db
      .table("quotation_lines")
      .select("quotation_id, tax_rate, taxable, tax_amount"),
  ]);
  if (quotesRes.error) throw quotesRes.error;
  if (linesRes.error) throw linesRes.error;

  const deadStatuses = new Set(["rejected", "expired", "lost"]);
  const liveQuoteIds = new Set(
    ((quotesRes.data ?? []) as unknown as { id: string; status: string }[])
      .filter((q) => !deadStatuses.has(q.status))
      .map((q) => q.id),
  );

  const groups = new Map<number, { taxable: number; tax: number }>();
  for (const l of (linesRes.data ?? []) as unknown as {
    quotation_id: string;
    tax_rate: number | string | null;
    taxable: number | string | null;
    tax_amount: number | string | null;
  }[]) {
    if (!liveQuoteIds.has(l.quotation_id)) continue;
    const rate = num(l.tax_rate);
    const g = groups.get(rate) ?? { taxable: 0, tax: 0 };
    g.taxable += num(l.taxable);
    g.tax += num(l.tax_amount);
    groups.set(rate, g);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({ rate, taxable: round2(v.taxable), tax: round2(v.tax) }));
}

/**
 * Projects with their configured value next to the cash P&L booked under the
 * same project_label (Σ inflow − Σ outflow of matching payments — the same
 * definition financeSummary uses). Projects without matching payments show a
 * zero P&L rather than disappearing.
 */
export async function projectProfitability(): Promise<ProjectProfitabilityRow[]> {
  const { db } = await withOrg();
  const [projectsRes, paymentsRes] = await Promise.all([
    db.table("projects").select("name, project_value").order("created_at", { ascending: false }),
    db.table("payments").select("direction, amount, project_label"),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const cashByLabel = new Map<string, number>();
  for (const p of (paymentsRes.data ?? []) as unknown as {
    direction: string;
    amount: number | string | null;
    project_label: string | null;
  }[]) {
    if (!p.project_label) continue;
    const delta = p.direction === "inflow" ? num(p.amount) : -num(p.amount);
    cashByLabel.set(p.project_label, (cashByLabel.get(p.project_label) ?? 0) + delta);
  }

  return ((projectsRes.data ?? []) as unknown as {
    name: string;
    project_value: number | string | null;
  }[]).map((pr) => ({
    project: pr.name,
    value: round2(num(pr.project_value)),
    pnl: round2(cashByLabel.get(pr.name) ?? 0),
  }));
}
