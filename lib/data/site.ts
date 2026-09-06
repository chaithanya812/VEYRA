import "server-only";
import { withOrg } from "./with-org";
import type {
  SiteLog,
  SitePhoto,
  SiteAttendance,
  MeasurementVariance,
} from "@/lib/site-model";

/**
 * The display label for a chosen project. `project_id` is the link (migration
 * 0028); `project_label` remains only as a fallback for pre-0028 rows
 * (PLAN-V4 §7.3), so it is DERIVED here rather than typed on a form.
 */
async function labelForProject(
  db: Awaited<ReturnType<typeof withOrg>>["db"],
  projectId: string | null | undefined,
): Promise<string | null> {
  if (!projectId) return null;
  const { data } = await db
    .table("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}


/**
 * Site execution data module (FEATURE-REGISTER OPS-SITE-001) — daily logs with
 * a photo feed, geo check-in attendance, and measurement variance. Follows the
 * Leads reference pattern exactly: no table is touched directly, everything
 * goes through withOrg() so org_id filtering / stamping is automatic and
 * cross-tenant leakage is impossible by construction.
 *
 * Quantities are CONFIG the user enters; variance is a pure computation in
 * lib/site-model.ts — never an LLM output (HARD RULE 4). Photos are pasted
 * URLs in v1 — no file storage.
 */
export type { SiteLog, SitePhoto, SiteAttendance, MeasurementVariance };

/* ── Daily site logs ────────────────────────────────────────────────────────── */

export async function listSiteLogs(projectId?: string): Promise<SiteLog[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("site_logs").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SiteLog[];
}

export async function addSiteLog(input: {
  project_id?: string | null;
  log_date?: string | null;
  work_summary: string;
  photos?: { caption?: string | null; url?: string | null }[];
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const { data, error } = await db.table("site_logs").insert({
    project_id: input.project_id ?? null,
    project_label: await labelForProject(db, input.project_id),
    log_date: input.log_date || null,
    work_summary: input.work_summary.trim(),
    author: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  const photos = (input.photos ?? []).filter((p) => p.url && p.url.trim());
  if (photos.length > 0) {
    // Resolved ONCE, outside the map: the callback is not async, and every
    // photo on this log belongs to the same project anyway.
    const photoLabel = await labelForProject(db, input.project_id);
    const { error: photoError } = await db
      .table("site_photos")
      .insert(
        photos.map((p) => ({
          site_log_id: id,
          project_id: input.project_id ?? null,
          project_label: photoLabel,
          caption: p.caption?.trim() || null,
          url: p.url!.trim(),
        })),
      );
    if (photoError) return { error: photoError.message };
  }
  return { id };
}

/* ── Photo feed ─────────────────────────────────────────────────────────────── */

export async function listPhotos(projectId?: string): Promise<SitePhoto[]> {
  const { db } = await withOrg();
  let q = db.table("site_photos").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SitePhoto[];
}

export async function addPhoto(input: {
  project_id?: string | null;
  site_log_id?: string | null;
  caption?: string | null;
  url: string;
}): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();
  const { data, error } = await db.table("site_photos").insert({
    project_id: input.project_id ?? null,
    project_label: await labelForProject(db, input.project_id),
    site_log_id: input.site_log_id ?? null,
    caption: input.caption?.trim() || null,
    url: input.url.trim(),
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

/* ── Attendance (geo check-in/out) ─────────────────────────────────────────── */

export async function listAttendance(
  projectId?: string,
): Promise<SiteAttendance[]> {
  const { db } = await withOrg();
  let q = db.table("site_attendance").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("check_in", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SiteAttendance[];
}

export async function checkIn(input: {
  project_id?: string | null;
  member_name: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();
  const hasGeo =
    input.lat != null && Number.isFinite(input.lat) &&
    input.lng != null && Number.isFinite(input.lng);
  const { data, error } = await db.table("site_attendance").insert({
    project_id: input.project_id ?? null,
    project_label: await labelForProject(db, input.project_id),
    member_name: input.member_name.trim(),
    lat: hasGeo ? input.lat! : null,
    lng: hasGeo ? input.lng! : null,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

export async function checkOut(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("site_attendance").updateById(id, {
    check_out: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

/* ── Measurement variance ───────────────────────────────────────────────────── */

export async function listVariance(
  projectId?: string,
): Promise<MeasurementVariance[]> {
  const { db } = await withOrg();
  let q = db.table("measurement_variance").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MeasurementVariance[];
}

export async function addVariance(input: {
  project_id?: string | null;
  item_name: string;
  uom?: string | null;
  quoted_qty: number;
  measured_qty: number;
  note?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();
  const { data, error } = await db.table("measurement_variance").insert({
    project_id: input.project_id ?? null,
    project_label: await labelForProject(db, input.project_id),
    item_name: input.item_name.trim(),
    uom: input.uom?.trim() || null,
    quoted_qty: Number(input.quoted_qty),
    measured_qty: Number(input.measured_qty),
    note: input.note?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}
