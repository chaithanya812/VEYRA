import "server-only";
import { withOrg } from "./with-org";
import {
  createQuotation,
  getQuotation,
  recomputeQuotation,
} from "@/lib/data/quotations";
import {
  type QuotationTemplate,
  type QuotationTemplateSection,
  type QuotationTemplateLine,
} from "@/lib/quotation-templates-model";

/**
 * Quotation-templates data module. Follows the Quotations/Items reference
 * pattern: everything goes through withOrg → org_id isolation. A template
 * snapshots a quote's section + line INPUTS only (no computed money); the
 * pricing engine re-derives all totals when a quote is instantiated.
 */

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function listTemplates(): Promise<QuotationTemplate[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("quotation_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as QuotationTemplate[];
}

export async function getTemplate(
  id: string,
): Promise<{
  template: QuotationTemplate;
  sections: QuotationTemplateSection[];
  lines: QuotationTemplateLine[];
} | null> {
  const { db } = await withOrg();
  const { data: template, error } = await db
    .table("quotation_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!template) return null;

  const [{ data: sections }, { data: lines }] = await Promise.all([
    db
      .table("quotation_template_sections")
      .select("*")
      .eq("template_id", id)
      .order("sort_order", { ascending: true }),
    db
      .table("quotation_template_lines")
      .select("*")
      .eq("template_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    template: template as unknown as QuotationTemplate,
    sections: (sections ?? []) as unknown as QuotationTemplateSection[],
    lines: (lines ?? []) as unknown as QuotationTemplateLine[],
  };
}

/* ── Writes ──────────────────────────────────────────────────────────────── */

/**
 * Snapshot a quotation's section + line STRUCTURE into a new template. Only the
 * raw INPUT fields are copied (never the engine-computed money columns). Section
 * ids are remapped, exactly like createNewVersion remaps the source quote.
 */
export async function createTemplateFromQuotation(
  quotationId: string,
  name: string,
  description?: string,
): Promise<{ id: string } | { error: string }> {
  const src = await getQuotation(quotationId);
  if (!src) return { error: "Quotation not found" };
  const { db } = await withOrg();

  const { data, error } = await db.table("quotation_templates").insert({
    name: name.trim(),
    description: description?.trim() || null,
  });
  if (error) return { error: error.message };
  const templateId = (data?.[0] as { id: string }).id;

  // Clone sections (old source id → new template section id).
  const sectionMap = new Map<string, string>();
  for (const s of src.sections) {
    const { data: ns } = await db.table("quotation_template_sections").insert({
      template_id: templateId,
      title: s.title,
      sort_order: s.sort_order,
    });
    sectionMap.set(s.id, (ns?.[0] as { id: string }).id);
  }

  // Clone line inputs, remapped to the new template sections.
  for (const l of src.lines) {
    await db.table("quotation_template_lines").insert({
      template_id: templateId,
      section_id: l.section_id ? sectionMap.get(l.section_id) ?? null : null,
      item_id: l.item_id,
      sort_order: l.sort_order,
      title: l.title,
      area: l.area,
      category: l.category,
      description: l.description,
      hsn_sac: l.hsn_sac,
      qty: l.qty,
      uom: l.uom,
      unit_price: l.unit_price,
      discount_type: l.discount_type,
      discount_value: l.discount_value,
      tax_rate: l.tax_rate,
      cost_rate: l.cost_rate,
    });
  }

  return { id: templateId };
}

export interface TemplateOverrides {
  title?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  site_address?: string | null;
  place_of_supply?: string | null;
}

/**
 * Instantiate a template into a NEW draft quotation. Reuses createQuotation's
 * numbering + header-insert path, copies the template's sections + line inputs
 * in, then calls recomputeQuotation so every rupee is engine-derived (never
 * copied from the template). Returns the new quotation id.
 */
export async function instantiateTemplate(
  templateId: string,
  overrides?: TemplateOverrides,
): Promise<{ id: string } | { error: string }> {
  const tpl = await getTemplate(templateId);
  if (!tpl) return { error: "Template not found" };
  const { db } = await withOrg();

  const q = await createQuotation({
    title: overrides?.title?.trim() || tpl.template.name,
    customer_name: overrides?.customer_name ?? null,
    customer_phone: overrides?.customer_phone ?? null,
    customer_email: overrides?.customer_email ?? null,
    site_address: overrides?.site_address ?? null,
    place_of_supply: overrides?.place_of_supply ?? null,
  });
  if ("error" in q) return { error: q.error };
  const newQuoteId = q.id;

  // Clone template sections (old template id → new quote section id).
  const sectionMap = new Map<string, string>();
  for (const s of tpl.sections) {
    const { data: ns } = await db.table("quotation_sections").insert({
      quotation_id: newQuoteId,
      title: s.title,
      sort_order: s.sort_order,
    });
    sectionMap.set(s.id, (ns?.[0] as { id: string }).id);
  }

  // Clone line inputs into the new quote, remapped to the new sections.
  for (const l of tpl.lines) {
    await db.table("quotation_lines").insert({
      quotation_id: newQuoteId,
      section_id: l.section_id ? sectionMap.get(l.section_id) ?? null : null,
      item_id: l.item_id,
      sort_order: l.sort_order,
      title: l.title,
      area: l.area,
      category: l.category,
      description: l.description,
      hsn_sac: l.hsn_sac,
      qty: l.qty,
      uom: l.uom,
      unit_price: l.unit_price,
      discount_type: l.discount_type,
      discount_value: l.discount_value,
      tax_rate: l.tax_rate,
      cost_rate: l.cost_rate,
    });
  }

  // The authoritative engine pass — re-derives every line + header total.
  await recomputeQuotation(newQuoteId);
  return { id: newQuoteId };
}

/** Delete a template. Cascade (defined in the migration) removes its sections + lines. */
export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("quotation_templates").deleteById(id);
  return error ? { error: error.message } : {};
}
