"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { addLedgerEntry, reverseLedgerEntry } from "@/lib/data/finance";
import type { LedgerSide } from "@/lib/payments-ledger-model";

/**
 * Project Payments actions (PLAN-V4 §9.4).
 *
 * ⛔ THERE IS NO DELETE ACTION IN THIS FILE, AND THERE MUST NEVER BE ONE.
 * Ledgers are append-only (HARD RULE 4): a mistake is corrected by a reversing
 * entry that stays in the record beside the thing it corrects. `105403` shows
 * reversed transactions behind a checkbox — a filter, never a bin.
 */

export type PayState = { error?: string; ok?: boolean } | undefined;

function refresh(projectId: string): PayState {
  revalidatePath(`/projects/${projectId}/payments`);
  revalidatePath(`/projects/${projectId}/finance`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finance");
  return { ok: true };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export async function addEntryAction(
  _prev: PayState,
  formData: FormData,
): Promise<PayState> {
  const denied = await requireCan("billing.payment.create");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const side: LedgerSide = str(formData.get("side")) === "funds" ? "funds" : "expenses";
  const amount = Number(str(formData.get("amount")));

  const r = await addLedgerEntry({
    projectId,
    side,
    amount: Number.isFinite(amount) ? amount : 0,
    paidOn: str(formData.get("paid_on")) || null,
    contractId: str(formData.get("contract_id")) || null,
    milestoneId: str(formData.get("milestone_id")) || null,
    vendorId: str(formData.get("vendor_id")) || null,
    memberId: str(formData.get("member_id")) || null,
    mode: str(formData.get("mode")) || null,
    expenseType: str(formData.get("expense_type")) || null,
    category: str(formData.get("category")) || null,
    reference: str(formData.get("reference")) || null,
    note: str(formData.get("note")) || null,
    stockInRequested: formData.get("stock_in_requested") === "on",
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

/** Correct an entry by appending its opposite. Nothing is removed. */
export async function reverseEntryAction(
  _prev: PayState,
  formData: FormData,
): Promise<PayState> {
  const denied = await requireCan("billing.payment.approve");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return { error: "Missing entry." };

  const r = await reverseLedgerEntry(id);
  return r.error ? { error: r.error } : refresh(projectId);
}
