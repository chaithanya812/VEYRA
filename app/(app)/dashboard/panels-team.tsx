"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Wallet, X } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fmtDate, inr } from "@/lib/utils";
import {
  MEMBER_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  OPTION_KIND_LABELS,
  OPTION_KINDS,
  asMemberRole,
  groupByRole,
  optionLabel,
  taskBucket,
  type MemberScorecard,
  type OptionKind,
  type WorkspaceOption,
} from "@/lib/workspace-model";
import type { Member } from "@/lib/data/team";
import type { MyWorkspace, TeamWorkspace } from "@/lib/data/workspace";
import type { DashboardData } from "@/lib/data/dashboard";
import {
  createTaskAction,
  decideExpenseAction,
  decideLeaveAction,
  retireOptionAction,
  updateMemberAction,
  upsertOptionAction,
  type FormState,
} from "./actions";
import { TaskRow } from "./panels-my";
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
 * The manager / owner side: the same engines, run across everyone.
 *
 * The employee sees their own row; this sees every row plus the two things only
 * a manager can do — put work on someone else, and approve what costs money.
 * Deliberately the same visual vocabulary as the employee side, so moving
 * between the two views never feels like changing product.
 */

const initial: FormState = undefined;

/* ── Overview: the org at a glance ────────────────────────────────────────── */

export function TeamOverviewPanel({
  team,
  org,
}: {
  team: TeamWorkspace;
  org: DashboardData;
}) {
  const pendingTotal = team.pendingLeave.length + team.pendingExpenses.length;

  return (
    <>
      {/* The one hero metric on this screen (DESIGN-DIRECTION §2.5). */}
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-surface)] p-6">
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Pipeline value
        </p>
        <p className="mt-1 text-3xl font-semibold tabular text-[var(--color-red)]">
          {inr(org.pipelineValue)}
        </p>
        <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
          Across {org.leadsTotal} lead{org.leadsTotal === 1 ? "" : "s"} in the CRM
        </p>
      </div>

      <Section title="Business">
        <TileGrid>
          <StatTile label="Active projects" value={org.activeProjects} />
          <StatTile
            label="Delayed"
            value={org.delayedProjects}
            tone={org.delayedProjects > 0 ? "amber" : "neutral"}
          />
          <StatTile label="Open orders" value={org.openOrders} />
          <StatTile
            label="Cash P&L"
            value={inr(org.cash.pnl)}
            tone={org.cash.pnl >= 0 ? "green" : "red"}
            hint={`${inr(org.cash.inflow)} in · ${inr(org.cash.outflow)} out`}
          />
        </TileGrid>
      </Section>

      <Section title="People">
        <TileGrid>
          <StatTile
            label="Checked in now"
            value={`${team.checkedInCount}/${team.headcount}`}
            tone={team.checkedInCount > 0 ? "green" : "neutral"}
          />
          <StatTile label="Open tasks" value={team.taskCounts.open} />
          <StatTile
            label="Overdue tasks"
            value={team.taskCounts.overdue}
            tone={team.taskCounts.overdue > 0 ? "red" : "neutral"}
          />
          <StatTile
            label="Awaiting you"
            value={pendingTotal}
            tone={pendingTotal > 0 ? "amber" : "neutral"}
            hint={`${team.pendingLeave.length} leave · ${team.pendingExpenses.length} expense`}
          />
        </TileGrid>
      </Section>

      <Section
        title="Needs attention"
        description="Only the things that are genuinely blocked or late."
      >
        {team.taskCounts.overdue === 0 &&
        org.overdueFollowUps === 0 &&
        pendingTotal === 0 ? (
          <Empty message="Nothing needs you right now" hint="No overdue work and no pending approvals." />
        ) : (
          <List>
            {team.taskCounts.overdue > 0 && (
              <Row
                alert
                title={`${team.taskCounts.overdue} overdue task${team.taskCounts.overdue === 1 ? "" : "s"}`}
                meta="Open the Task board to reassign or reschedule."
                chips={<Chip tone="red" label="Overdue" />}
              />
            )}
            {org.overdueFollowUps > 0 && (
              <Row
                alert
                title={`${org.overdueFollowUps} overdue follow-up${org.overdueFollowUps === 1 ? "" : "s"}`}
                chips={<Chip tone="red" label="Overdue" />}
                right={
                  <Link
                    href="/followups?tab=overdue"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-ink)] hover:underline"
                  >
                    Open <ArrowRight className="size-3.5" />
                  </Link>
                }
              />
            )}
            {pendingTotal > 0 && (
              <Row
                title={`${pendingTotal} approval${pendingTotal === 1 ? "" : "s"} waiting`}
                meta={`${team.pendingLeave.length} leave request${
                  team.pendingLeave.length === 1 ? "" : "s"
                } · ${team.pendingExpenses.length} expense claim${
                  team.pendingExpenses.length === 1 ? "" : "s"
                }`}
                chips={<Chip tone="amber" label="Pending" />}
              />
            )}
          </List>
        )}
      </Section>
    </>
  );
}

