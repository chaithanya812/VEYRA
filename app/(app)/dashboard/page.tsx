import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  FolderKanban,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import { getDashboard } from "@/lib/data/dashboard";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { inr, cn } from "@/lib/utils";

/**
 * Dashboard — read-only cross-module overview. Red is reserved for its closed
 * jobs only (DESIGN-DIRECTION §2): the ONE hero metric (pipeline value),
 * a negative cash P&L tile, and the true overdue alert chip. Every other tile
 * stays neutral; delayed projects are amber (warning, not alarm).
 */

export default async function DashboardPage() {
  const d = await getDashboard();

  const brandNew =
    d.leadsTotal === 0 && d.activeProjects === 0 && d.openOrders === 0;
  const needsAttention = d.overdueFollowUps > 0 || d.delayedProjects > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        subtitle="Cross-module overview — every figure is a live sum or count of your records"
      />

      {/* Hero metric — pipeline value (Σ leads.value). The one red number
          on this screen (DESIGN-DIRECTION §2.5). */}
      <Card className="mb-4 border-[color-mix(in_srgb,var(--color-red)_25%,white)] p-6">
        <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
          Pipeline Value
        </p>
        <p className="mt-1 text-3xl font-semibold tabular text-[var(--color-red)]">
          {inr(d.pipelineValue)}
        </p>
        <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
          Total value of {d.leadsTotal} lead{d.leadsTotal === 1 ? "" : "s"} in
          the CRM
        </p>
      </Card>

      {/* KPI tiles — neutral except Cash P&L: green when ≥0, red when <0
          (a negative position is a genuine alert, DESIGN-DIRECTION §2.4). */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Total Leads
          </p>
          <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
            {d.leadsTotal}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Active Projects
          </p>
          <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
            {d.activeProjects}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Open Orders
          </p>
          <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
            {d.openOrders}
          </p>
        </Card>
        <div
          className={cn(
            "rounded-[var(--radius-card)] border p-5",
            d.cash.pnl >= 0
              ? "border-[color-mix(in_srgb,var(--color-green)_25%,white)] bg-[var(--color-green-tint)]"
              : "border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)]",
          )}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)]">
            {d.cash.pnl >= 0 ? (
              <CircleCheck className="size-4 text-[var(--color-green)]" />
            ) : (
              <CircleAlert className="size-4 text-[var(--color-red)]" />
            )}
            Cash P&amp;L
          </p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular",
              d.cash.pnl >= 0
                ? "text-[var(--color-green)]"
                : "text-[var(--color-red)]",
            )}
          >
            {inr(d.cash.pnl)}
          </p>
        </div>
      </div>

      {/* Needs attention — overdue follow-ups (red: true alert) and delayed
          projects (amber: warning). Each row links to its module. */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-[var(--color-ink)]">
        Needs Attention
      </h2>

      {!needsAttention ? (
        <Card className="flex items-start gap-3 px-4 py-4">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-[var(--color-green)]" />
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)]">
              Nothing needs attention
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
              No overdue follow-ups and no delayed projects.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {d.overdueFollowUps > 0 && (
              <li
                className={cn(
                  "hover:bg-[var(--color-surface-sunken)]",
                  d.delayedProjects > 0 &&
                    "border-b border-[var(--color-border)]",
                )}
              >
                <Link
                  href="/followups?tab=overdue"
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                    <CalendarClock
                      className="size-4 shrink-0 text-[var(--color-red)]"
                      aria-hidden
                    />
                    Overdue follow-ups
                    <StatusChip tone="red" label={`${d.overdueFollowUps} overdue`} />
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-[var(--color-ink-secondary)]"
                    aria-hidden
                  />
                </Link>
              </li>
            )}
            {d.delayedProjects > 0 && (
              <li className="hover:bg-[var(--color-surface-sunken)]">
                <Link
                  href="/projects"
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                    <FolderKanban
                      className="size-4 shrink-0 text-[var(--color-amber)]"
                      aria-hidden
                    />
                    Delayed projects
                    <StatusChip
                      tone="amber"
                      label={`${d.delayedProjects} delayed`}
                    />
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-[var(--color-ink-secondary)]"
                    aria-hidden
                  />
                </Link>
              </li>
            )}
          </ul>
        </Card>
      )}

      {/* Brand-new org — designed empty state instead of a wall of zeros. */}
      {brandNew && (
        <div className="mt-8">
          <EmptyState
            icon={<LayoutDashboard className="size-8" />}
            title="Your dashboard is waiting for data"
            description="Add your first lead to start the pipeline — projects, orders and cash figures fill in as you work."
            action={
              <Link href="/leads/new">
                <Button variant="primary">
                  <Plus className="size-4" /> Add Lead
                </Button>
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
