import "server-only";
import { guardMeteredCreate, recordUsage } from "./subscription";
import { withOrg } from "./with-org";
import {
  type Asset,
  type AssetComment,
  type AssetSignoff,
  type AssetKind,
} from "@/lib/design-model";

/**
 * Design vault data module (OPS-DES-001) — follows the Leads reference
 * pattern exactly: no table is touched directly, everything goes through
 * withOrg() so org_id filtering/stamping is automatic and cross-tenant
 * leakage is impossible by construction.
 *
 * Client-safe enums/types live in @/lib/design-model (this file is server-only).
 *
 * v1 carries a pasted `url` + metadata — no real file storage. Sign-offs are
 * append-only history; readers take the latest row per asset.
 */
export {
  ASSET_KINDS,
  KIND_LABELS,
  SIGNOFF_STATUSES,
  SIGNOFF_META,
  kindLabel,
  pinLabel,
  latestSignoffByAsset,
  type Asset,
  type AssetComment,
  type AssetSignoff,
  type AssetKind,
  type SignoffStatus,
} from "@/lib/design-model";

/**
 * The vault, optionally narrowed to one project.
 *
 * Filters on `project_id`, not on the typed `project_label` it used to match:
 * a label filter missed every row whose label was spelled differently and
 * matched rows from a project of the same name in spirit only. `project_id` is
 * the FK migration 0028 added and backfilled.
 */
export async function listAssets(projectId?: string): Promise<Asset[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("assets").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Asset[];
}

/** All sign-offs for the org, newest first — pair with latestSignoffByAsset(). */
export async function listSignoffs(): Promise<AssetSignoff[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("asset_signoffs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AssetSignoff[];
}

export async function getAsset(
  id: string,
): Promise<{
  asset: Asset;
  comments: AssetComment[];
  signoff: AssetSignoff | null;
} | null> {
  const { db } = await withOrg();
  const { data: asset, error } = await db
    .table("assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!asset) return null;

  const [commentsRes, signoffsRes] = await Promise.all([
    db
      .table("asset_comments")
      .select("*")
      .eq("asset_id", id)
      .order("created_at", { ascending: false }),
    db
      .table("asset_signoffs")
      .select("*")
      .eq("asset_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (commentsRes.error) throw commentsRes.error;
  if (signoffsRes.error) throw signoffsRes.error;

  const signoffs = (signoffsRes.data ?? []) as unknown as AssetSignoff[];

  return {
    asset: asset as unknown as Asset,
    comments: (commentsRes.data ?? []) as unknown as AssetComment[],
    signoff: signoffs[0] ?? null,
  };
}

export async function createAsset(input: {
  /** The real link. `project_label` is derived from it, never typed. */
  project_id?: string | null;
  name: string;
  kind: AssetKind;
  url?: string | null;
  note?: string | null;
}): Promise<{ id: string } | { error: string }> {
  // Gate BEFORE the write: a create that lands over the limit makes the
  // ledger disagree with the data it is supposed to be counting.
  const gate = await guardMeteredCreate("designs");
  if (gate.error) return { error: gate.error };
  const { db, ctx } = await withOrg();

  // Stamp the label from the chosen project's real name. PLAN-V4 §7.3 keeps
  // `project_label` as a DISPLAY FALLBACK for pre-0028 rows; it is written here
  // so old and new rows read the same, and it is never the link.
  let projectLabel: string | null = null;
  if (input.project_id) {
    const { data: proj } = await db
      .table("projects")
      .select("name")
      .eq("id", input.project_id)
      .maybeSingle();
    projectLabel = (proj as { name?: string } | null)?.name ?? null;
  }

  const { data, error } = await db.table("assets").insert({
    project_id: input.project_id ?? null,
    project_label: projectLabel,
    name: input.name,
    kind: input.kind,
    url: input.url ?? null,
    note: input.note ?? null,
    uploaded_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;
  await recordUsage("designs", 1, id);
  return { id };
}

export async function addComment(
  assetId: string,
  input: { x_pct?: number | null; y_pct?: number | null; body: string },
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { error } = await db.table("asset_comments").insert({
    asset_id: assetId,
    x_pct: input.x_pct ?? null,
    y_pct: input.y_pct ?? null,
    body: input.body,
    author: ctx.userId,
  });
  return error ? { error: error.message } : {};
}

/**
 * Record a formal sign-off — a new history row every time (append-only);
 * the latest row per asset is the current state. `signed_by`/`signed_at`
 * stamp who and when.
 */
export async function signOff(
  assetId: string,
  status: "pending" | "approved" | "rejected",
  note?: string | null,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { error } = await db.table("asset_signoffs").insert({
    asset_id: assetId,
    status,
    note: note ?? null,
    signed_by: ctx.userId,
    signed_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}
