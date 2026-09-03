import { describe, it, expect } from "vitest";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_META,
  categorySummary,
  nextVendorStatuses,
  vendorProjectTotals,
  vendorProjects,
  vendorRatingLabel,
  vendorStatusOf,
  workingModelOf,
} from "./vendors-model";

/**
 * Locks the client-safe vendors model: the curated category seed and the
 * rating label rule — null means "Not rated" (grey), never a fake zero.
 */
describe("vendorRatingLabel", () => {
  it('returns "Not rated" for null (rating is computed later, never faked)', () => {
    expect(vendorRatingLabel(null)).toBe("Not rated");
  });

  it("formats to one decimal + star", () => {
    expect(vendorRatingLabel(4.25)).toBe("4.3 ★");
    expect(vendorRatingLabel(5)).toBe("5.0 ★");
    expect(vendorRatingLabel(0)).toBe("0.0 ★");
  });
});

describe("VENDOR_CATEGORIES", () => {
  it("covers common construction/interior supplier categories", () => {
    expect(VENDOR_CATEGORIES.length).toBeGreaterThan(5);
    expect(VENDOR_CATEGORIES).toContain("Hardware");
    expect(VENDOR_CATEGORIES).toContain("Plywood");
    expect(VENDOR_CATEGORIES).toContain("Electrical");
  });

  it("has no duplicate categories", () => {
    expect(new Set(VENDOR_CATEGORIES).size).toBe(VENDOR_CATEGORIES.length);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   VENDORS, COMPANY-WIDE (PLAN-V4 §10.3, frames `110215` / `110234`)
   ══════════════════════════════════════════════════════════════════════════ */

describe("workingModelOf / vendorStatusOf", () => {
  it("read the frame's vocabulary and fall back safely", () => {
    expect(workingModelOf("material")).toBe("material");
    expect(workingModelOf("labour")).toBe("labour");
    expect(workingModelOf(null)).toBe("labour_material");
    expect(workingModelOf("subcontract")).toBe("labour_material");

    expect(vendorStatusOf("onboarded")).toBe("onboarded");
    expect(vendorStatusOf(undefined)).toBe("created");
    expect(vendorStatusOf("banned")).toBe("created");
  });

  it("gives every status a label and a non-red tone", () => {
    // A vendor nobody has checked yet is not an alarm. Red's status job in
    // this module is nothing at all (DESIGN-DIRECTION §2).
    for (const s of VENDOR_STATUSES) {
      const meta = VENDOR_STATUS_META[s];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(["neutral", "active", "positive"]).toContain(meta.tone);
    }
  });
});

describe("nextVendorStatuses", () => {
  it("moves forward only — a vendor is not un-verified by a dropdown", () => {
    expect(nextVendorStatuses("created")).toEqual(["verified", "onboarded"]);
    expect(nextVendorStatuses("verified")).toEqual(["onboarded"]);
    expect(nextVendorStatuses("onboarded")).toEqual([]);
  });
});

describe("categorySummary", () => {
  it("shows the first trade and counts the rest", () => {
    // `Carpentry Woodwork + 2` — the overflow is data, not decoration: a cell
    // showing one of three trades makes a three-trade vendor look like a
    // one-trade vendor to anyone scanning the column.
    expect(categorySummary(["Carpentry Woodwork", "Plywood", "Hardware"])).toEqual({
      first: "Carpentry Woodwork",
      overflow: 2,
    });
    expect(categorySummary(["Plywood"])).toEqual({ first: "Plywood", overflow: 0 });
    expect(categorySummary([])).toEqual({ first: null, overflow: 0 });
    expect(categorySummary(["  ", "Paint"])).toEqual({ first: "Paint", overflow: 0 });
  });
});

describe("vendorProjects", () => {
  const names = new Map([
    ["p1", { name: "Interior Company", clientName: "Radhika Rana" }],
    ["p2", { name: "Sudha Interior", clientName: "Deepika" }],
  ]);

  it("reproduces the frame's arithmetic exactly", () => {
    // `110234`: Sudha Interior — agreed 27,000, disbursed 13,500,
    // Total Payables 13,500, Payable Dues 0. Only one pair of formulas fits:
    //   Total Payables = agreed − disbursed
    //   Payable Dues   = billed − disbursed
    const rows = vendorProjects({
      contracts: [{ id: "c1", project_id: "p2", amount: 27000 }],
      milestonesByContract: new Map([
        ["c1", [{ amount: 13500, work_done: true }, { amount: 13500, work_done: false }]],
      ]),
      paymentsByProject: new Map([["p2", [{ amount: 13500 }]]]),
      projectNames: names,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectName: "Sudha Interior",
      clientName: "Deepika",
      agreed: 27000,
      disbursed: 13500,
      billed: 13500,
      outstanding: 13500,
      dues: 0,
    });
  });

  it("does not clamp an over-payment to zero", () => {
    // The frame's `project - 1wh5kos`: agreed 0, disbursed 1,000, both figures
    // −1,000. Flooring it would hide the one row somebody needed to see.
    const rows = vendorProjects({
      contracts: [],
      milestonesByContract: new Map(),
      paymentsByProject: new Map([["p1", [{ amount: 1000 }]]]),
      projectNames: names,
    });
    expect(rows[0].outstanding).toBe(-1000);
    expect(rows[0].dues).toBe(-1000);
    expect(rows[0].contractCount).toBe(0);
  });

  it("keeps a contract whose project never resolved, rather than dropping it", () => {
    // Money owed to a vendor does not stop being owed because a label failed
    // to match a project name (0028).
    const rows = vendorProjects({
      contracts: [{ id: "c1", project_id: null, amount: 5000 }],
      milestonesByContract: new Map(),
      paymentsByProject: new Map(),
      projectNames: names,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBeNull();
    expect(rows[0].projectName).toBeNull();
    expect(rows[0].agreed).toBe(5000);
  });

  it("counts only signed-off milestones as billed", () => {
    const rows = vendorProjects({
      contracts: [{ id: "c1", project_id: "p1", amount: 100 }],
      milestonesByContract: new Map([
        ["c1", [{ amount: 40, work_done: true }, { amount: 60, work_done: null }]],
      ]),
      paymentsByProject: new Map(),
      projectNames: names,
    });
    expect(rows[0].billed).toBe(40);
    expect(rows[0].dues).toBe(40);
    expect(rows[0].outstanding).toBe(100);
  });

  it("adds several contracts on one project into a single row", () => {
    const rows = vendorProjects({
      contracts: [
        { id: "c1", project_id: "p1", amount: 20000 },
        { id: "c2", project_id: "p1", amount: 5000 },
      ],
      milestonesByContract: new Map(),
      paymentsByProject: new Map(),
      projectNames: names,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].agreed).toBe(25000);
    expect(rows[0].contractCount).toBe(2);
  });

  it("sorts by commitment so the row order does not shuffle as payments land", () => {
    const rows = vendorProjects({
      contracts: [
        { id: "c1", project_id: "p1", amount: 100 },
        { id: "c2", project_id: "p2", amount: 900 },
      ],
      milestonesByContract: new Map(),
      paymentsByProject: new Map([["p1", [{ amount: 90 }]]]),
      projectNames: names,
    });
    expect(rows.map((r) => r.projectName)).toEqual([
      "Sudha Interior",
      "Interior Company",
    ]);
  });
});

describe("vendorProjectTotals", () => {
  it("sums the rows beneath it, and the header can be checked against them", () => {
    const rows = vendorProjects({
      contracts: [
        { id: "c1", project_id: "p1", amount: 745000 },
      ],
      milestonesByContract: new Map([
        ["c1", [{ amount: 20600, work_done: true }]],
      ]),
      paymentsByProject: new Map([["p1", [{ amount: 14500 }]]]),
      projectNames: new Map([["p1", { name: "P", clientName: null }]]),
    });
    const t = vendorProjectTotals(rows);
    // The frame's header: Estimated 7,45,000 · Disbursed 14,500 · Dues 6,100.
    expect(t.estimatedExpenses).toBe(745000);
    expect(t.disbursed).toBe(14500);
    expect(t.dues).toBe(6100);
    expect(t.outstanding).toBe(730500);
    expect(t.projectCount).toBe(1);
  });

  it("is zero across the board for a vendor on nothing", () => {
    const t = vendorProjectTotals([]);
    expect(t).toEqual({
      estimatedExpenses: 0,
      disbursed: 0,
      billed: 0,
      outstanding: 0,
      dues: 0,
      projectCount: 0,
    });
  });
});
