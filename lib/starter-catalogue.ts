/**
 * Shared read-only starter catalogue — one sample the tenant imports, not
 * per-tenant seeded rows (owner Q5). Grouped by category; every row carries
 * both taxonomy axes (category + good_type) plus the system `type` enum.
 *
 * Import runs through parseItemsCsv + createItem (name/code dedupe, org stamp,
 * metered-create gate). Importing twice must not duplicate.
 *
 * Client-safe: the import screen previews this the same way it previews a
 * pasted CSV. Rates here are sample CONFIG the tenant can edit, never computed.
 */

import { parseItemsCsv } from "./items-csv";
import { type ItemType, type Uom } from "./items-model";

export interface StarterCatalogueRow {
  name: string;
  code: string | null;
  type: ItemType;
  base_uom: Uom;
  base_rate: number | null;
  tax_rate: number;
  hsn_sac: string | null;
  brand: string | null;
  category: string;
  good_type: string;
  description: string | null;
}

const CSV_HEADERS = [
  "name",
  "code",
  "type",
  "base_uom",
  "base_rate",
  "tax_rate",
  "hsn_sac",
  "brand",
  "category",
  "good_type",
  "description",
] as const;

/** Interior-fitout starter sample. Names/codes are distinct from the demo seed. */
export const STARTER_CATALOGUE: readonly StarterCatalogueRow[] = [
  {
    name: "12mm BWP Plywood",
    code: "STAR-PLY-12-BWP",
    type: "material",
    base_uom: "sheet",
    base_rate: 1450,
    tax_rate: 18,
    hsn_sac: "4412",
    brand: "Century",
    category: "Plywood",
    good_type: "Raw Material",
    description: "Boiling-water-proof, 8x4 sheet",
  },
  {
    name: "18mm MR Plywood",
    code: "STAR-PLY-18-MR",
    type: "material",
    base_uom: "sheet",
    base_rate: 1250,
    tax_rate: 18,
    hsn_sac: "4412",
    brand: "Greenply",
    category: "Plywood",
    good_type: "Raw Material",
    description: "Moisture-resistant, 8x4 sheet",
  },
  {
    name: "6mm Commercial Plywood",
    code: "STAR-PLY-6-COM",
    type: "material",
    base_uom: "sheet",
    base_rate: 780,
    tax_rate: 18,
    hsn_sac: "4412",
    brand: null,
    category: "Plywood",
    good_type: "Raw Material",
    description: "Backing / drawer bottoms",
  },
  {
    name: "0.8mm Laminate — Gloss",
    code: "STAR-LAM-08-GL",
    type: "material",
    base_uom: "sheet",
    base_rate: 720,
    tax_rate: 18,
    hsn_sac: "4823",
    brand: "Merino",
    category: "Laminate",
    good_type: "Finished Good",
    description: "High-gloss decorative laminate",
  },
  {
    name: "1mm Laminate — Texture",
    code: "STAR-LAM-1-TX",
    type: "material",
    base_uom: "sheet",
    base_rate: 980,
    tax_rate: 18,
    hsn_sac: "4823",
    brand: "Merino",
    category: "Laminate",
    good_type: "Finished Good",
    description: "Textured decorative laminate",
  },
  {
    name: "Drawer Channel 500mm",
    code: "STAR-HW-CH-500",
    type: "material",
    base_uom: "pair",
    base_rate: 340,
    tax_rate: 18,
    hsn_sac: "8302",
    brand: "Hettich",
    category: "Hardware",
    good_type: "Trading",
    description: "Full-extension drawer slide",
  },
  {
    name: "Handle — Stainless Steel",
    code: "STAR-HW-HND-SS",
    type: "material",
    base_uom: "nos",
    base_rate: 85,
    tax_rate: 18,
    hsn_sac: "8302",
    brand: null,
    category: "Hardware",
    good_type: "Trading",
    description: "128mm centres",
  },
  {
    name: "Minifix Cam Lock",
    code: "STAR-HW-CAM",
    type: "material",
    base_uom: "nos",
    base_rate: 12,
    tax_rate: 18,
    hsn_sac: "8302",
    brand: null,
    category: "Hardware",
    good_type: "Trading",
    description: "Knock-down connector",
  },
  {
    name: "PVA White Glue 1kg",
    code: "STAR-ADH-PVA-1",
    type: "material",
    base_uom: "kg",
    base_rate: 180,
    tax_rate: 18,
    hsn_sac: "3506",
    brand: "Fevicol",
    category: "Adhesive",
    good_type: "Consumable",
    description: "Woodworking PVA",
  },
  {
    name: "Contact Adhesive 1L",
    code: "STAR-ADH-CON-1",
    type: "material",
    base_uom: "ltr",
    base_rate: 320,
    tax_rate: 18,
    hsn_sac: "3506",
    brand: null,
    category: "Adhesive",
    good_type: "Consumable",
    description: "Laminate contact adhesive",
  },
  {
    name: "PVC Edge Band 22mm",
    code: "STAR-EB-PVC-22",
    type: "material",
    base_uom: "rmt",
    base_rate: 18,
    tax_rate: 18,
    hsn_sac: "3920",
    brand: "Rehau",
    category: "Edge Banding",
    good_type: "Consumable",
    description: "Matching edge tape",
  },
  {
    name: "Interior Emulsion 20L",
    code: "STAR-PNT-EM-20",
    type: "material",
    base_uom: "ltr",
    base_rate: 220,
    tax_rate: 18,
    hsn_sac: "3209",
    brand: "Asian Paints",
    category: "Paint",
    good_type: "Consumable",
    description: "Wall emulsion, rate per litre",
  },
  {
    name: "Site Carpenter",
    code: "STAR-LAB-CARP",
    type: "labour",
    base_uom: "day",
    base_rate: 1200,
    tax_rate: 18,
    hsn_sac: "9954",
    brand: null,
    category: "Labour",
    good_type: "Service",
    description: "On-site carpentry labour",
  },
  {
    name: "Polisher",
    code: "STAR-LAB-POL",
    type: "labour",
    base_uom: "day",
    base_rate: 900,
    tax_rate: 18,
    hsn_sac: "9954",
    brand: null,
    category: "Labour",
    good_type: "Service",
    description: "On-site polish labour",
  },
];

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV text the existing parseItemsCsv + bulkCreateItems path accepts. */
export function starterCatalogueCsv(): string {
  const header = CSV_HEADERS.join(",");
  const lines = STARTER_CATALOGUE.map((row) =>
    CSV_HEADERS.map((key) => {
      const v = row[key];
      if (v == null) return "";
      return csvEscape(String(v));
    }).join(","),
  );
  return [header, ...lines].join("\n");
}

/** Grouped view for screens that want the sample by category. */
export function starterCatalogueByCategory(): {
  category: string;
  items: readonly StarterCatalogueRow[];
}[] {
  const order: string[] = [];
  const groups = new Map<string, StarterCatalogueRow[]>();
  for (const row of STARTER_CATALOGUE) {
    const existing = groups.get(row.category);
    if (existing) {
      existing.push(row);
    } else {
      order.push(row.category);
      groups.set(row.category, [row]);
    }
  }
  return order.map((category) => {
    const items = groups.get(category);
    return { category, items: items ?? [] };
  });
}

/** Parse-and-validate the sample the same way a tenant CSV is parsed. */
export function parsedStarterCatalogue() {
  return parseItemsCsv(starterCatalogueCsv());
}
