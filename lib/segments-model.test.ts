import { describe, it, expect } from "vitest";
import { countBy, toBar } from "./segments-model";

const STAGES = [
  { key: "pending", label: "Pending" },
  { key: "rfq_raised", label: "RFQ Raised" },
  { key: "ordered", label: "Ordered" },
];

describe("toBar", () => {
  it("reproduces the frame: 39 / 11 / 127 of 177 items", () => {
    const bar = toBar([
      { key: "pending", label: "Pending", value: 39 },
      { key: "rfq_raised", label: "RFQ Raised", value: 11 },
      { key: "ordered", label: "Ordered", value: 127 },
    ]);
    expect(bar.total).toBe(177);
    expect(bar.slices.map((s) => s.pct)).toEqual([22.03, 6.21, 71.75]);
  });

  it("keeps zero segments, so a stage never silently disappears", () => {
    const bar = toBar([
      { key: "not_initiated", label: "Not Initiated", value: 36 },
      { key: "partial", label: "Partial Done", value: 0 },
      { key: "completed", label: "Completed", value: 1 },
    ]);
    expect(bar.slices).toHaveLength(3);
    expect(bar.slices[1]).toMatchObject({ label: "Partial Done", value: 0, pct: 0 });
  });

  it("gives every slice a colour, in fixed palette order", () => {
    const bar = toBar(STAGES.map((s) => ({ ...s, value: 1 })));
    const colors = bar.slices.map((s) => s.color);
    expect(new Set(colors).size).toBe(3);
    expect(colors[0]).toBe("var(--color-chart-1)");
  });

  it("lets a semantic colour override the palette", () => {
    const bar = toBar([
      { key: "overdue", label: "Overdue", value: 2, color: "var(--color-red)" },
    ]);
    expect(bar.slices[0].color).toBe("var(--color-red)");
  });

  it("does not divide by zero on an empty bar", () => {
    const bar = toBar(STAGES.map((s) => ({ ...s, value: 0 })));
    expect(bar.total).toBe(0);
    expect(bar.slices.every((s) => s.pct === 0)).toBe(true);
  });

  it("coerces a bad value to 0 rather than poisoning the total with NaN", () => {
    const bar = toBar([
      { key: "a", label: "A", value: Number("x") },
      { key: "b", label: "B", value: 4 },
    ]);
    expect(bar.total).toBe(4);
  });
});

describe("countBy", () => {
  const rows = [
    { stage: "pending" },
    { stage: "pending" },
    { stage: "ordered" },
    { stage: null },
  ];

  it("rolls rows up in the declared stage order", () => {
    const segs = countBy(rows, STAGES, (r) => r.stage);
    expect(segs.map((s) => [s.key, s.value])).toEqual([
      ["pending", 2],
      ["rfq_raised", 0],
      ["ordered", 1],
    ]);
  });

  it("ignores rows with no stage rather than inventing one", () => {
    const segs = countBy(rows, STAGES, (r) => r.stage);
    expect(segs.reduce((n, s) => n + s.value, 0)).toBe(3);
  });

  it("drops a value that is not a declared stage", () => {
    const segs = countBy([{ stage: "invented" }], STAGES, (r) => r.stage);
    expect(segs.every((s) => s.value === 0)).toBe(true);
  });
});
