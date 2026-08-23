import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { listProjects, projectPortfolio } from "@/lib/data/projects";
import {
  PROJECT_STAGES,
  STAGE_LABELS,
  HEALTH_META,
  type ProjectStage,
} from "@/lib/projects-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Select } from "@/components/ui/field";
import { inr, fmtDate } from "@/lib/utils";

/** HEALTH_META tone (positive/warning/alert) → StatusChip tone. Red = true alert only. */
const healthChipTone = {
  positive: "green",
  warning: "amber",
  alert: "red",
} as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const sp = await searchParams;
  const stage = (PROJECT_STAGES as readonly string[]).includes(sp.stage ?? "")
    ? (sp.stage as ProjectStage)
    : undefined;

  const [projects, portfolio] = await Promise.all([
    listProjects({ stage }),
    projectPortfolio(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Projects"
        actions={
          <Link href="/projects/new">
            <Button variant="primary">
              <Plus className="size-4" /> New Project
            </Button>
          </Link>
        }
      />

      {/* KPI tiles — Portfolio Value is the hero metric; red allowed for it alone
          (DESIGN-DIRECTION §2.5). Everything else neutral. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Total Projects
          </p>
          <p className="mt-1 text-2xl font-semibold tabular text-[var(--color-ink)]">
            {portfolio.total}
          </p>
        </Card>
        <Card className="p-5 border-[color-mix(in_srgb,var(--color-red)_25%,white)]">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Portfolio Value
          </p>
          <p className="mt-1 text-2xl font-semibold tabular text-[var(--color-red)]">
            {inr(portfolio.portfolioValue)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Delayed
          </p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular text-[var(--color-ink)]">
            {portfolio.delayed}
            {portfolio.delayed > 0 && (
              <span className="inline-flex size-2 rounded-full bg-[var(--color-amber)]" />
            )}
          </p>
        </Card>
      </div>

      {/* Stage filter — server-rendered GET form, no client JS. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <Select name="stage" defaultValue={stage ?? ""} className="w-44">
          <option value="">All stages</option>
          {PROJECT_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {stage && (
          <Link href="/projects">
            <Button type="button" variant="ghost">
              Clear
            </Button>
          </Link>
        )}
      </form>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-8" />}
          title={stage ? "No projects in this stage" : "No projects yet"}
          description={
            stage
              ? "Try a different stage or clear the filter."
              : "Create your first project to start tracking execution."
          }
          action={
            !stage && (
              <Link href="/projects/new">
                <Button variant="primary">
                  <Plus className="size-4" /> New Project
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium text-right">Value</th>
                  <th className="px-4 py-3 font-medium">Health</th>
                  <th className="px-4 py-3 font-medium text-right">Start</th>
                  <th className="px-4 py-3 font-medium text-right">Handover</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-[var(--color-ink)] hover:text-[var(--color-red)]"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {project.client_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {STAGE_LABELS[project.stage]}
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {inr(project.project_value)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        tone={healthChipTone[HEALTH_META[project.health].tone]}
                        label={HEALTH_META[project.health].label}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
                      {fmtDate(project.start_date)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
                      {fmtDate(project.handover_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
