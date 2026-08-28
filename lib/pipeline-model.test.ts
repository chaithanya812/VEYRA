import { describe, it, expect } from "vitest";
import {
  DEFAULT_STAGES,
  followUpBucket,
  resolveLeadColumnIndex,
  stageColumnTotals,
  daysInStage,
  groupByStatus,
  stageAgeTone,
  type PipelineRow,
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

  it("never drops a lead — an unmatched status falls into the first column", () => {
    // "qualified"→"Design Pitch" isn't in this 3-stage board, and "" matches
    // nothing; both land in the first column rather than vanishing.
    const leads = [
      { status: "qualified", value: 999 },
      { status: "", value: 888 },
    ];
    expect(stageColumnTotals(leads, stages)).toEqual([
      { stage: "New Inquiry", count: 2, value: 1887 },
      { stage: "Quotation", count: 0, value: 0 },
      { stage: "Won", count: 0, value: 0 },
    ]);
  });

  it("regression: every real lead status lands in a column on the default board", () => {
    const leads = [
      { status: "new", value: 1 },
      { status: "contacted", value: 2 },
      { status: "qualified", value: 4 },
      { status: "quoted", value: 8 },
      { status: "won", value: 16 },
      { status: "lost", value: 32 },
    ];
    const rows = stageColumnTotals(leads, DEFAULT_STAGES);
    const by = Object.fromEntries(rows.map((r) => [r.stage, r.count]));
    // new→New Inquiry, contacted→Contacted, qualified→Design Pitch,
    // quoted→Quotation, won→Won, lost→Lost. Nothing dropped.
    expect(by["New Inquiry"]).toBe(1);
    expect(by["Contacted"]).toBe(1);
    expect(by["Design Pitch"]).toBe(1);
    expect(by["Quotation"]).toBe(1);
    expect(by["Won"]).toBe(1);
    expect(by["Lost"]).toBe(1);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(6); // all six visible
  });

  it("never invents money: totals only ever come from the input rows", () => {
    const leads = [{ status: "new inquiry", value: 1234.56 }];
    const [only] = stageColumnTotals(leads, DEFAULT_STAGES.map((s) => s.name));
    expect(only.value).toBeCloseTo(1234.56);
  });
});

describe("resolveLeadColumnIndex", () => {
  it("matches won/lost by flag even when the stage is renamed", () => {
    const stages = [
      { name: "Inbox" },
      { name: "Closed – Won", is_won: true },
      { name: "Closed – Lost", is_lost: true },
    ];
    expect(resolveLeadColumnIndex("won", stages)).toBe(1);
    expect(resolveLeadColumnIndex("lost", stages)).toBe(2);
    // an unknown status still never drops — falls to the first column
    expect(resolveLeadColumnIndex("qualified", stages)).toBe(0);
  });

  it("returns -1 only when there are no stages", () => {
    expect(resolveLeadColumnIndex("new", [])).toBe(-1);
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

/* ── The board that replaced the Kanban ───────────────────────────────────── */

describe("daysInStage", () => {
  const NOW = new Date(2026, 7, 28); // 28 Aug 2026

  it("counts whole days since the lead entered its status", () => {
    expect(daysInStage({ stageSince: "2026-07-29T10:00:00Z" }, NOW)).toBe(30);
  });

  it("is 0 on the day it moved, not negative", () => {
    expect(daysInStage({ stageSince: "2026-08-28T23:00:00Z" }, NOW)).toBe(0);
    expect(daysInStage({ stageSince: "2026-09-05T00:00:00Z" }, NOW)).toBe(0);
  });

  it("survives a missing timestamp", () => {
    expect(daysInStage({ stageSince: "" }, NOW)).toBe(0);
  });
});

describe("stageAgeTone", () => {
  it("stays neutral inside a month", () => {
    expect(stageAgeTone(30)).toBe("neutral");
  });

  it("warns past 30 days and alerts past 60", () => {
    expect(stageAgeTone(31)).toBe("amber");
    expect(stageAgeTone(61)).toBe("red");
  });
});

describe("groupByStatus", () => {
  const statuses = [
    { value: "new", label: "New", seq: 0, is_active: true },
    { value: "contacted", label: "Contacted", seq: 1, is_active: true },
    { value: "old_stage", label: "Retired stage", seq: 2, is_active: false },
  ];

  function row(over: Partial<PipelineRow> & { id: string }): PipelineRow {
    return {
      name: "A lead",
      project_name: null,
      budget_band: null,
      status: "new",
      value: 100000,
      ownerId: null,
      ownerName: null,
      nextFollowUpAt: null,
      overdueFollowUps: 0,
      stageSince: "2026-08-01T00:00:00Z",
      lastActivityAt: null,
      ...over,
    };
  }

  it("keeps the tenant's ladder order and sums each group", () => {
    const groups = groupByStatus(
      [row({ id: "1" }), row({ id: "2", status: "contacted", value: 50000 })],
      statuses,
    );
    expect(groups.map((g) => g.status)).toEqual(["new", "contacted"]);
    expect(groups[0]).toMatchObject({ count: 1, value: 100000 });
    expect(groups[1]).toMatchObject({ count: 1, value: 50000 });
  });

  it("keeps an empty live status so the ladder stays legible", () => {
    const groups = groupByStatus([], statuses);
    expect(groups.map((g) => g.status)).toEqual(["new", "contacted"]);
  });

  it("still shows leads sitting on a retired status", () => {
    const groups = groupByStatus([row({ id: "1", status: "old_stage" })], statuses);
    const retired = groups.find((g) => g.status === "old_stage");
    expect(retired?.count).toBe(1);
    expect(retired?.label).toBe("Retired stage");
  });

  it("never loses a lead, whatever its status", () => {
    const rows = [row({ id: "1" }), row({ id: "2", status: "invented" })];
    const groups = groupByStatus(rows, statuses);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(rows.length);
  });
});
