import { describe, it, expect } from "vitest";
import {
  buildScopeTree,
  orderableScope,
  scopeLabel,
  type ScopeItem,
} from "./scope-model";

function item(over: Partial<ScopeItem> & { id: string }): ScopeItem {
  return {
    project_id: "p1",
    quotation_id: "q1",
    parent_id: null,
    code: null,
    name: "Base cabinets",
    room: null,
    uom: "rft",
    qty: 18,
    sort_order: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

describe("buildScopeTree", () => {
  it("nests children under their room parent", () => {
    const tree = buildScopeTree([
      item({ id: "kitchen", name: "Kitchen", qty: null, sort_order: 0 }),
      item({ id: "line1", parent_id: "kitchen", sort_order: 1 }),
      item({ id: "line2", parent_id: "kitchen", name: "Granite", sort_order: 0 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.id)).toEqual(["line2", "line1"]);
  });

  it("sorts every level by sort order, then name", () => {
    const tree = buildScopeTree([
      item({ id: "b", name: "Bedroom", sort_order: 1 }),
      item({ id: "a", name: "Kitchen", sort_order: 0 }),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("surfaces an orphan as a root rather than losing it", () => {
    // A parent filtered out of the query must not take its children with it.
    const tree = buildScopeTree([item({ id: "line1", parent_id: "missing" })]);
    expect(tree.map((n) => n.id)).toEqual(["line1"]);
  });

  it("handles an empty scope", () => {
    expect(buildScopeTree([])).toEqual([]);
  });
});

describe("orderableScope", () => {
  it("excludes room parents — you cannot order 'Kitchen'", () => {
    const rows = orderableScope([
      item({ id: "kitchen", name: "Kitchen", qty: 5 }),
      item({ id: "line1", parent_id: "kitchen" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["line1"]);
  });

  it("excludes a leaf with no quantity", () => {
    expect(orderableScope([item({ id: "l", qty: null })])).toEqual([]);
    expect(orderableScope([item({ id: "l", qty: 0 })])).toEqual([]);
  });

  it("accepts a numeric string quantity, which is what PostgREST returns", () => {
    expect(orderableScope([item({ id: "l", qty: "18.000" })])).toHaveLength(1);
  });
});

describe("scopeLabel", () => {
  it("qualifies an item with its room", () => {
    expect(scopeLabel({ name: "Base cabinets", room: "Kitchen" })).toBe(
      "Kitchen — Base cabinets",
    );
  });

  it("does not repeat itself when the room is the name", () => {
    expect(scopeLabel({ name: "Kitchen", room: "Kitchen" })).toBe("Kitchen");
  });

  it("falls back to the bare name", () => {
    expect(scopeLabel({ name: "Base cabinets", room: null })).toBe("Base cabinets");
  });
});
