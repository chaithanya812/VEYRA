"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import {
  addSitePhotoComment,
  deleteSitePhoto,
  deleteSitePhotos,
  setPhotosClientVisible,
  updateSitePhoto,
  uploadSitePhotos,
} from "@/lib/data/site-photos";
import { setCommentStatus } from "@/lib/data/project-files";
import type { CommentStatus } from "@/lib/comments-model";

/**
 * Site Progress actions (PLAN-V4 §9.5, frame `105527`).
 *
 * Every one carries `project_id`, and the data layer re-checks that the photo
 * belongs to it before touching anything. That is not ceremony: the project id
 * decides where the bytes live and which grid can see them, so a wrong one
 * would file a client's site photo under somebody else's project.
 */

export type SiteState = { error?: string; ok?: boolean; note?: string } | undefined;

function refresh(projectId: string, note?: string): SiteState {
  revalidatePath(`/projects/${projectId}/site`);
  revalidatePath(`/projects/${projectId}`);
  // `client_visible` is what the report counts, so a change here changes what
  // the client would receive. Leaving that page stale is how the two disagree.
  revalidatePath(`/projects/${projectId}/report`);
  return { ok: true, note };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function ids(formData: FormData): string[] {
  return formData
    .getAll("ids")
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/**
 * `+ Add Progress`. Several photos at once, because a site visit produces a
 * batch — and one date and caption for the batch, because they were all taken
 * on the same walk-round. Any of them can be corrected afterwards.
 */
export async function addProgressAction(
  _prev: SiteState,
  formData: FormData,
): Promise<SiteState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const chosen = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (chosen.length === 0) return { error: "Choose at least one photo." };

  const files = await Promise.all(
    chosen.map(async (f) => ({
      fileName: f.name,
      mimeType: f.type || null,
      bytes: await f.arrayBuffer(),
    })),
  );

  const r = await uploadSitePhotos({
    projectId,
    files,
    takenOn: str(formData.get("taken_on")) || null,
    caption: str(formData.get("caption")) || null,
    clientVisible: str(formData.get("client_visible")) === "true",
  });

  // A partial batch is a real outcome, not a failure: say what landed and what
  // did not, rather than pretending either half did not happen.
  if (r.added === 0) return { error: r.error ?? "Nothing was uploaded." };
  const note = r.error
    ? `${r.added} added. ${r.error}`
    : `${r.added} ${r.added === 1 ? "photo" : "photos"} added.`;
  return refresh(projectId, note);
}

export async function updatePhotoAction(
  _prev: SiteState,
  formData: FormData,
): Promise<SiteState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return { error: "Missing photo." };

  const r = await updateSitePhoto(projectId, id, {
    caption: formData.has("caption") ? str(formData.get("caption")) || null : undefined,
    taken_on: formData.has("taken_on") ? str(formData.get("taken_on")) || null : undefined,
    client_visible: formData.has("client_visible")
      ? str(formData.get("client_visible")) === "true"
      : undefined,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

/** The per-card VISIBLE / HIDDEN switch, and the bulk `Actions ▾` items. */
export async function setVisibilityAction(
  _prev: SiteState,
  formData: FormData,
): Promise<SiteState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const visible = str(formData.get("visible")) === "true";
  const selected = ids(formData);
  if (selected.length === 0) return { error: "Select at least one photo." };

  const r = await setPhotosClientVisible(projectId, selected, visible);
  if (r.changed === 0) return { error: r.error ?? "Nothing changed." };

  const what = `${r.changed} ${r.changed === 1 ? "photo" : "photos"} ${
    visible ? "shared with the client" : "hidden from the client"
  }.`;
  return refresh(projectId, r.error ? `${what} ${r.error}` : what);
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  if (!(await can("projects.project.edit"))) return;
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return;
  await deleteSitePhoto(projectId, id);
  refresh(projectId);
}

export async function deletePhotosAction(
  _prev: SiteState,
  formData: FormData,
): Promise<SiteState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };
  const selected = ids(formData);
  if (selected.length === 0) return { error: "Select at least one photo." };

  const r = await deleteSitePhotos(projectId, selected);
  if (r.deleted === 0) return { error: r.error ?? "Nothing was deleted." };
  return refresh(
    projectId,
    `${r.deleted} ${r.deleted === 1 ? "photo" : "photos"} deleted.`,
  );
}

/* ── The per-photo Client Chat (the §3 thread, third appearance) ──────────── */

export async function addPhotoCommentAction(
  _prev: SiteState,
  formData: FormData,
): Promise<SiteState> {
  const denied = await requireCan("projects.project.view");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  const photoId = str(formData.get("photo_id"));
  if (!projectId || !photoId) return { error: "Missing photo." };

  const r = await addSitePhotoComment({
    projectId,
    photoId,
    body: str(formData.get("body")),
    audience: str(formData.get("audience")) === "internal" ? "internal" : "client",
    parentId: str(formData.get("parent_id")) || null,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function setPhotoCommentStatusAction(
  _prev: SiteState,
  formData: FormData,
): Promise<SiteState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("comment_id"));
  if (!projectId || !id) return { error: "Missing comment." };

  const status = str(formData.get("status"));
  if (!(["open", "accepted", "not_required"] as const).includes(status as CommentStatus)) {
    return { error: "That is not a comment status." };
  }

  const r = await setCommentStatus(id, status as CommentStatus);
  return r.error ? { error: r.error } : refresh(projectId);
}
