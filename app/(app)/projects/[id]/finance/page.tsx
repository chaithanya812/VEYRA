import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { getProjectFinancialPlan } from "@/lib/data/finance";
import { PageHeader } from "@/components/ui/primitives";
import { FinanceView } from "./finance-view";

/**
 * Financial Planning (PLAN-V4 §9.3, frames `105238` / `105325`).
 *
 * Inflow · Outflow · Documents, all reading the SAME `contracts` + `milestones`
 * rows the company-wide finance screens read, scoped by the real `project_id`
 * FK. That is deliberate: the percentage schedule planned here is the one
 * Account Receivables (§12.3) ages, so nothing is ever re-entered.
 */
export default async function ProjectFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);

  const result = await getProject(id);
  if (!result) notFound();

  const plan = await getProjectFinancialPlan(
    id,
    Number(result.project.project_value) || 0,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to project
      </Link>

      <PageHeader
        title="Financial planning"
        subtitle={`${result.project.name} · contracts, schedules and cash`}
      />

      <FinanceView projectId={id} plan={plan} initialTab={tab ?? "inflow"} />
    </div>
  );
}
