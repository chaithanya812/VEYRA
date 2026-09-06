import "server-only";
import { withOrg } from "./with-org";
import { listLeadStatuses } from "./lead-management";
import { listWarehouses, stockLevels } from "./inventory";
import { vendorNames } from "./purchase-orders";
import { sessionHours, type WorkSession } from "@/lib/workspace-model";
import { receivablesData } from "./receivables";
import {
  BUCKET_META,
  TILE_BUCKETS,
  receivableRows,
  summariseReceivables,
  type ReceivableBucket,
} from "@/lib/receivables-model";

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
  /** The bucket key from `RECEIVABLE_BUCKETS`, not a private vocabulary. */
  bucket: ReceivableBucket;
  label: string;
  note: string;
  count: number;
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

// `todayISO` lived here to age receivables by hand. That arithmetic now comes
// from `lib/receivables-model.ts` (which has its own `todayIso`), so the local
// copy is gone rather than left to rot into a second source of "today".

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

  // The ladder is tenant-configured (migration 0024), so the funnel follows the
  // tenant's own stage order rather than a hardcoded six. Any status a lead
  // still sits on but that has since been retired is appended, so no lead ever
  // silently vanishes from the funnel.
  const statuses = await listLeadStatuses();
  const known = new Set(statuses.map((s) => s.value));
  const out: SalesFunnelRow[] = statuses.map((s) => ({
    status: s.label,
    count: groups.get(s.value)?.count ?? 0,
    value: round2(groups.get(s.value)?.value ?? 0),
  }));
  for (const [status, g] of groups) {
    if (!known.has(status)) {
      out.push({ status, count: g.count, value: round2(g.value) });
    }
  }
  return out;
}

/**
 * Receivables ageing — the SAME buckets `/finance/receivables` shows, built
 * from the SAME model, because two screens answering one question must not
 * answer it differently.
 *
 * This previously computed its own pair of buckets and got both wrong:
 * `outstanding` was `contracted − received`, which books work nobody has done
 * yet as a receivable, and the bucket it labelled "Overdue" actually counted
 * milestones whose work is NOT signed off — money that is not yet invoiceable,
 * while the money genuinely late to collect was counted nowhere. The report
 * therefore read "₹0 overdue" against ₹7,00,000 six weeks past due.
 *
 * A receivable is `billed − received` (HANDOFF-V9 §7). `bucketOf` partitions
 * every client milestone into exactly one of Overdue Payment / Milestone
 * Overdue / Upcoming / Written Off, and this returns those four verbatim —
 * labels and all — so the report cannot drift from the screen again.
 */
