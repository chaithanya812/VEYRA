"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addWorkCenter,
  advancePanel,
  computeAndSaveNesting,
  generatePanelTags,
} from "@/lib/data/production-nesting";

export type FormState = { error?: string } | undefined;

const uuidId = z
  .string()
  .regex(/^[0-9a-fA-F-]{36}$/, "Must be a valid id");

function optionalNumber(raw: FormDataEntryValue | null): string | undefined {
  const v = String(raw ?? "").trim();
  return v ? v : undefined;
}

function optionalText(raw: FormDataEntryValue | null): string | undefined {
  const v = String(raw ?? "").trim();
  return v ? v : undefined;
}

/* ── Nesting run (cutlist + board size + kerf) ─────────────────────────────── */
const nestingSchema = z.object({
  cutlist_id: uuidId,
  board_length_mm: z.coerce
    .number()
    .min(1, "Board length must be at least 1 mm"),
  board_width_mm: z.coerce.number().min(1, "Board width must be at least 1 mm"),
  kerf_mm: z.coerce
    .number()
    .min(0, "Kerf must be ≥ 0")
    .max(50, "Kerf must be ≤ 50")
    .default(0),
});

export async function runNestingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = nestingSchema.safeParse({
    cutlist_id: String(formData.get("cutlist_id") ?? "").trim(),
    board_length_mm: optionalNumber(formData.get("board_length_mm")),
    board_width_mm: optionalNumber(formData.get("board_width_mm")),
    kerf_mm: optionalNumber(formData.get("kerf_mm")) ?? 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await computeAndSaveNesting({
    cutlist_id: parsed.data.cutlist_id,
    board_length_mm: parsed.data.board_length_mm,
    board_width_mm: parsed.data.board_width_mm,
    kerf_mm: parsed.data.kerf_mm,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/production");
  return undefined;
}

/* ── Panel QR tags (one per physical panel of a cutlist) ───────────────────── */
const generateTagsSchema = z.object({
  cutlist_id: uuidId,
});

export async function generateTagsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = generateTagsSchema.safeParse({
    cutlist_id: String(formData.get("cutlist_id") ?? "").trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await generatePanelTags(parsed.data.cutlist_id);
  if ("error" in result) return { error: result.error };

  revalidatePath("/production");
  return undefined;
}

/* ── Advance one panel tag to the next stage ────────────────────────────────── */
const advancePanelSchema = z.object({
  tag_id: uuidId,
  note: z.string().optional(),
});

export async function advancePanelAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = advancePanelSchema.safeParse({
    tag_id: String(formData.get("tag_id") ?? "").trim(),
    note: optionalText(formData.get("note")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await advancePanel(parsed.data.tag_id, parsed.data.note ?? null);
  if ("error" in result) return { error: result.error };

  revalidatePath("/production");
  return undefined;
}

/* ── Work centers ───────────────────────────────────────────────────────────── */
const workCenterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  kind: z.string().optional(),
  capacity_per_day: z.coerce
    .number()
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be ≥ 1")
    .max(100000, "Capacity looks too large")
    .optional(),
  notes: z.string().optional(),
});

export async function addWorkCenterAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = workCenterSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    kind: optionalText(formData.get("kind")),
    capacity_per_day: optionalNumber(formData.get("capacity_per_day")),
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await addWorkCenter({
    name: parsed.data.name,
    kind: parsed.data.kind ?? null,
    capacity_per_day: parsed.data.capacity_per_day ?? null,
    notes: parsed.data.notes ?? null,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/production");
  return undefined;
}
