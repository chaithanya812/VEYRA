import "server-only";
import { withOrg } from "./with-org";
import { listMembers, type Member } from "./team";
import {
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
  projectStorageUsage,
  removeObjects,
  signedUrl,
  signedUrls,
  storagePath,
  uploadObject,
} from "./storage";
import type { EntityComment } from "@/lib/comments-model";
import type {
  ProjectFile,
  ProjectFileVersion,
  ProjectFolder,
} from "@/lib/project-files-model";

/**
 * Designs & Documents (PLAN-V4 §9.1).
 *
 * ⚠ THE INVARIANT THIS FILE EXISTS TO PROTECT: **a folder and a file belong to
 * exactly one project.** The owner: *"project 1 and project 2 can't share the
 * same folders."*
 *
 * Every write here re-checks it rather than trusting the caller — filing a
 * drawing into another project's folder is the kind of mistake nobody notices
 * until the wrong client sees it. `assertFolderBelongsToProject` is called on
 * create, on upload and on move.
 */

/* ── Folders ──────────────────────────────────────────────────────────────── */

export async function listFolders(projectId: string): Promise<ProjectFolder[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("project_folders")
    .select("*")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ProjectFolder[];
}

export async function createFolder(input: {
  projectId: string;
  name: string;
}): Promise<{ id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "A folder needs a name." };

  const { db, ctx } = await withOrg();
  const { data: project } = await db
    .table("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { error: "That project is not in this workspace." };

  const { data, error } = await db.table("project_folders").insert({
    project_id: input.projectId,
    name,
    created_by: ctx.userId,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "This project already has a folder with that name."
          : error.message,
    };
  }
  return { id: (data?.[0] as { id: string }).id };
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "A folder needs a name." };
  const { db } = await withOrg();
  const { error } = await db.table("project_folders").updateById(id, { name: trimmed });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "This project already has a folder with that name."
          : error.message,
    };
  }
  return {};
}

/**
 * Deleting a folder never deletes its files — they fall back to the project
 * root (`folder_id` is `on delete set null`). Losing a drawing because someone
 * tidied a folder is not a trade anyone would accept.
 */
export async function deleteFolder(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("project_folders").deleteById(id);
  return error ? { error: error.message } : {};
}

/**
 * The guard. A folder may only ever hold files from its own project, so this
 * runs on every path that attaches a file to a folder.
 */
async function assertFolderBelongsToProject(
  folderId: string | null | undefined,
  projectId: string,
): Promise<{ error?: string }> {
  if (!folderId) return {};
  const { db } = await withOrg();
  const { data } = await db
    .table("project_folders")
    .select("id, project_id")
    .eq("id", folderId)
    .maybeSingle();
  if (!data) return { error: "That folder is not in this workspace." };
  const row = data as unknown as { project_id: string };
  if (row.project_id !== projectId) {
    return { error: "That folder belongs to a different project." };
  }
  return {};
}

/* ── Files ────────────────────────────────────────────────────────────────── */

export interface FileWithMeta extends ProjectFile {
  versions: ProjectFileVersion[];
  latest: ProjectFileVersion | null;
  commentCount: number;
  pendingCount: number;
  uploadedByName: string | null;
}

export interface ProjectFileBrowser {
  folders: ProjectFolder[];
  files: FileWithMeta[];
  members: Member[];
  storageBytes: number;
}