export async function receivablesAgeing(): Promise<AgeingRow[]> {
  const data = await receivablesData();
  const rows = receivableRows({
    projects: data.projects,
    contracts: data.contracts,
    milestonesByContract: data.milestonesByContract,
    receipts: data.receipts,
  });
  const summary = summariseReceivables(rows, data.contracts);
  const byBucket = new Map(summary.tiles.map((t) => [t.bucket, t]));

  return TILE_BUCKETS.map((bucket) => {
    const tile = byBucket.get(bucket);
    return {
      bucket,
      label: BUCKET_META[bucket].label,
      note: BUCKET_META[bucket].note,
      count: tile?.count ?? 0,
      amount: round2(tile?.amount ?? 0),
    };
  });
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
 * Projects with their configured value next to the cash P&L booked against
 * them (Σ inflow − Σ outflow — the same definition financeSummary uses).
 * Projects with no payments show a zero P&L rather than disappearing.
 *
 * **This used to join `projects.name === payments.project_label`.** A string
 * equality produced the flagship per-project P&L: renaming a project silently
 * emptied it, and two projects sharing a name shared their money. Migration
 * 0028 gave `payments` a real `project_id`, and this reads it.
 *
 * The label is still honoured as a fallback, for payments recorded against a
 * project name that never resolved to a row (the backfill reports those in
 * `v_project_label_unmatched`). Money that was really spent should not vanish
 * from a report because nobody tidied a name.
 */
export async function projectProfitability(): Promise<ProjectProfitabilityRow[]> {
  const { db } = await withOrg();
  const [projectsRes, paymentsRes] = await Promise.all([
    db
      .table("projects")
      .select("id, name, project_value")
      .order("created_at", { ascending: false }),
    db.table("payments").select("direction, amount, project_id, project_label"),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const projects = (projectsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    project_value: number | string | null;
  }[];

  const byId = new Map<string, number>();
  const byLabel = new Map<string, number>();
  for (const p of (paymentsRes.data ?? []) as unknown as {
    direction: string;
    amount: number | string | null;
    project_id: string | null;
    project_label: string | null;
  }[]) {
    const delta = p.direction === "inflow" ? num(p.amount) : -num(p.amount);
    if (p.project_id) {
      byId.set(p.project_id, (byId.get(p.project_id) ?? 0) + delta);
    } else if (p.project_label) {
      const key = p.project_label.trim().toLowerCase();
      byLabel.set(key, (byLabel.get(key) ?? 0) + delta);
    }
  }

  return projects.map((pr) => ({
    project: pr.name,
    value: round2(num(pr.project_value)),
    pnl: round2(
      (byId.get(pr.id) ?? 0) + (byLabel.get(pr.name.trim().toLowerCase()) ?? 0),
    ),
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
 * The three reports the permission matrix NAMED but the product did not have.
 *
 * Part 3 Unit 5 shipped six Reports capabilities — Payment, Client, User,
 * Labour, Lead, Financial. Three of them pointed at nothing. A report a
 * permission names and the product does not have is the same broken promise as
 * a permission nothing enforces, just pointing the other way.
 *
 * Every figure here is a COUNT or a SUM of stored values, read through
 * withOrg(). Nothing is stored, nothing is inferred, and no ratio travels
 * without the two numbers it came from (§11).
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ClientSummaryRow {
  client: string;
  projects: number;
  /** Σ `projects.project_value` — what the work was sold for. */
  value: number;
  /** Σ inflow − Σ outflow attributed to those projects. */
  received: number;
  /** `value − received`. Travels with both parts, never alone. */
  outstanding: number;
}

/**
 * Money by CLIENT rather than by project — the view a partner asks for when
 * deciding who to chase and who to keep.
 *
 * Grouped on `projects.client_name`, trimmed and case-folded, because "Sharma
 * Residence" and "sharma residence" are one client to the person reading it.
 * A project with no client name is grouped under "(No client recorded)" rather
 * than dropped: a blank is a data-entry gap somebody should see, and silently
 * omitting it would make the totals disagree with the projects list.
 */
export async function clientSummary(): Promise<ClientSummaryRow[]> {
  const { db } = await withOrg();

  const [projectsRes, paymentsRes] = await Promise.all([
    db.table("projects").select("id, name, client_name, project_value"),
    db.table("payments").select("direction, amount, project_id, project_label"),
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const projects = (projectsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    client_name: string | null;
    project_value: number | string | null;
  }[];

  // Payments still reach a project either by FK or by the older text label,
  // exactly as projectProfitability() resolves them. Both paths are honoured
  // here so the two reports cannot disagree about the same rupee.
  const byId = new Map<string, number>();
  const byLabel = new Map<string, number>();
  for (const p of (paymentsRes.data ?? []) as unknown as {
    direction: string;
    amount: number | string | null;
    project_id: string | null;
    project_label: string | null;
  }[]) {
    const delta = p.direction === "inflow" ? num(p.amount) : -num(p.amount);
    if (p.project_id) byId.set(p.project_id, (byId.get(p.project_id) ?? 0) + delta);
    else if (p.project_label) {
      const key = p.project_label.trim().toLowerCase();
      byLabel.set(key, (byLabel.get(key) ?? 0) + delta);
    }
  }

  const NO_CLIENT = "(No client recorded)";
  const acc = new Map<string, ClientSummaryRow>();
  for (const pr of projects) {
    const label = pr.client_name?.trim() || NO_CLIENT;
    const key = label.toLowerCase();
    const row =
      acc.get(key) ??
      ({ client: label, projects: 0, value: 0, received: 0, outstanding: 0 } as ClientSummaryRow);
    row.projects += 1;
    row.value += num(pr.project_value);
    row.received +=
      (byId.get(pr.id) ?? 0) + (byLabel.get(pr.name.trim().toLowerCase()) ?? 0);
    acc.set(key, row);
  }

  return [...acc.values()]
    .map((r) => ({
      ...r,
      value: round2(r.value),
      received: round2(r.received),
      outstanding: round2(r.value - r.received),
    }))
    .sort((a, b) => b.value - a.value || a.client.localeCompare(b.client));
}

export interface UserActivityRow {
  member: string;
  role: string;
  /** Closed sessions only — an open one has not produced hours yet. */
  hours: number;
  /** Sessions counted, so `hours` is never a figure without its denominator. */
  sessions: number;
  openSessions: number;
  leaveDays: number;
  tasksOpen: number;
  tasksDone: number;
}

/**
 * What each person did — the report behind `reports.user.view`.
 *
 * HOURS COME FROM CLOSED SESSIONS ONLY, and the open count is reported beside
 * them rather than folded in. An open session has no check-out, so giving it
 * hours would mean inventing a finish time; `lib/workspace-model.ts` already
 * refuses to, and this must not quietly disagree with the attendance screen.
 *
 * Deactivated members are INCLUDED. They did the work, and a report that drops
 * them makes last quarter's totals change when somebody leaves.
 */
export async function userActivity(): Promise<UserActivityRow[]> {
  const { db } = await withOrg();

  const [membersRes, sessionsRes, leaveRes, tasksRes] = await Promise.all([
    db.table("org_members").select("id, role, display_name, status"),
    db.table("work_sessions").select("member_id, check_in, check_out"),
    db.table("leave_requests").select("member_id, days, status"),
    db.table("tasks").select("assignee_id, status"),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (leaveRes.error) throw leaveRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const members = (membersRes.data ?? []) as unknown as {
    id: string;
    role: string;
    display_name: string | null;
    status: string;
  }[];

  const acc = new Map<string, UserActivityRow>();
  for (const m of members) {
    acc.set(m.id, {
      member: m.display_name?.trim() || "Unnamed member",
      role: m.role,
      hours: 0,
      sessions: 0,
      openSessions: 0,
      leaveDays: 0,
      tasksOpen: 0,
      tasksDone: 0,
    });
  }

  for (const s of (sessionsRes.data ?? []) as unknown as {
    member_id: string | null;
    check_in: string | null;
    check_out: string | null;
  }[]) {
    const row = s.member_id ? acc.get(s.member_id) : undefined;
    if (!row) continue;
    if (!s.check_in || !s.check_out) {
      row.openSessions += 1;
      continue;
    }
    // `sessionHours` is the ONLY place a session becomes hours. Writing the
    // subtraction again here would be a second implementation free to drift
    // from the attendance screen, and two screens disagreeing about somebody's
    // hours is worse than either being wrong.
    row.hours += sessionHours({ check_in: s.check_in, check_out: s.check_out } as WorkSession);
    row.sessions += 1;
  }

  for (const l of (leaveRes.data ?? []) as unknown as {
    member_id: string | null;
    days: number | string | null;
    status: string;
  }[]) {
    // Only APPROVED leave is time actually taken. A pending request is a
    // question, not an absence.
    if (l.status !== "approved") continue;
    const row = l.member_id ? acc.get(l.member_id) : undefined;
    if (row) row.leaveDays += num(l.days);
  }

  for (const t of (tasksRes.data ?? []) as unknown as {
    assignee_id: string | null;
    status: string;
  }[]) {
    const row = t.assignee_id ? acc.get(t.assignee_id) : undefined;
    if (!row) continue;
    if (t.status === "done") row.tasksDone += 1;
    else row.tasksOpen += 1;
  }

  return [...acc.values()]
    .map((r) => ({ ...r, hours: round2(r.hours), leaveDays: round2(r.leaveDays) }))
    .sort((a, b) => b.hours - a.hours || a.member.localeCompare(b.member));
}

export interface LabourSummaryRow {
  project: string;
  days: number;
  skilled: number;
  unskilled: number;
  coordinator: number;
  total: number;
  firstDay: string | null;
  lastDay: string | null;
}

/**
 * Labour by project — the report behind `reports.labour.view`.
 *
 * `total` is `skilled + unskilled + coordinator`, computed here exactly as
 * `lib/labour-model.ts::totalOf` computes it, because `labour_entries` has NO
 * total column and must not grow one (§2 rule 6 — the invariant is
 * unrepresentable on purpose).
 *
 * Dates are compared as STRINGS and never through a `Date`: `entry_date` is a
 * DATE column, and putting it through a JS Date shifts it a day in IST — the
 * mistake §11 records against site photos.
 */
export async function labourSummary(): Promise<LabourSummaryRow[]> {
  const { db } = await withOrg();

  const [entriesRes, projectsRes] = await Promise.all([
    db
      .table("labour_entries")
      .select("project_id, entry_date, skilled, unskilled, coordinator"),
    db.table("projects").select("id, name"),
  ]);
  if (entriesRes.error) throw entriesRes.error;
  if (projectsRes.error) throw projectsRes.error;

  const names = new Map(
    ((projectsRes.data ?? []) as unknown as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );

  const acc = new Map<string, LabourSummaryRow>();
  for (const e of (entriesRes.data ?? []) as unknown as {
    project_id: string;
    entry_date: string;
    skilled: number | string | null;
    unskilled: number | string | null;
    coordinator: number | string | null;
  }[]) {
    const row =
      acc.get(e.project_id) ??
      ({
        project: names.get(e.project_id) ?? "(Unknown project)",
        days: 0,
        skilled: 0,
        unskilled: 0,
        coordinator: 0,
        total: 0,
        firstDay: null,
        lastDay: null,
      } as LabourSummaryRow);

    row.days += 1;
    row.skilled += num(e.skilled);
    row.unskilled += num(e.unskilled);
    row.coordinator += num(e.coordinator);
    if (e.entry_date) {
      if (!row.firstDay || e.entry_date < row.firstDay) row.firstDay = e.entry_date;
      if (!row.lastDay || e.entry_date > row.lastDay) row.lastDay = e.entry_date;
    }
    acc.set(e.project_id, row);
  }

  return [...acc.values()]
    .map((r) => ({ ...r, total: r.skilled + r.unskilled + r.coordinator }))
    .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project));
}
