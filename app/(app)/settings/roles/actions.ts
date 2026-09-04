"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCan } from "@/lib/data/permissions";
import {
  createRole,
  deleteRole,
  setCapability,
  setGroup,
  updateRole,
} from "@/lib/data/roles";

/**
 * Role authoring actions. ASYNC FUNCTIONS ONLY — an exported const here becomes
 * a client reference the moment the editor imports it, and would throw at
 * request time while `tsc` and `next build` both stayed green.
 *
 * None of these decides anything. The system-role guard, the cycle check, the
 * refusal to delete a role somebody still holds, and the rule that Enable All
 * skips destructive capabilities all live in `lib/data/roles.ts`, so the screen
 * and the write cannot disagree about what is allowed.
 *
 * Every one is gated on `settings.role.edit`. Editing who may do what is the
 * most consequential setting in the product: a caller who could reach these
 * without the capability could simply grant themselves the rest.
 */

function revalidateRoles() {
  revalidatePath("/settings/roles");
  revalidatePath("/settings/users");
}

const capSchema = z.object({
  role_id: z.string().uuid("Invalid role"),
  capability: z.string().min(1),
  on: z.boolean(),
});

export async function setCapabilityAction(
  input: unknown,
): Promise<{ error?: string }> {
  const denied = await requireCan("settings.role.edit");
  if (denied) return denied;
  const parsed = capSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const r = await setCapability(parsed.data.role_id, parsed.data.capability, parsed.data.on);
  if (!r.error) revalidateRoles();
  return r;
}

const groupSchema = z.object({
  role_id: z.string().uuid("Invalid role"),
  group: z.string().min(1),
  on: z.boolean(),
});

export async function setGroupAction(input: unknown): Promise<{ error?: string }> {
  const denied = await requireCan("settings.role.edit");
  if (denied) return denied;
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const r = await setGroup(parsed.data.role_id, parsed.data.group, parsed.data.on);
  if (!r.error) revalidateRoles();
  return r.error ? { error: r.error } : {};
}

const createSchema = z.object({
  name: z.string().min(1, "A role needs a name."),
  description: z.string().max(155, "Keep the description to 155 characters.").optional(),
  inherits_from: z.string().uuid().nullable().optional(),
});

export async function createRoleAction(input: unknown): Promise<{ id?: string; error?: string }> {
  const denied = await requireCan("settings.role.edit");
  if (denied) return denied;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const r = await createRole({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    inherits_from: parsed.data.inherits_from ?? null,
  });
  if (!r.error) revalidateRoles();
  return r;
}

const updateSchema = z.object({
  role_id: z.string().uuid("Invalid role"),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  /** `null` is a real choice: "inherits from nobody" is the top of the tree. */
  inherits_from: z.string().uuid().nullable().optional(),
});

export async function updateRoleAction(input: unknown): Promise<{ error?: string }> {
  const denied = await requireCan("settings.role.edit");
  if (denied) return denied;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { role_id, ...patch } = parsed.data;
  const r = await updateRole(role_id, patch);
  if (!r.error) revalidateRoles();
  return r;
}

export async function deleteRoleAction(input: unknown): Promise<{ error?: string }> {
  const denied = await requireCan("settings.role.edit");
  if (denied) return denied;
  const parsed = z.object({ role_id: z.string().uuid("Invalid role") }).safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const r = await deleteRole(parsed.data.role_id);
  if (!r.error) revalidateRoles();
  return r;
}
