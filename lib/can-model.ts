/**
 * THE PERMISSION SPINE (migration 0035).
 *
 *   "A permission nothing enforces is worse than none: it promises a control
 *    that does not exist."
 *
 * Everything here is PURE. No DB, no request, no `cookies()`. The server
 * wrapper that resolves a real caller lives in `lib/data/permissions.ts` and
 * calls into here and nowhere else, so the rules are testable without a
 * database and cannot differ between what a screen hides and what a write
 * refuses.
 *
 * It is a separate module from `lib/permissions-model.ts` — which owns the
 * (module, action, scope) vocabulary and the numbering series — because this
 * file is imported by client components for the Edit Role tree, and keeping
 * the registry beside the resolver means the two can never drift.
 *
 * A capability is THREE segments — `module.entity.action`, e.g.
 * `procurement.po.approve`. Two segments could not tell "approve a purchase
 * order" from "approve a material request", and those are different jobs held
 * by different people (frames `110413`–`110429` nest exactly this way).
 *
 * FAIL CLOSED is the whole design. An unknown capability, a missing role, an
 * unresolvable inheritance chain, a cycle, a malformed grant — every one of
 * them denies. `can()` returns a boolean and never throws, because a check
 * that throws is a check somebody eventually wraps in a try/catch returning
 * true.
 */

/** One leaf of the permission tree. `destructive` leaves are opt-in per role. */
export interface CapabilityDef {
  /** `module.entity.action` */
  key: string;
  /** The card this sits under in Edit Role — frame `110413`. */
  group: string;
  /** The parent capability, for the nested rows inside a group. */
  parent: string;
  label: string;
  /**
   * Frame `110429`: `Delete Material Request` and `Delete Vendor` render
   * UNCHECKED beside checked siblings. Destructive capabilities are never
   * granted by a default or by "Enable All" — they are chosen, one at a time.
   */
  destructive?: boolean;
}

