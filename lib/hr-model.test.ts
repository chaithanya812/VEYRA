import { describe, it, expect } from "vitest";
import {
  LEGACY_WFH_LEAVE_TYPE,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONE,
  asMonthKey,
  attendanceCsv,
  attendanceDay,
  attendanceRows,
  attendanceTotals,
  fyWindowOf,
  formatHours,
  holidayCalendar,
  leaveKindOf,
  leaveTiles,
  localDayOf,
  monthKeyOf,
  monthLabel,
  monthWindow,
  overlapsWindow,
  recentMonths,
  requestRows,
  timeDifference,
  visitsOnDay,
  type Holiday,
  type WfhRequest,
} from "./hr-model";
import type { FieldVisit, LeaveRequest, WorkSession } from "./workspace-model";

/**
 * Locks the HR arithmetic behind frame `110318`. The invariants under test are
 * the ones the screen would otherwise get wrong quietly: an open session must
 * not be given hours, a WFH day must not be deducted from leave, and a holiday
 * date must not move because somebody parsed it into a `Date`.
 */

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const session = (over: Partial<WorkSession> = {}): WorkSession => ({
  id: "s1",
  member_id: "m1",
  check_in: "2026-03-24T09:00:00+05:30",
  check_out: "2026-03-24T18:00:00+05:30",
  lat: null,
  lng: null,
  location_label: null,
  source: "web",
  note: null,
  ...over,
});

const visit = (over: Partial<FieldVisit> = {}): FieldVisit => ({
  id: "v1",
  member_id: "m1",
  purpose: "site_visit",
  project_id: null,
  lead_id: null,
  title: null,
  started_at: "2026-03-24T11:00:00+05:30",
  ended_at: "2026-03-24T12:30:00+05:30",
  lat: null,
  lng: null,
  location_label: null,
  notes: null,
  status: "completed",
  created_at: "2026-03-24T11:00:00+05:30",
  ...over,
});

const leave = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: "l1",
  member_id: "m1",
  leave_type: "casual",
  from_date: "2026-03-24",
  to_date: "2026-03-24",
  days: 1,
  reason: null,
  status: "approved",
  decided_by: null,
  decided_at: null,
  decision_note: null,
  created_at: "2026-03-20T09:00:00Z",
  ...over,
});

const wfhReq = (over: Partial<WfhRequest> = {}): WfhRequest => ({
  id: "w1",
  member_id: "m1",
  from_date: "2026-03-24",
  to_date: "2026-03-24",
  days: 1,
  reason: null,
  status: "approved",
  decided_by: null,
  decided_at: null,
  decision_note: null,
  created_at: "2026-03-20T09:00:00Z",
  ...over,
});

const holiday = (over: Partial<Holiday> = {}): Holiday => ({
  id: "h1",
  holiday_date: "2026-03-24",
  name: "Ugadi",
  is_optional: false,
  ...over,
});

/* ── attendanceDay ────────────────────────────────────────────────────────── */

describe("attendanceDay", () => {
  it("derives a closed day from the stamps", () => {
    const day = attendanceDay([session()], [visit()]);
    expect(day.checkIns).toBe(1);
    expect(day.checkOuts).toBe(1);
    expect(day.sessionHours).toBe(9);
    expect(day.visitCount).toBe(1);
    expect(day.visitHours).toBe(1.5);
    expect(day.open).toBe(false);
  });

  it("gives an OPEN session zero hours and flags it (the `110318` row)", () => {
    const day = attendanceDay([session({ check_out: null })], []);
    expect(day).toMatchObject({ checkIns: 1, checkOuts: 0, sessionHours: 0, open: true });
  });

  it("does not measure an open session to `now` — the figure is stable", () => {
    const rows = [session({ check_out: null })];
    const early = attendanceDay(rows, [], new Date("2026-03-24T10:00:00+05:30"));
    const late = attendanceDay(rows, [], new Date("2026-03-24T23:00:00+05:30"));
    expect(early.sessionHours).toBe(late.sessionHours);
    expect(late.sessionHours).toBe(0);
  });

  it("counts a closed session on a day that also has an open one", () => {
    const day = attendanceDay(
      [
        session({ id: "a", check_in: "2026-03-24T09:00:00+05:30", check_out: "2026-03-24T13:00:00+05:30" }),
        session({ id: "b", check_in: "2026-03-24T14:00:00+05:30", check_out: null }),
      ],
      [],
    );
    expect(day).toMatchObject({ checkIns: 2, checkOuts: 1, sessionHours: 4, open: true });
  });

  it("an unfinished visit adds no visit hours but is still counted", () => {
    const day = attendanceDay([session()], [visit({ ended_at: null, status: "in_progress" })]);
    expect(day.visitCount).toBe(1);
    expect(day.visitHours).toBe(0);
  });

  it("takes its date from the earliest stamp, and reads `` for an empty day", () => {
    expect(attendanceDay([session()], []).date).toBe(localDayOf(session().check_in));
    expect(attendanceDay([], []).date).toBe("");
    expect(attendanceDay([], [])).toMatchObject({ open: false, firstCheckIn: null });
  });

  it("never returns negative hours for a check-out before its check-in", () => {
    const day = attendanceDay(
      [session({ check_in: "2026-03-24T18:00:00+05:30", check_out: "2026-03-24T09:00:00+05:30" })],
      [],
    );
    expect(day.sessionHours).toBe(0);
  });
});

