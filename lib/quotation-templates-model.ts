/**
 * Client-safe quotation-templates model — types only, NO server-only imports.
 * Shared by the data module (`lib/data/quotation-templates.ts`) and the server
 * actions so the actions file never has to `export type` (it must export only
 * async functions per the architecture rules).
 *
 * A template stores the INPUT fields of a quotation's sections + lines — never
 * the computed money columns. Instantiation re-derives totals via the engine.
 */

import type { DiscountType } from "@/lib/quotations-model";

export interface QuotationTemplate {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface QuotationTemplateSection {
  id: string;
  org_id: string;
  template_id: string;
  title: string;
  sort_order: number;
}

export interface QuotationTemplateLine {
  id: string;
  org_id: string;
  template_id: string;
  section_id: string | null;
  item_id: string | null;
  sort_order: number;
  title: string;
  area: string | null;
  category: string | null;
  description: string | null;
  hsn_sac: string | null;
  qty: number;
  uom: string;
  unit_price: number;
  discount_type: DiscountType;
  discount_value: number;
  tax_rate: number;
  cost_rate: number;
}
