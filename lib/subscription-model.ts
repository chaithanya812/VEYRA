/**
 * Client-safe subscription / trial model — enums and types with NO server-only
 * import, so both client components (the billing page) and the server data
 * module (lib/data/subscription.ts) can share them. The pure metering helpers
 * below are the single source of truth for Used / Allowed / Remaining (REQ-04):
 * limits are metered on LIFETIME ledger counts, never on stored-record counts.
 */

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "expired",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * The set of metered items (REQ-04). The client explicitly asks for quotations,
 * designs, BOQs, cutlists, exports, projects, items and users to be lifetime-
 * limited during trial. Storage is reserved for a future volume meter.
 */
export const USAGE_METRICS = [
  "quotations",
  "designs",
  "boqs",
  "cutlists",
  "exports",
  "projects",
  "items",
  "users",
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

/** Per-metric limit. `null` (or missing) means unlimited. */
export type PlanLimits = Partial<Record<UsageMetric, number | null>>;

export interface Plan {
  code: string;
  name: string;
  price_inr: number;
  is_trial: boolean;
  limits: PlanLimits;
}

export interface Subscription {
  id: string;
  org_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
}

/**
 * Units still available for a metric.
 *  - `limit === null` → unlimited, so the answer is unknown/unbounded: return null.
 *  - otherwise `limit - used`, clamped at 0 (over-use never reports negative).
 */
export function remaining(limit: number | null, used: number): number | null {
  if (limit == null) return null;
  return Math.max(0, limit - used);
}

/** True when `used` has reached/exceeded `limit`. Unlimited limits never trip. */
export function isOverLimit(limit: number | null, used: number): boolean {
  if (limit == null) return false;
  return used >= limit;
}
