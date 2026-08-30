import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { getProjectLedger } from "@/lib/data/finance";
import { PageHeader } from "@/components/ui/primitives";
import { PaymentsView } from "./payments-view";

/**
 * Project Payments (PLAN-V4 §9.4, frames `105403` / `105429` / `105444`).
 *
 * The ledger for one project: Expenses and Funds, each with a Listing and an
 * Analytics view. Reads the same `payments` rows as the company-wide finance
 * screens, scoped by the real `project_id`.
 */
export default async function ProjectPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const [{ id }, { side }] = await Promise.all([params, searchParams]);

  const result = await getProject(id);
  if (!result) notFound();

  const ledger = await getProjectLedger(id, Number(result.project.project_value) || 0);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to project
      </Link>

      <PageHeader
        title="Project payments"
        subtitle={`${result.project.name} · money in and money out`}
      />

      <PaymentsView projectId={id} ledger={ledger} initialSide={side ?? "expenses"} />
    </div>
  );
}
