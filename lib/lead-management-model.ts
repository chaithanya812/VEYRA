/**
 * Client-safe Lead Management model — the 360° lead, tenant-configurable
 * statuses, and the follow-up engine behind the Overview / Follow-ups /
 * Call logs / Team screens.
 *
 * No `server-only` import and no DB access: the list, the detail tabs and the
 * server data module all share this arithmetic, so the count on a KPI tile and
 * the count in a table can never disagree.
 *
 * A note on "callback": it is a REMINDER TO PHONE SOMEONE, not a dialer. The
 * app never places a call. The record of a call that actually happened lives in
 * `interactions` (migration 0011) with its direction, status and duration.
 * These two things are deliberately separate — an intention and a fact.
 */

import type { Tone } from "./workspace-model";

/* ── Statuses (tenant-configurable rows; these are only the seed) ─────────── */

export interface LeadStatusDef {
  id: string;
  value: string;
  label: string;
  seq: number;
  tone: Tone;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
  is_system: boolean;
}

/**
 * The competitor exposes ~22 hardcoded stages, several of which are duplicates
 * of each other ("Call back later", "call back again", "Call after a week") and
 * several of which are outcomes rather than stages. This is the distilled set:
 * every row is a distinct place a lead can genuinely sit in an Indian interiors
 * sales cycle, ordered as the deal actually moves. Tenants add their own.
 *
 * Tone discipline: red is NOT used for a normal stage — only `lost` earns an
 * alert-ish read, and even that stays neutral. Won is the one green.
 */
export const DEFAULT_LEAD_STATUSES: Omit<LeadStatusDef, "id">[] = [
  { value: "new", label: "New", seq: 0, tone: "neutral", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "assigned", label: "Assigned", seq: 1, tone: "neutral", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "contacted", label: "Contacted", seq: 2, tone: "neutral", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "requirement_gathered", label: "Requirement gathered", seq: 3, tone: "neutral", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "site_measurement", label: "Site measurement", seq: 4, tone: "neutral", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "design_pitch", label: "Design pitch", seq: 5, tone: "neutral", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "quoted", label: "Quotation sent", seq: 6, tone: "amber", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "negotiation", label: "Negotiation", seq: 7, tone: "amber", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "qualified", label: "Pending client decision", seq: 8, tone: "amber", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "on_hold", label: "On hold", seq: 9, tone: "neutral", is_won: false, is_lost: false, is_active: true, is_system: true },
  { value: "won", label: "Won", seq: 10, tone: "green", is_won: true, is_lost: false, is_active: true, is_system: true },
  { value: "lost", label: "Lost", seq: 11, tone: "neutral", is_won: false, is_lost: true, is_active: true, is_system: true },
  { value: "not_interested", label: "Not interested", seq: 12, tone: "neutral", is_won: false, is_lost: true, is_active: true, is_system: true },
  { value: "junk", label: "Junk", seq: 13, tone: "neutral", is_won: false, is_lost: true, is_active: true, is_system: true },
];

export function statusDef(
  statuses: LeadStatusDef[],
  value: string,
): LeadStatusDef | undefined {
  return statuses.find((s) => s.value === value);
}

export function statusLabelOf(statuses: LeadStatusDef[], value: string): string {
  return statusDef(statuses, value)?.label ?? value;
}

export function statusToneOf(statuses: LeadStatusDef[], value: string): Tone {
  return statusDef(statuses, value)?.tone ?? "neutral";
}

/** Statuses that end the pursuit — won or any lost variant. */
export function isTerminalStatus(statuses: LeadStatusDef[], value: string): boolean {
  const d = statusDef(statuses, value);
  return !!d && (d.is_won || d.is_lost);
}

/* ── Follow-ups ───────────────────────────────────────────────────────────── */

export const FOLLOW_UP_KINDS = ["callback", "meeting"] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];

export const FOLLOW_UP_KIND_LABELS: Record<FollowUpKind, string> = {
  callback: "Callback",
  meeting: "Meeting",
};

