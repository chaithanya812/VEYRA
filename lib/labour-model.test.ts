import { describe, it, expect } from "vitest";
import {
  NO_CONTRACT,
  NO_VENDOR,
  byCategory,
  byContract,
  bySkill,
  byVendor,
  dailyTrend,
  filterEntries,
  summarise,
  totalOf,
  validateDraft,
  type LabourEntry,
} from "./labour-model";

function e(over: Partial<LabourEntry> & { id: string }): LabourEntry {
  return {
    project_id: "p1",
    entry_date: "2026-06-18",
    contract_id: null,
    skilled: 1,
    unskilled: 1,
    coordinator: 0,
    remark: null,
    client_visible: false,
    created_at: "2026-06-18T08:00:00.000Z",
    categories: [],
    vendor_ids: [],
    ...over,
  };
}

describe("totals reconcile", () => {
  it("adds the three counts and nothing else", () => {
    expect(totalOf({ skilled: 5, unskilled: 2, coordinator: 2 })).toBe(9);
    expect(totalOf({ skilled: 0, unskilled: 0, coordinator: 0 })).toBe(0);
  });

  it("reproduces the frame: 34 + 25 + 12 = 71", () => {
    // `105620`'s header strip, split across three days.
    const entries = [
      e({ id: "a", skilled: 20, unskilled: 15, coordinator: 7 }),
      e({ id: "b", skilled: 10, unskilled: 6, coordinator: 3 }),
      e({ id: "c", skilled: 4, unskilled: 4, coordinator: 2 }),
    ];
    const t = summarise(entries);
    expect(t).toEqual({ entries: 3, skilled: 34, unskilled: 25, coordinator: 12, total: 71 });
    expect(t.skilled + t.unskilled + t.coordinator).toBe(t.total);
  });

  it("is zero for no entries rather than undefined", () => {
    expect(summarise([])).toEqual({
      entries: 0, skilled: 0, unskilled: 0, coordinator: 0, total: 0,
    });
  });

  it("truncates junk to an integer instead of producing NaN", () => {
    const odd = e({ id: "a", skilled: 2.7, unskilled: Number.NaN, coordinator: 1 });
    expect(totalOf(odd)).toBe(3);
    expect(summarise([odd]).total).toBe(3);
  });
});

describe("filterEntries", () => {
  const entries = [
    e({ id: "a", entry_date: "2026-01-10", categories: ["carpentry_woodwork"], vendor_ids: ["v1"], contract_id: "c1", client_visible: true }),
    e({ id: "b", entry_date: "2026-02-10", categories: ["paint_works"], vendor_ids: [] }),
    e({ id: "c", entry_date: "2026-03-10", categories: ["carpentry_woodwork", "paint_works"], vendor_ids: ["v1", "v2"], remark: "Night shift" }),
  ];

  it("bounds the date range inclusively at both ends", () => {
    expect(filterEntries(entries, { from: "2026-02-10", to: "2026-03-10" }).map((x) => x.id))
      .toEqual(["b", "c"]);
    expect(filterEntries(entries, { from: "2026-01-10", to: "2026-01-10" }).map((x) => x.id))
      .toEqual(["a"]);
  });

  it("matches an entry carrying the category among several", () => {
    expect(filterEntries(entries, { category: "paint_works" }).map((x) => x.id))
      .toEqual(["b", "c"]);
  });

  it("treats No Vendor as a real answer, not as 'any'", () => {
    expect(filterEntries(entries, { vendorId: NO_VENDOR }).map((x) => x.id)).toEqual(["b"]);
    expect(filterEntries(entries, { vendorId: "v2" }).map((x) => x.id)).toEqual(["c"]);
  });

  it("treats No Contract the same way", () => {
    expect(filterEntries(entries, { contractId: NO_CONTRACT }).map((x) => x.id))
      .toEqual(["b", "c"]);
    expect(filterEntries(entries, { contractId: "c1" }).map((x) => x.id)).toEqual(["a"]);
  });

  it("narrows to what a client would be shown", () => {
    expect(filterEntries(entries, { clientVisibleOnly: true }).map((x) => x.id)).toEqual(["a"]);
  });

  it("searches remarks, trades and vendor names", () => {
    expect(filterEntries(entries, { query: "night" }).map((x) => x.id)).toEqual(["c"]);
    expect(filterEntries(entries, { query: "paint" }).map((x) => x.id)).toEqual(["b", "c"]);
    expect(
      filterEntries(entries, { query: "navneet" }, (id) => (id === "v2" ? "Navneet" : "Other"))
        .map((x) => x.id),
    ).toEqual(["c"]);
  });

  it("returns everything for an empty filter", () => {
    expect(filterEntries(entries, {})).toHaveLength(3);
  });
});

