"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createQuotation,
  updateQuotationMeta,
  setQuotationStatus,
  addSection,
  renameSection,
  deleteSection,
  addLine,
  updateLine,
  deleteLine,
  createNewVersion,
  setShare,
  QUOTE_STATUSES,
  DISCOUNT_TYPES,
  GST_TREATMENTS,
  type QuoteStatus,
  type DiscountType,
  type GstTreatment,
} from "@/lib/data/quotations";
import {
  createTemplateFromQuotation,
  instantiateTemplate,
  deleteTemplate,
} from "@/lib/data/quotation-templates";
import { deriveTreatment } from "@/lib/quotations-model";
import { searchItems } from "@/lib/data/items";
import { createMaterialRequestFromQuotation } from "@/lib/data/material-requests";
import type { ItemRef } from "@/lib/items-model";

export type FormState = { error?: string } | undefined;

/* ── Catalogue search (powers the BOQ line combobox) ──────────────────────── */
export async function searchItemsAction(query: string): Promise<ItemRef[]> {
  if (!(await can("items.item.view"))) return [];
  if (!query || query.trim().length < 1) return [];
  return searchItems(query, 15);
}

/* ── Header ───────────────────────────────────────────────────────────────── */
const createSchema = z.object({
  title: z.string().optional(),
  leadId: z.string().optional(),
  projectId: z.string().optional(),
  source: z.enum(["lead", "project", "standalone"]).optional(),
  doc_type: z.string().optional(),
  ref_no: z.string().optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  customer_email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  place_of_supply: z.string().optional(),
});

