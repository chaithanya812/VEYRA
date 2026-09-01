import "server-only";
import { admin } from "@/lib/supabase/admin";

/**
 * Object storage for project documents (PLAN-V4 §9.1).
 *
 * Three rules, and they are the whole design:
 *
 * 1. **THE BUCKET IS PRIVATE.** Nothing is ever served from a public URL. The
 *    browser only ever receives a short-lived signed URL minted here, on the
 *    server, after `withOrg()` has already proved the caller owns the row. The
 *    secret key never leaves the server (lint-enforced: `admin` may only be
 *    imported inside `lib/data/`).
 *
 * 2. **THE PATH CARRIES THE TENANT AND THE PROJECT.**
 *
 *        <org_id>/<project_id>/<file_id>/v<n>-<filename>
 *
 *    The owner's instruction: *"project 1 and project 2 can't share the same
 *    folders."* Because the project id is a path segment, one project's objects
 *    physically cannot be listed or fetched from another project's prefix —
 *    even if a query above were mis-scoped. The FK and the unique index say the
 *    same thing; this says it a third time, where the bytes actually live.
 *
 * 3. **NO OVERWRITES.** Every version gets its own key. Uploading v2 never
 *    touches v1's object, so "what did the client approve in March" is still
 *    answerable in June.
 */

export const PROJECT_FILES_BUCKET = "project-files";

/** 25 MB. A floor plan or a rendered PDF fits; a video does not, on purpose. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * What a construction firm actually exchanges. An allowlist, not a blocklist:
 * a blocklist is a promise you cannot keep.
 */
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/acad",
  "image/vnd.dwg",
  "application/dxf",
  "image/vnd.dxf",
  "text/plain",
  "text/csv",
  "application/zip",
] as const;

/**
 * Site progress uploads (PLAN-V4 §9.5) accept photographs and nothing else.
 * The grid renders every card as an image, so a PDF filed here would show as a
 * broken tile — narrowing the allowlist is what keeps the screen honest.
 */
export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

let bucketReady = false;

/**
 * Create the private bucket on first use. Idempotent, and cheap after the first
 * call — a fresh Supabase project therefore needs no manual console step.
 */
export async function ensureBucket(): Promise<{ error?: string }> {
  if (bucketReady) return {};
  const { data } = await admin.storage.getBucket(PROJECT_FILES_BUCKET);
  if (data) {
    bucketReady = true;
    return {};
  }
  const { error } = await admin.storage.createBucket(PROJECT_FILES_BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
  });
  // A concurrent caller winning the race is a success, not a failure.
  if (error && !/already exists/i.test(error.message)) return { error: error.message };
  bucketReady = true;
  return {};
}

/** Strip anything that could escape the prefix or confuse a storage key. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "file").slice(0, 120);
}

/**
 * The one place a storage key is built. Every caller goes through it so the
 * org/project prefix can never be forgotten at a call site.
 */
export function storagePath(input: {
  orgId: string;
  projectId: string;
  fileId: string;
  versionNo: number;
  fileName: string;
}): string {
  return [
    input.orgId,
    input.projectId,
    input.fileId,
    `v${input.versionNo}-${safeFileName(input.fileName)}`,
  ].join("/");
}

/**
 * A site progress photo's key (PLAN-V4 §9.5).
 *
 *     <org_id>/<project_id>/<photo_id>/photo-<filename>
 *
 * The same prefix as a document on purpose: one project's bytes live in one
 * place, so `projectStorageUsage` counts photos without being taught about
 * them, and one project's photos cannot be listed from another's prefix. A
 * photo has no versions, so there is no `v<n>` — the id segment is what keeps
 * two photos of the same wall from colliding.
 */
export function sitePhotoPath(input: {
  orgId: string;
  projectId: string;
  photoId: string;
  fileName: string;
}): string {
  return [
    input.orgId,
    input.projectId,
    input.photoId,
    `photo-${safeFileName(input.fileName)}`,
  ].join("/");
}

export async function uploadObject(input: {
  path: string;
  body: ArrayBuffer | Uint8Array | Blob;
  contentType?: string | null;
}): Promise<{ error?: string }> {
  const ready = await ensureBucket();
  if (ready.error) return ready;

  const { error } = await admin.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(input.path, input.body, {
      contentType: input.contentType || "application/octet-stream",
      // Never overwrite: a version is a new key, always.
      upsert: false,
    });
  return error ? { error: error.message } : {};
}

/**
 * A short-lived signed URL. Ten minutes is long enough to open a drawing and
 * short enough that a URL pasted into a chat is dead before it travels.
 */
export async function signedUrl(
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const ready = await ensureBucket();
  if (ready.error) return null;
  const { data } = await admin.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

/** Sign many paths at once, keyed by path. Missing ones simply stay absent. */
export async function signedUrls(
  paths: string[],
  expiresInSeconds = 600,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const ready = await ensureBucket();
  if (ready.error) return out;

  const { data } = await admin.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

export async function removeObjects(paths: string[]): Promise<{ error?: string }> {
  if (paths.length === 0) return {};
  const { error } = await admin.storage.from(PROJECT_FILES_BUCKET).remove(paths);
  return error ? { error: error.message } : {};
}

/** Bytes stored under one project's prefix — the Storage Usage meter. */
export async function projectStorageUsage(
  orgId: string,
  projectId: string,
): Promise<number> {
  const ready = await ensureBucket();
  if (ready.error) return 0;

  // Listing walks one project's prefix only; another project's objects are not
  // reachable from here by construction.
  const prefix = `${orgId}/${projectId}`;
  const { data: fileDirs } = await admin.storage
    .from(PROJECT_FILES_BUCKET)
    .list(prefix, { limit: 1000 });

  let total = 0;
  for (const dir of fileDirs ?? []) {
    const { data: objects } = await admin.storage
      .from(PROJECT_FILES_BUCKET)
      .list(`${prefix}/${dir.name}`, { limit: 1000 });
    for (const o of objects ?? []) {
      total += Number((o.metadata as { size?: number } | null)?.size ?? 0);
    }
  }
  return total;
}
