"use server";

import { revalidatePath } from "next/cache";
import {
  addEntityComment,
  createFolder,
  deleteFolder,
  deleteProjectFile,
  renameFolder,
  updateFile,
  uploadProjectFile,
} from "@/lib/data/project-files";

/**
 * Designs & Documents actions (PLAN-V4 §9.1).
 *
 * Every one of them carries `project_id` and the data layer re-checks that the
 * folder and the file belong to it. That check is not belt-and-braces: the
 * project id decides where the bytes are written, so a wrong one would file a
 * drawing under another project's prefix.
 */

export type DocState = { error?: string; ok?: boolean } | undefined;

function refresh(projectId: string): DocState {
  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export async function createFolderAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };
  const r = await createFolder({ projectId, name: str(formData.get("name")) });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function renameFolderAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return { error: "Missing folder." };
  const r = await renameFolder(id, str(formData.get("name")));
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function deleteFolderAction(formData: FormData): Promise<void> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return;
  await deleteFolder(id);
  refresh(projectId);
}

export async function uploadFileAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const r = await uploadProjectFile({
    projectId,
    folderId: str(formData.get("folder_id")) || null,
    // Default the display name to the file's own name.
    name: str(formData.get("name")) || file.name,
    description: str(formData.get("description")) || null,
    fileName: file.name,
    mimeType: file.type || null,
    bytes: await file.arrayBuffer(),
    fileId: str(formData.get("file_id")) || null,
    note: str(formData.get("note")) || null,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function updateFileAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return { error: "Missing file." };

  const r = await updateFile(id, {
    name: formData.has("name") ? str(formData.get("name")) : undefined,
    description: formData.has("description") ? str(formData.get("description")) || null : undefined,
    internal_status: formData.has("internal_status")
      ? str(formData.get("internal_status"))
      : undefined,
    client_approval: formData.has("client_approval")
      ? str(formData.get("client_approval"))
      : undefined,
    folder_id: formData.has("folder_id") ? str(formData.get("folder_id")) || null : undefined,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function deleteFileAction(formData: FormData): Promise<void> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return;
  await deleteProjectFile(id);
  refresh(projectId);
}

export async function addFileCommentAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const projectId = str(formData.get("project_id"));
  const fileId = str(formData.get("file_id"));
  if (!projectId || !fileId) return { error: "Missing file." };

  const r = await addEntityComment({
    entityType: "project_file",
    entityId: fileId,
    body: str(formData.get("body")),
    audience: str(formData.get("audience")) === "client" ? "client" : "internal",
    versionId: str(formData.get("version_id")) || null,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}
