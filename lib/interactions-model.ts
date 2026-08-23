/**
 * Client-safe interactions model — enums, types and PURE helpers with NO
 * server-only import, so both client components (timeline, log form) and the
 * server data module (lib/data/interactions.ts) can share them.
 * The server logic lives in lib/data/interactions.ts.
 *
 * REQ-03 / OPS-CALL-001: one channel-agnostic interaction log spanning
 * call + whatsapp + email + sms + visit. No amounts live here — nothing for an
 * LLM to invent.
 */

export const CHANNELS = ["call", "whatsapp", "email", "sms", "visit"] as const;
export type Channel = (typeof CHANNELS)[number];

export const DIRECTIONS = ["inbound", "outbound"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const STATUSES = [
  "connected",
  "not_connected",
  "no_answer",
  "completed",
  "failed",
] as const;
export type InteractionStatus = (typeof STATUSES)[number];

export const DISPOSITIONS = [
  "interested",
  "busy",
  "follow_up",
  "not_interested",
  "wrong_number",
  "no_answer",
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

/**
 * Status semantics — RED IS RESERVED (DESIGN-DIRECTION §2). A missed or
 * not-connected call is NOT an alarm: connected/completed are green, pending
 * outcomes amber, not-connected muted grey. NO status tone maps to red.
 */
export type StatusTone = "positive" | "warning" | "muted" | "neutral";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

export const STATUS_META: Record<InteractionStatus, StatusMeta> = {
  connected: { label: "Connected", tone: "positive" },
  completed: { label: "Completed", tone: "positive" },
  no_answer: { label: "No answer", tone: "warning" },
  failed: { label: "Failed", tone: "warning" },
  not_connected: { label: "Not connected", tone: "muted" },
};

/** Chip tone per status meta tone (muted/neutral both render grey). */
export const TONE_TO_CHIP: Record<
  StatusTone,
  "green" | "amber" | "neutral"
> = {
  positive: "green",
  warning: "amber",
  muted: "neutral",
  neutral: "neutral",
};

export interface Interaction {
  id: string;
  org_id: string;
  lead_id: string | null;
  party_id: string | null;
  channel: Channel;
  direction: Direction;
  status: InteractionStatus;
  customer_no: string | null;
  provider: string | null;
  duration_sec: number;
  disposition: Disposition | null;
  note: string | null;
  recording_url: string | null;
  agent_id: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

/** Seconds → compact human duration: 0→"0s", 80→"1m 20s", 3720→"1h 2m". */
export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.length > 0 ? parts.join(" ") : "0s";
}

const CONNECTED_STATUSES: ReadonlySet<string> = new Set([
  "connected",
  "completed",
]);

/**
 * Connect rate as a rounded integer percent of rows whose status counts as a
 * connection (connected OR completed). Empty input → 0.
 */
export function connectRate(rows: { status: string }[]): number {
  if (rows.length === 0) return 0;
  const connected = rows.filter((r) => CONNECTED_STATUSES.has(r.status)).length;
  return Math.round((connected / rows.length) * 100);
}
