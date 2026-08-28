import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProjectWorkspace } from "@/lib/data/projects";
import { Card } from "@/components/ui/primitives";
import { StageControl } from "./stage-control";
import { AddNoteForm } from "./note-form";
import { ProjectWorkspace } from "./project-workspace";

/**
 * One project, two tabs (PLAN-V4 §8.2, frames `104529` / `104705`).
 *
 * Everything is fetched here on the server through withOrg() and joined on
 * `project_id` — which only became possible with migration 0028. The stage
 * control and the note form stay as they were: both work, and neither is what
 * the owner asked to change.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getProjectWorkspace(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to projects
      </Link>

      <ProjectWorkspace data={data} />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Stage</h2>
          <StageControl projectId={data.project.id} current={data.project.stage} />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
            Add an update
          </h2>
          <AddNoteForm projectId={data.project.id} />
        </Card>
      </div>
    </div>
  );
}
