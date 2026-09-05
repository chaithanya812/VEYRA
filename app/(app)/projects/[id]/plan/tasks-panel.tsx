"use client";

import { useActionState, useMemo, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, EmptyState, StatusChip } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  isClosedTask,
  type Task,
  type TaskStatus,
} from "@/lib/workspace-model";
import { dueVariance } from "@/lib/schedule-model";
import type { Member } from "@/lib/data/team";
import {
  addProjectTaskAction,
  deleteProjectTaskAction,
  setProjectTaskStatusAction,
  type PlanState,
} from "./actions";
import { fmtDate } from "@/lib/utils";

/**
 * The Tasks tab of Project Planning (PLAN-V4 §9.2, the third tab in `105010`).
 *
 * **These are the workspace's own tasks, filtered to this project** —
 * `tasks.project_id` has existed since migration 0023 and the dashboard's "open
 * tasks" already counts these rows. A second, project-private task table would
 * mean a person's own task list and their project's task list could disagree
 * about the same job, which is exactly the mistake the scope-item spine exists
 * to stop repeating.
 *
 * The difference from a milestone is worth stating: a **milestone** is a
 * checkpoint the client's schedule hangs off; a **task** is a job somebody has
 * to do this week. They are counted separately and neither derives the other.
 */
const initial: PlanState = undefined;

export function TasksPanel({
  projectId,
  tasks,
  members,
}: {
  projectId: string;
  tasks: Task[];
  members: Member[];
}) {
  const [showClosed, setShowClosed] = useState(false);

  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );
  const open = tasks.filter((t) => !isClosedTask(t.status));
  const closed = tasks.filter((t) => isClosedTask(t.status));
  const shown = showClosed ? tasks : open;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-secondary)]">
          <span className="font-medium tabular text-[var(--color-ink)]">
            {open.length}
          </span>{" "}
          open ·{" "}
          <span className="font-medium tabular text-[var(--color-ink)]">
            {closed.length}
          </span>{" "}
          closed on this project
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink-secondary)]">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="size-4 accent-[var(--color-red)]"
            />
            Show closed
          </label>
          <AddTaskDialog projectId={projectId} members={members} />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-8" />}
          title={showClosed ? "No tasks on this project" : "No open tasks"}
          description={
            showClosed
              ? "Milestones are the schedule; tasks are the jobs underneath it. Add one and it also appears in the assignee's own work list."
              : "Nothing is open right now. Tick Show closed to see finished tasks, or add the next one."
          }
          action={<AddTaskDialog projectId={projectId} members={members} />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2 font-medium">Task</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Assignee</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <TaskRow
                    key={t.id}
                    projectId={projectId}
                    task={t}
                    assignee={t.assignee_id ? (nameById.get(t.assignee_id) ?? null) : null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function TaskRow({
  projectId,
  task,
  assignee,
}: {
  projectId: string;
  task: Task;
  assignee: string | null;
}) {
  const [state, setStatus] = useActionState(setProjectTaskStatusAction, initial);
  // Overdue is derived from the due date every render — never stored, so it
  // cannot go stale (the same rule the milestone variance follows).
  const v = task.due_at && !isClosedTask(task.status) ? dueVariance(task.due_at) : null;

  return (
    <tr className="border-b border-[var(--color-border)] align-top last:border-0">
      <td className="px-4 py-3">
        <span className="block font-medium text-[var(--color-ink)]">{task.title}</span>
        {task.description && (
          <span className="block text-[11px] text-[var(--color-ink-secondary)]">
            {task.description}
          </span>
        )}
        {state?.error && (
          <span className="mt-1 block text-[11px] text-[var(--color-red)]">
            {state.error}
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        <form action={setStatus}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="id" value={task.id} />
          <Select
            name="status"
            key={task.status}
            defaultValue={task.status}
            aria-label={`Status for ${task.title}`}
            className="h-7 w-32 text-[12px]"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </form>
        <span className="mt-1 inline-block">
          <StatusChip
            tone={TASK_STATUS_TONE[task.status as TaskStatus]}
            label={TASK_STATUS_LABELS[task.status as TaskStatus]}
          />
        </span>
      </td>

      <td className="px-4 py-3">
        <span className="block tabular text-[var(--color-ink)]">
          {fmtDate(task.due_at)}
        </span>
        {v && v.state === "late" && (
          /* Red text AND a word — DESIGN-DIRECTION §7: overdue as colour alone
             is exactly what the competitor gets wrong. */
          <span className="block text-[11px] font-medium text-[var(--color-red)]">
            ⚠ {v.label}
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {assignee ?? "Unassigned"}
      </td>

      <td className="px-4 py-3">
        <form action={deleteProjectTaskAction}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="id" value={task.id} />
          <Button type="submit" variant="ghost" size="sm" title="Delete task">
            <Trash2 className="size-3.5" />
          </Button>
        </form>
      </td>
    </tr>
  );
}

function AddTaskDialog({
  projectId,
  members,
}: {
  projectId: string;
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const [state, add] = useActionState(addProjectTaskAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="size-4" /> Add task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
          <DialogDescription>
            It belongs to this project and appears in the assignee&apos;s own
            work list — one task, seen from both sides.
          </DialogDescription>
        </DialogHeader>
        <form action={add} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <FormError error={state?.error} />

          <Field label="Title" htmlFor="task_title" required>
            <Input
              id="task_title"
              name="title"
              placeholder="Chase the carpenter for the shutter sample"
              required
            />
          </Field>

          <Field label="Detail" htmlFor="task_desc">
            <Textarea id="task_desc" name="description" rows={2} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due" htmlFor="task_due">
              <Input id="task_due" name="due_at" type="date" />
            </Field>
            <Field label="Priority" htmlFor="task_priority">
              <Select id="task_priority" name="priority" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>

          <Field label="Assign to" htmlFor="task_assignee" hint="Defaults to you.">
            <Select id="task_assignee" name="assignee_id" defaultValue="">
              <option value="">Me</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <SubmitButton pendingLabel="Adding…">Add task</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
