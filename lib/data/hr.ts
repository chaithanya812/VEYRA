import "server-only";
import { withOrg } from "./with-org";
import { getActingContext } from "./team";
import {
  DEFAULT_LEAVE_ALLOWANCE,
  ensureDefaultOptions,
  listLeave,
  listOptions,
  listSessions,
  listVisits,
} from "./workspace";
import { leaveDays, type LeaveRequest, type WorkspaceOption } from "@/lib/workspace-model";
import {
  LEGACY_WFH_LEAVE_TYPE,
  asMonthKey,
  attendanceRows,
  attendanceTotals,
  fyWindowOf,
  holidayCalendar,
  leaveKindOf,
  leaveTiles,
  monthKeyOf,
  monthWindow,
  recentMonths,
  requestRows,
  type AttendanceDay,
  type AttendanceTotals,
  type Holiday,
  type HolidayRow,
  type LeaveTiles,
  type RequestRow,
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
