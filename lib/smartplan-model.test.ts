import { describe, it, expect } from "vitest";
import {
  MAX_STEPS,
  datePlan,
  parseSmartPlan,
  planEndDate,
  type SmartPlanStep,
} from "./smartplan-model";

const GOOD = {
  note: "Design first, then execution.",
  milestones: [
    { name: "Site Measurements", offset_days: 0, duration_days: 3, depends_on: [] },
    { name: "3D Modelling", offset_days: 3, duration_days: 7, depends_on: [0] },
    { name: "Panelling Work", offset_days: 10, duration_days: 14, depends_on: [1] },
  ],
};

describe("parseSmartPlan", () => {
  it("reads a well-formed proposal", () => {
    const r = parseSmartPlan(GOOD);
    expect("plan" in r).toBe(true);
    if (!("plan" in r)) return;
    expect(r.plan.steps.map((s) => s.name)).toEqual([
      "Site Measurements",
      "3D Modelling",
      "Panelling Work",
    ]);
    expect(r.plan.note).toBe("Design first, then execution.");
  });

  it("DROPS any step carrying a price, rate, cost or quantity", () => {
    // HARD RULE 2. A model that attaches money to a milestone is not to be
    // half-trusted — the step goes, not just the field.
    const r = parseSmartPlan({
      milestones: [
        { name: "Site Measurements", offset_days: 0, duration_days: 1, depends_on: [] },
        { name: "Panelling Work", offset_days: 1, duration_days: 5, rate: 450 },
        { name: "Paint Work", offset_days: 6, duration_days: 3, estimated_cost: 90000 },
        { name: "Cleaning", offset_days: 9, duration_days: 1, qty: 4 },
      ],
    });
    expect("plan" in r).toBe(true);
    if (!("plan" in r)) return;
    expect(r.plan.steps.map((s) => s.name)).toEqual(["Site Measurements"]);
  });

  it("never lets a date through — offsets only", () => {
    const r = parseSmartPlan({
      milestones: [
        {
          name: "Site Marking",
          offset_days: 2,
          duration_days: 4,
          depends_on: [],
          planned_start: "2026-01-01",
          planned_end: "2026-01-05",
        },
      ],
    });
    if (!("plan" in r)) throw new Error("expected a plan");
    expect(Object.keys(r.plan.steps[0]).sort()).toEqual([
      "dependsOn",
      "durationDays",
      "name",
      "offsetDays",
    ]);
  });

  it("repairs a nonsensical offset or duration instead of failing", () => {
    const r = parseSmartPlan({
      milestones: [{ name: "Kickoff", offset_days: -5, duration_days: 0 }],
    });
    if (!("plan" in r)) throw new Error("expected a plan");
    expect(r.plan.steps[0]).toMatchObject({ offsetDays: 0, durationDays: 1 });
  });

  it("drops a forward or self dependency — there is no honest way to draw a cycle", () => {
    const r = parseSmartPlan({
      milestones: [
        { name: "A", offset_days: 0, duration_days: 1, depends_on: [1, 0] },
        { name: "B", offset_days: 1, duration_days: 1, depends_on: [0] },
      ],
    });
    if (!("plan" in r)) throw new Error("expected a plan");
    expect(r.plan.steps[0].dependsOn).toEqual([]);
    expect(r.plan.steps[1].dependsOn).toEqual([0]);
  });

  it("caps a runaway proposal", () => {
    const r = parseSmartPlan({
      milestones: Array.from({ length: 200 }, (_, i) => ({
        name: `Step ${i}`,
        offset_days: i,
        duration_days: 1,
      })),
    });
    if (!("plan" in r)) throw new Error("expected a plan");
    expect(r.plan.steps).toHaveLength(MAX_STEPS);
  });

  it("skips a nameless row rather than inventing a name", () => {
    const r = parseSmartPlan({
      milestones: [{ offset_days: 0, duration_days: 1 }, { name: "Real", offset_days: 1, duration_days: 1 }],
    });
    if (!("plan" in r)) throw new Error("expected a plan");
    expect(r.plan.steps.map((s) => s.name)).toEqual(["Real"]);
  });

  it("reports an unusable response as an error, not as an empty plan", () => {
    expect(parseSmartPlan(null)).toHaveProperty("error");
    expect(parseSmartPlan({ milestones: "soon" })).toHaveProperty("error");
    expect(parseSmartPlan({ milestones: [] })).toHaveProperty("error");
  });
});

describe("datePlan", () => {
  const steps: SmartPlanStep[] = [
    { name: "A", offsetDays: 0, durationDays: 3, dependsOn: [] },
    { name: "B", offsetDays: 3, durationDays: 7, dependsOn: [0] },
  ];

  it("computes dates from the start the user chose — never from the model", () => {
    const { dated } = datePlan(steps, "2026-03-01");
    expect(dated[0]).toMatchObject({ plannedStart: "2026-03-01", plannedEnd: "2026-03-03" });
    expect(dated[1]).toMatchObject({ plannedStart: "2026-03-04", plannedEnd: "2026-03-10" });
  });

  it("is inclusive — a one-day step starts and ends on the same day", () => {
    const { dated } = datePlan(
      [{ name: "A", offsetDays: 0, durationDays: 1, dependsOn: [] }],
      "2026-03-01",
    );
    expect(dated[0].plannedStart).toBe(dated[0].plannedEnd);
  });

  it("crosses a month and a year boundary correctly", () => {
    const { dated } = datePlan(
      [{ name: "A", offsetDays: 300, durationDays: 40, dependsOn: [] }],
      "2025-07-01",
    );
    expect(dated[0].plannedStart).toBe("2026-04-27");
    expect(dated[0].plannedEnd).toBe("2026-06-05");
  });

  it("refuses a start date it cannot read", () => {
    expect(datePlan(steps, "not-a-date").error).toBeTruthy();
  });
});

describe("planEndDate", () => {
  it("is the last day the plan touches, not the last row", () => {
    const { dated } = datePlan(
      [
        { name: "Long", offsetDays: 0, durationDays: 60, dependsOn: [] },
        { name: "Short", offsetDays: 5, durationDays: 2, dependsOn: [] },
      ],
      "2026-01-01",
    );
    expect(planEndDate(dated)).toBe("2026-03-01");
  });

  it("is null for an empty plan", () => {
    expect(planEndDate([])).toBeNull();
  });
});
