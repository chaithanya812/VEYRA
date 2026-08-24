import { describe, it, expect } from "vitest";
import {
  round2,
  round3,
  effectiveQty,
  panelAreaSqm,
  panelBandingMm,
  cutlistTotals,
  bomTotals,
} from "./production-model";

/**
 * BOM + Cutlist math is a PURE computation on user-entered dimensions/config —
 * never an LLM output (HARD RULE 2). These are the numbers the factory cuts
 * boards by, so every helper here is pinned by exact assertions: waste-adjusted
 * effective qty, panel area in sqm, edge-banding run per panel and per
 * cutlist, with NaN/negative guards degrading to 0 instead of poisoning a job.
 */
describe("rounding helpers", () => {
  it("round2 mirrors quotations-model (paise precision)", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10 / 3)).toBe(3.33);
    expect(round2(2)).toBe(2);
  });

  it("round3 gives qty/area precision", () => {
    expect(round3(10 / 3)).toBe(3.333);
    expect(round3(0.2405)).toBe(0.241);
    expect(round3(7)).toBe(7);
  });
});

describe("effectiveQty", () => {
  it("qty × (1 + waste%/100)", () => {
    expect(effectiveQty(10, 5)).toBe(10.5); // 10 @ 5% → 10.5
    expect(effectiveQty(100, 12)).toBe(112);
    expect(effectiveQty(2.5, 0)).toBe(2.5);
    expect(effectiveQty(6, 100)).toBe(12); // full doubling at 100%
  });

  it("rounds to 3 decimals", () => {
    expect(effectiveQty(3.3333, 5)).toBe(3.5); // 3.499965 → 3.5
    expect(effectiveQty(0.123456789, 0)).toBe(0.123);
  });

  it("guards: non-finite or negative inputs degrade safely", () => {
    // A bad qty poisons the row → 0.
    expect(effectiveQty(Number.NaN, 5)).toBe(0);
    expect(effectiveQty(Number.POSITIVE_INFINITY, 5)).toBe(0);
    expect(effectiveQty(-10, 5)).toBe(0);
    expect(effectiveQty(0, 5)).toBe(0);
    // A bad waste % just loses its adjustment — the qty itself survives.
    expect(effectiveQty(10, Number.NaN)).toBe(10);
    expect(effectiveQty(10, Number.POSITIVE_INFINITY)).toBe(10);
    expect(effectiveQty(10, -20)).toBe(10);
  });

  it("string numerics from PostgREST/forms are coerced", () => {
    expect(
      effectiveQty("10" as unknown as number, "5" as unknown as number),
    ).toBe(10.5);
  });
});

describe("panelAreaSqm", () => {
  it("(L/1000) × (W/1000) in sqm", () => {
    expect(panelAreaSqm(600, 400)).toBe(0.24);
    expect(panelAreaSqm(2440, 1220)).toBe(2.977); // one full board ≈ 2.9768
    expect(panelAreaSqm(1000, 1000)).toBe(1);
  });

  it("guards: non-finite or negative dims → 0", () => {
    expect(panelAreaSqm(Number.NaN, 400)).toBe(0);
    expect(panelAreaSqm(600, Number.NaN)).toBe(0);
    expect(panelAreaSqm(-600, 400)).toBe(0);
    expect(panelAreaSqm(600, 0)).toBe(0);
  });
});

describe("panelBandingMm", () => {
  it("banded length-edges contribute length_mm; width-edges width_mm; times qty", () => {
    // 600×400 qty 2 with edge_l1 + edge_w1 → (600 + 400) × 2 = 2000 mm.
    expect(
      panelBandingMm({
        length_mm: 600,
        width_mm: 400,
        qty: 2,
        edge_l1: true,
        edge_w1: true,
      }),
    ).toBe(2000);

    // Both long edges banded on one panel → 600 × 2 = 1200.
    expect(
      panelBandingMm({
        length_mm: 600,
        width_mm: 400,
        qty: 1,
        edge_l1: true,
        edge_l2: true,
      }),
    ).toBe(1200);

    // All four edges → perimeter × qty.
    expect(
      panelBandingMm({
        length_mm: 600,
        width_mm: 400,
        qty: 3,
        edge_l1: true,
        edge_l2: true,
        edge_w1: true,
        edge_w2: true,
      }),
    ).toBe(6000); // (600+600+400+400) × 3
  });

  it("no banded edges → 0 regardless of dimensions", () => {
    expect(panelBandingMm({ length_mm: 600, width_mm: 400, qty: 5 })).toBe(0);
  });

  it("guards: bad dims/qty degrade to 0", () => {
    expect(
      panelBandingMm({
        length_mm: Number.NaN,
        width_mm: 400,
        qty: 2,
        edge_l1: true,
      }),
    ).toBe(0);
    expect(
      panelBandingMm({ length_mm: 600, width_mm: 400, qty: Number.NaN, edge_l1: true }),
    ).toBe(0);
    expect(
      panelBandingMm({ length_mm: 600, width_mm: -400, qty: 2, edge_w1: true }),
    ).toBe(0);
  });
});

describe("cutlistTotals", () => {
  const shutter = {
    id: "p1",
    cutlist_id: "c1",
    panel_name: "Shutter left",
    room_label: "Bedroom 2",
    length_mm: 600,
    width_mm: 400,
    qty: 2,
    grain: "length" as const,
    material: null,
    edge_l1: true,
    edge_l2: false,
    edge_w1: true,
    edge_w2: false,
    notes: null,
    created_at: "2026-08-24T00:00:00Z",
  };

  const shelf = {
    ...shutter,
    id: "p2",
    panel_name: "Shelf",
    length_mm: 800,
    width_mm: 300,
    qty: 3,
    grain: "none" as const,
    edge_l1: false,
    edge_l2: false,
    edge_w1: false,
    edge_w2: false,
  };

  it("sums two panels: count, area, banding across rows", () => {
    const t = cutlistTotals([shutter, shelf]);
    expect(t.panelCount).toBe(5); // 2 + 3
    expect(t.totalAreaSqm).toBe(1.2); // 0.24×2 + 0.24×3 = 0.48 + 0.72
    expect(t.totalBandingMm).toBe(2000); // only the shutter bands: (600+400)×2
  });

  it("an empty cutlist totals to zeros", () => {
    expect(cutlistTotals([])).toEqual({
      panelCount: 0,
      totalAreaSqm: 0,
      totalBandingMm: 0,
    });
  });
});

describe("bomTotals", () => {
  it("counts lines and sums the server-stamped effective quantities", () => {
    expect(
      bomTotals([
        { effective_qty: 10.5 },
        { effective_qty: 2 },
        { effective_qty: 0.25 },
      ]),
    ).toEqual({ lineCount: 3, totalEffectiveQty: 12.75 });
  });

  it("empty BOM → zero lines, zero qty", () => {
    expect(bomTotals([])).toEqual({ lineCount: 0, totalEffectiveQty: 0 });
  });
});
