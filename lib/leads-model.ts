/**
 * Client-safe leads model — enums and types with NO server-only import, so both
 * client components (forms) and the server data module can share them.
 * The server logic lives in lib/data/leads.ts.
 */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "quoted",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "manual",
  "walk_in",
  "whatsapp",
  "website",
  "referral",
  "call",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  value: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  kind: string;
  note: string | null;
  created_at: string;
}
