import "server-only";
import { withOrg } from "./with-org";
import { getActingContext } from "./team";
import { activeModel, activeProvider, aiStatus } from "@/lib/ai/provider";

/**
 * Quotation studio config: the tenant's saved AI prompts, its reusable terms &
 * conditions, its quotation defaults, and the append-only log of AI calls.
 *
 * Everything here is CONFIGURATION the tenant owns. The default GST rate and
 * margin live in `quotation_settings` because the owner's rule is that a firm
 * must be able to change anything — but they remain inputs to the pricing
 * engine, never outputs of a model.
 */

/* ── AI prompt library ────────────────────────────────────────────────────── */

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  kind: string;
  seq: number;
  is_system: boolean;
  is_active: boolean;
}

/**
 * Worked examples, seeded once. They are ordinary rows: rename them, rewrite
 * them, delete the ones you never use, add the three your firm actually quotes.
 */
const DEFAULT_PROMPTS: { name: string; prompt: string; seq: number }[] = [
  {
    name: "Full home interiors",
    seq: 0,
    prompt:
      "Full interior design for a 2BHK apartment (1200 sq ft). Modular kitchen with tall units and acrylic finish, wardrobes in both bedrooms, TV unit in the living room, false ceiling with cove lighting in living and dining, wall paint throughout, and basic electrical work.",
  },
  {
    name: "Single room",
    seq: 1,
    prompt:
      "Modern living room interior, 250 sq ft. TV unit with back panelling, wall panelling, L-shaped sofa, centre table, gypsum false ceiling with cove lighting, and decorative wallpaper on one wall.",
  },
  {
    name: "Modular kitchen only",
    seq: 2,
    prompt:
      "Modular kitchen, 10 ft x 12 ft, L-shaped. Base cabinets with soft-close hardware, overhead storage, chimney and hob cutout, granite countertop, backsplash tiles. Cabinet finish: high-gloss acrylic.",
  },
  {
    name: "Commercial office fit-out",
    seq: 3,
    prompt:
      "Office fit-out, 2500 sq ft. 24 workstations, 2 cabins, a 10-seat conference room, reception desk and waiting area, pantry, glass partitions, carpet flooring, grid false ceiling and complete electrical and networking provision.",
  },
];

export async function ensureDefaultPrompts(): Promise<void> {
  const { db } = await withOrg();
  const { data } = await db.table("ai_prompt_templates").select("name").eq("kind", "quotation");
  const have = new Set(((data ?? []) as unknown as { name: string }[]).map((r) => r.name));
  const missing = DEFAULT_PROMPTS.filter((p) => !have.has(p.name));
  if (missing.length === 0) return;
  await db.table("ai_prompt_templates").insert(
    missing.map((p) => ({
      name: p.name,
      prompt: p.prompt,
      kind: "quotation",
      seq: p.seq,
      is_system: true,
    })),
  );
}

export async function listPrompts(kind = "quotation"): Promise<PromptTemplate[]> {
  await ensureDefaultPrompts();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("ai_prompt_templates")
    .select("*")
    .eq("kind", kind)
    .order("seq", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as PromptTemplate[]).filter((p) => p.is_active);
}

export async function savePrompt(input: {
  id?: string;
  name: string;
  prompt: string;
  kind?: string;
}): Promise<{ error?: string }> {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  if (!name) return { error: "Give the prompt a name." };
  if (!prompt) return { error: "The prompt itself cannot be empty." };

  const { db, ctx } = await withOrg();
  if (input.id) {
    const { error } = await db
      .table("ai_prompt_templates")
      .updateById(input.id, { name, prompt });
    return error ? { error: error.message } : {};
  }

  const existing = await listPrompts(input.kind ?? "quotation");
  const { error } = await db.table("ai_prompt_templates").insert({
    name,
    prompt,
    kind: input.kind ?? "quotation",
    seq: existing.length,
    is_system: false,
    created_by: ctx.userId,
  });
  return error ? { error: error.message } : {};
}

export async function deletePrompt(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data } = await db
    .table("ai_prompt_templates")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Prompt not found." };

  const { error } = (data as unknown as { is_system: boolean }).is_system
    ? await db.table("ai_prompt_templates").updateById(id, { is_active: false })
    : await db.table("ai_prompt_templates").deleteById(id);
  return error ? { error: error.message } : {};
}

/* ── Terms & conditions library ───────────────────────────────────────────── */

export interface TermsClause {
  id: string;
  title: string;
  body: string;
  is_default: boolean;
  seq: number;
  is_active: boolean;
}

const DEFAULT_TERMS: { title: string; body: string; is_default: boolean }[] = [
  {
    title: "Payment schedule",
    is_default: true,
    body:
      "50% advance on confirmation of order, 40% on delivery of materials to site, and the balance 10% on handover. All payments by NEFT/RTGS to the account named on this document.",
  },
  {
    title: "Taxes",
    is_default: true,
    body:
      "Prices are exclusive of GST unless stated otherwise. GST will be charged at the rate applicable on the date of invoice, against the HSN/SAC shown per line.",
  },
  {
    title: "Timeline",
    is_default: true,
    body:
      "Execution begins after the advance is received and the final design is signed off. Timelines exclude delays caused by site readiness, client-side approvals, or changes to scope after sign-off.",
  },
  {
    title: "Scope changes",
    is_default: false,
    body:
      "Any addition, deletion or change to the scope after sign-off will be quoted separately and may affect the agreed timeline.",
  },
  {
    title: "Warranty",
    is_default: false,
    body:
      "One year warranty on workmanship from the date of handover. Hardware and appliances carry the manufacturer's own warranty. Damage from misuse, water ingress or third-party work is excluded.",
  },
];

