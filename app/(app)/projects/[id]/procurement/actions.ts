"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import {
  createProjectRequest,
  deleteProjectRequest,
  setItemStages,
  type NewRequestLine,
} from "@/lib/data/project-procurement";
import {
  MR_ITEM_STAGES,
  type MRItemStage,
} from "@/lib/material-requests-model";

/**
 * Project Procurement actions (PLAN-V4 §9.7).
 *
 * The only status write here moves LINE ITEMS. There is deliberately no
 * "advance this request" action: a request of thirteen items does not have a
 * stage, and an action that pretended otherwise would re-stamp lines somebody
 * has already dealt with (migration 0036's header).
 */

export type ProcState = { error?: string; ok?: boolean; note?: string } | undefined;

function refresh(projectId: string, note?: string): ProcState {
  revalidatePath(`/projects/${projectId}/procurement`);
  revalidatePath(`/projects/${projectId}`);
  // The company-wide screens read the same rows.
  revalidatePath("/procurement");
  return { ok: true, note };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

/**
 * `Raise Request` (frames `105729` / `105800`).
 *
 * The frame's wizard says `Next`, not `Create` — details, then line items — so
 * the lines arrive as JSON the browser composed. The server re-reads every
 * field: a browser is a place to compose a request, never a place to trust one
 * from.
 */
export async function createRequestAction(
  _prev: ProcState,
  formData: FormData,
): Promise<ProcState> {
  const denied = await requireCan("procurement.mr.create");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  let parsed: unknown = [];
  try {
    parsed = JSON.parse(str(formData.get("lines")) || "[]");
  } catch {
    return { error: "Could not read the line items." };
  }
  if (!Array.isArray(parsed)) return { error: "Could not read the line items." };

  const lines: NewRequestLine[] = parsed
    .map((raw) => {
      const l = (raw ?? {}) as Record<string, unknown>;
      return {
        item_id: l.item_id ? String(l.item_id) : null,
        item_name: String(l.item_name ?? "").trim(),
        uom: l.uom ? String(l.uom) : null,
        // Quantities are typed by a person. Nothing on this path may invent one.
        qty: Number(l.qty) || 0,
        remarks: l.remarks ? String(l.remarks) : null,
      };
    })
    .filter((l) => l.item_name);

  if (lines.length === 0) {
    return { error: "A request needs at least one line item." };
  }

  const r = await createProjectRequest({
    projectId,
    title: str(formData.get("title")),
    requestType: str(formData.get("request_type")) || "material",
    expectedDelivery: str(formData.get("expected_delivery")) || null,
    remarks: str(formData.get("remarks")) || null,
    lines,
  });
  if (r.error) return { error: r.error };

  return refresh(
    projectId,
    r.number ? `Raised ${r.number}.` : "Request raised (no numbering series set).",
  );
}

/** Move one line, or several, to a new stage. */
export async function setStageAction(
  _prev: ProcState,
  formData: FormData,
): Promise<ProcState> {
  const denied = await requireCan("procurement.mr.approve");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const stage = str(formData.get("stage"));
  if (!(MR_ITEM_STAGES as readonly string[]).includes(stage)) {
    return { error: "That is not a line stage." };
  }

  const ids = formData
    .getAll("item_ids")
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  if (ids.length === 0) return { error: "Select at least one line." };

  const r = await setItemStages(projectId, ids, stage as MRItemStage);
  if (r.changed === 0) return { error: r.error ?? "Nothing changed." };
  return refresh(
    projectId,
    `${r.changed} ${r.changed === 1 ? "line" : "lines"} moved.`,
  );
}

export async function deleteRequestAction(formData: FormData): Promise<void> {
  if (!(await can("procurement.mr.delete"))) return;
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return;
  await deleteProjectRequest(projectId, id);
  refresh(projectId);
}
