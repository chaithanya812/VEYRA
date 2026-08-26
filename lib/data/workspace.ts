import "server-only";
import { withOrg } from "./with-org";
import { getActingContext, listMembers, type Member } from "./team";
import { myOpenFollowUps, type FollowUpWithContext } from "./followups";
import {
  DEFAULT_WORKSPACE_OPTIONS,
  buildScorecard,
  expenseSummary,
  leaveBalance,
  leaveDays,
  openSession,
  sessionsOnDay,
  startOfWeek,
  taskCounts,
  totalHours,
  type ExpenseClaim,
  type ExpenseStatus,
  type FieldVisit,
  type LeaveRequest,
  type MemberScorecard,
  type OptionKind,
  type Task,
  type TaskStatus,
  type WorkSession,
  type WorkspaceOption,
} from "@/lib/workspace-model";

/**
 * Workspace data module — the single source for BOTH dashboards.
 *
 * The employee view and the manager view call the same readers with a
 * different scope (one member vs the whole org) and run the same pure engines
 * from lib/workspace-model, so the two screens can never disagree about a
 * number. Every access goes through withOrg(); nothing here touches a table
 * directly.
 */

/* ── Tenant-editable options ──────────────────────────────────────────────── */

/**
 * Seed the tenant's option vocabulary once, on first read. Mirrors
 * ensureDefaultStages() in pipeline.ts: the defaults are rows the tenant owns
 * and can rename, not constants the UI hardcodes. Idempotent — a tenant that
 * deactivated a default does not get it resurrected, because we only insert
 * when the (kind, value) is absent entirely.
 */
export async function ensureDefaultOptions(): Promise<void> {
  const { db } = await withOrg();
  const { data } = await db.table("workspace_options").select("kind, value");
  const have = new Set(
    ((data ?? []) as unknown as { kind: string; value: string }[]).map(
      (r) => `${r.kind}:${r.value}`,
    ),
  );
  const missing = DEFAULT_WORKSPACE_OPTIONS.filter(
    (o) => !have.has(`${o.kind}:${o.value}`),
  );
  if (missing.length === 0) return;
  await db.table("workspace_options").insert(
    missing.map((o) => ({
      kind: o.kind,
      value: o.value,
      label: o.label,
      seq: o.seq,
      tone: o.tone,
      is_system: true,
    })),
  );
}

export async function listOptions(kind?: OptionKind): Promise<WorkspaceOption[]> {
  const { db } = await withOrg();
  let q = db.table("workspace_options").select("*");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q.order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as WorkspaceOption[];
}

/** Add a tenant-defined option, or rename/re-tone an existing one. */
export async function upsertOption(input: {
  id?: string;
  kind: OptionKind;
  value: string;
  label: string;
  tone?: string;
  seq?: number;
  is_active?: boolean;
}): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const label = input.label.trim();
  if (!label) return { error: "A label is required." };

  if (input.id) {
    const { error } = await db.table("workspace_options").updateById(input.id, {
      label,
      tone: input.tone ?? "neutral",
      ...(input.seq !== undefined ? { seq: input.seq } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    });
    return error ? { error: error.message } : {};
  }

  const value = input.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!value) return { error: "Could not derive a code from that label." };

  const existing = await listOptions(input.kind);
  if (existing.some((o) => o.value === value)) {
    return { error: `"${label}" already exists in this list.` };
  }

  const { error } = await db.table("workspace_options").insert({
    kind: input.kind,
    value,
    label,
    tone: input.tone ?? "neutral",
    seq: input.seq ?? existing.length,
    is_system: false,
  });
  return error ? { error: error.message } : {};
}

/**
 * Retire an option. System defaults are deactivated rather than deleted so
 * rows already stored against the slug keep resolving to a label.
 */
