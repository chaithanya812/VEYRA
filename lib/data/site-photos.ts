import "server-only";
import { withOrg } from "./with-org";
import { listMembers, type Member } from "./team";
import { addEntityComment, listEntityCommentsBatch } from "./project-files";
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  removeObjects,
  signedUrls,
  sitePhotoPath,
  uploadObject,
} from "./storage";
import type { EntityComment } from "@/lib/comments-model";
import type { SiteProgressPhoto } from "@/lib/site-photos-model";

/**
 * Site Progress Uploads (PLAN-V4 §9.5, frame `105527`).
 *
 * Photos of one project, grouped by the day the work was photographed, each
 * carrying a `Client Chat` thread and a `client_visible` flag.
 *
 * **This module builds nothing of its own.** The bytes go into the documents
 * bucket under the same `<org_id>/<project_id>/…` prefix, the thread is the
 * shared `entity_comments` one with `entity_type = 'site_photo'`, and the rows
 * live in `site_photos` (0019, extended by 0038). §9.5 is a screen, not a
 * subsystem — and every one of those three reuses is what makes that true.
 *
 * The invariant, same as documents: **a photo belongs to exactly one project.**
 * The project id decides where the bytes are written and which grid can see
 * them, so every write re-checks it rather than trusting the caller.
 */

export interface SitePhotoWithMeta extends SiteProgressPhoto {
  /** Short-lived signed URL. Absent for a row whose object has gone missing. */
  signedUrl: string | null;
  uploadedByName: string | null;
  /** The client conversation — the one the `Client Chat` button opens. */
  clientCommentCount: number;
  clientPendingCount: number;
  internalCommentCount: number;
}

