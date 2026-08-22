/**
 * Client-safe quotation version-diff engine. No server-only import (mirrors
 * lib/quotations-model.ts) so it can run in tests and server components alike.
 *
 * Pure arithmetic over the two stored snapshots — the LLM never computes a
 * price (PLAN §8). Cloned versions get NEW line ids, so lines are matched by a
 * stable heuristic (see matchLines), never by id.
 *
 * Matching priority (within the same section title):
 *   1. same non-null item_id AND same normalized title;
 *   2. else same normalized title.
 * Unmatched in the newer version = added; unmatched in the older = removed.
 * A matched pair whose qty / uom / unit_price / discount / tax_rate / line_total
 * differs is "changed" with an old → new per field.
 */

import { round2, type Quotation, type QuotationSection, type QuotationLine } from "./quotations-model";

export interface DiffInput {
  quotation: Quotation;
  sections: QuotationSection[];
  lines: QuotationLine[];
}

/** A line field that can differ between two versions. */
export type LineField = "qty" | "uom" | "unit_price" | "discount" | "tax_rate" | "line_total";

export interface ChangedField {
  field: LineField;
  oldValue: number | string;
  newValue: number | string;
}

export interface AddedLineEntry {
  kind: "added";
  title: string;
  sectionTitle: string;
  line: QuotationLine;
}

export interface RemovedLineEntry {
  kind: "removed";
  title: string;
  sectionTitle: string;
  line: QuotationLine;
}

export interface ChangedLineEntry {
  kind: "changed";
  title: string;
  sectionTitle: string;
  oldLine: QuotationLine;
  newLine: QuotationLine;
  changes: ChangedField[];
}

export interface SectionDiff {
  sectionTitle: string;
  added: AddedLineEntry[];
  removed: RemovedLineEntry[];
  changed: ChangedLineEntry[];
}

export interface HeaderDeltaField {
  old: number;
  new: number;
  delta: number;
}

export interface HeaderDelta {
  subtotal: HeaderDeltaField;
  taxable: HeaderDeltaField;
  tax_total: HeaderDeltaField;
  cgst_total: HeaderDeltaField;
  sgst_total: HeaderDeltaField;
  igst_total: HeaderDeltaField;
  grand_total: HeaderDeltaField;
}

export interface QuotationDiff {
  older: DiffInput;
  newer: DiffInput;
  sections: SectionDiff[];
  header: HeaderDelta;
}

