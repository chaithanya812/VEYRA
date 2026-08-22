/**
 * Client-side quotation PDF — a one-click download of the customer-facing quote.
 *
 * Ported from INTERIOR's jsPDF pattern (src/lib/quote/pdf.ts): pure jsPDF +
 * jspdf-autotable, no headless browser, so it runs in the customer's browser on
 * the public /q/<token> page and on the authed quote page alike. It renders ONLY
 * presentational fields — cost/margin never reach this document.
 *
 * Money is never computed here — every figure is a snapshot the pricing engine
 * wrote (lib/quotations-model.ts). This module only lays them out. The GST split
 * (CGST/SGST vs IGST) and the rate-wise summary come straight from the engine.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { gstRateSummary, type GstTreatment } from "@/lib/quotations-model";
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

export interface QuotationPdfLine {
  id: string;
  section_id: string | null;
  title: string;
  area: string | null;
  category: string | null;
  description: string | null;
  hsn_sac: string | null;
  qty: number;
  uom: string;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  taxable: number;
  tax_amount: number;
  line_total: number;
}

export interface QuotationPdfData {
  quotation: {
    number: string;
    version: number;
    title: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    site_address: string | null;
    place_of_supply: string | null;
    seller_state: string | null;
    gst_treatment: GstTreatment;
    works_contract: boolean;
    subtotal: number;
    discount_total: number;
    taxable_total: number;
    tax_total: number;
    cgst_total: number;
    sgst_total: number;
    igst_total: number;
    grand_total: number;
    terms: string | null;
    valid_until: string | null;
    created_at: string;
  };
  sections: { id: string; title: string; sort_order: number }[];
  lines: QuotationPdfLine[];
  /** Optional seller identity for the header (org name / GSTIN), when available. */
  seller?: { name?: string | null; gstin?: string | null } | null;
}

const uomOf = (u: string) => uomLabel[u as keyof typeof uomLabel] ?? u;

