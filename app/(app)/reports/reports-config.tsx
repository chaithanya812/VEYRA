import type { ReactNode } from "react";
import {
  Boxes,
  CircleAlert,
  Filter,
  FolderKanban,
  Hourglass,
  Percent,
  HardHat,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  clientSummary,
  gstSummary,
  labourSummary,
  projectProfitability,
  receivablesAgeing,
  salesFunnel,
  stockSummary,
  userActivity,
  vendorPerformance,
} from "@/lib/data/reports";
import { inr } from "@/lib/utils";

/**
 * The six reports (FEATURE-REGISTER OPS-REP-001) — metadata + a `run()` that
 * turns each data module's rows into generic table cells. Kept beside the
 * pages so the index cards and the dynamic [report] route share one source of
 * truth.
 *
 * Red is RESERVED (DESIGN-DIRECTION §2): only true alerts — the overdue
 * ageing bucket and negative project P&L — may use it here.
 */

export interface ReportCell {
  node: ReactNode;
  right?: boolean;
  /** True alert → red text. Reserved for overdue/negative, never decoration. */
  alert?: boolean;
}

export interface RenderedReport {
  head: string[];
  rows: ReportCell[][];
  /** Raw string grid for CSV export (numbers unformatted for spreadsheets). */
  csv: string[][];
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
}

export interface ReportDef {
  slug: string;
  title: string;
  subtitle: string;
  cardDescription: string;
  icon: LucideIcon;
  /**
   * The capability that opens this report (Part 3 Unit 5).
   *
   * The permission matrix names SIX report groups — Payment, Client, User,
   * Labour, Lead, Financial — and each now resolves to a real report. A report
   * a permission names and the product does not have is the same broken
   * promise as a permission nothing enforces, pointing the other way.
   *
   * Two reports predate that taxonomy and do not belong to any of the six:
   * Vendor Performance and Stock Summary. Rather than force them into a group
   * they are not, each is gated on the capability that owns the DATA it reads
   * — if you may not view vendors, you may not read a vendor report. That is
   * the safer rule anyway: a report is a read, and it should need whatever
   * reading that module needs.
   */
  capability: string;
  run(): Promise<RenderedReport>;
}

const num = (v: number): number => Number(v) || 0;

