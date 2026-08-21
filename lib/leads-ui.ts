import type { LeadStatus, LeadSource } from "@/lib/leads-model";

/** Status → chip tone. Red is NOT used for a normal status (reserved for alerts). */
export const statusTone: Record<
  LeadStatus,
  "neutral" | "green" | "amber" | "red"
> = {
  new: "neutral",
  contacted: "neutral",
  qualified: "amber",
  quoted: "amber",
  won: "green",
  lost: "neutral",
};

export const statusLabel: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export const sourceLabel: Record<LeadSource, string> = {
  manual: "Manual",
  walk_in: "Walk-in",
  whatsapp: "WhatsApp",
  website: "Website",
  referral: "Referral",
  call: "Call",
};
