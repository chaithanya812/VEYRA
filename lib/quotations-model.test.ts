import { describe, it, expect } from "vitest";
import {
  computeLine,
  computeQuoteTotals,
  round2,
  marginPct,
  splitGst,
  deriveTreatment,
  normalizeState,
  gstRateSummary,
  computeGstTotals,
} from "./quotations-model";

/**
 * Locks the pricing engine to the REAL Dzylo quotation frame
 * (competitor-research/source/frames/video-02/10_..._EST_02_Line_Items_Taxes_Terms.png).
 * Two rows were read off that frame and must reproduce exactly:
 *   row 1: qty 21 × ₹2,160, −₹4,536 discount, 18% GST → Final ₹48,172.32
 *   row 2: qty 1  × ₹2,160, −₹216   discount, 18% GST → Final ₹2,293.92
 */
describe("quotation pricing engine (grounded in the Dzylo frame)", () => {
  it("row 1 — amount discount", () => {
    const t = computeLine({
      qty: 21,
      unit_price: 2160,
      discount_type: "amount",
      discount_value: 4536,
      tax_rate: 18,
    });
    expect(t.line_subtotal).toBe(45360);
    expect(t.discount_amount).toBe(4536);
    expect(t.taxable).toBe(40824);
    expect(t.tax_amount).toBe(7348.32);
    expect(t.line_total).toBe(48172.32);
  });

  it("row 2 — amount discount", () => {
    const t = computeLine({
      qty: 1,
      unit_price: 2160,
      discount_type: "amount",
      discount_value: 216,
      tax_rate: 18,
    });
    expect(t.line_total).toBe(2293.92);
  });

  it("row 2 restated as a 10% discount gives the same total", () => {
    const t = computeLine({
      qty: 1,
      unit_price: 2160,
      discount_type: "percent",
      discount_value: 10,
      tax_rate: 18,
    });
    expect(t.discount_amount).toBe(216);
    expect(t.line_total).toBe(2293.92);
  });

  it("clamps a discount that exceeds the line subtotal", () => {
    const t = computeLine({
      qty: 1,
      unit_price: 1000,
      discount_type: "amount",
      discount_value: 5000,
      tax_rate: 18,
    });
    expect(t.discount_amount).toBe(1000);
    expect(t.taxable).toBe(0);
    expect(t.line_total).toBe(0);
  });

  it("computes line cost from cost_rate", () => {
    const t = computeLine({
      qty: 21,
      unit_price: 2160,
      discount_type: "amount",
      discount_value: 0,
      tax_rate: 18,
      cost_rate: 1400,
    });
    expect(t.line_cost).toBe(29400);
  });

  it("rolls up quote totals across the two frame lines", () => {
    const l1 = computeLine({ qty: 21, unit_price: 2160, discount_type: "amount", discount_value: 4536, tax_rate: 18 });
    const l2 = computeLine({ qty: 1, unit_price: 2160, discount_type: "amount", discount_value: 216, tax_rate: 18 });
    const totals = computeQuoteTotals([l1, l2]);
    expect(totals.subtotal).toBe(47520);
    expect(totals.discount_total).toBe(4752);
    expect(totals.taxable_total).toBe(42768);
    expect(totals.tax_total).toBe(7698.24);
    expect(totals.grand_total).toBe(50466.24);
  });

  it("margin % guards divide-by-zero and rounds", () => {
    expect(marginPct(0, 0)).toBe(0);
    expect(marginPct(40824, 30000)).toBe(26.51);
    expect(round2(1.005)).toBe(1.01);
  });
});

/**
 * Indian GST supply model — CGST/SGST (intra-state) vs IGST (inter-state).
 * Anchored to the same two Dzylo frame lines (both 18%): total GST ₹7,698.24 on
 * ₹42,768 taxable. Intra splits it in half; inter is all IGST.
 */
describe("GST supply model (place-of-supply → CGST/SGST vs IGST)", () => {
  it("splits an intra-state total into equal CGST + SGST", () => {
    expect(splitGst(7698.24, "intra")).toEqual({ cgst: 3849.12, sgst: 3849.12, igst: 0 });
  });

  it("routes an inter-state total entirely to IGST", () => {
    expect(splitGst(7698.24, "inter")).toEqual({ cgst: 0, sgst: 0, igst: 7698.24 });
  });

  it("CGST + SGST always foots to the total even with an odd paise remainder", () => {
    const s = splitGst(100.01, "intra");
    expect(round2(s.cgst + s.sgst)).toBe(100.01);
  });

  it("normalises state names, codes and combos", () => {
    expect(normalizeState("Karnataka")).toBe("29");
    expect(normalizeState("karnataka")).toBe("29");
    expect(normalizeState("29")).toBe("29");
    expect(normalizeState("27-Maharashtra")).toBe("27"); // "code-name" combo
    expect(normalizeState("Atlantis")).toBeNull();
    expect(normalizeState(null)).toBeNull();
  });

  it("derives treatment from seller vs buyer state", () => {
    expect(deriveTreatment("Karnataka", "Karnataka")).toBe("intra");
    expect(deriveTreatment("Karnataka", "Maharashtra")).toBe("inter");
    expect(deriveTreatment("Karnataka", null)).toBeNull();
    expect(deriveTreatment(null, "Kerala")).toBeNull();
  });

  it("builds a rate-wise summary and foots to the header totals", () => {
    const lines = [
      { tax_rate: 18, taxable: 40824, tax_amount: 7348.32 },
      { tax_rate: 18, taxable: 1944, tax_amount: 349.92 },
      { tax_rate: 12, taxable: 1000, tax_amount: 120 },
    ];
    const summary = gstRateSummary(lines, "intra");
    expect(summary.map((r) => r.rate)).toEqual([12, 18]); // sorted ascending
    const r18 = summary.find((r) => r.rate === 18)!;
    expect(r18.taxable).toBe(42768);
    expect(r18.cgst).toBe(3849.12);
    expect(r18.sgst).toBe(3849.12);

    const totals = computeGstTotals(lines, "intra");
    // 7348.32 + 349.92 + 120 = 7818.24 GST → half each
    expect(round2(totals.cgst + totals.sgst)).toBe(7818.24);
    expect(totals.igst).toBe(0);

    const inter = computeGstTotals(lines, "inter");
    expect(inter.igst).toBe(7818.24);
    expect(inter.cgst).toBe(0);
  });
});
