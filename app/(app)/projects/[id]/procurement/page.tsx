import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { getProjectProcurement } from "@/lib/data/project-procurement";
import { PageHeader } from "@/components/ui/primitives";
import { procTabOf } from "@/lib/material-requests-model";
import { ProcurementView } from "./procurement-view";

/**
 * Project Procurement (PLAN-V4 §9.7, frames `105729` – `105927`).
 *
 * The same `material_requests` / `rfqs` / `purchase_orders` rows the
 * company-wide screens read, scoped by the real `project_id` — not a second
 * procurement model. The sub-tab is resolved on the SERVER from `?view=`.
 */
export default async function ProjectProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);

  const result = await getProject(id);
  if (!result) notFound();

  const data = await getProjectProcurement(id);
  const initialTab = procTabOf(view);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to project
      </Link>

      <PageHeader
        title="Procurement"
        subtitle={`${result.project.name} · requests, RFQs, orders and what has landed`}
      />

      <ProcurementView
        scope={{ kind: "project", projectId: id }}
        data={data}
        initialTab={initialTab}
      />
    </div>
  );
}
