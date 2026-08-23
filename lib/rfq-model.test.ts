import { describe, it, expect } from "vitest";
import { landedLineTotal, rankBids } from "./rfq-model";

/**
 * Locks the RFQ landed-cost engine helpers (PROC-RFQ-007/008). These pure
 * functions decide L1/L2/L3 in the bid-comparison matrix, so they must be
 * exact: landed cost arithmetic, tie sharing, and the "no bid" (total ≤ 0)
 * case that must never win.
 */
describe("landedLineTotal", () => {
  it("computes qty × unit_rate + freight", () => {
    expect(landedLineTotal(10, 50, 120)).toBe(620);
  });

  it("defaults freight to 0", () => {
    expect(landedLineTotal(3, 19.99)).toBe(59.97);
  });

  it("returns 0 for a zero line", () => {
    expect(landedLineTotal(0, 100)).toBe(0);
    expect(landedLineTotal(5, 0)).toBe(0);
  });

  it("stays at currency granularity (no floating-point dust)", () => {
    expect(landedLineTotal(1, 0.1, 0.2)).toBe(0.3);
    expect(landedLineTotal(7, 4.2)).toBe(29.4);
  });

  it("freight is flat per line — not multiplied by qty", () => {
    expect(landedLineTotal(2, 10, 50)).toBe(70);
  });
});

describe("rankBids", () => {
  it("ranks lowest total first", () => {
    const ranks = rankBids([
      { vendorId: "a", total: 500 },
      { vendorId: "b", total: 300 },
      { vendorId: "c", total: 900 },
    ]);
    expect(ranks["b"]).toBe(1);
    expect(ranks["a"]).toBe(2);
    expect(ranks["c"]).toBe(3);
  });

  it("ties share a rank; the next distinct total skips (1, 1, 3)", () => {
    const ranks = rankBids([
      { vendorId: "a", total: 300 },
      { vendorId: "b", total: 300 },
      { vendorId: "c", total: 450 },
    ]);
    expect(ranks["a"]).toBe(1);
    expect(ranks["b"]).toBe(1);
    expect(ranks["c"]).toBe(3);
  });

  it("ignores totals ≤ 0 (no bid) so they never rank or win", () => {
    const ranks = rankBids([
      { vendorId: "quoted", total: 400 },
      { vendorId: "empty", total: 0 },
      { vendorId: "negative", total: -50 },
    ]);
    expect(ranks["quoted"]).toBe(1);
    expect(ranks["empty"]).toBeUndefined();
    expect(ranks["negative"]).toBeUndefined();
  });

  it("returns an empty map when nobody quoted", () => {
    expect(rankBids([{ vendorId: "a", total: 0 }])).toEqual({});
    expect(rankBids([])).toEqual({});
  });

  it("treats near-equal totals as ties despite float noise", () => {
    const ranks = rankBids([
      { vendorId: "a", total: 300.001 },
      { vendorId: "b", total: 300.0 },
    ]);
    expect(ranks["a"]).toBe(1);
    expect(ranks["b"]).toBe(1);
  });
});
