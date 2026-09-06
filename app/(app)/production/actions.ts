"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addBom, addCutlist } from "@/lib/data/production";

export type FormState = { error?: string } | undefined;

/* ── BOM (title + exploded material lines) ─────────────────────────────────── */
const bomLineSchema = z.object({
  material_name: z.string().min(1, "Material name is required"),
  uom: z.string().optional(),
  qty: z.coerce.number().min(0, "Qty must be ≥ 0"),
  waste_pct: z.coerce.number().min(0, "Waste % must be ≥ 0").max(100).optional(),
  notes: z.string().optional(),
});

const bomSchema = z.object({
  project_id: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required"),
  source_ref: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(bomLineSchema).max(200).optional(),
});

function parseJsonArray(raw: FormDataEntryValue | null): unknown {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

export async function createBomAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const rawLines = parseJsonArray(formData.get("lines_json"));
  if (rawLines === null) {
    return { error: "Invalid lines payload." };
  }

  const parsed = bomSchema.safeParse({
    project_id: formData.get("project_id") || undefined,
    title: formData.get("title"),
    source_ref: formData.get("source_ref") || undefined,
    notes: formData.get("notes") || undefined,
    lines: rawLines,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await addBom({
    project_id: parsed.data.project_id ?? null,
    title: parsed.data.title,
    source_ref: parsed.data.source_ref ?? null,
    notes: parsed.data.notes ?? null,
    lines: parsed.data.lines ?? [],
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/production");
  redirect("/production");
}

/* ── Cutlist (title + board + panel rows with grain and edge-banding) ─────── */
const cutlistPanelSchema = z.object({
  panel_name: z.string().min(1, "Panel name is required"),
  room_label: z.string().optional(),
  length_mm: z.coerce.number().min(0, "Length must be ≥ 0"),
  width_mm: z.coerce.number().min(0, "Width must be ≥ 0"),
  qty: z.coerce.number().int().min(1, "Qty must be ≥ 1").default(1),
  grain: z.enum(["length", "width", "none"]).default("none"),
  material: z.string().optional(),
  edge_l1: z.boolean().default(false),
  edge_l2: z.boolean().default(false),
  edge_w1: z.boolean().default(false),
  edge_w2: z.boolean().default(false),
  notes: z.string().optional(),
});

const cutlistSchema = z.object({
  bom_id: z
    .string()
    .regex(/^[0-9a-fA-F-]{36}$/, "BOM reference must be a valid id")
    .optional()
    .or(z.literal("")),
  project_id: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required"),
  board_material: z.string().optional(),
  board_length_mm: z.coerce.number().min(0).optional(),
  board_width_mm: z.coerce.number().min(0).optional(),
  panels: z.array(cutlistPanelSchema).max(500).optional(),
});

function optionalNumber(raw: FormDataEntryValue | null): string | undefined {
  const v = String(raw ?? "").trim();
  return v ? v : undefined;
}

export async function createCutlistAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const rawPanels = parseJsonArray(formData.get("panels_json"));
  if (rawPanels === null) {
    return { error: "Invalid panels payload." };
  }

  const parsed = cutlistSchema.safeParse({
    bom_id: String(formData.get("bom_id") ?? "").trim() || "",
    project_id: formData.get("project_id") || undefined,
    title: formData.get("title"),
    board_material: formData.get("board_material") || undefined,
    board_length_mm: optionalNumber(formData.get("board_length_mm")),
    board_width_mm: optionalNumber(formData.get("board_width_mm")),
    panels: rawPanels,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (
    (parsed.data.board_length_mm != null && parsed.data.board_width_mm == null) ||
    (parsed.data.board_length_mm == null && parsed.data.board_width_mm != null)
  ) {
    return { error: "Set both board length and width, or neither." };
  }

  const result = await addCutlist({
    bom_id: parsed.data.bom_id || null,
    project_id: parsed.data.project_id ?? null,
    title: parsed.data.title,
    board_material: parsed.data.board_material ?? null,
    board_length_mm: parsed.data.board_length_mm ?? null,
    board_width_mm: parsed.data.board_width_mm ?? null,
    panels: parsed.data.panels ?? [],
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/production");
  redirect("/production");
}
