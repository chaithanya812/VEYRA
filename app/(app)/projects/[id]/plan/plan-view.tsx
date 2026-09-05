"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Layers,
  Link2,
  ListChecks,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ClientVisibleToggle,
  MultiValueCell,
  PlannedVsActual,
} from "@/components/ui/patterns";
import {
  StatTile,
  TabBar,
  TileGrid,
  FormError,
  SubmitButton,
  type TabDef,
} from "../../../dashboard/workspace-ui";
import { GanttChart } from "./gantt";
import { TasksPanel } from "./tasks-panel";
import { SmartPlanDialog } from "./smartplan-dialog";
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABELS,
  groupByScope,
  milestoneVariance,
  rollupMilestones,
  scheduleHealth,
  statusOf,
  type ProjectMilestone,
} from "@/lib/milestones-model";
import { scopeLabel, type ScopeItem } from "@/lib/scope-model";
import type { Member } from "@/lib/data/team";
import type { MilestoneTemplate } from "@/lib/data/project-milestones";
import type { Task } from "@/lib/workspace-model";
import {
  addMilestoneAction,
  addScopeAction,
  applyTemplatesAction,
  deleteMilestoneAction,
  toggleDependencyAction,
  updateMilestoneAction,
  type PlanState,
} from "./actions";
import { cn, fmtDate } from "@/lib/utils";

/**
 * Project Planning → Milestone (PLAN-V4 §9.2, frames `105010` / `105024`).
 *
 * Scope groups band the plan, and their counts sum to the project total — the
 * reconciliation in `105024` (14+12+4+28+14 = 72) is what proves the grouping
 * is real structure rather than UI decoration. Here the bands come from
 * `scope_items`, the spine built in migration 0027.
 *
 * The Timeline cell is three stacked lines — planned, actual, variance — which
 * is the design worth stealing wholesale. What is NOT copied: the competitor
 * renders "351 days overdue" as plain grey text.
 */
const initial: PlanState = undefined;

const TABS: TabDef[] = [
  { id: "milestone", label: "Milestone", icon: <ListChecks className="size-4" /> },
  { id: "gantt", label: "Gantt chart", icon: <BarChart3 className="size-4" /> },
  { id: "tasks", label: "Tasks", icon: <CalendarDays className="size-4" /> },
];

