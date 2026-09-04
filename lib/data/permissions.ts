import "server-only";
import { cache } from "react";
import { withOrg } from "./with-org";
import { getActingContext } from "./team";
import {
  can as canPure,
  capabilityDef,
  resolveActor,
  type GrantRow,
  type ResolvedRole,
  type RoleRow,
} from "@/lib/can-model";

/**
 * The server side of the permission spine — the ONLY place a real caller is
 * turned into a set of capabilities.
 *
 *   "A permission nothing enforces is worse than none: it promises a control
 *    that does not exist."
 *
 * Every rule lives in `lib/can-model.ts` as a pure function. This file does
 * three things and no more: read the caller's role and grants through
 * `withOrg()`, hand them to the resolver, and write the audit row. Putting a
 * rule here instead would put it somewhere the tests cannot reach.
 *
 * ⚠ THE ACTING MEMBER, NOT THE SESSION MEMBER. "View as" (lib/data/team.ts)
 * lets the demo tenant act as somebody else, and permissions MUST follow that,
 * or the app would show Rahul's screens with Aditi's powers — which is both
 * wrong and the most misleading possible way to be wrong.
 */

const ROLE_COLUMNS = "id, name, is_system, inherits_from, permissions";
const GRANT_COLUMNS = "role_id, module, entity, action, scope";

export interface PermissionContext {
  memberId: string;
  memberName: string;
  /** The four-value `org_members.role` tier — the floor beneath a real role. */
  tier: string;
  roleId: string | null;
  resolved: ResolvedRole;
}

/**
 * Resolve the acting caller's capabilities.
 *
 * `cache()`d for the same reason `getOrgContext` is: a single render calls
 * `can()` many times, and each uncached call would be two more round trips.
 * Request-scoped, so isolation is unchanged.
 *
 * A READ FAILURE DENIES. If `roles` or `permissions` cannot be read we hand
 * back an unresolvable context rather than an empty one, because an empty grant
 * set and a failed query are different facts and only one of them should ever
 * look like "this person has no extra powers".
 */
export const permissionContext = cache(async function permissionContext(): Promise<PermissionContext> {
  const { db } = await withOrg();
  const acting = await getActingContext();

  const base = {
    memberId: acting.member.id,
    memberName: acting.member.name,
    tier: acting.member.role,
    roleId: null as string | null,
  };

  // `role_id` arrived in 0035 and is null for every member until a tenant
  // assigns one. Read it off the member row rather than trusting the cached
  // Member shape, which predates the column.
  const memberRow = await db
    .table("org_members")
    .select("role_id")
    .eq("id", acting.member.id)
    .maybeSingle();
  if (memberRow.error) {
    return { ...base, resolved: { keys: new Set(), chain: [], all: false, error: "member-read-failed" } };
  }
  const roleId = (memberRow.data as { role_id?: string | null } | null)?.role_id ?? null;

  // No role means the tier floor, and the tier needs neither of these reads.
  if (!roleId) {
    return { ...base, resolved: resolveActor([], [], null, acting.member.role) };
  }

  const [rolesRes, grantsRes] = await Promise.all([
    db.table("roles").select(ROLE_COLUMNS),
    db.table("permissions").select(GRANT_COLUMNS),
  ]);
  if (rolesRes.error || grantsRes.error) {
    return { ...base, roleId, resolved: { keys: new Set(), chain: [], all: false, error: "grant-read-failed" } };
  }

  return {
    ...base,
    roleId,
    resolved: resolveActor(
      (rolesRes.data ?? []) as unknown as RoleRow[],
      (grantsRes.data ?? []) as unknown as GrantRow[],
      roleId,
      acting.member.role,
    ),
  };
});

/**
 * `await can("procurement.po.approve")` — the check every server action makes.
 *
 * Returns a boolean and never throws. If resolving the caller itself throws
 * (no membership, a dead connection) that is caught into a DENY, never into an
 * allow: the one direction a permission check may fail is closed.
 */
export async function can(capability: string): Promise<boolean> {
  try {
    const ctx = await permissionContext();
    return canPure(ctx.resolved, capability);
  } catch {
    return false;
  }
}

