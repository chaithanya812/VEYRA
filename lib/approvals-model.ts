/**
 * Client-safe approvals model — enums, types and PURE helpers with NO
 * server-only import, so client components (queue tables, rule editor) and the
 * server data module share one source of truth.
 * The server logic lives in lib/data/approvals.ts.
 *
 * The approval engine is generic: any module (procurement, quotations,
 * finance, …) registers a threshold rule and raises requests against it.
 * threshold_amount is user configuration; every decision helper here is pure
 * arithmetic — no LLM ever produces a number (PLAN §8).
 */

export const APPROVAL_MODULES = [
  "procurement",
  "quotations",
  "finance",
  "other",
] as const;
export type ApprovalModule = (typeof APPROVAL_MODULES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Display labels for modules (chips + rule table). */
export const MODULE_LABELS: Record<ApprovalModule, string> = {
  procurement: "Procurement",
  quotations: "Quotations",
  finance: "Finance",
  other: "Other",
};

/**
 * Status → chip metadata. Colours follow DESIGN-DIRECTION: pending is amber
 * (warning), approved green (positive), rejected red — red is RESERVED for
 * reject/destructive/alert, which a rejection is. Never colour alone: every
 * chip carries its label.
 */
export const STATUS_META: Record<
  ApprovalStatus,
  { label: string; tone: "amber" | "green" | "red" }
> = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export interface ApprovalRule {
  id: string;
  org_id: string;
  module: ApprovalModule;
  threshold_amount: number;
  approver_role: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  org_id: string;
  module: ApprovalModule;
  entity_id: string | null;
  entity_label: string | null;
  amount: number;
  status: ApprovalStatus;
  requested_by: string | null;
  decided_by: string | null;
  decision_comment: string | null;
  requested_at: string;
  decided_at: string | null;
}

/**
 * The ONE engine decision: does `amount` need approval under this module's
 * rule? True when a rule exists, is active, and amount ≥ threshold (at the
 * threshold counts — a limit is inclusive). No rule / inactive rule → never
 * blocks. Pure; unit-tested in approvals-model.test.ts.
 */
export function needsApproval(
  amount: number,
  rule?: { threshold_amount: number; is_active: boolean } | null,
): boolean {
  if (!rule || !rule.is_active) return false;
  return amount >= rule.threshold_amount;
}
