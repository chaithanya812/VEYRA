/**
 * Client-safe workspace model — types, the fixed lifecycle vocabularies, the
 * tenant-editable option defaults, and the pure engines behind both the
 * employee workspace and the manager/owner command view.
 *
 * No `server-only` import: the client panels and the server data module share
 * exactly this validation and arithmetic. No DB access here.
 *
 * HARD RULE 2 — every number on either dashboard is computed here from stored
 * rows (hours from check-in/check-out pairs, balances from claim sums, scores
 * from task counts). Nothing is invented and no LLM is involved.
 *
 * Two vocabularies, deliberately separated:
 *  • FIXED (in code)  — the lifecycle states the engine reasons about:
 *    task status, leave/expense approval status, visit status. Renaming these
 *    would change behaviour, so a tenant cannot.
 *  • CONFIG (in the DB) — task types, priorities, expense categories, leave
 *    types, visit purposes. Seeded with sane defaults; the tenant renames,
 *    re-orders, deactivates or adds. See `DEFAULT_WORKSPACE_OPTIONS`.
 */

/* ── Roles ────────────────────────────────────────────────────────────────── */

/**
 * Four tiers, most-privileged first. `admin` is the platform operator (us),
 * `owner` is the founder of the tenant, `manager` leads a team, `member` is an
 * individual contributor. Ranked so a check is a comparison, not a list.
 */
export const MEMBER_ROLES = ["admin", "owner", "manager", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  owner: "Owner",
  manager: "Manager",
  member: "Staff",
};

/** Longer descriptions, used by the "View as" picker and the settings screen. */
export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  admin: "Platform operator — sees and configures everything.",
  owner: "Founder of this workspace — full business visibility.",
  manager: "Leads a team — assigns work, approves leave and expenses.",
  member: "Individual contributor — their own work, their own numbers.",
};

/** Lower rank = more privilege. Unknown roles fall back to the least. */
export function roleRank(role: string | null | undefined): number {
  const i = (MEMBER_ROLES as readonly string[]).indexOf(String(role ?? ""));
  return i === -1 ? MEMBER_ROLES.length - 1 : i;
}

/** Can this role see the team view — assign tasks, approve leave/expenses? */
export function canManageTeam(role: string | null | undefined): boolean {
  return roleRank(role) <= roleRank("manager");
}

/** Can this role reach tenant-wide configuration (the owner/admin tier)? */
export function canConfigureOrg(role: string | null | undefined): boolean {
  return roleRank(role) <= roleRank("owner");
}

/** Normalise any stored role string to a known tier (unknown → staff). */
export function asMemberRole(role: string | null | undefined): MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(String(role ?? ""))
    ? (role as MemberRole)
    : "member";
}

/**
 * Group people by role tier, most-privileged first, for the "View as" picker:
 * Admin · Owner · Manager · Staff ▸ (named profiles). Empty tiers are dropped
 * so the picker never shows a heading with nothing under it.
 */
export function groupByRole<T extends { role: string }>(
  people: T[],
): { role: MemberRole; label: string; people: T[] }[] {
  return MEMBER_ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    people: people.filter((p) => asMemberRole(p.role) === role),
  })).filter((g) => g.people.length > 0);
}

/* ── Fixed lifecycle states ───────────────────────────────────────────────── */

