import type { ReactNode } from "react";
import {
  Boxes,
  CircleAlert,
  Filter,
  FolderKanban,
  Hourglass,
  Percent,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  gstSummary,
  projectProfitability,
  receivablesAgeing,
  salesFunnel,
  stockSummary,
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
];

export function findReport(slug: string): ReportDef | undefined {
  return REPORTS.find((r) => r.slug === slug);
}
