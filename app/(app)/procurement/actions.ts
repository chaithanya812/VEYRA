"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createMaterialRequest,
  updateMRStage,
  addMRItem,
  removeMRItem,
  searchCatalogueItems,
  type CatalogueMatch,
  type MRItemInput,
} from "@/lib/data/material-requests";
import { MR_LIFECYCLE_STAGES, type MRStage } from "@/lib/material-requests-model";

export type FormState = { error?: string } | undefined;

/* ── Catalogue autocomplete (powers the line grid) ────────────────────────── */
export async function searchItemsAction(
  query: string,
): Promise<CatalogueMatch[]> {
  if (!query || query.trim().length < 1) return [];
  return searchCatalogueItems(query);
}

/* ── Create (draft / raise) ────────────────────────────────────────────────── */
const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  project_label: z.string().optional(),
  expected_delivery: z.string().optional(),
  source: z.enum(["manual", "from_quotation", "ai_parsed"]).optional(),
  remarks: z.string().optional(),
});

const lineSchema = z.object({
  item_id: z.string().nullable().optional(),
  item_name: z.string().min(1, "Item is required"),
  is_adhoc: z.boolean().optional(),
  uom: z.string().nullable().optional(),
  qty: z.coerce.number().min(0, "Qty must be ≥ 0"),
  remarks: z.string().nullable().optional(),
});

function parseLines(raw: FormDataEntryValue | null): MRItemInput[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = z.array(lineSchema).safeParse(parsedJson);
  if (!parsed.success) return null;
  return parsed.data.map((l) => ({
    item_id: l.item_id || null,
    item_name: l.item_name,
    is_adhoc: l.is_adhoc ?? !l.item_id,
    uom: l.uom || null,
    qty: l.qty,
    remarks: l.remarks || null,
  }));
}

export async function createMaterialRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSchema.safeParse({
    title: formData.get("title") || undefined,
    project_label: formData.get("project_label") || undefined,
    expected_delivery: formData.get("expected_delivery") || undefined,
    remarks: formData.get("remarks") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const lines = parseLines(formData.get("items"));
  if (lines === null) {
    return { error: "The line items could not be read — try again." };
  }

  const result = await createMaterialRequest({
    title: parsed.data.title,
    project_label: parsed.data.project_label || null,
    expected_delivery: parsed.data.expected_delivery || null,
    source: parsed.data.source,
    remarks: parsed.data.remarks || null,
    items: lines,
  });
  if ("error" in result) return { error: result.error };

  // "Raise" skips the draft parking state in one step.
  const intent = String(formData.get("intent") ?? "draft");
  const stage: MRStage = intent === "raise" ? "requested" : "draft";
  if (stage !== "draft") await updateMRStage(result.id, stage);

  revalidatePath("/procurement");
  redirect(`/procurement/${result.id}`);
}

/* ── Stage ─────────────────────────────────────────────────────────────────── */
/**
 * Move a request's OWN lifecycle (0036): draft → requested → cancelled.
 *
 * The full `MR_STAGES` ladder is deliberately NOT accepted here. Since 0036 a
 * request's procurement position is the aggregate of its lines, so writing
 * `ordered` onto the parent would put a number on the screen that thirteen
 * lines can disagree with. The browser is not trusted to have sent only a
 * lifecycle value — the server re-checks it.
 */
export async function updateMRStageAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage"));
  if (!id || !(MR_LIFECYCLE_STAGES as readonly string[]).includes(stage)) return;
  const result = await updateMRStage(id, stage as MRStage);
  if (result.error) return;
  revalidatePath(`/procurement/${id}`);
  revalidatePath("/procurement");
}

/* ── Lines ─────────────────────────────────────────────────────────────────── */
const addItemSchema = z.object({
  mrId: z.string().min(1),
  item_id: z.string().optional(),
  item_name: z.string().min(1, "Item is required"),
  uom: z.string().optional(),
  qty: z.coerce.number().min(0, "Qty must be ≥ 0").default(0),
  remarks: z.string().optional(),
});

export async function addMRItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = addItemSchema.safeParse({
    mrId: formData.get("mrId"),
    item_id: formData.get("item_id") || undefined,
    item_name: formData.get("item_name") || undefined,
    uom: formData.get("uom") || undefined,
    qty: formData.get("qty") ?? 0,
    remarks: formData.get("remarks") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // Quick-add resolves a typed name against the catalogue first (exact,
  // case-insensitive); only an unmatched name stays flagged ad-hoc.
  let itemId = d.item_id || null;
  let isAdhoc = !itemId;
  if (!itemId) {
    const term = d.item_name.trim();
    const matches = await searchCatalogueItems(term);
    const hit = matches.find(
      (m) => m.name.trim().toLowerCase() === term.toLowerCase(),
    );
    if (hit) {
      itemId = hit.id;
      isAdhoc = false;
    }
  }

  const result = await addMRItem(d.mrId, {
    item_id: itemId,
    item_name: d.item_name,
    is_adhoc: isAdhoc,
    uom: d.uom || null,
    qty: d.qty,
    remarks: d.remarks || null,
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/procurement/${d.mrId}`);
  revalidatePath("/procurement");
  return undefined;
}

export async function removeMRItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const mrId = String(formData.get("mrId") ?? "");
  if (!id || !mrId) return;
  await removeMRItem(id);
  revalidatePath(`/procurement/${mrId}`);
  revalidatePath("/procurement");
}
