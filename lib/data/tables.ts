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
  "numbering_series",
  "permissions",
  "interactions",
  "quotations",
  "quotation_sections",
  "quotation_lines",
  "subscriptions",
  "usage_events",
  "quotation_templates",
  "quotation_template_sections",
  "quotation_template_lines",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/**
 * Platform tables that are NOT org-scoped (they define or cross tenancy).
 * Accessed by the platform layer only, never by feature modules.
 */
export const PLATFORM_TABLES = ["orgs", "app_users", "plans"] as const;
export type PlatformTable = (typeof PLATFORM_TABLES)[number];
