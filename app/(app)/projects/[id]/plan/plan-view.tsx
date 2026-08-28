"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ClientVisibleToggle, PlannedVsActual } from "@/components/ui/patterns";
import { StatTile, TileGrid, FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABELS,
  groupByScope,
  milestoneVariance,
  scheduleHealth,
  statusOf,
  type ProjectMilestone,
} from "@/lib/milestones-model";
import { scopeLabel, type ScopeItem } from "@/lib/scope-model";
import type { Member } from "@/lib/data/team";
import type { MilestoneTemplate } from "@/lib/data/project-milestones";
import {
  addMilestoneAction,
  applyTemplatesAction,
  deleteMilestoneAction,
  updateMilestoneAction,
  type PlanState,
} from "./actions";
import { fmtDate } from "@/lib/utils";

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

export function PlanView({
  projectId,
  projectStart,
  milestones,
  scopeItems,
  members,
  templates,
}: {
  projectId: string;
  projectStart: string | null;
  milestones: ProjectMilestone[];
  scopeItems: ScopeItem[];
  members: Member[];
  templates: MilestoneTemplate[];
}) {
  const scopeNames = useMemo(
    () => new Map(scopeItems.map((s) => [s.id, scopeLabel(s)])),
    [scopeItems],
  );
  const groups = useMemo(
    () => groupByScope(milestones, scopeNames),
    [milestones, scopeNames],
  );
  const totals = groups.reduce(
    (acc, g) => ({
      total: acc.total + g.total,
      completed: acc.completed + g.completed,
      inProgress: acc.inProgress + g.inProgress,
      notStarted: acc.notStarted + g.notStarted,
    }),
    { total: 0, completed: 0, inProgress: 0, notStarted: 0 },
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <TileGrid>
            <StatTile hero label="Total" value={totals.total} tone="info" />
            <StatTile label="In progress" value={totals.inProgress} tone="warning" />
            <StatTile label="Completed" value={totals.completed} tone="positive" />
            <StatTile label="Not started" value={totals.notStarted} />
          </TileGrid>
        </div>
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
        <Card className="border-dashed p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-ink)]">No plan yet</p>
          <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
            Start from a template — Design Team, Execution Team, Post Handover —
            or add milestones one at a time.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => {
            const health = scheduleHealth(g);
            return (
              <Card key={g.scopeItemId ?? "default"} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-2.5">
                  <div className="flex items-center gap-2">
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
                          background: health.behind
                            ? "var(--color-red)"
                            : "var(--color-green)",
                        }}
                      />
                    </span>
                    <span className="text-[12px] font-medium tabular text-[var(--color-ink)]">
                      {g.actualPct}%
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                        <th className="px-4 py-2 font-medium">Milestone</th>
                        <th className="px-4 py-2 font-medium">Progress</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Timeline</th>
                        <th className="px-4 py-2 font-medium">Assignee</th>
                        <th className="px-4 py-2 font-medium">Client</th>
                        <th className="px-4 py-2 font-medium">Last update</th>
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
  );
}

/* ── One row ──────────────────────────────────────────────────────────────── */

function MilestoneRow({
  projectId,
  milestone,
  members,
}: {
  projectId: string;
  milestone: ProjectMilestone;
  members: Member[];
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
          <button type="submit" className="cursor-pointer">
            <ClientVisibleToggle checked={milestone.client_visible} />
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
        <Button variant="primary" size="sm">
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
