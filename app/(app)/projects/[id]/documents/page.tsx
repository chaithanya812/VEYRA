import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { getProjectFiles } from "@/lib/data/project-files";
import { PageHeader } from "@/components/ui/primitives";
import { DocumentsView } from "./documents-view";

/**
 * Designs & Documents (PLAN-V4 §9.1, frames `104742` / `104841`).
 *
 * Scoped to one project by construction: the folders, the files and the
 * storage prefix all key off this project's id, so nothing here can reach
 * another project's documents.
 */
export default async function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, data] = await Promise.all([getProject(id), getProjectFiles(id)]);
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
        title="Designs & documents"
        subtitle={`${result.project.name} · folders and files for this project only`}
      />

      <DocumentsView projectId={id} data={data} />
    </div>
  );
}
