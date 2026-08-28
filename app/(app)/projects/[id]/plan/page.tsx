import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import {
  getProjectPlan,
  listMilestoneTemplates,
} from "@/lib/data/project-milestones";
import { PageHeader } from "@/components/ui/primitives";
import { PlanView } from "./plan-view";

/**
 * Project Planning → Milestone (PLAN-V4 §9.2, frames `105010` / `105024`).
 *
 * This screen is what makes the Milestones cell, the Summary band and the
 * Progress Report writable rather than read-only — until it existed, a plan
 * could only be created with SQL.
 *
 * Gantt Chart and Tasks are the other two tabs in `105010`; they are not built
 * yet, and the tab row will grow when they are.
 */
export default async function ProjectPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, plan, templates] = await Promise.all([
    getProject(id),
    getProjectPlan(id),
    listMilestoneTemplates(),
  ]);
  if (!result) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to project
      </Link>

      <PageHeader
        title="Project planning"
        subtitle={`${result.project.name} · milestones grouped by scope`}
      />

      <PlanView
        projectId={id}
        projectStart={result.project.start_date}
        milestones={plan.milestones}
        scopeItems={plan.scopeItems}
        members={plan.members}
        templates={templates}
      />
    </div>
  );
}