export const TASK_STATUSES = [
  "created",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  created: "Created",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

/** Status → chip tone. Red is reserved for genuine alerts, never a normal state. */
export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  created: "neutral",
  in_progress: "amber",
  blocked: "amber",
  done: "green",
  cancelled: "neutral",
};

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const EXPENSE_STATUSES = [
  "submitted",
  "approved",
  "rejected",
  "reimbursed",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const VISIT_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export type Tone = "neutral" | "green" | "amber" | "red";

/** A task is finished (for counting purposes) when done or cancelled. */
export function isClosedTask(status: string): boolean {
  return status === "done" || status === "cancelled";
}

/* ── Tenant-editable option vocabulary ────────────────────────────────────── */

export const OPTION_KINDS = [
  "task_type",
  "task_priority",
  "expense_category",
  "leave_type",
  "visit_purpose",
  "lead_source",
  "budget_band",
  "lead_scope",
  "project_type",
  "contact_role",
  "followup_outcome",
  // The trade vocabulary (frame `105659`). ONE list, used by vendor contract
  // categories (§9.3) and labour attendance (§9.6) — a tenant renames a trade
  // once, not twice.
  "labour_category",
] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

export const OPTION_KIND_LABELS: Record<OptionKind, string> = {
  task_type: "Task types",
  task_priority: "Task priorities",
  expense_category: "Expense categories",
  leave_type: "Leave types",
  visit_purpose: "Visit purposes",
  lead_source: "Lead sources",
  budget_band: "Budget bands",
  lead_scope: "Scope of work",
  project_type: "Property types",
  contact_role: "Contact roles",
  followup_outcome: "Follow-up outcomes",
  labour_category: "Trades & labour categories",
};

export interface WorkspaceOption {
  id: string;
  kind: OptionKind;
  value: string;
  label: string;
  seq: number;
  tone: Tone;
  is_active: boolean;
  is_system: boolean;
}

/** A seed row: what a brand-new tenant gets before they customise anything. */
export type OptionSeed = Pick<
  WorkspaceOption,
  "kind" | "value" | "label" | "seq" | "tone"
>;

/**
 * Defaults, drawn from what an Indian interior/construction firm actually
 * tracks. Seeded as `is_system` so a tenant can rename or deactivate them but
 * the slug keeps resolving for rows already stored against it.
 */
export const DEFAULT_WORKSPACE_OPTIONS: OptionSeed[] = [
  // Task types
  { kind: "task_type", value: "task", label: "Task", seq: 0, tone: "neutral" },
  { kind: "task_type", value: "project_task", label: "Project task", seq: 1, tone: "neutral" },
  { kind: "task_type", value: "adhoc", label: "Adhoc task", seq: 2, tone: "neutral" },
  { kind: "task_type", value: "site_measurement", label: "Site measurement", seq: 3, tone: "neutral" },
  { kind: "task_type", value: "client_meeting", label: "Client meeting", seq: 4, tone: "neutral" },
  { kind: "task_type", value: "approval", label: "Approval", seq: 5, tone: "neutral" },

  // Task priorities — amber for high, red only for the genuine "drop everything"
  { kind: "task_priority", value: "low", label: "Low", seq: 0, tone: "neutral" },
  { kind: "task_priority", value: "medium", label: "Medium", seq: 1, tone: "neutral" },
  { kind: "task_priority", value: "high", label: "High", seq: 2, tone: "amber" },
  { kind: "task_priority", value: "urgent", label: "Urgent", seq: 3, tone: "red" },

  // Expense categories
  { kind: "expense_category", value: "materials", label: "Materials & hardware", seq: 0, tone: "neutral" },
  { kind: "expense_category", value: "transport", label: "Local transport", seq: 1, tone: "neutral" },
  { kind: "expense_category", value: "labour", label: "Labour payment", seq: 2, tone: "neutral" },
  { kind: "expense_category", value: "site_refreshments", label: "Site tea & snacks", seq: 3, tone: "neutral" },
  { kind: "expense_category", value: "electrical", label: "Electrical works", seq: 4, tone: "neutral" },
  { kind: "expense_category", value: "other", label: "Other", seq: 5, tone: "neutral" },

  // Leave types
  { kind: "leave_type", value: "casual", label: "Casual leave", seq: 0, tone: "neutral" },
  { kind: "leave_type", value: "sick", label: "Sick leave", seq: 1, tone: "neutral" },
  { kind: "leave_type", value: "earned", label: "Earned leave", seq: 2, tone: "neutral" },
  { kind: "leave_type", value: "wfh", label: "Work from home", seq: 3, tone: "neutral" },
  { kind: "leave_type", value: "unpaid", label: "Unpaid leave", seq: 4, tone: "neutral" },

  // Visit purposes
  { kind: "visit_purpose", value: "site_visit", label: "Site visit", seq: 0, tone: "neutral" },
  { kind: "visit_purpose", value: "measurement", label: "Measurement", seq: 1, tone: "neutral" },
  { kind: "visit_purpose", value: "client_meeting", label: "Client meeting", seq: 2, tone: "neutral" },
  { kind: "visit_purpose", value: "vendor_visit", label: "Vendor visit", seq: 3, tone: "neutral" },
  { kind: "visit_purpose", value: "installation", label: "Installation", seq: 4, tone: "neutral" },

  // Lead sources — where the enquiry came from (an attribute, not a silo)
  { kind: "lead_source", value: "walk_in", label: "Walk-in", seq: 0, tone: "neutral" },
  { kind: "lead_source", value: "referral", label: "Referral", seq: 1, tone: "neutral" },
  { kind: "lead_source", value: "website", label: "Website", seq: 2, tone: "neutral" },
  { kind: "lead_source", value: "whatsapp", label: "WhatsApp", seq: 3, tone: "neutral" },
  { kind: "lead_source", value: "call", label: "Inbound call", seq: 4, tone: "neutral" },
  { kind: "lead_source", value: "meta_ads", label: "Meta ads", seq: 5, tone: "neutral" },
  { kind: "lead_source", value: "google_ads", label: "Google ads", seq: 6, tone: "neutral" },
  { kind: "lead_source", value: "architect", label: "Architect / builder", seq: 7, tone: "neutral" },
  { kind: "lead_source", value: "manual", label: "Added manually", seq: 8, tone: "neutral" },

  // Budget bands — ranges, because a lead gives you a range, not a figure
  { kind: "budget_band", value: "under_5l", label: "Under 5 L", seq: 0, tone: "neutral" },
  { kind: "budget_band", value: "5_10l", label: "5-10 L", seq: 1, tone: "neutral" },
  { kind: "budget_band", value: "10_20l", label: "10-20 L", seq: 2, tone: "neutral" },
  { kind: "budget_band", value: "20_30l", label: "20-30 L", seq: 3, tone: "neutral" },
  { kind: "budget_band", value: "30_50l", label: "30-50 L", seq: 4, tone: "neutral" },
  { kind: "budget_band", value: "50l_1cr", label: "50 L - 1 Cr", seq: 5, tone: "neutral" },
  { kind: "budget_band", value: "above_1cr", label: "Above 1 Cr", seq: 6, tone: "neutral" },

  // Scope of work
  { kind: "lead_scope", value: "full_execution", label: "Full execution", seq: 0, tone: "neutral" },
  { kind: "lead_scope", value: "design_only", label: "Design only", seq: 1, tone: "neutral" },
  { kind: "lead_scope", value: "design_now_execution_later", label: "Design now, execution later", seq: 2, tone: "neutral" },
  { kind: "lead_scope", value: "modular_only", label: "Modular woodwork only", seq: 3, tone: "neutral" },
  { kind: "lead_scope", value: "civil_only", label: "Civil & finishes only", seq: 4, tone: "neutral" },
  { kind: "lead_scope", value: "remote_design", label: "Remote designing", seq: 5, tone: "neutral" },

  // Property types
  { kind: "project_type", value: "apartment", label: "Apartment", seq: 0, tone: "neutral" },
  { kind: "project_type", value: "villa", label: "Villa / independent house", seq: 1, tone: "neutral" },
  { kind: "project_type", value: "office", label: "Office", seq: 2, tone: "neutral" },
  { kind: "project_type", value: "retail", label: "Retail / showroom", seq: 3, tone: "neutral" },
  { kind: "project_type", value: "hospitality", label: "Hospitality", seq: 4, tone: "neutral" },

  // Who you are talking to
  { kind: "contact_role", value: "owner", label: "Owner", seq: 0, tone: "neutral" },
  { kind: "contact_role", value: "spouse", label: "Spouse / family", seq: 1, tone: "neutral" },
  { kind: "contact_role", value: "architect", label: "Architect", seq: 2, tone: "neutral" },
  { kind: "contact_role", value: "builder", label: "Builder", seq: 3, tone: "neutral" },
  { kind: "contact_role", value: "tenant", label: "Tenant", seq: 4, tone: "neutral" },

  // How a follow-up went
  { kind: "followup_outcome", value: "interested", label: "Interested", seq: 0, tone: "green" },
  { kind: "followup_outcome", value: "needs_time", label: "Needs time to decide", seq: 1, tone: "amber" },
  { kind: "followup_outcome", value: "reschedule", label: "Asked to reschedule", seq: 2, tone: "amber" },
  { kind: "followup_outcome", value: "not_reachable", label: "Not reachable", seq: 3, tone: "neutral" },
  { kind: "followup_outcome", value: "not_interested", label: "Not interested", seq: 4, tone: "neutral" },
  // Trades (frame `105659`) — shared by vendor contracts and labour.
  { kind: "labour_category", value: "carpentry_woodwork", label: "Carpentry Woodwork", seq: 0, tone: "neutral" },
  { kind: "labour_category", value: "false_ceiling_pop_work", label: "False Ceiling POP Work", seq: 1, tone: "neutral" },
  { kind: "labour_category", value: "civil_masonry_work", label: "Civil Masonry Work", seq: 2, tone: "neutral" },
  { kind: "labour_category", value: "electrical_work", label: "Electrical Work", seq: 3, tone: "neutral" },
  { kind: "labour_category", value: "plumbing_work", label: "Plumbing Work", seq: 4, tone: "neutral" },
  { kind: "labour_category", value: "ms_fabrication_works", label: "MS & Fabrication Works", seq: 5, tone: "neutral" },
  { kind: "labour_category", value: "marble_tile_works", label: "Marble & Tile Works", seq: 6, tone: "neutral" },
  { kind: "labour_category", value: "paint_works", label: "Paint Works", seq: 7, tone: "neutral" },
  { kind: "labour_category", value: "cleaning", label: "Cleaning", seq: 8, tone: "neutral" },

  { kind: "followup_outcome", value: "budget_mismatch", label: "Budget mismatch", seq: 5, tone: "neutral" },
];

/** Resolve a stored slug to its display label, falling back to the slug itself. */
export function optionLabel(
  options: WorkspaceOption[],
  kind: OptionKind,
  value: string,
): string {
  const hit = options.find((o) => o.kind === kind && o.value === value);
  return hit?.label ?? value;
}

/** Resolve a stored slug to its chip tone (defaults to neutral). */
export function optionTone(
  options: WorkspaceOption[],
  kind: OptionKind,
  value: string,
): Tone {
  const hit = options.find((o) => o.kind === kind && o.value === value);
  return hit?.tone ?? "neutral";
}

/* ── Row types (mirror migration 0023) ───────────────────────────────────── */

export interface Member {
  id: string;
  user_id: string;
  role: string;
  status: string;
  manager_id: string | null;
  display_name: string | null;
  designation: string | null;
  /** Resolved from app_users at read time; never stored on the membership. */
  name: string;
  email: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  status: TaskStatus;
  due_at: string | null;
  assignee_id: string | null;
  created_by: string | null;
  project_id: string | null;
  lead_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  label: string;
  done: boolean;
  seq: number;
}

export interface WorkSession {
  id: string;
  member_id: string;
  check_in: string;
  check_out: string | null;
  lat: number | null;
  lng: number | null;
  location_label: string | null;
  source: string;
  note: string | null;
}

export interface LeaveRequest {
  id: string;
  member_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface ExpenseClaim {
  id: string;
  member_id: string;
  project_id: string | null;
  project_label: string | null;
  spent_on: string;
  amount: number;
  category: string;
  remark: string | null;
  receipt_url: string | null;
  status: ExpenseStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface FieldVisit {
  id: string;
  member_id: string;
  purpose: string;
  project_id: string | null;
  lead_id: string | null;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  lat: number | null;
  lng: number | null;
  location_label: string | null;
  notes: string | null;
  status: VisitStatus;
  created_at: string;
}

/* ── Pure engines ─────────────────────────────────────────────────────────── */

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Hours in one attendance session. An open session (no check-out) is measured
 * up to `now`, which is what makes the live "hours today" figure move. A
 * check-out before the check-in yields 0 rather than a negative.
 */
export function sessionHours(session: WorkSession, now: Date = new Date()): number {
  const start = new Date(session.check_in).getTime();
  if (!Number.isFinite(start)) return 0;
  const endRaw = session.check_out ? new Date(session.check_out).getTime() : now.getTime();
  const end = Number.isFinite(endRaw) ? endRaw : now.getTime();
  return round2(Math.max(0, end - start) / 3_600_000);
}

/** Σ hours across sessions (open sessions measured to `now`). */
export function totalHours(sessions: WorkSession[], now: Date = new Date()): number {
  return round2(sessions.reduce((s, x) => s + sessionHours(x, now), 0));
}

/** The member's currently-open session, if they are checked in. */
export function openSession(sessions: WorkSession[]): WorkSession | null {
  return sessions.find((s) => !s.check_out) ?? null;
}

/** Sessions that started on the same local calendar day as `day`. */
export function sessionsOnDay(sessions: WorkSession[], day: Date): WorkSession[] {
  return sessions.filter((s) => {
    const d = new Date(s.check_in);
    return (
      d.getFullYear() === day.getFullYear() &&
      d.getMonth() === day.getMonth() &&
      d.getDate() === day.getDate()
    );
  });
}

export type TaskBucket = "overdue" | "today" | "upcoming" | "someday" | "closed";

/**
 * Which pile a task belongs in. Closed wins over everything (a finished task is
 * never "overdue"), then due-date position relative to the local day boundary.
 */
export function taskBucket(task: Task, now: Date = new Date()): TaskBucket {
  if (isClosedTask(task.status)) return "closed";
  if (!task.due_at) return "someday";
  const due = new Date(task.due_at);
  if (!Number.isFinite(due.getTime())) return "someday";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);

  if (due.getTime() < startOfToday.getTime()) return "overdue";
  if (due.getTime() < startOfTomorrow.getTime()) return "today";
  return "upcoming";
}

export interface TaskCounts {
  overdue: number;
  today: number;
  upcoming: number;
  someday: number;
  done: number;
  open: number;
  total: number;
}

/** Bucket counts over a task list. `open` excludes done AND cancelled. */
export function taskCounts(tasks: Task[], now: Date = new Date()): TaskCounts {
  const c: TaskCounts = {
    overdue: 0, today: 0, upcoming: 0, someday: 0, done: 0, open: 0, total: tasks.length,
  };
  for (const t of tasks) {
    const b = taskBucket(t, now);
    if (b === "closed") {
      if (t.status === "done") c.done++;
      continue;
    }
    c.open++;
    c[b]++;
  }
  return c;
}

/** Completion % over tasks that reached a terminal state or are still open. */
export function completionPct(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

export interface ExpenseSummary {
  submitted: number;
  approved: number;
  rejected: number;
  reimbursed: number;
  /** What the org still owes: approved but not yet reimbursed. */
  payable: number;
  count: number;
}

/** Σ claim amounts by status. `payable` is the number a finance lead acts on. */
export function expenseSummary(claims: ExpenseClaim[]): ExpenseSummary {
  const s: ExpenseSummary = {
    submitted: 0, approved: 0, rejected: 0, reimbursed: 0, payable: 0, count: claims.length,
  };
  for (const c of claims) {
    const amt = num(c.amount);
    if (c.status === "submitted") s.submitted += amt;
    else if (c.status === "approved") s.approved += amt;
    else if (c.status === "rejected") s.rejected += amt;
    else if (c.status === "reimbursed") s.reimbursed += amt;
  }
  s.payable = round2(s.approved);
  s.submitted = round2(s.submitted);
  s.approved = round2(s.approved);
  s.rejected = round2(s.rejected);
  s.reimbursed = round2(s.reimbursed);
  return s;
}

export interface LeaveBalance {
  allowance: number;
  taken: number;
  pending: number;
  remaining: number;
}

/**
 * Leave standing against an annual allowance. Approved days are "taken";
 * pending days are held but not deducted, so `remaining` is the honest
 * worst case (allowance − taken − pending) and never goes below zero.
 */
export function leaveBalance(
  requests: LeaveRequest[],
  allowance: number,
): LeaveBalance {
  let taken = 0;
  let pending = 0;
  for (const r of requests) {
    const d = num(r.days);
    if (r.status === "approved") taken += d;
    else if (r.status === "pending") pending += d;
  }
  return {
    allowance: round2(allowance),
    taken: round2(taken),
    pending: round2(pending),
    remaining: round2(Math.max(0, allowance - taken - pending)),
  };
}

/** Inclusive whole-day count between two ISO dates (same day = 1). */
export function leaveDays(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0;
  const days = Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

export interface MemberScorecard {
  memberId: string;
  name: string;
  role: string;
  designation: string | null;
  tasksTotal: number;
  tasksDone: number;
  tasksOverdue: number;
  completion: number;
  hoursThisWeek: number;
  checkedIn: boolean;
  expensePayable: number;
  leavePending: number;
}

/**
 * One row of the manager's team board, assembled from the same pure engines the
 * employee view uses — so the two dashboards can never disagree about a number.
 */
export function buildScorecard(
  member: Member,
  tasks: Task[],
  sessions: WorkSession[],
  claims: ExpenseClaim[],
  leave: LeaveRequest[],
  now: Date = new Date(),
): MemberScorecard {
  const mine = tasks.filter((t) => t.assignee_id === member.id);
  const counts = taskCounts(mine, now);
  return {
    memberId: member.id,
    name: member.name,
    role: member.role,
    designation: member.designation,
    tasksTotal: counts.total,
    tasksDone: counts.done,
    tasksOverdue: counts.overdue,
    completion: completionPct(mine),
    hoursThisWeek: totalHours(
      sessions.filter((s) => s.member_id === member.id),
      now,
    ),
    checkedIn: !!openSession(sessions.filter((s) => s.member_id === member.id)),
    expensePayable: expenseSummary(claims.filter((c) => c.member_id === member.id)).payable,
    leavePending: leave.filter(
      (l) => l.member_id === member.id && l.status === "pending",
    ).length,
  };
}

/** Local-midnight Monday of the week containing `now` (Indian work week). */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  return new Date(d.getTime() - dow * 86_400_000);
}
