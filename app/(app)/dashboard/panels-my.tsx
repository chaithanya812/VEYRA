"use client";

import { useActionState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleCheck,
  ClipboardList,
  Clock,
  MapPin,
  Play,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fmtDate, inr } from "@/lib/utils";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  optionLabel,
  optionTone,
  sessionHours,
  taskBucket,
  type ExpenseClaim,
  type FieldVisit,
  type LeaveRequest,
  type Task,
  type WorkSession,
  type WorkspaceOption,
} from "@/lib/workspace-model";
import {
  FOLLOW_UP_KIND_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUS_TONE,
  effectiveFollowUpStatus,
} from "@/lib/lead-management-model";
import type { FollowUpWithContext } from "@/lib/data/followups";
import type { MyWorkspace } from "@/lib/data/workspace";
import {
  cancelLeaveAction,
  checkInAction,
  checkOutAction,
  createTaskAction,
  deleteTaskAction,
  endVisitAction,
  requestLeaveAction,
  setTaskStatusAction,
  startVisitAction,
  submitExpenseAction,
  toggleChecklistAction,
  type FormState,
} from "./actions";
import {
  Avatar,
  Chip,
  Disclosure,
  Empty,
  FormError,
  FormGrid,
  List,
  Row,
  RowAction,
  Section,
  StatTile,
  SubmitButton,
  TileGrid,
} from "./workspace-ui";

/**
 * The employee side: one person's own day. Every panel answers a single
 * question — what's on me today, where am I clocked, what have I spent, where
 * am I going — and nothing else shares the screen with it.
 */

const initial: FormState = undefined;

