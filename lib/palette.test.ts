import { describe, it, expect } from "vitest";
import {
  CHART_SERIES,
  CHART_SERIES_TINT,
  MODULE_COLOR,
  colorForKey,
  seriesColor,
  seriesTint,
} from "./palette";

describe("seriesColor", () => {
  it("is stable per index — the same series is the same colour everywhere", () => {
    expect(seriesColor(0)).toBe(CHART_SERIES[0]);
    expect(seriesColor(3)).toBe(CHART_SERIES[3]);
  });

  it("cycles rather than running out on a long legend", () => {
    expect(seriesColor(6)).toBe(CHART_SERIES[0]);
    expect(seriesColor(13)).toBe(CHART_SERIES[1]);
  });

  it("survives a negative index", () => {
    expect(seriesColor(-1)).toBe(CHART_SERIES[5]);
  });

  it("pairs each colour with its own tint", () => {
    expect(seriesTint(2)).toBe(CHART_SERIES_TINT[2]);
    expect(CHART_SERIES_TINT).toHaveLength(CHART_SERIES.length);
  });
});

describe("colorForKey", () => {
  it("gives one category one colour across screens", () => {
    expect(colorForKey("Carpentry Woodwork")).toBe(colorForKey("Carpentry Woodwork"));
  });

  it("always lands inside the palette", () => {
    for (const k of ["", "a", "Paint Works", "False Ceiling POP Work", "ज"]) {
      expect(CHART_SERIES).toContain(colorForKey(k) as (typeof CHART_SERIES)[number]);
    }
  });
});

describe("module identity", () => {
  it("never spends red on a module hue", () => {
    for (const v of Object.values(MODULE_COLOR)) {
      expect(v.includes("red")).toBe(false);
      expect(CHART_SERIES).toContain(v as (typeof CHART_SERIES)[number]);
    }
  });
});
