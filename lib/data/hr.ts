import "server-only";
import { withOrg } from "./with-org";
import { getActingContext, listMembers } from "./team";
import {
  DEFAULT_LEAVE_ALLOWANCE,
  decideLeave,
  ensureDefaultOptions,
  listLeave,
  listOptions,
  listSessions,
  listVisits,
} from "./workspace";
import { leaveDays, type LeaveRequest, type WorkspaceOption } from "@/lib/workspace-model";
import {
  LEGACY_WFH_LEAVE_TYPE,
  approvalQueue,
  approvalReport,
  asMonthKey,
  attendanceRows,
  attendanceTotals,
  decisionError,
  fyWindowOf,
  holidayCalendar,
  leaveKindOf,
  leaveTiles,
  localDayOf,
  monthKeyOf,
  monthWindow,
  recentMonths,
  requestRows,
  todayStatus,
  visitRows,
  type ApprovalQueue,
  type AttendanceDay,
  type AttendanceTotals,
  type EmployeeReportRow,
  type Holiday,
  type HolidayRow,
  type LeaveTiles,
  type RequestRow,
  type TodayStatus,
  type VisitRow,
  type WfhRequest,
} from "@/lib/hr-model";

/**
 * HR data module — everything `/hr/attendance` reads and writes.
 *
 * Two rules this file exists to keep:
 *
 * 1. **Nothing is computed here.** Every figure the screen shows comes out of
 *    `lib/hr-model.ts`, which the tests hold. This module's whole job is to
 *    fetch rows through `withOrg()` and hand them to those functions.
 * 2. **Sessions, visits and leave are read through the readers that already
 *    exist** in `lib/data/workspace.ts`. A second `select` over `work_sessions`
 *    is a second answer to "how many hours", and eventually a different one.
 *
 * `.error` is checked on every read here. An unchecked PostgREST error is not
 * an empty table — it is a lie with a plausible shape, and selecting one column
 * that does not exist empties the WHOLE read silently.
 */

/**
 * Expected start of the working day, `"HH:MM"`, until a tenant HR-policy layer
 * exists — the same interim `DEFAULT_LEAVE_ALLOWANCE` is. It is a DEFAULT and
 * not a constant baked into the model: `timeDifference` takes it as an
 * argument, so the day a policy table lands, one call site changes.
 *
 * The screen prints it beside the Time Difference column. A verdict of "Late"
 * without the time it is late against is the same mistake as a percentage
 * without its denominator.
 */
export const DEFAULT_WORK_START = "09:30";

/* ── Reads ────────────────────────────────────────────────────────────────── */

const WFH_COLUMNS =
  "id, member_id, from_date, to_date, days, reason, status, decided_by, decided_at, decision_note, created_at";

