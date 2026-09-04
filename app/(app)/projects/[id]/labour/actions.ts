"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import {
  addLabourEntry,
  deleteLabourEntry,
  setLabourClientVisible,
  updateLabourEntry,
} from "@/lib/data/labour";

/**
 * Labour Report actions (PLAN-V4 §9.6, frame `105638`).
 *
 * Every one carries `project_id` and the data layer re-checks that the entry —
 * and the contract it names — belong to it. A labour day filed against another
 * project's contract would quietly cost the wrong job.
 */

export type LabourState = { error?: string; ok?: boolean; note?: string } | undefined;

function refresh(projectId: string, note?: string): LabourState {
  revalidatePath(`/projects/${projectId}/labour`);
  revalidatePath(`/projects/${projectId}`);
  // `client_visible` decides what the progress report carries.
  revalidatePath(`/projects/${projectId}/report`);
  return { ok: true, note };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function count(v: FormDataEntryValue | null): number {
  const n = Number(str(v) || 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function many(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/** `+ Attendance` (frame `105638`). */
export async function addAttendanceAction(
  _prev: LabourState,
  formData: FormData,
): Promise<LabourState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const file = formData.get("attachment");
  const attachment =
    file instanceof File && file.size > 0
      ? {
          fileName: file.name,
          mimeType: file.type || null,
          bytes: await file.arrayBuffer(),
        }
      : null;

  const r = await addLabourEntry({
    projectId,
    entryDate: str(formData.get("entry_date")),
    categories: many(formData, "categories"),
    vendorIds: many(formData, "vendors"),
    contractId: str(formData.get("contract_id")) || null,
    skilled: count(formData.get("skilled")),
    unskilled: count(formData.get("unskilled")),
    coordinator: count(formData.get("coordinator")),
    remark: str(formData.get("remark")) || null,
    clientVisible: str(formData.get("client_visible")) === "true",
    attachment,
  });

  // An entry that saved but whose attachment did not is a partial success, and
  // saying so beats either pretending it worked or throwing the day away.
  if (r.error && !r.id) return { error: r.error };
  return refresh(projectId, r.error ?? "Attendance recorded.");
}

export async function updateEntryAction(
  _prev: LabourState,
  formData: FormData,
): Promise<LabourState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return { error: "Missing labour entry." };

  const r = await updateLabourEntry(projectId, id, {
    entryDate: formData.has("entry_date") ? str(formData.get("entry_date")) : undefined,
    categories: formData.has("categories") ? many(formData, "categories") : undefined,
    vendorIds: formData.has("vendors") ? many(formData, "vendors") : undefined,
    contractId: formData.has("contract_id")
      ? str(formData.get("contract_id")) || null
      : undefined,
    skilled: formData.has("skilled") ? count(formData.get("skilled")) : undefined,
    unskilled: formData.has("unskilled") ? count(formData.get("unskilled")) : undefined,
    coordinator: formData.has("coordinator") ? count(formData.get("coordinator")) : undefined,
    remark: formData.has("remark") ? str(formData.get("remark")) || null : undefined,
    clientVisible: formData.has("client_visible")
      ? str(formData.get("client_visible")) === "true"
      : undefined,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

/** The per-row VISIBLE / HIDDEN switch, and the bulk version of it. */
export async function setLabourVisibilityAction(
  _prev: LabourState,
  formData: FormData,
): Promise<LabourState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const ids = many(formData, "ids");
  if (ids.length === 0) return { error: "Select at least one day." };

  const visible = str(formData.get("visible")) === "true";
  const r = await setLabourClientVisible(projectId, ids, visible);
  if (r.changed === 0) return { error: r.error ?? "Nothing changed." };

  const what = `${r.changed} ${r.changed === 1 ? "day" : "days"} ${
    visible ? "shared with the client" : "hidden from the client"
  }.`;
  return refresh(projectId, r.error ? `${what} ${r.error}` : what);
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  if (!(await can("projects.project.edit"))) return;
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return;
  await deleteLabourEntry(projectId, id);
  refresh(projectId);
}