export function PlanView({
  projectId,
  projectName,
  projectStart,
  projectHandover,
  milestones,
  scopeItems,
  members,
  templates,
  deps,
  tasks,
  initialTab,
}: {
  projectId: string;
  projectName: string;
  projectStart: string | null;
  projectHandover: string | null;
  milestones: ProjectMilestone[];
  scopeItems: ScopeItem[];
  members: Member[];
  templates: MilestoneTemplate[];
  deps: Record<string, string[]>;
  tasks: Task[];
  /** From the server's own `?tab=` — see the note below. */
  initialTab: string;
}) {
  // The tab is resolved on the SERVER from the query string, not in an effect
  // after hydration. A link to the Gantt therefore renders the Gantt, rather
  // than painting the milestone table and swapping it a moment later.
  const [tab, setTab] = useState(
    TABS.some((x) => x.id === initialTab) ? initialTab : "milestone",
  );

  const select = useCallback((id: string) => {
    setTab(id);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const scopeNames = useMemo(
    () => new Map(scopeItems.map((s) => [s.id, scopeLabel(s)])),
    [scopeItems],
  );
  const groups = useMemo(
    () => groupByScope(milestones, scopeNames),
    [milestones, scopeNames],
  );
  const rollup = useMemo(() => rollupMilestones(milestones), [milestones]);
  const health = scheduleHealth(rollup);

  // The actual start/end of the WORK, derived from the milestones. The
  // competitor shows a stored "Actual Start Date" that nobody maintains;
  // deriving it means it is true the moment someone ticks the first milestone.
  const actualStart = earliest(milestones.map((m) => m.actual_start));
  const actualEnd = allComplete(milestones)
    ? latest(milestones.map((m) => m.actual_end))
    : null;
  const plannedStart = earliest(milestones.map((m) => m.planned_start)) ?? projectStart;
  const plannedEnd = latest(milestones.map((m) => m.planned_end)) ?? projectHandover;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabBar tabs={TABS} active={tab} onSelect={select} />
        {tab === "milestone" && (
          <AddScopeDialog projectId={projectId} nextSort={scopeItems.length} />
        )}
      </div>

      {tab === "gantt" ? (
        <GanttChart milestones={milestones} deps={deps} />
      ) : tab === "tasks" ? (
        <TasksPanel projectId={projectId} tasks={tasks} members={members} />
      ) : (
        <>
          {/* Overview: how much, by when, and whether that is on plan. */}
          <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <TileGrid>
              <StatTile hero label="Total" value={rollup.total} tone="info" />
              <StatTile label="In progress" value={rollup.inProgress} tone="warning" />
              <StatTile label="Completed" value={rollup.completed} tone="positive" />
              <StatTile label="Not started" value={rollup.notStarted} />
            </TileGrid>

            <Card className="p-4">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
                Dates
              </h2>
              <DateLine label="Planned start" value={plannedStart} />
              <DateLine label="Actual start" value={actualStart} tone="green" />
              <DateLine label="Planned handover" value={plannedEnd} />
              <DateLine label="Actual end" value={actualEnd} tone="amber" />
            </Card>

            <Card className="p-4">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
                Progress
              </h2>
              <ProgressBar
                label="Estimated"
                pct={rollup.estimatedPct}
                colour="var(--color-chart-1)"
              />
              <ProgressBar
                label="Actual"
                pct={rollup.actualPct}
                colour={health.behind ? "var(--color-red)" : "var(--color-green)"}
              />
              <p
                className={cn(
                  "mt-2 rounded-md px-2 py-1 text-[12px] font-medium",
                  health.behind
                    ? "bg-[var(--color-red-tint)] text-[var(--color-red-hover)]"
                    : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]",
                )}
              >
                {health.behind && "⚠ "}
                {health.label}
              </p>
              {/* A percentage without its denominator is not trustworthy. */}
              <p className="mt-1 text-[11px] tabular text-[var(--color-ink-secondary)]">
                {rollup.completed} of {rollup.total} milestones completed
              </p>
            </Card>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <TemplateDialog
              projectId={projectId}
              projectStart={projectStart}
              scopeItems={scopeItems}
              templates={templates}
            />
            <AddMilestoneDialog
              projectId={projectId}
              scopeItems={scopeItems}
              members={members}
              nextSort={milestones.length}
            />
          </div>

          {groups.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-8" />}
              title="No plan yet"
              description="Start from a template — Design Team, Execution Team, Post Handover — let SmartPlan draft one, or add milestones one at a time."
              action={
                <AddMilestoneDialog
                  projectId={projectId}
                  scopeItems={scopeItems}
                  members={members}
                  nextSort={milestones.length}
                />
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => {
                const gHealth = scheduleHealth(g);
                return (
                  <Card key={g.scopeItemId ?? "default"} className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Layers className="size-4 text-[var(--color-ink-secondary)]" />
                        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                          {g.name}
                        </h2>
                        <span className="rounded-full bg-[var(--color-info-tint)] px-2 py-0.5 text-[11px] font-medium tabular text-[var(--color-info)]">
                          {g.total} milestones
                        </span>
                        <span className="rounded-full bg-[var(--color-green-tint)] px-2 py-0.5 text-[11px] font-medium tabular text-[var(--color-green)]">
                          {g.completed} completed
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-surface)]">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.min(100, g.actualPct)}%`,
                              background: gHealth.behind
                                ? "var(--color-red)"
                                : "var(--color-green)",
                            }}
                          />
                        </span>
                        <span className="text-[12px] font-medium tabular text-[var(--color-ink)]">
                          {g.actualPct}%
                        </span>
                        <SmartPlanDialog
                          projectId={projectId}
                          projectName={projectName}
                          scopeGroup={g.name}
                          scopeItemId={g.scopeItemId}
                          startDate={
                            projectStart?.slice(0, 10) ??
                            new Date().toISOString().slice(0, 10)
                          }
                          handoverDate={projectHandover?.slice(0, 10) ?? null}
                          existing={g.rows.map((m) => m.name)}
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1040px] text-[13px]">
                        <thead>
                          <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                            <th className="px-4 py-2 font-medium">Milestone</th>
                            <th className="px-4 py-2 font-medium">Progress</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 font-medium">Timeline</th>
                            <th className="px-4 py-2 font-medium">Assignee</th>
                            <th className="px-4 py-2 font-medium">Client</th>
                            <th className="px-4 py-2 font-medium">Last update</th>
                            <th className="px-4 py-2 font-medium">Depends on</th>
                            <th className="px-4 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((m) => (
                            <MilestoneRow
                              key={m.id}
                              projectId={projectId}
                              milestone={m}
                              members={members}
                              dependsOn={deps[m.id] ?? []}
                              siblings={milestones}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* -- Small pieces of the overview ----------------------------------------- */

function DateLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: "green" | "amber";
}) {
  return (
    <p className="flex items-center justify-between gap-3 py-0.5 text-[12px]">
      <span className="flex items-center gap-1.5 text-[var(--color-ink-secondary)]">
        {tone && (
          <span
            className="size-1.5 rounded-full"
            style={{
              background:
                tone === "green" ? "var(--color-green)" : "var(--color-amber)",
            }}
          />
        )}
        {label}
      </span>
      <span className="tabular font-medium text-[var(--color-ink)]">
        {value ? fmtDate(value) : "—"}
      </span>
    </p>
  );
}

function ProgressBar({
  label,
  pct,
  colour,
}: {
  label: string;
  pct: number;
  colour: string;
}) {
  return (
    <div className="mb-2">
      <p className="flex items-center justify-between text-[12px]">
        <span className="text-[var(--color-ink-secondary)]">{label}</span>
        <span className="tabular font-medium text-[var(--color-ink)]">{pct}%</span>
      </p>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: colour }}
        />
      </span>
    </div>
  );
}

