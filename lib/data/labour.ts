import "server-only";
import { withOrg } from "./with-org";
import { listOptions } from "./workspace";
import { uploadProjectFile } from "./project-files";
import { signedUrls } from "./storage";
import { validateDraft, type LabourEntry } from "@/lib/labour-model";
import type { WorkspaceOption } from "@/lib/workspace-model";

/**
 * Labour Report (PLAN-V4 §9.6, frames `105620` – `105716`).
 *
 * One project's daily headcount, segregable by trade, vendor and contract.
 *
 * **Nothing here computes a total.** The three counts are stored and
 * `lib/labour-model.ts` derives everything else — see 0031's header for why.
 * If you find yourself writing `skilled + unskilled` in this file, stop: that
 * arithmetic has exactly one home and it is tested.
 *
 * The trade vocabulary is `workspace_options` kind `labour_category`, shared
 * with vendor contract categories (§9.3). This module reads that list and never
 * defines one of its own.
 */

export interface LabourAttachment {
  id: string;
  entryId: string;
  name: string;
  /** Short-lived signed URL, minted after withOrg() proved ownership. */
  url: string | null;
}

export interface LabourBoard {
  entries: LabourEntry[];
  categories: WorkspaceOption[];
  vendors: { id: string; name: string }[];
  /** This project's contracts — a labour day may only sit under one of them. */
  contracts: { id: string; name: string; source: string }[];
  attachments: LabourAttachment[];
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

export async function getProjectLabour(projectId: string): Promise<LabourBoard> {
  const { db } = await withOrg();

  const [entryRes, categories, vendorRes, contractRes] = await Promise.all([
    db
      .table("labour_entries")
      .select("*")
      .eq("project_id", projectId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    listOptions("labour_category"),
    db.table("vendors").select("id, name").order("name", { ascending: true }),
    db
      .table("contracts")
      .select("id, name, source")
      .eq("project_id", projectId)
      .order("name", { ascending: true }),
  ]);
  if (entryRes.error) throw entryRes.error;

  const rows = (entryRes.data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));

  const [catRes, venRes, fileRes] = await Promise.all([
    ids.length
      ? db.table("labour_entry_categories").select("entry_id, category").in("entry_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.table("labour_entry_vendors").select("entry_id, vendor_id").in("entry_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db
          .table("project_files")
          .select("id, name, labour_entry_id, current_version")
          .in("labour_entry_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  const catsByEntry = new Map<string, string[]>();
  for (const c of (catRes.data ?? []) as unknown as {
    entry_id: string;
    category: string;
  }[]) {
    const list = catsByEntry.get(c.entry_id) ?? [];
    list.push(c.category);
    catsByEntry.set(c.entry_id, list);
  }

  const vendorsByEntry = new Map<string, string[]>();
  for (const v of (venRes.data ?? []) as unknown as {
    entry_id: string;
    vendor_id: string;
  }[]) {
    const list = vendorsByEntry.get(v.entry_id) ?? [];
    list.push(v.vendor_id);
    vendorsByEntry.set(v.entry_id, list);
  }

  const attachments = await signAttachments(
    (fileRes.data ?? []) as unknown as {
      id: string;
      name: string;
      labour_entry_id: string;
    }[],
  );

  return {
    categories,
    vendors: (vendorRes.data ?? []) as unknown as { id: string; name: string }[],
    contracts: (contractRes.data ?? []) as unknown as {
      id: string;
      name: string;
      source: string;
    }[],
    attachments,
    entries: rows.map((r) => {
      const id = String(r.id);
      return {
        id,
        project_id: String(r.project_id),
        entry_date: String(r.entry_date ?? "").slice(0, 10),
        contract_id: (r.contract_id as string | null) ?? null,
        skilled: Number(r.skilled ?? 0),
        unskilled: Number(r.unskilled ?? 0),
        coordinator: Number(r.coordinator ?? 0),
        remark: (r.remark as string | null) ?? null,
        client_visible: r.client_visible === true,
        created_at: String(r.created_at ?? ""),
        categories: (catsByEntry.get(id) ?? []).sort(),
        vendor_ids: vendorsByEntry.get(id) ?? [],
      };
    }),
  };
}

/** One signed URL per attachment, from the file's newest version. */
async function signAttachments(
  files: { id: string; name: string; labour_entry_id: string }[],
): Promise<LabourAttachment[]> {
  if (files.length === 0) return [];
  const { db } = await withOrg();

  const { data } = await db
    .table("project_file_versions")
    .select("file_id, version_no, storage_path")
    .in(
      "file_id",
      files.map((f) => f.id),
    )
    .order("version_no", { ascending: false });

  const newest = new Map<string, string>();
  for (const v of (data ?? []) as unknown as {
    file_id: string;
    storage_path: string;
  }[]) {
    if (!newest.has(v.file_id)) newest.set(v.file_id, v.storage_path);
  }

  const signed = await signedUrls([...newest.values()]);
  return files.map((f) => {
    const path = newest.get(f.id);
    return {
      id: f.id,
      entryId: f.labour_entry_id,
      name: f.name,
      url: path ? (signed.get(path) ?? null) : null,
    };
  });
}

/**
 * The guard. A labour day may only be read or changed through the project that
 * owns it — the same rule documents and site photos enforce, for the same
 * reason: the project id in the URL must not be able to reach another
 * project's rows.
 */
async function assertEntryBelongsToProject(
  entryId: string,
  projectId: string,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data } = await db
    .table("labour_entries")
    .select("id, project_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!data) return { error: "That labour entry is not in this workspace." };
  if ((data as unknown as { project_id: string }).project_id !== projectId) {
    return { error: "That labour entry belongs to a different project." };
  }
  return {};
}

/* ── Write ────────────────────────────────────────────────────────────────── */

export interface LabourInput {
  projectId: string;
  entryDate: string;
  categories: string[];
  vendorIds: string[];
  contractId?: string | null;
  skilled: number;
  unskilled: number;
  coordinator: number;
  remark?: string | null;
  clientVisible?: boolean;
  attachment?: {
    fileName: string;
    mimeType: string | null;
    bytes: ArrayBuffer;
  } | null;
}

/**
 * Record one day's attendance (frame `105638`).
 *
 * The entry row goes in first so the category and vendor rows have something to
 * point at, and a failure on either rolls the entry back — a labour day whose
 * trades silently vanished is worse than one that was never saved, because
 * nobody would go looking for it.
 */
export async function addLabourEntry(
  input: LabourInput,
): Promise<{ id?: string; error?: string }> {
  const bad = validateDraft({
    entry_date: input.entryDate,
    skilled: input.skilled,
    unskilled: input.unskilled,
    coordinator: input.coordinator,
  });
  if (bad.error) return bad;

  const { db, ctx } = await withOrg();

  const { data: project } = await db
    .table("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { error: "That project is not in this workspace." };

  const contractId = await resolveContract(input.contractId, input.projectId);
  if ("error" in contractId) return contractId;

  const { data, error } = await db.table("labour_entries").insert({
    project_id: input.projectId,
    entry_date: input.entryDate.slice(0, 10),
    contract_id: contractId.id,
    skilled: int(input.skilled),
    unskilled: int(input.unskilled),
    coordinator: int(input.coordinator),
    remark: input.remark?.trim() || null,
    client_visible: input.clientVisible === true,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  const links = await setLinks(id, input.categories, input.vendorIds);
  if (links.error) {
    await db.table("labour_entries").deleteById(id);
    return links;
  }

  if (input.attachment) {
    const up = await uploadProjectFile({
      projectId: input.projectId,
      name: input.attachment.fileName,
      fileName: input.attachment.fileName,
      mimeType: input.attachment.mimeType,
      bytes: input.attachment.bytes,
      // One file model: the attachment is a project file that knows what it is
      // evidence for, not a row in a labour-private attachment table.
      link: { labour_entry_id: id },
    });
    // The attendance itself is the record; a rejected attachment must not throw
    // the headcount away. Report it and keep the entry.
    if (up.error) return { id, error: `Attendance saved. Attachment: ${up.error}` };
  }

  return { id };
}

export async function updateLabourEntry(
  projectId: string,
  id: string,
  patch: {
    entryDate?: string;
    categories?: string[];
    vendorIds?: string[];
    contractId?: string | null;
    skilled?: number;
    unskilled?: number;
    coordinator?: number;
    remark?: string | null;
    clientVisible?: boolean;
  },
): Promise<{ error?: string }> {
  const owned = await assertEntryBelongsToProject(id, projectId);
  if (owned.error) return owned;

  const { db } = await withOrg();
  const next: Record<string, unknown> = {};

  if (patch.entryDate !== undefined) {
    const day = patch.entryDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a real date." };
    next.entry_date = day;
  }
  if (patch.contractId !== undefined) {
    const resolved = await resolveContract(patch.contractId, projectId);
    if ("error" in resolved) return resolved;
    next.contract_id = resolved.id;
  }
  if (patch.skilled !== undefined) next.skilled = int(patch.skilled);
  if (patch.unskilled !== undefined) next.unskilled = int(patch.unskilled);
  if (patch.coordinator !== undefined) next.coordinator = int(patch.coordinator);
  if (patch.remark !== undefined) next.remark = patch.remark?.trim() || null;
  if (patch.clientVisible !== undefined) next.client_visible = patch.clientVisible === true;

  // The counts are the entry: an edit that empties them is a delete wearing a
  // disguise, and it would leave a point on the trend that means nothing.
  if (next.skilled !== undefined || next.unskilled !== undefined || next.coordinator !== undefined) {
    const { data: current } = await db
      .table("labour_entries")
      .select("skilled, unskilled, coordinator")
      .eq("id", id)
      .maybeSingle();
    const row = (current ?? {}) as Record<string, unknown>;
    const merged = {
      entry_date: "2000-01-01",
      skilled: (next.skilled as number) ?? Number(row.skilled ?? 0),
      unskilled: (next.unskilled as number) ?? Number(row.unskilled ?? 0),
      coordinator: (next.coordinator as number) ?? Number(row.coordinator ?? 0),
    };
    const bad = validateDraft(merged);
    if (bad.error) return bad;
  }

  if (Object.keys(next).length > 0) {
    next.updated_at = new Date().toISOString();
    const { error } = await db.table("labour_entries").updateById(id, next);
    if (error) return { error: error.message };
  }

  if (patch.categories !== undefined || patch.vendorIds !== undefined) {
    return setLinks(id, patch.categories, patch.vendorIds);
  }
  return {};
}

/** Show or hide a set of days from the client — the bulk half of the toolbar. */
export async function setLabourClientVisible(
  projectId: string,
  ids: string[],
  visible: boolean,
): Promise<{ changed: number; error?: string }> {
  if (ids.length === 0) return { changed: 0, error: "Select at least one day." };

  const { db } = await withOrg();
  const { data } = await db
    .table("labour_entries")
    .select("id")
    .eq("project_id", projectId)
    .in("id", ids);

  const owned = ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
  let changed = 0;
  for (const id of owned) {
    const { error } = await db.table("labour_entries").updateById(id, {
      client_visible: visible,
      updated_at: new Date().toISOString(),
    });
    if (!error) changed++;
  }

  const skipped = ids.length - owned.length;
  return {
    changed,
    error:
      skipped > 0
        ? `${skipped} ${skipped === 1 ? "day was" : "days were"} not in this project.`
        : undefined,
  };
}

export async function deleteLabourEntry(
  projectId: string,
  id: string,
): Promise<{ error?: string }> {
  const owned = await assertEntryBelongsToProject(id, projectId);
  if (owned.error) return owned;

  // The category and vendor rows cascade with the entry (0031). The attachment
  // does NOT: `labour_entry_id` is `on delete set null`, so the file survives
  // in the project's documents. Deleting a day's headcount is not a reason to
  // destroy the muster roll somebody photographed.
  const { db } = await withOrg();
  const { error } = await db.table("labour_entries").deleteById(id);
  return error ? { error: error.message } : {};
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function int(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** A labour day may only sit under one of ITS OWN project's contracts. */
async function resolveContract(
  contractId: string | null | undefined,
  projectId: string,
): Promise<{ id: string | null } | { error: string }> {
  const wanted = (contractId ?? "").trim();
  if (!wanted) return { id: null };

  const { db } = await withOrg();
  const { data } = await db
    .table("contracts")
    .select("id, project_id")
    .eq("id", wanted)
    .maybeSingle();
  if (!data) return { error: "That contract is not in this workspace." };
  if ((data as unknown as { project_id: string | null }).project_id !== projectId) {
    return { error: "That contract belongs to a different project." };
  }
  return { id: wanted };
}

/**
 * Reconcile an entry's trades and vendors — add what is missing, remove what is
 * gone, leave the rest alone. Same shape as `setContractCategories` (§9.3).
 *
 * Rows are inserted with uniform keys: a PostgREST bulk insert sends an
 * explicit NULL for a key one row omits, which defeats the column default.
 */
async function setLinks(
  entryId: string,
  categories?: string[],
  vendorIds?: string[],
): Promise<{ error?: string }> {
  const { db } = await withOrg();

  if (categories !== undefined) {
    const wanted = new Set(categories.map((c) => c.trim()).filter(Boolean));
    const { data } = await db
      .table("labour_entry_categories")
      .select("id, category")
      .eq("entry_id", entryId);
    const rows = (data ?? []) as unknown as { id: string; category: string }[];

    for (const row of rows) {
      if (!wanted.has(row.category)) {
        await db.table("labour_entry_categories").deleteById(row.id);
      }
    }
    const have = new Set(rows.map((r) => r.category));
    const missing = [...wanted].filter((c) => !have.has(c));
    if (missing.length > 0) {
      const { error } = await db
        .table("labour_entry_categories")
        .insert(missing.map((category) => ({ entry_id: entryId, category })));
      if (error) return { error: error.message };
    }
  }

  if (vendorIds !== undefined) {
    const wanted = new Set(vendorIds.map((v) => v.trim()).filter(Boolean));
    const { data } = await db
      .table("labour_entry_vendors")
      .select("id, vendor_id")
      .eq("entry_id", entryId);
    const rows = (data ?? []) as unknown as { id: string; vendor_id: string }[];

    for (const row of rows) {
      if (!wanted.has(row.vendor_id)) {
        await db.table("labour_entry_vendors").deleteById(row.id);
      }
    }
    const have = new Set(rows.map((r) => r.vendor_id));
    const missing = [...wanted].filter((v) => !have.has(v));
    if (missing.length > 0) {
      const { error } = await db
        .table("labour_entry_vendors")
        .insert(missing.map((vendor_id) => ({ entry_id: entryId, vendor_id })));
      if (error) return { error: error.message };
    }
  }

  return {};
}
