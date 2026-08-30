import { describe, it, expect } from "vitest";
import {
  buildLedger,
  byMonth,
  directionFor,
  groupBy,
  reversalOf,
  type LedgerEntry,
} from "./payments-ledger-model";

function e(over: Partial<LedgerEntry> & { id: string }): LedgerEntry {
  return {
    contract_id: "c1",
    milestone_id: null,
    project_id: "p1",
    project_label: null,
    direction: "outflow",
    amount: 10000,
    mode: "cash",
    paid_on: "2026-03-10",
    reference: null,
    note: null,
    created_at: "2026-03-11T09:00:00.000Z",
    vendor_id: "v1",
    member_id: "m1",
    expense_type: "material",
    category: "Paint Works",
    reversal_of: null,
    ...over,
  };
}

describe("directionFor", () => {
  it("maps funds to inflow and expenses to outflow", () => {
    expect(directionFor("funds")).toBe("inflow");
    expect(directionFor("expenses")).toBe("outflow");
  });
});

describe("buildLedger — a reversal is a row, never a delete", () => {
  const original = e({ id: "a", amount: 50000, reference: "INV-1" });
  const reversal = e({
    id: "b",
    amount: -50000,
    reversal_of: "a",
    created_at: "2026-03-12T09:00:00.000Z",
  });
  const other = e({ id: "c", amount: 20000 });

  it("hides both halves of a reversed pair by default", () => {
    // Showing the original without its correction states a number that is no
    // longer true; showing the correction alone is meaningless.
    const v = buildLedger([original, reversal, other], false);
    expect(v.rows.map((r) => r.id)).toEqual(["c"]);
    expect(v.hiddenCount).toBe(2);
  });

  it("shows both halves when the checkbox is ticked", () => {
    const v = buildLedger([original, reversal, other], true);
    expect(v.rows.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("excludes a reversed pair from the total in BOTH modes", () => {
    expect(buildLedger([original, reversal, other], false).total).toBe(20000);
    expect(buildLedger([original, reversal, other], true).total).toBe(20000);
  });

  it("marks which rows were reversed and which are reversals", () => {
    const v = buildLedger([original, reversal, other], true);
    expect([...v.reversedIds]).toEqual(["a"]);
    expect([...v.reversalIds]).toEqual(["b"]);
  });

  it("never deletes anything — every row is still available", () => {
    const v = buildLedger([original, reversal, other], true);
    expect(v.rows).toHaveLength(3);
  });

  it("sorts by transaction date, not by when it was typed in", () => {
    const v = buildLedger(
      [
        e({ id: "old", paid_on: "2026-01-01", created_at: "2026-06-01T00:00:00.000Z" }),
        e({ id: "new", paid_on: "2026-05-01", created_at: "2026-05-02T00:00:00.000Z" }),
      ],
      false,
    );
    expect(v.rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("reversalOf", () => {
  it("flips the sign and points back at the original", () => {
    const r = reversalOf(e({ id: "a", amount: 50000, reference: "INV-1" }));
    expect(r.amount).toBe(-50000);
    expect(r.reversal_of).toBe("a");
  });

  it("keeps the original's classification so the analytics still balance", () => {
    const r = reversalOf(e({ id: "a", category: "Paint Works", vendor_id: "v9" }));
    expect(r.category).toBe("Paint Works");
    expect(r.vendor_id).toBe("v9");
  });

  it("says what it reverses, for whoever reads the ledger later", () => {
    expect(reversalOf(e({ id: "a", reference: "INV-1" })).note).toContain("INV-1");
  });
});

describe("groupBy", () => {
  const rows = [
    e({ id: "1", amount: 30000, category: "Paint Works" }),
    e({ id: "2", amount: 20000, category: "Paint Works" }),
    e({ id: "3", amount: 50000, category: "Carpentry Works" }),
    e({ id: "4", amount: 10000, category: null }),
  ];

  it("groups and sorts by value, biggest first", () => {
    const s = groupBy(rows, (r) => r.category);
    expect(s.map((x) => x.label)).toEqual([
      "Carpentry Works",
      "Paint Works",
      "Unassigned",
    ]);
  });

  it("carries the count alongside the value — a share needs its denominator", () => {
    const s = groupBy(rows, (r) => r.category);
    const paint = s.find((x) => x.label === "Paint Works");
    expect(paint).toMatchObject({ value: 50000, count: 2 });
    expect(paint?.pct).toBeCloseTo(45.45, 1);
  });

  it("gives unclassified spend a name rather than a blank", () => {
    const s = groupBy(rows, (r) => r.category, (k) => k, "No category");
    expect(s.some((x) => x.label === "No category")).toBe(true);
  });

  it("does not divide by zero on an empty ledger", () => {
    expect(groupBy([], (r) => r.category)).toEqual([]);
  });
});

describe("byMonth", () => {
  it("runs oldest to newest — it is a trend, not a ranking", () => {
    const s = byMonth([
      e({ id: "1", paid_on: "2026-05-02" }),
      e({ id: "2", paid_on: "2026-01-15" }),
      e({ id: "3", paid_on: "2026-03-20" }),
    ]);
    expect(s.map((x) => x.label)).toEqual(["Jan 26", "Mar 26", "May 26"]);
  });
});