/* ── Team: one row per person ─────────────────────────────────────────────── */

function ScoreBar({ pct }: { pct: number }) {
  return (
    <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
      <div
        className="h-full rounded-full bg-[var(--color-ink)]"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

export function TeamPanel({ team }: { team: TeamWorkspace }) {
  const groups = groupByRole(
    team.scorecards.map((s) => ({ ...s, role: asMemberRole(s.role) })),
  );

  return (
    <>
      <TileGrid>
        <StatTile label="Headcount" value={team.headcount} />
        <StatTile
          label="Checked in"
          value={team.checkedInCount}
          tone={team.checkedInCount > 0 ? "green" : "neutral"}
        />
        <StatTile
          label="Hours logged this week"
          value={`${team.scorecards.reduce((s, c) => s + c.hoursThisWeek, 0).toFixed(1)}h`}
        />
        <StatTile
          label="On field now"
          value={team.activeVisits.length}
          tone={team.activeVisits.length > 0 ? "green" : "neutral"}
        />
      </TileGrid>

      {groups.map((g) => (
        <Section key={g.role} title={g.label} description={ROLE_DESCRIPTIONS[g.role]}>
          <List>
            {g.people.map((c: MemberScorecard) => (
              <Row
                key={c.memberId}
                title={
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={c.name} />
                    {c.name}
                  </span>
                }
                chips={
                  <>
                    {c.checkedIn && <Chip tone="green" label="Checked in" />}
                    {c.tasksOverdue > 0 && (
                      <Chip tone="red" label={`${c.tasksOverdue} overdue`} />
                    )}
                  </>
                }
                meta={
                  <>
                    {[
                      c.designation ?? ROLE_LABELS[asMemberRole(c.role)],
                      `${c.tasksDone}/${c.tasksTotal} tasks done`,
                      `${c.hoursThisWeek}h this week`,
                      c.expensePayable > 0 ? `${inr(c.expensePayable)} owed` : null,
                      c.leavePending > 0 ? `${c.leavePending} leave pending` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    <ScoreBar pct={c.completion} />
                  </>
                }
                right={
                  <span className="text-sm font-semibold tabular text-[var(--color-ink)]">
                    {c.completion}%
                  </span>
                }
              />
            ))}
          </List>
        </Section>
      ))}
    </>
  );
}

/* ── Task board: assign and track everyone's work ─────────────────────────── */

export function TaskBoardPanel({
  team,
  w,
  members,
}: {
  team: TeamWorkspace;
  w: MyWorkspace;
  members: Member[];
}) {
  const [state, action] = useActionState(createTaskAction, initial);
  const types = w.options.filter((o) => o.kind === "task_type" && o.is_active);
  const priorities = w.options.filter((o) => o.kind === "task_priority" && o.is_active);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  const byMember = members
    .map((m) => ({
      member: m,
      tasks: team.tasks.filter(
        (t) => t.assignee_id === m.id && taskBucket(t) !== "closed",
      ),
    }))
    .filter((g) => g.tasks.length > 0);

  const unassigned = team.tasks.filter(
    (t) => !t.assignee_id && taskBucket(t) !== "closed",
  );

  return (
    <>
      <TileGrid>
        <StatTile label="Open across team" value={team.taskCounts.open} />
        <StatTile label="Due today" value={team.taskCounts.today} />
        <StatTile
          label="Overdue"
          value={team.taskCounts.overdue}
          tone={team.taskCounts.overdue > 0 ? "red" : "neutral"}
        />
        <StatTile label="Completed" value={team.taskCounts.done} tone="green" />
      </TileGrid>

      <Section title="Assign work">
        <Disclosure label="Assign a task">
          <form action={action} className="flex flex-col gap-4">
            <FormError error={state?.error} />
            <Field label="What needs doing?" htmlFor="t_title" required>
              <Input id="t_title" name="title" placeholder="Collect vendor quotes for DLF Greens" />
            </Field>
            <FormGrid>
              <Field label="Assign to" htmlFor="assignee_id" required>
                <Select id="assignee_id" name="assignee_id">
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {ROLE_LABELS[asMemberRole(m.role)]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type" htmlFor="t_type">
                <Select id="t_type" name="task_type" defaultValue="project_task">
                  {types.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="t_priority">
                <Select id="t_priority" name="priority" defaultValue="medium">
                  {priorities.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due date" htmlFor="t_due">
                <Input id="t_due" name="due_date" type="date" />
              </Field>
            </FormGrid>
            <Field label="Steps" htmlFor="t_checklist" hint="One per line.">
              <Textarea id="t_checklist" name="checklist" rows={2} />
            </Field>
            <div>
              <SubmitButton pendingLabel="Assigning…">Assign task</SubmitButton>
            </div>
          </form>
        </Disclosure>
      </Section>

      {unassigned.length > 0 && (
        <Section title="Unassigned">
          <List>
            {unassigned.map((t) => (
              <TaskRow key={t.id} task={t} options={w.options} checklist={[]} />
            ))}
          </List>
        </Section>
      )}

      {byMember.length === 0 && unassigned.length === 0 ? (
        <Section title="Open work">
          <Empty message="No open tasks across the team" hint="Assign one above." />
        </Section>
      ) : (
        byMember.map((g) => (
          <Section
            key={g.member.id}
            title={g.member.name}
            description={`${g.tasks.length} open · ${g.member.designation ?? ROLE_LABELS[asMemberRole(g.member.role)]}`}
          >
            <List>
              {g.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  options={w.options}
                  checklist={[]}
                  assigneeName={nameOf.get(t.assignee_id ?? "")}
                />
              ))}
            </List>
          </Section>
        ))
      )}
    </>
  );
}

/* ── Approvals ────────────────────────────────────────────────────────────── */

function DecisionForm({
  id,
  action,
  approveValue,
  approveLabel,
}: {
  id: string;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  approveValue: string;
  approveLabel: string;
}) {
  const [state, run] = useActionState(action, initial);
  return (
    <div className="mt-2">
      <FormError error={state?.error} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={run} className="contents">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="decision" value={approveValue} />
          <RowAction variant="secondary" title={approveLabel}>
            <Check className="size-3.5" /> {approveLabel}
          </RowAction>
        </form>
        <form action={run} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="decision" value="rejected" />
          <Input
            name="note"
            placeholder="Reason (required to reject)"
            className="h-8 min-w-48 flex-1 text-[13px]"
          />
          <RowAction variant="danger" title="Reject">
            <X className="size-3.5" /> Reject
          </RowAction>
        </form>
      </div>
    </div>
  );
}

export function ApprovalsPanel({
  team,
  options,
  members,
}: {
  team: TeamWorkspace;
  options: WorkspaceOption[];
  members: Member[];
}) {
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  return (
    <>
      <TileGrid>
        <StatTile
          label="Leave requests"
          value={team.pendingLeave.length}
          tone={team.pendingLeave.length > 0 ? "amber" : "neutral"}
        />
        <StatTile
          label="Expense claims"
          value={team.pendingExpenses.length}
          tone={team.pendingExpenses.length > 0 ? "amber" : "neutral"}
        />
        <StatTile
          label="Claim value pending"
          value={inr(team.expenseSummary.submitted)}
        />
        <StatTile
          label="Approved, unpaid"
          value={inr(team.expenseSummary.payable)}
          hint="Owed back to your team"
        />
      </TileGrid>

      <Section
        title="Leave requests"
        description="A rejection needs a reason — the same rule the approval engine applies everywhere."
      >
        {team.pendingLeave.length === 0 ? (
          <Empty message="No leave awaiting you" />
        ) : (
          <List>
            {team.pendingLeave.map((l) => (
              <Row
                key={l.id}
                title={nameOf.get(l.member_id) ?? "Member"}
                chips={<Chip tone="amber" label="Pending" />}
                meta={`${optionLabel(options, "leave_type", l.leave_type)} · ${fmtDate(
                  l.from_date,
                )} → ${fmtDate(l.to_date)} · ${l.days} day${l.days === 1 ? "" : "s"}${
                  l.reason ? ` · ${l.reason}` : ""
                }`}
              >
                <DecisionForm
                  id={l.id}
                  action={decideLeaveAction}
                  approveValue="approved"
                  approveLabel="Approve"
                />
              </Row>
            ))}
          </List>
        )}
      </Section>

      <Section title="Expense claims">
        {team.pendingExpenses.length === 0 ? (
          <Empty message="No claims awaiting you" />
        ) : (
          <List>
            {team.pendingExpenses.map((e) => (
              <Row
                key={e.id}
                title={
                  <span className="inline-flex items-center gap-2">
                    <Wallet className="size-3.5 text-[var(--color-ink-secondary)]" />
                    {nameOf.get(e.member_id) ?? "Member"} · {inr(e.amount)}
                  </span>
                }
                chips={<Chip tone="amber" label="Submitted" />}
                meta={[
                  optionLabel(options, "expense_category", e.category),
                  fmtDate(e.spent_on),
                  e.project_label,
                  e.remark,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <DecisionForm
                  id={e.id}
                  action={decideExpenseAction}
                  approveValue="approved"
                  approveLabel="Approve"
                />
              </Row>
            ))}
          </List>
        )}
      </Section>

      {team.expenseSummary.payable > 0 && (
        <Section
          title="Approved, awaiting payout"
          description="Mark a claim reimbursed once the money has actually moved."
        >
          <List>
            <Row
              title={`${inr(team.expenseSummary.payable)} owed across the team`}
              meta="Open a member's claim from the Team tab to settle it."
              chips={<Chip tone="green" label="Approved" />}
            />
          </List>
        </Section>
      )}
    </>
  );
}

/* ── Setup: the customizable lists + who is who ───────────────────────────── */

function OptionList({ kind, options }: { kind: OptionKind; options: WorkspaceOption[] }) {
  const [state, action] = useActionState(upsertOptionAction, initial);
  const rows = options.filter((o) => o.kind === kind);

  return (
    <Section
      title={OPTION_KIND_LABELS[kind]}
      description="Rename, retire or add your own — these drive the dropdowns everywhere."
    >
      <List>
        {rows.length === 0 && <Row title="Nothing configured yet" />}
        {rows.map((o) => (
          <Row
            key={o.id}
            title={o.label}
            meta={`code: ${o.value}${o.is_system ? " · default" : ""}`}
            chips={
              !o.is_active ? <Chip tone="neutral" label="Retired" /> : undefined
            }
            right={
              o.is_active ? (
                <form action={retireOptionAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <RowAction variant="danger" title="Retire this option">
                    Retire
                  </RowAction>
                </form>
              ) : undefined
            }
          />
        ))}
      </List>

      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="kind" value={kind} />
        <FormError error={state?.error} />
        <div className="min-w-52 flex-1">
          <Input name="label" placeholder={`Add to ${OPTION_KIND_LABELS[kind].toLowerCase()}`} />
        </div>
        <Select name="tone" defaultValue="neutral" className="h-10 w-36">
          <option value="neutral">Neutral</option>
          <option value="green">Green</option>
          <option value="amber">Amber</option>
          <option value="red">Alert</option>
        </Select>
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add
        </SubmitButton>
      </form>
    </Section>
  );
}

function MemberRow({ member }: { member: Member }) {
  const [state, action] = useActionState(updateMemberAction, initial);
  return (
    <Row
      title={member.name}
      meta={member.designation ?? ROLE_LABELS[asMemberRole(member.role)]}
      chips={<Chip tone="neutral" label={ROLE_LABELS[asMemberRole(member.role)]} />}
    >
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={member.id} />
        <FormError error={state?.error} />
        <Input
          name="display_name"
          defaultValue={member.display_name ?? member.name}
          className="h-8 min-w-40 flex-1 text-[13px]"
          aria-label="Display name"
        />
        <Input
          name="designation"
          defaultValue={member.designation ?? ""}
          placeholder="Designation"
          className="h-8 min-w-40 flex-1 text-[13px]"
          aria-label="Designation"
        />
        <Select
          name="role"
          defaultValue={asMemberRole(member.role)}
          className="h-8 w-32 text-[13px]"
          aria-label="Role"
        >
          {MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <RowAction variant="secondary">Save</RowAction>
      </form>
    </Row>
  );
}

export function SetupPanel({
  options,
  members,
  canConfigure,
}: {
  options: WorkspaceOption[];
  members: Member[];
  canConfigure: boolean;
}) {
  return (
    <>
      <Section
        title="People"
        description="Names, designations and what each person is allowed to see."
      >
        <List>
          {members.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </List>
      </Section>

      {!canConfigure ? (
        <Section title="Workspace lists">
          <Empty
            message="Owner access required"
            hint="Ask an owner or admin to change the task, expense, leave and visit lists."
          />
        </Section>
      ) : (
        OPTION_KINDS.map((kind) => (
          <OptionList key={kind} kind={kind} options={options} />
        ))
      )}
    </>
  );
}

export const alertIcon = CircleAlert;
