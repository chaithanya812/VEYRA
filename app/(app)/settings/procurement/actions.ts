"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import {
  deletePaymentPlan,
  deletePoTerms,
  savePaymentPlan,
  savePoTerms,
} from "@/lib/data/po-config";
import { validateMilestones } from "@/lib/po-plan-model";

/** Procurement configuration actions. */
export type FormState = { error?: string; ok?: boolean } | undefined;

function refresh(): FormState {
  revalidatePath("/settings/procurement");
  revalidatePath("/orders/new");
  revalidatePath("/orders");
  return { ok: true };
}

function parseMilestones(
  raw: FormDataEntryValue | null,
): { label: string; pct: number }[] | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: "A payment plan needs at least one milestone." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "The milestone list could not be read — try again." };
  }
  if (!Array.isArray(parsed)) {
    return { error: "The milestone list could not be read — try again." };
  }
  return parsed.map((row) => {
    const rec = row as { label?: unknown; pct?: unknown };
    return {
      label: String(rec.label ?? ""),
      pct: Number(rec.pct),
    };
  });
}

export async function savePaymentPlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("settings.procurement.edit");
  if (denied) return denied;
  const milestones = parseMilestones(formData.get("milestones"));
  if ("error" in milestones) return { error: milestones.error };
  const check = validateMilestones(milestones);
  if (!check.ok) return { error: check.error };
  const r = await savePaymentPlan({
    name: String(formData.get("name") ?? ""),
    milestones,
  });
  return "error" in r && r.error ? { error: r.error } : refresh();
}

export async function deletePaymentPlanAction(formData: FormData): Promise<void> {
  if (!(await can("settings.procurement.edit"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deletePaymentPlan(id);
  revalidatePath("/settings/procurement");
  revalidatePath("/orders/new");
}

export async function savePoTermsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("settings.procurement.edit");
  if (denied) return denied;
  const r = await savePoTerms({
    id: String(formData.get("id") ?? "") || undefined,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    is_default: formData.get("is_default") === "on",
  });
  return r.error ? { error: r.error } : refresh();
}

export async function deletePoTermsAction(formData: FormData): Promise<void> {
  if (!(await can("settings.procurement.edit"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deletePoTerms(id);
  revalidatePath("/settings/procurement");
  revalidatePath("/orders/new");
}