export interface SiteProgressBoard {
  photos: SitePhotoWithMeta[];
  /** Every thread on every photo, keyed by photo id. Built once, used twice. */
  comments: Record<string, EntityComment[]>;
  members: Member[];
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

/**
 * One project's photo record.
 *
 * Comments for every photo come back in a single read and are handed to the
 * client whole, because the grid needs two things from the same list: the badge
 * on each card and the thread inside the chat dialog. Building it twice from
 * two copies of the filter state is how those two drift apart.
 *
 * ⚠ Both audiences are returned, exactly as `getProjectFileDetail` does and for
 * the same reason — this is a staff screen that switches between them. Anything
 * client-facing must pass an audience to `listEntityCommentsBatch` instead, so
 * the internal thread is narrowed away at the database rather than in a
 * browser.
 */
export async function getProjectSitePhotos(
  projectId: string,
): Promise<SiteProgressBoard> {
  const { db } = await withOrg();

  const [{ data, error }, members] = await Promise.all([
    db
      .table("site_photos")
      .select("*")
      .eq("project_id", projectId)
      .order("taken_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    listMembers(),
  ]);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(toPhoto);
  const ids = rows.map((r) => r.id);

  const [signed, commentsByPhoto] = await Promise.all([
    signedUrls(rows.map((r) => r.storage_path).filter((p): p is string => !!p)),
    listEntityCommentsBatch("site_photo", ids),
  ]);

  const nameByUser = new Map(members.map((m) => [m.user_id ?? m.id, m.name]));

  const comments: Record<string, EntityComment[]> = {};
  for (const id of ids) comments[id] = commentsByPhoto.get(id) ?? [];

  return {
    members,
    comments,
    photos: rows.map((r) => {
      const thread = comments[r.id] ?? [];
      const client = thread.filter((c) => c.audience === "client");
      return {
        ...r,
        // A pasted-URL row (0019) has no object to sign; its own link is the
        // image. Neither kind is preferred — both are photos on record.
        signedUrl: r.storage_path ? (signed.get(r.storage_path) ?? null) : r.url,
        uploadedByName: r.uploaded_by ? (nameByUser.get(r.uploaded_by) ?? null) : null,
        clientCommentCount: client.length,
        clientPendingCount: client.filter((c) => !c.parentId && c.status === "open").length,
        internalCommentCount: thread.length - client.length,
      };
    }),
  };
}

function toPhoto(row: Record<string, unknown>): SiteProgressPhoto {
  return {
    id: String(row.id),
    project_id: (row.project_id as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    storage_path: (row.storage_path as string | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
    size_bytes: (row.size_bytes as number | string | null) ?? 0,
    client_visible: row.client_visible === true,
    taken_on: (row.taken_on as string | null) ?? null,
    uploaded_by: (row.uploaded_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * The guard. A photo may only be read or changed through the project that owns
 * it — otherwise `/projects/<A>/site` could delete a photo belonging to B, and
 * the URL would look entirely innocent.
 */
async function assertPhotoBelongsToProject(
  photoId: string,
  projectId: string,
): Promise<{ error?: string; storagePath?: string | null }> {
  const { db } = await withOrg();
  const { data } = await db
    .table("site_photos")
    .select("id, project_id, storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (!data) return { error: "That photo is not in this workspace." };
  const row = data as unknown as { project_id: string | null; storage_path: string | null };
  if (row.project_id !== projectId) {
    return { error: "That photo belongs to a different project." };
  }
  return { storagePath: row.storage_path };
}

/* ── Upload ───────────────────────────────────────────────────────────────── */

export interface SitePhotoUpload {
  fileName: string;
  mimeType: string | null;
  bytes: ArrayBuffer;
}

/**
 * Add photos to a project's record.
 *
 * Several at once, because a site visit produces a batch and asking somebody to
 * upload eleven photos one dialog at a time is how the record stops being kept.
 *
 * Order matters and mirrors `uploadProjectFile`: the row is written first so the
 * key can embed the real photo id, then the object goes up, and a failed upload
 * rolls its row back. One bad file does not abandon the rest of the batch — it
 * is reported and the others still land.
 */
export async function uploadSitePhotos(input: {
  projectId: string;
  files: SitePhotoUpload[];
  takenOn?: string | null;
  caption?: string | null;
  clientVisible?: boolean;
}): Promise<{ added: number; ids: string[]; error?: string }> {
  if (input.files.length === 0) return { added: 0, ids: [], error: "Choose at least one photo." };

  const { db, ctx } = await withOrg();

  const { data: project } = await db
    .table("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { added: 0, ids: [], error: "That project is not in this workspace." };

  const takenOn = normaliseDay(input.takenOn);
  const caption = input.caption?.trim() || null;
  const ids: string[] = [];
  const failures: string[] = [];

  for (const file of input.files) {
    const problem = rejectReason(file);
    if (problem) {
      failures.push(`${file.fileName}: ${problem}`);
      continue;
    }

    const mime = file.mimeType || "image/jpeg";
    const { data, error } = await db.table("site_photos").insert({
      project_id: input.projectId,
      // Kept in step with the FK so the legacy display fallback never contradicts
      // it (HANDOFF-V5 §3 — read project_id, fall back to the label).
      project_label: null,
      caption,
      taken_on: takenOn,
      client_visible: input.clientVisible === true,
      mime_type: mime,
      size_bytes: file.bytes.byteLength,
      uploaded_by: ctx.userId,
    });
    if (error) {
      failures.push(`${file.fileName}: ${error.message}`);
      continue;
    }

    const id = (data?.[0] as { id: string }).id;
    const path = sitePhotoPath({
      orgId: ctx.orgId,
      projectId: input.projectId,
      photoId: id,
      fileName: file.fileName,
    });

    const up = await uploadObject({ path, body: file.bytes, contentType: mime });
    if (up.error) {
      // Never leave a row pointing at bytes that never arrived.
      await db.table("site_photos").deleteById(id);
      failures.push(`${file.fileName}: ${up.error}`);
      continue;
    }

    const { error: pathErr } = await db.table("site_photos").updateById(id, {
      storage_path: path,
    });
    if (pathErr) {
      await removeObjects([path]);
      await db.table("site_photos").deleteById(id);
      failures.push(`${file.fileName}: ${pathErr.message}`);
      continue;
    }

    ids.push(id);
  }

  return {
    added: ids.length,
    ids,
    error: failures.length ? failures.join(" · ") : undefined,
  };
}

/** A file the grid could not render is a file the grid should not accept. */
function rejectReason(file: SitePhotoUpload): string | null {
  if (file.bytes.byteLength === 0) return "the file is empty";
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return `larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`;
  }
  const mime = file.mimeType || "";
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
    return `${mime || "unknown type"} is not a photo`;
  }
  return null;
}

/** `YYYY-MM-DD`, or null. A half-typed date is not a date. */
function normaliseDay(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/* ── Edit ─────────────────────────────────────────────────────────────────── */

export async function updateSitePhoto(
  projectId: string,
  id: string,
  patch: { caption?: string | null; taken_on?: string | null; client_visible?: boolean },
): Promise<{ error?: string }> {
  const owned = await assertPhotoBelongsToProject(id, projectId);
  if (owned.error) return { error: owned.error };

  const next: Record<string, unknown> = {};
  if (patch.caption !== undefined) next.caption = patch.caption?.trim() || null;
  if (patch.taken_on !== undefined) next.taken_on = normaliseDay(patch.taken_on);
  if (patch.client_visible !== undefined) next.client_visible = patch.client_visible === true;
  if (Object.keys(next).length === 0) return {};

  const { db } = await withOrg();
  const { error } = await db.table("site_photos").updateById(id, next);
  return error ? { error: error.message } : {};
}

/**
 * Show or hide a set of photos from the client — the bulk half of `Actions ▾`.
 *
 * Every id is re-checked against the project before it changes, so a selection
 * carrying an id from elsewhere changes nothing rather than changing the wrong
 * thing. What could not be applied is reported; what could, is applied.
 */
export async function setPhotosClientVisible(
  projectId: string,
  ids: string[],
  visible: boolean,
): Promise<{ changed: number; error?: string }> {
  if (ids.length === 0) return { changed: 0, error: "Select at least one photo." };

  const { db } = await withOrg();
  const { data } = await db
    .table("site_photos")
    .select("id")
    .eq("project_id", projectId)
    .in("id", ids);

  const owned = ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
  let changed = 0;
  for (const id of owned) {
    const { error } = await db.table("site_photos").updateById(id, {
      client_visible: visible,
    });
    if (!error) changed++;
  }

  const skipped = ids.length - owned.length;
  return {
    changed,
    error:
      skipped > 0
        ? `${skipped} ${skipped === 1 ? "photo was" : "photos were"} not in this project.`
        : undefined,
  };
}

/* ── Delete ───────────────────────────────────────────────────────────────── */

/**
 * Remove a photo and its bytes. The comments go with it — `entity_comments` has
 * no FK to `site_photos` (it is keyed by type and id), so they are deleted here
 * explicitly rather than being left as a thread about nothing.
 */
export async function deleteSitePhoto(
  projectId: string,
  id: string,
): Promise<{ error?: string }> {
  const owned = await assertPhotoBelongsToProject(id, projectId);
  if (owned.error) return { error: owned.error };

  const { db } = await withOrg();
  const { error } = await db.table("site_photos").deleteById(id);
  if (error) return { error: error.message };

  if (owned.storagePath) await removeObjects([owned.storagePath]);
  await deleteCommentsFor(id);
  return {};
}

export async function deleteSitePhotos(
  projectId: string,
  ids: string[],
): Promise<{ deleted: number; error?: string }> {
  let deleted = 0;
  const problems: string[] = [];
  for (const id of ids) {
    const r = await deleteSitePhoto(projectId, id);
    if (r.error) problems.push(r.error);
    else deleted++;
  }
  return { deleted, error: problems.length ? problems[0] : undefined };
}

/**
 * `withOrg()` exposes no generic delete — only `deleteById`, which is what
 * keeps every delete org-scoped. So the comment ids are selected first and
 * removed one at a time.
 */
async function deleteCommentsFor(photoId: string): Promise<void> {
  const { db } = await withOrg();
  const { data } = await db
    .table("entity_comments")
    .select("id")
    .eq("entity_type", "site_photo")
    .eq("entity_id", photoId);
  for (const row of (data ?? []) as unknown as { id: string }[]) {
    await db.table("entity_comments").deleteById(row.id);
  }
}

/* ── The Client Chat thread ───────────────────────────────────────────────── */

/**
 * A comment on a photo. Thin on purpose: it proves the photo is this project's
 * and then hands off to the shared thread, so a site photo and a drawing are
 * commented on by the same code path.
 */
export async function addSitePhotoComment(input: {
  projectId: string;
  photoId: string;
  body: string;
  audience: "internal" | "client";
  parentId?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const owned = await assertPhotoBelongsToProject(input.photoId, input.projectId);
  if (owned.error) return { error: owned.error };

  return addEntityComment({
    entityType: "site_photo",
    entityId: input.photoId,
    body: input.body,
    audience: input.audience,
    parentId: input.parentId ?? null,
  });
}
