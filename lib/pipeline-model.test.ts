import { describe, it, expect } from "vitest";
import {
  DEFAULT_STAGES,
  followUpBucket,
  stageColumnTotals,
} from "./pipeline-model";

/**
 * Locks the CRM pipeline helpers (OPS-CRM-002/003 + OPS-HR-001).
 * followUpBucket drives the Overdue/Today/Upcoming/Done tabs and
 * stageColumnTotals produces the Kanban column headers — both pure and exact.
 * Column totals must always be plain SUMs of leads.value (never invented).
 */

// Fixed "now" so the buckets never flake: Wed 20 Aug 2026, 12:00 local.
const NOW = new Date("2026-08-20T12:00:00");

describe("followUpBucket", () => {
  it("done wins over everything — even a long-past due date", () => {
    expect(followUpBucket("2020-01-01T09:00:00", true, NOW)).toBe("done");
    expect(followUpBucket("2026-08-20T11:59:00", true, NOW)).toBe("done");
    expect(followUpBucket("2030-01-01T09:00:00", true, NOW)).toBe("done");
  });

  it("past and not done → overdue", () => {
    expect(followUpBucket("2026-08-13T09:00:00", false, NOW)).toBe("overdue");
    expect(followUpBucket("2026-08-20T11:59:59", false, NOW)).toBe("overdue");
  });

  it("earlier today is still overdue (it was due at 9am, it is now noon)", () => {
    expect(followUpBucket("2026-08-20T09:00:00", false, NOW)).toBe("overdue");
  });

  it("same calendar day but not yet past → today", () => {
    expect(followUpBucket("2026-08-20T18:30:00", false, NOW)).toBe("today");
    expect(followUpBucket("2026-08-20T23:59:00", false, NOW)).toBe("today");
  });

  it("due exactly now lands in today", () => {
    expect(followUpBucket("2026-08-20T12:00:00", false, NOW)).toBe("today");
  });

  it("future days → upcoming", () => {
    expect(followUpBucket("2026-08-21T00:00:00", false, NOW)).toBe("upcoming");
    expect(followUpBucket("2027-01-15T10:00:00", false, NOW)).toBe("upcoming");
  });

  it("defaults to the real clock", () => {
    // A far-future appointment is upcoming no matter when the suite runs;
    // a far-past one is overdue.
    expect(followUpBucket("2099-01-01T09:00:00", false)).toBe("upcoming");
    expect(followUpBucket("1999-01-01T09:00:00", false)).toBe("overdue");
  });
});

describe("stageColumnTotals", () => {
  const stages = ["New Inquiry", "Quotation", "Won"];

  it("returns one row per stage, in order, zeroed when empty", () => {
    expect(stageColumnTotals([], stages)).toEqual([
      { stage: "New Inquiry", count: 0, value: 0 },
      { stage: "Quotation", count: 0, value: 0 },
      { stage: "Won", count: 0, value: 0 },
    ]);
  });

  it("groups leads by matching status name, case-insensitively", () => {
    const leads = [
      { status: "new inquiry", value: 100000 },
      { status: "New Inquiry", value: 50000 },
      { status: "WON", value: 250000 },
    ];
    expect(stageColumnTotals(leads, stages)).toEqual([
      { stage: "New Inquiry", count: 2, value: 150000 },
      { stage: "Quotation", count: 0, value: 0 },
      { stage: "Won", count: 1, value: 250000 },
    ]);
  });

  it("sums null values as zero (pure SUM of leads.value)", () => {
    const leads = [
      { status: "quotation", value: null },
      { status: "quotation", value: 12000.5 },
    ];
    expect(stageColumnTotals(leads, ["Quotation"])).toEqual([
      { stage: "Quotation", count: 2, value: 12000.5 },
    ]);
  });

  it("ignores leads whose status matches no stage", () => {
    const leads = [
      { status: "qualified", value: 999 },
      { status: "", value: 888 },
    ];
    expect(stageColumnTotals(leads, stages)).toEqual([
      { stage: "New Inquiry", count: 0, value: 0 },
      { stage: "Quotation", count: 0, value: 0 },
      { stage: "Won", count: 0, value: 0 },
    ]);
  });

  it("never invents money: totals only ever come from the input rows", () => {
    const leads = [{ status: "new inquiry", value: 1234.56 }];
    const [only] = stageColumnTotals(leads, DEFAULT_STAGES.map((s) => s.name));
    expect(only.value).toBeCloseTo(1234.56);
  });
});

describe("DEFAULT_STAGES", () => {
  it("is the eight-stage default pipeline in board order", () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual([
      "New Inquiry",
      "Contacted",
      "Site Measurement",
      "Design Pitch",
      "Quotation",
      "Negotiation",
      "Won",
      "Lost",
    ]);
  });

  it("flags exactly one winning and one losing stage", () => {
    const won = DEFAULT_STAGES.find((s) => s.name === "Won");
    const lost = DEFAULT_STAGES.find((s) => s.name === "Lost");
    expect(won?.is_won).toBe(true);
    expect(won?.is_lost ?? false).toBe(false);
    expect(lost?.is_lost).toBe(true);
    expect(lost?.is_won ?? false).toBe(false);
    for (const s of DEFAULT_STAGES) {
      if (s.name !== "Won" && s.name !== "Lost") {
        expect(s.is_won ?? false).toBe(false);
        expect(s.is_lost ?? false).toBe(false);
      }
    }
  });
});