export function generateQuotationPdf(data: QuotationPdfData): void {
  const { quotation: q, sections, lines } = data;
  const inter = q.gst_treatment === "inter";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  // ── Header band ──
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 76, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(clean(data.seller?.name || "Quotation"), M, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("QUOTATION", M, 58);
  doc.setFontSize(10);
  doc.text(clean(`${q.number}${q.version > 1 ? `  ·  v${q.version}` : ""}`), W - M, 36, { align: "right" });
  doc.setFontSize(9);
  doc.text(fmtDate(q.created_at), W - M, 52, { align: "right" });
  if (data.seller?.gstin) doc.text(clean(`GSTIN: ${data.seller.gstin}`), W - M, 66, { align: "right" });

  // ── Prepared for / supply ──
  let y = 104;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(clean(q.title), M, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("PREPARED FOR", M, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  y += 14;
  const who: string[] = [];
  if (q.customer_name) who.push(clean(q.customer_name));
  const contact = [q.customer_phone, q.customer_email].filter(Boolean).map(clean).join("   |   ");
  if (contact) who.push(contact);
  if (q.site_address) who.push(clean(q.site_address));
  for (const w of who.length ? who : ["-"]) {
    doc.text(w, M, y);
    y += 13;
  }

  // Supply meta (right column)
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  const supply: string[] = [];
  if (q.seller_state) supply.push(`Seller state: ${clean(q.seller_state)}`);
  if (q.place_of_supply) supply.push(`Place of supply: ${clean(q.place_of_supply)}`);
  supply.push(inter ? "Inter-state supply (IGST)" : "Intra-state supply (CGST + SGST)");
  if (q.works_contract) supply.push("Works contract (turnkey)");
  if (q.valid_until) supply.push(`Valid until: ${fmtDate(q.valid_until)}`);
  let sy = 104;
  for (const line of supply) {
    doc.text(clean(line), W - M, sy, { align: "right" });
    sy += 13;
  }

  y = Math.max(y, sy) + 8;

  // ── BOQ table (section-grouped) ──
  const linesBySection = new Map<string | null, QuotationPdfLine[]>();
  for (const l of lines) {
    const key = l.section_id ?? null;
    if (!linesBySection.has(key)) linesBySection.set(key, []);
    linesBySection.get(key)!.push(l);
  }
  const orderedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  type Row = (string | number | { content: string; colSpan?: number; styles?: Record<string, unknown> })[];
  const body: Row[] = [];
  let sn = 1;
  const money = (n: number) => ({ content: inrPdf(n), styles: { halign: "right" as const } });

  const pushLine = (l: QuotationPdfLine) => {
    const desc: string[] = [clean(l.title)];
    const meta = [l.area, l.category].filter(Boolean).map(clean).join(" - ");
    if (meta) desc.push(meta);
    if (l.description) desc.push(clean(l.description));
    body.push([
      { content: String(sn++), styles: { halign: "center" } },
      { content: desc.join("\n") },
      { content: clean(l.hsn_sac || "-"), styles: { halign: "center" } },
      { content: String(Number(l.qty)), styles: { halign: "right" } },
      { content: uomOf(l.uom) },
      money(l.unit_price),
      { content: Number(l.discount_amount) > 0 ? inrPdf(l.discount_amount) : "-", styles: { halign: "right" } },
      { content: inrPdf(l.line_total), styles: { halign: "right", fontStyle: "bold" } },
    ]);
  };

  const sectionRow = (title: string): Row => [
    { content: clean(title), colSpan: 8, styles: { fontStyle: "bold", fillColor: SUNKEN, textColor: INK } },
  ];

  for (const s of orderedSections) {
    const rows = linesBySection.get(s.id) ?? [];
    if (!rows.length) continue;
    body.push(sectionRow(s.title));
    rows.forEach(pushLine);
  }
  const ungrouped = linesBySection.get(null) ?? [];
  if (ungrouped.length) {
    if (orderedSections.some((s) => (linesBySection.get(s.id) ?? []).length)) body.push(sectionRow("Other"));
    ungrouped.forEach(pushLine);
  }

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "HSN/SAC", "Qty", "UOM", "Rate", "Disc.", "Amount"]],
    body: body as never,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: LINE, textColor: INK, valign: "top" },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 52, halign: "center" },
      3: { cellWidth: 34, halign: "right" },
      4: { cellWidth: 40 },
      5: { cellWidth: 62, halign: "right" },
      6: { cellWidth: 52, halign: "right" },
      7: { cellWidth: 70, halign: "right" },
    },
    margin: { left: M, right: M },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...LINE);
      doc.line(M, H - 34, W - M, H - 34);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Generated by VEYRA", M, H - 20);
      doc.text(clean(q.number), W - M, H - 20, { align: "right" });
    },
  });

  // ── GST rate-wise summary + totals ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ty = (doc as any).lastAutoTable.finalY + 18;
  const H = doc.internal.pageSize.getHeight();
  if (ty > H - 200) {
    doc.addPage();
    ty = 60;
  }

  const summary = gstRateSummary(
    lines.map((l) => ({ tax_rate: l.tax_rate, taxable: l.taxable, tax_amount: l.tax_amount })),
    q.gst_treatment,
  );
  if (summary.length) {
    autoTable(doc, {
      startY: ty,
      head: [
        inter
          ? ["GST %", "Taxable", "IGST"]
          : ["GST %", "Taxable", "CGST", "SGST"],
      ],
      body: summary.map((r) =>
        inter
          ? [`${r.rate}%`, inrPdf(r.taxable), inrPdf(r.igst)]
          : [`${r.rate}%`, inrPdf(r.taxable), inrPdf(r.cgst), inrPdf(r.sgst)],
      ),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, lineColor: LINE, textColor: INK, halign: "right" },
      headStyles: { fillColor: SUNKEN, textColor: INK, fontStyle: "bold", halign: "right" },
      columnStyles: { 0: { halign: "left" } },
      tableWidth: 260,
      margin: { left: M },
    });
  }

  // Totals block (right)
  const rows: [string, string, boolean?][] = [
    ["Subtotal", inrPdf(q.subtotal)],
  ];
  if (Number(q.discount_total) > 0) rows.push(["Discount", "- " + inrPdf(q.discount_total)]);
  rows.push(["Taxable value", inrPdf(q.taxable_total)]);
  if (inter) {
    rows.push(["IGST", inrPdf(q.igst_total)]);
  } else {
    rows.push(["CGST", inrPdf(q.cgst_total)]);
    rows.push(["SGST", inrPdf(q.sgst_total)]);
  }
  rows.push(["Grand total", inrPdf(q.grand_total), true]);

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

  // ── Terms & works-contract note ──
  let ny = Math.max(by, ty + summary.length * 16 + 40) + 10;
  const notes: string[] = [];
  if (q.works_contract) {
    notes.push(
      "This is a works-contract (turnkey) supply under GST (SAC 9954); GST is charged on the composite supply of goods and services.",
    );
  }
  if (q.terms) {
    for (const t of q.terms.split("\n").map((s) => s.trim()).filter(Boolean)) notes.push(t);
  }
  if (notes.length) {
    if (ny > H - 90) {
      doc.addPage();
      ny = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text("Terms & notes", M, ny);
    ny += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    for (const n of notes) {
      const wrapped = doc.splitTextToSize(clean("- " + n), W - M * 2);
      doc.text(wrapped, M, ny);
      ny += wrapped.length * 11 + 3;
    }
  }

  const safe = (q.number || "quotation").replace(/[^a-z0-9]+/gi, "-");
  doc.save(`VEYRA-${safe}.pdf`);
}
