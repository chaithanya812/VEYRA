import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProjectWorkspace } from "@/lib/data/projects";
import { getViewer } from "@/lib/data/context";
import { PageHeader } from "@/components/ui/primitives";
import { ReportBuilder } from "./report-builder";

/**
 * The Progress Report (PLAN-V4 §8.3, frame `104636`) — composable, previewed
 * live, exported as a PDF from the browser.
 */
export default async function ProgressReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, viewer] = await Promise.all([getProjectWorkspace(id), getViewer()]);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to project
      </Link>

      <PageHeader
        title="Progress report"
        subtitle="Choose what the client sees, then export it."
      />

      <ReportBuilder
        data={{
          project: {
            name: data.project.name,
            clientName: data.project.client_name,
            startDate: data.project.start_date,
            handoverDate: data.project.handover_date,
          },
          milestones: data.milestones,
          photoCount: data.sitePhotos.length,
          orgName: viewer?.orgName ?? "VEYRA",
        }}
      />
    </div>
  );
}
