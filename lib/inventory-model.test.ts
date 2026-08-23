import { describe, it, expect } from "vitest";
import {
  MOVEMENT_DIRECTIONS,
  DIRECTION_META,
  GRN_STATUSES,
  GRN_STATUS_META,
  signedQty,
  stockValue,
  projectStock,
} from "./inventory-model";

/**
 * The stock ledger math is pure and must stay exact: stock level is a
 * PROJECTION over movements (never a stored counter), so signedQty /
 * projectStock are the whole truth. Negative totals are allowed to surface —
 * they are a TRUE ALERT (the one red use here).
 */
describe("signedQty", () => {
  it("+qty for in", () => {
    expect(signedQty("in", 10)).toBe(10);
    expect(signedQty("in", 0)).toBe(0);
    expect(signedQty("in", 2.5)).toBe(2.5);
  });

  it("−qty for out", () => {
    expect(signedQty("out", 4)).toBe(-4);
    expect(signedQty("out", 0.75)).toBe(-0.75);
  });

  it("0 for transfer (a transfer pair nets to zero across its legs)", () => {
    expect(signedQty("transfer", 7)).toBe(0);
    expect(signedQty("transfer", 100)).toBe(0);
  });

  it("unknown direction contributes 0 instead of crashing", () => {
    expect(signedQty("sideways", 5)).toBe(0);
    expect(signedQty("", 5)).toBe(0);
  });

  it("garbage qty contributes 0 instead of NaN", () => {
    expect(signedQty("in", Number.NaN)).toBe(0);
  });
});

/** Rates are user-entered CONFIG; value is a pure computation — never an LLM. */
describe("stockValue", () => {
  it("qty × unit_rate", () => {
    expect(stockValue(10, 95)).toBe(950);
    expect(stockValue(12, 95.5)).toBe(1146);
    expect(stockValue(2.5, 40)).toBe(100);
  });

  it("zero rate or zero qty → zero", () => {
    expect(stockValue(10, 0)).toBe(0);
    expect(stockValue(0, 95)).toBe(0);
  });

  it("negative qty (alert state) values negatively", () => {
    expect(stockValue(-3, 100)).toBe(-300);
  });
});

describe("projectStock (ledger → levels)", () => {
  const mv = (
    item_id: string | null,
    item_name: string,
    warehouse_id: string,
    direction: "in" | "out" | "transfer",
    qty: number,
  ) => ({ item_id, item_name, warehouse_id, direction, qty });

  it("empty ledger → no levels", () => {
    expect(projectStock([])).toEqual([]);
  });

  it("sums ins and outs per (item, warehouse)", () => {
    const rows = [
      mv("i1", "18mm Ply", "w1", "in", 20),
      mv("i1", "18mm Ply", "w1", "out", 5),
      mv("i1", "18mm Ply", "w1", "in", 2.25),
    ];
    expect(projectStock(rows)).toEqual([
      {
        item_id: "i1",
        item_name: "18mm Ply",
        warehouse_id: "w1",
        qty: 17.25,
        uom: null,
      },
    ]);
  });

  it("keeps warehouses separate for the same item", () => {
    const rows = [
      mv("i1", "18mm Ply", "w1", "in", 10),
      mv("i1", "18mm Ply", "w2", "in", 3),
      mv("i1", "18mm Ply", "w2", "out", 1),
    ];
    const levels = projectStock(rows);
    expect(levels).toHaveLength(2);
    expect(levels.find((l) => l.warehouse_id === "w1")?.qty).toBe(10);
    expect(levels.find((l) => l.warehouse_id === "w2")?.qty).toBe(2);
  });

  it("transfers net to zero (kept simple by design)", () => {
    const rows = [
      mv("i1", "18mm Ply", "w1", "in", 10),
      mv("i1", "18mm Ply", "w1", "transfer", 4),
      mv("i1", "18mm Ply", "w1", "out", 6),
    ];
    expect(projectStock(rows)[0].qty).toBe(4); // 10 − 0 + −6
  });

  it("allows negative levels to surface (true alert, red in UI)", () => {
    const rows = [mv("i1", "18mm Ply", "w1", "in", 2), mv("i1", "18mm Ply", "w1", "out", 5)];
    expect(projectStock(rows)[0].qty).toBe(-3);
  });

  it("groups unlisted items (null item_id) by their label", () => {
    const rows = [
      mv(null, "Site Mix A", "w1", "in", 5),
      mv(null, "site mix a", "w1", "in", 1), // same normalised label → one group
      mv(null, "Site Mix B", "w1", "in", 7), // different label → separate group
    ];
    const levels = projectStock(rows);
    expect(levels).toHaveLength(2);
    const mixA = levels.find((l) => l.item_name === "Site Mix A");
    expect(mixA?.qty).toBe(6);
    expect(mixA?.item_id).toBeNull();
  });

  it("same name under different catalogue ids stays separate", () => {
    const rows = [mv("i1", "Hinge", "w1", "in", 3), mv("i2", "Hinge", "w1", "in", 9)];
    expect(projectStock(rows)).toHaveLength(2);
  });

  it("carries the last-seen uom for display", () => {
    const rows = [
      { ...mv("i1", "Sheet", "w1", "in", 10), uom: "sheet" },
      { ...mv("i1", "Sheet", "w1", "out", 2), uom: "sheet" },
    ];
    expect(projectStock(rows)[0].uom).toBe("sheet");
  });
});

/** Design guardrails: chips are green/amber/grey ONLY; red stays reserved
 *  (§Design) for the unlisted-item flag / negative-stock alert. */
describe("inventory model (design guardrails)", () => {
  it("directions are in | out | transfer", () => {
    expect([...MOVEMENT_DIRECTIONS]).toEqual(["in", "out", "transfer"]);
  });

  it("every direction has a label + a non-red tone (in=positive, out=warning, transfer=neutral)", () => {
    for (const d of MOVEMENT_DIRECTIONS) {
      const meta = DIRECTION_META[d];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.tone).not.toBe("red");
    }
    expect(DIRECTION_META.in.tone).toBe("positive");
    expect(DIRECTION_META.out.tone).toBe("warning");
    expect(DIRECTION_META.transfer.tone).toBe("neutral");
  });

  it("GRN statuses are pending | recorded | discarded with non-red tones", () => {
    expect([...GRN_STATUSES]).toEqual(["pending", "recorded", "discarded"]);
    for (const s of GRN_STATUSES) {
      const meta = GRN_STATUS_META[s];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.tone).not.toBe("red");
    }
    expect(GRN_STATUS_META.recorded.tone).toBe("positive");
  });
});
