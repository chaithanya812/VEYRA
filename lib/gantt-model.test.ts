import { describe, it, expect } from "vitest";
import { buildGantt } from "./gantt-model";
import type { ProjectMilestone } from "./milestones-model";

function m(over: Partial<ProjectMilestone> & { id: string }): ProjectMilestone {
  return {
    project_id: "p1",
    scope_item_id: null,
    name: "Site Marking",
    status: "not_started",
    progress_pct: 0,
    planned_start: "2026-01-01",
    planned_end: "2026-01-31",
    actual_start: null,
    actual_end: null,
    assignee_id: null,
    client_visible: false,
    last_update: null,
    sort_order: 0,
    ...over,
  };
}

const NOW = new Date("2026-02-15T12:00:00Z");

describe("buildGantt window", () => {
  it("spans the work, not the calendar month", () => {
    const chart = buildGantt(
      [
        m({ id: "a", planned_start: "2025-07-01", planned_end: "2025-08-30" }),
        m({ id: "b", planned_start: "2026-03-01", planned_end: "2026-05-11" }),
      ],
      new Map(),
      NOW,
    );
    // Padded a little at each end, but firmly around the real dates.
    expect(chart.start < "2025-07-01").toBe(true);
    expect(chart.end > "2026-05-11").toBe(true);
  });

  it("puts the first bar before the last one", () => {
    const chart = buildGantt(
      [
        m({ id: "a", planned_start: "2025-07-01", planned_end: "2025-08-30" }),
        m({ id: "b", planned_start: "2026-03-01", planned_end: "2026-05-11" }),
      ],
      new Map(),
      NOW,
    );
    const [a, b] = chart.bars;
    expect(a.leftPct).toBeLessThan(b.leftPct);
    expect(a.leftPct).toBeGreaterThan(0);
    expect(b.leftPct + b.widthPct).toBeLessThanOrEqual(100);
  });

  it("marks today when it falls inside the window, and not when it does not", () => {
    const inside = buildGantt(
      [m({ id: "a", planned_start: "2026-01-01", planned_end: "2026-03-31" })],
      new Map(),
      NOW,
    );
    expect(inside.todayPct).not.toBeNull();

    const past = buildGantt(
      [m({ id: "a", planned_start: "2020-01-01", planned_end: "2020-03-31" })],
      new Map(),
      NOW,
    );
    expect(past.todayPct).toBeNull();
  });

  it("returns an empty chart rather than throwing when nothing has dates", () => {
    const chart = buildGantt(
      [m({ id: "a", planned_start: null, planned_end: null })],
      new Map(),
      NOW,
    );
    expect(chart.bars).toEqual([]);
    expect(chart.undated.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("buildGantt bars", () => {
  it("draws actual dates when both are known, and says so", () => {
    const chart = buildGantt(
      [
        m({
          id: "a",
          status: "completed",
          planned_start: "2025-07-01",
          planned_end: "2025-08-30",
          actual_start: "2026-03-12",
          actual_end: "2026-06-13",
        }),
      ],
      new Map(),
      NOW,
    );
    expect(chart.bars[0].actual).toBe(true);
    expect(chart.bars[0].dateLabel).toBe("12 Mar 26 → 13 Jun 26");
  });

  it("reds only genuine lateness — overdue, not merely unfinished", () => {
    const chart = buildGantt(
      [
        m({ id: "late", planned_start: "2026-01-01", planned_end: "2026-01-31" }),
        m({ id: "ahead", planned_start: "2026-03-01", planned_end: "2026-03-31" }),
      ],
      new Map(),
      NOW,
    );
    expect(chart.bars[0].tone).toBe("late");
    expect(chart.bars[0].stateLabel).toBe("Overdue");
    expect(chart.bars[1].tone).toBe("planned");
  });

  it("never colours a completed milestone as late, however late it ran", () => {
    const chart = buildGantt(
      [
        m({
          id: "a",
          status: "completed",
          planned_end: "2025-08-30",
          actual_start: "2025-07-01",
          actual_end: "2026-01-13",
        }),
      ],
      new Map(),
      NOW,
    );
    expect(chart.bars[0].tone).toBe("done");
    expect(chart.bars[0].progressPct).toBe(100);
  });

  it("carries a word beside every colour", () => {
    const chart = buildGantt(
      [
        m({ id: "a", status: "in_progress", planned_start: "2026-02-01", planned_end: "2026-03-31" }),
      ],
      new Map(),
      NOW,
    );
    expect(chart.bars[0].stateLabel).toBe("In progress");
  });

  it("gives a one-date milestone a visible bar instead of a zero-width sliver", () => {
    const chart = buildGantt(
      [m({ id: "a", planned_start: null, planned_end: "2026-03-10" })],
      new Map(),
      NOW,
    );
    expect(chart.bars[0].widthPct).toBeGreaterThan(0);
    expect(chart.bars[0].dateLabel).toBe("10 Mar 26");
  });

  it("survives reversed dates without a negative width", () => {
    const chart = buildGantt(
      [m({ id: "a", planned_start: "2026-05-01", planned_end: "2026-02-01" })],
      new Map(),
      NOW,
    );
    expect(chart.bars[0].widthPct).toBeGreaterThan(0);
    expect(chart.bars[0].leftPct).toBeGreaterThanOrEqual(0);
  });

  it("carries dependencies through for the links", () => {
    const chart = buildGantt(
      [m({ id: "a" }), m({ id: "b" })],
      new Map([["b", ["a"]]]),
      NOW,
    );
    expect(chart.bars[1].dependsOn).toEqual(["a"]);
    expect(chart.bars[0].dependsOn).toEqual([]);
  });
});

describe("month ticks", () => {
  it("labels each month boundary in the window", () => {
    const chart = buildGantt(
      [m({ id: "a", planned_start: "2026-01-05", planned_end: "2026-04-20" })],
      new Map(),
      NOW,
    );
    expect(chart.ticks.map((t) => t.label)).toEqual([
      "Feb 26",
      "Mar 26",
      "Apr 26",
    ]);
    expect(chart.ticks.every((t) => t.leftPct >= 0 && t.leftPct <= 100)).toBe(true);
  });
});