const UNSECTIONED = "Unsectioned";

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Group a quote's lines by their section title (or "Unsectioned"). */
function linesBySection(input: DiffInput): Map<string, QuotationLine[]> {
  const sectionTitle = new Map<string, string>();
  for (const s of input.sections) sectionTitle.set(s.id, s.title);
  const map = new Map<string, QuotationLine[]>();
  for (const l of input.lines) {
    const title = (l.section_id && sectionTitle.get(l.section_id)) || UNSECTIONED;
    const arr = map.get(title) ?? [];
    arr.push(l);
    map.set(title, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.sort_order - b.sort_order);
  return map;
}

/**
 * Match older/newer lines within one section by the stable heuristic, returning
 * matched pairs plus the unmatched added/removed lines.
 */
function matchLines(
  older: QuotationLine[],
  newer: QuotationLine[],
): { matched: Array<[QuotationLine, QuotationLine]>; added: QuotationLine[]; removed: QuotationLine[] } {
  const oldMarks = new Array(older.length).fill(false);
  const newMarks = new Array(newer.length).fill(false);
  const matched: Array<[QuotationLine, QuotationLine]> = [];

  for (let j = 0; j < newer.length; j++) {
    const n = newer[j];
    let found = -1;
    // Priority 1: same non-null item_id AND same normalized title.
    if (n.item_id) {
      found = older.findIndex(
        (o, i) =>
          !oldMarks[i] &&
          o.item_id != null &&
          o.item_id === n.item_id &&
          normalizeTitle(o.title) === normalizeTitle(n.title),
      );
    }
    // Priority 2: same normalized title (any item_id).
    if (found === -1) {
      found = older.findIndex(
        (o, i) => !oldMarks[i] && normalizeTitle(o.title) === normalizeTitle(n.title),
      );
    }
    if (found !== -1) {
      oldMarks[found] = true;
      newMarks[j] = true;
      matched.push([older[found], n]);
    }
  }

  const removed = older.filter((_, i) => !oldMarks[i]);
  const added = newer.filter((_, j) => !newMarks[j]);
  return { matched, added, removed };
}

/** Compare the tracked fields of a matched pair; empty when identical. */
function diffLineFields(oldLine: QuotationLine, newLine: QuotationLine): ChangedField[] {
  const changes: ChangedField[] = [];
  const num = (a: number, b: number) => round2(a) !== round2(b);

  if (num(oldLine.qty, newLine.qty))
    changes.push({ field: "qty", oldValue: oldLine.qty, newValue: newLine.qty });
  if (oldLine.uom !== newLine.uom)
    changes.push({ field: "uom", oldValue: oldLine.uom, newValue: newLine.uom });
  if (num(oldLine.unit_price, newLine.unit_price))
    changes.push({ field: "unit_price", oldValue: oldLine.unit_price, newValue: newLine.unit_price });
  if (num(oldLine.discount_amount, newLine.discount_amount))
    changes.push({ field: "discount", oldValue: oldLine.discount_amount, newValue: newLine.discount_amount });
  if (num(oldLine.tax_rate, newLine.tax_rate))
    changes.push({ field: "tax_rate", oldValue: oldLine.tax_rate, newValue: newLine.tax_rate });
  if (num(oldLine.line_total, newLine.line_total))
    changes.push({ field: "line_total", oldValue: oldLine.line_total, newValue: newLine.line_total });

  return changes;
}

function deltaField(o: number, n: number): HeaderDeltaField {
  return { old: round2(o), new: round2(n), delta: round2(n - o) };
}

const LINE_FIELD_LABEL: Record<LineField, string> = {
  qty: "Qty",
  uom: "UOM",
  unit_price: "Rate",
  discount: "Discount",
  tax_rate: "Tax rate",
  line_total: "Line total",
};

export function lineFieldLabel(field: LineField): string {
  return LINE_FIELD_LABEL[field];
}

/** Produce a structured, presentation-ready diff between two quote versions. */
export function diffQuotations(older: DiffInput, newer: DiffInput): QuotationDiff {
  const oldMap = linesBySection(older);
  const newMap = linesBySection(newer);
  const allTitles = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort();

  const sections: SectionDiff[] = allTitles.map((title) => {
    const { matched, added, removed } = matchLines(oldMap.get(title) ?? [], newMap.get(title) ?? []);
    const changed: ChangedLineEntry[] = [];
    for (const [o, n] of matched) {
      const changes = diffLineFields(o, n);
      if (changes.length > 0) {
        changed.push({ kind: "changed", title: n.title, sectionTitle: title, oldLine: o, newLine: n, changes });
      }
    }
    return {
      sectionTitle: title,
      added: added.map((line) => ({ kind: "added", title: line.title, sectionTitle: title, line })),
      removed: removed.map((line) => ({ kind: "removed", title: line.title, sectionTitle: title, line })),
      changed,
    };
  });

  const oq = older.quotation;
  const nq = newer.quotation;
  const header: HeaderDelta = {
    subtotal: deltaField(oq.subtotal, nq.subtotal),
    taxable: deltaField(oq.taxable_total, nq.taxable_total),
    tax_total: deltaField(oq.tax_total, nq.tax_total),
    cgst_total: deltaField(oq.cgst_total, nq.cgst_total),
    sgst_total: deltaField(oq.sgst_total, nq.sgst_total),
    igst_total: deltaField(oq.igst_total, nq.igst_total),
    grand_total: deltaField(oq.grand_total, nq.grand_total),
  };

  return { older, newer, sections, header };
}

/** True when the two versions have no line or header differences. */
export function isEmptyDiff(diff: QuotationDiff): boolean {
  const noLines = diff.sections.every(
    (s) => s.added.length === 0 && s.removed.length === 0 && s.changed.length === 0,
  );
  const noHeader = diff.header.grand_total.delta === 0;
  return noLines && noHeader;
}
