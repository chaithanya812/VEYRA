import { describe, it, expect } from "vitest";
import {
  ALL_TIME,
  fyLabel,
  fyStart,
  isWithin,
  isoDate,
  rangeLabel,
  resolveRange,
} from "./date-range";

const AUG = new Date(2026, 7, 28); // 28 Aug 2026
const FEB = new Date(2027, 1, 14); // 14 Feb 2027 — same Indian FY as AUG

describe("isoDate", () => {
  it("uses local parts, so a late IST evening stays on its own day", () => {
    // 23:45 on the 28th must not roll back to the 27th the way toISOString does.
    expect(isoDate(new Date(2026, 7, 28, 23, 45))).toBe("2026-08-28");
  });

  it("pads month and day", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("Indian financial year", () => {
  it("opens on 1 April", () => {
    expect(isoDate(fyStart(AUG))).toBe("2026-04-01");
  });

  it("puts January through March in the previous April's year", () => {
    expect(isoDate(fyStart(FEB))).toBe("2026-04-01");
    expect(fyLabel(FEB)).toBe("FY 2026-27");
  });

  it("labels the year the way an accountant writes it", () => {
    expect(fyLabel(AUG)).toBe("FY 2026-27");
  });
});

describe("resolveRange", () => {
  it("this month covers the whole calendar month", () => {
    expect(resolveRange("this_month", AUG)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("last 30 days is inclusive of today", () => {
    expect(resolveRange("last_30d", AUG)).toEqual({
      from: "2026-07-30",
      to: "2026-08-28",
    });
  });

  it("this FY runs 1 Apr to 31 Mar", () => {
    expect(resolveRange("this_fy", AUG)).toEqual({
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("all time is unbounded, not a sentinel date", () => {
    expect(resolveRange("all_time", AUG)).toEqual(ALL_TIME);
  });

  it("passes a custom range through, and falls back to all time without one", () => {
    const custom = { from: "2026-01-01", to: "2026-01-31" };
    expect(resolveRange("custom", AUG, custom)).toEqual(custom);
    expect(resolveRange("custom", AUG)).toEqual(ALL_TIME);
  });
});

describe("isWithin", () => {
  const range = { from: "2026-08-01", to: "2026-08-31" };

  it("is inclusive on both ends", () => {
    expect(isWithin(range, "2026-08-01")).toBe(true);
    expect(isWithin(range, "2026-08-31")).toBe(true);
  });

  it("excludes outside the range", () => {
    expect(isWithin(range, "2026-07-31")).toBe(false);
    expect(isWithin(range, "2026-09-01")).toBe(false);
  });

  it("ignores the time part of a timestamp", () => {
    expect(isWithin(range, "2026-08-31T23:59:00.000Z")).toBe(true);
  });

  it("lets an unbounded end include everything on that side", () => {
    expect(isWithin({ from: null, to: "2026-08-31" }, "1999-01-01")).toBe(true);
    expect(isWithin(ALL_TIME, "2050-01-01")).toBe(true);
  });

  it("never matches a missing date", () => {
    expect(isWithin(ALL_TIME, null)).toBe(false);
  });
});

describe("rangeLabel", () => {
  it("names the FY rather than saying 'This FY'", () => {
    expect(rangeLabel("this_fy", resolveRange("this_fy", AUG), AUG)).toBe("FY 2026-27");
  });

  it("shows a custom range as its bounds", () => {
    expect(rangeLabel("custom", { from: "2026-01-01", to: "2026-01-31" })).toBe(
      "2026-01-01 → 2026-01-31",
    );
  });
});
