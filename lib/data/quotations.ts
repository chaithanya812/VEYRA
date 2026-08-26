import "server-only";
import { randomUUID } from "node:crypto";
import { withOrg } from "./with-org";
import { admin } from "@/lib/supabase/admin";
import { guardMeteredCreate, recordUsage } from "./subscription";
import { defaultTermsText, getQuotationSettings } from "./quotation-studio";
import { resolveQty, isMeasureMode } from "@/lib/measurement-model";
import {
  computeLine,
  computeQuoteTotals,
  computeGstTotals,
  QUOTE_STATUSES,
  DISCOUNT_TYPES,
  GST_TREATMENTS,
  type Quotation,
  type QuotationSection,
  type QuotationLine,
  type QuoteStatus,
  type DiscountType,
  type GstTreatment,
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
  GST_TREATMENTS,
  type Quotation,
  type QuotationSection,
  type QuotationLine,
  type QuoteStatus,
  type DiscountType,
  type GstTreatment,
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
  projectId?: string | null;
  /** lead | project | standalone — where this quote was raised from. */
  source?: string;
  /** regular | modular | revision | budget */
  doc_type?: string;
  ref_no?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  site_address?: string | null;
  place_of_supply?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  // REQ-04: gate on the subscription (read-only / lifetime limit) before we mint
  // a quotation, and meter the create on success (below).
  const gate = await guardMeteredCreate("quotations");
  if (gate.error) return { error: gate.error };

  // Running number with Indian-FY segment, scoped per org.
  const fy = indianFY();
  const { data: existing } = await db
    .table("quotations")
    .select("id")
    .ilike("number", `QT/${fy}/%`);
  const seq = String(((existing ?? []).length ?? 0) + 1).padStart(4, "0");
  const number = `QT/${fy}/${seq}`;

  // Pull the customer snapshot off the source record when the caller did not
  // supply one, so raising a quote from a lead does not mean retyping the
  // client. The snapshot is denormalised on purpose: the document must not
  // change under the client's feet when the lead is later edited.
  let snap = {
    customer_name: input.customer_name?.trim() || null,
    customer_phone: input.customer_phone?.trim() || null,
    customer_email: input.customer_email?.trim() || null,
    site_address: input.site_address?.trim() || null,
  };

  if (input.leadId && !snap.customer_name) {
    const { data: lead } = await db
      .table("leads")
      .select("name, phone, email, address_line, city")
      .eq("id", input.leadId)
      .maybeSingle();
    if (lead) {
      const l = lead as unknown as {
        name: string; phone: string | null; email: string | null;
        address_line: string | null; city: string | null;
      };
      snap = {
        customer_name: l.name,
        customer_phone: l.phone,
        customer_email: l.email,
        site_address: [l.address_line, l.city].filter(Boolean).join(", ") || null,
      };
    }
  } else if (input.projectId && !snap.customer_name) {
    const { data: project } = await db
      .table("projects")
      .select("client_name, address, city")
      .eq("id", input.projectId)
      .maybeSingle();
    if (project) {
      const pr = project as unknown as {
        client_name: string | null; address: string | null; city: string | null;
      };
      snap = {
        ...snap,
        customer_name: pr.client_name,
        site_address: [pr.address, pr.city].filter(Boolean).join(", ") || null,
      };
    }
  }

  const settings = await getQuotationSettings();
  const terms = await defaultTermsText();
  const validUntil = new Date(
    Date.now() + (Number(settings.default_validity_days) || 15) * 86_400_000,
  );

  const { data, error } = await db.table("quotations").insert({
    number,
    title: input.title?.trim() || "Quotation",
    lead_id: input.leadId ?? null,
    project_id: input.projectId ?? null,
    source: input.source || (input.projectId ? "project" : input.leadId ? "lead" : "standalone"),
    doc_type: input.doc_type || "regular",
    ref_no: input.ref_no?.trim() || number,
    ...snap,
    place_of_supply: input.place_of_supply?.trim() || null,
    terms: terms || null,
    valid_until: validUntil.toISOString().slice(0, 10),
    status: "draft",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  const id = (data?.[0] as { id: string }).id;
  // Append the usage event (append-only ledger; quota is derived, never a counter).
  await recordUsage("quotations", 1, id);
  return { id };
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
    seller_state?: string | null;
    gst_treatment?: GstTreatment;
    works_contract?: boolean;
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
  if (error) return { error: error.message };
  // The GST treatment drives the CGST/SGST vs IGST split — re-partition tax when it changes.
  if (patch.gst_treatment !== undefined) await recomputeQuotation(id);
  return {};
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
  // Re-parent this section's lines to "ungrouped" (section_id = null) FIRST, or
  // they keep a dangling section_id and vanish from the builder (which groups by
  // the live section list + null). Totals are unaffected either way.
  const { data: orphanLines, error: fetchErr } = await db
    .table("quotation_lines")
    .select("id")
    .eq("section_id", id);
  if (fetchErr) return { error: fetchErr.message };
  for (const line of (orphanLines ?? []) as unknown as { id: string }[]) {
    const { error: reErr } = await db.table("quotation_lines").updateById(line.id, { section_id: null });
    if (reErr) return { error: reErr.message };
  }
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
  // Optional measurement mode (OPS-EST-002). When measure_mode is a valid mode,
  // the effective qty is DERIVED server-side from the dimensions via resolveQty
  // (manual override wins) — the client-typed qty is treated as that override.
  measure_mode?: string | null;
  measure_length?: number | null;
  measure_width?: number | null;
  measure_height?: number | null;
  measure_count?: number | null;
  measure_qty_override?: number | null;
}

/**
 * Resolve a line's authoritative qty + the measure fields to persist. When a
 * valid measure_mode is set, qty is derived from the dimensions by the pure
 * engine (never trusted from the client / never an LLM); an override wins.
 * Otherwise qty passes through unchanged (direct entry) and no measure fields
 * are stored.
 */
function resolveLineQty(input: LineWriteInput): {
  qty: number;
  measure: {
    measure_mode: string | null;
    measure_length: number | null;
    measure_width: number | null;
    measure_height: number | null;
    measure_count: number | null;
    measure_qty_override: number | null;
  };
} {
  if (input.measure_mode && isMeasureMode(input.measure_mode)) {
    const override = input.measure_qty_override ?? null;
    const r = resolveQty(
      input.measure_mode,
      {
        length: input.measure_length ?? null,
        width: input.measure_width ?? null,
        height: input.measure_height ?? null,
        count: input.measure_count ?? null,
      },
      override,
    );
    return {
      qty: r.qty,
      measure: {
        measure_mode: input.measure_mode,
        measure_length: input.measure_length ?? null,
        measure_width: input.measure_width ?? null,
        measure_height: input.measure_height ?? null,
        measure_count: input.measure_count ?? null,
        measure_qty_override: override,
      },
    };
  }
  return {
    qty: Number(input.qty) || 0,
    measure: {
      measure_mode: null,
      measure_length: null,
      measure_width: null,
      measure_height: null,
      measure_count: null,
      measure_qty_override: null,
    },
  };
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

  const { qty, measure } = resolveLineQty(input);
  const t = computeLine({ ...input, qty });
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
    qty,
    uom: input.uom,
    unit_price: input.unit_price,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    tax_rate: input.tax_rate,
    cost_rate: input.cost_rate ?? 0,
    ...measure,
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
  const { qty, measure } = resolveLineQty(input);
  const t = computeLine({ ...input, qty });
  const { error } = await db.table("quotation_lines").updateById(id, {
    section_id: input.section_id ?? null,
    item_id: input.item_id ?? null,
    title: input.title.trim(),
    area: input.area?.trim() || null,
    category: input.category?.trim() || null,
    description: input.description?.trim() || null,
    hsn_sac: input.hsn_sac?.trim() || null,
    qty,
    uom: input.uom,
    unit_price: input.unit_price,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    tax_rate: input.tax_rate,
    cost_rate: input.cost_rate ?? 0,
    ...measure,
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
  const [{ data: lines }, { data: header }] = await Promise.all([
    db.table("quotation_lines").select("*").eq("quotation_id", quotationId),
    db.table("quotations").select("gst_treatment").eq("id", quotationId).maybeSingle(),
  ]);
  const rows = (lines ?? []) as unknown as QuotationLine[];
  const treatment: GstTreatment =
    ((header as { gst_treatment?: GstTreatment } | null)?.gst_treatment ?? "intra");

  const computed = rows.map((l) => {
    const t = computeLine({
      qty: l.qty,
      unit_price: l.unit_price,
      discount_type: l.discount_type,
      discount_value: l.discount_value,
      tax_rate: l.tax_rate,
      cost_rate: l.cost_rate,
    });
    return { id: l.id, tax_rate: Number(l.tax_rate) || 0, t };
  });

  // Persist any line whose stored snapshot drifted from the engine result.
  await Promise.all(
    computed.map(({ id, t }) =>
      db.table("quotation_lines").updateById(id, { ...t }),
    ),
  );

  const totals = computeQuoteTotals(computed.map((c) => c.t));
  // Partition the (already-summed) tax into CGST/SGST or IGST per the treatment.
  const gst = computeGstTotals(
    computed.map((c) => ({ tax_rate: c.tax_rate, taxable: c.t.taxable, tax_amount: c.t.tax_amount })),
    treatment,
  );
  await db.table("quotations").updateById(quotationId, {
    ...totals,
    cgst_total: gst.cgst,
    sgst_total: gst.sgst,
    igst_total: gst.igst,
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
    seller_state: q.seller_state,
    gst_treatment: q.gst_treatment,
    works_contract: q.works_contract,
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
  seller: { name: string | null; gstin: string | null } | null;
} | null> {
  if (!token) return null;
  // org_id is selected internally to brand the document with the seller's business
  // name; it is stripped from the returned object (never exposed to the recipient).
  const { data: q } = await admin
    .from("quotations")
    .select(
      "id, org_id, number, version_group, version, title, status, customer_name, customer_phone, customer_email, site_address, place_of_supply, seller_state, gst_treatment, works_contract, currency, subtotal, discount_total, taxable_total, tax_total, cgst_total, sgst_total, igst_total, grand_total, notes, terms, valid_until, share_token, share_enabled, created_at, updated_at",
    )
    .eq("share_token", token)
    .eq("share_enabled", true)
    .maybeSingle();
  if (!q) return null;

  const { org_id, ...quotationPublic } = q as Record<string, unknown> & { org_id: string };
  const quotationId = quotationPublic.id as string;
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

  const { data: org } = await admin
    .from("orgs")
    .select("name, gstin")
    .eq("id", org_id)
    .maybeSingle();

  return {
    quotation: quotationPublic as never,
    sections: (sections ?? []) as unknown as QuotationSection[],
    lines: (lines ?? []) as never,
    seller: (org as { name: string | null; gstin: string | null } | null) ?? null,
  };
}
