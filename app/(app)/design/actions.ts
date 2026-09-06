"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createAsset,
  addComment,
  signOff,
  ASSET_KINDS,
  SIGNOFF_STATUSES,
} from "@/lib/data/design";
import type { AssetKind, SignoffStatus } from "@/lib/design-model";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  kind: z.enum(ASSET_KINDS),
  project_id: z.string().uuid().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
});

export async function createAssetAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    project_id: formData.get("project_id") || undefined,
    url: formData.get("url") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createAsset({
    name: parsed.data.name,
    kind: parsed.data.kind as AssetKind,
    project_id: parsed.data.project_id ?? null,
    url: parsed.data.url ?? null,
    note: parsed.data.note ?? null,
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/design");
  redirect(`/design/${result.id}`);
}

export async function addCommentAction(
  assetId: string,
  body: string,
  xPct?: string,
  yPct?: string,
): Promise<{ error?: string }> {
  const denied = await requireCan("projects.project.view");
  if (denied) return denied;
  const trimmed = body.trim();
  if (!trimmed) return { error: "Comment cannot be empty" };

  // Pin coordinates are optional; when present they must parse to 0–100.
  let x: number | null = null;
  let y: number | null = null;
  if (xPct != null && xPct !== "") {
    x = Number(xPct);
    if (!Number.isFinite(x) || x < 0 || x > 100) {
      return { error: "Pin X must be a percentage between 0 and 100" };
    }
  }
  if (yPct != null && yPct !== "") {
    y = Number(yPct);
    if (!Number.isFinite(y) || y < 0 || y > 100) {
      return { error: "Pin Y must be a percentage between 0 and 100" };
    }
  }
  if ((x != null) !== (y != null)) {
    return { error: "Provide both pin X and Y, or leave both blank" };
  }

  const result = await addComment(assetId, {
    body: trimmed,
    x_pct: x,
    y_pct: y,
  });
  if (result.error) return { error: result.error };
  revalidatePath(`/design/${assetId}`);
  return {};
}

export async function signOffAction(
  assetId: string,
  status: string,
  note?: string,
): Promise<{ error?: string }> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  if (!SIGNOFF_STATUSES.includes(status as SignoffStatus)) {
    return { error: "Invalid sign-off status" };
  }
  const trimmedNote = (note ?? "").trim();
  if (status === "rejected" && !trimmedNote) {
    return { error: "A rejection needs a note — say what must change" };
  }

  const result = await signOff(
    assetId,
    status as SignoffStatus,
    trimmedNote || null,
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/design/${assetId}`);
  revalidatePath("/design");
  return {};
}
