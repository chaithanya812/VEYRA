import { describe, it, expect } from "vitest";
import {
  MEASURE_MODES,
  isMeasureMode,
  MEASURE_MODE_FIELDS,
  deriveQty,
  resolveQty,
  round3,
} from "./measurement-model";

describe("measurement-model — qty derivation (pure, no LLM)", () => {
  it("area = length × width", () => {
    const r = deriveQty("area", { length: 2.4, width: 0.6 });
    expect(r.qty).toBe(1.44);
    expect(r.source).toBe("derived");
    expect(r.formula).toBe("2.4 × 0.6 = 1.44");
  });

  it("elevation = width × height", () => {
    const r = deriveQty("elevation", { width: 3, height: 2.7 });
    expect(r.qty).toBe(8.1);
    expect(r.formula).toBe("3 × 2.7 = 8.1");
  });

  it("linear = length only", () => {
    expect(deriveQty("linear", { length: 5.75, width: 999 }).qty).toBe(5.75);
  });

  it("count = count only", () => {
    expect(deriveQty("count", { count: 12 }).qty).toBe(12);
  });

  it("lumpsum is always 1", () => {
    expect(deriveQty("lumpsum", {}).qty).toBe(1);
    expect(deriveQty("lumpsum", { length: 100 }).qty).toBe(1);
  });

  it("accepts string dimensions (PostgREST/form values) and coerces", () => {
    expect(deriveQty("area", { length: "2.5", width: "2" }).qty).toBe(5);
  });

  it("missing/invalid/negative dimensions degrade to 0, never NaN", () => {
    expect(deriveQty("area", { length: 2.4 }).qty).toBe(0); // no width
    expect(deriveQty("area", { length: -3, width: 2 }).qty).toBe(0);
    expect(deriveQty("area", { length: "abc", width: "2" }).qty).toBe(0);
    expect(Number.isNaN(deriveQty("area", {}).qty)).toBe(false);
  });

  it("manual override wins over derivation", () => {
    const r = resolveQty("area", { length: 2, width: 2 }, 3);
    expect(r.qty).toBe(3);
    expect(r.source).toBe("manual");
    expect(r.formula).toBe("manual: 3");
  });

  it("blank/null/negative override falls back to derived qty", () => {
    expect(resolveQty("area", { length: 2, width: 2 }, "").source).toBe("derived");
    expect(resolveQty("area", { length: 2, width: 2 }, null).qty).toBe(4);
    expect(resolveQty("area", { length: 2, width: 2 }, -5).source).toBe("derived");
  });

  it("override of 0 is a valid explicit qty (not a fallback)", () => {
    const r = resolveQty("area", { length: 2, width: 2 }, 0);
    expect(r.qty).toBe(0);
    expect(r.source).toBe("manual");
  });

  it("round3 rounds to 3 decimals", () => {
    expect(round3(1.23456)).toBe(1.235);
  });

  it("mode guards + field maps are coherent", () => {
    expect(isMeasureMode("area")).toBe(true);
    expect(isMeasureMode("nope")).toBe(false);
    expect(MEASURE_MODES).toContain("lumpsum");
    expect(MEASURE_MODE_FIELDS.area).toEqual(["length", "width"]);
    expect(MEASURE_MODE_FIELDS.lumpsum).toEqual([]);
  });
});
