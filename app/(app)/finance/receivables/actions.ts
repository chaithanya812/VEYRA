"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { restoreMilestone, writeOffMilestone } from "@/lib/data/receivables";

/**
 * Account Receivables server actions — frame `110534`.
 *
 * There are only two, and both act on somebody else's money, so both carry
 * `billing.payment.approve` as their FIRST statement (HANDOFF-V8 §5a). Nothing
 * on this screen is self-service: a receivable belongs to the firm, never to
 * the person looking at it, so the ungated exemption does not apply here the
 * way it does to a member's own petty expense.
 *
 * Writing a milestone off does not delete it and does not zero it. It records
 * a decision — who, when, why — on top of a row that keeps its full value, and
 * migration 0042's CHECK makes a reasonless write-off impossible in the
 * database rather than merely discouraged in this file.
 */

export type FormState = { error?: string; ok?: boolean } | undefined;

const done = (): FormState => ({ ok: true });
const fail = (error: string): FormState => ({ error });

export async function writeOffMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("billing.payment.approve");
  if (denied) return denied;
  const r = await writeOffMilestone({
    milestoneId: String(formData.get("milestone_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (r.error) return fail(r.error);
  revalidatePath("/finance/receivables");
  return done();
}

export async function restoreMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("billing.payment.approve");
  if (denied) return denied;
  const r = await restoreMilestone(String(formData.get("milestone_id") ?? ""));
  if (r.error) return fail(r.error);
  revalidatePath("/finance/receivables");
  return done();
}
