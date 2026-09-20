import { describe, expect, it } from "vitest";
import {
  assemblePoPdf,
  samplePoPdfData,
  DEFAULT_PO_TEMPLATE,
  type PoPdfData,
  type PoPdfTemplateConfig,
} from "./po-pdf";
import { poAmount } from "./po-model";
import { allocateMilestoneAmounts } from "./po-plan-model";

/**
 * Locks the PO PDF's DATA assembly — payment rows foot to the PO amount,
 * the GST split reconciles, and template toggles actually change the
 * payload. jsPDF's drawing is not under test.
 */

function baseData(template: Partial<PoPdfTemplateConfig> = {}): PoPdfData {
  const lines = [
    { item_name: "18mm BWP Plywood", uom: "sheet", qty: 40, unit_rate: 1820, tax_pct: 18 },
    { item_name: "1mm Laminate", uom: "sheet", qty: 25, unit_rate: 940, tax_pct: 18 },
    { item_name: "Freight & delivery", uom: null, qty: 1, unit_rate: 1200, tax_pct: 18 },
  ];
  return {
    number: "PO/2026-27/0001",
    name: "PO — Plywood",
    orderDate: "2026-09-20",
    deliveryDate: "2026-10-15",
    seller: { name: "VEYRA Interiors", gstin: "36AABCU9603R1ZX" },
    vendor: { name: "Century Ply", gstin: "36AABCC1234D1Z5" },
    projectLabel: "Malviya Nagar 3BHK",
    lines,
    amount: poAmount(lines),
    paymentMilestones: [
      { label: "Advance", pct: 25 },
      { label: "Delivery", pct: 45 },
      { label: "Installation", pct: 30 },
    ],
    termsTitle: "GST exclusive",
    termsBody: "Prices are exclusive of GST unless stated otherwise.",
    template: { ...DEFAULT_PO_TEMPLATE, ...template },
    gstTreatment: "intra",
  };
}

describe("assemblePoPdf", () => {
  it("falls back to the PO name when number is null", () => {
    const view = assemblePoPdf({ ...baseData(), number: null, name: "PO — Century Ply" });
    expect(view.documentNumber).toBe("PO — Century Ply");
  });

  it("uses the issued number when present", () => {
    expect(assemblePoPdf(baseData()).documentNumber).toBe("PO/2026-27/0001");
  });

  it("payment rows foot exactly to the PO amount (allocateMilestoneAmounts)", () => {
    const data = baseData();
    const view = assemblePoPdf(data);
    const expected = allocateMilestoneAmounts(data.paymentMilestones, data.amount);
    expect(view.paymentRows).toEqual(expected);
    expect(view.paymentRowsTotal).toBe(data.amount);
    expect(view.subtotal).toBe(data.amount);
    expect(view.subtotal).toBe(97500);
  });

  it("GST split reconciles on intra-state (CGST + SGST = tax, IGST = 0)", () => {
    const view = assemblePoPdf(baseData());
    // 18% of ₹97,500 = ₹17,550; halves are exact.
    expect(view.taxTotal).toBe(17550);
    expect(view.gst.cgst).toBe(8775);
    expect(view.gst.sgst).toBe(8775);
    expect(view.gst.igst).toBe(0);
    expect(view.gst.cgst + view.gst.sgst + view.gst.igst).toBe(view.taxTotal);
    expect(view.grandTotal).toBe(view.subtotal + view.taxTotal);
    expect(view.grandTotal).toBe(115050);
  });

  it("GST split is all IGST on inter-state", () => {
    const view = assemblePoPdf({ ...baseData(), gstTreatment: "inter" });
    expect(view.gst.igst).toBe(17550);
    expect(view.gst.cgst).toBe(0);
    expect(view.gst.sgst).toBe(0);
    expect(view.taxTotal).toBe(17550);
  });

  it("V6 — flipping show_tax_column drops Tax % from the column list", () => {
    const on = assemblePoPdf(baseData({ show_tax_column: true }));
    const off = assemblePoPdf(baseData({ show_tax_column: false }));
    expect(on.columns).toContain("Tax %");
    expect(off.columns).not.toContain("Tax %");
    expect(off.columns).not.toEqual(on.columns);
  });

  it("V6 — flipping show_payment_plan drops the payment_plan section", () => {
    const on = assemblePoPdf(baseData({ show_payment_plan: true }));
    const off = assemblePoPdf(baseData({ show_payment_plan: false }));
    expect(on.sections).toContain("payment_plan");
    expect(off.sections).not.toContain("payment_plan");
    expect(off.paymentRows).toEqual([]);
    expect(off.sections).not.toEqual(on.sections);
  });

  it("show_uom_column and show_terms also change the payload", () => {
    const on = assemblePoPdf(baseData());
    const off = assemblePoPdf(baseData({ show_uom_column: false, show_terms: false }));
    expect(on.columns).toContain("UOM");
    expect(off.columns).not.toContain("UOM");
    expect(on.sections).toContain("terms");
    expect(off.sections).not.toContain("terms");
    expect(off.termsBody).toBeNull();
  });

  it("show_bank_details includes bank_details only when on and text is present", () => {
    const hidden = assemblePoPdf(baseData({ show_bank_details: false, bank_details: "HDFC 123" }));
    const empty = assemblePoPdf(baseData({ show_bank_details: true, bank_details: "  " }));
    const shown = assemblePoPdf(baseData({ show_bank_details: true, bank_details: "HDFC 123" }));
    expect(hidden.sections).not.toContain("bank_details");
    expect(empty.sections).not.toContain("bank_details");
    expect(shown.sections).toContain("bank_details");
    expect(shown.bankDetails).toBe("HDFC 123");
  });

  it("a tenant with no template config still assembles against DEFAULT_PO_TEMPLATE", () => {
    const view = assemblePoPdf({ ...baseData(), template: DEFAULT_PO_TEMPLATE });
    expect(view.sections).toEqual(
      expect.arrayContaining(["header", "parties", "lines", "summary", "payment_plan", "terms", "signature"]),
    );
    expect(view.columns).toEqual(["#", "Item", "UOM", "Qty", "Rate", "Tax %", "Amount"]);
    expect(view.signatureLabel).toBe("Authorised signatory");
  });

  it("sample payload is a real PoPdfData the same assemble function accepts", () => {
    const sample = samplePoPdfData(DEFAULT_PO_TEMPLATE);
    const view = assemblePoPdf(sample);
    expect(view.subtotal).toBe(poAmount(sample.lines));
    expect(view.paymentRowsTotal).toBe(view.subtotal);
    expect(view.documentNumber).toBe("PO/2026-27/0001");
  });
});
