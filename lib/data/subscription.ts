import "server-only";
import { withOrg } from "./with-org";
import { admin } from "@/lib/supabase/admin";
import {
  remaining,
  isOverLimit,
  type Plan,
  type PlanLimits,
  type Subscription,
  type SubscriptionStatus,
  type UsageMetric,
} from "@/lib/subscription-model";

/**
 * Subscription / trial data module (REQ-04).
 *
 * Same shape as leads.ts / quotations.ts: every tenant read/write goes through
 * withOrg(), so `org_id` isolation is automatic. Two tables here are tenant-
 * scoped (`subscriptions`, `usage_events`); `plans` is a PLATFORM catalogue and
 * is read only via the admin client (sanctioned inside lib/data).
 *
 * Append-only ledger: `recordUsage` INSERTs a row and NEVER touches a counter.
 * `usageSummary` DERIVES used/remaining from the ledger, so editing/deleting the
 * underlying record cannot reset a tenant's quota.
 */
export {
  remaining,
  type Plan,
  type PlanLimits,
  type Subscription,
  type SubscriptionStatus,
  type UsageMetric,
};

/* ── Reads ────────────────────────────────────────────────────────────────── */

/** Resolve a plan from the platform catalogue by code (no org scoping). */
async function getPlan(code: string): Promise<Plan | null> {
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    code: row.code as string,
    name: row.name as string,
    price_inr: Number(row.price_inr) || 0,
    is_trial: Boolean(row.is_trial),
    limits: (row.limits as PlanLimits) ?? {},
  };
}

export interface SubscriptionWithPlan {
  subscription: Subscription | null;
  plan: Plan | null;
}

/** The org's current subscription, with the resolved plan (limits) joined on. */
export async function getSubscription(): Promise<SubscriptionWithPlan> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("subscriptions")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { subscription: null, plan: null };

  const sub = data as unknown as Subscription;
  const plan = await getPlan(sub.plan_code);
  return { subscription: sub, plan };
}

export interface UsageSummaryRow {
  metric: UsageMetric;
  used: number;
  limit: number | null;
  remaining: number | null;
}

/**
 * Aggregate `sum(quantity)` per metric from the append-only ledger (lifetime),
 * then join against the plan limits to show used / limit / remaining for every
 * metered item. Pure arithmetic over DB reads — no LLM, no counter mutation.
 */
export async function usageSummary(): Promise<UsageSummaryRow[]> {
  const { db } = await withOrg();
  const { data, error } = await db.table("usage_events").select("metric, quantity");
  if (error) throw error;

  const rows = (data ?? []) as unknown as { metric: string; quantity: number | null }[];
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.metric, (totals.get(r.metric) ?? 0) + (Number(r.quantity) || 0));
  }

  const { plan } = await getSubscription();
  const limits = plan?.limits ?? {};

  return (
    Object.keys(limits) as UsageMetric[]
  ).map((metric) => {
    const used = totals.get(metric) ?? 0;
    const limit = limits[metric] ?? null;
    return { metric, used, limit, remaining: remaining(limit, used) };
  });
}

/** True when the org's subscription has expired (writes are gated read-only). */
export async function isReadOnly(): Promise<boolean> {
  const { subscription } = await getSubscription();
  const status = subscription?.status;
  return status === "expired" || status === "cancelled";
}

/**
 * Pre-write gate for a metered create (REQ-04). Blocks when the subscription is
 * read-only (expired/cancelled) or the metric's lifetime limit is already
 * reached; otherwise returns {} and the caller records the usage event AFTER a
 * successful insert. Wiring this into a create path is what makes metering real
 * — previously recordUsage() had no callers, so the ledger stayed empty and the
 * read-only banner was never enforced.
 */
export async function guardMeteredCreate(
  metric: UsageMetric,
): Promise<{ error?: string }> {
  const { subscription, plan } = await getSubscription();
  const status = subscription?.status;
  if (status === "expired" || status === "cancelled") {
    return {
      error: "Your plan is read-only. Renew your subscription to add new records.",
    };
  }
  const limit = plan?.limits?.[metric] ?? null;
  if (limit != null) {
    const { db } = await withOrg();
    const { data } = await db.table("usage_events").select("quantity").eq("metric", metric);
    const used = ((data ?? []) as unknown as { quantity: number | null }[]).reduce(
      (s, r) => s + (Number(r.quantity) || 0),
      0,
    );
    if (isOverLimit(limit, used)) {
      return {
        error: `You've reached your plan's ${metric} limit (${limit}). Upgrade to add more.`,
      };
    }
  }
  return {};
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

/**
 * Append ONE usage event to the ledger. Never UPDATEs a running total — the
 * quota is always derived from the ledger (REQ-04 loophole-proof metering).
 */
export async function recordUsage(
  metric: UsageMetric,
  quantity: number = 1,
  ref: string | null = null,
): Promise<{ error?: string }> {
  if (quantity <= 0) return { error: "Usage quantity must be positive." };
  const { db } = await withOrg();
  const { error } = await db.table("usage_events").insert({
    metric,
    quantity,
    ref,
  });
  return error ? { error: error.message } : {};
}
