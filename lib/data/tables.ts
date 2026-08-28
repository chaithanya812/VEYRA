/**
 * The tenant-scoped table allowlist.
 *
 * Every table here carries an `org_id` column and MUST only be accessed through
 * the org-scoped accessor (`withOrg` / `orgDb`). Adding a table here is a
 * deliberate act: it declares "this data is tenant-owned and org_id-isolated."
 *
 * A companion test (lib/data/__tests__) asserts every table in this list
 * actually has an `org_id` column in the live schema.
 */
export const TENANT_TABLES = [
  "branches",
  "org_members",
  "roles",
  "parties",
  "leads",
  "lead_activities",
  "items",
  "vendors",
  "vendor_rate_contracts",
  "projects",
  "project_updates",
  "material_requests",
  "material_request_items",
  "rfqs",
  "rfq_vendors",
  "rfq_items",
  "rfq_bids",
  "rfq_bid_lines",
  "numbering_series",
  "permissions",
  "interactions",
  // DEAD as of PLAN-V4 6.1: the board reads lead_statuses, and the editor that
  // wrote this table is gone. Kept registered because the rows still exist —
  // dropping a table is not an additive migration. Do not build on it.
  "pipeline_stages",
  "follow_ups",
  "warehouses",
  "stock_movements",
  "grns",
  "purchase_orders",
  "po_lines",
  "po_receipts",
  "po_receipt_lines",
  "contracts",
  "milestones",
  "payments",
  "assets",
  "asset_comments",
  "asset_signoffs",
  "site_logs",
  "site_photos",
  "site_attendance",
  "measurement_variance",
  "approval_rules",
  "approval_requests",
  "quotations",
  "quotation_sections",
  "quotation_lines",
  "subscriptions",
  "usage_events",
  "quotation_templates",
  "quotation_template_sections",
  "quotation_template_lines",
  "boms",
  "bom_lines",
  "cutlists",
  "cutlist_panels",
  "nesting_runs",
  "nesting_placements",
  "panel_tags",
  "panel_events",
  "work_centers",
  "workspace_options",
  "tasks",
  "task_checklist",
  "work_sessions",
  "leave_requests",
  "expense_claims",
  "field_visits",
  "lead_statuses",
  "lead_assignees",
  "quotation_terms",
  "quotation_settings",
  "ai_prompt_templates",
  "ai_requests",
  "follow_up_assignees",
  "followup_outcome_rules",
  // The spine (PLAN-V4 7). Every module's line table points at it; nothing
  // gets its own private linkage again.
  "scope_items",
  // The DELIVERY schedule. `milestones` (0015) is the PAYMENT schedule and is
  // a different table on purpose — see 0032's header.
  "project_milestones",
  "project_milestone_deps",
  "milestone_templates",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/**
 * Platform tables that are NOT org-scoped (they define or cross tenancy).
 * Accessed by the platform layer only, never by feature modules.
 */
export const PLATFORM_TABLES = ["orgs", "app_users", "plans"] as const;
export type PlatformTable = (typeof PLATFORM_TABLES)[number];
