import { describe, it, expect } from "vitest";
import { parseItemsCsv } from "./items-csv";
import { nameKey } from "./utils";
import {
  STARTER_CATALOGUE,
  parsedStarterCatalogue,
  starterCatalogueByCategory,
  starterCatalogueCsv,
} from "./starter-catalogue";

describe("starter catalogue", () => {
  it("is grouped by category with more than one group", () => {
    const groups = starterCatalogueByCategory();
    expect(groups.length).toBeGreaterThanOrEqual(4);
    const fromGroups = groups.flatMap((g) => g.items);
    expect(fromGroups).toHaveLength(STARTER_CATALOGUE.length);
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
      expect(g.items.every((row) => row.category === g.category)).toBe(true);
    }
  });

  it("every row has both taxonomy axes and a unique name", () => {
    const keys = STARTER_CATALOGUE.map((r) => nameKey(r.name));
    expect(new Set(keys).size).toBe(keys.length);
    for (const row of STARTER_CATALOGUE) {
      expect(row.category.trim().length).toBeGreaterThan(0);
      expect(row.good_type.trim().length).toBeGreaterThan(0);
      expect(row.type).toBeTruthy();
      expect(row.base_uom).toBeTruthy();
    }
  });

  it("codes are unique when set", () => {
    const codes = STARTER_CATALOGUE.map((r) => r.code).filter(
      (c): c is string => !!c,
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("round-trips through parseItemsCsv with good_type intact", () => {
    const { rows } = parsedStarterCatalogue();
    expect(rows).toHaveLength(STARTER_CATALOGUE.length);
    expect(rows.every((r) => r.status === "ok")).toBe(true);
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].values.name).toBe(STARTER_CATALOGUE[i].name);
      expect(rows[i].values.category).toBe(STARTER_CATALOGUE[i].category);
      expect(rows[i].values.good_type).toBe(STARTER_CATALOGUE[i].good_type);
      expect(rows[i].values.type).toBe(STARTER_CATALOGUE[i].type);
    }
  });

  it("the CSV is what parseItemsCsv itself consumes (no private parser)", () => {
    const csv = starterCatalogueCsv();
    expect(csv.startsWith("name,code,type,")).toBe(true);
    expect(csv).toContain("good_type");
    const { rows } = parseItemsCsv(csv);
    expect(rows.filter((r) => r.status === "error")).toEqual([]);
  });
});