export async function createQuotationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("quotations.quotation.create");
  if (denied) return denied;
  const parsed = createSchema.safeParse({
    title: formData.get("title") || undefined,
    leadId: formData.get("leadId") || undefined,
    customer_name: formData.get("customer_name") || undefined,
    projectId: formData.get("projectId") || undefined,
    source: formData.get("source") || undefined,
    doc_type: formData.get("doc_type") || undefined,
    ref_no: formData.get("ref_no") || undefined,
    customer_phone: formData.get("customer_phone") || undefined,
    customer_email: formData.get("customer_email") || undefined,
    place_of_supply: formData.get("place_of_supply") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // A quote must hang off something, or the whole point of the spine is lost.
  const source = parsed.data.source ?? "standalone";
  if (source === "lead" && !parsed.data.leadId) {
    return { error: "Pick the lead this quotation is for." };
  }
  if (source === "project" && !parsed.data.projectId) {
    return { error: "Pick the project this quotation is for." };
  }

  const result = await createQuotation({
    title: parsed.data.title,
    leadId: source === "lead" ? parsed.data.leadId || null : null,
    projectId: source === "project" ? parsed.data.projectId || null : null,
    source,
    doc_type: parsed.data.doc_type,
    ref_no: parsed.data.ref_no || null,
    customer_name: parsed.data.customer_name || null,
    customer_phone: parsed.data.customer_phone || null,
    customer_email: parsed.data.customer_email || null,
    place_of_supply: parsed.data.place_of_supply || null,
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/quotations");
  redirect(`/quotations/${result.id}`);
}

export async function updateMetaAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const seller_state = (formData.get("seller_state") as string) ?? null;
  const place_of_supply = (formData.get("place_of_supply") as string) ?? null;

  // Treatment: "auto" derives intra/inter from the two states (falling back to
  // intra when undeterminable); an explicit intra|inter is honoured as an override.
  const rawTreatment = String(formData.get("gst_treatment") ?? "");
  let gst_treatment: GstTreatment | undefined;
  if (rawTreatment === "auto") {
    gst_treatment = deriveTreatment(seller_state, place_of_supply) ?? "intra";
  } else if (GST_TREATMENTS.includes(rawTreatment as GstTreatment)) {
    gst_treatment = rawTreatment as GstTreatment;
  }

  await updateQuotationMeta(id, {
    title: (formData.get("title") as string) || undefined,
    customer_name: (formData.get("customer_name") as string) ?? null,
    customer_phone: (formData.get("customer_phone") as string) ?? null,
    customer_email: (formData.get("customer_email") as string) ?? null,
    site_address: (formData.get("site_address") as string) ?? null,
    place_of_supply,
    seller_state,
    gst_treatment,
    works_contract: formData.get("works_contract") != null,
    notes: (formData.get("notes") as string) ?? null,
    terms: (formData.get("terms") as string) ?? null,
    valid_until: (formData.get("valid_until") as string) || null,
  });
  revalidatePath(`/quotations/${id}`);
}

export async function setStatusAction(formData: FormData) {
  if (!(await can("quotations.quotation.approve"))) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status"));
  if (!id || !QUOTE_STATUSES.includes(status as QuoteStatus)) return;
  await setQuotationStatus(id, status as QuoteStatus);
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/quotations");
}

/**
 * The spine's proof (PLAN-V4 §7.4): an approved quotation raises a draft
 * material request whose lines ARE its scope items — not a re-typed copy of
 * them. Everything this action does is validate, call one data function and
 * navigate; the linkage lives in the schema, which is the point.
 */
export async function raiseMaterialRequestAction(formData: FormData) {
  if (!(await can("procurement.mr.create"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await createMaterialRequestFromQuotation(id);
  if (result.error || !result.id) {
    redirect(`/quotations/${id}?mr_error=${encodeURIComponent(result.error ?? "Failed")}`);
  }
  revalidatePath("/procurement");
  redirect(`/procurement/${result.id}`);
}

export async function newVersionAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await createNewVersion(id);
  if ("id" in result) {
    revalidatePath("/quotations");
    redirect(`/quotations/${result.id}`);
  }
}

export async function setShareAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled")) === "true";
  if (!id) return;
  await setShare(id, enabled);
  revalidatePath(`/quotations/${id}`);
}

/* ── Sections ─────────────────────────────────────────────────────────────── */
export async function addSectionAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const quotationId = String(formData.get("quotationId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!quotationId || !title) return;
  await addSection(quotationId, title);
  revalidatePath(`/quotations/${quotationId}`);
}

export async function renameSectionAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const id = String(formData.get("id") ?? "");
  const quotationId = String(formData.get("quotationId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!id || !title) return;
  await renameSection(id, title);
  revalidatePath(`/quotations/${quotationId}`);
}

export async function deleteSectionAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const id = String(formData.get("id") ?? "");
  const quotationId = String(formData.get("quotationId") ?? "");
  if (!id || !quotationId) return;
  await deleteSection(id, quotationId);
  revalidatePath(`/quotations/${quotationId}`);
}

/* ── Lines ────────────────────────────────────────────────────────────────── */
const lineSchema = z.object({
  quotationId: z.string().min(1),
  id: z.string().optional(),
  section_id: z.string().optional(),
  item_id: z.string().optional(),
  title: z.string().min(1, "Line title is required"),
  area: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  hsn_sac: z.string().optional(),
  qty: z.coerce.number().min(0, "Qty must be ≥ 0"),
  uom: z.string().min(1),
  unit_price: z.coerce.number().min(0, "Rate must be ≥ 0"),
  discount_type: z.enum(DISCOUNT_TYPES),
  discount_value: z.coerce.number().min(0).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(18),
  cost_rate: z.coerce.number().min(0).default(0),
  measure_mode: z.string().optional(),
  measure_length: z.coerce.number().min(0).optional(),
  measure_width: z.coerce.number().min(0).optional(),
  measure_height: z.coerce.number().min(0).optional(),
  measure_count: z.coerce.number().min(0).optional(),
  measure_qty_override: z.coerce.number().min(0).optional(),
});

function parseLine(formData: FormData) {
  return lineSchema.safeParse({
    quotationId: formData.get("quotationId"),
    id: formData.get("id") || undefined,
    section_id: formData.get("section_id") || undefined,
    item_id: formData.get("item_id") || undefined,
    title: formData.get("title"),
    area: formData.get("area") || undefined,
    category: formData.get("category") || undefined,
    description: formData.get("description") || undefined,
    hsn_sac: formData.get("hsn_sac") || undefined,
    qty: formData.get("qty") ?? 1,
    uom: formData.get("uom") || "nos",
    unit_price: formData.get("unit_price") ?? 0,
    discount_type: formData.get("discount_type") || "amount",
    discount_value: formData.get("discount_value") ?? 0,
    tax_rate: formData.get("tax_rate") ?? 18,
    cost_rate: formData.get("cost_rate") ?? 0,
    measure_mode: formData.get("measure_mode") || undefined,
    measure_length: formData.get("measure_length") || undefined,
    measure_width: formData.get("measure_width") || undefined,
    measure_height: formData.get("measure_height") || undefined,
    measure_count: formData.get("measure_count") || undefined,
    measure_qty_override: formData.get("measure_qty_override") || undefined,
  });
}

/** The optional measure fields, shared by both add/update calls. */
function measureFrom(d: z.infer<typeof lineSchema>) {
  return {
    measure_mode: d.measure_mode || null,
    measure_length: d.measure_length ?? null,
    measure_width: d.measure_width ?? null,
    measure_height: d.measure_height ?? null,
    measure_count: d.measure_count ?? null,
    measure_qty_override: d.measure_qty_override ?? null,
  };
}

export async function addLineAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("quotations.quotation.create");
  if (denied) return denied;
  const parsed = parseLine(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid line" };
  }
  const d = parsed.data;
  const result = await addLine(d.quotationId, {
    section_id: d.section_id || null,
    item_id: d.item_id || null,
    title: d.title,
    area: d.area || null,
    category: d.category || null,
    description: d.description || null,
    hsn_sac: d.hsn_sac || null,
    qty: d.qty,
    uom: d.uom,
    unit_price: d.unit_price,
    discount_type: d.discount_type as DiscountType,
    discount_value: d.discount_value,
    tax_rate: d.tax_rate,
    cost_rate: d.cost_rate,
    ...measureFrom(d),
  });
  if ("error" in result) return { error: result.error };
  revalidatePath(`/quotations/${d.quotationId}`);
  return undefined;
}

export async function updateLineAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("quotations.quotation.create");
  if (denied) return denied;
  const parsed = parseLine(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid line" };
  }
  const d = parsed.data;
  if (!d.id) return { error: "Missing line id" };
  const result = await updateLine(d.id, d.quotationId, {
    section_id: d.section_id || null,
    item_id: d.item_id || null,
    title: d.title,
    area: d.area || null,
    category: d.category || null,
    description: d.description || null,
    hsn_sac: d.hsn_sac || null,
    qty: d.qty,
    uom: d.uom,
    unit_price: d.unit_price,
    discount_type: d.discount_type as DiscountType,
    discount_value: d.discount_value,
    tax_rate: d.tax_rate,
    cost_rate: d.cost_rate,
    ...measureFrom(d),
  });
  if (result.error) return { error: result.error };
  revalidatePath(`/quotations/${d.quotationId}`);
  return undefined;
}

export async function deleteLineAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const id = String(formData.get("id") ?? "");
  const quotationId = String(formData.get("quotationId") ?? "");
  if (!id || !quotationId) return;
  await deleteLine(id, quotationId);
  revalidatePath(`/quotations/${quotationId}`);
}

/* ── Templates / presets ("3BHK Premium") ─────────────────────────────────── */
const templateSchema = z.object({
  quotationId: z.string().min(1),
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
});

export async function saveAsTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("quotations.quotation.create");
  if (denied) return denied;
  const parsed = templateSchema.safeParse({
    quotationId: formData.get("quotationId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await createTemplateFromQuotation(
    parsed.data.quotationId,
    parsed.data.name,
    parsed.data.description,
  );
  if ("error" in result) return { error: result.error };
  revalidatePath("/quotations/templates");
  redirect("/quotations/templates");
}

export async function newQuotationFromTemplateAction(formData: FormData) {
  if (!(await can("quotations.quotation.create"))) return;
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;
  const result = await instantiateTemplate(templateId);
  if ("id" in result) {
    revalidatePath("/quotations");
    redirect(`/quotations/${result.id}`);
  }
}

export async function deleteTemplateAction(formData: FormData) {
  if (!(await can("quotations.quotation.delete"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteTemplate(id);
  revalidatePath("/quotations/templates");
}
