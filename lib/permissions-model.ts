/**
 * Client-safe settings/config model — enums, types and pure helpers with NO
 * server-only import and NO DB access, so both client components (the
 * settings screens) and the server data module (lib/data/config.ts) share
 * them. The server logic lives in lib/data/config.ts.
 *
 * Two config layers are modelled here (FEATURE-REGISTER PROC-CFG-005 /
 * OPS-HR-003):
 *  - NUMBERING SERIES: per document type, a tenant prefix + optional Indian-FY
 *    segment + zero-padded running integer, e.g. VEYRA/2026-27/0042. The FY
 *    segment is the improvement over the competitor, which numbers documents
 *    without financial-year context.
 *  - PERMISSIONS as (module, action, scope): replaces free-text role labels
 *    with an explicit matrix. The action is what may be done; the scope is
 *    how much of the org the grant reaches.
 */

/* ── Permissions vocabulary ───────────────────────────────────────────────── */

export const MODULES = [
  "leads",
  "quotations",
  "items",
  "projects",
  "procurement",
  "inventory",
  "vendors",
  "billing",
  "settings",
] as const;
export type PermissionModule = (typeof MODULES)[number];

export const ACTIONS = ["view", "create", "edit", "delete", "approve"] as const;
export type PermissionAction = (typeof ACTIONS)[number];

export const SCOPES = ["own", "team", "branch", "org"] as const;
export type PermissionScope = (typeof SCOPES)[number];

export const MODULE_LABELS: Record<PermissionModule, string> = {
  leads: "Leads",
  quotations: "Quotations",
  items: "Items",
  projects: "Projects",
  procurement: "Procurement",
  inventory: "Inventory",
  vendors: "Vendors",
  billing: "Billing",
  settings: "Settings",
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
};

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  own: "Own",
  team: "Team",
  branch: "Branch",
  org: "Org",
};

/* ── Numbering series vocabulary ──────────────────────────────────────────── */

export const DOC_TYPES = [
  "quotation",
  "material_request",
  "rfq",
  "purchase_order",
  "grn",
  "invoice",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  quotation: "Quotation",
  material_request: "Material request",
  rfq: "RFQ",
  purchase_order: "Purchase order",
  grn: "GRN",
  invoice: "Invoice",
};

/* ── Row types (mirror the migration 0010 / 0001 columns) ────────────────── */

export interface Role {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
}

export interface NumberingSeries {
  id: string;
  doc_type: string;
  prefix: string;
  fy_segment: boolean;
  padding: number;
  current_int: number;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  role_id: string;
  module: PermissionModule;
  action: PermissionAction;
  scope: PermissionScope;
  created_at: string;
}

/** The editable part of a numbering series (current_int is never edited here). */
export type SeriesConfig = Pick<
  NumberingSeries,
  "prefix" | "fy_segment" | "padding"
> & { current_int?: number };

/* ── Pure helpers (unit-tested in lib/permissions-model.test.ts) ─────────── */

/**
 * The Indian financial year label for a date: FY runs 1 Apr → 31 Mar, so
 * Jan–Mar of calendar year Y belong to FY "(Y-1)-Y" and Apr–Dec to FY
 * "Y-(Y+1)". e.g. 15 Jan 2026 → "2025-26"; 1 Apr 2026 → "2026-27".
 * Interpreted in local time — pass business dates, not UTC-midnight strings,
 * when the timezone matters.
 */
export function indianFY(date: Date): string {
  const y = date.getFullYear();
  const startsThisYear = date.getMonth() >= 3; // Apr = month index 3
  const start = startsThisYear ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

/**
 * Render a document number from its series config:
 * `prefix` + (`/` + Indian FY when fy_segment) + `/` + zero-padded integer.
 * e.g. { VEYRA, fy on, pad 4, int 42 } in Jun 2026 → "VEYRA/2026-27/0042".
 * Pure formatting only — advancing current_int happens where a number is
 * actually consumed, never here.
 */
export function formatDocNumber(s: SeriesConfig, date: Date): string {
  const fy = s.fy_segment ? `/${indianFY(date)}` : "";
  const n = Math.max(0, Math.trunc(s.current_int ?? 0));
  return `${s.prefix}${fy}/${String(n).padStart(s.padding, "0")}`;
}