export async function retireOption(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data } = await db
    .table("workspace_options")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Option not found." };
  const row = data as unknown as { is_system: boolean };

  const { error } = row.is_system
    ? await db.table("workspace_options").updateById(id, { is_active: false })
    : await db.table("workspace_options").deleteById(id);
  return error ? { error: error.message } : {};
}

/* ── Tasks ────────────────────────────────────────────────────────────────── */

export async function listTasks(filter?: {
  assigneeId?: string;
  status?: TaskStatus;
  projectId?: string;
  leadId?: string;
}): Promise<Task[]> {
  const { db } = await withOrg();
  let q = db.table("tasks").select("*");
  if (filter?.assigneeId) q = q.eq("assignee_id", filter.assigneeId);
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.projectId) q = q.eq("project_id", filter.projectId);
  if (filter?.leadId) q = q.eq("lead_id", filter.leadId);
  const { data, error } = await q.order("due_at", {
    ascending: true,
    nullsFirst: false,
  });
  if (error) throw error;
  return (data ?? []) as unknown as Task[];
}

export interface TaskInput {
  title: string;
  description?: string | null;
  task_type?: string;
  priority?: string;
  due_at?: string | null;
  assignee_id?: string | null;
  project_id?: string | null;
  lead_id?: string | null;
  checklist?: string[];
}

/**
 * Create a task. An employee creating one for themselves and a manager
 * assigning one down the org take the same path — the only difference is
 * whether `assignee_id` is someone else, which the caller decides.
 */
export async function createTask(input: TaskInput): Promise<{ error?: string; id?: string }> {
  const title = input.title.trim();
  if (!title) return { error: "Give the task a title." };

  const { db } = await withOrg();
  const acting = await getActingContext();

  // An assignee must be a real member of this org.
  let assignee = input.assignee_id ?? acting.member.id;
  if (assignee) {
    const members = await listMembers();
    if (!members.some((m) => m.id === assignee)) {
      return { error: "That assignee is not a member of this workspace." };
    }
  } else {
    assignee = acting.member.id;
  }

  const { data, error } = await db.table("tasks").insert({
    title,
    description: input.description?.trim() || null,
    task_type: input.task_type || "task",
    priority: input.priority || "medium",
    status: "created" satisfies TaskStatus,
    due_at: input.due_at || null,
    assignee_id: assignee,
    created_by: acting.member.id,
    project_id: input.project_id || null,
    lead_id: input.lead_id || null,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string } | undefined)?.id;
  const steps = (input.checklist ?? []).map((s) => s.trim()).filter(Boolean);
  if (id && steps.length > 0) {
    await db.table("task_checklist").insert(
      steps.map((label, i) => ({ task_id: id, label, seq: i })),
    );
  }
  return { id };
}

export async function updateTask(
  id: string,
  patch: Partial<TaskInput>,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { error: "Give the task a title." };
    next.title = t;
  }
  if (patch.description !== undefined) next.description = patch.description?.trim() || null;
  if (patch.task_type !== undefined) next.task_type = patch.task_type;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.due_at !== undefined) next.due_at = patch.due_at || null;
  if (patch.project_id !== undefined) next.project_id = patch.project_id || null;
  if (patch.lead_id !== undefined) next.lead_id = patch.lead_id || null;
  if (patch.assignee_id !== undefined) {
    if (patch.assignee_id) {
      const members = await listMembers();
      if (!members.some((m) => m.id === patch.assignee_id)) {
        return { error: "That assignee is not a member of this workspace." };
      }
    }
    next.assignee_id = patch.assignee_id || null;
  }
  const { error } = await db.table("tasks").updateById(id, next);
  return error ? { error: error.message } : {};
}