export async function getProjectFiles(
  projectId: string,
): Promise<ProjectFileBrowser> {
  const { db, ctx } = await withOrg();

  const [folders, members, filesRes] = await Promise.all([
    listFolders(projectId),
    listMembers(),
    db
      .table("project_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);
  if (filesRes.error) throw filesRes.error;

  const files = (filesRes.data ?? []) as unknown as ProjectFile[];
  const ids = files.map((f) => f.id);

  const [versionsRes, commentsRes, storageBytes] = await Promise.all([
    ids.length
      ? db
          .table("project_file_versions")
          .select("*")
          .in("file_id", ids)
          .order("version_no", { ascending: false })
      : Promise.resolve({ data: [] }),
    ids.length
      ? db
          .table("entity_comments")
          .select("entity_id, status, parent_id")
          .eq("entity_type", "project_file")
          .in("entity_id", ids)
      : Promise.resolve({ data: [] }),
    projectStorageUsage(ctx.orgId, projectId),
  ]);

  const versionsByFile = new Map<string, ProjectFileVersion[]>();
  for (const v of (versionsRes.data ?? []) as unknown as ProjectFileVersion[]) {
    const list = versionsByFile.get(v.file_id) ?? [];
    list.push(v);
    versionsByFile.set(v.file_id, list);
  }

  const counts = new Map<string, { total: number; pending: number }>();
  for (const c of (commentsRes.data ?? []) as unknown as {
    entity_id: string;
    status: string;
    parent_id: string | null;
  }[]) {
    const cur = counts.get(c.entity_id) ?? { total: 0, pending: 0 };
    cur.total++;
    if (!c.parent_id && c.status === "open") cur.pending++;
    counts.set(c.entity_id, cur);
  }

  const nameById = new Map(members.map((m) => [m.user_id ?? m.id, m.name]));

  return {
    folders,
    members,
    storageBytes,
    files: files.map((f) => {
      const versions = versionsByFile.get(f.id) ?? [];
      const c = counts.get(f.id) ?? { total: 0, pending: 0 };
      return {
        ...f,
        versions,
        latest: versions[0] ?? null,
        commentCount: c.total,
        pendingCount: c.pending,
        uploadedByName: f.created_by ? (nameById.get(f.created_by) ?? null) : null,
      };
    }),
  };
}

export interface UploadInput {
  projectId: string;
  folderId?: string | null;
  name: string;
  description?: string | null;
  fileName: string;
  mimeType: string | null;
  bytes: ArrayBuffer;
  /** Set to add a version to an existing file instead of creating one. */
  fileId?: string | null;
  note?: string | null;
}

/**
 * Upload a file, or a new version of one.
 *
 * Order matters: the row is written first so the storage key can embed the real
 * file id, then the object is uploaded, and a failed upload rolls the row back.
 * The alternative — object first — leaves orphaned bytes nobody can see or
 * delete through the app.
 */
export async function uploadProjectFile(
  input: UploadInput,
): Promise<{ fileId?: string; versionNo?: number; error?: string }> {
  if (input.bytes.byteLength === 0) return { error: "That file is empty." };
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return {
      error: `Files must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.`,
    };
  }
  const mime = input.mimeType || "application/octet-stream";
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return { error: `${mime} is not an accepted file type.` };
  }

  const { db, ctx } = await withOrg();

  const { data: project } = await db
    .table("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { error: "That project is not in this workspace." };

  const folderCheck = await assertFolderBelongsToProject(input.folderId, input.projectId);
  if (folderCheck.error) return folderCheck;

  // Either a new file row, or the next version of an existing one.
  let fileId = input.fileId ?? null;
  let versionNo = 1;
  let createdRow = false;

  if (fileId) {
    const { data: existing } = await db
      .table("project_files")
      .select("id, project_id, current_version")
      .eq("id", fileId)
      .maybeSingle();
    if (!existing) return { error: "That file is not in this workspace." };
    const row = existing as unknown as { project_id: string; current_version: number };
    // A version of a file from another project would write into that project's
    // prefix. Refuse rather than reason about it.
    if (row.project_id !== input.projectId) {
      return { error: "That file belongs to a different project." };
    }
    versionNo = Number(row.current_version || 1) + 1;
  } else {
    const { data, error } = await db.table("project_files").insert({
      project_id: input.projectId,
      folder_id: input.folderId ?? null,
      name: input.name.trim() || input.fileName,
      description: input.description?.trim() || null,
      internal_status: "draft",
      client_approval: "not_shared",
      current_version: 1,
      created_by: ctx.userId,
    });
    if (error) return { error: error.message };
    fileId = (data?.[0] as { id: string }).id;
    createdRow = true;
  }

  const path = storagePath({
    orgId: ctx.orgId,
    projectId: input.projectId,
    fileId: fileId as string,
    versionNo,
    fileName: input.fileName,
  });

  const up = await uploadObject({
    path,
    body: input.bytes,
    contentType: mime,
  });
  if (up.error) {
    // Don't leave a file row pointing at bytes that never arrived.
    if (createdRow && fileId) await db.table("project_files").deleteById(fileId);
    return { error: up.error };
  }

  const { error: verErr } = await db.table("project_file_versions").insert({
    file_id: fileId,
    version_no: versionNo,
    storage_path: path,
    size_bytes: input.bytes.byteLength,
    mime_type: mime,
    note: input.note?.trim() || null,
    uploaded_by: ctx.userId,
  });
  if (verErr) {
    await removeObjects([path]);
    if (createdRow && fileId) await db.table("project_files").deleteById(fileId);
    return { error: verErr.message };
  }

  if (!createdRow && fileId) {
    await db.table("project_files").updateById(fileId, {
      current_version: versionNo,
      updated_at: new Date().toISOString(),
    });
  }

  return { fileId: fileId as string, versionNo };
}

export async function updateFile(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    internal_status?: string;
    client_approval?: string;
    folder_id?: string | null;
  },
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data: existing } = await db
    .table("project_files")
    .select("id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "That file is not in this workspace." };
  const row = existing as unknown as { project_id: string };

  if (patch.folder_id !== undefined) {
    const check = await assertFolderBelongsToProject(patch.folder_id, row.project_id);
    if (check.error) return check;
  }

  const { error } = await db.table("project_files").updateById(id, {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

/** Delete a file and every version's object. Storage is cleaned, not orphaned. */
export async function deleteProjectFile(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data: versions } = await db
    .table("project_file_versions")
    .select("storage_path")
    .eq("file_id", id);

  const paths = ((versions ?? []) as unknown as { storage_path: string }[]).map(
    (v) => v.storage_path,
  );
  const { error } = await db.table("project_files").deleteById(id);
  if (error) return { error: error.message };
  await removeObjects(paths);
  return {};
}

/* ── Signed access ────────────────────────────────────────────────────────── */

/** A short-lived URL for one version, minted only after the row is org-scoped. */
export async function fileVersionUrl(versionId: string): Promise<string | null> {
  const { db } = await withOrg();
  const { data } = await db
    .table("project_file_versions")
    .select("storage_path")
    .eq("id", versionId)
    .maybeSingle();
  if (!data) return null;
  return signedUrl((data as unknown as { storage_path: string }).storage_path);
}

/** Signed URLs for a set of versions, keyed by version id. */
export async function fileVersionUrls(
  versionIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (versionIds.length === 0) return out;

  const { db } = await withOrg();
  const { data } = await db
    .table("project_file_versions")
    .select("id, storage_path")
    .in("id", versionIds);

  const rows = (data ?? []) as unknown as { id: string; storage_path: string }[];
  const signed = await signedUrls(rows.map((r) => r.storage_path));
  for (const r of rows) {
    const url = signed.get(r.storage_path);
    if (url) out.set(r.id, url);
  }
  return out;
}

/* ── Comments (the shared thread, PLAN-V4 §3) ─────────────────────────────── */

export async function listEntityComments(
  entityType: string,
  entityId: string,
): Promise<EntityComment[]> {
  const { db } = await withOrg();
  const [{ data, error }, members] = await Promise.all([
    db
      .table("entity_comments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: true }),
    listMembers(),
  ]);
  if (error) throw error;

  const nameById = new Map(members.map((m) => [m.id, m.name]));
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    body: String(c.body ?? ""),
    authorName: c.author_id ? (nameById.get(String(c.author_id)) ?? "Someone") : "Someone",
    createdAt: String(c.created_at),
    audience: c.audience === "client" ? "client" : "internal",
    status:
      c.status === "accepted"
        ? "accepted"
        : c.status === "not_required"
          ? "not_required"
          : "open",
    parentId: (c.parent_id as string | null) ?? null,
    versionId: (c.version_id as string | null) ?? null,
    page: (c.page as number | null) ?? null,
    x: (c.x as number | null) ?? null,
    y: (c.y as number | null) ?? null,
  }));
}

export async function addEntityComment(input: {
  entityType: string;
  entityId: string;
  body: string;
  audience: "internal" | "client";
  versionId?: string | null;
  parentId?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const body = input.body.trim();
  if (!body) return { error: "Write something first." };

  const { db, ctx } = await withOrg();
  const { data, error } = await db.table("entity_comments").insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    body,
    audience: input.audience === "client" ? "client" : "internal",
    status: "open",
    version_id: input.versionId ?? null,
    parent_id: input.parentId ?? null,
    author_id: ctx.memberId,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}
