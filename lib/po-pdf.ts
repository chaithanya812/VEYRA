/**
 * Client-side purchase-order PDF — a one-click download the tenant can send
 * a vendor. Plain jsPDF + jspdf-autotable, cloned in structure from
 * lib/quotations-pdf.ts (same scaffolding, different document). A PO is not
 * a quotation: this module does not import that one, and coupling them is
 * worse than a little duplication of layout helpers.
 *
 * Money is never invented here. Line rates and tax % are human-entered
 * config; subtotal is the stored purchase_orders.amount; GST is derived via
 * splitGst / computeGstTotals; payment rupees come from
 * allocateMilestoneAmounts. The PDF only lays them out.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  computeGstTotals,
  round2,
  type GstSplit,
  type GstTreatment,
} from "@/lib/quotations-model";
import { lineTotal, poAmount } from "@/lib/po-model";
import { allocateMilestoneAmounts, type AllocatedMilestone } from "@/lib/po-plan-model";
import { uomLabel } from "@/lib/items-ui";

/* Brand palette (DESIGN-DIRECTION: white / near-black / red accent). */
const RED: [number, number, number] = [214, 40, 40];
const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];
const LINE: [number, number, number] = [228, 228, 231];
const SUNKEN: [number, number, number] = [244, 244, 245];

/** jsPDF core fonts are WinAnsi — ₹ and smart punctuation aren't in them. */
function clean(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/₹/g, "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, "-");
}

