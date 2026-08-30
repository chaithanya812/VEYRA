"use server";

import { revalidatePath } from "next/cache";
import { proposeMilestones } from "@/lib/ai/smartplan";
import { isAiConfigured, type AiAttachment } from "@/lib/ai/provider";
import { logAiRequest } from "@/lib/data/quotation-studio";
import { applySmartPlan } from "@/lib/data/project-milestones";
import { MAX_STEPS, datePlan, type DatedStep } from "@/lib/smartplan-model";

/**
 * SmartPlan (PLAN-V4 §9.2 — the `SmartPlan` button on each scope band in
 * `105010`).
 *
 * **Two actions, deliberately.** Generating proposes; applying writes. Nothing
 * reaches `project_milestones` until a person has read the draft, edited what
 * they disagree with and pressed the button — which is what "present as a
 * reviewable draft" in the plan means, and the only responsible way to let a
 * model near a delivery schedule.
 *
 * The model supplies names, day offsets and an order. `datePlan()` turns those
 * into dates from a start date the user picked; `parseSmartPlan()` has already
 * dropped anything price-, rate- or quantity-shaped. No number that costs
 * money passes through here (HARD RULE 2).
 *
 * Both actions log to `ai_requests` — what was asked, which model answered, and
 * how many milestones it actually produced — so AI behaviour stays reviewable
 * after the fact. It is not metered: SmartPlan is not a BOQ and must not spend
 * a tenant's BOQ allowance. Metering the remaining AI paths is §11.4.
 */

export interface SmartPlanDraft {
  scopeGroup: string;
  scopeItemId: string | null;
  startDate: string;
  note: string | null;
  steps: DatedStep[];
}

export type SmartPlanState =
  | { error?: string; draft?: SmartPlanDraft; created?: number }
  | undefined;

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function refresh(projectId: string): void {
  revalidatePath(`/projects/${projectId}/plan`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/report`);
  revalidatePath("/projects");
}

/** Attachment ceilings — the provider inlines base64, so keep this modest. */
const MAX_FILES = 3;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

async function readAttachments(formData: FormData): Promise<AiAttachment[]> {
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  const out: AiAttachment[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    // A skipped attachment must not cost the user their whole request.
    if (file.size === 0 || file.size > MAX_BYTES) continue;
    if (!ALLOWED.includes(file.type)) continue;
    out.push({
      mimeType: file.type,
      dataBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      name: file.name,
    });
  }
  return out;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Propose a plan. **Writes nothing** — the draft comes back for review. */
export async function smartPlanAction(
  _prev: SmartPlanState,
  formData: FormData,
): Promise<SmartPlanState> {
  const projectId = str(formData.get("project_id"));
  const scopeGroup = str(formData.get("scope_group"));
  const startDate = str(formData.get("start_date"));
  if (!projectId) return { error: "Missing project." };
  if (!scopeGroup) return { error: "Name the scope group this plan covers." };
  if (!ISO_DAY.test(startDate)) return { error: "Pick a start date." };

  if (!isAiConfigured()) {
    return { error: "AI is not configured on this server yet." };
  }

  const brief = str(formData.get("brief"));
  const horizon = Number(formData.get("horizon_days"));
  const existing = str(formData.get("existing"))
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const attachments = await readAttachments(formData);

  const result = await proposeMilestones({
    scopeGroup,
    projectName: str(formData.get("project_name")),
    brief,
    horizonDays: Number.isFinite(horizon) && horizon > 0 ? horizon : null,
    existing,
    attachments,
  });

  if ("error" in result) {
    await logAiRequest({
      kind: "smartplan",
      prompt: `${scopeGroup}: ${brief}`,
      attachments: attachments.length,
      status: "error",
      errorMessage: result.error,
      refId: projectId,
    });
    return { error: result.error };
  }

  const { dated, error } = datePlan(result.plan.steps, startDate);
  if (error) return { error };

  await logAiRequest({
    kind: "smartplan",
    prompt: `${scopeGroup}: ${brief}`,
    attachments: attachments.length,
    status: "ok",
    linesCreated: dated.length,
    refId: projectId,
  });

  return {
    draft: {
      scopeGroup,
      scopeItemId: str(formData.get("scope_item_id")) || null,
      startDate,
      note: result.plan.note,
      steps: dated,
    },
  };
}

/**
 * Write the accepted draft.
 *
 * The steps arrive as JSON the user may have edited in the browser, so every
 * field is re-validated here. A client is a place to compose a request, never a
 * place to trust one from.
 */
export async function applySmartPlanAction(
  _prev: SmartPlanState,
  formData: FormData,
): Promise<SmartPlanState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(str(formData.get("steps")) || "[]");
  } catch {
    return { error: "Could not read the edited plan." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "Nothing selected to add." };
  }
  if (parsed.length > MAX_STEPS) {
    return { error: `A plan of more than ${MAX_STEPS} milestones is not accepted.` };
  }

  const steps: {
    name: string;
    plannedStart: string;
    plannedEnd: string;
    dependsOn: number[];
  }[] = [];

  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    const from = String(r.plannedStart ?? "").slice(0, 10);
    const to = String(r.plannedEnd ?? "").slice(0, 10);
    if (!name) return { error: "Every milestone needs a name." };
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) {
      return { error: `Check the dates on "${name}".` };
    }
    if (to < from) return { error: `"${name}" ends before it starts.` };

    const here = steps.length;
    const dependsOn = Array.isArray(r.dependsOn)
      ? [
          ...new Set(
            r.dependsOn
              .map((d) => Math.trunc(Number(d)))
              // Only backwards, never onto a row the user removed.
              .filter((d) => Number.isFinite(d) && d >= 0 && d < here),
          ),
        ]
      : [];

    steps.push({ name: name.slice(0, 120), plannedStart: from, plannedEnd: to, dependsOn });
  }

  if (steps.length === 0) return { error: "Nothing selected to add." };

  const r = await applySmartPlan({
    projectId,
    scopeItemId: str(formData.get("scope_item_id")) || null,
    steps,
  });
  if (r.error) return { error: r.error };

  refresh(projectId);
  return { created: r.created };
}
