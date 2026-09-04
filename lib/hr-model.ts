/**
 * HR — the pure arithmetic behind `110318` (My Dashboard). PLAN-V4 §11.
 *
 * No `server-only` import and no DB access: the client panels and the server
 * data module share exactly this arithmetic, so the tiles and the table can
 * never disagree about a number.
 *
 * Three decisions are worth writing down, because each of them is the reason a
 * figure on that screen is honest rather than merely plausible.
 *
 * 1. **AN OPEN SESSION CONTRIBUTES ZERO HOURS.** The frame carries a row
 *    reading `1 check-in · 0 check-out · 0 Hrs 0 Min · —`, and that row is the
 *    whole argument for deriving attendance instead of storing it. Somebody
 *    who has not checked out has not worked a knowable number of hours, so we
 *    do not invent one and we do not measure them to "now" either: a day's
 *    attendance figure that changes every time the page is refreshed is not a
 *    figure, it is a stopwatch. `open: true` says so on the row.
 *
 *    (The LIVE "hours today" widget on the employee workspace does measure an
 *    open session to `now` — that is `totalHours` in lib/workspace-model.ts,
 *    and it is a different question deliberately answered differently.)
 *
 * 2. **`entitlement` IS A PARAMETER, NEVER A CONSTANT.** Leave allowance is
 *    tenant config. A number baked in here would be a policy decision smuggled
 *    into a pure function, and it would be wrong for every tenant but one.
 *
 * 3. **A COLLISION, NAMED RATHER THAN QUIETLY RESOLVED.** 0023 seeded a
 *    `leave_type` option called `wfh`, and 0034 gives work-from-home its own
 *    table because the frame counts and approves it separately. Rows stored
 *    against the old slug still exist. `leaveTiles` counts such a row toward
 *    the **WFH** tile, never toward paid leave — because a WFH day is not
 *    leave (the person worked) and must not eat a leave entitlement. Both
 *    facts survive; neither pretends to be the other.
 *
 * Dates: every `YYYY-MM-DD` value is read and formatted FROM THE STRING. See
 * `formatPhotoDate` — `2026-03-24` parsed into a `Date` and read back locally
 * becomes the 23rd. Timestamps (`check_in`, `started_at`) are a different
 * thing and do go through a `Date`, because a wall-clock instant has no
 * meaning until it is placed in a timezone.
 */
import { formatPhotoDate } from "./site-photos-model";
import {
  openSession,
  sessionHours,
  type ApprovalStatus,
  type FieldVisit,
  type LeaveRequest,
  type WorkSession,
} from "./workspace-model";

/* ── Rows (mirror migration 0034) ─────────────────────────────────────────── */

/**
 * A work-from-home request. Mirrors `LeaveRequest` field for field except for
 * `leave_type`, which WFH does not have — there are no sub-kinds of working
 * from home. The mirror is deliberate: Unit 3's approval screen is one code
 * path over two tables.
 */