function optionsOf(options: WorkspaceOption[], kind: WorkspaceOption["kind"]) {
  return options.filter((o) => o.kind === kind && o.is_active);
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function hoursLabel(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h ${String(mins).padStart(2, "0")}m`;
}

/**
 * A follow-up owed to a client, rendered inside the workspace. These are
 * PROJECTED from the CRM rather than copied into `tasks` — the owner asked for
 * them to show up beside the day's work, and one commitment should stay one row.
 */
function FollowUpLine({ fu }: { fu: FollowUpWithContext }) {
  const status = effectiveFollowUpStatus(fu);
  return (
    <Row
      alert={status === "missed"}
      title={
        <Link href={`/leads/${fu.lead_id}?tab=followups`} className="hover:underline">
          {fu.lead_name}
        </Link>
      }
      chips={
        <>
          <Chip tone={FOLLOW_UP_STATUS_TONE[status]} label={FOLLOW_UP_STATUS_LABELS[status]} />
          <Chip
            tone="neutral"
            label={FOLLOW_UP_KIND_LABELS[fu.kind === "meeting" ? "meeting" : "callback"]}
          />
        </>
      }
      meta={[fu.title, fmtWhen(fu.due_at), fu.lead_phone].filter(Boolean).join(" · ")}
      right={
        <Link
          href={`/leads/${fu.lead_id}?tab=followups`}
          className="text-[13px] font-medium text-[var(--color-ink)] hover:underline"
        >
          Open
        </Link>
      }
    />
  );
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

export function OverviewPanel({ w }: { w: MyWorkspace }) {
  const focus = w.tasks
    .filter((t) => {
      const b = taskBucket(t);
      return b === "overdue" || b === "today";
    })
    .slice(0, 8);

  const liveVisit = w.visits.find((v) => v.status === "in_progress");
  const missedFollowUps = w.followUps.filter(
    (f) => effectiveFollowUpStatus(f) === "missed",
  ).length;

  return (
    <>
      <TileGrid>
        {/* Hours today is the hero — it is the one number on this panel you can
            act on right now (check in, check out). Overdue is the only tile
            allowed to go red, and only when there is something actually
            overdue: red's "genuine alert" job, never decoration. */}
        <StatTile
          hero
          label="Hours today"
          value={hoursLabel(w.hoursToday)}
          hint={w.openSession ? "Currently checked in" : "Not checked in"}
          tone={w.openSession ? "positive" : "neutral"}
          icon={<Clock className="size-4" />}
        />
        <StatTile
          label="Open tasks"
          value={w.taskCounts.open}
          hint={`${w.taskCounts.today} due today`}
          tone={w.taskCounts.open > 0 ? "info" : "neutral"}
          icon={<ClipboardList className="size-4" />}
        />
        <StatTile
          label="Overdue"
          value={w.taskCounts.overdue}
          tone={w.taskCounts.overdue > 0 ? "negative" : "positive"}
          hint={w.taskCounts.overdue > 0 ? "Needs attention" : "All clear"}
          icon={
            w.taskCounts.overdue > 0 ? (
              <AlertTriangle className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )
          }
        />
        <StatTile
          label="Client follow-ups"
          value={w.followUps.length}
          tone={missedFollowUps > 0 ? "warning" : "neutral"}
          hint={
            missedFollowUps > 0
              ? `${missedFollowUps} missed`
              : `${inr(w.expenseSummary.payable)} expenses owed to you`
          }
          icon={<CalendarClock className="size-4" />}
        />
      </TileGrid>

      <Section
        title="Today"
        description="Everything due today, plus anything you have let slip."
      >
        {focus.length === 0 ? (
          <Empty
            message="Nothing due today"
            hint="Add a task from the Tasks tab when something comes up."
          />
        ) : (
          <List>
            {focus.map((t) => (
              <TaskRow key={t.id} task={t} options={w.options} checklist={[]} />
            ))}
          </List>
        )}
      </Section>

      {w.followUps.length > 0 && (
        <Section
          title="Clients waiting on you"
          description="Callbacks and meetings scheduled against your leads."
        >
          <List>
            {w.followUps.slice(0, 6).map((f) => (
              <FollowUpLine key={f.id} fu={f} />
            ))}
          </List>
        </Section>
      )}

      {liveVisit && (
        <Section title="Field visit in progress">
          <List>
            <VisitRow visit={liveVisit} options={w.options} />
          </List>
        </Section>
      )}
    </>
  );
}

/* ── My info: profile, attendance, leave ──────────────────────────────────── */

export function MyInfoPanel({ w }: { w: MyWorkspace }) {
  const [checkInState, doCheckIn] = useActionState(checkInAction, initial);
  const [leaveState, doLeave] = useActionState(requestLeaveAction, initial);
  const leaveTypes = optionsOf(w.options, "leave_type");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--color-surface-sunken)] text-sm font-semibold text-[var(--color-ink-secondary)] ring-1 ring-[var(--color-border)]">
            {w.member.name
              .split(/\s+/)
              .slice(0, 2)
              .map((s) => s[0]?.toUpperCase())
              .join("")}
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-[var(--color-ink)]">
              {w.member.name}
            </p>
            <p className="text-[13px] text-[var(--color-ink-secondary)]">
              {w.member.designation ?? "—"}
              {w.member.email ? ` · ${w.member.email}` : ""}
            </p>
          </div>
        </div>
      </div>

      <Section
        title="Attendance"
        description="Hours are measured from your check-in and check-out stamps — never typed in."
        action={
          w.openSession ? (
            <form action={checkOutAction}>
              <SubmitButton variant="secondary" size="sm" pendingLabel="Checking out…">
                <Square className="size-3.5" /> Check out
              </SubmitButton>
            </form>
          ) : null
        }
      >
        <TileGrid>
          <StatTile
            label="Today"
            value={hoursLabel(w.hoursToday)}
            tone={w.openSession ? "green" : "neutral"}
            hint={
              w.openSession
                ? `Since ${fmtTime(w.openSession.check_in)}`
                : "Checked out"
            }
          />
          <StatTile label="This week" value={hoursLabel(w.hoursThisWeek)} />
          <StatTile
            label="Leave remaining"
            value={`${w.leaveBalance.remaining} d`}
            hint={`${w.leaveBalance.taken} taken · ${w.leaveBalance.pending} pending`}
          />
          <StatTile
            label="Allowance"
            value={`${w.leaveBalance.allowance} d`}
            hint="Annual"
          />
        </TileGrid>

        {!w.openSession && (
          <form action={doCheckIn} className="mt-3">
            <FormError error={checkInState?.error} />
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Field label="Where are you working from?" htmlFor="location_label">
                  <Input
                    id="location_label"
                    name="location_label"
                    placeholder="Office / DLF Greens site / Home"
                  />
                </Field>
              </div>
              <SubmitButton pendingLabel="Checking in…">
                <Play className="size-3.5" /> Check in
              </SubmitButton>
            </div>
          </form>
        )}

        <div className="mt-4">
          {w.sessions.length === 0 ? (
            <Empty message="No attendance yet" hint="Check in to start the clock." />
          ) : (
            <List>
              {w.sessions.slice(0, 10).map((s: WorkSession) => (
                <Row
                  key={s.id}
                  title={fmtDate(s.check_in)}
                  meta={`${fmtTime(s.check_in)} → ${s.check_out ? fmtTime(s.check_out) : "now"}${
                    s.location_label ? ` · ${s.location_label}` : ""
                  }`}
                  chips={
                    !s.check_out ? <Chip tone="green" label="Open" /> : undefined
                  }
                  right={
                    <span className="text-sm tabular text-[var(--color-ink-secondary)]">
                      {hoursLabel(sessionHours(s))}
                    </span>
                  }
                />
              ))}
            </List>
          )}
        </div>
      </Section>

      <Section title="Leave">
        <Disclosure label="Request leave">
          <form action={doLeave} className="flex flex-col gap-4">
            <FormError error={leaveState?.error} />
            <FormGrid>
              <Field label="Type" htmlFor="leave_type" required>
                <Select id="leave_type" name="leave_type" defaultValue="casual">
                  {leaveTypes.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reason" htmlFor="reason">
                <Input id="reason" name="reason" placeholder="Family function" />
              </Field>
              <Field label="From" htmlFor="from_date" required>
                <Input id="from_date" name="from_date" type="date" defaultValue={today} />
              </Field>
              <Field label="To" htmlFor="to_date" required>
                <Input id="to_date" name="to_date" type="date" defaultValue={today} />
              </Field>
            </FormGrid>
            <div>
              <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
            </div>
          </form>
        </Disclosure>

        <div className="mt-3">
          {w.leave.length === 0 ? (
            <Empty message="No leave requested" />
          ) : (
            <List>
              {w.leave.map((l: LeaveRequest) => (
                <Row
                  key={l.id}
                  title={optionLabel(w.options, "leave_type", l.leave_type)}
                  meta={`${fmtDate(l.from_date)} → ${fmtDate(l.to_date)} · ${l.days} day${
                    l.days === 1 ? "" : "s"
                  }${l.decision_note ? ` · ${l.decision_note}` : ""}`}
                  chips={
                    <Chip
                      tone={
                        l.status === "approved"
                          ? "green"
                          : l.status === "pending"
                            ? "amber"
                            : "neutral"
                      }
                      label={l.status[0].toUpperCase() + l.status.slice(1)}
                    />
                  }
                  right={
                    l.status === "pending" ? (
                      <form action={cancelLeaveAction}>
                        <input type="hidden" name="id" value={l.id} />
                        <RowAction title="Withdraw">
                          <Undo2 className="size-3.5" />
                        </RowAction>
                      </form>
                    ) : undefined
                  }
                />
              ))}
            </List>
          )}
        </div>
      </Section>
    </>
  );
}

/* ── Tasks ────────────────────────────────────────────────────────────────── */

export function TaskRow({
  task,
  options,
  checklist,
  assigneeName,
}: {
  task: Task;
  options: WorkspaceOption[];
  checklist: { id: string; task_id: string; label: string; done: boolean }[];
  assigneeName?: string;
}) {
  const bucket = taskBucket(task);
  const mine = checklist.filter((c) => c.task_id === task.id);
  const doneCount = mine.filter((c) => c.done).length;

  return (
    <Row
      alert={bucket === "overdue"}
      title={task.title}
      chips={
        <>
          <Chip tone={TASK_STATUS_TONE[task.status]} label={TASK_STATUS_LABELS[task.status]} />
          <Chip
            tone={optionTone(options, "task_priority", task.priority)}
            label={optionLabel(options, "task_priority", task.priority)}
          />
        </>
      }
      meta={
        [
          optionLabel(options, "task_type", task.task_type),
          task.due_at
            ? bucket === "overdue"
              ? `Overdue · was due ${fmtDate(task.due_at)}`
              : `Due ${fmtDate(task.due_at)}`
            : "No due date",
          mine.length > 0 ? `${doneCount}/${mine.length} steps` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      }
      right={
        <>
          {assigneeName && <Avatar name={assigneeName} />}
          {task.status !== "done" ? (
            <form action={setTaskStatusAction}>
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="status" value="done" />
              <RowAction title="Mark done">
                <Check className="size-3.5" />
              </RowAction>
            </form>
          ) : (
            <form action={setTaskStatusAction}>
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="status" value="created" />
              <RowAction title="Reopen">
                <Undo2 className="size-3.5" />
              </RowAction>
            </form>
          )}
          <form action={deleteTaskAction}>
            <input type="hidden" name="id" value={task.id} />
            <RowAction variant="danger" title="Delete task">
              <Trash2 className="size-3.5" />
            </RowAction>
          </form>
        </>
      }
    >
      {mine.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 pl-1">
          {mine.map((c) => (
            <li key={c.id}>
              <form action={toggleChecklistAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="done" value={String(!c.done)} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
                >
                  <span
                    className={
                      c.done
                        ? "inline-flex size-4 items-center justify-center rounded border border-[var(--color-green)] bg-[var(--color-green-tint)] text-[var(--color-green)]"
                        : "inline-flex size-4 items-center justify-center rounded border border-[var(--color-border-strong)]"
                    }
                  >
                    {c.done && <Check className="size-3" />}
                  </span>
                  <span className={c.done ? "line-through" : ""}>{c.label}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Row>
  );
}

export function TasksPanel({ w }: { w: MyWorkspace }) {
  const [state, action] = useActionState(createTaskAction, initial);
  const types = optionsOf(w.options, "task_type");
  const priorities = optionsOf(w.options, "task_priority");

  const groups: { key: string; label: string; tasks: Task[] }[] = [
    { key: "overdue", label: "Overdue", tasks: [] },
    { key: "today", label: "Today", tasks: [] },
    { key: "upcoming", label: "Upcoming", tasks: [] },
    { key: "someday", label: "No due date", tasks: [] },
    { key: "closed", label: "Done", tasks: [] },
  ];
  for (const t of w.tasks) {
    groups.find((g) => g.key === taskBucket(t))?.tasks.push(t);
  }

  return (
    <>
      <TileGrid>
        <StatTile label="Open" value={w.taskCounts.open} />
        <StatTile label="Due today" value={w.taskCounts.today} />
        <StatTile
          label="Overdue"
          value={w.taskCounts.overdue}
          tone={w.taskCounts.overdue > 0 ? "red" : "neutral"}
        />
        <StatTile label="Completed" value={w.taskCounts.done} tone="green" />
      </TileGrid>

      {w.followUps.length > 0 && (
        <Section
          title="Client follow-ups"
          description="Scheduled from the CRM. They live on the lead, and show here so nothing is missed."
        >
          <List>
            {w.followUps.map((f) => (
              <FollowUpLine key={f.id} fu={f} />
            ))}
          </List>
        </Section>
      )}

      <Section
        title="Your tasks"
        description="Create your own, or work the ones assigned to you — same list."
      >
        <Disclosure label="Add a task">
          <form action={action} className="flex flex-col gap-4">
            <FormError error={state?.error} />
            <Field label="What needs doing?" htmlFor="title" required>
              <Input id="title" name="title" placeholder="Site measurement — Anil Residence" />
            </Field>
            <FormGrid>
              <Field label="Type" htmlFor="task_type">
                <Select id="task_type" name="task_type" defaultValue="task">
                  {types.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="priority">
                <Select id="priority" name="priority" defaultValue="medium">
                  {priorities.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due date" htmlFor="due_date">
                <Input id="due_date" name="due_date" type="date" />
              </Field>
              <Field label="Due time" htmlFor="due_time" hint="Defaults to 6:00 pm">
                <Input id="due_time" name="due_time" type="time" />
              </Field>
            </FormGrid>
            <Field
              label="Steps"
              htmlFor="checklist"
              hint="One per line — becomes a checklist you can tick off."
            >
              <Textarea id="checklist" name="checklist" rows={3} placeholder={"Carry laser measure\nPhotograph existing wardrobe"} />
            </Field>
            <Field label="Notes" htmlFor="description">
              <Textarea id="description" name="description" rows={2} />
            </Field>
            <div>
              <SubmitButton pendingLabel="Adding…">Add task</SubmitButton>
            </div>
          </form>
        </Disclosure>

        <div className="mt-4 flex flex-col gap-5">
          {w.tasks.length === 0 && (
            <Empty
              message="No tasks yet"
              hint="Add one above — it is yours until you assign it to someone else."
            />
          )}
          {groups
            .filter((g) => g.tasks.length > 0)
            .map((g) => (
              <div key={g.key}>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  {g.label}
                  <span className="ml-1.5 tabular font-normal">{g.tasks.length}</span>
                </p>
                <List>
                  {g.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} options={w.options} checklist={w.checklist} />
                  ))}
                </List>
              </div>
            ))}
        </div>
      </Section>
    </>
  );
}

/* ── Expenses ─────────────────────────────────────────────────────────────── */

export function ExpensesPanel({ w }: { w: MyWorkspace }) {
  const [state, action] = useActionState(submitExpenseAction, initial);
  const categories = optionsOf(w.options, "expense_category");
  const today = new Date().toISOString().slice(0, 10);

  const statusTone = (s: ExpenseClaim["status"]) =>
    s === "approved" || s === "reimbursed"
      ? ("green" as const)
      : s === "submitted"
        ? ("amber" as const)
        : ("neutral" as const);

  return (
    <>
      <TileGrid>
        <StatTile
          label="Owed to you"
          value={inr(w.expenseSummary.payable)}
          hint="Approved, not yet reimbursed"
          hero
        />
        <StatTile label="Awaiting approval" value={inr(w.expenseSummary.submitted)} tone="amber" />
        <StatTile label="Reimbursed" value={inr(w.expenseSummary.reimbursed)} tone="green" />
        <StatTile label="Claims filed" value={w.expenseSummary.count} />
      </TileGrid>

      <Section title="Your claims">
        <Disclosure label="Log an expense">
          <form action={action} className="flex flex-col gap-4">
            <FormError error={state?.error} />
            <FormGrid>
              <Field label="Amount (₹)" htmlFor="amount" required>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="2750"
                />
              </Field>
              <Field label="Spent on" htmlFor="spent_on" required>
                <Input id="spent_on" name="spent_on" type="date" defaultValue={today} />
              </Field>
              <Field label="Category" htmlFor="category">
                <Select id="category" name="category" defaultValue="materials">
                  {categories.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Project" htmlFor="project_label">
                <Input id="project_label" name="project_label" placeholder="DLF Greens" />
              </Field>
            </FormGrid>
            <Field label="Remark" htmlFor="remark">
              <Input id="remark" name="remark" placeholder="Board, laminates & edge bands" />
            </Field>
            <div>
              <SubmitButton pendingLabel="Submitting…">Submit claim</SubmitButton>
            </div>
          </form>
        </Disclosure>

        <div className="mt-3">
          {w.expenses.length === 0 ? (
            <Empty message="No expenses logged" hint="Claims you file appear here with their approval status." />
          ) : (
            <List>
              {w.expenses.map((e) => (
                <Row
                  key={e.id}
                  title={optionLabel(w.options, "expense_category", e.category)}
                  chips={
                    <Chip
                      tone={statusTone(e.status)}
                      label={e.status[0].toUpperCase() + e.status.slice(1)}
                    />
                  }
                  meta={[
                    fmtDate(e.spent_on),
                    e.project_label,
                    e.remark,
                    e.decision_note ? `Note: ${e.decision_note}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  right={
                    <span className="text-sm font-medium tabular text-[var(--color-ink)]">
                      {inr(e.amount)}
                    </span>
                  }
                />
              ))}
            </List>
          )}
        </div>
      </Section>
    </>
  );
}

