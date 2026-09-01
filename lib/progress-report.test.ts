import { describe, it, expect } from "vitest";
import {
  reportMilestones,
  reportPhotoCount,
  totalProjectDays,
  withheldPhotoCount,
} from "./progress-report";
import type { ProjectMilestone } from "./milestones-model";

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

describe("reportMilestones", () => {
  const rows = [
    ms({ id: "1", client_visible: true }),
    ms({ id: "2", client_visible: false, name: "Internal snag list" }),
  ];

  it("shows everything on 'all'", () => {
    expect(reportMilestones(rows, "all")).toHaveLength(2);
  });

  it("withholds internal milestones on 'client visible only'", () => {
    // This is the whole reason client_visible exists — the report is what
    // reaches the client, and VEYRA ships no client portal.
    const shown = reportMilestones(rows, "client_visible");
    expect(shown.map((m) => m.id)).toEqual(["1"]);
  });

  it("shows none on 'none'", () => {
    expect(reportMilestones(rows, "none")).toEqual([]);
  });

  it("returns nothing rather than everything when none are marked visible", () => {
    // Failing open here would leak the internal plan to a client.
    const internalOnly = [ms({ id: "1" }), ms({ id: "2" })];
    expect(reportMilestones(internalOnly, "client_visible")).toEqual([]);
  });
});

describe("totalProjectDays", () => {
  it("counts inclusively, the way a schedule is read", () => {
    expect(totalProjectDays("2026-08-01", "2026-08-31")).toBe(31);
  });

  it("is 1 for a single-day project", () => {
    expect(totalProjectDays("2026-08-01", "2026-08-01")).toBe(1);
  });

  it("has no answer without both dates", () => {
    expect(totalProjectDays(null, "2026-08-31")).toBe(null);
    expect(totalProjectDays("2026-08-01", null)).toBe(null);
  });

  it("never goes negative on reversed dates", () => {
    expect(totalProjectDays("2026-08-31", "2026-08-01")).toBe(0);
  });
});

describe("site photo counts", () => {
  const counts = { photoCount: 12, clientVisiblePhotoCount: 4 };

  it("counts what the client is allowed to see, not what exists", () => {
    expect(reportPhotoCount(counts, "all")).toBe(12);
    expect(reportPhotoCount(counts, "client_visible")).toBe(4);
    expect(reportPhotoCount(counts, "none")).toBe(0);
  });

  it("says how many were held back, so the gap is never silent", () => {
    expect(withheldPhotoCount(counts, "client_visible")).toBe(8);
    // Nothing is withheld when everything is being sent.
    expect(withheldPhotoCount(counts, "all")).toBe(0);
    expect(withheldPhotoCount(counts, "none")).toBe(0);
  });

  it("reports none rather than all when nothing is marked visible", () => {
    const internalOnly = { photoCount: 9, clientVisiblePhotoCount: 0 };
    expect(reportPhotoCount(internalOnly, "client_visible")).toBe(0);
    expect(withheldPhotoCount(internalOnly, "client_visible")).toBe(9);
  });

  it("never reports a negative withholding if the counts disagree", () => {
    expect(withheldPhotoCount({ photoCount: 2, clientVisiblePhotoCount: 5 }, "client_visible")).toBe(0);
  });
});