describe("visitsOnDay", () => {
  it("matches on the local calendar day and drops visits that never started", () => {
    const day = new Date(2026, 2, 24);
    const rows = [
      visit({ id: "a" }),
      visit({ id: "b", started_at: "2026-03-25T11:00:00+05:30" }),
      visit({ id: "c", started_at: null, status: "planned" }),
    ];
    expect(visitsOnDay(rows, day).map((v) => v.id)).toEqual(["a"]);
  });
});

/* ── formatHours ──────────────────────────────────────────────────────────── */

describe("formatHours", () => {
  it("prints the frame's shape", () => {
    expect(formatHours(9)).toBe("9 Hrs 0 Min");
    expect(formatHours(9.5)).toBe("9 Hrs 30 Min");
    expect(formatHours(0)).toBe("0 Hrs 0 Min");
  });

  it("prints a dash for an unknowable figure rather than a fake zero", () => {
    expect(formatHours(null)).toBe("—");
    expect(formatHours(undefined)).toBe("—");
    expect(formatHours(Number.NaN)).toBe("—");
  });

  it("carries 60 minutes into the hour", () => {
    expect(formatHours(8.999)).toBe("9 Hrs 0 Min");
  });
});

/* ── timeDifference ───────────────────────────────────────────────────────── */

describe("timeDifference", () => {
  const dayAt = (checkIn: string, open = false) =>
    attendanceDay([session({ check_in: checkIn, check_out: open ? null : "2026-03-24T18:00:00+05:30" })], []);

  it("is null on an open day — a day that has not finished cannot be late", () => {
    expect(timeDifference(dayAt("2026-03-24T11:00:00+05:30", true), "09:30")).toBeNull();
  });

  it("is null when nobody checked in, and when the expected start is unusable", () => {
    expect(timeDifference(attendanceDay([], []), "09:30")).toBeNull();
    expect(timeDifference(dayAt("2026-03-24T09:00:00+05:30"), null)).toBeNull();
    expect(timeDifference(dayAt("2026-03-24T09:00:00+05:30"), "25:00")).toBeNull();
  });

  it("compares the first check-in against the expected start", () => {
    const early = dayAt("2026-03-24T09:00:00+05:30");
    const late = dayAt("2026-03-24T10:15:00+05:30");
    const exact = dayAt("2026-03-24T09:30:00+05:30");
    // Compared in the reader's own timezone, which is where a working day is.
    const expected = `${String(new Date(early.firstCheckIn!).getHours()).padStart(2, "0")}:${String(
      new Date(early.firstCheckIn!).getMinutes(),
    ).padStart(2, "0")}`;
    expect(timeDifference(early, expected)).toBe("On-time");
    expect(timeDifference(exact, expected)).toBe(
      new Date(exact.firstCheckIn!).getTime() > new Date(early.firstCheckIn!).getTime()
        ? "Late"
        : "On-time",
    );
    expect(timeDifference(late, expected)).toBe("Late");
  });
});

/* ── leaveKindOf + leaveTiles ─────────────────────────────────────────────── */

describe("leaveKindOf", () => {
  it("names the 0023/0034 collision instead of quietly picking one", () => {
    expect(leaveKindOf(LEGACY_WFH_LEAVE_TYPE)).toBe("wfh");
  });

  it("classifies unpaid slugs, and defaults an unknown type to PAID", () => {
    expect(leaveKindOf("unpaid")).toBe("unpaid");
    expect(leaveKindOf("Loss_Of_Pay")).toBe("unpaid");
    expect(leaveKindOf("casual")).toBe("paid");
    expect(leaveKindOf("bereavement")).toBe("paid");
    expect(leaveKindOf(null)).toBe("paid");
  });
});

