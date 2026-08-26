import { describe, it, expect } from "vitest";
import {
  PANEL_STAGES,
  nestPanels,
  nextStage,
  panelStageTone,
  stageIndex,
} from "./production-nesting-model";

/**
 * Nesting is the number the factory cuts sheets by, so it is pinned here as a
 * PURE deterministic geometry computation (HARD RULE 2): same input → byte-
 * identical output, wastage is pure arithmetic, oversized panels are reported
 * and skipped instead of crashing, and no LLM ever produces a figure.
 */
describe("nestPanels", () => {
  it("fits two 600×400 panels on one 800×600 board with kerf 0", () => {
    const result = nestPanels(
      [{ name: "Shutter", w_mm: 600, h_mm: 400, qty: 2 }],
      { length_mm: 800, width_mm: 600 },
      0,
    );

    // Both rotated side-by-side fills the sheet exactly (400+400 × 600).
    expect(result.boardsUsed).toBe(1);
    expect(result.placements).toHaveLength(2);
    expect(result.skipped).toEqual([]);
    for (const p of result.placements) {
      expect(p.board_index).toBe(0);
      expect(p.x_mm).toBeGreaterThanOrEqual(0);
      expect(p.y_mm).toBeGreaterThanOrEqual(0);
      expect(p.x_mm + p.w_mm).toBeLessThanOrEqual(800);
      expect(p.y_mm + p.h_mm).toBeLessThanOrEqual(600);
    }
    expect(result.totalPanelAreaSqm).toBe(0.48);
    expect(result.boardAreaSqm).toBe(0.48);
    expect(result.wastePct).toBe(0);
  });

  it("expands qty into individual placements", () => {
    const result = nestPanels(
      [{ name: "Shelf", w_mm: 800, h_mm: 300, qty: 3 }],
      { length_mm: 2440, width_mm: 1220 },
      3,
    );
    expect(result.placements).toHaveLength(3);
    expect(result.boardsUsed).toBe(1);
  });

  it("reports a panel larger than the board as skipped — never crashes", () => {
    const result = nestPanels(
      [
        { name: "Huge", w_mm: 1000, h_mm: 500, qty: 1 },
        { name: "Fits", w_mm: 400, h_mm: 300, qty: 1 },
      ],
      { length_mm: 800, width_mm: 600 },
      0,
    );
    expect(result.skipped).toContain("Huge");
    expect(result.skipped).not.toContain("Fits");
    expect(result.placements).toHaveLength(1);
    expect(result.boardsUsed).toBe(1);
  });

  it("wastePct matches the pure area formula", () => {
    // One 400×400 panel (0.16 sqm) on an 800×600 board (0.48 sqm)
    // → waste = (1 − 0.16/0.48) × 100 = 66.66…% → 66.67 rounded 2dp.
    const result = nestPanels(
      [{ name: "Sqaure", w_mm: 400, h_mm: 400, qty: 1 }],
      { length_mm: 800, width_mm: 600 },
      0,
    );
    const expected =
      Math.round(
        (1 -
          result.totalPanelAreaSqm /
            (result.boardsUsed * result.boardAreaSqm)) *
          100 *
          100,
      ) / 100;
    expect(result.wastePct).toBe(expected);
    expect(result.wastePct).toBeCloseTo(66.67, 2);
  });

  it("wastePct stays clamped within [0, 100]", () => {
    const result = nestPanels(
      [
        { name: "A", w_mm: 600, h_mm: 400, qty: 2 },
        { name: "B", w_mm: 800, h_mm: 200, qty: 1 },
        { name: "C", w_mm: 300, h_mm: 300, qty: 4 },
      ],
      { length_mm: 2440, width_mm: 1220 },
      3.2,
    );
    expect(result.wastePct).toBeGreaterThanOrEqual(0);
    expect(result.wastePct).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.wastePct)).toBe(true);
  });

  it("is deterministic — same input twice gives identical output", () => {
    const panels = [
      { name: "Shutter left", w_mm: 600, h_mm: 400, qty: 2 },
      { name: "Shelf", w_mm: 800, h_mm: 300, qty: 3 },
      { name: "Back panel", w_mm: 1200, h_mm: 900, qty: 1 },
    ];
    const board = { length_mm: 2440, width_mm: 1220 };
    const a = nestPanels(panels, board, 3);
    const b = nestPanels(panels, board, 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("guards: bad board or degenerate panels degrade safely", () => {
    const empty = {
      placements: [],
      boardsUsed: 0,
      totalPanelAreaSqm: 0,
      boardAreaSqm: 0,
      wastePct: 0,
      skipped: [],
    };
    // Invalid board → nothing computed at all.
    expect(
      nestPanels([{ name: "A", w_mm: 600, h_mm: 400, qty: 1 }], {
        length_mm: 0,
        width_mm: 1220,
      }, 0),
    ).toEqual(empty);
    // Valid board, no panels → zero boards used; the sheet's own area still
    // reported, waste stays 0.
    expect(nestPanels([], { length_mm: 2440, width_mm: 1220 }, 3)).toEqual({
      ...empty,
      boardAreaSqm: 2.977,
    });
    // Zero/negative dimensions are skipped, not placed.
    const guarded = nestPanels(
      [
        { name: "Bad dims", w_mm: 0, h_mm: 400, qty: 1 },
        { name: "No qty", w_mm: 600, h_mm: 400, qty: 0 },
      ],
      { length_mm: 2440, width_mm: 1220 },
      0,
    );
    expect(guarded.placements).toHaveLength(0);
    expect(guarded.skipped).toContain("Bad dims");
  });
});

describe("stage chain", () => {
  it("nextStage walks cut → … → installed and stops at the terminal stage", () => {
    expect(PANEL_STAGES).toEqual([
      "cut",
      "edgebanded",
      "drilled",
      "qc",
      "packed",
      "dispatched",
      "installed",
    ]);
    expect(nextStage("cut")).toBe("edgebanded");
    expect(nextStage("edgebanded")).toBe("drilled");
    expect(nextStage("drilled")).toBe("qc");
    expect(nextStage("qc")).toBe("packed");
    expect(nextStage("packed")).toBe("dispatched");
    expect(nextStage("dispatched")).toBe("installed");
    expect(nextStage("installed")).toBeNull();
    expect(nextStage("not-a-stage")).toBeNull();
  });

  it("stageIndex indexes every stage; unknown → −1", () => {
    PANEL_STAGES.forEach((stage, i) => {
      expect(stageIndex(stage)).toBe(i);
    });
    expect(stageIndex("installed")).toBe(PANEL_STAGES.length - 1);
    expect(stageIndex("shipped")).toBe(-1);
  });

  it("panelStageTone is success only at installed, warning at qc, else neutral — never red", () => {
    expect(panelStageTone("cut")).toBe("neutral");
    expect(panelStageTone("edgebanded")).toBe("neutral");
    expect(panelStageTone("drilled")).toBe("neutral");
    expect(panelStageTone("qc")).toBe("warning");
    expect(panelStageTone("packed")).toBe("neutral");
    expect(panelStageTone("dispatched")).toBe("neutral");
    expect(panelStageTone("installed")).toBe("success");
  });
});
