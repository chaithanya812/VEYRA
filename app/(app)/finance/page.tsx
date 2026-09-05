import Link from "next/link";
import { CircleAlert, CircleCheck, Landmark, Plus } from "lucide-react";
import {
  listContracts,
  milestoneCounts,
  financeSummary,
  SOURCE_LABELS,
} from "@/lib/data/finance";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, EmptyState } from "@/components/ui/primitives";
import { inr, fmtDate, cn } from "@/lib/utils";

export default async function FinancePage() {
  const [contracts, counts, summary] = await Promise.all([
    listContracts(),
    milestoneCounts(),
    financeSummary(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Finance"
        subtitle="Contracts, milestone billing and cash — inflow vs outflow"
        actions={
          <Button asChild variant="primary">
            <Link href="/finance/new">
              <Plus className="size-4" /> New Contract
            </Link>
          </Button>
        }
      />

      {/* Cash tiles — SUMs of stored values only (HARD RULE 4). Inflow green
          (received), outflow amber, and P&L is the hero metric: red only when
          negative, per DESIGN-DIRECTION §5 / design rule 5. */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Contract Value
          </p>
          <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
            {inr(summary.contractValue)}
          </p>
        </Card>
        <Card className="p-5 border-[color-mix(in_srgb,var(--color-green)_25%,white)] bg-[var(--color-green-tint)]">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Inflow Received
          </p>
          <p className="mt-1 text-xl font-semibold tabular text-[var(--color-green)]">
            {inr(summary.inflow)}
          </p>
        </Card>
        <Card className="p-5 border-[color-mix(in_srgb,var(--color-amber)_30%,white)] bg-[var(--color-amber-tint)]">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Outflow Paid
          </p>
          <p className="mt-1 text-xl font-semibold tabular text-[var(--color-amber)]">
            {inr(summary.outflow)}
          </p>
        </Card>
        <div
          className={cn(
            "rounded-[var(--radius-card)] border p-5",
            summary.pnl >= 0
              ? "border-[color-mix(in_srgb,var(--color-green)_25%,white)] bg-[var(--color-green-tint)]"
              : "border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)]",
          )}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)]">
            {summary.pnl >= 0 ? (
              <CircleCheck className="size-4 text-[var(--color-green)]" />
            ) : (
              <CircleAlert className="size-4 text-[var(--color-red)]" />
            )}
            P&amp;L
          </p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular",
              summary.pnl >= 0
                ? "text-[var(--color-green)]"
                : "text-[var(--color-red)]",
            )}
          >
            {inr(summary.pnl)}
          </p>
        </div>
      </div>

      {/* Contracts list */}
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Contracts
      </h2>

      {contracts.length === 0 ? (
        <EmptyState
          icon={<Landmark className="size-8" />}
          title="No contracts yet"
          description="Create a client or vendor contract with its billing milestones to start tracking cash."
          action={
            <Button asChild variant="primary">
              <Link href="/finance/new">
                <Plus className="size-4" /> New Contract
              </Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Milestones
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/finance/${c.id}`}
                        className="font-medium text-[var(--color-ink)] hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {c.project_label ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {SOURCE_LABELS[c.source] ?? c.source}
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {inr(Number(c.amount))}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-[var(--color-ink-secondary)]">
                      {counts[c.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-[var(--color-ink-secondary)] tabular">
                      {fmtDate(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
