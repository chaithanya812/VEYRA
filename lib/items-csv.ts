/**
 * Client-safe CSV parser + validator for bulk item import (Item Master).
 *
 * NO `server-only` import — both the browser (preview) and the server action
 * share this module. It only parses + validates; nothing is computed by a model.
 *
 * Column contract (header row, case-insensitive, order-independent, extras ignored):
 *   name (required), code/sku (optional), type, base_uom, base_rate, tax_rate,
 *   hsn_sac, brand, category, description
 */

import { ITEM_TYPES, UOMS, GST_RATES, type ItemType, type Uom } from "./items-model";
import { nameKey, codeKey } from "./utils";

const ITEM_TYPE_SET = new Set<string>(ITEM_TYPES as readonly string[]);
const UOM_SET = new Set<string>(UOMS as readonly string[]);
const GST_SET = new Set<number>(GST_RATES as readonly number[]);

/** A cleaned, typed row ready to feed createItem. */
export interface CsvItemValues {
  name: string;
  code: string | null;
  type: ItemType;
  base_uom: Uom;
  base_rate: number | null;
  tax_rate: number;
  hsn_sac: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
}

export type RowStatus = "ok" | "error";

export interface ParsedRow {
  /** 1-based position in the file (excluding the header row). */
  index: number;
  values: CsvItemValues;
  /** Normalised dedupe key for the name (see lib/utils nameKey). */
  nameKey: string;
  status: RowStatus;
  errors: string[];
}

export interface CsvParseResult {
  rows: ParsedRow[];
}

/** Header aliases → canonical field name. */
const HEADER_MAP: Record<string, keyof CsvItemValues | "name" | "code"> = {
  name: "name",
  code: "code",
  sku: "code",
  type: "type",
  base_uom: "base_uom",
  baseuom: "base_uom",
  base_rate: "base_rate",
  baserate: "base_rate",
  rate: "base_rate",
  tax_rate: "tax_rate",
  taxrate: "tax_rate",
  tax: "tax_rate",
  hsn_sac: "hsn_sac",
  hsnsac: "hsn_sac",
  hsn: "hsn_sac",
  brand: "brand",
  category: "category",
  description: "description",
  notes: "description",
};

function normaliseHeader(raw: string): keyof CsvItemValues | "name" | "code" | null {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return HEADER_MAP[key] ?? null;
}

/** Split one CSV line into fields, honouring quotes + "" escapes (RFC 4180). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** Split raw CSV text into physical lines, tolerating \r\n, \n and a trailing newline. */
function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

function toNumberOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function buildRow(
  index: number,
  raw: Record<string, string>,
  errors: string[],
): { values: CsvItemValues; nameKey: string } | null {
  const name = (raw.name ?? "").trim();
  if (!name) {
    errors.push("Name is required.");
    return null;
  }

  const typeRaw = (raw.type ?? "").trim();
  const type = typeRaw.toLowerCase() as ItemType;
  if (!typeRaw || !ITEM_TYPE_SET.has(type)) {
    errors.push(
      typeRaw
        ? `Invalid type "${typeRaw}".`
        : "Type is required.",
    );
  }

  const uomRaw = (raw.base_uom ?? "").trim();
  const base_uom = uomRaw.toLowerCase() as Uom;
  if (!uomRaw || !UOM_SET.has(base_uom)) {
    errors.push(
      uomRaw
        ? `Invalid base_uom "${uomRaw}".`
        : "Base UOM is required.",
    );
  }

  const rate = toNumberOrNull(raw.base_rate ?? "");
  if (rate != null && rate < 0) errors.push("Base rate must be non-negative.");

  const taxRaw = (raw.tax_rate ?? "").trim();
  const taxParsed = taxRaw ? Number(taxRaw) : NaN;
  const tax_rate = taxRaw && Number.isFinite(taxParsed) ? taxParsed : 18;
  if (taxRaw && !GST_SET.has(tax_rate)) {
    errors.push(`Tax rate "${taxRaw}" is not one of ${GST_RATES.join(", ")}%.`);
  }

  const code = codeKey(raw.code ?? null);

  const values: CsvItemValues = {
    name,
    code,
    type: type as ItemType,
    base_uom: base_uom as Uom,
    base_rate: rate,
    tax_rate,
    hsn_sac: (raw.hsn_sac ?? "").trim() || null,
    brand: (raw.brand ?? "").trim() || null,
    category: (raw.category ?? "").trim() || null,
    description: (raw.description ?? "").trim() || null,
  };

  return { values, nameKey: nameKey(name) };
}

/**
 * Parse CSV text into typed, validated rows. Always returns a result; per-row
 * problems are reported on `row.status` / `row.errors` rather than thrown.
 * In-file duplicate names are flagged as errors too.
 */
export function parseItemsCsv(text: string): CsvParseResult {
  const rows: ParsedRow[] = [];
  const lines = splitLines(text).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows };

  const headerCells = splitCsvLine(lines[0]).map(normaliseHeader);
  const colIndex = new Map<keyof CsvItemValues | "name" | "code", number>();
  headerCells.forEach((h, i) => {
    if (h && !colIndex.has(h)) colIndex.set(h, i);
  });

  const seenNameKeys = new Set<string>();
  let outIndex = 0;

  for (let r = 1; r < lines.length; r++) {
    outIndex++;
    const cells = splitCsvLine(lines[r]);
    const raw: Record<string, string> = {};
    for (const [field, idx] of colIndex) {
      raw[field] = cells[idx] ?? "";
    }

    const errors: string[] = [];
    const built = buildRow(outIndex, raw, errors);

    if (!built) {
      rows.push({
        index: outIndex,
        values: {
          name: (raw.name ?? "").trim(),
          code: codeKey(raw.code ?? null),
          type: "material",
          base_uom: "nos",
          base_rate: null,
          tax_rate: 18,
          hsn_sac: null,
          brand: null,
          category: null,
          description: null,
        },
        nameKey: nameKey(raw.name ?? ""),
        status: "error",
        errors,
      });
      continue;
    }

    if (seenNameKeys.has(built.nameKey)) {
      errors.push("Duplicate name within this file.");
    } else {
      seenNameKeys.add(built.nameKey);
    }

    const status: RowStatus = errors.length > 0 ? "error" : "ok";
    rows.push({
      index: outIndex,
      values: built.values,
      nameKey: built.nameKey,
      status,
      errors,
    });
  }

  return { rows };
}