/**
 * The closed registry. `can()` denies any key absent from it, so a typo in a
 * server action is a locked door rather than an open one.
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  // ── Sales ───────────────────────────────────────────────────────────────
  { key: "leads.lead.view", group: "Leads", parent: "Leads", label: "View" },
  { key: "leads.lead.create", group: "Leads", parent: "Leads", label: "Add/Update" },
  { key: "leads.lead.edit", group: "Leads", parent: "Leads", label: "Edit" },
  { key: "leads.lead.delete", group: "Leads", parent: "Leads", label: "Delete", destructive: true },
  { key: "quotations.quotation.view", group: "Quotations", parent: "Quotations", label: "View" },
  { key: "quotations.quotation.create", group: "Quotations", parent: "Quotations", label: "Add/Update" },
  { key: "quotations.quotation.approve", group: "Quotations", parent: "Quotations", label: "Approve/Reject" },
  { key: "quotations.quotation.delete", group: "Quotations", parent: "Quotations", label: "Delete", destructive: true },

  // ── Projects & tasks ────────────────────────────────────────────────────
  { key: "projects.project.view", group: "Projects", parent: "Projects", label: "View" },
  { key: "projects.project.create", group: "Projects", parent: "Projects", label: "Add/Update" },
  { key: "projects.project.edit", group: "Projects", parent: "Projects", label: "Edit" },
  { key: "projects.task.view", group: "Tasks", parent: "Tasks", label: "All Task" },
  { key: "projects.task.delete", group: "Tasks", parent: "Tasks", label: "Delete Task", destructive: true },

  // ── Items & inventory ───────────────────────────────────────────────────
  { key: "items.item.view", group: "Inventory", parent: "Master Catalog", label: "View" },
  { key: "items.item.create", group: "Inventory", parent: "Master Catalog", label: "Add/Update" },
  { key: "inventory.warehouse.view", group: "Inventory", parent: "Warehouses", label: "View" },
  { key: "inventory.warehouse.create", group: "Inventory", parent: "Warehouses", label: "Add/Update" },
  { key: "inventory.company_warehouse.view", group: "Inventory", parent: "Warehouses", label: "Company Warehouses" },
  { key: "inventory.project_warehouse.view", group: "Inventory", parent: "Warehouses", label: "All Project Warehouses" },
  { key: "inventory.movement.create", group: "Inventory", parent: "Stock", label: "Record movement" },

  // ── Procurement — the frame's deepest nest ──────────────────────────────
  { key: "procurement.acceptance.approve", group: "Procurement", parent: "Acceptance", label: "Acceptance" },
  { key: "procurement.rfq.view", group: "Procurement", parent: "RFQ", label: "View" },
  { key: "procurement.rfq.create", group: "Procurement", parent: "RFQ", label: "Add/Update" },
  { key: "procurement.mr.view", group: "Procurement", parent: "Requests", label: "View MR" },
  { key: "procurement.mr.create", group: "Procurement", parent: "Requests", label: "Add/Update MR" },
  { key: "procurement.mr.approve", group: "Procurement", parent: "Requests", label: "Approve/Reject MR" },
  { key: "procurement.mr.delete", group: "Procurement", parent: "Requests", label: "Delete MR", destructive: true },
  { key: "procurement.po.view", group: "Procurement", parent: "Orders", label: "View PO" },
  { key: "procurement.po.create", group: "Procurement", parent: "Orders", label: "Add/Update PO" },
  { key: "procurement.po.approve", group: "Procurement", parent: "Orders", label: "Approve/Reject PO" },

  // ── Vendors ─────────────────────────────────────────────────────────────
  { key: "vendors.vendor.view", group: "Vendors", parent: "My Vendors", label: "View" },
  { key: "vendors.vendor.create", group: "Vendors", parent: "My Vendors", label: "Add" },
  { key: "vendors.document.view", group: "Vendors", parent: "My Vendors", label: "Documents" },
  { key: "vendors.project.view", group: "Vendors", parent: "My Vendors", label: "Projects" },
  { key: "vendors.vendor.delete", group: "Vendors", parent: "My Vendors", label: "Delete", destructive: true },

  // ── Money ───────────────────────────────────────────────────────────────
  { key: "billing.invoice.view", group: "Invoice", parent: "Invoice", label: "View" },
  { key: "billing.invoice.create", group: "Invoice", parent: "Invoice", label: "Add/Update" },
  { key: "billing.payment.view", group: "Finance", parent: "Payments", label: "View" },
  { key: "billing.payment.create", group: "Finance", parent: "Payments", label: "Record" },
  { key: "billing.payment.approve", group: "Finance", parent: "Payments", label: "Approve/Reject" },
  /**
   * The register's P1 field-level case: a supervisor sees the BOQ WITHOUT its
   * cost columns. This is the one capability that hides a COLUMN rather than
   * blocking an action, and it is why `can()` had to be callable from a read
   * and not only from a write.
   */
  { key: "billing.cost.view", group: "Finance", parent: "Payments", label: "See cost columns" },

  // ── HR ──────────────────────────────────────────────────────────────────
  { key: "hr.attendance.view", group: "HR", parent: "Attendance", label: "View team attendance" },
  { key: "hr.leave.approve", group: "HR", parent: "Attendance", label: "Approve/Reject leave" },
  { key: "hr.wfh.approve", group: "HR", parent: "Attendance", label: "Approve/Reject WFH" },
  { key: "hr.holiday.edit", group: "HR", parent: "Attendance", label: "Edit the holiday calendar" },

  // ── Reports (frame `110429`'s six) ──────────────────────────────────────
  { key: "reports.payment.view", group: "Reports", parent: "Reports", label: "Payment" },
  { key: "reports.client.view", group: "Reports", parent: "Reports", label: "Client" },
  { key: "reports.user.view", group: "Reports", parent: "Reports", label: "User" },
  { key: "reports.labour.view", group: "Reports", parent: "Reports", label: "Labour" },
  { key: "reports.lead.view", group: "Reports", parent: "Reports", label: "Lead" },
  { key: "reports.financial.view", group: "Reports", parent: "Reports", label: "Financial" },

  // ── Admin ───────────────────────────────────────────────────────────────
  { key: "settings.user.view", group: "Settings", parent: "Settings", label: "View users" },
  { key: "settings.user.edit", group: "Settings", parent: "Settings", label: "Manage users" },
  { key: "settings.role.view", group: "Settings", parent: "Settings", label: "View roles" },
  { key: "settings.role.edit", group: "Settings", parent: "Settings", label: "Manage roles" },
  { key: "settings.workspace.edit", group: "Settings", parent: "Settings", label: "Workspace settings" },
];

