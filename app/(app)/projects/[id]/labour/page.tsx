import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { getProjectLabour } from "@/lib/data/labour";
import { PageHeader } from "@/components/ui/primitives";
import { LabourView } from "./labour-view";

/**
 * Labour Report (PLAN-V4 §9.6, frames `105620` – `105716`).
 *
 * One project's daily headcount. The tab is resolved on the SERVER from
 * `?view=`, not in an effect — a deep link to the analytics must server-render
 * the analytics.
 */
export default async function ProjectLabourPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);

  const result = await getProject(id);
  if (!result) notFound();

  const board = await getProjectLabour(id);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to project
      </Link>

      <PageHeader
        title="Labour report"
        subtitle={`${result.project.name} · who was on site, by trade and vendor`}
      />

      <LabourView
        projectId={id}
        board={board}
        initialTab={view === "analytics" ? "analytics" : "overview"}
      />
    </div>
  );
}
