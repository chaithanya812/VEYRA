import "server-only";
import { randomUUID } from "node:crypto";
import { withOrg } from "./with-org";
import { admin } from "@/lib/supabase/admin";
import {
  computeLine,
  computeQuoteTotals,
  QUOTE_STATUSES,
  DISCOUNT_TYPES,
  type Quotation,
  type QuotationSection,
  type QuotationLine,
  type QuoteStatus,
  type DiscountType,
} from "@/lib/quotations-model";

/**
 * Quotations data module — the money path. Follows the Leads/Items reference
 * pattern (everything through withOrg → org_id isolation), plus:
 *   • the pricing ENGINE is authoritative — every mutation recomputes each line
 *     from its raw inputs and rewrites the snapshots; client totals are ignored;
 *   • ONE public exception: getSharedQuotation() reads by global share_token
 *     WITHOUT an org (the recipient of a /q/<token> link isn't logged in). It
 *     lives here in lib/data (allowed to touch admin) and returns only
 *     presentational fields — never internal cost/margin.
 */
export {
  QUOTE_STATUSES,
  DISCOUNT_TYPES,
  type Quotation,
  type QuotationSection,
  type QuotationLine,
  type QuoteStatus,
  type DiscountType,
};

/* ── Indian financial-year numbering (register: add FY segment) ───────────── */
function indianFY(d = new Date()): string {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // FY starts April
  const end = (startYear + 1) % 100;
  return `${startYear}-${String(end).padStart(2, "0")}`;
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function listQuotations(filter?: {
  status?: QuoteStatus;
}): Promise<Quotation[]> {
  const { db } = await withOrg();
  let q = db.table("quotations").select("*");
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Quotation[];
}

export async function quotationCounts(): Promise<{
  total: number;
  openValue: number;
}> {
  const { db } = await withOrg();
  const { data, error } = await db.table("quotations").select("status, grand_total");
  if (error) throw error;
  const rows = (data ?? []) as unknown as { status: QuoteStatus; grand_total: number }[];
  const openStatuses: QuoteStatus[] = ["draft", "sent", "approved"];
  return {
    total: rows.length,
    openValue: rows
      .filter((r) => openStatuses.includes(r.status))
      .reduce((s, r) => s + (Number(r.grand_total) || 0), 0),
  };
}

export async function getQuotation(id: string): Promise<{
  quotation: Quotation;
  sections: QuotationSection[];
  lines: QuotationLine[];
} | null> {
  const { db } = await withOrg();
  const { data: quotation, error } = await db
    .table("quotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!quotation) return null;

  const [{ data: sections }, { data: lines }] = await Promise.all([
    db.table("quotation_sections").select("*").eq("quotation_id", id).order("sort_order", { ascending: true }),
    db.table("quotation_lines").select("*").eq("quotation_id", id).order("sort_order", { ascending: true }),
  ]);

  return {
    quotation: quotation as unknown as Quotation,
    sections: (sections ?? []) as unknown as QuotationSection[],
    lines: (lines ?? []) as unknown as QuotationLine[],
  };
}

/** Sibling versions of a quote (same version_group), newest first. */
export async function listVersions(versionGroup: string): Promise<Quotation[]> {
  const { db } = await withOrg();
  const { data } = await db
    .table("quotations")
    .select("*")
    .eq("version_group", versionGroup)
    .order("version", { ascending: false });
  return (data ?? []) as unknown as Quotation[];
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

export async function createQuotation(input: {
  title?: string;
  leadId?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  site_address?: string | null;
  place_of_supply?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  // Running number with Indian-FY segment, scoped per org.
  const fy = indianFY();
  const { data: existing } = await db
    .table("quotations")
    .select("id")
    .ilike("number", `QT/${fy}/%`);
  const seq = String(((existing ?? []).length ?? 0) + 1).padStart(4, "0");
  const number = `QT/${fy}/${seq}`;

  const { data, error } = await db.table("quotations").insert({
    number,
    title: input.title?.trim() || "Quotation",
    lead_id: input.leadId ?? null,
    customer_name: input.customer_name?.trim() || null,
    customer_phone: input.customer_phone?.trim() || null,
    customer_email: input.customer_email?.trim() || null,
    site_address: input.site_address?.trim() || null,
    place_of_supply: input.place_of_supply?.trim() || null,
    status: "draft",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

export async function updateQuotationMeta(
  id: string,
  patch: {
    title?: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    site_address?: string | null;
    place_of_supply?: string | null;
    notes?: string | null;
    terms?: string | null;
    valid_until?: string | null;
  },
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("quotations").updateById(id, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

export async function setQuotationStatus(
  id: string,
  status: QuoteStatus,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db
    .table("quotations")
    .updateById(id, { status, updated_at: new Date().toISOString() });
  return error ? { error: error.message } : {};
}

export async function addSection(
  quotationId: string,
  title: string,
): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();
  const { data: existing } = await db
    .table("quotation_sections")
    .select("id")
    .eq("quotation_id", quotationId);
  const { data, error } = await db.table("quotation_sections").insert({
    quotation_id: quotationId,
    title: title.trim() || "Section",
    sort_order: (existing ?? []).length,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

export async function renameSection(id: string, title: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("quotation_sections").updateById(id, { title: title.trim() || "Section" });
  return error ? { error: error.message } : {};
}

export async function deleteSection(id: string, quotationId: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("quotation_sections").deleteById(id);
  if (error) return { error: error.message };
  await recomputeQuotation(quotationId);
  return {};
}

export interface LineWriteInput {
  section_id?: string | null;
  item_id?: string | null;
  title: string;
  area?: string | null;
  category?: string | null;
  description?: string | null;
  hsn_sac?: string | null;
  qty: number;
  uom: string;
  unit_price: number;
  discount_type: DiscountType;
  discount_value: number;
  tax_rate: number;
  cost_rate?: number;
}

export async function addLine(
  quotationId: string,
  input: LineWriteInput,
): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();
  const { data: existing } = await db
    .table("quotation_lines")
    .select("id")
    .eq("quotation_id", quotationId);

  const t = computeLine(input);
  const { data, error } = await db.table("quotation_lines").insert({
    quotation_id: quotationId,
    section_id: input.section_id ?? null,
    item_id: input.item_id ?? null,
    sort_order: (existing ?? []).length,
    title: input.title.trim(),
    area: input.area?.trim() || null,
    category: input.category?.trim() || null,
    description: input.description?.trim() || null,
    hsn_sac: input.hsn_sac?.trim() || null,
    qty: input.qty,
    uom: input.uom,
    unit_price: input.unit_price,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    tax_rate: input.tax_rate,
    cost_rate: input.cost_rate ?? 0,
    ...t,
  });
  if (error) return { error: error.message };
  await recomputeQuotation(quotationId);
  return { id: (data?.[0] as { id: string }).id };
}

export async function updateLine(
  id: string,
  quotationId: string,
  input: LineWriteInput,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const t = computeLine(input);
  const { error } = await db.table("quotation_lines").updateById(id, {
    section_id: input.section_id ?? null,
    item_id: input.item_id ?? null,
    title: input.title.trim(),
    area: input.area?.trim() || null,
    category: input.category?.trim() || null,
    description: input.description?.trim() || null,
    hsn_sac: input.hsn_sac?.trim() || null,
    qty: input.qty,
    uom: input.uom,
    unit_price: input.unit_price,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    tax_rate: input.tax_rate,
    cost_rate: input.cost_rate ?? 0,
    ...t,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  await recomputeQuotation(quotationId);
  return {};
}

export async function deleteLine(id: string, quotationId: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("quotation_lines").deleteById(id);
  if (error) return { error: error.message };
  await recomputeQuotation(quotationId);
  return {};
}

/**
 * The authoritative pass. Reloads every line, recomputes it from raw inputs via
 * the engine (never trusting stored money), rewrites the line snapshots, then
 * rolls up and writes the header totals. Called after every mutation.
 */
export async function recomputeQuotation(quotationId: string): Promise<void> {
  const { db } = await withOrg();
  const { data: lines } = await db
    .table("quotation_lines")
    .select("*")
    .eq("quotation_id", quotationId);
  const rows = (lines ?? []) as unknown as QuotationLine[];

  const computed = rows.map((l) => {
    const t = computeLine({
      qty: l.qty,
      unit_price: l.unit_price,
      discount_type: l.discount_type,
      discount_value: l.discount_value,
      tax_rate: l.tax_rate,
      cost_rate: l.cost_rate,
    });
    return { id: l.id, t };
  });

  // Persist any line whose stored snapshot drifted from the engine result.
  await Promise.all(
    computed.map(({ id, t }) =>
      db.table("quotation_lines").updateById(id, { ...t }),
    ),
  );

  const totals = computeQuoteTotals(computed.map((c) => c.t));
  await db.table("quotations").updateById(quotationId, {
    ...totals,
    updated_at: new Date().toISOString(),
  });
}

/* ── Versioning ───────────────────────────────────────────────────────────── */

/** Clone a quote into a new version (same version_group, version+1, status draft). */
export async function createNewVersion(
  id: string,
): Promise<{ id: string } | { error: string }> {
  const src = await getQuotation(id);
  if (!src) return { error: "Quotation not found" };
  const { db } = await withOrg();

  const nextVersion =
    Math.max(...(await listVersions(src.quotation.version_group)).map((v) => v.version), src.quotation.version) + 1;

  const q = src.quotation;
  const { data, error } = await db.table("quotations").insert({
    number: `${q.number}-v${nextVersion}`,
    version_group: q.version_group,
    version: nextVersion,
    title: q.title,
    lead_id: q.lead_id,
    party_id: q.party_id,
    customer_name: q.customer_name,
    customer_phone: q.customer_phone,
    customer_email: q.customer_email,
    site_address: q.site_address,
    place_of_supply: q.place_of_supply,
    notes: q.notes,
    terms: q.terms,
    valid_until: q.valid_until,
    status: "draft",
  });
  if (error) return { error: error.message };
  const newId = (data?.[0] as { id: string }).id;

  // Clone sections (old id → new id), then lines remapped to the new sections.
  const sectionMap = new Map<string, string>();
  for (const s of src.sections) {
    const { data: ns } = await db.table("quotation_sections").insert({
      quotation_id: newId,
      title: s.title,
      sort_order: s.sort_order,
    });
    sectionMap.set(s.id, (ns?.[0] as { id: string }).id);
  }
  for (const l of src.lines) {
    await db.table("quotation_lines").insert({
      quotation_id: newId,
      section_id: l.section_id ? sectionMap.get(l.section_id) ?? null : null,
      item_id: l.item_id,
      sort_order: l.sort_order,
      title: l.title,
      area: l.area,
      category: l.category,
      description: l.description,
      image_url: l.image_url,
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
  await recomputeQuotation(newId);
  return { id: newId };
}

/* ── Public share link (/q/<token>) ───────────────────────────────────────── */

export async function setShare(
  id: string,
  enabled: boolean,
): Promise<{ token: string | null } | { error: string }> {
  const { db } = await withOrg();
  const patch: Record<string, unknown> = {
    share_enabled: enabled,
    updated_at: new Date().toISOString(),
  };
  let token: string | null = null;
  if (enabled) {
    // Reuse an existing token if present, else mint one.
    const { data: cur } = await db.table("quotations").select("share_token").eq("id", id).maybeSingle();
    token = (cur as { share_token: string | null } | null)?.share_token ?? randomUUID().replace(/-/g, "");
    patch.share_token = token;
  }
  const { error } = await db.table("quotations").updateById(id, patch);
  if (error) return { error: error.message };
  return { token: enabled ? token : null };
}

/**
 * PUBLIC read by share token — NO auth, NO org. The unguessable token is the
 * capability; share_enabled gates it. Returns ONLY presentational fields; internal
 * cost/margin are never selected. This is the single sanctioned withOrg bypass.
 */
export async function getSharedQuotation(token: string): Promise<{
  quotation: Omit<Quotation, "cost_total" | "margin_total" | "lead_id" | "party_id">;
  sections: QuotationSection[];
  lines: Array<Omit<QuotationLine, "cost_rate" | "line_cost" | "item_id">>;
} | null> {
  if (!token) return null;
  const { data: q } = await admin
    .from("quotations")
    .select(
      "id, number, version_group, version, title, status, customer_name, customer_phone, customer_email, site_address, place_of_supply, currency, subtotal, discount_total, taxable_total, tax_total, grand_total, notes, terms, valid_until, share_token, share_enabled, created_at, updated_at",
    )
    .eq("share_token", token)
    .eq("share_enabled", true)
    .maybeSingle();
  if (!q) return null;

  const quotationId = (q as { id: string }).id;
  const [{ data: sections }, { data: lines }] = await Promise.all([
    admin.from("quotation_sections").select("id, quotation_id, title, sort_order").eq("quotation_id", quotationId).order("sort_order", { ascending: true }),
    admin
      .from("quotation_lines")
      .select(
        "id, quotation_id, section_id, sort_order, title, area, category, description, image_url, hsn_sac, qty, uom, unit_price, discount_type, discount_value, discount_amount, tax_rate, line_subtotal, taxable, tax_amount, line_total",
      )
      .eq("quotation_id", quotationId)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    quotation: q as never,
    sections: (sections ?? []) as unknown as QuotationSection[],
    lines: (lines ?? []) as never,
  };
}
