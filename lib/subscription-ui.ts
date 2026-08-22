import type { SubscriptionStatus } from "@/lib/subscription-model";

/** Status → chip tone. Red is reserved for genuine alerts (expired). */
export const statusTone: Record<
  SubscriptionStatus,
  "neutral" | "green" | "amber" | "red"
> = {
  trialing: "amber",
  active: "green",
  expired: "red",
  cancelled: "neutral",
};

export const statusLabel: Record<SubscriptionStatus, string> = {
  trialing: "Trialing",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** Human label for a metered metric (used / limit column headers). */
export const metricLabel: Record<string, string> = {
  quotations: "Quotations",
  designs: "Designs",
  boqs: "BOQs",
  cutlists: "Cutlists",
  exports: "Exports",
  projects: "Projects",
  items: "Items",
  users: "Users",
};
