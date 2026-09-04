"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { decideExpense } from "@/lib/data/workspace";
import { recordPettyEntry, reversePettyEntry } from "@/lib/data/petty-finance";
import { EXPENSE_STATUSES } from "@/lib/workspace-model";

/**
 * Petty Finance server actions — frame `110521`.
 *
 * The split here is the whole permission argument of this screen, so it is
 * worth stating: **filing your own petty entry is ungated; touching somebody
 * else's is not.**
 *
 * `recordPettyEntryAction` writes `member_id` from the acting context and
 * never from the form, so the only row it can create is the caller's own.
 * Gating it would mean a site supervisor could not tell the company what they
 * spent their own cash on — HANDOFF-V8 §5a, and `lib/can-coverage.test.ts`
 * asserts the exemption list stays honest.
 *
 * Reversing an entry and deciding a claim both act on other people's money and
 * carry `billing.payment.approve` as their first statement.
 */

export type FormState = { error?: string; ok?: boolean } | undefined;

const done = (): FormState => ({ ok: true });
const fail = (error: string): FormState => ({ error });

/**
 * SELF-SERVICE — deliberately ungated (§5a). Do not add a `can()` here: the
 * row is always the caller's own, and a guard would lock a member out of
 * claiming back money they have already spent.
 */
export async function recordPettyEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const r = await recordPettyEntry({
    kind: String(formData.get("kind") ?? "expense"),
    spent_on: String(formData.get("spent_on") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    category: String(formData.get("category") ?? "other"),
    project_id: String(formData.get("project_id") ?? ""),
    remark: String(formData.get("remark") ?? ""),
  });
  if (r.error) return fail(r.error);
  revalidatePath("/finance/petty");
  return done();
}

export async function reversePettyEntryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("billing.payment.approve");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return fail("Nothing to reverse.");
  const r = await reversePettyEntry(id);
  if (r.error) return fail(r.error);
  revalidatePath("/finance/petty");
  return done();
}

export async function decidePettyClaimAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("billing.payment.approve");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  if (
    !id ||
    !(EXPENSE_STATUSES as readonly string[]).includes(decision) ||
    decision === "submitted"
  ) {
    return fail("Invalid decision.");
  }
  const r = await decideExpense(
    id,
    decision as Exclude<(typeof EXPENSE_STATUSES)[number], "submitted">,
    String(formData.get("note") ?? ""),
  );
  if (r.error) return fail(r.error);
  revalidatePath("/finance/petty");
  return done();
}
