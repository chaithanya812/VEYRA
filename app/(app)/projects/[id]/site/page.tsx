import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { getProjectSitePhotos } from "@/lib/data/site-photos";
import { PageHeader } from "@/components/ui/primitives";
import { sitePhotoTabOf } from "@/lib/site-photos-model";
import { SiteProgressView } from "./site-progress-view";

/**
 * Site Progress Uploads (PLAN-V4 §9.5, frame `105527`).
 *
 * Scoped to one project by construction: the rows key off this project's id and
 * the bytes sit under its own storage prefix, so nothing here can reach another
 * project's photos.
 *
 * The tab is resolved on the SERVER from `?view=`, not in an effect. A deep
 * link to `?view=client_visible` must server-render that tab — resolving it
 * after hydration renders the wrong one first and makes the page impossible to
 * verify by fetching its HTML.
 */
export default async function ProjectSiteProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);

  const result = await getProject(id);
  if (!result) notFound();

  const board = await getProjectSitePhotos(id);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to project
      </Link>

      <PageHeader
        title="Site progress"
        subtitle={`${result.project.name} · dated photos, and what the client can see`}
      />

      <SiteProgressView
        projectId={id}
        board={board}
        initialTab={sitePhotoTabOf(view)}
      />
    </div>
  );
}
