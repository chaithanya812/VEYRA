import { describe, it, expect } from "vitest";

import {
  describeFilter,
  filterMatrix,
  paymentsMatrix,
  summariseMatrix,
  type MatrixContract,
  type MatrixMilestone,
  type MatrixPayment,
  type MatrixProject,
} from "./payments-dashboard-model";

/**
 * Two projects, deliberately unequal: one with both sides of the money and a
 * payment attached to no contract, one with a value and nothing else. The
 * second is the row a dashboard is most tempted to drop.
 */
const projects: MatrixProject[] = [
  {
    id: "p1",
    name: "Malviya Nagar 3BHK",
    clientName: "Mr Suresh Reddy",
    projectValue: 1800000,
    stage: "execution",
  },
  { id: "p2", name: "Whitefield Villa", clientName: null, projectValue: 500000, stage: "planning" },
];

const contracts: MatrixContract[] = [
  { id: "cin", project_id: "p1", amount: 1800000, source: "client" },
  { id: "cout", project_id: "p1", amount: 240000, source: "vendor" },
  // A contract on a project nobody can name must not conjure a row.
  { id: "ghost", project_id: "gone", amount: 999999, source: "vendor" },
];

const milestonesByContract = new Map<string, MatrixMilestone[]>([
  [
    "cin",
    [
      { pct: 20, amount: 360000, work_done: true },
      { pct: 20, amount: 360000, work_done: true },
      { pct: 30, amount: 540000, work_done: true },
      { pct: 30, amount: 540000, work_done: false },
    ],
  ],
  [
    "cout",
    [
      { pct: 40, amount: 96000, work_done: true },
      { pct: 35, amount: 84000, work_done: false },
      { pct: 25, amount: 60000, work_done: false },
    ],
  ],
]);

const payments: MatrixPayment[] = [
  { direction: "inflow", amount: 360000, contract_id: "cin", project_id: "p1" },
  { direction: "inflow", amount: 200000, contract_id: "cin", project_id: "p1" },
  // Century Ply, part payment — real money out, attached to no contract.
  { direction: "outflow", amount: 50000, contract_id: null, project_id: "p1" },
  // Belongs to nobody this matrix can render.
  { direction: "outflow", amount: 7000, contract_id: null, project_id: "gone" },
];

const rows = paymentsMatrix({ projects, contracts, milestonesByContract, payments });

describe("paymentsMatrix", () => {
  it("gives every project a row, including one with no money on it", () => {
    expect(rows.map((r) => r.projectId)).toEqual(["p1", "p2"]);
    const empty = rows[1];
    expect(empty.clientName).toBe("(No client recorded)");
    expect(empty.fundsReceived).toBe(0);
    expect(empty.committed).toBe(0);
    expect(empty.expectedPnl).toBe(500000);
  });

  it("computes the inflow group from milestones and payments, not from names", () => {
    const r = rows[0];
    expect(r.projectValue).toBe(1800000);
    expect(r.totalReceivables).toBe(1260000);
    expect(r.fundsReceived).toBe(560000);
    expect(r.receivableDues).toBe(700000);
  });

  it("keeps Committed and Billed apart — the settled vocabulary", () => {
    const r = rows[0];
    expect(r.estimatedExpenses).toBe(240000);
    expect(r.disbursed).toBe(50000);
    expect(r.committed).toBe(190000); // agreed − disbursed
    expect(r.billed).toBe(96000); // work signed off
    expect(r.dues).toBe(46000); // billed − disbursed
    expect(r.committed).not.toBe(r.billed);
  });

  it("counts a payment attached to no contract, and says how much that was", () => {
    const r = rows[0];
    expect(r.unattachedOutflow).toBe(50000);
    expect(r.unattachedInflow).toBe(0);
    expect(r.cashFlow).toBe(510000); // 560000 in − 50000 out
    expect(r.expectedPnl).toBe(1560000);
  });

  it("drops contracts and payments whose project cannot be named", () => {
    expect(rows.some((r) => r.projectId === "gone")).toBe(false);
    expect(summariseMatrix(rows).estimatedExpenses).toBe(240000);
  });

  it("never lets one project read another's milestones", () => {
    const solo = paymentsMatrix({
      projects: [projects[1]],
      contracts,
      milestonesByContract,
      payments,
    });
    expect(solo).toHaveLength(1);
    expect(solo[0].billed).toBe(0);
    expect(solo[0].totalReceivables).toBe(0);
  });
});

/**
 * The invariant that matters most on this screen. A header that disagrees with
 * the table under it is worse than no header, so the band is asserted equal to
 * the sum of the VISIBLE rows under every filter, not just the unfiltered one.
 */
describe("summariseMatrix equals the sum of the visible rows", () => {
  const filters = [
    {},
    { stages: ["planning"] },
    { stages: ["execution"] },
    { stages: ["planning", "execution"] },
    { stages: ["handover"] },
    { q: "malviya" },
    { q: "suresh" },
    { q: "no-such-project" },
    { duesOnly: true },
    { stages: ["planning"], duesOnly: true },
  ];

  const fields = [
    "expectedPnl",
    "projectValue",
    "totalReceivables",
    "fundsReceived",
    "receivableDues",
    "estimatedExpenses",
    "disbursed",
    "committed",
    "billed",
    "dues",
    "cashFlow",
  ] as const;

  for (const f of filters) {
    it(`foots under ${describeFilter(f) ?? "no filter"}`, () => {
      const visible = filterMatrix(rows, f);
      const band = summariseMatrix(visible);
      expect(band.totalProjects).toBe(visible.length);
      for (const key of fields) {
        const manual =
          Math.round(visible.reduce((a, r) => a + r[key], 0) * 100) / 100;
        expect(band[key]).toBe(manual);
      }
    });
  }

  it("asserted every filter shape, not an empty list", () => {
    expect(filters.length).toBeGreaterThanOrEqual(10);
    expect(fields.length).toBeGreaterThanOrEqual(11);
  });
});

describe("filterMatrix", () => {
  it("matches on client name as well as project name", () => {
    expect(filterMatrix(rows, { q: "SURESH" }).map((r) => r.projectId)).toEqual(["p1"]);
    expect(filterMatrix(rows, { q: "whitefield" }).map((r) => r.projectId)).toEqual(["p2"]);
  });

  it("keeps only rows with something still payable", () => {
    expect(filterMatrix(rows, { duesOnly: true }).map((r) => r.projectId)).toEqual(["p1"]);
  });

  it("treats an empty stage list as no stage filter at all", () => {
    expect(filterMatrix(rows, { stages: [] })).toHaveLength(2);
  });
});

describe("describeFilter", () => {
  it("says nothing when nothing is filtered", () => {
    expect(describeFilter()).toBeNull();
    expect(describeFilter({ stages: [], q: "  " })).toBeNull();
  });

  it("reads like the frame's chip", () => {
    expect(describeFilter({ stages: ["Planning"] })).toBe("Project Stage: Planning");
    expect(describeFilter({ stages: ["Planning", "Execution", "Handover"] })).toBe(
      "Project Stage: Planning + 2",
    );
    expect(describeFilter({ q: "malviya", duesOnly: true })).toBe(
      "Search: malviya · Dues outstanding",
    );
  });
});
