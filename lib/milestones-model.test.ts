import { describe, it, expect } from "vitest";
import {
  groupByScope,
  milestoneVariance,
  rollupMilestones,
  scheduleHealth,
  statusOf,
  type ProjectMilestone,
} from "./milestones-model";

const NOW = new Date(2026, 7, 28); // 28 Aug 2026

function ms(over: Partial<ProjectMilestone> & { id: string }): ProjectMilestone {
  return {
    project_id: "p1",
    scope_item_id: null,
    name: "Site Measurements",
    status: "not_started",
    progress_pct: 0,
    planned_start: "2026-07-01",
    planned_end: "2026-08-30",
    actual_start: null,
    actual_end: null,
    assignee_id: null,
    client_visible: false,
    last_update: null,
    sort_order: 0,
    ...over,
  };
}

describe("statusOf", () => {
  it("falls back to not_started on an unknown value", () => {
    expect(statusOf({ status: "invented" })).toBe("not_started");
  });
});

describe("rollupMilestones", () => {
  const rows = [
    ms({ id: "1", status: "completed", actual_end: "2026-06-18", planned_end: "2026-06-01" }),
    ms({ id: "2", status: "in_progress", progress_pct: 40, planned_end: "2026-08-05" }),
    ms({ id: "3", status: "not_started", planned_end: "2026-09-15" }),
    ms({ id: "4", status: "blocked", planned_end: "2026-09-20" }),
  ];

  it("counts each status", () => {
    expect(rollupMilestones(rows, NOW)).toMatchObject({
      total: 4,
      completed: 1,
      inProgress: 1,
      notStarted: 1,
      blocked: 1,
    });
  });

  it("treats a completed milestone as 100% even when nobody typed the number", () => {
    // (100 + 40 + 0 + 0) / 4
    expect(rollupMilestones(rows, NOW).actualPct).toBe(35);
  });

  it("derives the estimate from planned dates instead of hardcoding 100%", () => {
    // Two of four were due by 28 Aug.
    expect(rollupMilestones(rows, NOW).estimatedPct).toBe(50);
  });

  it("finds the last thing finished and the next thing due", () => {
    const r = rollupMilestones(rows, NOW);
    expect(r.lastCompleted?.id).toBe("1");
    expect(r.upcoming?.id).toBe("2");
  });

  it("never picks a completed milestone as upcoming", () => {
    const r = rollupMilestones(
      [ms({ id: "1", status: "completed", actual_end: "2026-08-01", planned_end: "2026-08-01" })],
      NOW,
    );
    expect(r.upcoming).toBe(null);
  });

  it("is safe on a project with no plan", () => {
    expect(rollupMilestones([], NOW)).toMatchObject({
      total: 0,
      actualPct: 0,
      estimatedPct: 0,
      lastCompleted: null,
      upcoming: null,
    });
  });
});

describe("scheduleHealth", () => {
  it("reproduces the frame's callout", () => {
    const health = scheduleHealth({
      total: 72,
      completed: 17,
      inProgress: 7,
      notStarted: 48,
      blocked: 0,
      actualPct: 47.51,
      estimatedPct: 100,
      lastCompleted: null,
      upcoming: null,
    });
    expect(health.behind).toBe(true);
    expect(health.label).toBe("Behind schedule, needs attention (▼52.49%)");
  });

  it("says nothing alarming about a project with no plan", () => {
    const health = scheduleHealth(rollupMilestones([], NOW));
    expect(health.behind).toBe(false);
    expect(health.label).toBe("No plan yet");
  });
});

describe("milestoneVariance", () => {
  it("reads a finished milestone against its plan", () => {
    const v = milestoneVariance(
      ms({ id: "1", status: "completed", planned_end: "2025-08-30", actual_end: "2026-06-13" }),
    );
    expect(v.label).toBe("Completed 287 days late");
  });

  it("reads an unfinished one against today", () => {
    const v = milestoneVariance(ms({ id: "1", planned_end: "2026-01-01" }));
    expect(v.state).toBe("late");
  });
});

describe("groupByScope", () => {
  it("bands milestones by scope group and reconciles to the total", () => {
    const rows = [
      ms({ id: "1", scope_item_id: "design", status: "completed", actual_end: "2026-01-01" }),
      ms({ id: "2", scope_item_id: "design" }),
      ms({ id: "3", scope_item_id: "exec" }),
      ms({ id: "4", scope_item_id: null }),
    ];
    const groups = groupByScope(rows, new Map([["design", "Design Team"], ["exec", "Execution Team"]]), NOW);
    expect(groups.map((g) => [g.name, g.total])).toEqual([
      ["Design Team", 2],
      ["Default project scope", 1],
      ["Execution Team", 1],
    ]);
    // The reconciliation that proves the grouping is real (105024: 14+12+4+28+14 = 72).
    expect(groups.reduce((n, g) => n + g.total, 0)).toBe(rows.length);
  });

  it("names a scope group whose scope item has gone missing", () => {
    const groups = groupByScope([ms({ id: "1", scope_item_id: "gone" })], new Map(), NOW);
    expect(groups[0].name).toBe("Unnamed scope");
  });
});
