import { describe, it, expect } from "vitest";
import {
  milestonesFoot,
  pnl,
  sumBy,
  milestoneOverdue,
  PAYMENT_DIRECTIONS,
  CONTRACT_SOURCES,
} from "./finance-model";

/**
 * Locks the finance pure helpers. All amounts are user-entered config or SUMs
 * of stored rows — these helpers are the only arithmetic allowed (HARD RULE 4).
 */
describe("milestonesFoot", () => {
  it("sums pcts and passes at exactly 100", () => {
    const foot = milestonesFoot([{ pct: 30 }, { pct: 40 }, { pct: 30 }]);
    expect(foot.total).toBe(100);
    expect(foot.ok).toBe(true);
  });

  it("tolerates float noise within ±0.01", () => {
    const foot = milestonesFoot([
      { pct: 33.33 },
      { pct: 33.33 },
      { pct: 33.35 },
    ]);
    expect(foot.total).toBeCloseTo(100.01, 10);
    expect(foot.ok).toBe(true);
  });

  it("fails when the schedule does not total 100%", () => {
    expect(milestonesFoot([{ pct: 50 }, { pct: 25 }])).toEqual({
      total: 75,
      ok: false,
    });
    expect(milestonesFoot([]).ok).toBe(false);
  });
});

describe("pnl", () => {
  it("is inflow − outflow", () => {
    expect(pnl(500_000, 300_000)).toBe(200_000);
  });

  it("goes negative when outflow exceeds inflow", () => {
    expect(pnl(100, 250)).toBe(-150);
  });

  it("coerces string numerics (PostgREST returns numerics as strings)", () => {
    expect(pnl("500" as unknown as number, "200.5" as unknown as number)).toBe(
      299.5,
    );
  });
});

describe("sumBy", () => {
  it("totals a numeric column across rows", () => {
    const rows = [{ amount: "1000" }, { amount: 250 }, { amount: null }];
    expect(sumBy(rows, (r) => Number(r.amount) || 0)).toBe(1250);
  });

  it("returns 0 for an empty list", () => {
    expect(sumBy([], (r: { amount: number }) => r.amount)).toBe(0);
  });

  it("splits payments by direction without mixing them", () => {
    const payments = [
      { direction: "inflow", amount: 500 },
      { direction: "outflow", amount: 200 },
      { direction: "inflow", amount: 300 },
    ];
    const inflow = sumBy(
      payments.filter((p) => p.direction === "inflow"),
      (p) => p.amount,
    );
    const outflow = sumBy(
      payments.filter((p) => p.direction === "outflow"),
      (p) => p.amount,
    );
    expect(inflow).toBe(800);
    expect(outflow).toBe(200);
    expect(pnl(inflow, outflow)).toBe(600);
  });
});

describe("milestoneOverdue", () => {
  it("flags past tentative due dates when work is not done", () => {
    expect(milestoneOverdue("2020-01-01", false)).toBe(true);
  });

  it("never flags completed work", () => {
    expect(milestoneOverdue("2020-01-01", true)).toBe(false);
  });

  it("never flags undated milestones", () => {
    expect(milestoneOverdue(null, false)).toBe(false);
  });

  it("does not flag today or future dates as overdue", () => {
    const now = new Date();
    const iso = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    expect(milestoneOverdue(iso, false)).toBe(false);
    expect(milestoneOverdue("2999-12-31", false)).toBe(false);
  });
});

describe("enums", () => {
  it("keeps directions and sources closed", () => {
    expect(PAYMENT_DIRECTIONS).toEqual(["inflow", "outflow"]);
    expect(CONTRACT_SOURCES).toEqual(["client", "vendor"]);
  });
});