export async function ensureDefaultTerms(): Promise<void> {
  const { db } = await withOrg();
  const { data } = await db.table("quotation_terms").select("title");
  const have = new Set(((data ?? []) as unknown as { title: string }[]).map((r) => r.title));
  const missing = DEFAULT_TERMS.filter((t) => !have.has(t.title));
  if (missing.length === 0) return;
  await db.table("quotation_terms").insert(
    missing.map((t, i) => ({
      title: t.title,
      body: t.body,
      is_default: t.is_default,
      seq: i,
    })),
  );
}

export async function listTerms(): Promise<TermsClause[]> {
  await ensureDefaultTerms();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("quotation_terms")
    .select("*")
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TermsClause[];
}

export async function saveTerms(input: {
  id?: string;
  title: string;
  body: string;
  is_default?: boolean;
}): Promise<{ error?: string }> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { error: "Give the clause a title." };
  if (!body) return { error: "The clause text cannot be empty." };

  const { db, ctx } = await withOrg();
  if (input.id) {
    const { error } = await db.table("quotation_terms").updateById(input.id, {
      title,
      body,
      ...(input.is_default !== undefined ? { is_default: input.is_default } : {}),
    });
    return error ? { error: error.message } : {};
  }

  const existing = await listTerms();
  const { error } = await db.table("quotation_terms").insert({
    title,
    body,
    is_default: input.is_default ?? false,
    seq: existing.length,
    created_by: ctx.userId,
  });
  return error ? { error: error.message } : {};
}

export async function deleteTerms(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("quotation_terms").deleteById(id);
  return error ? { error: error.message } : {};
}

/** The clause bodies a new quotation starts with. */
export async function defaultTermsText(): Promise<string> {
  const clauses = (await listTerms()).filter((t) => t.is_default && t.is_active);
  return clauses.map((c) => `${c.title}\n${c.body}`).join("\n\n");
}

/* ── Quotation defaults ───────────────────────────────────────────────────── */

export interface QuotationSettings {
  id: string;
  default_gst_pct: number;
  default_margin_pct: number;
  default_validity_days: number;
  footer_note: string | null;
  show_cost_column: boolean;
}

const FALLBACK_SETTINGS = {
  default_gst_pct: 18,
  default_margin_pct: 0,
  default_validity_days: 15,
  footer_note: null,
  show_cost_column: false,
};

export async function getQuotationSettings(): Promise<QuotationSettings> {
  const { db } = await withOrg();
  const { data } = await db.table("quotation_settings").select("*").maybeSingle();
  if (data) return data as unknown as QuotationSettings;

  const { data: created } = await db.table("quotation_settings").insert(FALLBACK_SETTINGS);
  return (created?.[0] as unknown as QuotationSettings) ?? {
    id: "",
    ...FALLBACK_SETTINGS,
  };
}

export async function saveQuotationSettings(input: {
  default_gst_pct?: number;
  default_margin_pct?: number;
  default_validity_days?: number;
  footer_note?: string | null;
  show_cost_column?: boolean;
}): Promise<{ error?: string }> {
  const current = await getQuotationSettings();
  const { db } = await withOrg();

  const gst = Number(input.default_gst_pct);
  if (input.default_gst_pct !== undefined && (!Number.isFinite(gst) || gst < 0 || gst > 100)) {
    return { error: "GST must be between 0 and 100." };
  }
  const margin = Number(input.default_margin_pct);
  if (input.default_margin_pct !== undefined && (!Number.isFinite(margin) || margin < 0 || margin > 100)) {
    return { error: "Margin must be between 0 and 100." };
  }

  const { error } = await db.table("quotation_settings").updateById(current.id, {
    ...(input.default_gst_pct !== undefined ? { default_gst_pct: gst } : {}),
    ...(input.default_margin_pct !== undefined ? { default_margin_pct: margin } : {}),
    ...(input.default_validity_days !== undefined
      ? { default_validity_days: Math.max(1, Math.trunc(Number(input.default_validity_days) || 15)) }
      : {}),
    ...(input.footer_note !== undefined ? { footer_note: input.footer_note?.trim() || null } : {}),
    ...(input.show_cost_column !== undefined ? { show_cost_column: input.show_cost_column } : {}),
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

/* ── AI request log ───────────────────────────────────────────────────────── */

/**
 * Append one row per AI call. Never updated — this is the audit trail that
 * makes AI spend and AI behaviour reviewable after the fact.
 */
export async function logAiRequest(input: {
  kind?: string;
  prompt: string;
  attachments?: number;
  status?: "ok" | "error" | "blocked";
  linesCreated?: number;
  errorMessage?: string | null;
  refId?: string | null;
}): Promise<void> {
  const { db, ctx } = await withOrg();
  await db.table("ai_requests").insert({
    kind: input.kind ?? "quotation_boq",
    provider: activeProvider(),
    model: activeModel(),
    prompt: input.prompt.slice(0, 4000),
    attachments: input.attachments ?? 0,
    status: input.status ?? "ok",
    lines_created: input.linesCreated ?? 0,
    error_message: input.errorMessage ?? null,
    ref_id: input.refId ?? null,
    created_by: ctx.userId,
  });
}

export interface AiRequestRow {
  id: string;
  kind: string;
  provider: string;
  model: string;
  prompt: string;
  attachments: number;
  status: string;
  lines_created: number;
  error_message: string | null;
  created_at: string;
}

export async function listAiRequests(limit = 20): Promise<AiRequestRow[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("ai_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AiRequestRow[];
}

/** Which backend is live, for the UI's status line. */
export function aiBackendStatus() {
  return aiStatus();
}

/** Who is acting — used to stamp AI usage against a person. */
export async function actingName(): Promise<string> {
  return (await getActingContext()).member.name;
}
