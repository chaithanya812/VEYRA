import "server-only";
import { admin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/session";
import type { TenantTable } from "./tables";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * withOrg — the ONE tenant-isolation accessor.
 * ────────────────────────────────────────────────────────────────────────────
 * With RLS OFF, this is the only thing preventing cross-tenant data leakage.
 * Feature code must never import the raw `admin` client; it goes through here.
 *
 *   Reads   → automatically filtered by `org_id`.
 *   Inserts → automatically stamped with `org_id`.
 *   Updates/Deletes → automatically scoped by `org_id` AND `id`.
 *
 * Usage (in a server action or route handler):
 *
 *   const { db, ctx } = await withOrg();
 *   const { data } = await db.table("leads").select().order("created_at", { ascending: false });
 *   await db.table("leads").insert({ name, phone });
 *   await db.table("leads").updateById(id, { status: "won" });
 */

export class NoOrgMembershipError extends Error {
  constructor() {
    super("The current user is not an active member of any organization.");
    this.name = "NoOrgMembershipError";
  }
}

export interface OrgContext {
  orgId: string;
  userId: string;
  role: string;
  memberId: string;
}

/** Resolve the caller's active org membership. Throws if none. */
export async function getOrgContext(): Promise<OrgContext> {
  const user = await requireUser();
  const { data, error } = await admin
    .from("org_members")
    .select("id, org_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NoOrgMembershipError();

  return {
    orgId: data.org_id as string,
    userId: user.id,
    role: data.role as string,
    memberId: data.id as string,
  };
}

type SelectOptions = { count?: "exact" | "planned" | "estimated"; head?: boolean };

/** A single org-scoped table handle. Every operation is bound to `orgId`. */
function scopedTable(orgId: string, table: TenantTable) {
  return {
    /** Read builder, pre-filtered to this org. Chain .eq/.order/.range/.ilike etc. */
    select(columns = "*", options?: SelectOptions) {
      return admin.from(table).select(columns, options).eq("org_id", orgId);
    },
    /** Insert one or many rows; `org_id` is stamped on each. Returns the inserted rows. */
    insert<T extends Record<string, unknown>>(values: T | T[]) {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...v,
        org_id: orgId,
      }));
      return admin.from(table).insert(rows).select();
    },
    /** Update a single row by id, scoped to this org. */
    updateById(id: string, patch: Record<string, unknown>) {
      return admin
        .from(table)
        .update(patch)
        .eq("org_id", orgId)
        .eq("id", id)
        .select();
    },
    /** Hard delete a single row by id, scoped to this org. Prefer soft-delete flags where a table has them. */
    deleteById(id: string) {
      return admin.from(table).delete().eq("org_id", orgId).eq("id", id);
    },
  };
}

export interface OrgDb {
  orgId: string;
  table(name: TenantTable): ReturnType<typeof scopedTable>;
}

function makeOrgDb(orgId: string): OrgDb {
  return {
    orgId,
    table: (name) => scopedTable(orgId, name),
  };
}

/** Resolve org context and hand back a scoped db. The primary entry point. */
export async function withOrg(): Promise<{ db: OrgDb; ctx: OrgContext }> {
  const ctx = await getOrgContext();
  return { db: makeOrgDb(ctx.orgId), ctx };
}
