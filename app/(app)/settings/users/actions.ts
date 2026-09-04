"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setMemberManager, setMemberStatus } from "@/lib/data/team";

/**
 * `/settings/users` server actions. ASYNC FUNCTIONS ONLY — an exported const
 * here would be a client reference the moment the table imports it, and would
 * throw at request time while `tsc` and `next build` both stayed green. The
 * vocabulary these actions validate against lives in `lib/workspace-model.ts`.
 *
 * Neither action decides anything. Every rule — the org-config tier, the
 * same-org manager, the cycle guard, the refusal to deactivate somebody who
 * still has reports — lives in `lib/data/team.ts`, so the screen and the write
 * cannot disagree about what is allowed.
 */

/** A settings write invalidates the surfaces that show the same people. */
function revalidateUsers() {
  revalidatePath("/settings/users");
  revalidatePath("/settings/workspace");
}

const managerSchema = z.object({
  member_id: z.string().uuid("Invalid member"),
  /** `null` is a real choice: "reports to nobody" is the top of the tree. */
  manager_id: z.string().uuid("Invalid manager").nullable(),
});

export async function setManagerAction(
  input: unknown,
): Promise<{ error?: string }> {
  const denied = await requireCan("settings.user.edit");
  if (denied) return denied;
  const parsed = managerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await setMemberManager(parsed.data.member_id, parsed.data.manager_id);
  if (!result.error) revalidateUsers();
  return result;
}

const statusSchema = z.object({
  member_id: z.string().uuid("Invalid member"),
  status: z.enum(["active", "disabled"]),
});

export async function setMemberStatusAction(
  input: unknown,
): Promise<{ error?: string }> {
  const denied = await requireCan("settings.user.edit");
  if (denied) return denied;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await setMemberStatus(parsed.data.member_id, parsed.data.status);
  if (!result.error) revalidateUsers();
  return result;
}
