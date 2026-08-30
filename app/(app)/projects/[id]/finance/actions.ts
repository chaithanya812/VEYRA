"use server";

import { revalidatePath } from "next/cache";
import {
  createProjectContract,
  deleteContract,
  recordPayment,
  saveSchedule,
  setContractCategories,
  updateContractDetails,
} from "@/lib/data/finance";
import type { ContractSource } from "@/lib/finance-model";

/**
 * Financial Planning actions (PLAN-V4 §9.3).
 *
 * These write to `contracts` / `milestones` / `payments` — the same rows the
 * company-wide finance screens and Account Receivables read. There is no
 * project-private copy, so a schedule planned here IS the schedule that gets
 * aged later.
 *
 * Every amount arriving here is typed by a person or computed by
 * `lib/finance-model.ts`. Nothing on this path may come from a model.
 */

export type FinState = { error?: string; ok?: boolean } | undefined;

function refresh(projectId: string): FinState {
  revalidatePath(`/projects/${projectId}/finance`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finance");
  return { ok: true };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function money(v: FormDataEntryValue | null): number {
  const n = Number(str(v));
  return Number.isFinite(n) ? n : 0;
}

export async function addContractAction(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const source: ContractSource = str(formData.get("source")) === "vendor" ? "vendor" : "client";
  const r = await createProjectContract({
    projectId,
    source,
    name: str(formData.get("name")),
    amount: money(formData.get("amount")),
    // Blank vendor is the "Unlisted Vendor / Miscellaneous" row, not an error.
    vendorId: str(formData.get("vendor_id")) || null,
    categories: formData.getAll("categories").map((c) => String(c)),
    notes: str(formData.get("notes")) || null,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function updateContractAction(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return { error: "Missing contract." };

  const r = await updateContractDetails(id, {
    name: formData.has("name") ? str(formData.get("name")) : undefined,
    amount: formData.has("amount") ? money(formData.get("amount")) : undefined,
    vendorId: formData.has("vendor_id") ? str(formData.get("vendor_id")) || null : undefined,
    notes: formData.has("notes") ? str(formData.get("notes")) || null : undefined,
  });
  if (r.error) return { error: r.error };

  if (formData.has("categories")) {
    const c = await setContractCategories(
      id,
      formData.getAll("categories").map((x) => String(x)),
    );
    if (c.error) return { error: c.error };
  }
  return refresh(projectId);
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return;
  await deleteContract(id);
  refresh(projectId);
}

/**
 * Save a payment schedule.
 *
 * The rows arrive as JSON the user edited in the browser, so the server
 * re-validates every field and re-checks the 100% rule. A browser is a place
 * to compose a request, never a place to trust one from.
 */
export async function saveScheduleAction(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  const projectId = str(formData.get("project_id"));
  const contractId = str(formData.get("contract_id"));
  if (!projectId || !contractId) return { error: "Missing contract." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(str(formData.get("rows")) || "[]");
  } catch {
    return { error: "Could not read the edited schedule." };
  }
  if (!Array.isArray(parsed)) return { error: "Could not read the edited schedule." };

  const rows = parsed.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: r.id ? String(r.id) : null,
      name: String(r.name ?? ""),
      pct: Number(r.pct) || 0,
      amount: Number(r.amount) || 0,
      tentative_due: r.tentative_due ? String(r.tentative_due).slice(0, 10) : null,
      work_done: !!r.work_done,
      actual_due: r.actual_due ? String(r.actual_due).slice(0, 10) : null,
    };
  });

  const r = await saveSchedule(contractId, rows);
  return r.error ? { error: r.error } : refresh(projectId);
}

/**
 * Record cash against a contract.
 *
 * `direction` follows the contract's own side: money against a client contract
 * comes in, money against a vendor contract goes out. Letting the user choose
 * would allow an inflow on a vendor contract, which is not a transaction — it
 * is a typo that silently corrupts the project's cash flow.
 */
export async function recordPaymentAction(
  _prev: FinState,
  formData: FormData,
): Promise<FinState> {
  const projectId = str(formData.get("project_id"));
  const contractId = str(formData.get("contract_id"));
  if (!projectId || !contractId) return { error: "Missing contract." };

  const amount = money(formData.get("amount"));
  if (amount <= 0) return { error: "Enter an amount greater than zero." };

  const r = await recordPayment({
    contract_id: contractId,
    milestone_id: str(formData.get("milestone_id")) || null,
    direction: str(formData.get("source")) === "vendor" ? "outflow" : "inflow",
    amount,
    mode: str(formData.get("mode")) || null,
    paid_on: str(formData.get("paid_on")) || null,
    reference: str(formData.get("reference")) || null,
    note: str(formData.get("note")) || null,
  });
  return "error" in r ? { error: r.error } : refresh(projectId);
}
