import "server-only";
import { leadCounts } from "./leads";
import { projectPortfolio, listProjects } from "./projects";
import { financeSummary } from "./finance";
import { listPurchaseOrders } from "./purchase-orders";
import { listFollowUps } from "./pipeline";

/**
 * Dashboard data module — READ-ONLY cross-module overview. No new tables and
 * no direct table access: getDashboard() composes the existing modules
 * (leadCounts, projectPortfolio, listProjects, financeSummary,
 * listPurchaseOrders, listFollowUps), each of which opens withOrg() itself, so
 * every figure is org-scoped by construction.
 *
 * HARD RULE 2 — no LLM numbers: everything returned is a SUM/COUNT of real
 * stored rows.
 */

export interface DashboardCash {
  inflow: number;
  outflow: number;
  pnl: number;
}

export interface DashboardData {
  /** Σ leads.value for the org (the hero metric). */
  pipelineValue: number;
  /** COUNT of lead rows. */
  leadsTotal: number;
  /** COUNT of projects whose stage is not yet `closed`. */
  activeProjects: number;
  /** COUNT of projects whose health is not `on_track` (module's own definition). */
  delayedProjects: number;
  /** COUNT of POs neither delivered nor cancelled (drafts included — still open). */
  openOrders: number;
  /** Σ payments by direction + P&L from financeSummary(). */
  cash: DashboardCash;
  /** COUNT of follow-ups in the overdue bucket. */
  overdueFollowUps: number;
}

export async function getDashboard(): Promise<DashboardData> {
  const [leadAgg, portfolio, cash, orders, overdue, projects] = await Promise.all([
    leadCounts(),
    projectPortfolio(),
    financeSummary(),
    listPurchaseOrders(),
    listFollowUps({ bucket: "overdue" }),
    listProjects(),
  ]);

  const openOrders = orders.filter(
    (po) => po.order_state !== "delivered" && po.order_state !== "cancelled",
  ).length;

  const activeProjects = projects.filter((p) => p.stage !== "closed").length;

  return {
    pipelineValue: leadAgg.pipelineValue,
    leadsTotal: leadAgg.total,
    activeProjects,
    delayedProjects: portfolio.delayed,
    openOrders,
    cash: { inflow: cash.inflow, outflow: cash.outflow, pnl: cash.pnl },
    overdueFollowUps: overdue.length,
  };
}