describe("leaveTiles", () => {
  it("builds the frame's four tiles from days, not request counts", () => {
    const t = leaveTiles(
      [
        leave({ id: "a", days: 1, status: "approved" }),
        leave({ id: "b", days: 16, status: "pending" }),
        leave({ id: "c", leave_type: "unpaid", days: 3, status: "rejected" }),
      ],
      [wfhReq({ id: "w", days: 8, status: "approved" }), wfhReq({ id: "x", days: 29, status: "pending" })],
      24,
    );
    expect(t.paid).toEqual({ granted: 1, inProcess: 16 });
    expect(t.unpaid).toEqual({ granted: 0, inProcess: 0 });
    expect(t.wfh).toEqual({ granted: 8, inProcess: 29 });
    expect(t.available).toBe(23);
    // The ratio travels with the number it came from.
    expect(t.entitlement).toBe(24);
  });

  it("a WFH day is never deducted from the leave entitlement", () => {
    const withWfh = leaveTiles([], [wfhReq({ days: 5, status: "approved" })], 24);
    const without = leaveTiles([], [], 24);
    expect(withWfh.available).toBe(without.available);
    expect(withWfh.available).toBe(24);
  });

  it("a legacy `leave_type = 'wfh'` row lands on the WFH tile, not paid leave", () => {
    const t = leaveTiles(
      [leave({ leave_type: "wfh", days: 2, status: "approved" })],
      [wfhReq({ days: 1, status: "approved" })],
      24,
    );
    expect(t.paid.granted).toBe(0);
    expect(t.wfh.granted).toBe(3);
    expect(t.available).toBe(24);
  });

  it("entitlement is a parameter — a different tenant gets a different number", () => {
    const leaves = [leave({ days: 4, status: "approved" })];
    expect(leaveTiles(leaves, [], 12).available).toBe(8);
    expect(leaveTiles(leaves, [], 24).available).toBe(20);
  });

  it("never goes below zero when somebody has overdrawn", () => {
    expect(leaveTiles([leave({ days: 30, status: "approved" })], [], 24).available).toBe(0);
  });

  it("counts half days, and ignores rejected and cancelled requests", () => {
    const t = leaveTiles(
      [
        leave({ id: "a", days: 0.5, status: "approved" }),
        leave({ id: "b", days: 2, status: "cancelled" }),
        leave({ id: "c", leave_type: "unpaid", days: 1.5, status: "pending" }),
      ],
      [],
      10,
    );
    expect(t.paid.granted).toBe(0.5);
    expect(t.unpaid.inProcess).toBe(1.5);
    expect(t.available).toBe(9.5);
  });
});

/* ── holidayCalendar ──────────────────────────────────────────────────────── */

