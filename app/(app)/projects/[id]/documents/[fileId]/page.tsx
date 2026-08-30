import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { getProjectFileDetail } from "@/lib/data/project-files";
import { FileViewer } from "./viewer";

/**
 * The file viewer (PLAN-V4 §9.1, frame `104841`) — the part of Designs &
 * Documents the owner detailed most: the drawing on one side, the review
 * conversation on the other.
 *
 * The route carries BOTH ids, and `getProjectFileDetail` refuses the pair when
 * they disagree. That is the point: without the check,
 * `/projects/<A>/documents/<file-belonging-to-B>` would render B's drawing
 * under A's breadcrumb, which is the precise leak this module exists to stop.
 * A mismatch is a 404, not an error page — from outside, a file that is not
 * this project's simply does not exist here.
 */
export default async function ProjectFilePage({
  params,
}: {
  params: Promise<{ id: string; fileId: string }>;
}) {
  const { id, fileId } = await params;
  const [result, detail] = await Promise.all([
    getProject(id),
    getProjectFileDetail(id, fileId),
  ]);
  if (!result || !detail) notFound();

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link
        href={`/projects/${id}/documents`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> {result.project.name} · documents
      </Link>

      <FileViewer projectId={id} detail={detail} />
    </div>
  );
}
