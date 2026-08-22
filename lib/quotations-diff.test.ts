import { describe, it, expect } from "vitest";
import { computeLine } from "./quotations-model";
import { diffQuotations, type DiffInput } from "./quotations-diff";

/**
 * Exercises the version-diff engine over two synthetic quote snapshots with a
 * shared version_group. One section, three lines in the older version; the
 * newer version adds a line, removes a line, and changes qty + rate on a third.
 */

function makeLine(over: Partial<{
  id: string;
  section_id: string | null;
  item_id: string | null;
  sort_order: number;
  title: string;
  qty: number;
  uom: string;
  unit_price: number;
  discount_type: "amount" | "percent";
  discount_value: number;
  tax_rate: number;
}>) {
  const i = over.discount_type ?? "amount";
  const v = over.discount_value ?? 0;
  const t = computeLine({
    qty: over.qty ?? 1,
    unit_price: over.unit_price ?? 100,
    discount_type: i,
    discount_value: v,
    tax_rate: over.tax_rate ?? 18,
  });
  return {
    id: over.id ?? "l-default",
    quotation_id: "q",
    section_id: over.section_id ?? "s1",
    item_id: over.item_id ?? null,
    sort_order: over.sort_order ?? 0,
    title: over.title ?? "Item",
    area: null,
    category: null,
    description: null,
    image_url: null,
    hsn_sac: null,
    qty: over.qty ?? 1,
    uom: over.uom ?? "nos",
    unit_price: over.unit_price ?? 100,
    discount_type: i,
    discount_value: v,
    discount_amount: t.discount_amount,
    tax_rate: over.tax_rate ?? 18,
    cost_rate: 0,
    line_subtotal: t.line_subtotal,
    taxable: t.taxable,
    tax_amount: t.tax_amount,
    line_total: t.line_total,
    line_cost: t.line_cost,
  };
}

function makeInput(lines: ReturnType<typeof makeLine>[], over: { grand_total?: number; subtotal?: number; taxable_total?: number; tax_total?: number } = {}): DiffInput {
  return {
    quotation: {
      id: "q",
      lead_id: null,
      party_id: null,
      number: "QT/2026/0001",
      version_group: "vg-1",
      version: 1,
      title: "Quote",
      status: "draft",
      customer_name: null,
      customer_phone: null,
      customer_email: null,
      site_address: null,
      place_of_supply: null,
      seller_state: null,
      gst_treatment: "intra",
      works_contract: false,
      currency: "INR",
      subtotal: over.subtotal ?? 0,
      discount_total: 0,
      taxable_total: over.taxable_total ?? 0,
      tax_total: over.tax_total ?? 0,
      cgst_total: 0,
      sgst_total: 0,
      igst_total: 0,
      grand_total: over.grand_total ?? 0,
      cost_total: 0,
      margin_total: 0,
      notes: null,
      terms: null,
      valid_until: null,
      share_token: null,
      share_enabled: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    sections: [{ id: "s1", quotation_id: "q", title: "Living Room", sort_order: 0 }],
    lines,
  };
}

describe("quotation version diff", () => {
  const older = makeInput(
    [
      makeLine({ id: "a", item_id: "i1", sort_order: 0, title: "Sofa", qty: 1, unit_price: 1000 }),
      makeLine({ id: "b", item_id: "i2", sort_order: 1, title: "Chair", qty: 2, unit_price: 500 }),
      makeLine({ id: "c", item_id: "i3", sort_order: 2, title: "Table", qty: 1, unit_price: 800 }),
    ],
    { subtotal: 2800, taxable_total: 2800, tax_total: 504, grand_total: 3304 },
  );

  const newer = makeInput(
    [
      // "Sofa" qty 1 -> 3 (changed qty)
      makeLine({ id: "a2", item_id: "i1", sort_order: 0, title: "Sofa", qty: 3, unit_price: 1000 }),
      // "Chair" rate 500 -> 600 (changed rate)
      makeLine({ id: "b2", item_id: "i2", sort_order: 1, title: "Chair", qty: 2, unit_price: 600 }),
      // "Table" removed from newer
      // "Lamp" added in newer
      makeLine({ id: "d2", item_id: "i4", sort_order: 2, title: "Lamp", qty: 1, unit_price: 250 }),
    ],
    { subtotal: 4450, taxable_total: 4450, tax_total: 801, grand_total: 5251 },
  );

  const diff = diffQuotations(older, newer);
  const section = diff.sections[0];

  it("flags a line added in the newer version", () => {
    expect(section.added).toHaveLength(1);
    expect(section.added[0].title).toBe("Lamp");
  });

  it("flags a line removed from the older version", () => {
    expect(section.removed).toHaveLength(1);
    expect(section.removed[0].title).toBe("Table");
  });

  it("flags a changed qty and a changed rate on matched lines", () => {
    const changedTitles = section.changed.map((c) => c.title).sort();
    expect(changedTitles).toEqual(["Chair", "Sofa"]);

    const sofa = section.changed.find((c) => c.title === "Sofa")!;
    const qtyChange = sofa.changes.find((ch) => ch.field === "qty")!;
    expect(qtyChange.oldValue).toBe(1);
    expect(qtyChange.newValue).toBe(3);

    const chair = section.changed.find((c) => c.title === "Chair")!;
    const rateChange = chair.changes.find((ch) => ch.field === "unit_price")!;
    expect(rateChange.oldValue).toBe(500);
    expect(rateChange.newValue).toBe(600);
  });

  it("reports the grand_total header delta", () => {
    expect(diff.header.grand_total.old).toBe(3304);
    expect(diff.header.grand_total.new).toBe(5251);
    expect(diff.header.grand_total.delta).toBe(1947);
  });

  it("matches by item_id + title even when the id differs across versions", () => {
    // Both "Sofa" share item_id i1, so they pair despite new ids (a vs a2).
    expect(section.changed.find((c) => c.title === "Sofa")!.oldLine.id).toBe("a");
    expect(section.changed.find((c) => c.title === "Sofa")!.newLine.id).toBe("a2");
  });
});
