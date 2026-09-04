"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addSiteLog,
  addPhoto,
  checkIn,
  checkOut,
  addVariance,
} from "@/lib/data/site";

export type FormState = { error?: string } | undefined;

/* ── Daily site log (optional pasted photo URLs ride along) ─────────────────── */
const logSchema = z.object({
  project_label: z.string().optional(),
  log_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Log date must be a valid date")
    .optional()
    .or(z.literal("")),
  work_summary: z.string().min(1, "Work summary is required"),
  photo_url: z
    .string()
    .url("Photo URL must be a valid URL")
    .optional()
    .or(z.literal("")),
  photo_caption: z.string().optional(),
});

export async function addSiteLogAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const parsed = logSchema.safeParse({
    project_label: formData.get("project_label") || undefined,
    log_date: formData.get("log_date") || "",
    work_summary: formData.get("work_summary"),
    photo_url: formData.get("photo_url") || "",
    photo_caption: formData.get("photo_caption") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await addSiteLog({
    project_label: parsed.data.project_label ?? null,
    log_date: parsed.data.log_date || null,
    work_summary: parsed.data.work_summary,
    photos: parsed.data.photo_url
      ? [{ url: parsed.data.photo_url, caption: parsed.data.photo_caption }]
      : [],
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/site");
  redirect("/site");
}

/* ── Photo feed ─────────────────────────────────────────────────────────────── */
const photoSchema = z.object({
  project_label: z.string().optional(),
  caption: z.string().optional(),
  url: z.string().min(1, "Image URL is required").url("URL must be valid"),
});

export async function addPhotoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const parsed = photoSchema.safeParse({
    project_label: formData.get("project_label") || undefined,
    caption: formData.get("caption") || undefined,
    url: formData.get("url"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await addPhoto({
    project_label: parsed.data.project_label ?? null,
    caption: parsed.data.caption ?? null,
    url: parsed.data.url,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/site");
  redirect("/site?tab=photos");
}

/* ── Attendance ─────────────────────────────────────────────────────────────── */
const checkInSchema = z.object({
  project_label: z.string().optional(),
  member_name: z.string().min(1, "Member name is required"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

function optionalCoord(raw: FormDataEntryValue | null): string | undefined {
  const v = String(raw ?? "").trim();
  return v ? v : undefined;
}

export async function checkInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = checkInSchema.safeParse({
    project_label: formData.get("project_label") || undefined,
    member_name: formData.get("member_name"),
    lat: optionalCoord(formData.get("lat")),
    lng: optionalCoord(formData.get("lng")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (
    (parsed.data.lat != null && parsed.data.lng == null) ||
    (parsed.data.lat == null && parsed.data.lng != null)
  ) {
    return { error: "Capture both latitude and longitude, or neither." };
  }

  const result = await checkIn({
    project_label: parsed.data.project_label ?? null,
    member_name: parsed.data.member_name,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/site");
  redirect("/site?tab=attendance");
}

export async function checkOutAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await checkOut(id);
  if (result.error) return;
  revalidatePath("/site");
}

/* ── Measurement variance ─────────────────────────────────────────────────── */
const varianceSchema = z.object({
  project_label: z.string().optional(),
  item_name: z.string().min(1, "Item name is required"),
  uom: z.string().optional(),
  quoted_qty: z.string().min(1, "Quoted qty is required"),
  measured_qty: z.string().min(1, "Measured qty is required"),
  note: z.string().optional(),
});

export async function addVarianceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const parsed = varianceSchema.safeParse({
    project_label: formData.get("project_label") || undefined,
    item_name: formData.get("item_name"),
    uom: formData.get("uom") || undefined,
    quoted_qty: formData.get("quoted_qty"),
    measured_qty: formData.get("measured_qty"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const quoted = Number(parsed.data.quoted_qty);
  const measured = Number(parsed.data.measured_qty);
  if (!Number.isFinite(quoted) || !Number.isFinite(measured)) {
    return { error: "Quantities must be numbers." };
  }
  if (quoted < 0 || measured < 0) {
    return { error: "Quantities must be ≥ 0." };
  }

  const result = await addVariance({
    project_label: parsed.data.project_label ?? null,
    item_name: parsed.data.item_name,
    uom: parsed.data.uom ?? null,
    quoted_qty: quoted,
    measured_qty: measured,
    note: parsed.data.note ?? null,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/site");
  redirect("/site?tab=variance");
}