/* ── Field visits ─────────────────────────────────────────────────────────── */

export function VisitRow({
  visit,
  options,
  memberName,
}: {
  visit: FieldVisit;
  options: WorkspaceOption[];
  memberName?: string;
}) {
  return (
    <Row
      title={visit.title || optionLabel(options, "visit_purpose", visit.purpose)}
      chips={
        <Chip
          tone={visit.status === "in_progress" ? "green" : "neutral"}
          label={visit.status === "in_progress" ? "In progress" : "Completed"}
        />
      }
      meta={[
        optionLabel(options, "visit_purpose", visit.purpose),
        visit.location_label,
        visit.started_at ? `Started ${fmtTime(visit.started_at)}` : null,
        visit.ended_at ? `Ended ${fmtTime(visit.ended_at)}` : null,
        visit.notes,
      ]
        .filter(Boolean)
        .join(" · ")}
      right={
        <>
          {memberName && <Avatar name={memberName} />}
          {visit.status === "in_progress" && (
            <form action={endVisitAction}>
              <input type="hidden" name="id" value={visit.id} />
              <RowAction variant="secondary" title="End visit">
                End visit
              </RowAction>
            </form>
          )}
        </>
      }
    />
  );
}

export function VisitsPanel({ w }: { w: MyWorkspace }) {
  const [state, action] = useActionState(startVisitAction, initial);
  const purposes = optionsOf(w.options, "visit_purpose");
  const live = w.visits.filter((v) => v.status === "in_progress");
  const past = w.visits.filter((v) => v.status !== "in_progress");

  return (
    <>
      <TileGrid>
        <StatTile
          label="In progress"
          value={live.length}
          tone={live.length > 0 ? "green" : "neutral"}
        />
        <StatTile label="Completed" value={past.length} />
        <StatTile
          label="This week"
          value={
            w.visits.filter(
              (v) =>
                v.started_at &&
                Date.now() - new Date(v.started_at).getTime() < 7 * 86_400_000,
            ).length
          }
        />
        <StatTile label="Purposes configured" value={purposes.length} />
      </TileGrid>

      <Section
        title="Field visits"
        description="Start one when you leave, end it when you are done — the timestamps are the record."
      >
        <Disclosure label="Start a visit">
          <form action={action} className="flex flex-col gap-4">
            <FormError error={state?.error} />
            <FormGrid>
              <Field label="Purpose" htmlFor="purpose">
                <Select id="purpose" name="purpose" defaultValue="site_visit">
                  {purposes.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Where" htmlFor="location_label">
                <Input id="location_label" name="location_label" placeholder="DLF Greens, Gurgaon" />
              </Field>
            </FormGrid>
            <Field label="What is this visit for?" htmlFor="title">
              <Input id="title" name="title" placeholder="Final measurement before production" />
            </Field>
            <div>
              <SubmitButton pendingLabel="Starting…">
                <MapPin className="size-3.5" /> Start visit
              </SubmitButton>
            </div>
          </form>
        </Disclosure>

        <div className="mt-3">
          {w.visits.length === 0 ? (
            <Empty message="No visits logged" hint="Start one above when you head out." />
          ) : (
            <List>
              {w.visits.map((v) => (
                <VisitRow key={v.id} visit={v} options={w.options} />
              ))}
            </List>
          )}
        </div>
      </Section>
    </>
  );
}

/* ── Icons re-exported for the shell's tab definitions ────────────────────── */
export const panelIcons = {
  overview: CircleCheck,
  info: Clock,
  tasks: CalendarDays,
  expenses: CalendarDays,
  visits: MapPin,
};