export interface WfhRequest {
  id: string;
  member_id: string;
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

export interface Holiday {
  id: string;
  /** `YYYY-MM-DD`. */
  holiday_date: string;
  name: string;
  /** A restricted / floating holiday, as against an office closure. */
  is_optional: boolean;
}

/* ── The leave-type collision (see the header, point 3) ───────────────────── */

/**
 * The one `leave_type` slug that is NOT leave. 0023 seeded it; 0034 moved the
 * concept to its own table. Exported so the screens can say why a legacy row
 * is counted where it is, instead of the rule living unexplained in a filter.
 */
export const LEGACY_WFH_LEAVE_TYPE = "wfh";

/** The `leave_type` slugs that do not draw against a paid entitlement. */
export const UNPAID_LEAVE_TYPES = ["unpaid", "loss_of_pay", "lop"] as const;

export type LeaveKind = "paid" | "unpaid" | "wfh";

/**
 * Which bucket a stored `leave_type` belongs to. Unknown slugs are PAID: a
 * tenant who adds "Bereavement leave" means a paid day off, and defaulting an
 * unrecognised type to unpaid would silently hand somebody back leave they
 * had actually spent.
 */
export function leaveKindOf(leaveType: string | null | undefined): LeaveKind {
  const t = String(leaveType ?? "").trim().toLowerCase();
  if (t === LEGACY_WFH_LEAVE_TYPE) return "wfh";
  return (UNPAID_LEAVE_TYPES as readonly string[]).includes(t) ? "unpaid" : "paid";
}

/* ── Attendance ───────────────────────────────────────────────────────────── */

export interface AttendanceDay {
  /** `YYYY-MM-DD`, taken from the earliest stamp of the day. `""` if empty. */
  date: string;
  checkIns: number;
  checkOuts: number;
  /** Σ hours over CLOSED sessions only. An open session adds nothing. */
  sessionHours: number;
  visitCount: number;
  /** Σ hours over visits that both started AND ended. */
  visitHours: number;
  /** The first check-in as an ISO timestamp — what `timeDifference` reads. */
  firstCheckIn: string | null;
  /** True when a session on this day has no check-out yet. */
  open: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Local calendar day of a timestamp, as `YYYY-MM-DD`. `""` if unparseable. */
export function localDayOf(stamp: string | null | undefined): string {
  if (!stamp) return "";
  const d = new Date(stamp);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Field visits that started on the same local calendar day as `day` — the
 * companion to `sessionsOnDay` in lib/workspace-model.ts, so a screen never
 * has to re-implement day matching in JSX. A visit with no `started_at` has
 * not happened yet and belongs to no day.
 */
export function visitsOnDay(visits: FieldVisit[], day: Date): FieldVisit[] {
  return visits.filter((v) => {
    if (!v.started_at) return false;
    const d = new Date(v.started_at);
    return (
      Number.isFinite(d.getTime()) &&
      d.getFullYear() === day.getFullYear() &&
      d.getMonth() === day.getMonth() &&
      d.getDate() === day.getDate()
    );
  });
}

/**
 * One row of the Attendance table. `sessions` and `visits` are already the
 * rows for a single day (see `sessionsOnDay` / `visitsOnDay`).
 *
 * `now` is accepted and deliberately NOT used to close an open session — it is
 * here so a caller cannot mistake this for a live clock and so the signature
 * matches the rest of the workspace engines.
 */
export function attendanceDay(
  sessions: WorkSession[],
  visits: FieldVisit[],
  _now: Date = new Date(),
): AttendanceDay {
  const closed = sessions.filter((s) => !!s.check_out);
  const stamps = sessions
    .map((s) => s.check_in)
    .filter((s): s is string => !!s)
    .sort();

  let visitHours = 0;
  for (const v of visits) {
    if (!v.started_at || !v.ended_at) continue; // an open visit adds nothing
    const a = new Date(v.started_at).getTime();
    const b = new Date(v.ended_at).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    visitHours += Math.max(0, b - a) / 3_600_000;
  }

  return {
    date: localDayOf(stamps[0] ?? null),
    checkIns: sessions.length,
    checkOuts: closed.length,
    // `sessionHours` measures an open session to `now`; passing only closed
    // sessions is what keeps an unfinished day at zero.
    sessionHours: round2(closed.reduce((s, x) => s + sessionHours(x), 0)),
    visitCount: visits.length,
    visitHours: round2(visitHours),
    firstCheckIn: stamps[0] ?? null,
    open: !!openSession(sessions),
  };
}

/**
 * `9.5` → `"9 Hrs 30 Min"`. `null` → `"—"`, which is what an unknowable figure
 * prints as: a dash is honest, `0 Hrs 0 Min` claims a measurement nobody took.
 * Minutes round to the nearest whole; 60 carries into the hour rather than
 * printing `8 Hrs 60 Min`.
 */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
  const total = Math.max(0, hours);
  let h = Math.floor(total);
  let m = Math.round((total - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${h} Hrs ${m} Min`;
}

export type TimeDifference = "On-time" | "Late";

/**
 * Did they start on time? `expectedStart` is `"HH:MM"` tenant config.
 *
 * Returns `null` — the frame's `-` — in the two cases where the question has
 * no answer: a day still open (you cannot call somebody late for a day that
 * has not finished) and a day with no check-in at all. An unparseable
 * `expectedStart` is also null rather than a guess.
 */
export function timeDifference(
  day: AttendanceDay,
  expectedStart: string | null | undefined,
): TimeDifference | null {
  if (day.open || !day.firstCheckIn) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(expectedStart ?? "").trim());
  if (!m) return null;
  const expectedMinutes = Number(m[1]) * 60 + Number(m[2]);
  if (!Number.isFinite(expectedMinutes) || Number(m[1]) > 23 || Number(m[2]) > 59) {
    return null;
  }
  const d = new Date(day.firstCheckIn);
  if (!Number.isFinite(d.getTime())) return null;
  const actualMinutes = d.getHours() * 60 + d.getMinutes();
  return actualMinutes > expectedMinutes ? "Late" : "On-time";
}

/* ── The four tiles ───────────────────────────────────────────────────────── */

/** Granted and in-process are DAYS, not request counts — see `leaveTiles`. */
export interface TilePair {
  granted: number;
  inProcess: number;
}

export interface LeaveTiles {
  /** `entitlement − paid.granted`, floored at zero. */
  available: number;
  /** The entitlement it was computed from — a ratio travels with its parts. */
  entitlement: number;
  paid: TilePair;
  unpaid: TilePair;
  wfh: TilePair;
}

function addDays(pair: TilePair, status: string, days: unknown): void {
  const d = Number(days);
  const n = Number.isFinite(d) ? Math.max(0, d) : 0;
  if (status === "approved") pair.granted += n;
  else if (status === "pending") pair.inProcess += n;
  // rejected and cancelled are neither granted nor in process.
}

/**
 * The frame's four tiles. Every figure is a sum of DAYS, not of requests: the
 * Available tile subtracts granted paid leave from an entitlement measured in
 * days, so counting requests instead would make one three-day absence cost the
 * same as one afternoon.
 *
 * `entitlement` is tenant config, passed in (header, point 2).
 *
 * Legacy `leave_type = 'wfh'` rows land in the WFH tile, never in paid leave
 * (header, point 3).
 */
export function leaveTiles(
  leaves: LeaveRequest[],
  wfh: WfhRequest[],
  entitlement: number,
): LeaveTiles {
  const paid: TilePair = { granted: 0, inProcess: 0 };
  const unpaid: TilePair = { granted: 0, inProcess: 0 };
  const wfhPair: TilePair = { granted: 0, inProcess: 0 };

  for (const l of leaves) {
    const kind = leaveKindOf(l.leave_type);
    addDays(kind === "paid" ? paid : kind === "unpaid" ? unpaid : wfhPair, l.status, l.days);
  }
  for (const w of wfh) addDays(wfhPair, w.status, w.days);

  const ent = Number.isFinite(Number(entitlement)) ? Math.max(0, Number(entitlement)) : 0;
  return {
    available: round2(Math.max(0, ent - paid.granted)),
    entitlement: round2(ent),
    paid: { granted: round2(paid.granted), inProcess: round2(paid.inProcess) },
    unpaid: { granted: round2(unpaid.granted), inProcess: round2(unpaid.inProcess) },
    wfh: { granted: round2(wfhPair.granted), inProcess: round2(wfhPair.inProcess) },
  };
}

/* ── The Holidays tab ─────────────────────────────────────────────────────── */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface HolidayRow {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `24 Mar 2026`, formatted from the string. */
  label: string;
  weekday: string;
  name: string;
  isOptional: boolean;
}

/**
 * The Holidays tab's rows, inside `[from, to]` inclusive, earliest first.
 *
 * The window is compared as STRINGS — `YYYY-MM-DD` sorts lexicographically the
 * same way it sorts chronologically, so no `Date` is constructed and no
 * timezone can move a holiday to the day before. The weekday is the one thing
 * that genuinely needs arithmetic, and it is computed in UTC for the same
 * reason: `Date.UTC` cannot drift, `new Date("2026-03-24")` can.
 *
 * A row with a malformed date is dropped rather than shown undated — a holiday
 * calendar with an entry on no particular day is worse than a shorter one.
 */
export function holidayCalendar(
  holidays: Holiday[],
  from: string,
  to: string,
): HolidayRow[] {
  return holidays
    .filter((h) => {
      const d = String(h.holiday_date ?? "");
      return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to;
    })
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
    .map((h) => {
      const [y, m, d] = h.holiday_date.split("-").map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return {
        id: h.id,
        date: h.holiday_date,
        label: formatPhotoDate(h.holiday_date),
        weekday: WEEKDAYS[dow] ?? "",
        name: h.name,
        isOptional: !!h.is_optional,
      };
    });
}

/* ── The FILTER BY month window ───────────────────────────────────────────── */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days in a month, without constructing a `Date` for the month itself. */
function daysInMonth(year: number, month1: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month1 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return lengths[month1 - 1] ?? 30;
}

/** `"2026-08"` if the value is a usable month key, else `""`. */
export function asMonthKey(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return "";
  const m = Number(s.slice(5, 7));
  return m >= 1 && m <= 12 ? s : "";
}

/** The month a local `Date` falls in, as `YYYY-MM`. */
export function monthKeyOf(now: Date): string {
  if (!Number.isFinite(now.getTime())) return "";
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The inclusive `[from, to]` window of a month, as `YYYY-MM-DD` STRINGS.
 *
 * Strings, not `Date`s, because every date this screen compares against is a
 * string: `holidays.holiday_date`, `leave_requests.from_date`. A window built
 * out of `Date`s would sit a timezone away from the rows it filters, and the
 * first casualty would be a holiday on the 1st.
 */
export function monthWindow(monthKey: string): { from: string; to: string } {
  const key = asMonthKey(monthKey);
  if (!key) return { from: "", to: "" };
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return {
    from: `${key}-01`,
    to: `${key}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
  };
}

/** `"2026-08"` → `"August 2026"`. Read from the string; no `Date` involved. */
export function monthLabel(monthKey: string): string {
  const key = asMonthKey(monthKey);
  if (!key) return "";
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/**
 * The month picker's options — `count` months ending at `now`, newest first.
 * Walked by arithmetic on the year/month pair rather than by subtracting
 * milliseconds, because "one month ago" is not a fixed number of days.
 */
export function recentMonths(now: Date, count = 12): string[] {
  if (!Number.isFinite(now.getTime())) return [];
  const out: string[] = [];
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  for (let i = 0; i < Math.max(0, count); i += 1) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

/**
 * The Indian financial year (1 Apr – 31 Mar) containing `monthKey`, as
 * `YYYY-MM-DD` strings plus the `FY 2026-27` label the rest of the app already
 * prints (see `fyLabel` in lib/date-range.ts).
 *
 * The Holidays tab uses this rather than the month window every other tab
 * uses, and the reason is worth stating: a holiday calendar is a year-long
 * document. Filtered to a month it is empty in eleven months out of twelve,
 * and an empty tab teaches the reader the tenant has no holidays rather than
 * that they asked the wrong question. The tab prints the FY it is showing, so
 * the window it uses is stated rather than assumed.
 *
 * Built from the month key's own digits — no `Date`, so no timezone can move
 * the 1 April boundary.
 */
export function fyWindowOf(monthKey: string): { from: string; to: string; label: string } {
  const key = asMonthKey(monthKey);
  if (!key) return { from: "", to: "", label: "" };
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return {
    from: `${start}-04-01`,
    to: `${start + 1}-03-31`,
    label: `FY ${start}-${String(start + 1).slice(-2)}`,
  };
}

/* ── The Attendance tab ───────────────────────────────────────────────────── */

/**
 * One row per day on which something happened, newest first, inside the
 * inclusive `[from, to]` window.
 *
 * A day appears if it has a session OR a visit: somebody who spent the day at
 * a client site without stamping in still worked, and a table that dropped
 * that row would be quietly asserting they did not.
 *
 * `attendanceDay` derives its own `date` from the earliest check-in, which is
 * `""` for a visits-only day — so the day key is put back afterwards. Empty
 * days in between are NOT filled in: a blank row for every weekend and holiday
 * would bury the days that carry something.
 */
export function attendanceRows(
  sessions: WorkSession[],
  visits: FieldVisit[],
  from: string,
  to: string,
  now: Date = new Date(),
): AttendanceDay[] {
  const byDay = new Map<string, { sessions: WorkSession[]; visits: FieldVisit[] }>();
  const bucket = (day: string) => {
    let b = byDay.get(day);
    if (!b) {
      b = { sessions: [], visits: [] };
      byDay.set(day, b);
    }
    return b;
  };

  for (const s of sessions) {
    const day = localDayOf(s.check_in);
    if (day) bucket(day).sessions.push(s);
  }
  for (const v of visits) {
    const day = localDayOf(v.started_at);
    if (day) bucket(day).visits.push(v);
  }

  return [...byDay.entries()]
    .filter(([day]) => (!from || day >= from) && (!to || day <= to))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, b]) => ({ ...attendanceDay(b.sessions, b.visits, now), date: day }));
}

export interface AttendanceTotals {
  days: number;
  /** Days with an unfinished session — the hours below exclude them. */
  openDays: number;
  sessionHours: number;
  visitCount: number;
  visitHours: number;
}

/**
 * The table's footer. `openDays` travels with the hours for the same reason
 * every ratio in this codebase travels with its denominator: `43 Hrs 45 Min`
 * across six days means something different when one of those days has not
 * finished, and the footer has to say so rather than let the reader assume.
 */
export function attendanceTotals(rows: AttendanceDay[]): AttendanceTotals {
  return {
    days: rows.length,
    openDays: rows.filter((r) => r.open).length,
    sessionHours: round2(rows.reduce((s, r) => s + r.sessionHours, 0)),
    visitCount: rows.reduce((s, r) => s + r.visitCount, 0),
    visitHours: round2(rows.reduce((s, r) => s + r.visitHours, 0)),
  };
}

/* ── The Leaves and WFH tabs ──────────────────────────────────────────────── */

export const REQUEST_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "In process",
  approved: "Granted",
  rejected: "Rejected",
  cancelled: "Withdrawn",
};

/**
 * Chip tone per status. Grey / amber / green only — one's own rejected request
 * is a fact, not an alarm, and red has five jobs that do not include it
 * (DESIGN-DIRECTION §2). Every chip carries its label; the colour never
 * carries the meaning alone.
 */
export const REQUEST_STATUS_TONE: Record<ApprovalStatus, "neutral" | "amber" | "green"> = {
  pending: "amber",
  approved: "green",
  rejected: "neutral",
  cancelled: "neutral",
};

export interface RequestRow {
  id: string;
  kind: LeaveKind;
  /** Which table the row is stored in — the collision is visible, not hidden. */
  source: "leave_requests" | "wfh_requests";
  /**
   * True for a `leave_type = 'wfh'` row stored before WFH had its own table.
   * The screen labels these rather than silently folding them in: whether they
   * get migrated is the owner's call and is still open (HANDOFF §10.5).
   */
  legacy: boolean;
  typeLabel: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  days: number;
  reason: string | null;
  status: ApprovalStatus;
  statusLabel: string;
  tone: "neutral" | "amber" | "green";
  appliedOn: string;
}

/** Does `[a, b]` touch `[from, to]`? All four are `YYYY-MM-DD` strings. */
export function overlapsWindow(a: string, b: string, from: string, to: string): boolean {
  const start = String(a ?? "");
  const end = String(b ?? "") || start;
  if (!start) return false;
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}

function statusOf(value: unknown): ApprovalStatus {
  const s = String(value ?? "");
  return (["pending", "approved", "rejected", "cancelled"] as string[]).includes(s)
    ? (s as ApprovalStatus)
    : "pending";
}

/**
 * The rows behind the Leaves and WFH tabs, newest first.
 *
 * Both tabs are one function over two tables because the frame applies for and
 * approves them the same way; what differs is `kind`, and the caller filters on
 * it. A request is included when it OVERLAPS the month, not when it starts in
 * it — leave taken from the 30th to the 2nd is absence in both months, and
 * showing it in neither is how a month comes to look emptier than it was.
 *
 * `typeLabels` maps a stored `leave_type` slug to the tenant's own label, so a
 * firm that renamed "Casual" to "Personal" sees their word. An unmapped slug
 * prints itself rather than disappearing.
 */
export function requestRows(
  leaves: LeaveRequest[],
  wfh: WfhRequest[],
  window: { from: string; to: string },
  typeLabels: Record<string, string> = {},
): RequestRow[] {
  const rows: RequestRow[] = [];

  for (const l of leaves) {
    if (!overlapsWindow(l.from_date, l.to_date, window.from, window.to)) continue;
    const kind = leaveKindOf(l.leave_type);
    const status = statusOf(l.status);
    rows.push({
      id: l.id,
      kind,
      source: "leave_requests",
      legacy: kind === "wfh",
      typeLabel: typeLabels[String(l.leave_type)] ?? String(l.leave_type ?? "Leave"),
      from: l.from_date,
      to: l.to_date,
      fromLabel: formatPhotoDate(l.from_date),
      toLabel: formatPhotoDate(l.to_date),
      days: Number(l.days) || 0,
      reason: l.reason,
      status,
      statusLabel: REQUEST_STATUS_LABELS[status],
      tone: REQUEST_STATUS_TONE[status],
      appliedOn: l.created_at,
    });
  }

  for (const w of wfh) {
    if (!overlapsWindow(w.from_date, w.to_date, window.from, window.to)) continue;
    const status = statusOf(w.status);
    rows.push({
      id: w.id,
      kind: "wfh",
      source: "wfh_requests",
      legacy: false,
      typeLabel: "Work from home",
      from: w.from_date,
      to: w.to_date,
      fromLabel: formatPhotoDate(w.from_date),
      toLabel: formatPhotoDate(w.to_date),
      days: Number(w.days) || 0,
      reason: w.reason,
      status,
      statusLabel: REQUEST_STATUS_LABELS[status],
      tone: REQUEST_STATUS_TONE[status],
      appliedOn: w.created_at,
    });
  }

  return rows.sort((a, b) => b.from.localeCompare(a.from));
}

/* ── Export ───────────────────────────────────────────────────────────────── */

const CSV_HEADERS = [
  "Date",
  "No. of Check-In",
  "No. of Check-Out",
  "Total Check-In Hours",
  "Total Visit Count",
  "Total Visit Hours",
  "Time Difference",
];

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The Attendance tab as CSV — the exact columns on screen, in the same order,
 * with the same `—` for an unfinished day. An export that quietly turned an
 * open day into `0 Hrs 0 Min` would be a second, more confident answer to a
 * question the screen deliberately refuses to answer.
 */
export function attendanceCsv(
  rows: AttendanceDay[],
  expectedStart: string | null | undefined,
): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatPhotoDate(r.date),
        String(r.checkIns),
        String(r.checkOuts),
        r.open ? "—" : formatHours(r.sessionHours),
        String(r.visitCount),
        formatHours(r.visitHours),
        timeDifference(r, expectedStart) ?? "—",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
