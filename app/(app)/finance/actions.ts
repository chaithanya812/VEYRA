"use server";

import { revalidatePath } from "next/cache";
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