function earliest(days: (string | null)[]): string | null {
  return days
    .filter((d): d is string => !!d)
    .reduce<string | null>((a, d) => (a === null || d < a ? d : a), null);
}

function latest(days: (string | null)[]): string | null {
  return days
    .filter((d): d is string => !!d)
    .reduce<string | null>((a, d) => (a === null || d > a ? d : a), null);
}

/** An "actual end" only means something once there is nothing left to finish. */
function allComplete(milestones: ProjectMilestone[]): boolean {
  return (
    milestones.length > 0 && milestones.every((m) => statusOf(m) === "completed")
  );
}

/* ── One row ──────────────────────────────────────────────────────────────── */

function MilestoneRow({
  projectId,
  milestone,
  members,
  dependsOn,
  siblings,
}: {
  projectId: string;
  milestone: ProjectMilestone;
  members: Member[];
  /** Ids this milestone waits on. */
  dependsOn: string[];
  /** Every milestone on the project — what it could be linked to. */
  siblings: ProjectMilestone[];
}) {
  const [state, update] = useActionState(updateMilestoneAction, initial);
  const v = milestoneVariance(milestone);
  const status = statusOf(milestone);

  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 align-top">
      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
        {milestone.name}
        {state?.error && (
          <span className="mt-1 block text-[11px] text-[var(--color-red)]">
            {state.error}
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        <form action={update} className="flex items-center gap-1">
          <input type="hidden" name="id" value={milestone.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <Input
            name="progress_pct"
            type="number"
            min="0"
            max="100"
            defaultValue={Number(milestone.progress_pct) || 0}
            aria-label={`Progress for ${milestone.name}`}
            className="h-7 w-16 text-[12px]"
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          />
          <span className="text-[12px] text-[var(--color-ink-secondary)]">%</span>
        </form>
      </td>

      <td className="px-4 py-3">
        <form action={update}>
          <input type="hidden" name="id" value={milestone.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <Select
            name="status"
            key={milestone.status}
            defaultValue={status}
            aria-label={`Status for ${milestone.name}`}
            className="h-7 w-32 text-[12px]"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {MILESTONE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MILESTONE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </form>
      </td>

      <td className="px-4 py-3">
        <PlannedVsActual
          compact
          plannedLabel={`${fmtDate(milestone.planned_start)} → ${fmtDate(milestone.planned_end)}`}
          actualLabel={
            milestone.actual_start || milestone.actual_end
              ? `${fmtDate(milestone.actual_start)} → ${fmtDate(milestone.actual_end)}`
              : null
          }
          variance={v}
        />
      </td>

      <td className="px-4 py-3">
        <form action={update}>
          <input type="hidden" name="id" value={milestone.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <Select
            name="assignee_id"
            key={milestone.assignee_id ?? "none"}
            defaultValue={milestone.assignee_id ?? ""}
            aria-label={`Assignee for ${milestone.name}`}
            className="h-7 w-36 text-[12px]"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </form>
      </td>

      <td className="px-4 py-3">
        <form action={update}>
          <input type="hidden" name="id" value={milestone.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <input
            type="hidden"
            name="client_visible"
            value={milestone.client_visible ? "false" : "true"}
          />
          {/* The submit button is the control; the chip inside it is now a
              span (see `readOnly`). Before this, a nested <button> left the
              submit with no accessible name — twelve nameless buttons in one
              table — and the label says what pressing it DOES, not what the
              row currently is. */}
          <button
            type="submit"
            className="cursor-pointer"
            aria-label={
              milestone.client_visible
                ? `Hide ${milestone.name} from the client`
                : `Show ${milestone.name} to the client`
            }
          >
            <ClientVisibleToggle readOnly checked={milestone.client_visible} />
          </button>
        </form>
      </td>

      <td className="px-4 py-3">
        <form action={update} className="flex items-center gap-1">
          <input type="hidden" name="id" value={milestone.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <Input
            name="last_update"
            defaultValue={milestone.last_update ?? ""}
            placeholder="Add remark"
            aria-label={`Remark for ${milestone.name}`}
            className="h-7 min-w-36 text-[12px]"
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </form>
      </td>

      <td className="px-4 py-3">
        <DependencyCell
          projectId={projectId}
          milestone={milestone}
          dependsOn={dependsOn}
          siblings={siblings}
        />
      </td>

      <td className="px-4 py-3">
        <form action={deleteMilestoneAction}>
          <input type="hidden" name="id" value={milestone.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <Button type="submit" variant="ghost" size="sm" title="Delete milestone">
            <Trash2 className="size-3.5" />
          </Button>
        </form>
      </td>
    </tr>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────────────────── */

function AddMilestoneDialog({
  projectId,
  scopeItems,
  members,
  nextSort,
}: {
  projectId: string;
  scopeItems: ScopeItem[];
  members: Member[];
  nextSort: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, add] = useActionState(addMilestoneAction, initial);

  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Secondary, not primary. This screen had TWO filled red buttons in
            one view — `Add scope` in the page header and this one — which is
            §2 rule 7's first named offender: one primary action per view, and
            two reds means neither is the primary. `Add scope` keeps the red
            because it is the page's action; this now matches `Start from a
            template` beside it, which is the pair it actually belongs to. */}
        <Button variant="secondary" size="sm">
          <Plus className="size-4" /> Add milestone
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a milestone</DialogTitle>
          <DialogDescription>
            Write your own, or start a whole group from a template instead.
          </DialogDescription>
        </DialogHeader>
        <form action={add} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="sort_order" value={nextSort} />
          <FormError error={state?.error} />

          <Field label="Name" htmlFor="ms_name" required>
            <Input id="ms_name" name="name" placeholder="Site measurements" required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Planned start" htmlFor="ms_start">
              <Input id="ms_start" name="planned_start" type="date" />
            </Field>
            <Field label="Planned end" htmlFor="ms_end">
              <Input id="ms_end" name="planned_end" type="date" />
            </Field>
          </div>

          <Field label="Scope group" htmlFor="ms_scope">
            <Select id="ms_scope" name="scope_item_id" defaultValue="">
              <option value="">Default project scope</option>
              {scopeItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {scopeLabel(s)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Assign to" htmlFor="ms_assignee">
            <Select id="ms_assignee" name="assignee_id" defaultValue="">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="client_visible"
              className="size-4 accent-[var(--color-red)]"
            />
            Visible to the client in the progress report
          </label>

          <div>
            <SubmitButton pendingLabel="Adding…">Add milestone</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({
  projectId,
  projectStart,
  scopeItems,
  templates,
}: {
  projectId: string;
  projectStart: string | null;
  scopeItems: ScopeItem[];
  templates: MilestoneTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [state, apply] = useActionState(applyTemplatesAction, initial);
  const groups = useMemo(
    () => [...new Set(templates.filter((t) => t.is_active).map((t) => t.scope_group))],
    [templates],
  );
  const [group, setGroup] = useState(groups[0] ?? "");

  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  const preview = templates.filter((t) => t.is_active && t.scope_group === group);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Wand2 className="size-4" /> Start from a template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            A standard run of milestones, dated from the start you choose. Edit
            anything afterwards — nothing here is fixed.
          </DialogDescription>
        </DialogHeader>
        <form action={apply} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <FormError error={state?.error} />

          <Field label="Template group" htmlFor="tpl_group">
            <Select
              id="tpl_group"
              name="scope_group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Start from" htmlFor="tpl_start" required>
            <Input
              id="tpl_start"
              name="start_date"
              type="date"
              defaultValue={projectStart?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>

          <Field label="Put them under" htmlFor="tpl_scope">
            <Select id="tpl_scope" name="scope_item_id" defaultValue="">
              <option value="">Default project scope</option>
              {scopeItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {scopeLabel(s)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-md bg-[var(--color-surface-sunken)] p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
              {preview.length} milestones
            </p>
            <ul className="flex flex-col gap-0.5 text-[12px] text-[var(--color-ink)]">
              {preview.map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span className="truncate">{t.name}</span>
                  <span className="shrink-0 tabular text-[var(--color-ink-secondary)]">
                    day {t.offset_days + 1}–{t.offset_days + t.duration_days}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SubmitButton pendingLabel="Adding…">Add these milestones</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What a milestone waits on (`105010`'s trailing chip column — `Modu… 3D M…
 * Plan L…`).
 *
 * Dependencies are a real graph in `project_milestone_deps`, not a text field,
 * which is why the Gantt can say "waits for 2" and mean it. The picker offers
 * this project's other milestones and nothing else: a plan that waits on
 * another project's schedule is not a plan, it is a coupling nobody asked for.
 */
function DependencyCell({
  projectId,
  milestone,
  dependsOn,
  siblings,
}: {
  projectId: string;
  milestone: ProjectMilestone;
  dependsOn: string[];
  siblings: ProjectMilestone[];
}) {
  const [open, setOpen] = useState(false);
  const [state, toggle] = useActionState(toggleDependencyAction, initial);

  const nameById = useMemo(
    () => new Map(siblings.map((m) => [m.id, m.name])),
    [siblings],
  );
  const options = siblings.filter((m) => m.id !== milestone.id);
  const linked = new Set(dependsOn);

  return (
    <>
      <span className="flex items-center gap-1.5">
        <MultiValueCell
          values={dependsOn.map((d) => nameById.get(d) ?? "Removed milestone")}
          max={1}
          emptyLabel="Nothing"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              title={`Link what ${milestone.name} waits for`}
              className="rounded-full p-1 text-[var(--color-ink-disabled)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
            >
              <Link2 className="size-3.5" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{milestone.name} waits for…</DialogTitle>
              <DialogDescription>
                Only milestones on this project. Tick what has to finish first.
              </DialogDescription>
            </DialogHeader>
            <FormError error={state?.error} />
            {options.length === 0 ? (
              <p className="text-[13px] text-[var(--color-ink-secondary)]">
                There is nothing else on this plan yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {options.map((o) => (
                  <li key={o.id}>
                    <form action={toggle}>
                      <input type="hidden" name="project_id" value={projectId} />
                      <input type="hidden" name="milestone_id" value={milestone.id} />
                      <input type="hidden" name="depends_on_id" value={o.id} />
                      <input
                        type="hidden"
                        name="on"
                        value={linked.has(o.id) ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex size-4 shrink-0 items-center justify-center rounded border text-[10px] text-white",
                            linked.has(o.id)
                              ? "border-[var(--color-red)] bg-[var(--color-red)]"
                              : "border-[var(--color-border-strong)]",
                          )}
                        >
                          {linked.has(o.id) ? "✓" : ""}
                        </span>
                        {o.name}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      </span>
      {state?.error && (
        <span className="mt-1 block text-[11px] text-[var(--color-red)]">
          {state.error}
        </span>
      )}
    </>
  );
}

/**
 * `Add Scope` (`105010`, top-right).
 *
 * A scope band is a `scope_items` row — the spine from migration 0027, not a
 * grouping invented for this screen. That is the whole point of the spine: the
 * band a milestone sits under is the same row a quoted line, a material request
 * and a purchase order all resolve to.
 */
function AddScopeDialog({
  projectId,
  nextSort,
}: {
  projectId: string;
  nextSort: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, add] = useActionState(addScopeAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Layers className="size-4" /> Add scope
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a scope group</DialogTitle>
          <DialogDescription>
            A band the plan groups under — Design Team, Execution Team, Post
            Handover. The same row every other module links its lines to.
          </DialogDescription>
        </DialogHeader>
        <form action={add} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="sort_order" value={nextSort} />
          <FormError error={state?.error} />
          <Field label="Name" htmlFor="scope_name" required>
            <Input id="scope_name" name="name" placeholder="Execution Team" required />
          </Field>
          <div>
            <SubmitButton pendingLabel="Adding…">Add scope</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