/** Move a task through its lifecycle; `completed_at` is stamped, never typed. */
export async function setTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("tasks").updateById(id, {
    status,
    completed_at: status === "done" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

export async function deleteTask(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("tasks").deleteById(id);
  return error ? { error: error.message } : {};
}

export async function toggleChecklistItem(
  id: string,
  done: boolean,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("task_checklist").updateById(id, { done });
  return error ? { error: error.message } : {};
}

export async function listChecklist(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  const { db } = await withOrg();
  const { data, error } = await db
    .table("task_checklist")
    .select("*")
    .in("task_id", taskIds)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string;
    task_id: string;
    label: string;
    done: boolean;
    seq: number;
  }[];
}

/* ── Attendance ───────────────────────────────────────────────────────────── */

export async function listSessions(filter?: {
  memberId?: string;
  since?: Date;
}): Promise<WorkSession[]> {
  const { db } = await withOrg();
  let q = db.table("work_sessions").select("*");
  if (filter?.memberId) q = q.eq("member_id", filter.memberId);
  if (filter?.since) q = q.gte("check_in", filter.since.toISOString());
  const { data, error } = await q.order("check_in", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as WorkSession[];
}

/**
 * Check in. A partial unique index enforces one open session per member at the
 * database level, so a double-tap cannot create two; we check first to return a
 * readable message instead of a constraint error.
 */
export async function checkIn(input?: {
  lat?: number | null;
  lng?: number | null;
  location_label?: string | null;
  note?: string | null;
}): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const memberId = (await getActingContext()).member.id;

  const mine = await listSessions({ memberId });
  if (openSession(mine)) return { error: "You are already checked in." };

  const { error } = await db.table("work_sessions").insert({
    member_id: memberId,
    check_in: new Date().toISOString(),
    lat: input?.lat ?? null,
    lng: input?.lng ?? null,
    location_label: input?.location_label?.trim() || null,
    note: input?.note?.trim() || null,
  });
  return error ? { error: error.message } : {};
}

export async function checkOut(): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const memberId = (await getActingContext()).member.id;

  const mine = await listSessions({ memberId });
  const open = openSession(mine);
  if (!open) return { error: "You are not checked in." };

  const { error } = await db
    .table("work_sessions")
    .updateById(open.id, { check_out: new Date().toISOString() });
  return error ? { error: error.message } : {};
}

/* ── Leave ────────────────────────────────────────────────────────────────── */

export async function listLeave(filter?: {
  memberId?: string;
  status?: string;
}): Promise<LeaveRequest[]> {
  const { db } = await withOrg();
  let q = db.table("leave_requests").select("*");
  if (filter?.memberId) q = q.eq("member_id", filter.memberId);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("from_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LeaveRequest[];
}

export async function requestLeave(input: {
  leave_type: string;
  from_date: string;
  to_date: string;
  reason?: string | null;
}): Promise<{ error?: string }> {
  const days = leaveDays(input.from_date, input.to_date);
  if (days <= 0) return { error: "The end date must be on or after the start date." };

  const { db } = await withOrg();
  const { error } = await db.table("leave_requests").insert({
    member_id: (await getActingContext()).member.id,
    leave_type: input.leave_type || "casual",
    from_date: input.from_date,
    to_date: input.to_date,
    days,
    reason: input.reason?.trim() || null,
    status: "pending",
  });
  return error ? { error: error.message } : {};
}

/**
 * Approve or reject leave. Manager-only, and a rejection must carry a reason —
 * the same discipline the approval engine applies (PROC-APP-001).
 */
export async function decideLeave(
  id: string,
  decision: "approved" | "rejected",
  note?: string | null,
): Promise<{ error?: string }> {
  const acting = await getActingContext();
  if (!acting.isManager) return { error: "Only a manager can decide leave requests." };
  if (decision === "rejected" && !note?.trim()) {
    return { error: "Add a reason when rejecting a leave request." };
  }

  const { db } = await withOrg();
  const { error } = await db.table("leave_requests").updateById(id, {
    status: decision,
    decided_by: acting.member.id,
    decided_at: new Date().toISOString(),
    decision_note: note?.trim() || null,
  });
  return error ? { error: error.message } : {};
}

/** Withdraw one's own pending request. */
export async function cancelLeave(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const memberId = (await getActingContext()).member.id;
  const { data } = await db
    .table("leave_requests")
    .select("member_id, status")
    .eq("id", id)
    .maybeSingle();
  const row = data as unknown as { member_id: string; status: string } | null;
  if (!row) return { error: "Leave request not found." };
  if (row.member_id !== memberId) return { error: "That is not your leave request." };
  if (row.status !== "pending") return { error: "Only a pending request can be withdrawn." };

  const { error } = await db.table("leave_requests").updateById(id, { status: "cancelled" });
  return error ? { error: error.message } : {};
}

/* ── Expenses ─────────────────────────────────────────────────────────────── */

export async function listExpenses(filter?: {
  memberId?: string;
  status?: ExpenseStatus;
}): Promise<ExpenseClaim[]> {
  const { db } = await withOrg();
  let q = db.table("expense_claims").select("*");
  if (filter?.memberId) q = q.eq("member_id", filter.memberId);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("spent_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ExpenseClaim[];
}

export async function submitExpense(input: {
  spent_on: string;
  amount: number;
  category: string;
  project_id?: string | null;
  project_label?: string | null;
  remark?: string | null;
  receipt_url?: string | null;
}): Promise<{ error?: string }> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter the amount you spent." };
  }

  const { db } = await withOrg();
  const { error } = await db.table("expense_claims").insert({
    member_id: (await getActingContext()).member.id,
    project_id: input.project_id || null,
    project_label: input.project_label?.trim() || null,
    spent_on: input.spent_on,
    amount,
    category: input.category || "other",
    remark: input.remark?.trim() || null,
    receipt_url: input.receipt_url?.trim() || null,
    status: "submitted",
  });
  return error ? { error: error.message } : {};
}

