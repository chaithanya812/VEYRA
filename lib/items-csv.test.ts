import { describe, it, expect } from "vitest";
import { parseItemsCsv, type ParsedRow } from "./items-csv";

/**
 * Locks the bulk-import CSV contract: header parsing (order/extra ignored),
 * required-name + type validation, quoted fields and in-file duplicate detection.
 */

function only(rows: ParsedRow[], status: ParsedRow["status"]) {
  return rows.filter((r) => r.status === status);
}

describe("parseItemsCsv", () => {
  it("parses a valid row with all fields, order-independent + extra column ignored", () => {
    const csv = [
      "name,type,base_uom,base_rate,tax_rate,code,hsn_sac,brand,category,description,junk",
      "18mm BWP Plywood,material,nos,95,18,PLY-18,C4412,Century,Plywood,Marine grade,ignoreme",
    ].join("\n");

    const { rows } = parseItemsCsv(csv);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.status).toBe("ok");
    expect(r.errors).toHaveLength(0);
    expect(r.values.name).toBe("18mm BWP Plywood");
    expect(r.values.type).toBe("material");
    expect(r.values.base_uom).toBe("nos");
    expect(r.values.base_rate).toBe(95);
    expect(r.values.tax_rate).toBe(18);
    expect(r.values.code).toBe("PLY-18");
    expect(r.values.hsn_sac).toBe("C4412");
    expect(r.values.brand).toBe("Century");
    expect(r.values.category).toBe("Plywood");
    expect(r.values.description).toBe("Marine grade");
    // nameKey normalises via lib/utils nameKey
    expect(r.nameKey).toBe("18mm bwp plywood");
  });

  it("flags a missing name as an error", () => {
    const csv = ["name,type,base_uom", ",material,nos"].join("\n");
    const { rows } = parseItemsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(rows[0].errors.some((e) => /name is required/i.test(e))).toBe(true);
  });

  it("flags an invalid type as an error", () => {
    const csv = ["name,type,base_uom", "Widget,widgetry,nos"].join("\n");
    const { rows } = parseItemsCsv(csv);
    expect(only(rows, "error")).toHaveLength(1);
    expect(rows[0].errors.some((e) => /invalid type/i.test(e))).toBe(true);
  });

  it("handles a quoted field containing a comma", () => {
    const csv = [
      "name,type,base_uom,description",
      'Bolt,material,nos,"M8, zinc plated, box of 100"',
    ].join("\n");
    const { rows } = parseItemsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ok");
    expect(rows[0].values.description).toBe("M8, zinc plated, box of 100");
  });

  it("detects duplicate names within the same file", () => {
    const csv = [
      "name,type,base_uom",
      "Same Item,material,nos",
      "Same Item,material,nos",
    ].join("\n");
    const { rows } = parseItemsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("ok");
    expect(rows[1].status).toBe("error");
    expect(rows[1].errors.some((e) => /duplicate/i.test(e))).toBe(true);
  });

  it("tolerates a trailing newline and missing optional columns", () => {
    const csv = ["name,type,base_uom", "Loose item,service,hour", ""].join("\n");
    const { rows } = parseItemsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ok");
    expect(rows[0].values.base_rate).toBeNull();
    expect(rows[0].values.tax_rate).toBe(18);
  });
});