const CAPABILITY_INDEX: ReadonlyMap<string, CapabilityDef> = new Map(
  CAPABILITIES.map((c) => [c.key, c]),
);

/** Is this string a capability the registry knows? Unknown ⇒ deny. */
export function isCapability(key: string): boolean {
  return CAPABILITY_INDEX.has(key);
}

export function capabilityDef(key: string): CapabilityDef | null {
  return CAPABILITY_INDEX.get(key) ?? null;
}

/** The registry grouped for Edit Role — group → parent → leaves, order kept. */
export function capabilityTree(): {
  group: string;
  parents: { parent: string; caps: CapabilityDef[] }[];
}[] {
  const groups: { group: string; parents: { parent: string; caps: CapabilityDef[] }[] }[] = [];
  for (const cap of CAPABILITIES) {
    let g = groups.find((x) => x.group === cap.group);
    if (!g) {
      g = { group: cap.group, parents: [] };
      groups.push(g);
    }
    let p = g.parents.find((x) => x.parent === cap.parent);
    if (!p) {
      p = { parent: cap.parent, caps: [] };
      g.parents.push(p);
    }
    p.caps.push(cap);
  }
  return groups;
}

/**
 * What "Enable All" on a group grants: every leaf in it EXCEPT the destructive
 * ones. Frame `110429` shows `Delete Material Request` and `Delete Vendor`
 * unchecked beside checked siblings — deleting is chosen, never swept in.
 */
export function enableAllKeys(group: string): string[] {
  return CAPABILITIES.filter((c) => c.group === group && !c.destructive).map((c) => c.key);
}

/* ── Grants and resolution ────────────────────────────────────────────────── */

/** A `permissions` row, as the resolver needs it. */
export interface GrantRow {
  role_id: string;
  module: string;
  entity: string;
  action: string;
  scope?: string | null;
}

/** A `roles` row, as the resolver needs it. */
export interface RoleRow {
  id: string;
  name: string;
  is_system: boolean;
  inherits_from: string | null;
  /** 0001's jsonb escape hatch. `{"all": true}` is the Owner system role. */
  permissions?: unknown;
}

/** Does this role's jsonb say "everything"? Anything else is not a grant. */
function grantsAll(role: RoleRow): boolean {
  const p = role.permissions;
  return typeof p === "object" && p !== null && (p as { all?: unknown }).all === true;
}

export interface ResolvedRole {
  /** Capability keys this role effectively holds — own grants plus inherited. */
  keys: ReadonlySet<string>;
  /** The role ids walked, nearest first. Empty when nothing resolved. */
  chain: string[];
  /** True when a system role grants everything — `can()` short-circuits. */
  all: boolean;
  /** Set when resolution FAILED. A failed resolution grants nothing. */
  error: string | null;
}

const DENY: ResolvedRole = { keys: new Set(), chain: [], all: false, error: "unresolved" };

/**
 * Resolve a role to its effective capability keys: its own grants plus every
 * ancestor's, nearest first.
 *
 * The chain is a self-reference with no depth limit, so it is walked with a
 * seen-set — the same shape as `managerChain` in `lib/workspace-model.ts`. A
 * CYCLE DENIES EVERYTHING rather than returning what it had collected before
 * looping: a role whose inheritance is broken is a role nobody has checked, and
 * quietly handing back a partial grant set is how a permission system starts
 * lying. A missing parent is the same failure — the chain does not resolve, so
 * it does not grant.
 */
