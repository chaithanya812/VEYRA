import { describe, it, expect } from "vitest";
import { variancePct, varianceTone } from "./site-model";

/**
 * Variance is VEYRA's wedge and it is a PURE computation on user-entered
 * quantities — never an LLM output (HARD RULE 4). The thresholds here are the
 * UI's red line too: `alert` is the ONLY place a large variance turns red
 * (red reserved, DESIGN-DIRECTION §2).
 */
describe("variancePct", () => {
  it("((measured − quoted) / quoted) × 100", () => {
    expect(variancePct(100, 110)).toBe(10); // over-usage → positive
    expect(variancePct(100, 90)).toBe(-10); // under-usage → negative
    expect(variancePct(200, 250)).toBe(25);
    expect(variancePct(80, 80)).toBe(0);
  });

  it("rounds to 1 decimal place", () => {
    expect(variancePct(300, 310)).toBe(3.3); // 3.333… → 3.3
    expect(variancePct(3, 4)).toBe(33.3); // 33.333… → 33.3
    expect(variancePct(7, 8)).toBe(14.3); // 14.2857… → 14.3
    expect(variancePct(6, 7)).toBe(16.7); // 16.666… → 16.7
  });

  it("quoted = 0 → 0 (never divides by zero)", () => {
    expect(variancePct(0, 120)).toBe(0);
    expect(variancePct(0, 0)).toBe(0);
  });

  it("non-finite inputs degrade to 0 instead of NaN", () => {
    expect(variancePct(Number.NaN, 10)).toBe(0);
    expect(variancePct(100, Number.NaN)).toBe(0);
    expect(variancePct(Number.POSITIVE_INFINITY, 1)).toBe(0);
  });

  it("string numerics from PostgREST are coerced", () => {
    expect(variancePct("100" as unknown as number, "110" as unknown as number)).toBe(10);
  });

  it("negative −0 is normalised to plain 0", () => {
    const pct = variancePct(200000000, 199999999.9);
    expect(Object.is(pct, -0)).toBe(false);
    expect(pct).toBe(0);
  });
});

describe("varianceTone thresholds", () => {
  it("|pct| < 5 → neutral", () => {
    expect(varianceTone(0)).toBe("neutral");
    expect(varianceTone(4.9)).toBe("neutral");
    expect(varianceTone(-4.9)).toBe("neutral");
  });

  it("5 ≤ |pct| < 15 → warning", () => {
    expect(varianceTone(5)).toBe("warning"); // exactly at threshold
    expect(varianceTone(-5)).toBe("warning");
    expect(varianceTone(14.9)).toBe("warning");
    expect(varianceTone(-14.9)).toBe("warning");
  });

  it("|pct| ≥ 15 → alert (the red threshold)", () => {
    expect(varianceTone(15)).toBe("alert");
    expect(varianceTone(-15)).toBe("alert"); // under-quoting alerts too
    expect(varianceTone(100)).toBe("alert");
    expect(varianceTone(-42.7)).toBe("alert");
  });

  it("non-finite pct → neutral", () => {
    expect(varianceTone(Number.NaN)).toBe("neutral");
  });
});

/** End-to-end through both helpers: what the table renders for stored rows. */
describe("variancePct + varianceTone together", () => {
  it("a +12% overrun reads amber; a −20% shortfall reads alert-red", () => {
    expect(varianceTone(variancePct(50, 56))).toBe("warning");
    expect(varianceTone(variancePct(10, 8))).toBe("alert");
  });

  it("a 5% exact boundary lands in warning, not red", () => {
    expect(varianceTone(variancePct(200, 210))).toBe("warning");
  });

  it("on-target work stays neutral", () => {
    expect(varianceTone(variancePct(144, 144))).toBe("neutral");
  });
});
