import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { canAll } from "@/lib/data/permissions";
import { REPORTS } from "./reports-config";

/**
 * Reports index (FEATURE-REGISTER OPS-REP-001) — focused, read-only reports,
 * not a builder. Cards link into each report's table.
 *
 * A card is only rendered when the caller holds that report's capability.
 * Showing a card that leads to a refusal teaches people the app is broken; the
 * route guard behind it still refuses, because a hidden link is presentation
 * and never a control.
 */
export default async function ReportsPage() {
  const allowed = await canAll(REPORTS.map((r) => r.capability));
  const visible = REPORTS.filter((r) => allowed[r.capability]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reports"
        subtitle="Read-only views across leads, money, procurement and projects"
      />

      {visible.length === 0 ? (
        <EmptyState
          title="No reports available to you"
          description="Reports are granted one at a time. An admin can enable them in Settings → Roles & permissions."
        />
      ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.slug} href={`/reports/${r.slug}`} className="group">
              <Card className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:border-[var(--color-border-strong)]">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)]">
                    <Icon className="size-4" />
                  </span>
                  <ArrowRight className="size-4 text-[var(--color-ink-disabled)] transition-colors group-hover:text-[var(--color-ink)]" />
                </div>
                <div>
                  <p className="font-medium text-[var(--color-ink)]">
                    {r.title}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-secondary)]">
                    {r.cardDescription}
                  </p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
}
