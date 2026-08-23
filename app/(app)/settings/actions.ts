"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTIONS, DOC_TYPES, MODULES, SCOPES } from "@/lib/permissions-model";
import {
  removePermission,
  setPermission,
  upsertNumberingSeries,
} from "@/lib/data/config";

/** A config write invalidates every settings surface that shows it. */
function revalidateSettings() {
  revalidatePath("/settings");
  revalidatePath("/settings/numbering");
  revalidatePath("/settings/roles");
}

const seriesSchema = z.object({
  doc_type: z.enum(DOC_TYPES),
  prefix: z
    .string()
    .trim()
    .min(1, "Prefix is required")
    .max(16, "Keep the prefix under 16 characters"),
  fy_segment: z.boolean(),
  padding: z.coerce
    .number()
    .int("Padding must be a whole number")
    .min(1, "Padding must be at least 1")
    .max(8, "Padding must be at most 8"),
});

export async function upsertNumberingSeriesAction(
  input: unknown,
): Promise<{ error?: string }> {
  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await upsertNumberingSeries(parsed.data);
  if (!result.error) revalidateSettings();
  return result;
}

const setPermissionSchema = z.object({
  role_id: z.string().uuid("Invalid role"),
  module: z.enum(MODULES),
  action: z.enum(ACTIONS),
  scope: z.enum(SCOPES),
});

export async function setPermissionAction(
  input: unknown,
): Promise<{ error?: string }> {
  const parsed = setPermissionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await setPermission(
    parsed.data.role_id,
    parsed.data.module,
    parsed.data.action,
    parsed.data.scope,
  );
  if (!result.error) revalidateSettings();
  return result;
}

const removePermissionSchema = z.object({
  role_id: z.string().uuid("Invalid role"),
  module: z.enum(MODULES),
  action: z.enum(ACTIONS),
});

export async function removePermissionAction(
  input: unknown,
): Promise<{ error?: string }> {
  const parsed = removePermissionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await removePermission(
    parsed.data.role_id,
    parsed.data.module,
    parsed.data.action,
  );
  if (!result.error) revalidateSettings();
  return result;
}