const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const FUNNEL_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export const REPORTS: ReportDef[] = [
  {
    slug: "sales-funnel",
    capability: "reports.lead.view",
    title: "Sales Funnel",
    subtitle: "Leads grouped by pipeline status — count and total value",
    cardDescription:
      "How leads spread across the pipeline stages, with the value sitting in each.",
    icon: Filter,
    async run() {
      const rows = await salesFunnel();
      return {
        head: ["Status", "Leads", "Value"],
        rows: rows.map((r) => [
          { node: FUNNEL_LABELS[r.status] ?? r.status },
          { node: r.count.toLocaleString("en-IN"), right: true },
          { node: inr(r.value), right: true },
        ]),
        csv: rows.map((r) => [
          FUNNEL_LABELS[r.status] ?? r.status,
          String(r.count),
          String(num(r.value)),
        ]),
        isEmpty: rows.every((r) => r.count === 0),
        emptyTitle: "No leads yet",
        emptyDescription:
          "The funnel fills in as leads are created and move through the pipeline.",
      };
    },
  },
  {
    slug: "receivables-ageing",
    capability: "reports.payment.view",
    title: "Receivables Ageing",
    subtitle:
      "Outstanding client receivables — current vs past-due milestones",
    cardDescription:
      "Money still to collect from client contracts, split into current and overdue.",
    icon: Hourglass,
    async run() {
      const rows = await receivablesAgeing();
      const byBucket = new Map(rows.map((r) => [r.bucket, num(r.amount)]));
      const current = byBucket.get("current") ?? 0;
      const overdue = byBucket.get("overdue") ?? 0;
      return {
        head: ["Bucket", "Amount"],
        rows: [
          [
            { node: "Current (not yet due)" },
            { node: inr(current), right: true },
          ],
          [
            {
              node: (
                <span className="inline-flex items-center gap-1.5">
                  <CircleAlert className="size-3.5" />
                  Overdue
                </span>
              ),
            },
            { node: inr(overdue), right: true, alert: true },
          ],
        ],
        csv: [
          ["Current (not yet due)", String(current)],
          ["Overdue", String(overdue)],
        ],
        isEmpty: current === 0 && overdue === 0,
        emptyTitle: "Nothing outstanding",
        emptyDescription:
          "Client contracts with billing milestones will show their outstanding amount here.",
      };
    },
  },
  {
    slug: "vendor-performance",
    capability: "vendors.vendor.view",
    title: "Vendor Performance",
    subtitle: "Purchase orders grouped by vendor — count and total spend",
    cardDescription:
      "Which vendors carry your purchase volume, ranked by total order value.",
    icon: Truck,
    async run() {
      const rows = await vendorPerformance();
      return {
        head: ["Vendor", "Orders", "Order Value"],
        rows: rows.map((r) => [
          { node: r.vendorName },
          { node: r.orders.toLocaleString("en-IN"), right: true },
          { node: inr(r.amount), right: true },
        ]),
        csv: rows.map((r) => [
          r.vendorName,
          String(r.orders),
          String(num(r.amount)),
        ]),
        isEmpty: rows.length === 0,
        emptyTitle: "No purchase orders yet",
        emptyDescription:
          "Raise a purchase order against a vendor and their spend will rank here.",
      };
    },
  },
  {
    slug: "stock-summary",
    capability: "inventory.warehouse.view",
    title: "Stock Summary",
    subtitle: "Current quantity per item across warehouses",
    cardDescription:
      "The ledger projection — net quantity on hand for every item and warehouse.",
    icon: Boxes,
    async run() {
      const rows = await stockSummary();
      return {
        head: ["Item", "Warehouse", "Qty"],
        rows: rows.map((r) => [
          { node: r.item_name },
          { node: r.warehouse },
          {
            node: qtyFmt.format(num(r.qty)),
            right: true,
            alert: num(r.qty) < 0,
          },
        ]),
        csv: rows.map((r) => [
          r.item_name,
          r.warehouse,
          String(num(r.qty)),
        ]),
        isEmpty: rows.length === 0,
        emptyTitle: "No stock movements yet",
        emptyDescription:
          "Record a stock-in against a warehouse and quantities will project here.",
      };
    },
  },
  {
    slug: "gst-summary",
    capability: "reports.financial.view",
    title: "GST Summary",
    subtitle:
      "Rate-wise taxable value and tax across live quotation lines",
    cardDescription:
      "GST exposure per slab from quotation lines (rejected/expired/lost quotes excluded).",
    icon: Percent,
    async run() {
      const rows = await gstSummary();
      return {
        head: ["GST Rate", "Taxable Value", "Tax"],
        rows: rows.map((r) => [
          { node: `${qtyFmt.format(num(r.rate))}%` },
          { node: inr(r.taxable), right: true },
          { node: inr(r.tax), right: true },
        ]),
        csv: rows.map((r) => [
          `${num(r.rate)}%`,
          String(num(r.taxable)),
          String(num(r.tax)),
        ]),
        isEmpty: rows.length === 0,
        emptyTitle: "No quotation lines yet",
        emptyDescription:
          "Add priced lines to a quotation and their tax will roll up here rate-wise.",
      };
    },
  },
  {
    slug: "project-profitability",
    capability: "reports.financial.view",
    title: "Project Profitability",
    subtitle: "Project value next to cash P&L booked under the same label",
    cardDescription:
      "Each project's configured value versus inflow minus outflow on its label.",
    icon: FolderKanban,
    async run() {
      const rows = await projectProfitability();
      return {
        head: ["Project", "Value", "P&L"],
        rows: rows.map((r) => [
          { node: r.project },
          { node: inr(r.value), right: true },
          { node: inr(r.pnl), right: true, alert: num(r.pnl) < 0 },
        ]),
        csv: rows.map((r) => [
          r.project,
          String(num(r.value)),
          String(num(r.pnl)),
        ]),
        isEmpty: rows.length === 0,
        emptyTitle: "No projects yet",
        emptyDescription:
          "Create a project (and tag payments with its label) to see profitability.",
      };
    },
  },
  {
    slug: "client-summary",
    capability: "reports.client.view",
    title: "Client Summary",
    subtitle: "Money by client — sold, received, and still outstanding",
    cardDescription:
      "Every client's projects, what the work was sold for, and what is still to come in.",
    icon: Users,
    async run() {
      const rows = await clientSummary();
      return {
        head: ["Client", "Projects", "Value", "Received", "Outstanding"],
        rows: rows.map((r) => [
          { node: r.client },
          { node: r.projects.toLocaleString("en-IN"), right: true },
          { node: inr(r.value), right: true },
          { node: inr(r.received), right: true },
          // Outstanding is only an ALERT when the client owes money. A negative
          // figure means they have paid ahead, which is not a problem.
          { node: inr(r.outstanding), right: true, alert: r.outstanding > 0 },
        ]),
        csv: rows.map((r) => [
          r.client,
          String(r.projects),
          String(num(r.value)),
          String(num(r.received)),
          String(num(r.outstanding)),
        ]),
        isEmpty: rows.length === 0,
        emptyTitle: "No clients yet",
        emptyDescription:
          "Clients appear here once a project carries a client name.",
      };
    },
  },
  {
    slug: "user-activity",
    capability: "reports.user.view",
    title: "User Activity",
    subtitle: "Hours, leave and tasks per person — closed sessions only",
    cardDescription:
      "What each person logged: hours from closed sessions, approved leave, and their task load.",
    icon: UserRound,
    async run() {
      const rows = await userActivity();
      return {
        head: ["Member", "Role", "Hours", "Sessions", "Open", "Leave days", "Tasks open", "Tasks done"],
        rows: rows.map((r) => [
          { node: r.member },
          { node: r.role },
          { node: qtyFmt.format(r.hours), right: true },
          // Hours never travel without the sessions they came from (§11).
          { node: r.sessions.toLocaleString("en-IN"), right: true },
          // An open session is not an alert — it means somebody is at work.
          { node: r.openSessions.toLocaleString("en-IN"), right: true },
          { node: qtyFmt.format(r.leaveDays), right: true },
          { node: r.tasksOpen.toLocaleString("en-IN"), right: true },
          { node: r.tasksDone.toLocaleString("en-IN"), right: true },
        ]),
        csv: rows.map((r) => [
          r.member,
          r.role,
          String(r.hours),
          String(r.sessions),
          String(r.openSessions),
          String(r.leaveDays),
          String(r.tasksOpen),
          String(r.tasksDone),
        ]),
        isEmpty: rows.length === 0,
        emptyTitle: "No members yet",
        emptyDescription: "Activity appears here as people check in and take on work.",
      };
    },
  },
  {
    slug: "labour-summary",
    capability: "reports.labour.view",
    title: "Labour Summary",
    subtitle: "Headcount-days per project, split by trade",
    cardDescription:
      "Skilled, unskilled and coordinator days on each project, with the span they cover.",
    icon: HardHat,
    async run() {
      const rows = await labourSummary();
      return {
        head: ["Project", "Days", "Skilled", "Unskilled", "Coordinator", "Total", "From", "To"],
        rows: rows.map((r) => [
          { node: r.project },
          { node: r.days.toLocaleString("en-IN"), right: true },
          { node: qtyFmt.format(r.skilled), right: true },
          { node: qtyFmt.format(r.unskilled), right: true },
          { node: qtyFmt.format(r.coordinator), right: true },
          { node: qtyFmt.format(r.total), right: true },
          // Formatted from the STRING — never through a Date, which shifts a
          // DATE column back a day in IST (§11).
          { node: r.firstDay ?? "—" },
          { node: r.lastDay ?? "—" },
        ]),
        csv: rows.map((r) => [
          r.project,
          String(r.days),
          String(r.skilled),
          String(r.unskilled),
          String(r.coordinator),
          String(r.total),
          r.firstDay ?? "",
          r.lastDay ?? "",
        ]),
        isEmpty: rows.length === 0,
        emptyTitle: "No labour recorded",
        emptyDescription:
          "Labour days appear here once a project records attendance on site.",
      };
    },
  },
];

export function findReport(slug: string): ReportDef | undefined {
  return REPORTS.find((r) => r.slug === slug);
}
