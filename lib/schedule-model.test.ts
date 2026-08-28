import { describe, it, expect } from "vitest";
import {
  completionVariance,
  dayDiff,
  dueVariance,
  pctOf,
  progressVariance,
} from "./schedule-model";

describe("dayDiff", () => {
  it("counts whole days forward", () => {
    expect(dayDiff("2026-08-01", "2026-08-28")).toBe(27);
  });

  it("is negative backwards", () => {
    expect(dayDiff("2026-08-28", "2026-08-01")).toBe(-27);
  });

  it("ignores the time of day, so an evening is not a day", () => {
    expect(dayDiff("2026-08-28T00:01:00Z", "2026-08-28T23:59:00Z")).toBe(0);
  });

  it("crosses a DST-free month boundary correctly", () => {
    expect(dayDiff("2026-02-28", "2026-03-01")).toBe(1); // 2026 is not a leap year
  });

  it("returns 0 on unparseable input rather than NaN", () => {
    expect(dayDiff("not-a-date", "2026-08-28")).toBe(0);
  });
});

describe("completionVariance", () => {
  it("reproduces the frame: completed 287 days late", () => {
    // 105010: planned 30-Aug-25, actual 13-Jun-26.
    const v = completionVariance("2025-08-30", "2026-06-13");
    expect(v.state).toBe("late");
    expect(v.days).toBe(287);
    expect(v.label).toBe("Completed 287 days late");
  });

  it("says early when it beat the plan", () => {
    expect(completionVariance("2026-08-28", "2026-08-25")).toMatchObject({
      state: "early",
      days: -3,
      label: "Completed 3 days early",
    });
  });

  it("singularises one day", () => {
    expect(completionVariance("2026-08-28", "2026-08-29").label).toBe(
      "Completed 1 day late",
    );
  });

  it("is on time on the day", () => {
    expect(completionVariance("2026-08-28", "2026-08-28").state).toBe("on_time");
  });

  it("is pending while the actual date is unrecorded", () => {
    expect(completionVariance("2026-08-28", null).state).toBe("pending");
  });
});

describe("dueVariance", () => {
  it("reproduces the frame: running late by 65 days", () => {
    // 104420: handover 23-Apr-26, read on 27-Jun-26.
    const v = dueVariance("2026-04-23", "2026-06-27");
    expect(v).toMatchObject({ state: "late", days: 65 });
    expect(v.label).toBe("Running late by 65 days");
  });

  it("counts days left before the date", () => {
    expect(dueVariance("2026-08-31", "2026-08-28").label).toBe("3 days left");
  });

  it("says due today on the day", () => {
    expect(dueVariance("2026-08-28", "2026-08-28").label).toBe("Due today");
  });

  it("has no opinion without a date", () => {
    expect(dueVariance(null, "2026-08-28").state).toBe("pending");
  });
});

describe("progressVariance", () => {
  it("reproduces the frame: 47.51% actual against 100% estimated", () => {
    const v = progressVariance(100, 47.51);
    expect(v.behind).toBe(true);
    expect(v.deltaPct).toBe(-52.49);
    expect(v.label).toBe("Behind schedule, needs attention (▼52.49%)");
  });

  it("reads ahead when actual leads", () => {
    expect(progressVariance(40, 48)).toMatchObject({ behind: false, deltaPct: 8 });
  });

  it("is on plan when they match", () => {
    expect(progressVariance(50, 50).label).toBe("On plan");
  });
});

describe("pctOf", () => {
  it("matches the conversion rate in 103904", () => {
    expect(pctOf(9, 147)).toBe(6.12);
  });

  it("survives a zero denominator", () => {
    expect(pctOf(3, 0)).toBe(0);
  });
});
