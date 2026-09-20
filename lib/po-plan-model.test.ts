import { describe, expect, it } from "vitest";
import {
  allocateMilestoneAmounts,
  validateMilestones,
} from "./po-plan-model";

/**
 * D4 / D5. The allocator must foot to the PO amount on awkward splits; the
 * validator must refuse an empty plan, a non-positive pct, and a set that
 * does not sum to 100%. No LLM produces a number — these are arithmetic on
 * typed pcts.
 */

function sumAmounts(rows: { amount: number }[]): number {
  return rows.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100;
}

describe("validateMilestones", () => {
  it("refuses an empty plan", () => {
    const r = validateMilestones([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least one milestone/i);
  });

  it("refuses a pct of 0", () => {
    const r = validateMilestones([
      { label: "Advance", pct: 0 },
      { label: "Balance", pct: 100 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Advance/);
    if (!r.ok) expect(r.error).toMatch(/greater than 0/);
  });

  it("refuses a negative pct", () => {
    const r = validateMilestones([{ label: "Odd", pct: -10 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/greater than 0/);
  });

  it("refuses a set that sums to 90", () => {
    const r = validateMilestones([
      { label: "Advance", pct: 40 },
      { label: "Delivery", pct: 50 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/add up to 100%/);
      expect(r.error).toMatch(/90%/);
    }
  });

  it("accepts 25 / 45 / 30", () => {
    expect(
      validateMilestones([
        { label: "Advance", pct: 25 },
        { label: "Delivery", pct: 45 },
        { label: "Installation", pct: 30 },
      ]).ok,
    ).toBe(true);
  });

  it("accepts a single 100% milestone", () => {
    expect(validateMilestones([{ label: "In full", pct: 100 }]).ok).toBe(true);
  });

  it("accepts 2dp thirds that foot to 100 (33.33 / 33.33 / 33.34)", () => {
    expect(
      validateMilestones([
        { label: "A", pct: 33.33 },
        { label: "B", pct: 33.33 },
        { label: "C", pct: 33.34 },
      ]).ok,
    ).toBe(true);
  });

  it("allows 0.01 of slack so 33.33×3 = 99.99 is not refused", () => {
    expect(
      validateMilestones([
        { label: "A", pct: 33.33 },
        { label: "B", pct: 33.33 },
        { label: "C", pct: 33.33 },
      ]).ok,
    ).toBe(true);
  });

  it("refuses 99.98 (outside the 0.01 tolerance)", () => {
    const r = validateMilestones([
      { label: "A", pct: 49.99 },
      { label: "B", pct: 49.99 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/99\.98%/);
  });
});

describe("allocateMilestoneAmounts", () => {
  it("returns no rows for an empty plan", () => {
    expect(allocateMilestoneAmounts([], 100000)).toEqual([]);
  });

  it("a single 100% milestone is the whole PO amount", () => {
    const rows = allocateMilestoneAmounts([{ label: "In full", pct: 100 }], 8750.5);
    expect(rows).toEqual([{ label: "In full", pct: 100, amount: 8750.5 }]);
  });

  it("25 / 45 / 30 on ₹100,000 is exact", () => {
    const rows = allocateMilestoneAmounts(
      [
        { label: "Advance", pct: 25 },
        { label: "Delivery", pct: 45 },
        { label: "Installation", pct: 30 },
      ],
      100000,
    );
    expect(rows.map((r) => r.amount)).toEqual([25000, 45000, 30000]);
    expect(sumAmounts(rows)).toBe(100000);
  });

  it("33.33 / 33.33 / 33.34 on ₹100,000 foots exactly", () => {
    const rows = allocateMilestoneAmounts(
      [
        { label: "A", pct: 33.33 },
        { label: "B", pct: 33.33 },
        { label: "C", pct: 33.34 },
      ],
      100000,
    );
    expect(sumAmounts(rows)).toBe(100000);
  });

  it("thirds on ₹10 (does not divide evenly) still foots — naive round2 would not", () => {
    // Naive: round2(3.333)+round2(3.333)+round2(3.334) = 3.33+3.33+3.33 = 9.99.
    const rows = allocateMilestoneAmounts(
      [
        { label: "A", pct: 33.33 },
        { label: "B", pct: 33.33 },
        { label: "C", pct: 33.34 },
      ],
      10,
    );
    expect(sumAmounts(rows)).toBe(10);
    expect(rows.every((r) => Number.isInteger(Math.round(r.amount * 100)))).toBe(true);
  });

  it("thirds on ₹1 (paise remainder) still foots to the PO amount", () => {
    const rows = allocateMilestoneAmounts(
      [
        { label: "A", pct: 33.33 },
        { label: "B", pct: 33.33 },
        { label: "C", pct: 33.34 },
      ],
      1,
    );
    expect(sumAmounts(rows)).toBe(1);
  });

  it("2dp pcts on an amount that does not divide evenly (₹10,001)", () => {
    const rows = allocateMilestoneAmounts(
      [
        { label: "Advance", pct: 25 },
        { label: "Delivery", pct: 45 },
        { label: "Installation", pct: 30 },
      ],
      10001,
    );
    expect(sumAmounts(rows)).toBe(10001);
  });

  it("the last row absorbs the remainder so the sum cannot drift", () => {
    const awkward = [1, 10, 99, 100, 333, 10001, 99999.99, 123456.78];
    const plans = [
      [
        { label: "A", pct: 33.33 },
        { label: "B", pct: 33.33 },
        { label: "C", pct: 33.34 },
      ],
      [
        { label: "Advance", pct: 25 },
        { label: "Delivery", pct: 45 },
        { label: "Installation", pct: 30 },
      ],
      [{ label: "All", pct: 100 }],
      [
        { label: "A", pct: 10.11 },
        { label: "B", pct: 20.22 },
        { label: "C", pct: 30.33 },
        { label: "D", pct: 39.34 },
      ],
    ];
    for (const amount of awkward) {
      for (const plan of plans) {
        const rows = allocateMilestoneAmounts(plan, amount);
        expect(
          Math.round(sumAmounts(rows) * 100),
          `${plan.map((p) => p.pct).join("/")} of ${amount}`,
        ).toBe(Math.round(amount * 100));
      }
    }
  });

  it("treats a numeric string the way PostgREST returns amount", () => {
    const rows = allocateMilestoneAmounts([{ label: "All", pct: 100 }], "2500.50");
    expect(rows[0]?.amount).toBe(2500.5);
  });
});
