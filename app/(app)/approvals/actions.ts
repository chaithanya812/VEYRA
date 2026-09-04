"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APPROVAL_MODULES } from "@/lib/approvals-model";
import {
  createRequest,
  approveRequest,
  rejectRequest,
  upsertRule,
} from "@/lib/data/approvals";

/** A decision/rule write invalidates both approvals surfaces. */
function revalidateApprovals() {
  revalidatePath("/approvals");
  revalidatePath("/approvals/rules");
}

const createSchema = z.object({
  module: z.enum(APPROVAL_MODULES),
  entity_id: z.string().uuid("Invalid entity").optional(),
  entity_label: z.string().trim().max(200).optional(),
  amount: z.coerce
    .number()
    .min(0, "Amount cannot be negative")
    .max(9_999_999_999_999.99, "Amount is too large"),
});

export async function createRequestAction(
  input: unknown,
): Promise<{ id?: string; error?: string }> {
  const denied = await requireCan("procurement.mr.create");
  if (denied) return denied;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await createRequest(parsed.data);
  if (!result.error) revalidateApprovals();
  return result;
}

const decideSchema = z.object({
  id: z.string().uuid("Invalid request"),
  comment: z.string().trim().max(2000).optional(),
});

export async function approveRequestAction(
  input: unknown,
): Promise<{ error?: string }> {
  const denied = await requireCan("procurement.mr.approve");
  if (denied) return denied;
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await approveRequest(parsed.data.id, parsed.data.comment);
  if (!result.error) revalidateApprovals();
  return result;
}

const rejectSchema = z.object({
  id: z.string().uuid("Invalid request"),
  comment: z
    .string()
    .trim()
    .min(1, "A comment is required when rejecting")
    .max(2000, "Keep the comment under 2000 characters"),
});

export async function rejectRequestAction(
  input: unknown,
): Promise<{ error?: string }> {
  const denied = await requireCan("procurement.mr.approve");
  if (denied) return denied;
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await rejectRequest(parsed.data.id, parsed.data.comment);
  if (!result.error) revalidateApprovals();
  return result;
}

const ruleSchema = z.object({
  module: z.enum(APPROVAL_MODULES),
  threshold_amount: z.coerce
    .number()
    .min(0, "Threshold cannot be negative")
    .max(9_999_999_999_999.99, "Threshold is too large"),
  approver_role: z.string().trim().max(80).optional(),
  is_active: z.boolean().optional(),
});

export async function upsertRuleAction(
  input: unknown,
): Promise<{ error?: string }> {
  const denied = await requireCan("settings.workspace.edit");
  if (denied) return denied;
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await upsertRule(parsed.data);
  if (!result.error) revalidateApprovals();
  return result;
}
