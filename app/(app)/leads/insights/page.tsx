import { Suspense } from "react";
import { getLeadInsightsData } from "@/lib/data/lead-management";
import { PageHeader } from "@/components/ui/primitives";
import { LeadInsightsView } from "./insights-view";

/**
 * Lead Insights — PLAN-V4 §5.2, frame `103904`.
 *
 * The read happens once here through withOrg(); every card's maths is a pure
 * function in lib/lead-insights-model.ts, so switching the range or the
 * measure recomputes in the browser instead of round-tripping.
 */
export default function LeadInsightsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Lead Insights"
        subtitle="Where leads come from, how far they get, and who is carrying them."
      />
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsBody />
      </Suspense>
    </div>
  );
}

async function InsightsBody() {
  const data = await getLeadInsightsData();
  return <LeadInsightsView data={data} />;
}

function InsightsSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true">
      <span className="sr-only">Loading insights…</span>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="h-3.5 w-40 rounded bg-[var(--color-border)]" />
            <div className="mt-4 h-40 rounded bg-[var(--color-surface-sunken)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
