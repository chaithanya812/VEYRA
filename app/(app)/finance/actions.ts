"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { deleteSavedView, saveView } from "@/lib/data/saved-views";
import { recordUsage } from "@/lib/data/subscription";
import { findSavedViewScreen } from "@/lib/saved-views-model";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createContract,
  toggleMilestoneWorkDone,
  recordPayment,
  CONTRACT_SOURCES,
  PAYMENT_DIRECTIONS,
  milestonesFoot,
} from "@/lib/data/finance";
import type { ContractSource, PaymentDirection } from "@/lib/finance-model";

const milestoneSchema = z.object({
  seq: z.number().int().min(1),
  name: z.string().min(1, "Milestone name is required"),
  pct: z.number().min(0),
  amount: z.number().min(0),
  tentative_due: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  project_label: z.string().optional(),
  source: z.enum(CONTRACT_SOURCES),
  amount: z.string().optional(),
  milestones: z.string().optional(),
});

export async function createContractAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const denied = await requireCan("billing.payment.create");
  if (denied) return denied;
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    project_label: formData.get("project_label") || undefined,
    source: formData.get("source"),
    amount: formData.get("amount") || undefined,
    milestones: formData.get("milestones") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Milestone rows arrive as JSON from the live table in the form.
  let msInput: {
    seq: number;
    name: string;
    pct: number;
    amount: number;
    tentative_due?: string;
  }[] = [];
  if (parsed.data.milestones) {
    try {
      msInput = JSON.parse(parsed.data.milestones);
    } catch {
      return { error: "Invalid milestone data" };
    }
    for (const m of msInput) {
      const check = milestoneSchema.safeParse(m);
      if (!check.success) {
        return { error: check.error.issues[0]?.message ?? "Invalid milestone" };
      }
    }
    // Σpct must total 100% (±0.01) — same rule the form footer shows live.
    if (!milestonesFoot(msInput).ok) {
      return { error: "Milestone percentages must total 100%." };
    }
  }

  const amount = parsed.data.amount ? Number(parsed.data.amount) : 0;
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Amount must be a positive number" };
  }

  const result = await createContract({
    name: parsed.data.name,
    project_label: parsed.data.project_label ?? null,
    amount,
    source: parsed.data.source as ContractSource,
    milestones: msInput.map((m, i) => ({
      seq: m.seq || i + 1,
      name: m.name,
      pct: m.pct,
      amount: m.amount ?? 0,
      tentative_due: m.tentative_due || null,
    })),
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/finance");
  redirect(`/finance/${result.id}`);
}

export async function toggleMilestoneAction(
  milestoneId: string,
  done: boolean,
  contractId: string,
): Promise<{ error?: string }> {
  const denied = await requireCan("billing.payment.create");
  if (denied) return denied;
  const result = await toggleMilestoneWorkDone(milestoneId, done);
  if (result.error) return { error: result.error };
  revalidatePath(`/finance/${contractId}`);
  revalidatePath("/finance");
  return {};
}

const paymentSchema = z.object({
  contract_id: z.string().optional(),
  milestone_id: z.string().optional(),
  project_label: z.string().optional(),
  direction: z.enum(PAYMENT_DIRECTIONS),
  amount: z.string().min(1, "Amount is required"),
  mode: z.string().optional(),
  paid_on: z.string().optional(),
  reference: z.string().optional(),
  note: z.string().optional(),
});

export async function recordPaymentAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const denied = await requireCan("billing.payment.create");
  if (denied) return denied;
  const parsed = paymentSchema.safeParse({
    contract_id: formData.get("contract_id") || undefined,
    milestone_id: formData.get("milestone_id") || undefined,
    project_label: formData.get("project_label") || undefined,
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    mode: formData.get("mode") || undefined,
    paid_on: formData.get("paid_on") || undefined,
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be greater than zero" };
  }

  const result = await recordPayment({
    contract_id: parsed.data.contract_id ?? null,
    milestone_id: parsed.data.milestone_id ?? null,
    project_label: parsed.data.project_label ?? null,
    direction: parsed.data.direction as PaymentDirection,
    amount,
    mode: parsed.data.mode ?? null,
    paid_on: parsed.data.paid_on ?? null,
    reference: parsed.data.reference ?? null,
    note: parsed.data.note ?? null,
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/finance");
  if (parsed.data.contract_id) {
    revalidatePath(`/finance/${parsed.data.contract_id}`);
  }
  return {};
}

/* ════════════════════════════════════════════════════════════════════════════
 * SAVED VIEWS · COLUMN CHOOSER · CSV EXPORT — HANDOFF-V8 Part 4 Unit 2
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ THE PERMISSION DECISION, STATED RATHER THAN ASSUMED.
 *
 * These three actions are GATED, not added to the §5a self-service list.
 *
 * The self-service exemptions exist so a member is never locked out of their
 * OWN records — their attendance, their leave, their expense claim. A saved
 * view is not one of those: it is a preference on a screen the person can only
 * reach if that screen's own `can()` is already true. Gating it therefore
 * locks NOBODY out who can see the screen, while making sure a member refused
 * `/finance/payments` cannot save, delete or meter a view of it. That is
 * strictly the safer of the two readings, and it needs no change to the closed
 * exemption list.
 *
 * ⚠ THE GUARD IS A LITERAL, AND IT IS THE FIRST STATEMENT. Reading the screen
 * out of the form first, in order to look its capability up, would put a parse
 * BEFORE the permission check — which leaks which inputs are valid to somebody
 * with no right to ask, and `lib/can-coverage.test.ts` rightly fails it. So
 * the capability is written out here, and `lib/saved-views-model.test.ts`
 * asserts every screen in the registry declares exactly this key. A screen
 * registered under a different capability fails the suite loudly instead of
 * shipping under-gated on this one.
 */

export type SavedViewState = { error?: string; ok?: boolean } | undefined;

/** The capability every registered saved-view screen is gated on. */
const SAVED_VIEW_CAPABILITY = "billing.payment.view";

export async function saveViewAction(
  _prev: SavedViewState,
  formData: FormData,
): Promise<SavedViewState> {
  const denied = await requireCan("billing.payment.view");
  if (denied) return denied;

  const screen = findSavedViewScreen(String(formData.get("screen") ?? ""));
  if (!screen || screen.capability !== SAVED_VIEW_CAPABILITY) {
    return { error: "Unknown screen." };
  }
  const r = await saveView({
    screen,
    name: String(formData.get("name") ?? ""),
    rawQuery: String(formData.get("q") ?? ""),
  });
  if (r.error) return { error: r.error };
  revalidatePath(screen.path);
  return { ok: true };
}

export async function deleteViewAction(
  _prev: SavedViewState,
  formData: FormData,
): Promise<SavedViewState> {
  const denied = await requireCan("billing.payment.view");
  if (denied) return denied;

  const screen = findSavedViewScreen(String(formData.get("screen") ?? ""));
  if (!screen || screen.capability !== SAVED_VIEW_CAPABILITY) {
    return { error: "Unknown screen." };
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Nothing to delete." };
  const r = await deleteSavedView(screen, id);
  if (r.error) return { error: r.error };
  revalidatePath(screen.path);
  return { ok: true };
}

/**
 * Meter one CSV export.
 *
 * The rows are serialised in the browser from what the server already sent, so
 * this action moves NO data — it exists so the export cannot become a second
 * read path that bypasses `can()`. A member refused the screen is refused here
 * too, and the `exports` usage metric (`lib/subscription-model.ts`, previously
 * only partly wired) finally gets a real caller.
 */
export async function meterExportAction(
  screenKey: string,
  rows: number,
): Promise<{ error?: string }> {
  const denied = await requireCan("billing.payment.view");
  if (denied) return { error: denied.error };

  const screen = findSavedViewScreen(screenKey);
  if (!screen || screen.capability !== SAVED_VIEW_CAPABILITY) {
    return { error: "Unknown screen." };
  }
  if (!Number.isFinite(rows) || rows <= 0) return {};
  return recordUsage("exports", 1, screen.key);
}
