import "server-only";
import { withOrg } from "./with-org";
import { recordAudit } from "./permissions";
import {
  CAPABILITIES,
  enableAllKeys,
  isCapability,
  parseCapability,
  resolveRole,
  type GrantRow,
  type RoleRow,
} from "@/lib/can-model";

/**
 * Authoring roles — the write side of the permission spine.
 *
 * The READ side (`can()`, inheritance resolution) is `lib/data/permissions.ts`
 * over `lib/can-model.ts`. This file only ever writes, and it writes
 * CAPABILITIES — three segments — where `lib/data/config.ts` writes the older
 * two-segment (module, action) matrix.
 *
 * Both land in the same `permissions` table and both keep working: a
 * two-segment grant is stored with `entity = '*'`, and the resolver expands a
 * `'*'` entity across that module's matching actions. So an older grant still
 * means what it always meant. What the old writers CANNOT express is the
 * distinction the frames nest — approving a PO versus approving a material
 * request — which is the whole reason this file exists.
 *
 * ⚠ SYSTEM ROLES ARE NOT EDITABLE. Frame `110403` says so in words ("global
 * roles cannot be edited or deleted") and every writer here re-checks it.
 * A rule enforced only by a disabled button is not a rule.
 */

export interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  inherits_from: string | null;
  /** Members currently holding this role. */
  userCount: number;
}

const ROLE_COLUMNS = "id, name, description, is_system, inherits_from, permissions";