describe("dailyTrend", () => {
  it("sums a day's entries into one point, oldest first", () => {
    const points = dailyTrend([
      e({ id: "a", entry_date: "2026-03-24", skilled: 5, unskilled: 3, coordinator: 1 }),
      e({ id: "b", entry_date: "2026-01-05", skilled: 1, unskilled: 0, coordinator: 0 }),
      e({ id: "c", entry_date: "2026-03-24", skilled: 0, unskilled: 0, coordinator: 0 }),
    ]);
    expect(points).toEqual([
      { date: "2026-01-05", count: 1 },
      { date: "2026-03-24", count: 9 },
    ]);
  });

  it("plots no point for a day nobody recorded", () => {
    // "nobody worked" and "nobody wrote it down" are different claims.
    const points = dailyTrend([e({ id: "a", entry_date: "2026-03-24" })]);
    expect(points).toHaveLength(1);
  });

  it("is empty for no entries", () => {
    expect(dailyTrend([])).toEqual([]);
  });
});

describe("breakdowns", () => {
  const entries = [
    e({ id: "a", skilled: 4, unskilled: 3, coordinator: 1, categories: ["carpentry_woodwork"], vendor_ids: ["v1"], contract_id: "c1" }),
    e({ id: "b", skilled: 1, unskilled: 1, coordinator: 0, categories: [], vendor_ids: [] }),
  ];

  it("gives an untagged entry its own slice rather than dropping it", () => {
    const out = byCategory(entries, (s) => s.toUpperCase());
    expect(out.slices).toEqual([
      { key: "carpentry_woodwork", label: "CARPENTRY_WOODWORK", count: 8 },
      { key: "", label: "No category", count: 2 },
    ]);
    expect(out.reportTotal).toBe(10);
    expect(out.overlaps).toBe(false);
  });

  it("counts a multi-trade entry under every trade, and says the slices overlap", () => {
    const both = [e({ id: "x", skilled: 9, unskilled: 0, coordinator: 0, categories: ["a", "b"] })];
    const out = byCategory(both);
    // Nine people did carpentry AND painting — they were nine people on each.
    expect(out.slices.map((s) => s.count)).toEqual([9, 9]);
    expect(out.sliceTotal).toBe(18);
    expect(out.reportTotal).toBe(9);
    expect(out.overlaps).toBe(true);
  });

  it("keeps No Vendor as a slice", () => {
    const out = byVendor(entries, (id) => (id === "v1" ? "Navneet" : id));
    expect(out.slices).toEqual([
      { key: "v1", label: "Navneet", count: 8 },
      { key: NO_VENDOR, label: "No vendor", count: 2 },
    ]);
  });

  it("always reconciles by contract, because an entry has exactly one", () => {
    const out = byContract(entries, () => "Labour Contract - 1");
    expect(out.sliceTotal).toBe(out.reportTotal);
    expect(out.overlaps).toBe(false);
    expect(out.slices.map((s) => s.label)).toEqual(["Labour Contract - 1", "No contract"]);
  });

  it("splits by skill and foots to the same total", () => {
    const out = bySkill(entries);
    expect(out.slices.map((s) => [s.label, s.count])).toEqual([
      ["Skilled", 5],
      ["Unskilled", 4],
      ["Coordinator", 1],
    ]);
    expect(out.sliceTotal).toBe(10);
    expect(out.overlaps).toBe(false);
  });

  it("drops empty slices rather than drawing a zero-width wedge", () => {
    expect(bySkill([e({ id: "a", skilled: 3, unskilled: 0, coordinator: 0 })]).slices)
      .toEqual([{ key: "skilled", label: "Skilled", count: 3 }]);
  });
});

describe("validateDraft", () => {
  const ok = {
    entry_date: "2026-06-27",
    skilled: 1,
    unskilled: 0,
    coordinator: 0,
  };

  it("accepts an entry with no vendor, no contract and no trade", () => {
    expect(validateDraft(ok)).toEqual({});
  });

  it("refuses an attendance of nobody", () => {
    expect(validateDraft({ ...ok, skilled: 0 }).error).toMatch(/at least one person/i);
  });

  it("refuses a negative headcount", () => {
    expect(validateDraft({ ...ok, unskilled: -2 }).error).toMatch(/negative/i);
  });

  it("needs a real date", () => {
    expect(validateDraft({ ...ok, entry_date: "" }).error).toMatch(/date/i);
    expect(validateDraft({ ...ok, entry_date: "27/06/2026" }).error).toMatch(/date/i);
  });
});
