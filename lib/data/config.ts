import "server-only";
import { withOrg } from "./with-org";
import {
  formatDocNumber,
  type DocType,
  type NumberingSeries,
  type Permission,
  type PermissionAction,
  type PermissionModule,
  type PermissionScope,
  type Role,
} from "@/lib/permissions-model";

/**
 * Settings/config data module — numbering series (PROC-CFG-005) and the
 * roles & permissions matrix (OPS-HR-003).
 *
 * Same shape as leads.ts: every tenant read/write goes through withOrg(), so
 * `org_id` filtering/stamping is automatic and cross-tenant leakage is
 * impossible by construction. Client-safe enums/types/pure helpers live in
 * @/lib/permissions-model (this file is server-only).
 *
 * Upserts are check-then-write on the (org, …) unique keys — mirroring the
 * leads phone-dedupe pattern. current_int is NEVER touched here: config
 * edits must not reset or renumber anything already issued.
 */

/* ── Numbering series ─────────────────────────────────────────────────────── */

export async function listNumberingSeries(): Promise<NumberingSeries[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("numbering_series")
    .select("*")
    .order("doc_type", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as NumberingSeries[];
}

/** Insert or update by (org, doc_type). Never mutates current_int. */
export async function upsertNumberingSeries(input: {
  doc_type: DocType;
  prefix: string;
  fy_segment: boolean;
  padding: number;
}): Promise<{ error?: string }> {
  const { db } = await withOrg();

  const { data: existing } = await db
    .table("numbering_series")
    .select("id")
    .eq("doc_type", input.doc_type)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .table("numbering_series")
      .updateById((existing as unknown as { id: string }).id, {
        prefix: input.prefix,
        fy_segment: input.fy_segment,
        padding: input.padding,
        updated_at: new Date().toISOString(),
      });
    return error ? { error: error.message } : {};
  }

  const { error } = await db.table("numbering_series").insert({
    doc_type: input.doc_type,
    prefix: input.prefix,
    fy_segment: input.fy_segment,
    padding: input.padding,
  });
  return error ? { error: error.message } : {};
}

/**
 * What the NEXT number for a doc_type would look like, given its saved config
 * and today's date. Preview only — nothing is persisted and current_int does
 * not advance.
 */
export async function previewNextNumber(
  doc_type: DocType,
): Promise<string | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("numbering_series")
    .select("*")
    .eq("doc_type", doc_type)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const s = data as unknown as NumberingSeries;
  return formatDocNumber(
    {
      prefix: s.prefix,
      fy_segment: s.fy_segment,
      padding: s.padding,
      current_int: s.current_int + 1,
    },
    new Date(),
  );
}

/* ── Roles & permissions ──────────────────────────────────────────────────── */

/** The org's roles, from the EXISTING roles table (migration 0001). */
export async function listRoles(): Promise<Role[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("roles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Role[];
}

export async function listPermissions(roleId: string): Promise<Permission[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("permissions")
    .select("*")
    .eq("role_id", roleId)
    .order("module", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Permission[];
}

/**
 * Grant or update one (role, module, action) → scope cell. The role is first
 * resolved through the org-scoped accessor so a caller can never attach a
 * permission to another tenant's role id (there is deliberately no FK).
 */
export async function setPermission(
  roleId: string,
  module: PermissionModule,
  action: PermissionAction,
  scope: PermissionScope,
): Promise<{ error?: string }> {
  const { db } = await withOrg();

  const { data: role } = await db
    .table("roles")
    .select("id")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) return { error: "Role not found." };

  const { data: existing } = await db
    .table("permissions")
    .select("id")
    .eq("role_id", roleId)
    .eq("module", module)
    .eq("action", action)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .table("permissions")
      .updateById((existing as unknown as { id: string }).id, { scope });
    return error ? { error: error.message } : {};
  }

  const { error } = await db.table("permissions").insert({
    role_id: roleId,
    module,
    action,
    scope,
  });
  return error ? { error: error.message } : {};
}

/** Revoke one (role, module, action) grant. Absent grant revokes cleanly. */
export async function removePermission(
  roleId: string,
  module: PermissionModule,
  action: PermissionAction,
): Promise<{ error?: string }> {
  const { db } = await withOrg();

  const { data: existing } = await db
    .table("permissions")
    .select("id")
    .eq("role_id", roleId)
    .eq("module", module)
    .eq("action", action)
    .maybeSingle();
  if (!existing) return {};

  const { error } = await db
    .table("permissions")
    .deleteById((existing as unknown as { id: string }).id);
  return error ? { error: error.message } : {};
}
