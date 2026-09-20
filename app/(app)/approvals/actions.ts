"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APPROVAL_MODULES } from "@/lib/approvals-model";
import {
  createRequest,
  approveRequest,
  rejectRequest,
  upsertRule,
  getRequest,
} from "@/lib/data/approvals";
import { markPoCreatedIfDraft } from "@/lib/data/purchase-orders";

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
  if (!result.error) {
    // D5: a procurement approval issues the PO (draft → created). The
    // approval already landed; a PO-state miss must not look like a
    // failed decision.
    const req = await getRequest(parsed.data.id);
    if (req?.module === "procurement" && req.entity_id) {
      // ISSUING the PO is a separate grant from deciding the request.
      // This screen guards on procurement.mr.approve because it was built
      // for material requests; approving now also moves a PO draft →
      // created, which is what procurement.po.approve governs. The four
      // built-in tiers grant both together, but an org-authored role can
      // hold MR approval alone — and that must not become the power to
      // issue purchase orders. Without the grant the decision still
      // stands and the PO simply stays draft, to be issued on /orders.
      if (await can("procurement.po.approve")) {
        // Best-effort: the approval already committed. If the PO cannot
        // move, it stays draft and can be issued by hand on /orders.
        await markPoCreatedIfDraft(req.entity_id);
        revalidatePath(`/orders/${req.entity_id}`);
      }
    }
    revalidateApprovals();
    revalidatePath("/orders");
  }
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
  if (!result.error) {
    // Reject leaves the PO as draft — the person can still revise it.
    revalidateApprovals();
    revalidatePath("/orders");
  }
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