export async function listWfh(filter?: {
  memberId?: string;
  status?: string;
}): Promise<WfhRequest[]> {
  const { db } = await withOrg();
  let q = db.table("wfh_requests").select(WFH_COLUMNS);
  if (filter?.memberId) q = q.eq("member_id", filter.memberId);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("from_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as WfhRequest[];
}

/**
 * The tenant's holiday calendar. Unfiltered by date on purpose: five to twenty
 * rows a year is not a page worth of anything, and the month window is applied
 * by `holidayCalendar`, which compares the `YYYY-MM-DD` strings rather than
 * asking Postgres to compare timestamps against a locally-built `Date`.
 */
export async function listHolidays(): Promise<Holiday[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("holidays")
    .select("id, holiday_date, name, is_optional")
    .order("holiday_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Holiday[];
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

/**
 * Apply to work from home. A sibling of `requestLeave`, deliberately identical
 * in shape and deliberately a different table: a WFH day is not leave, the
 * person worked, and it must never be deducted from an entitlement.
 *
 * Returns the new row's id so the caller can say which request it created.
 */
export async function requestWfh(input: {
  from_date: string;
  to_date: string;
  reason?: string | null;
}): Promise<{ error?: string; id?: string }> {
  const days = leaveDays(input.from_date, input.to_date);
  if (days <= 0) return { error: "The end date must be on or after the start date." };

  const { db } = await withOrg();
  const { data, error } = await db.table("wfh_requests").insert({
    member_id: (await getActingContext()).member.id,
    from_date: input.from_date,
    to_date: input.to_date,
    days,
    reason: input.reason?.trim() || null,
    status: "pending",
  });
  if (error) return { error: error.message };
  const row = (data ?? [])[0] as unknown as { id: string } | undefined;
  return { id: row?.id };
}

/* ── The board ────────────────────────────────────────────────────────────── */

export interface AttendanceBoard {
  member: { id: string; name: string; role: string };
  /** `YYYY-MM`, resolved on the server from `?month=`. */
  month: string;
  monthOptions: string[];
  window: { from: string; to: string };
  /** The active `?type=` leave-type slug, or `""` for all. */
  type: string;
  /** Active `leave_type` options MINUS the legacy `wfh` slug — see below. */
  leaveTypes: WorkspaceOption[];
  entitlement: number;
  expectedStart: string;
  tiles: LeaveTiles;
  attendance: AttendanceDay[];
  attendanceTotals: AttendanceTotals;
  /** Paid + unpaid rows for the month, legacy `wfh` rows excluded. */
  leaves: RequestRow[];
  /** `wfh_requests` rows AND legacy `leave_type='wfh'` rows, both labelled. */
  wfh: RequestRow[];
  /** The FY the Holidays tab is showing — a year, not the selected month. */
  holidayWindow: { from: string; to: string; label: string };
  holidays: HolidayRow[];
  /**
   * How many of the WFH rows are legacy `leave_requests` rows. Non-zero means
   * the screen must say so: the same word is stored in two tables and the
   * owner has not yet decided whether they are migrated (HANDOFF §10.5).
   */
  legacyWfhCount: number;
}

/**
 * Everything `/hr/attendance` needs for the acting member, in one pass.
 *
 * "My" is the acting member — the same person every other "my" surface in the
 * app resolves to, so switching profile in the shell's View-as picker moves
 * this screen too.
 *
 * The four tiles count over the WHOLE history, not the selected month: an
 * entitlement is annual, and a leave balance that reset every time you changed
 * the month filter would not be a balance. The three tabs below them are the
 * month's rows. The month label sits on the filter, so which is which is
 * visible rather than assumed.
 */
export async function getMyAttendance(filter?: {
  month?: string;
  type?: string;
  now?: Date;
}): Promise<AttendanceBoard> {
  await ensureDefaultOptions();
  const acting = await getActingContext();
  const memberId = acting.member.id;
  const now = filter?.now ?? new Date();

  const month = asMonthKey(filter?.month) || monthKeyOf(now);
  const window = monthWindow(month);

  const [options, sessions, visits, leave, wfh, holidays] = await Promise.all([
    listOptions("leave_type"),
    listSessions({ memberId }),
    listVisits({ memberId }),
    listLeave({ memberId }),
    listWfh({ memberId }),
    listHolidays(),
  ]);

  const typeLabels: Record<string, string> = {};
  for (const o of options) typeLabels[o.value] = o.label;

  // Every request in the month, both tables, then split by kind. One read, one
  // engine, two tabs — the tabs cannot disagree about a row because neither
  // of them decided anything.
  const all = requestRows(leave, wfh, window, typeLabels);
  const wfhRows = all.filter((r) => r.kind === "wfh");

  const wanted = String(filter?.type ?? "").trim();
  const leaveById = new Map(leave.map((l: LeaveRequest) => [l.id, l]));
  const leaveRows = all
    .filter((r) => r.kind !== "wfh")
    .filter((r) => !wanted || String(leaveById.get(r.id)?.leave_type ?? "") === wanted);

  const days = attendanceRows(sessions, visits, window.from, window.to, now);
  const fy = fyWindowOf(month);

  return {
    member: { id: memberId, name: acting.member.name, role: acting.member.role },
    month,
    monthOptions: recentMonths(now, 12),
    window,
    type: wanted,
    // The Apply form must NOT offer the legacy `wfh` slug as a leave type —
    // choosing it would write a NEW row into the collision this screen is
    // there to name. Work-from-home is applied for as itself and lands in
    // `wfh_requests`.
    leaveTypes: options.filter(
      (o) => o.is_active && o.value !== LEGACY_WFH_LEAVE_TYPE,
    ),
    entitlement: DEFAULT_LEAVE_ALLOWANCE,
    expectedStart: DEFAULT_WORK_START,
    tiles: leaveTiles(leave, wfh, DEFAULT_LEAVE_ALLOWANCE),
    attendance: days,
    attendanceTotals: attendanceTotals(days),
    leaves: leaveRows,
    wfh: wfhRows,
    holidayWindow: fy,
    holidays: holidayCalendar(holidays, fy.from, fy.to),
    legacyWfhCount: leave.filter((l: LeaveRequest) => leaveKindOf(l.leave_type) === "wfh").length,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * THE APPROVALS SIDE — `/hr/attendance/admin`, frame `110339`
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Approve or deny a work-from-home request. The exact mirror of `decideLeave`
 * in lib/data/workspace.ts, over the table `wfh_requests` was deliberately
 * shaped to mirror — same guard, same required reason, same quartet written in
 * one update.
 *
 * A decision is a STATUS CHANGE PLUS AN ATTRIBUTION, never a delete: the row
 * survives, `decided_by` and `decided_at` say who and when, and a denial
 * carries the reason. Nothing here removes anything.
 */
export async function decideWfh(
  id: string,
  decision: "approved" | "rejected",
  note?: string | null,
): Promise<{ error?: string }> {
  const acting = await getActingContext();
  // TODO(§11.3): Unit 6 replaces this coarse role check with `can("hr",
  // "approve", …)` from the permission spine Unit 5 builds. Until then the
  // manager tier is the only guard, and it is the SAME guard `decideLeave`
  // applies — one rule, not a second, weaker one on a newer table.
  if (!acting.isManager) return { error: "Only a manager can decide WFH requests." };

  const problem = decisionError(decision, note);
  if (problem) return { error: problem };

  const { db } = await withOrg();
  const { error } = await db.table("wfh_requests").updateById(id, {
    status: decision,
    decided_by: acting.member.id,
    decided_at: new Date().toISOString(),
    decision_note: note?.trim() || null,
  });
  return error ? { error: error.message } : {};
}

/**
 * The one decision entry point the approvals screen uses, over both tables.
 *
 * `wfh_requests` mirrors `leave_requests` precisely so this could be one code
 * path; the only thing that differs is which writer runs, and both writers
 * enforce the same two rules. `leave_requests` goes through the EXISTING
 * `decideLeave` rather than a second update of my own — a second writer over
 * the same table is a second set of rules waiting to drift.
 */
export async function decideRequest(
  source: "leave_requests" | "wfh_requests",
  id: string,
  decision: "approved" | "rejected",
  note?: string | null,
): Promise<{ error?: string }> {
  return source === "wfh_requests"
    ? decideWfh(id, decision, note)
    : decideLeave(id, decision, note);
}

export interface ApprovalAdminBoard {
  /** Who is looking, and whether they may decide anything. */
  actor: { id: string; name: string; role: string };
  canApprove: boolean;
  /** Resolved on the SERVER from `?tab=` / `?panel=` / `?member=`. */
  tab: "leaves" | "wfh" | "visits";
  panel: "approvals" | "report";
  memberId: string;
  members: { id: string; name: string; role: string }[];
  today: TodayStatus;
  /** Badge counts: pending decisions per tab; planned visits for the third. */
  counts: { leaves: number; wfh: number; visits: number };
  /** The active tab's rows, already split into pending and decided. */
  queue: ApprovalQueue;
  visits: VisitRow[];
  /** The Report half — every request, aggregated per employee. */
  report: EmployeeReportRow[];
  /**
   * Legacy `leave_type = 'wfh'` rows sitting in the WFH queue right now. A
   * manager deciding one is deciding a `leave_requests` row, and the screen
   * says so rather than folding it in (HANDOFF §10.5).
   */
  legacyPendingWfh: number;
}

/** Local midnight — the earliest stamp that can belong to today. */
function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/**
 * Everything `/hr/attendance/admin` needs, in one pass.
 *
 * The QUEUE IS NOT MONTH-SCOPED, unlike every other HR surface. A request for
 * next month is pending now, and a queue narrowed to the current month would
 * quietly drop exactly the requests a manager has not dealt with yet. The only
 * filter the frame offers is `FILTER BY: [Select User ▾]`, and that is the only
 * filter here.
 *
 * `Today's status` reads sessions from local midnight rather than the whole
 * history: it is the one figure on this screen that is about right now.
 */
export async function getApprovalBoard(filter?: {
  tab?: string;
  panel?: string;
  memberId?: string;
  now?: Date;
}): Promise<ApprovalAdminBoard> {
  await ensureDefaultOptions();
  const acting = await getActingContext();
  const now = filter?.now ?? new Date();

  const tab: ApprovalAdminBoard["tab"] =
    filter?.tab === "wfh" || filter?.tab === "visits" ? filter.tab : "leaves";
  const panel: ApprovalAdminBoard["panel"] = filter?.panel === "report" ? "report" : "approvals";

  const [members, options, leave, wfh, visits, sessions] = await Promise.all([
    listMembers(),
    listOptions("leave_type"),
    listLeave(),
    listWfh(),
    listVisits(),
    listSessions({ since: startOfToday(now) }),
  ]);

  // `?member=` may only ever name somebody in this org — `members` is already
  // org-scoped by withOrg, so an id from anywhere else filters to nothing
  // rather than reaching across a tenant boundary.
  const wanted = String(filter?.memberId ?? "").trim();
  const memberId = members.some((m) => m.id === wanted) ? wanted : "";

  const names: Record<string, string> = {};
  for (const m of members) names[m.id] = m.name;

  const typeLabels: Record<string, string> = {};
  for (const o of options) typeLabels[o.value] = o.label;

  // One list of rows, unwindowed. Every count, both tabs and the whole Report
  // are readings of THIS list, so none of them can disagree with another.
  const all: RequestRow[] = requestRows(leave, wfh, { from: "", to: "" }, typeLabels);

  // The Leaves tab is "everything that is not WFH" — paid and unpaid together,
  // which is what the frame's Leave Type column is for. WFH is its own tab
  // because the frame approves it on its own axis.
  const onTab = (r: RequestRow, want: "leaves" | "wfh") =>
    want === "wfh" ? r.kind === "wfh" : r.kind !== "wfh";
  const mine = (r: RequestRow) => !memberId || r.memberId === memberId;
  const pendingOn = (want: "leaves" | "wfh") =>
    all.filter((r) => r.status === "pending" && mine(r) && onTab(r, want)).length;

  const queue = approvalQueue(
    all.filter((r) => onTab(r, tab === "wfh" ? "wfh" : "leaves")),
    names,
    { memberId },
  );

  const visitList = visitRows(visits, names, { memberId });
  const everyRow = approvalQueue(all, names, { memberId });

  return {
    actor: { id: acting.member.id, name: acting.member.name, role: acting.member.role },
    canApprove: acting.isManager,
    tab,
    panel,
    memberId,
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    today: todayStatus(
      members.map((m) => m.id),
      sessions,
      leave,
      wfh,
      localDayOf(now.toISOString()),
    ),
    counts: {
      leaves: pendingOn("leaves"),
      wfh: pendingOn("wfh"),
      // Visits have no pending state — `planned` is the nearest thing, and
      // saying so is better than a badge that means something else here.
      visits: visitList.filter((v) => v.status === "planned").length,
    },
    queue,
    visits: visitList,
    report: approvalReport(
      [...everyRow.pending, ...everyRow.decided],
      members.map((m) => ({ id: m.id, name: m.name })),
    ),
    // Counted over EVERY row, not the active tab's — the warning must not
    // disappear because somebody is looking at the Leaves tab.
    legacyPendingWfh: all.filter((r) => r.legacy && r.status === "pending" && mine(r)).length,
  };
}
