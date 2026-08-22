import { Wallet } from "lucide-react";
import { getSubscription, usageSummary, isReadOnly } from "@/lib/data/subscription";
import { statusTone, statusLabel, metricLabel } from "@/lib/subscription-ui";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { inr, fmtDate } from "@/lib/utils";

export default async function BillingPage() {
  const [sub, usage, readOnly] = await Promise.all([
    getSubscription(),
    usageSummary(),
    isReadOnly(),
  ]);

  const plan = sub.plan;
  const status = sub.subscription?.status ?? "trialing";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Billing"
        subtitle="Plans, free-trial limits and lifetime usage"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-medium text-[var(--color-ink-secondary)]">
            Current plan
          </h2>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xl font-semibold text-[var(--color-ink)]">
              {plan ? plan.name : "No plan"}
            </span>
            <StatusChip tone={statusTone[status]} label={statusLabel[status]} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--color-ink-secondary)]">Plan price</dt>
              <dd className="tabular text-[var(--color-ink)]">
                {plan ? (plan.price_inr > 0 ? inr(plan.price_inr) : "Free") : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-ink-secondary)]">Trial ends</dt>
              <dd className="tabular text-[var(--color-ink)]">
                {sub.subscription?.trial_ends_at
                  ? fmtDate(sub.subscription.trial_ends_at)
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-ink-secondary)]">Renews / ends</dt>
              <dd className="tabular text-[var(--color-ink)]">
                {sub.subscription?.current_period_end
                  ? fmtDate(sub.subscription.current_period_end)
                  : "—"}
              </dd>
            </div>
          </dl>
          {readOnly && (
            <p className="mt-4 rounded-md border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-3 py-2 text-sm text-[var(--color-red-hover)]">
              Your plan has expired. Data is read-only and retained — upgrade to
              restore full access.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-medium text-[var(--color-ink-secondary)]">
            Metering model
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink)]">
            Limits are metered on <strong>lifetime usage</strong>, not on records
            currently stored. Editing, archiving or deleting a record never frees
            quota — the usage ledger is append-only and non-resettable.
          </p>
          <p className="mt-3 text-xs text-[var(--color-ink-secondary)]">
            At expiry, data becomes read-only and is never deleted (DPDP-safe).
          </p>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-medium text-[var(--color-ink)]">
            Usage this period
          </h2>
        </div>
        {usage.length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-8" />}
            title="No usage recorded yet"
            description="Metered actions will appear here as your team uses the product."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Metric</th>
                  <th className="px-4 py-3 font-medium text-right">Used</th>
                  <th className="px-4 py-3 font-medium text-right">Allowed</th>
                  <th className="px-4 py-3 font-medium text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr
                    key={row.metric}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                      {metricLabel[row.metric] ?? row.metric}
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {row.used}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-[var(--color-ink-secondary)]">
                      {row.limit == null ? "Unlimited" : row.limit}
                    </td>
                    <td
                      className={
                        "px-4 py-3 text-right tabular " +
                        (row.limit != null && row.remaining === 0
                          ? "text-[var(--color-amber)]"
                          : "text-[var(--color-ink)]")
                      }
                    >
                      {row.remaining == null ? "∞" : row.remaining}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
