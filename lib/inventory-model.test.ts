import { describe, it, expect } from "vitest";
import {
  MOVEMENT_DIRECTIONS,
  DIRECTION_META,
  GRN_STATUSES,
  GRN_STATUS_META,
  signedQty,
  stockValue,
  projectStock,
  buildWarehouseTree,
  goodsValue,
  inventoryTabOf,
  lastMovement,
  movedAmount,
  movedQty,
  noteDirectionOf,
  unlinkedCount,
  warehouseKindOf,
  type LedgerLine,
  type Warehouse,
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

/* ══════════════════════════════════════════════════════════════════════════
   INVENTORY, COMPANY-WIDE (PLAN-V4 §10.2, frames `110109` / `110101`)
   ══════════════════════════════════════════════════════════════════════════ */

const line = (
  warehouse_id: string,
  direction: string,
  qty: number,
  unit_rate: number,
  created_at = "2026-08-01T10:00:00Z",
): LedgerLine => ({ warehouse_id, direction, qty, unit_rate, created_at });

const wh = (
  id: string,
  name: string,
  parent_id: string | null = null,
  kind: "company" | "project" = "company",
): Warehouse => ({
  id,
  org_id: "org",
  name,
  kind,
  project_id: kind === "project" ? "p1" : null,
  parent_id,
  project_label: null,
  address: null,
  is_active: true,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
});

describe("goodsValue", () => {
  it("adds inward at its rate and subtracts outward at its own", () => {
    // 40×1820 + 10×940 − 8×1820 = 72800 + 9400 − 14560
    const v = goodsValue([
      line("w", "in", 40, 1820),
      line("w", "in", 10, 940),
      line("w", "out", 8, 1820),
    ]);
    expect(v).toBe(67640);
  });

  it("treats a transfer as no change in value", () => {
    expect(goodsValue([line("w", "transfer", 50, 100)])).toBe(0);
  });

  it("can go negative, because that is a real and reportable state", () => {
    expect(goodsValue([line("w", "out", 3, 100)])).toBe(-300);
  });

  it("is zero for a warehouse nothing has ever moved through", () => {
    expect(goodsValue([])).toBe(0);
  });
});

describe("movedQty / movedAmount", () => {
  it("are unsigned — a document's Qty is what it moved, not a net", () => {
    const lines = [line("w", "in", 40, 1820), line("w", "in", 10, 940)];
    expect(movedQty(lines)).toBe(50);
    expect(movedAmount(lines)).toBe(82200);
  });

  it("count an outward note's own quantity as positive", () => {
    expect(movedQty([line("w", "out", 8, 1820)])).toBe(8);
    expect(movedAmount([line("w", "out", 8, 1820)])).toBe(14560);
  });
});

describe("lastMovement", () => {
  const lines = [
    line("w", "in", 1, 1, "2026-08-01T10:00:00Z"),
    line("w", "in", 1, 1, "2026-09-03T09:00:00Z"),
    line("w", "out", 1, 1, "2026-08-24T12:00:00Z"),
  ];

  it("finds the latest of each direction independently", () => {
    expect(lastMovement(lines, "in")).toBe("2026-09-03T09:00:00Z");
    expect(lastMovement(lines, "out")).toBe("2026-08-24T12:00:00Z");
  });

  it("returns null rather than a zero date when it has never happened", () => {
    // The frame has rows with a stock-in and no stock-out. A dash is the
    // truthful cell; 1 Jan 1970 is not.
    expect(lastMovement([line("w", "in", 1, 1)], "out")).toBeNull();
    expect(lastMovement([], "in")).toBeNull();
  });
});

describe("buildWarehouseTree", () => {
  it("rolls a bin's value up into its warehouse", () => {
    // A shelf's stock is in the warehouse whether or not the row is expanded.
    const tree = buildWarehouseTree(
      [wh("w1", "Head Office Store"), wh("b1", "Rack A", "w1")],
      new Map([
        ["w1", [line("w1", "in", 10, 100)]],
        ["b1", [line("b1", "in", 5, 100)]],
      ]),
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].ownValue).toBe(1000);
    expect(tree[0].rolledValue).toBe(1500);
    expect(tree[0].bins).toHaveLength(1);
    expect(tree[0].bins[0].rolledValue).toBe(500);
  });

  it("rolls the latest movement dates up too", () => {
    const tree = buildWarehouseTree(
      [wh("w1", "Store"), wh("b1", "Rack", "w1")],
      new Map([
        ["w1", [line("w1", "in", 1, 1, "2026-08-01T00:00:00Z")]],
        ["b1", [line("b1", "in", 1, 1, "2026-09-03T00:00:00Z")]],
      ]),
    );
    expect(tree[0].lastIn).toBe("2026-09-03T00:00:00Z");
  });

  it("folds bins of bins before the parent reads them", () => {
    const tree = buildWarehouseTree(
      [wh("w1", "Store"), wh("b1", "Aisle", "w1"), wh("b2", "Shelf", "b1")],
      new Map([["b2", [line("b2", "in", 2, 250)]]]),
    );
    expect(tree[0].rolledValue).toBe(500);
    expect(tree[0].bins[0].rolledValue).toBe(500);
  });

  it("promotes a bin whose parent is missing rather than dropping it", () => {
    // A filtered-out or archived parent must not make a warehouse's stock
    // vanish from the screen. A lost row is worse than an odd-looking one.
    const tree = buildWarehouseTree(
      [wh("b1", "Rack A", "gone")],
      new Map([["b1", [line("b1", "in", 4, 100)]]]),
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("b1");
    expect(tree[0].rolledValue).toBe(400);
  });

  it("sorts by name at every level, so a row does not move as stock changes", () => {
    const tree = buildWarehouseTree(
      [wh("w2", "Beta"), wh("w1", "Alpha"), wh("b2", "Zulu", "w1"), wh("b1", "Delta", "w1")],
      new Map(),
    );
    expect(tree.map((n) => n.name)).toEqual(["Alpha", "Beta"]);
    expect(tree[0].bins.map((n) => n.name)).toEqual(["Delta", "Zulu"]);
  });
});

describe("warehouseKindOf / noteDirectionOf", () => {
  it("default to the safe reading rather than throwing", () => {
    // "No project" is not the same statement as "company-owned", but an
    // unreadable value has to land somewhere, and company is the scope that
    // leaks nothing into a project.
    expect(warehouseKindOf("project")).toBe("project");
    expect(warehouseKindOf("company")).toBe("company");
    expect(warehouseKindOf(null)).toBe("company");
    expect(warehouseKindOf("nonsense")).toBe("company");

    expect(noteDirectionOf("out")).toBe("out");
    expect(noteDirectionOf(null)).toBe("in");
  });
});

describe("inventoryTabOf", () => {
  it("resolves the frame's tabs and falls back to the first", () => {
    expect(inventoryTabOf("history")).toBe("history");
    expect(inventoryTabOf("expense")).toBe("expense");
    expect(inventoryTabOf(undefined)).toBe("warehouses");
    expect(inventoryTabOf("../etc/passwd")).toBe("warehouses");
  });
});

describe("unlinkedCount", () => {
  it("counts movements that belong to no document", () => {
    // Pre-0033 history. These are shown as themselves and never handed a
    // number they never had.
    expect(
      unlinkedCount([{ grn_id: "g1" }, { grn_id: null }, { grn_id: undefined }]),
    ).toBe(2);
  });
});