/**
 * The server-action form: `const denied = await requireCan("hr.leave.approve");
 * if (denied) return denied;`
 *
 * Returns `null` when allowed and `{ error }` when not, matching what every
 * action in this codebase already returns, so a guard is two lines at the top
 * of a writer and never changes its signature.
 *
 * The message names the capability's own label rather than its key — "You do
 * not have permission to Approve/Reject PO" is something a user can take to
 * their admin; "missing procurement.po.approve" is not.
 */
export async function requireCan(capability: string): Promise<{ error: string } | null> {
  if (await can(capability)) return null;
  const def = capabilityDef(capability);
  return {
    error: def
      ? `You do not have permission to ${def.label.toLowerCase()} in ${def.group}.`
      : "You do not have permission to do that.",
  };
}

/** Resolve several capabilities at once, for a screen deciding what to render. */
export async function canAll(capabilities: string[]): Promise<Record<string, boolean>> {
  const ctx = await permissionContext().catch(() => null);
  const out: Record<string, boolean> = {};
  for (const c of capabilities) out[c] = ctx ? canPure(ctx.resolved, c) : false;
  return out;
}

/* ── The audit ledger ─────────────────────────────────────────────────────── */

export interface AuditInput {
  entity: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Append one row to `audit_events`. Append-only: nothing here updates or
 * deletes, and a correction is a new row.
 *
 * ⚠ NEVER THROWS, and never returns an error the caller is expected to surface.
 * An audit write that can fail a business write would mean a working system
 * refusing to record a PO because the log was briefly unavailable — so the
 * write wins and the failure is logged. The trade is deliberate and stated
 * here so nobody "fixes" it into a throw later.
 *
 * `actor_name` is denormalised beside the FK because `actor_member_id` is
 * ON DELETE SET NULL: removing a member must not erase the record of what they
 * did, and a null FK still has to render a name.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { db } = await withOrg();
    const ctx = await permissionContext();
    const { error } = await db.table("audit_events").insert({
      actor_member_id: ctx.memberId,
      actor_name: ctx.memberName,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      action: input.action,
      before: input.before === undefined ? null : input.before,
      after: input.after === undefined ? null : input.after,
    });
    if (error) console.error("[audit] insert failed:", error.message);
  } catch (e) {
    console.error("[audit] insert threw:", e instanceof Error ? e.message : e);
  }
}

export interface AuditRow {
  id: string;
  actor_member_id: string | null;
  actor_name: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  before: unknown;
  after: unknown;
  at: string;
}

const AUDIT_COLUMNS =
  "id, actor_member_id, actor_name, entity, entity_id, action, before, after, at";

/** One entity's history, newest first — the `Audits` tab and `Audit` button. */
export async function auditFor(entity: string, entityId: string): Promise<AuditRow[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("audit_events")
    .select(AUDIT_COLUMNS)
    .eq("entity", entity)
    .eq("entity_id", entityId)
    .order("at", { ascending: false });
  // Report the error as itself (§2 rule 12) rather than as an empty history,
  // which would read as "nothing ever happened to this record".
  if (error) throw new Error(`audit read failed: ${error.message}`);
  return (data ?? []) as unknown as AuditRow[];
}

/**
 * The history of MANY entities at once — one screen's worth of rows rather than
 * one record's.
 *
 * Financial Planning needs this because a project's money history is spread
 * over its contracts and their milestones, and asking per-row would be a query
 * per milestone. An empty id list short-circuits: `in("entity_id", [])` is a
 * query that can only return nothing, so it is not worth making.
 */
export async function auditForEntities(
  entity: string,
  ids: string[],
): Promise<AuditRow[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const { db } = await withOrg();
  const { data, error } = await db
    .table("audit_events")
    .select(AUDIT_COLUMNS)
    .eq("entity", entity)
    .in("entity_id", unique)
    .order("at", { ascending: false });
  if (error) throw new Error(`audit read failed: ${error.message}`);
  return (data ?? []) as unknown as AuditRow[];
}

/** The tenant's recent activity, newest first. */
export async function recentAudit(limit = 50): Promise<AuditRow[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("audit_events")
    .select(AUDIT_COLUMNS)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`audit read failed: ${error.message}`);
  return (data ?? []) as unknown as AuditRow[];
}