export async function decideExpense(
  id: string,
  decision: Exclude<ExpenseStatus, "submitted">,
  note?: string | null,
): Promise<{ error?: string }> {
  const acting = await getActingContext();
  if (!acting.isManager) return { error: "Only a manager can decide expense claims." };
  if (decision === "rejected" && !note?.trim()) {
    return { error: "Add a reason when rejecting a claim." };
  }

  const { db } = await withOrg();
  const { error } = await db.table("expense_claims").updateById(id, {
    status: decision,
    decided_by: acting.member.id,
    decided_at: new Date().toISOString(),
    decision_note: note?.trim() || null,
  });
  return error ? { error: error.message } : {};
}

/* ── Field visits ─────────────────────────────────────────────────────────── */

export async function listVisits(filter?: {
  memberId?: string;
  status?: string;
}): Promise<FieldVisit[]> {
  const { db } = await withOrg();
  let q = db.table("field_visits").select("*");
  if (filter?.memberId) q = q.eq("member_id", filter.memberId);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FieldVisit[];
}

export async function startVisit(input: {
  purpose: string;
  title?: string | null;
  project_id?: string | null;
  lead_id?: string | null;
  location_label?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("field_visits").insert({
    member_id: (await getActingContext()).member.id,
    purpose: input.purpose || "site_visit",
    title: input.title?.trim() || null,
    project_id: input.project_id || null,
    lead_id: input.lead_id || null,
    location_label: input.location_label?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    started_at: new Date().toISOString(),
    status: "in_progress",
  });
  return error ? { error: error.message } : {};
}

export async function endVisit(
  id: string,
  notes?: string | null,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("field_visits").updateById(id, {
    ended_at: new Date().toISOString(),
    status: "completed",
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  });
  return error ? { error: error.message } : {};
}

/* ── Aggregate loaders (one per dashboard) ────────────────────────────────── */

export interface MyWorkspace {
  member: Member;
  isManager: boolean;
  impersonating: boolean;
  options: WorkspaceOption[];
  members: Member[];
  tasks: Task[];
  taskCounts: ReturnType<typeof taskCounts>;
  checklist: Awaited<ReturnType<typeof listChecklist>>;
  sessions: WorkSession[];
  openSession: WorkSession | null;
  hoursToday: number;
  hoursThisWeek: number;
  leave: LeaveRequest[];
  leaveBalance: ReturnType<typeof leaveBalance>;
  expenses: ExpenseClaim[];
  expenseSummary: ReturnType<typeof expenseSummary>;
  visits: FieldVisit[];
  /**
   * Callbacks and meetings assigned to this member that are still open. These
   * are PROJECTED from follow_ups rather than copied into `tasks` — one
   * commitment, one row, shown in both places.
   */
  followUps: FollowUpWithContext[];
}

/** Default annual leave allowance until a tenant HR-policy layer exists. */
export const DEFAULT_LEAVE_ALLOWANCE = 18;

/** Everything the acting member's own workspace needs, in one pass. */
export async function getMyWorkspace(): Promise<MyWorkspace> {
  await ensureDefaultOptions();
  const acting = await getActingContext();
  const memberId = acting.member.id;
  const weekStart = startOfWeek();

  const [options, members, tasks, sessions, leave, expenses, visits, followUps] =
    await Promise.all([
      listOptions(),
      listMembers(),
      listTasks({ assigneeId: memberId }),
      listSessions({ memberId }),
      listLeave({ memberId }),
      listExpenses({ memberId }),
      listVisits({ memberId }),
      myOpenFollowUps(),
    ]);

  const checklist = await listChecklist(tasks.map((t) => t.id));
  const now = new Date();
  const weekSessions = sessions.filter((s) => new Date(s.check_in) >= weekStart);

  return {
    member: acting.member,
    isManager: acting.isManager,
    impersonating: acting.impersonating,
    options,
    members,
    tasks,
    taskCounts: taskCounts(tasks, now),
    checklist,
    sessions,
    openSession: openSession(sessions),
    hoursToday: totalHours(sessionsOnDay(sessions, now), now),
    hoursThisWeek: totalHours(weekSessions, now),
    leave,
    leaveBalance: leaveBalance(leave, DEFAULT_LEAVE_ALLOWANCE),
    expenses,
    expenseSummary: expenseSummary(expenses),
    visits,
    followUps,
  };
}

export interface TeamWorkspace {
  scorecards: MemberScorecard[];
  tasks: Task[];
  taskCounts: ReturnType<typeof taskCounts>;
  pendingLeave: LeaveRequest[];
  pendingExpenses: ExpenseClaim[];
  expenseSummary: ReturnType<typeof expenseSummary>;
  activeVisits: FieldVisit[];
  checkedInCount: number;
  headcount: number;
}

/**
 * The manager/owner view: the same engines run across every member instead of
 * one. Deliberately org-wide rather than filtered to direct reports — an owner
 * needs the whole picture, and reporting lines are configured but not yet
 * enforced as a data scope (see the permissions gap in the coverage report).
 */
export async function getTeamWorkspace(): Promise<TeamWorkspace> {
  await ensureDefaultOptions();
  const weekStart = startOfWeek();

  const [members, tasks, sessions, leave, expenses, visits] = await Promise.all([
    listMembers(),
    listTasks(),
    listSessions({ since: weekStart }),
    listLeave(),
    listExpenses(),
    listVisits(),
  ]);

  const now = new Date();
  const scorecards = members.map((m) =>
    buildScorecard(m, tasks, sessions, expenses, leave, now),
  );

  return {
    scorecards,
    tasks,
    taskCounts: taskCounts(tasks, now),
    pendingLeave: leave.filter((l) => l.status === "pending"),
    pendingExpenses: expenses.filter((e) => e.status === "submitted"),
    expenseSummary: expenseSummary(expenses),
    activeVisits: visits.filter((v) => v.status === "in_progress"),
    checkedInCount: scorecards.filter((s) => s.checkedIn).length,
    headcount: members.length,
  };
}
