import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import {
  getProjectPlan,
  listMilestoneTemplates,
} from "@/lib/data/project-milestones";
import { listTasks } from "@/lib/data/workspace";
import { PageHeader } from "@/components/ui/primitives";
import { PlanView } from "./plan-view";

/**
 * Project Planning (PLAN-V4 §9.2, frames `105010` / `105024`).
 *
 * Three tabs, as the frame has them: **Milestone** — the delivery schedule
 * banded by scope group, with planned against actual and the variance named;
 * **Gantt chart** — the same rows as bars on a real time axis; **Tasks** — the
 * jobs underneath, which are the workspace's own `tasks` filtered to this
 * project rather than a second, private task table.
 *
 * This screen is what makes the Milestones cell on the projects list, the
 * Summary band and the Progress Report writable rather than read-only.
 */
export default async function ProjectPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const [result, plan, templates, tasks] = await Promise.all([
    getProject(id),
    getProjectPlan(id),
    listMilestoneTemplates(),
    listTasks({ projectId: id }),
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
        projectName={result.project.name}
        projectStart={result.project.start_date}
        projectHandover={result.project.handover_date}
        milestones={plan.milestones}
        scopeItems={plan.scopeItems}
        members={plan.members}
        templates={templates}
        deps={plan.deps}
        tasks={tasks}
        initialTab={tab ?? "milestone"}
      />
    </div>
  );
}
