"use server";

import { revalidatePath } from "next/cache";
import {
  deleteTerms,
  saveQuotationSettings,
  saveTerms,
} from "@/lib/data/quotation-studio";

/** Quotation configuration actions. */
export type FormState = { error?: string; ok?: boolean } | undefined;

function refresh(): FormState {
  revalidatePath("/settings/quotations");
  revalidatePath("/quotations");
  return { ok: true };
}

export async function saveQuotationSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const r = await saveQuotationSettings({
    default_gst_pct: Number(formData.get("default_gst_pct")),
    default_margin_pct: Number(formData.get("default_margin_pct")),
    default_validity_days: Number(formData.get("default_validity_days")),
    footer_note: String(formData.get("footer_note") ?? ""),
    show_cost_column: String(formData.get("show_cost_column")) === "on",
  });
  return r.error ? { error: r.error } : refresh();
}

export async function saveTermsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const r = await saveTerms({
    id: String(formData.get("id") ?? "") || undefined,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    is_default: formData.get("is_default") === "on",
  });
  return r.error ? { error: r.error } : refresh();
}

export async function deleteTermsAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteTerms(id);
  revalidatePath("/settings/quotations");
}