describe("holidayCalendar", () => {
  it("filters the window inclusively and sorts earliest first", () => {
    const rows = holidayCalendar(
      [
        holiday({ id: "b", holiday_date: "2026-04-14", name: "Ambedkar Jayanti" }),
        holiday({ id: "a", holiday_date: "2026-03-24", name: "Ugadi" }),
        holiday({ id: "z", holiday_date: "2026-05-01", name: "May Day" }),
      ],
      "2026-03-24",
      "2026-04-14",
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("formats and dates FROM THE STRING — 2026-03-24 stays the 24th", () => {
    const [row] = holidayCalendar([holiday()], "2026-01-01", "2026-12-31");
    expect(row.date).toBe("2026-03-24");
    expect(row.label).toBe("24 Mar 2026");
    expect(row.weekday).toBe("Tuesday");
  });

  it("keeps the optional/closure distinction", () => {
    const rows = holidayCalendar(
      [
        holiday({ id: "a", name: "Ugadi", is_optional: false }),
        holiday({ id: "b", holiday_date: "2026-03-25", name: "Holi (restricted)", is_optional: true }),
      ],
      "2026-01-01",
      "2026-12-31",
    );
    expect(rows.map((r) => r.isOptional)).toEqual([false, true]);
  });

  it("keeps two observances on one date, and drops a malformed one", () => {
    const rows = holidayCalendar(
      [
        holiday({ id: "a", name: "Diwali" }),
        holiday({ id: "b", name: "Govardhan Puja" }),
        holiday({ id: "c", holiday_date: "24-03-2026", name: "Typo" }),
      ],
      "2026-01-01",
      "2026-12-31",
    );
    expect(rows.map((r) => r.name)).toEqual(["Diwali", "Govardhan Puja"]);
  });
});

/* ── The month window (the FILTER BY band) ────────────────────────────────── */

describe("monthWindow / monthLabel / recentMonths", () => {
  it("bounds a month as strings, including a leap February", () => {
    expect(monthWindow("2026-08")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(monthWindow("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthWindow("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthWindow("2100-02").to).toBe("2100-02-28"); // not a leap year
  });

  it("rejects a month key it cannot use rather than guessing", () => {
    expect(asMonthKey("2026-13")).toBe("");
    expect(asMonthKey("2026-8")).toBe("");
    expect(asMonthKey(null)).toBe("");
    expect(monthWindow("nonsense")).toEqual({ from: "", to: "" });
    expect(monthLabel("")).toBe("");
  });

  it("labels and keys a month from the string, never through a Date", () => {
    expect(monthLabel("2026-08")).toBe("August 2026");
    expect(monthKeyOf(new Date(2026, 0, 31, 23, 30))).toBe("2026-01");
  });

  it("walks months backwards across a year boundary", () => {
    expect(recentMonths(new Date(2026, 1, 15), 4)).toEqual([
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
    expect(recentMonths(new Date(2026, 1, 15), 0)).toEqual([]);
  });
});

/* ── The Attendance tab ───────────────────────────────────────────────────── */

describe("attendanceRows", () => {
  const rowsFor = (from: string, to: string) =>
    attendanceRows(
      [
        session({ id: "a", check_in: "2026-03-23T09:30:00+05:30", check_out: "2026-03-23T18:15:00+05:30" }),
        session({ id: "b", check_in: "2026-03-24T09:30:00+05:30", check_out: null }),
        session({ id: "c", check_in: "2026-03-31T09:30:00+05:30", check_out: "2026-03-31T18:30:00+05:30" }),
      ],
      [visit({ id: "v", started_at: "2026-03-25T11:00:00+05:30", ended_at: "2026-03-25T13:00:00+05:30" })],
      from,
      to,
    );

  it("gives one row per day, newest first, inside the window", () => {
    expect(rowsFor("2026-03-01", "2026-03-31").map((r) => r.date)).toEqual([
      "2026-03-31",
      "2026-03-25",
      "2026-03-24",
      "2026-03-23",
    ]);
  });

  it("keeps a day that has only a visit — that person still worked", () => {
    const only = rowsFor("2026-03-25", "2026-03-25");
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ date: "2026-03-25", checkIns: 0, visitCount: 1, visitHours: 2 });
  });

  it("leaves an open day at zero hours and flags it", () => {
    const open = rowsFor("2026-03-24", "2026-03-24")[0];
    expect(open.open).toBe(true);
    expect(open.sessionHours).toBe(0);
    expect(open.checkIns).toBe(1);
    expect(open.checkOuts).toBe(0);
  });

  it("excludes days outside the window and does not invent the empty ones", () => {
    const march = rowsFor("2026-03-24", "2026-03-30");
    expect(march.map((r) => r.date)).toEqual(["2026-03-25", "2026-03-24"]);
  });
});

describe("attendanceTotals", () => {
  it("sums the closed days and says how many are still open", () => {
    const t = attendanceTotals(
      attendanceRows(
        [
          session({ id: "a", check_in: "2026-03-23T09:30:00+05:30", check_out: "2026-03-23T18:15:00+05:30" }),
          session({ id: "b", check_in: "2026-03-24T09:30:00+05:30", check_out: null }),
        ],
        [visit({ started_at: "2026-03-23T11:00:00+05:30", ended_at: "2026-03-23T12:30:00+05:30" })],
        "2026-03-01",
        "2026-03-31",
      ),
    );
    expect(t).toEqual({
      days: 2,
      openDays: 1,
      sessionHours: 8.75,
      visitCount: 1,
      visitHours: 1.5,
    });
  });
});

/* ── The Leaves and WFH tabs ──────────────────────────────────────────────── */

describe("overlapsWindow", () => {
  it("includes a request that straddles the month boundary", () => {
    expect(overlapsWindow("2026-07-30", "2026-08-02", "2026-08-01", "2026-08-31")).toBe(true);
    expect(overlapsWindow("2026-08-30", "2026-09-02", "2026-08-01", "2026-08-31")).toBe(true);
  });

  it("excludes a request wholly outside it, and anything undated", () => {
    expect(overlapsWindow("2026-09-01", "2026-09-03", "2026-08-01", "2026-08-31")).toBe(false);
    expect(overlapsWindow("2026-07-01", "2026-07-03", "2026-08-01", "2026-08-31")).toBe(false);
    expect(overlapsWindow("", "", "2026-08-01", "2026-08-31")).toBe(false);
  });
});

describe("requestRows", () => {
  const win = { from: "2026-08-01", to: "2026-08-31" };
  const rows = () =>
    requestRows(
      [
        leave({ id: "l1", leave_type: "casual", from_date: "2026-08-29", to_date: "2026-08-30", days: 2, status: "pending" }),
        leave({ id: "l2", leave_type: "sick", from_date: "2026-08-18", to_date: "2026-08-18", days: 1, status: "approved" }),
        leave({ id: "l3", leave_type: LEGACY_WFH_LEAVE_TYPE, from_date: "2026-08-27", to_date: "2026-08-27", days: 1, status: "pending" }),
        leave({ id: "l4", leave_type: "casual", from_date: "2026-06-01", to_date: "2026-06-02", days: 2, status: "approved" }),
      ],
      [wfhReq({ id: "w1", from_date: "2026-08-21", to_date: "2026-08-22", days: 2, status: "approved" })],
      win,
      { casual: "Casual leave", sick: "Sick leave" },
    );

  it("merges both tables, newest first, and drops months it was not asked for", () => {
    expect(rows().map((r) => r.id)).toEqual(["l1", "l3", "w1", "l2"]);
  });

  it("routes a legacy leave_type='wfh' row to the WFH kind and labels it legacy", () => {
    const legacy = rows().find((r) => r.id === "l3")!;
    expect(legacy.kind).toBe("wfh");
    expect(legacy.legacy).toBe(true);
    expect(legacy.source).toBe("leave_requests");

    const real = rows().find((r) => r.id === "w1")!;
    expect(real.kind).toBe("wfh");
    expect(real.legacy).toBe(false);
    expect(real.source).toBe("wfh_requests");
  });

  it("uses the tenant's own label, and falls back to the slug it stored", () => {
    expect(rows().find((r) => r.id === "l1")!.typeLabel).toBe("Casual leave");
    expect(rows().find((r) => r.id === "l3")!.typeLabel).toBe("wfh");
    expect(rows().find((r) => r.id === "w1")!.typeLabel).toBe("Work from home");
  });

  it("carries a grey/amber/green chip with a label, never colour alone", () => {
    const byId = new Map(rows().map((r) => [r.id, r]));
    expect(byId.get("l1")).toMatchObject({ statusLabel: "In process", tone: "amber" });
    expect(byId.get("l2")).toMatchObject({ statusLabel: "Granted", tone: "green" });
    expect(REQUEST_STATUS_TONE.rejected).toBe("neutral");
    expect(REQUEST_STATUS_LABELS.cancelled).toBe("Withdrawn");
  });

  it("formats both dates from the string, so neither slips a day", () => {
    const r = rows().find((x) => x.id === "w1")!;
    expect(r.fromLabel).toBe("21 Aug 2026");
    expect(r.toLabel).toBe("22 Aug 2026");
  });
});

/* ── Export ───────────────────────────────────────────────────────────────── */

describe("attendanceCsv", () => {
  it("exports the screen's columns, and keeps an open day as a dash", () => {
    const rows = attendanceRows(
      [
        session({ id: "a", check_in: "2026-03-23T09:30:00+05:30", check_out: "2026-03-23T18:15:00+05:30" }),
        session({ id: "b", check_in: "2026-03-24T09:45:00+05:30", check_out: null }),
      ],
      [],
      "2026-03-01",
      "2026-03-31",
    );
    const lines = attendanceCsv(rows, "09:30").split("\n");
    expect(lines[0]).toBe(
      "Date,No. of Check-In,No. of Check-Out,Total Check-In Hours,Total Visit Count,Total Visit Hours,Time Difference",
    );
    expect(lines[1]).toBe("24 Mar 2026,1,0,—,0,0 Hrs 0 Min,—");
    expect(lines[2]).toBe("23 Mar 2026,1,1,8 Hrs 45 Min,0,0 Hrs 0 Min,On-time");
  });
});

describe("fyWindowOf", () => {
  it("bounds the Indian financial year containing the month", () => {
    expect(fyWindowOf("2026-08")).toEqual({
      from: "2026-04-01",
      to: "2027-03-31",
      label: "FY 2026-27",
    });
    expect(fyWindowOf("2026-03")).toEqual({
      from: "2025-04-01",
      to: "2026-03-31",
      label: "FY 2025-26",
    });
    expect(fyWindowOf("2026-04").from).toBe("2026-04-01");
  });

  it("returns an empty window rather than guessing a year", () => {
    expect(fyWindowOf("nope")).toEqual({ from: "", to: "", label: "" });
  });
});