function inrPdf(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return "Rs. " + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const uomOf = (u: string | null | undefined) => {
  if (!u) return "-";
  return uomLabel[u as keyof typeof uomLabel] ?? u;
};

export interface PoPdfLine {
  item_name: string;
  uom: string | null;
  qty: number;
  unit_rate: number;
  tax_pct: number;
}

export interface PoPdfVendor {
  name: string;
  gstin?: string | null;
  address?: string | null;
  contact?: string | null;
}

export interface PoPdfSeller {
  name?: string | null;
  gstin?: string | null;
}

/** The tenant-authored PDF toggles and text. URLs are pasted, never uploaded. */
export interface PoPdfTemplateConfig {
  footer_note: string | null;
  signature_label: string | null;
  logo_url: string | null;
  signature_url: string | null;
  show_tax_column: boolean;
  show_uom_column: boolean;
  show_payment_plan: boolean;
  show_terms: boolean;
  show_bank_details: boolean;
  bank_details: string | null;
}

export const DEFAULT_PO_TEMPLATE: PoPdfTemplateConfig = {
  footer_note: null,
  signature_label: "Authorised signatory",
  logo_url: null,
  signature_url: null,
  show_tax_column: true,
  show_uom_column: true,
  show_payment_plan: true,
  show_terms: true,
  show_bank_details: false,
  bank_details: null,
};

export interface PoPdfData {
  /** Issued document number; fall back to the PO name when null. */
  number: string | null;
  name: string;
  orderDate: string | null;
  deliveryDate: string | null;
  seller?: PoPdfSeller | null;
  vendor: PoPdfVendor;
  projectLabel: string | null;
  lines: PoPdfLine[];
  /** Stored purchase_orders.amount — the pre-tax Σ of line totals. */
  amount: number;
  paymentMilestones: { label: string; pct: number }[];
  termsTitle: string | null;
  termsBody: string | null;
  template: PoPdfTemplateConfig;
  gstTreatment?: GstTreatment;
}

export type PoPdfSectionId =
  | "header"
  | "parties"
  | "lines"
  | "summary"
  | "payment_plan"
  | "terms"
  | "bank_details"
  | "signature";

export interface PoPdfAssembly {
  documentNumber: string;
  columns: string[];
  sections: PoPdfSectionId[];
  subtotal: number;
  gst: GstSplit;
  taxTotal: number;
  grandTotal: number;
  paymentRows: AllocatedMilestone[];
  paymentRowsTotal: number;
  footerNote: string | null;
  signatureLabel: string;
  bankDetails: string | null;
  termsTitle: string | null;
  termsBody: string | null;
}

function lineTaxAmount(taxable: number, taxPct: number): number {
  return round2(taxable * (Number(taxPct) || 0) / 100);
}

/**
 * Assemble the numbers and section list the PDF will draw. Tests lock THIS,
 * not jsPDF's drawing. Toggles that change nothing are a failed unit.
 */
export function assemblePoPdf(data: PoPdfData): PoPdfAssembly {
  const t = data.template;
  const documentNumber = (data.number && data.number.trim()) || data.name;
  const treatment: GstTreatment = data.gstTreatment === "inter" ? "inter" : "intra";

  const columns = ["#", "Item"];
  if (t.show_uom_column) columns.push("UOM");
  columns.push("Qty", "Rate");
  if (t.show_tax_column) columns.push("Tax %");
  columns.push("Amount");

  const gstLines = data.lines.map((l) => {
    const taxable = lineTotal(l.qty, l.unit_rate);
    return {
      tax_rate: Number(l.tax_pct) || 0,
      taxable,
      tax_amount: lineTaxAmount(taxable, l.tax_pct),
    };
  });
  const gst = computeGstTotals(gstLines, treatment);
  const taxTotal = round2(gst.cgst + gst.sgst + gst.igst);
  const subtotal = Number(data.amount) || 0;
  const grandTotal = round2(subtotal + taxTotal);

  const paymentRows =
    t.show_payment_plan && data.paymentMilestones.length > 0
      ? allocateMilestoneAmounts(data.paymentMilestones, subtotal)
      : [];
  const paymentRowsTotal = round2(paymentRows.reduce((s, r) => s + r.amount, 0));

  const termsBody = t.show_terms ? (data.termsBody?.trim() || null) : null;
  const termsTitle = termsBody ? (data.termsTitle?.trim() || null) : null;
  const bankDetails = t.show_bank_details ? (t.bank_details?.trim() || null) : null;
  const footerNote = t.footer_note?.trim() || null;
  const signatureLabel = t.signature_label?.trim() || DEFAULT_PO_TEMPLATE.signature_label || "Authorised signatory";

  const sections: PoPdfSectionId[] = ["header", "parties", "lines", "summary"];
  if (paymentRows.length > 0) sections.push("payment_plan");
  if (termsBody) sections.push("terms");
  if (bankDetails) sections.push("bank_details");
  sections.push("signature");

  return {
    documentNumber,
    columns,
    sections,
    subtotal,
    gst,
    taxTotal,
    grandTotal,
    paymentRows,
    paymentRowsTotal,
    footerNote,
    signatureLabel,
    bankDetails,
    termsTitle,
    termsBody,
  };
}

/** Static sample used by Settings → Preview PDF. Same renderer as a real PO. */
export function samplePoPdfData(template: PoPdfTemplateConfig): PoPdfData {
  const lines: PoPdfLine[] = [
    { item_name: "18mm BWP Plywood", uom: "sheet", qty: 40, unit_rate: 1820, tax_pct: 18 },
    { item_name: "1mm Laminate", uom: "sheet", qty: 25, unit_rate: 940, tax_pct: 18 },
    { item_name: "Freight & delivery", uom: null, qty: 1, unit_rate: 1200, tax_pct: 18 },
  ];
  return {
    number: "PO/2026-27/0001",
    name: "Sample purchase order",
    orderDate: "2026-09-20",
    deliveryDate: "2026-10-15",
    seller: { name: "VEYRA Interiors", gstin: "36AABCU9603R1ZX" },
    vendor: {
      name: "Century Ply",
      gstin: "36AABCC1234D1Z5",
      address: "Hyderabad, Telangana",
    },
    projectLabel: "Malviya Nagar 3BHK",
    lines,
    amount: poAmount(lines),
    paymentMilestones: [
      { label: "Advance", pct: 25 },
      { label: "Delivery", pct: 45 },
      { label: "Installation", pct: 30 },
    ],
    termsTitle: "GST exclusive",
    termsBody:
      "Prices are exclusive of GST unless stated otherwise. GST will be charged at the rate applicable on the date of invoice, against a tax invoice.",
    template,
    gstTreatment: "intra",
  };
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function afterTable(doc: jsPDF, fallback: number): number {
  return (doc as DocWithTable).lastAutoTable?.finalY ?? fallback;
}

export function generatePoPdf(data: PoPdfData): void {
  const view = assemblePoPdf(data);
  const t = data.template;
  const inter = data.gstTreatment === "inter";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  // ── Header band ──
  // D5: logo_url / signature_url are pasted URLs. Fetching + encoding them
  // for jsPDF addImage is not reliable from the browser (CORS) without an
  // upload pipeline, which this unit does not build. Text always renders;
  // images are skipped rather than half-built.
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 76, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(clean(data.seller?.name || "Purchase order"), M, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("PURCHASE ORDER", M, 58);
  doc.setFontSize(10);
  doc.text(clean(view.documentNumber), W - M, 36, { align: "right" });
  doc.setFontSize(9);
  if (data.orderDate) doc.text(`Order: ${fmtDate(data.orderDate)}`, W - M, 52, { align: "right" });
  if (data.seller?.gstin) {
    doc.text(clean(`GSTIN: ${data.seller.gstin}`), W - M, 66, { align: "right" });
  } else if (data.deliveryDate) {
    doc.text(`Delivery: ${fmtDate(data.deliveryDate)}`, W - M, 66, { align: "right" });
  }

  // ── Vendor (bill-to) / ship-to ──
  let y = 104;
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("VENDOR", M, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  y += 14;
  const vendorLines: string[] = [clean(data.vendor.name || "-")];
  if (data.vendor.gstin) vendorLines.push(clean(`GSTIN: ${data.vendor.gstin}`));
  if (data.vendor.address) vendorLines.push(clean(data.vendor.address));
  if (data.vendor.contact) vendorLines.push(clean(data.vendor.contact));
  for (const line of vendorLines) {
    doc.text(line, M, y);
    y += 13;
  }

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let sy = 104;
  doc.text("SHIP TO / PROJECT", W - M, sy, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  sy += 14;
  const ship: string[] = [];
  if (data.projectLabel) ship.push(clean(data.projectLabel));
  if (data.deliveryDate) ship.push(`Delivery: ${fmtDate(data.deliveryDate)}`);
  if (data.orderDate) ship.push(`Order date: ${fmtDate(data.orderDate)}`);
  for (const line of ship.length ? ship : ["-"]) {
    doc.text(line, W - M, sy, { align: "right" });
    sy += 13;
  }

  y = Math.max(y, sy) + 8;

  // ── Line table (seven columns, dropping UOM / Tax % when toggled off) ──
  type Cell =
    | string
    | number
    | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const body: Cell[][] = [];
  let sn = 1;
  const money = (n: number) => ({ content: inrPdf(n), styles: { halign: "right" as const } });

  for (const l of data.lines) {
    const row: Cell[] = [
      { content: String(sn++), styles: { halign: "center" } },
      { content: clean(l.item_name) },
    ];
    if (t.show_uom_column) row.push({ content: clean(uomOf(l.uom)) });
    row.push({ content: String(Number(l.qty)), styles: { halign: "right" } });
    row.push(money(l.unit_rate));
    if (t.show_tax_column) {
      row.push({ content: `${Number(l.tax_pct) || 0}%`, styles: { halign: "right" } });
    }
    row.push({
      content: inrPdf(lineTotal(l.qty, l.unit_rate)),
      styles: { halign: "right", fontStyle: "bold" },
    });
    body.push(row);
  }

  const colCount = view.columns.length;
  const columnStyles: Record<number, { cellWidth?: number | "auto"; halign?: "center" | "right" | "left" }> = {
    0: { cellWidth: 22, halign: "center" },
    1: { cellWidth: "auto" },
  };
  // Remaining numeric columns hug the right; widths stay lean.
  for (let i = 2; i < colCount; i++) {
    const isLast = i === colCount - 1;
    columnStyles[i] = { cellWidth: isLast ? 78 : 52, halign: "right" };
  }

  autoTable(doc, {
    startY: y,
    head: [view.columns],
    body: body as never,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: LINE, textColor: INK, valign: "top" },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles,
    margin: { left: M, right: M },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...LINE);
      doc.line(M, H - 34, W - M, H - 34);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Generated by VEYRA", M, H - 20);
      doc.text(clean(view.documentNumber), W - M, H - 20, { align: "right" });
    },
  });

  let ty = afterTable(doc, y) + 18;
  const H = doc.internal.pageSize.getHeight();
  if (ty > H - 200) {
    doc.addPage();
    ty = 60;
  }

  // ── Amount summary ──
  const rows: [string, string, boolean?][] = [["Subtotal", inrPdf(view.subtotal)]];
  if (inter) {
    rows.push(["IGST", inrPdf(view.gst.igst)]);
  } else {
    rows.push(["CGST", inrPdf(view.gst.cgst)]);
    rows.push(["SGST", inrPdf(view.gst.sgst)]);
  }
  rows.push(["Grand total", inrPdf(view.grandTotal), true]);

  const boxW = 220;
  const boxX = W - M - boxW;
  let by = ty;
  doc.setFontSize(9.5);
  for (const [label, val, bold] of rows) {
    if (bold) {
      doc.setDrawColor(...LINE);
      doc.line(boxX, by - 2, W - M, by - 2);
      by += 6;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...RED);
      doc.setFontSize(11);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
    }
    doc.text(label, boxX, by);
    doc.text(val, W - M, by, { align: "right" });
    by += bold ? 18 : 15;
  }

  let ny = by + 16;

  // ── Payment plan ──
  if (view.sections.includes("payment_plan") && view.paymentRows.length > 0) {
    if (ny > H - 140) {
      doc.addPage();
      ny = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text("Payment plan", M, ny);
    ny += 8;
    autoTable(doc, {
      startY: ny,
      head: [["Milestone", "%", "Amount"]],
      body: [
        ...view.paymentRows.map((r) => [
          clean(r.label),
          { content: `${Number(r.pct)}%`, styles: { halign: "right" as const } },
          { content: inrPdf(r.amount), styles: { halign: "right" as const } },
        ]),
        [
          { content: "Total", styles: { fontStyle: "bold" } },
          "",
          { content: inrPdf(view.paymentRowsTotal), styles: { halign: "right" as const, fontStyle: "bold" } },
        ],
      ] as never,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: LINE, textColor: INK },
      headStyles: { fillColor: SUNKEN, textColor: INK, fontStyle: "bold" },
      columnStyles: { 1: { cellWidth: 50, halign: "right" }, 2: { cellWidth: 90, halign: "right" } },
      margin: { left: M, right: M },
      tableWidth: 360,
    });
    ny = afterTable(doc, ny) + 18;
  }

  // ── Terms ──
  if (view.termsBody) {
    if (ny > H - 90) {
      doc.addPage();
      ny = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(clean(view.termsTitle || "Terms & conditions"), M, ny);
    ny += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const wrapped = doc.splitTextToSize(clean(view.termsBody), W - M * 2);
    doc.text(wrapped, M, ny);
    ny += wrapped.length * 11 + 12;
  }

  // ── Bank details ──
  if (view.bankDetails) {
    if (ny > H - 80) {
      doc.addPage();
      ny = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text("Bank details", M, ny);
    ny += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const wrapped = doc.splitTextToSize(clean(view.bankDetails), W - M * 2);
    doc.text(wrapped, M, ny);
    ny += wrapped.length * 11 + 12;
  }

  // ── Footer note + signature ──
  if (ny > H - 90) {
    doc.addPage();
    ny = 60;
  }
  if (view.footerNote) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const wrapped = doc.splitTextToSize(clean(view.footerNote), W - M * 2);
    doc.text(wrapped, M, ny);
    ny += wrapped.length * 11 + 18;
  }

  const sigX = W - M - 180;
  doc.setDrawColor(...LINE);
  doc.line(sigX, ny + 36, W - M, ny + 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(clean(view.signatureLabel), W - M, ny + 50, { align: "right" });

  const safe = (view.documentNumber || "purchase-order").replace(/[^a-z0-9]+/gi, "-");
  doc.save(`VEYRA-${safe}.pdf`);
}