export const FOLLOW_UP_STATUSES = [
  "upcoming",
  "completed",
  "missed",
  "rescheduled",
  "cancelled",
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  missed: "Missed",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

/** Missed is the one genuine alert here — a commitment to a client went by. */
export const FOLLOW_UP_STATUS_TONE: Record<FollowUpStatus, Tone> = {
  upcoming: "neutral",
  completed: "green",
  missed: "red",
  rescheduled: "amber",
  cancelled: "neutral",
};

export interface FollowUpRow {
  id: string;
  lead_id: string;
  kind: string;
  title: string | null;
  due_at: string;
  reminder_at: string | null;
  priority: string;
  status: string;
  outcome: string | null;
  note: string | null;
  member_id: string | null;
  assigned_to: string | null;
  done: boolean;
  completed_at: string | null;
  attachment_url: string | null;
  created_at: string;
}

/**
 * The stored status, corrected for the passage of time: an `upcoming` follow-up
 * whose due time has gone is MISSED. That is what makes the Missed tile mean
 * something — it counts commitments that lapsed, not rows someone remembered to
 * mark. Terminal statuses are returned untouched.
 */
export function effectiveFollowUpStatus(
  row: FollowUpRow,
  now: Date = new Date(),
): FollowUpStatus {
  const stored = (FOLLOW_UP_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as FollowUpStatus)
    : "upcoming";
  if (stored !== "upcoming") return stored;

  const due = new Date(row.due_at);
  if (!Number.isFinite(due.getTime())) return "upcoming";
  return due.getTime() < now.getTime() ? "missed" : "upcoming";
}

export interface FollowUpSummary {
  total: number;
  completed: number;
  upcoming: number;
  missed: number;
  rescheduled: number;
  cancelled: number;
  /** completed ÷ (everything that had a chance to happen), as a percentage. */
  completionRate: number;
}

export function followUpSummary(
  rows: FollowUpRow[],
  now: Date = new Date(),
): FollowUpSummary {
  const s: FollowUpSummary = {
    total: rows.length, completed: 0, upcoming: 0, missed: 0,
    rescheduled: 0, cancelled: 0, completionRate: 0,
  };
  for (const r of rows) s[effectiveFollowUpStatus(r, now)]++;

  // Upcoming hasn't had its chance yet, and cancelled was called off — neither
  // belongs in the denominator, or the rate punishes you for planning ahead.
  const settled = s.completed + s.missed + s.rescheduled;
  s.completionRate = settled === 0 ? 0 : Math.round((s.completed / settled) * 100);
  return s;
}

/** Split by kind, so the Meeting and Call summaries are honest about scope. */
export function summaryByKind(
  rows: FollowUpRow[],
  kind: FollowUpKind,
  now: Date = new Date(),
): FollowUpSummary {
  return followUpSummary(
    rows.filter((r) => r.kind === kind),
    now,
  );
}

/** Overdue = missed and still open; the number the Leads list surfaces in red. */
export function overdueCount(rows: FollowUpRow[], now: Date = new Date()): number {
  return rows.filter((r) => effectiveFollowUpStatus(r, now) === "missed").length;
}

/** The next thing actually scheduled for this lead, if anything. */
export function nextFollowUp(
  rows: FollowUpRow[],
  now: Date = new Date(),
): FollowUpRow | null {
  const upcoming = rows
    .filter((r) => effectiveFollowUpStatus(r, now) === "upcoming")
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  return upcoming[0] ?? null;
}

/* ── Call log rollups (over the `interactions` rows) ──────────────────────── */

export interface CallRow {
  id: string;
  lead_id: string | null;
  channel: string;
  direction: string;
  status: string;
  duration_sec: number;
  agent_id: string | null;
  occurred_at: string;
}

export interface CallSummary {
  dialed: number;
  connected: number;
  notReceived: number;
  talkTimeSec: number;
  /** connected ÷ dialed, as a percentage. */
  connectRate: number;
}

/**
 * Only `channel = call` rows count. "Connected" means the conversation actually
 * happened (connected or completed); everything else was a call that did not
 * reach the person.
 */
export function callSummary(rows: CallRow[]): CallSummary {
  const calls = rows.filter((r) => r.channel === "call");
  let connected = 0;
  let talk = 0;
  for (const c of calls) {
    if (c.status === "connected" || c.status === "completed") {
      connected++;
      talk += Number(c.duration_sec) || 0;
    }
  }
  return {
    dialed: calls.length,
    connected,
    notReceived: calls.length - connected,
    talkTimeSec: talk,
    connectRate: calls.length === 0 ? 0 : Math.round((connected / calls.length) * 100),
  };
}

/** "3h 59m 20s" — the talk-time format the competitor's wallboard uses. */
export function formatTalkTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export interface AgentPerformance {
  memberId: string;
  name: string;
  followUps: FollowUpSummary;
  calls: CallSummary;
  /** Consecutive days, ending today, with at least one logged activity. */
  streakDays: number;
}

/** Local-day key, so a streak is counted in the user's days, not UTC's. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    : "";
}

/**
 * Consecutive active days ending today (or yesterday — a streak shouldn't break
 * simply because it is 9am and the day has not started yet).
 */
export function activityStreak(
  timestamps: string[],
  now: Date = new Date(),
): number {
  const days = new Set(timestamps.map(dayKey).filter(Boolean));
  if (days.size === 0) return 0;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Start from today if it's active, otherwise yesterday; if neither, no streak.
  let cursor = startOfToday;
  if (!days.has(keyOf(cursor))) {
    cursor = new Date(startOfToday.getTime() - 86_400_000);
    if (!days.has(keyOf(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(keyOf(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

export function agentPerformance(
  member: { id: string; name: string },
  followUps: FollowUpRow[],
  calls: CallRow[],
  now: Date = new Date(),
): AgentPerformance {
  const mine = followUps.filter((f) => f.member_id === member.id);
  const myCalls = calls.filter((c) => c.agent_id === member.id);
  return {
    memberId: member.id,
    name: member.name,
    followUps: followUpSummary(mine, now),
    calls: callSummary(myCalls),
    streakDays: activityStreak(
      [...mine.map((f) => f.created_at), ...myCalls.map((c) => c.occurred_at)],
      now,
    ),
  };
}

/* ── Lead row + list helpers ──────────────────────────────────────────────── */

export interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  alt_phone: string | null;
  contact_role: string | null;
  org_type: string | null;
  source: string;
  status: string;
  value: number | null;
  notes: string | null;
  project_name: string | null;
  project_type: string | null;
  budget_band: string | null;
  scope: string | null;
  layout_sqft: number | null;
  theme: string | null;
  rooms: string[];
  description: string | null;
  tentative_start: string | null;
  financial_year: string | null;
  sales_owner_id: string | null;
  latest_remark: string | null;
  rating: number | null;
  client_portal: boolean;
  address_line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  project_id: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

/** Σ value across leads — the "Leads Value" figure beside the count. */
export function pipelineValue(leads: { value: number | null }[]): number {
  return Math.round(
    leads.reduce((s, l) => s + (Number(l.value) || 0), 0) * 100,
  ) / 100;
}

/**
 * The Indian financial year a date falls in — 1 Apr to 31 Mar. Stamped on a
 * lead at creation so the year a deal belongs to survives it being worked
 * across the April boundary.
 */
export function financialYearOf(date: Date = new Date()): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export type SortKey = "recent" | "oldest" | "value_desc" | "value_asc" | "name";

/** Sort a list without mutating the caller's array. */
export function sortLeads<T extends { created_at: string; value: number | null; name: string }>(
  leads: T[],
  key: SortKey,
): T[] {
  const out = [...leads];
  switch (key) {
    case "oldest":
      return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "value_desc":
      return out.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    case "value_asc":
      return out.sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0));
    case "name":
      return out.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

/**
 * Free-text search across the fields a salesperson would actually type: the
 * person, their number, the project and the last thing anyone noted.
 */
export function searchLeads<T extends LeadRow>(leads: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return leads;
  return leads.filter((l) =>
    [l.name, l.phone, l.alt_phone, l.email, l.project_name, l.latest_remark, l.city]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(q)),
  );
}
