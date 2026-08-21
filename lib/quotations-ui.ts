import type { QuoteStatus } from "@/lib/quotations-model";

/** Status → chip tone. Red is reserved for alerts, never a normal status. */
export const statusTone: Record<QuoteStatus, "neutral" | "green" | "amber"> = {
  draft: "neutral",
  sent: "amber",
  approved: "amber",
  rejected: "neutral",
  expired: "neutral",
  won: "green",
  lost: "neutral",
};

export const statusLabel: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  won: "Won",
  lost: "Lost",
};
