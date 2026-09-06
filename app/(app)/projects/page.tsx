import Link from "next/link";
import { AlertTriangle, FolderKanban, Plus } from "lucide-react";
import { listProjects, projectPortfolio } from "@/lib/data/projects";
import { milestonesByProject } from "@/lib/data/project-milestones";
import {
  PROJECT_STAGES,
  STAGE_LABELS,
  type ProjectStage,
} from "@/lib/projects-model";
import { dueVariance } from "@/lib/schedule-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, EmptyState } from "@/components/ui/primitives";
import { Select } from "@/components/ui/field";
import { MilestoneCell, MilestoneLegend } from "@/components/ui/milestone-cell";
import { StatTile, TileGrid } from "../dashboard/workspace-ui";
import { inr, fmtDate } from "@/lib/utils";

/**
 * Projects (PLAN-V4 §8.1, frame `104420`).
 *
 * The rebuild is about one column. The old list showed name / client / stage /
 * value / health / dates — everything except whether the project is actually
 * going well. The Milestones cell answers that in one glance, and the handover
 * date now says "running late by 65 days" in red with an icon rather than
 * printing a date and leaving the arithmetic to the reader.
 */
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
  const plans = await milestonesByProject(projects.map((p) => p.id));

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Projects"
        subtitle={`${portfolio.total} projects · ${inr(portfolio.portfolioValue)} in the book`}
        actions={
          <Button asChild variant="primary">
            <Link href="/projects/new">
              <Plus className="size-4" /> New project
            </Link>
          </Button>
        }
      />

      <div className="mb-6">
        <TileGrid>
          <StatTile hero label="Portfolio value" value={inr(portfolio.portfolioValue)} />
          <StatTile label="Projects" value={portfolio.total} tone="info" />
          <StatTile
            label="Delayed"
            value={portfolio.delayed}
            tone={portfolio.delayed > 0 ? "negative" : "positive"}
            hint={portfolio.delayed > 0 ? "Needs attention" : "All on track"}
          />
          <StatTile
            label="Handover this month"
            value={
              projects.filter((p) => {
                if (!p.handover_date) return false;
                const d = new Date(p.handover_date);
                const now = new Date();
                return (
                  d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                );
              }).length
            }
          />
        </TileGrid>
      </div>

      {/* Keyed on the resolved stage: `defaultValue` applies on mount only, so
          without this the control keeps the previous URL's stage after a soft
          navigation and the next Filter press silently drops it (§11). */}
      <form method="get" key={stage ?? ""} className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          name="stage"
          aria-label="Filter by stage"
          defaultValue={stage ?? ""}
          className="w-44"
        >
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
          <Button asChild type="button" variant="ghost">
            <Link href="/projects">
              Clear
            </Link>
          </Button>
        )}
      </form>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-8" />}
          title={stage ? "No projects in this stage" : "No projects yet"}
          description={
            stage
              ? `Nothing is in ${STAGE_LABELS[stage]} right now.`
              : "Create one here, or promote a won lead from Lead Management."
          }
          action={
            /* A filtered empty told the reader to clear the filter and gave
               them nothing to clear it with — the form is scrolled off above a
               tall empty box. The way out belongs in the box. */
            stage ? (
              <Button asChild variant="secondary">
                <Link href="/projects">Show all stages</Link>
              </Button>
            ) : (
              <Button asChild variant="primary">
                <Link href="/projects/new">
                  <Plus className="size-4" /> New project
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">
                    Milestones
                    <MilestoneLegend />
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 font-medium">Start</th>
                  <th className="px-4 py-2.5 font-medium">Hand-over</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const late =
                    project.handover_date && project.stage !== "closed"
                      ? dueVariance(project.handover_date)
                      : null;
                  return (
                    // `relative` is what lets the project link below stretch
                    // across the whole row — see the comment on that Link.
                    <tr
                      key={project.id}
                      className="relative cursor-pointer border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface)] even:bg-[color-mix(in_srgb,var(--color-surface-sunken)_55%,white)] hover:bg-[var(--color-surface-sunken)]"
                    >
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {project.client_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {/*
                          THE WHOLE ROW OPENS THE PROJECT.

                          This used to be a link on the name and nothing else,
                          so the click target was exactly as wide as the text —
                          on a project called "1" that is about six pixels, and
                          it read as "clicking the project does nothing".

                          The stretched-link pattern fixes the target without
                          adding a second control: `after:absolute after:inset-0`
                          expands THIS anchor over the whole `relative` row, so
                          there is still one link, one tab stop and one href.
                          Wrapping every cell in its own <Link> would give the
                          keyboard eight stops for one destination — the same
                          mistake as a <button> inside an <a> (§3.2).

                          Nothing else in the row is interactive; if a cell ever
                          gains a control, give it `relative z-10` so it sits
                          above this overlay.
                        */}
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-[var(--color-ink)] after:absolute after:inset-0 after:content-[''] hover:underline"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--color-ink)]">
                          {STAGE_LABELS[project.stage]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <MilestoneCell milestones={plans.get(project.id) ?? []} />
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular">
                        {inr(project.project_value)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                        {fmtDate(project.start_date)}
                      </td>
                      <td className="px-4 py-3 tabular">
                        <span className="text-[var(--color-ink-secondary)]">
                          {fmtDate(project.handover_date)}
                        </span>
                        {late?.state === "late" && (
                          <span className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-[var(--color-red)]">
                            <AlertTriangle aria-hidden className="size-3" />
                            {late.label}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
