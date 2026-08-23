import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { REPORTS } from "./reports-config";

/**
 * Reports index (FEATURE-REGISTER OPS-REP-001) — six focused, read-only
 * reports, not a builder. Cards link into each report's table.
 */
export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reports"
        subtitle="Read-only views across leads, money, procurement and projects"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
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
    </div>
  );
}