export function resolveRole(
  roles: readonly RoleRow[],
  grants: readonly GrantRow[],
  roleId: string | null | undefined,
): ResolvedRole {
  if (!roleId) return { ...DENY, error: "no-role" };

  const byId = new Map(roles.map((r) => [r.id, r]));
  const chain: string[] = [];
  const seen = new Set<string>();

  let cursor: string | null = roleId;
  while (cursor) {
    if (seen.has(cursor)) return { ...DENY, error: "cycle" };
    seen.add(cursor);
    const role: RoleRow | undefined = byId.get(cursor);
    if (!role) return { ...DENY, error: chain.length ? "missing-parent" : "missing-role" };
    chain.push(role.id);
    if (grantsAll(role)) return { keys: new Set(), chain, all: true, error: null };
    cursor = role.inherits_from;
  }

  const keys = new Set<string>();
  for (const g of grants) {
    if (!chain.includes(g.role_id)) continue;
    // A grant naming a capability the registry does not know is IGNORED, never
    // honoured — the registry is the closed list, the table is only storage.
    if (g.entity === "*") {
      for (const c of CAPABILITIES) {
        if (c.key.startsWith(`${g.module}.`) && c.key.endsWith(`.${g.action}`)) keys.add(c.key);
      }
    } else {
      const key = `${g.module}.${g.entity}.${g.action}`;
      if (isCapability(key)) keys.add(key);
    }
  }
  return { keys, chain, all: false, error: null };
}

/**
 * The check itself. NEVER throws, NEVER returns true for an unknown capability.
 *
 * The registry lookup happens BEFORE the `all` short circuit on purpose, so not
 * even an owner can hold a capability that does not exist — a typo stays a typo
 * instead of becoming a silent allow for exactly the person least likely to
 * notice it.
 */
export function can(resolved: ResolvedRole | null | undefined, capability: string): boolean {
  if (!resolved) return false;
  if (!isCapability(capability)) return false;
  if (resolved.error) return false;
  if (resolved.all) return true;
  return resolved.keys.has(capability);
}

/* ── The tier floor ───────────────────────────────────────────────────────── */

/**
 * `org_members.role` is a four-value tier that predates all of this, and until
 * a tenant authors real roles it is what every member actually has. It is the
 * FLOOR: a member with no `role_id` resolves to their tier's set; a member WITH
 * a role resolves to the role instead — which is the point of authoring one.
 *
 * No tier but owner/admin carries a destructive capability. Frame `110429`'s
 * default is that deleting is chosen, and a default that hands out deletion is
 * not a floor, it is a trapdoor.
 */
export const TIER_CAPABILITIES: Record<string, "all" | string[]> = {
  owner: "all",
  admin: "all",
  manager: CAPABILITIES.filter(
    (c) => !c.destructive && !c.key.startsWith("settings."),
  ).map((c) => c.key),
  member: CAPABILITIES.filter(
    (c) =>
      !c.destructive &&
      !c.key.startsWith("settings.") &&
      !c.key.startsWith("reports.") &&
      c.key !== "billing.cost.view" &&
      !c.key.endsWith(".approve"),
  ).map((c) => c.key),
};

/** Resolve a tier to the same shape `can()` takes. An unknown tier denies. */
export function resolveTier(tier: string | null | undefined): ResolvedRole {
  const set = tier ? TIER_CAPABILITIES[tier] : undefined;
  if (!set) return { ...DENY, error: "unknown-tier" };
  if (set === "all") return { keys: new Set(), chain: [], all: true, error: null };
  return { keys: new Set(set), chain: [], all: false, error: null };
}

/**
 * What a caller effectively holds: their role when they have one, their tier
 * when they do not. A member WITH a role_id whose role fails to resolve gets
 * the failure, NOT a silent fall back to the tier — falling back would mean a
 * broken or cyclic role quietly restores powers the tenant thought they had
 * replaced, which is the exact inversion this file exists to prevent.
 */
export function resolveActor(
  roles: readonly RoleRow[],
  grants: readonly GrantRow[],
  roleId: string | null | undefined,
  tier: string | null | undefined,
): ResolvedRole {
  if (roleId) return resolveRole(roles, grants, roleId);
  return resolveTier(tier);
}