/** Every role in the tenant, with how many people hold each. */
export async function listRoleDetails(): Promise<RoleDetail[]> {
  const { db } = await withOrg();
  const [rolesRes, membersRes] = await Promise.all([
    db.table("roles").select(ROLE_COLUMNS).order("created_at", { ascending: true }),
    db.table("org_members").select("role_id"),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (membersRes.error) throw membersRes.error;

  const counts = new Map<string, number>();
  for (const m of (membersRes.data ?? []) as unknown as { role_id: string | null }[]) {
    if (m.role_id) counts.set(m.role_id, (counts.get(m.role_id) ?? 0) + 1);
  }

  return ((rolesRes.data ?? []) as unknown as (RoleRow & { description: string | null })[]).map(
    (r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      is_system: r.is_system,
      inherits_from: r.inherits_from,
      userCount: counts.get(r.id) ?? 0,
    }),
  );
}

/**
 * The capability keys a role holds — split into its OWN grants and the ones it
 * only has by inheritance.
 *
 * Kept apart because the editor must not let somebody tick an inherited box and
 * believe they granted it, nor untick one and believe they revoked it. An
 * inherited capability is the parent's to remove.
 */
export async function roleCapabilities(roleId: string): Promise<{
  own: string[];
  inherited: string[];
  /** Set when the chain is broken — a cycle or a missing parent. */
  error: string | null;
  all: boolean;
}> {
  const { db } = await withOrg();
  const [rolesRes, grantsRes] = await Promise.all([
    db.table("roles").select(ROLE_COLUMNS),
    db.table("permissions").select("role_id, module, entity, action, scope"),
  ]);
  if (rolesRes.error || grantsRes.error) {
    return { own: [], inherited: [], error: "grant-read-failed", all: false };
  }
  const roles = (rolesRes.data ?? []) as unknown as RoleRow[];
  const grants = (grantsRes.data ?? []) as unknown as GrantRow[];

  const full = resolveRole(roles, grants, roleId);
  // Resolving the role ALONE, with its parent link cut, is what separates its
  // own grants from the inherited ones.
  const solo = resolveRole(
    roles.map((r) => (r.id === roleId ? { ...r, inherits_from: null } : r)),
    grants,
    roleId,
  );
  const own = [...solo.keys];
  const inherited = [...full.keys].filter((k) => !solo.keys.has(k));
  return { own, inherited, error: full.error, all: full.all };
}

async function editableRole(
  roleId: string,
): Promise<{ role: RoleRow } | { error: string }> {
  const { db } = await withOrg();
  const { data } = await db.table("roles").select(ROLE_COLUMNS).eq("id", roleId).maybeSingle();
  if (!data) return { error: "That role is not in this workspace." };
  const role = data as unknown as RoleRow;
  if (role.is_system) {
    return { error: "Global roles cannot be edited or deleted." };
  }
  return { role };
}

/** Grant or revoke ONE capability on a role. */
export async function setCapability(
  roleId: string,
  key: string,
  on: boolean,
): Promise<{ error?: string }> {
  const parsed = parseCapability(key);
  if (!parsed) return { error: "That permission does not exist." };

  const guard = await editableRole(roleId);
  if ("error" in guard) return { error: guard.error };

  const { db } = await withOrg();
  const { data: existing } = await db
    .table("permissions")
    .select("id")
    .eq("role_id", roleId)
    .eq("module", parsed.module)
    .eq("entity", parsed.entity)
    .eq("action", parsed.action)
    .maybeSingle();

  if (on) {
    if (existing) return {};
    const { error } = await db.table("permissions").insert({
      role_id: roleId,
      module: parsed.module,
      entity: parsed.entity,
      action: parsed.action,
      // Scope is the older axis and is not surfaced per capability in the
      // frames; org is the widest and matches what the two-segment editor
      // defaults new grants to, so the two writers cannot disagree.
      scope: "org",
    });
    if (error) return { error: error.message };
  } else {
    if (!existing) return {};
    const { error } = await db
      .table("permissions")
      .deleteById((existing as unknown as { id: string }).id);
    if (error) return { error: error.message };
  }

  await recordAudit({
    entity: "role",
    entityId: roleId,
    action: on ? "grant" : "revoke",
    before: { capability: key, granted: !on },
    after: { capability: key, granted: on, name: guard.role.name },
  });
  return {};
}

/**
 * The frame's `Enable All` on one group.
 *
 * It never grants a destructive capability. Frame `110429` shows Delete
 * Material Request and Delete Vendor UNCHECKED beside checked siblings — the
 * point of a bulk control is convenience, and quietly handing somebody the
 * ability to delete is not a convenience.
 */
export async function setGroup(
  roleId: string,
  group: string,
  on: boolean,
): Promise<{ error?: string; changed: number }> {
  const guard = await editableRole(roleId);
  if ("error" in guard) return { error: guard.error, changed: 0 };

  // Turning a group OFF revokes everything in it, destructive included —
  // removing a power is never the dangerous direction.
  const keys = on
    ? enableAllKeys(group)
    : CAPABILITIES.filter((c) => c.group === group).map((c) => c.key);

  let changed = 0;
  for (const key of keys) {
    const r = await setCapability(roleId, key, on);
    if (r.error) return { error: r.error, changed };
    changed++;
  }
  return { changed };
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function createRole(input: {
  name: string;
  description?: string | null;
  inherits_from?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const name = cleanName(input.name);
  if (!name) return { error: "A role needs a name." };
  const description = input.description?.trim() || null;
  if (description && description.length > 155) {
    return { error: "Keep the description to 155 characters." };
  }

  const { db } = await withOrg();
  if (input.inherits_from) {
    const { data: parent } = await db
      .table("roles")
      .select("id")
      .eq("id", input.inherits_from)
      .maybeSingle();
    if (!parent) return { error: "That parent role is not in this workspace." };
  }

  const { data, error } = await db.table("roles").insert({
    name,
    description,
    is_system: false,
    inherits_from: input.inherits_from || null,
    permissions: {},
  });
  if (error) return { error: error.message };
  const id = (data?.[0] as { id: string }).id;
  await recordAudit({
    entity: "role",
    entityId: id,
    action: "create",
    before: null,
    after: { name, description, inherits_from: input.inherits_from ?? null },
  });
  return { id };
}

export async function updateRole(
  roleId: string,
  patch: { name?: string; description?: string | null; inherits_from?: string | null },
): Promise<{ error?: string }> {
  const guard = await editableRole(roleId);
  if ("error" in guard) return { error: guard.error };
  const before = guard.role;

  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { error: "A role needs a name." };
    next.name = name;
  }
  if (patch.description !== undefined) {
    const d = patch.description?.trim() || null;
    if (d && d.length > 155) return { error: "Keep the description to 155 characters." };
    next.description = d;
  }

  if (patch.inherits_from !== undefined) {
    const parentId = patch.inherits_from || null;
    if (parentId) {
      const check = await inheritanceWouldBreak(roleId, parentId);
      if (check) return { error: check };
    }
    next.inherits_from = parentId;
  }
  if (Object.keys(next).length === 0) return {};

  const { db } = await withOrg();
  const { error } = await db.table("roles").updateById(roleId, next);
  if (error) {
    return {
      error:
        error.code === "23514"
          ? "Keep the description to 155 characters."
          : error.message,
    };
  }

  await recordAudit({
    entity: "role",
    entityId: roleId,
    action: "update",
    before: {
      name: before.name,
      description: (before as unknown as { description: string | null }).description ?? null,
      inherits_from: before.inherits_from,
    },
    after: { ...next, name: (next.name as string) ?? before.name },
  });
  return {};
}

/**
 * Would pointing `roleId` at `parentId` break the chain?
 *
 * Postgres rejects only the zero-length cycle (`roles_no_self_inherit`); a
 * longer loop is not something a CHECK can see, so it is caught here BEFORE the
 * write. The resolver already fails closed on a cycle, which means a saved loop
 * would not leak permissions — it would revoke every one the role had, silently.
 * Refusing up front is the difference between a clear error and a role that
 * mysteriously stops working.
 */
async function inheritanceWouldBreak(
  roleId: string,
  parentId: string,
): Promise<string | null> {
  if (roleId === parentId) return "A role cannot inherit from itself.";
  const { db } = await withOrg();
  const { data } = await db.table("roles").select("id, name, inherits_from");
  const rows = (data ?? []) as unknown as { id: string; name: string; inherits_from: string | null }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (!byId.has(parentId)) return "That parent role is not in this workspace.";

  const seen = new Set<string>([roleId]);
  let cursor: string | null = parentId;
  while (cursor) {
    if (seen.has(cursor)) {
      const who = byId.get(parentId)?.name ?? "That role";
      return `${who} already inherits from this role, directly or through another — that would make a loop.`;
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.inherits_from ?? null;
  }
  return null;
}

/**
 * Delete a custom role.
 *
 * Refused while anybody still holds it: reassigning those people is a decision,
 * and silently dropping them to the tier floor would change what they can do
 * without anyone choosing that. Children are orphaned, not deleted — 0035's FK
 * is ON DELETE SET NULL for exactly this reason.
 */
export async function deleteRole(roleId: string): Promise<{ error?: string }> {
  const guard = await editableRole(roleId);
  if ("error" in guard) return { error: guard.error };

  const { db } = await withOrg();
  const { data: holders } = await db
    .table("org_members")
    .select("id")
    .eq("role_id", roleId);
  const n = ((holders ?? []) as unknown[]).length;
  if (n > 0) {
    return {
      error: `${n} ${n === 1 ? "person still holds" : "people still hold"} this role. Move them to another role first.`,
    };
  }

  const { data: grants } = await db.table("permissions").select("id").eq("role_id", roleId);
  for (const g of (grants ?? []) as unknown as { id: string }[]) {
    await db.table("permissions").deleteById(g.id);
  }

  const { error } = await db.table("roles").deleteById(roleId);
  if (error) return { error: error.message };

  await recordAudit({
    entity: "role",
    entityId: roleId,
    action: "delete",
    before: { name: guard.role.name },
    after: null,
  });
  return {};
}

/** Assign a member to a role, or clear it back to the tier floor. */
export async function setMemberRole(
  memberId: string,
  roleId: string | null,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  if (roleId) {
    const { data: role } = await db.table("roles").select("id").eq("id", roleId).maybeSingle();
    if (!role) return { error: "That role is not in this workspace." };
  }
  const { error } = await db.table("org_members").updateById(memberId, { role_id: roleId });
  return error ? { error: error.message } : {};
}

/** Guard for the editor: every key it offers must be in the registry. */
export function knownCapability(key: string): boolean {
  return isCapability(key);
}
