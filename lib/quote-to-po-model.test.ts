import { describe, it, expect } from "vitest";
import {
  parseMarginPct,
  buyRate,
  quoteLinesToPoLines,
} from "./quote-to-po-model";
import { poAmount, lineTotal } from "./po-model";

/**
 * Locks the quote→PO buy-rate arithmetic. The margin % is human-typed CONFIG;
 * every rupee is derived. cost_rate / line_cost are not inputs.
 */
describe("parseMarginPct", () => {
  it("treats blank, null and undefined as 0% (buy at the quoted rate)", () => {
    expect(parseMarginPct(null)).toEqual({ ok: true, pct: 0 });
    expect(parseMarginPct(undefined)).toEqual({ ok: true, pct: 0 });
    expect(parseMarginPct("")).toEqual({ ok: true, pct: 0 });
    expect(parseMarginPct("   ")).toEqual({ ok: true, pct: 0 });
  });

  it("accepts a typed 0 and a typed 12", () => {
    expect(parseMarginPct(0)).toEqual({ ok: true, pct: 0 });
    expect(parseMarginPct("0")).toEqual({ ok: true, pct: 0 });
    expect(parseMarginPct(12)).toEqual({ ok: true, pct: 12 });
    expect(parseMarginPct("12")).toEqual({ ok: true, pct: 12 });
    expect(parseMarginPct(" 12 ")).toEqual({ ok: true, pct: 12 });
  });

  it("refuses a negative margin and names the problem", () => {
    const r = parseMarginPct(-5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/negative/i);
    const s = parseMarginPct("-5");
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.error).toMatch(/negative/i);
  });

  it("refuses 100% and above — a 100% margin would be a free PO", () => {
    const r = parseMarginPct(100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/100|free/i);
    const above = parseMarginPct("150");
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.error).toMatch(/100|free/i);
  });

  it("refuses a non-number and names the problem", () => {
    const r = parseMarginPct("twelve");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/number/i);
  });

  it("accepts 99.99 (just under a free PO)", () => {
    expect(parseMarginPct(99.99)).toEqual({ ok: true, pct: 99.99 });
  });
});

describe("buyRate", () => {
  it("at 0% equals the quoted sell rate (rounded to paise)", () => {
    expect(buyRate(1850, 0)).toBe(1850);
    expect(buyRate(199.99, 0)).toBe(199.99);
  });

  it("at 12% is round2(sell × 0.88)", () => {
    expect(buyRate(100, 12)).toBe(88);
    expect(buyRate(1850, 12)).toBe(1628);
    // 199.99 × 0.88 = 175.9912 → 175.99
    expect(buyRate(199.99, 12)).toBe(175.99);
  });

  it("treats a missing sell rate as zero instead of NaN", () => {
    expect(buyRate(Number.NaN, 12)).toBe(0);
  });
});

describe("quoteLinesToPoLines", () => {
  const lines = [
    {
      title: "18mm BWP Plywood",
      uom: "sheet",
      qty: 40,
      unit_price: 1850,
      tax_rate: 18,
      item_id: "item-ply",
    },
    {
      title: "1mm Laminate",
      uom: "sheet",
      qty: 25,
      unit_price: 950,
      tax_rate: 18,
      item_id: null,
    },
  ];

  it("at 0% copies the quoted sell rate onto unit_rate and carries item_id", () => {
    const poLines = quoteLinesToPoLines(lines, 0);
    expect(poLines).toHaveLength(2);
    expect(poLines[0].item_name).toBe("18mm BWP Plywood");
    expect(poLines[0].uom).toBe("sheet");
    expect(poLines[0].qty).toBe(40);
    expect(poLines[0].tax_pct).toBe(18);
    expect(poLines[0].unit_rate).toBe(1850);
    expect(poLines[0].item_id).toBe("item-ply");
    expect(poLines[1].unit_rate).toBe(950);
    expect(poLines[1].item_id).toBeNull();
  });

  it("at 12% applies buyRate per line; poAmount is Σ qty×buyRate", () => {
    const poLines = quoteLinesToPoLines(lines, 12);
    expect(poLines[0].unit_rate).toBe(buyRate(1850, 12));
    expect(poLines[1].unit_rate).toBe(buyRate(950, 12));
    expect(poAmount(poLines)).toBe(
      lineTotal(40, buyRate(1850, 12)) + lineTotal(25, buyRate(950, 12)),
    );
  });

  it("drops blank titles and does not take a cost_rate argument", () => {
    const mixed = [
      { title: "  ", uom: "nos", qty: 1, unit_price: 10, tax_rate: 18 },
      { title: "Keep me", uom: "nos", qty: 2, unit_price: 10, tax_rate: 18 },
    ];
    const poLines = quoteLinesToPoLines(mixed, 0);
    expect(poLines).toHaveLength(1);
    expect(poLines[0].item_name).toBe("Keep me");
    // arity is (lines, marginPct) — cost_rate is not an argument
    expect(quoteLinesToPoLines.length).toBe(2);
  });

  it("does not put a stored total on the draft — poAmount derives it", () => {
    const poLines = quoteLinesToPoLines(lines, 0);
    for (const l of poLines) {
      expect(l).not.toHaveProperty("line_total");
      expect(l).not.toHaveProperty("cost_rate");
      expect(l).not.toHaveProperty("line_cost");
    }
    expect(poAmount(poLines)).toBe(40 * 1850 + 25 * 950);
  });
});
