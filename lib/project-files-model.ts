/**
 * Designs & Documents — the pure half (PLAN-V4 §9.1, frame `104742`).
 *
 * The structural insight the frame gives us: **a file carries two independent
 * lifecycles.** `internal_status` is what the firm thinks of the drawing;
 * `client_approval` is what the client thinks. Collapsing them into one status
 * loses "approved internally, not yet shown to the client" — which is where a
 * design spends most of its life.
 */

export interface ProjectFolder {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  internal_status: string;
  client_approval: string;
  current_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectFileVersion {
  id: string;
  file_id: string;
  version_no: number;
  storage_path: string;
  size_bytes: number | string | null;
  mime_type: string | null;
  note: string | null;
  created_at: string;
}

/* ── Lifecycle one: what we think ─────────────────────────────────────────── */

export const INTERNAL_STATUSES = ["draft", "approved"] as const;
export type InternalStatus = (typeof INTERNAL_STATUSES)[number];

export const INTERNAL_STATUS_LABELS: Record<InternalStatus, string> = {
  draft: "Draft",
  approved: "Approved",
};

export const INTERNAL_STATUS_TONE: Record<InternalStatus, "neutral" | "green"> = {
  draft: "neutral",
  approved: "green",
};

/* ── Lifecycle two: what the client thinks ────────────────────────────────── */

export const CLIENT_APPROVALS = [
  "not_shared",
  "no_action",
  "revision_requested",
  "approved",
] as const;
export type ClientApproval = (typeof CLIENT_APPROVALS)[number];

export const CLIENT_APPROVAL_LABELS: Record<ClientApproval, string> = {
  not_shared: "Not shared with client",
  no_action: "No action taken",
  revision_requested: "Revision requested",
  approved: "Approved by client",
};

/**
 * `revision_requested` is amber, not red: the client asking for a change is a
 * normal step in a design conversation, not an alarm. Red stays for genuine
 * alerts (DESIGN-DIRECTION §2).
 */
export const CLIENT_APPROVAL_TONE: Record<
  ClientApproval,
  "neutral" | "amber" | "green"
> = {
  not_shared: "neutral",
  no_action: "amber",
  revision_requested: "amber",
  approved: "green",
};

export function internalStatusOf(file: Pick<ProjectFile, "internal_status">): InternalStatus {
  return (INTERNAL_STATUSES as readonly string[]).includes(file.internal_status)
    ? (file.internal_status as InternalStatus)
    : "draft";
}

export function clientApprovalOf(file: Pick<ProjectFile, "client_approval">): ClientApproval {
  return (CLIENT_APPROVALS as readonly string[]).includes(file.client_approval)
    ? (file.client_approval as ClientApproval)
    : "not_shared";
}

/** Human file size. Bytes in the database, KB/MB on the screen. */
export function formatBytes(bytes: number | string | null | undefined): string {
  const n = typeof bytes === "string" ? Number(bytes) : (bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A coarse type for the row icon, from the mime type. */
export function fileKind(
  mime: string | null | undefined,
): "image" | "pdf" | "sheet" | "doc" | "cad" | "archive" | "other" {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/") && !m.includes("dwg") && !m.includes("dxf")) return "image";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv")) return "sheet";
  if (m.includes("word") || m === "text/plain") return "doc";
  if (m.includes("dwg") || m.includes("dxf") || m.includes("acad")) return "cad";
  if (m.includes("zip")) return "archive";
  return "other";
}

/**
 * Files grouped by folder, with the project's loose files last.
 *
 * Takes the folder list for THIS project only — a file whose folder is not in
 * that list falls into "unfiled" rather than being rendered under a folder
 * belonging to another project.
 */
export function groupFilesByFolder<T extends { folder_id: string | null }>(
  files: T[],
  folders: ProjectFolder[],
): { folder: ProjectFolder | null; files: T[] }[] {
  const known = new Set(folders.map((f) => f.id));
  const byFolder = new Map<string | null, T[]>();

  for (const f of files) {
    const key = f.folder_id && known.has(f.folder_id) ? f.folder_id : null;
    const list = byFolder.get(key) ?? [];
    list.push(f);
    byFolder.set(key, list);
  }

  const groups: { folder: ProjectFolder | null; files: T[] }[] = folders
    .filter((folder) => byFolder.has(folder.id))
    .map((folder) => ({ folder, files: byFolder.get(folder.id) ?? [] }));

  const loose = byFolder.get(null);
  if (loose?.length) groups.push({ folder: null, files: loose });
  return groups;
}
