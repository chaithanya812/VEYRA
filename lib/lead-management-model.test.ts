import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEAD_STATUSES,
  DEFAULT_OUTCOME_RULES,
  proposeFromOutcome,
  ruleFor,
  type OutcomeRule,
  activityStreak,
  agentPerformance,
  callSummary,
  effectiveFollowUpStatus,
  financialYearOf,
  followUpSummary,
  formatTalkTime,
  isTerminalStatus,
  nextFollowUp,
  overdueCount,
  pipelineValue,
  searchLeads,
  sortLeads,
  statusLabelOf,
  statusToneOf,
  summaryByKind,
  type CallRow,
  type FollowUpRow,
  type LeadRow,
  type LeadStatusDef,
} from "./lead-management-model";

const NOW = new Date("2026-06-27T14:00:00");

const STATUSES: LeadStatusDef[] = DEFAULT_LEAD_STATUSES.map((s, i) => ({
  ...s,
  id: `s${i}`,
}));

function fu(over: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "f1",
    lead_id: "l1",
    kind: "callback",
    title: null,
    due_at: "2026-06-28T10:00:00",
    reminder_at: null,
    priority: "medium",
    status: "upcoming",
    outcome: null,
    note: null,
    member_id: "m1",
    assigned_to: null,
    done: false,
    completed_at: null,
    attachment_url: null,
    created_at: "2026-06-27T09:00:00",
    ...over,
  };
}

function call(over: Partial<CallRow> = {}): CallRow {
  return {
    id: "c1",
    lead_id: "l1",
    channel: "call",
    direction: "outbound",
    status: "connected",
    duration_sec: 120,
    agent_id: "m1",
    occurred_at: "2026-06-27T10:00:00",
    ...over,
  };
}

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "l1", name: "Mr Ramesh", phone: "+919899009988", email: null,
    alt_phone: null, contact_role: null, org_type: "residential",
    source: "manual", status: "new", value: 1000, notes: null,
    project_name: "B-1023", project_type: null, budget_band: "10-20 L",
    scope: "Full execution", layout_sqft: null, theme: null, rooms: [],
    description: null, tentative_start: null, financial_year: null,
    sales_owner_id: null, latest_remark: "Busy on another call", rating: null,
    client_portal: false, address_line: null, city: "Bengaluru", state: null,
    pincode: null, lat: null, lng: null, project_id: null, assigned_to: null,
    created_at: "2026-06-20T09:00:00", updated_at: "2026-06-20T09:00:00",
    ...over,
  };
}

/* ── Statuses ─────────────────────────────────────────────────────────────── */

describe("lead statuses", () => {
  it("resolves a tenant label and tone, falling back to the raw slug", () => {
    expect(statusLabelOf(STATUSES, "quoted")).toBe("Quotation sent");
    expect(statusToneOf(STATUSES, "won")).toBe("green");
    expect(statusLabelOf(STATUSES, "invented")).toBe("invented");
    expect(statusToneOf(STATUSES, "invented")).toBe("neutral");
  });

  it("treats won and every lost variant as terminal, and live stages as not", () => {
    expect(isTerminalStatus(STATUSES, "won")).toBe(true);
    expect(isTerminalStatus(STATUSES, "lost")).toBe(true);
    expect(isTerminalStatus(STATUSES, "junk")).toBe(true);
    expect(isTerminalStatus(STATUSES, "negotiation")).toBe(false);
  });

  it("never uses red for a normal stage — red is reserved for alerts", () => {
    expect(STATUSES.every((s) => s.tone !== "red")).toBe(true);
  });

  it("has exactly one winning status", () => {
    expect(STATUSES.filter((s) => s.is_won)).toHaveLength(1);
  });
});

/* ── Follow-ups ───────────────────────────────────────────────────────────── */

describe("follow-up status", () => {
  it("calls a lapsed upcoming follow-up missed, not upcoming", () => {
    expect(effectiveFollowUpStatus(fu({ due_at: "2026-06-25T10:00:00" }), NOW)).toBe("missed");
  });

  it("leaves a future follow-up upcoming", () => {
    expect(effectiveFollowUpStatus(fu({ due_at: "2026-06-29T10:00:00" }), NOW)).toBe("upcoming");
  });

  it("never rewrites a settled status just because time passed", () => {
    const old = { due_at: "2026-06-01T10:00:00" };
    expect(effectiveFollowUpStatus(fu({ ...old, status: "completed" }), NOW)).toBe("completed");
    expect(effectiveFollowUpStatus(fu({ ...old, status: "cancelled" }), NOW)).toBe("cancelled");
    expect(effectiveFollowUpStatus(fu({ ...old, status: "rescheduled" }), NOW)).toBe("rescheduled");
  });

  it("falls back to upcoming for an unrecognised stored status", () => {
    expect(effectiveFollowUpStatus(fu({ status: "gibberish", due_at: "2026-06-29T10:00:00" }), NOW)).toBe("upcoming");
  });

  it("summarises the five buckets", () => {
    const s = followUpSummary(
      [
        fu({ id: "1", status: "completed" }),
        fu({ id: "2", due_at: "2026-06-25T10:00:00" }),
        fu({ id: "3", due_at: "2026-06-29T10:00:00" }),
        fu({ id: "4", status: "rescheduled" }),
        fu({ id: "5", status: "cancelled" }),
      ],
      NOW,
    );
    expect(s).toMatchObject({
      total: 5, completed: 1, missed: 1, upcoming: 1, rescheduled: 1, cancelled: 1,
    });
  });

  it("excludes upcoming and cancelled from the completion rate denominator", () => {
    // 1 completed of 2 settled (completed + missed) = 50%, despite 4 rows.
    const s = followUpSummary(
      [
        fu({ id: "1", status: "completed" }),
        fu({ id: "2", due_at: "2026-06-25T10:00:00" }),
        fu({ id: "3", due_at: "2026-06-29T10:00:00" }),
        fu({ id: "4", status: "cancelled" }),
      ],
      NOW,
    );
    expect(s.completionRate).toBe(50);
  });

  it("reports a 0% rate rather than dividing by zero", () => {
    expect(followUpSummary([], NOW).completionRate).toBe(0);
    expect(followUpSummary([fu({ due_at: "2026-06-29T10:00:00" })], NOW).completionRate).toBe(0);
  });

  it("splits meetings from callbacks", () => {
    const rows = [
      fu({ id: "1", kind: "meeting", status: "completed" }),
      fu({ id: "2", kind: "callback", status: "completed" }),
      fu({ id: "3", kind: "callback", due_at: "2026-06-25T10:00:00" }),
    ];
    expect(summaryByKind(rows, "meeting", NOW).total).toBe(1);
    expect(summaryByKind(rows, "callback", NOW)).toMatchObject({ total: 2, completed: 1, missed: 1 });
  });

  it("counts overdue and finds the next scheduled one", () => {
    const rows = [
      fu({ id: "1", due_at: "2026-06-25T10:00:00" }),
      fu({ id: "2", due_at: "2026-06-30T10:00:00" }),
      fu({ id: "3", due_at: "2026-06-28T10:00:00" }),
    ];
    expect(overdueCount(rows, NOW)).toBe(1);
    expect(nextFollowUp(rows, NOW)?.id).toBe("3");
  });

  it("returns no next follow-up when everything has lapsed", () => {
    expect(nextFollowUp([fu({ due_at: "2026-06-01T10:00:00" })], NOW)).toBeNull();
  });
});

/* ── Calls ────────────────────────────────────────────────────────────────── */

describe("call summary", () => {
  it("counts only call-channel rows and derives the connect rate", () => {
    const s = callSummary([
      call({ id: "1", status: "connected", duration_sec: 120 }),
      call({ id: "2", status: "completed", duration_sec: 60 }),
      call({ id: "3", status: "not_connected", duration_sec: 0 }),
      call({ id: "4", status: "no_answer", duration_sec: 0 }),
      call({ id: "5", channel: "whatsapp", status: "completed" }),
    ]);
    expect(s).toMatchObject({
      dialed: 4, connected: 2, notReceived: 2, talkTimeSec: 180, connectRate: 50,
    });
  });

  it("reports zero rather than NaN when nothing was dialed", () => {
    expect(callSummary([])).toMatchObject({ dialed: 0, connectRate: 0 });
  });

  it("formats talk time the way a wallboard reads it", () => {
    expect(formatTalkTime(14360)).toBe("3h 59m 20s");
    expect(formatTalkTime(125)).toBe("2m 5s");
    expect(formatTalkTime(9)).toBe("9s");
    expect(formatTalkTime(-5)).toBe("0s");
  });
});

/* ── Streaks & performance ────────────────────────────────────────────────── */

describe("activity streak", () => {
  it("counts consecutive active days ending today", () => {
    const days = [
      "2026-06-27T09:00:00",
      "2026-06-26T09:00:00",
      "2026-06-25T09:00:00",
    ];
    expect(activityStreak(days, NOW)).toBe(3);
  });

  it("does not break the streak just because today has not started yet", () => {
    expect(activityStreak(["2026-06-26T09:00:00", "2026-06-25T09:00:00"], NOW)).toBe(2);
  });

  it("stops at the first gap", () => {
    const days = ["2026-06-27T09:00:00", "2026-06-25T09:00:00"];
    expect(activityStreak(days, NOW)).toBe(1);
  });

  it("is zero when the last activity is old, or there is none", () => {
    expect(activityStreak(["2026-06-01T09:00:00"], NOW)).toBe(0);
    expect(activityStreak([], NOW)).toBe(0);
  });

  it("scopes an agent's scorecard to their own rows", () => {
    const p = agentPerformance(
      { id: "m1", name: "Rahul" },
      [fu({ member_id: "m1", status: "completed" }), fu({ id: "x", member_id: "m2" })],
      [call({ agent_id: "m1" }), call({ id: "y", agent_id: "m2" })],
      NOW,
    );
    expect(p.followUps.total).toBe(1);
    expect(p.calls.dialed).toBe(1);
    expect(p.name).toBe("Rahul");
  });
});

/* ── Lead list helpers ────────────────────────────────────────────────────── */

describe("lead list", () => {
  it("sums pipeline value, treating nulls as zero", () => {
    expect(pipelineValue([{ value: 1000 }, { value: null }, { value: 2500.5 }])).toBe(3500.5);
  });

  it("derives the Indian financial year across the April boundary", () => {
    expect(financialYearOf(new Date("2026-06-27"))).toBe("2026-27");
    expect(financialYearOf(new Date("2026-01-15"))).toBe("2025-26");
    expect(financialYearOf(new Date("2026-04-01"))).toBe("2026-27");
  });

  it("sorts without mutating the input", () => {
    const input = [
      lead({ id: "a", value: 100, name: "Zara", created_at: "2026-01-01" }),
      lead({ id: "b", value: 900, name: "Amit", created_at: "2026-05-01" }),
    ];
    const snapshot = input.map((l) => l.id);
    expect(sortLeads(input, "value_desc").map((l) => l.id)).toEqual(["b", "a"]);
    expect(sortLeads(input, "name").map((l) => l.id)).toEqual(["b", "a"]);
    expect(sortLeads(input, "recent").map((l) => l.id)).toEqual(["b", "a"]);
    expect(sortLeads(input, "oldest").map((l) => l.id)).toEqual(["a", "b"]);
    expect(input.map((l) => l.id)).toEqual(snapshot);
  });

  it("searches name, phone, project and last remark", () => {
    const rows = [
      lead({ id: "a", name: "Mr Ramesh", phone: "+919899009988" }),
      lead({ id: "b", name: "Shivani", phone: "+919399410561", project_name: "Skyview", latest_remark: "asked to connect tomorrow" }),
    ];
    expect(searchLeads(rows, "ramesh").map((l) => l.id)).toEqual(["a"]);
    expect(searchLeads(rows, "9399").map((l) => l.id)).toEqual(["b"]);
    expect(searchLeads(rows, "skyview").map((l) => l.id)).toEqual(["b"]);
    expect(searchLeads(rows, "connect tomorrow").map((l) => l.id)).toEqual(["b"]);
    expect(searchLeads(rows, "  ")).toHaveLength(2);
  });
});

/* ── Outcome rules ────────────────────────────────────────────────────────── */

describe("proposeFromOutcome", () => {
  const rules: OutcomeRule[] = DEFAULT_OUTCOME_RULES.map((r, i) => ({
    ...r,
    id: `r${i}`,
  }));
  const statuses = DEFAULT_LEAD_STATUSES.map((s, i) => ({ ...s, id: `s${i}` }));
  const NOW = new Date(2026, 7, 28); // 28 Aug 2026

  it("proposes the next status and a follow-on date", () => {
    const p = proposeFromOutcome(rules, "interested", statuses, "contacted", NOW);
    expect(p.nextStatus).toBe("negotiation");
    expect(p.followOnDate).toBe("2026-08-31");
    expect(p.reason).toContain("Negotiation");
  });

  it("proposes only a date when the rule changes no status", () => {
    const p = proposeFromOutcome(rules, "not_reachable", statuses, "contacted", NOW);
    expect(p.nextStatus).toBe(null);
    expect(p.followOnDate).toBe("2026-08-29");
  });

  it("proposes no move when the lead is already on that status", () => {
    const p = proposeFromOutcome(rules, "interested", statuses, "negotiation", NOW);
    expect(p.nextStatus).toBe(null);
    expect(p.followOnDate).toBe("2026-08-31");
  });

  it("closes without offering a follow-on when the pursuit ends", () => {
    const p = proposeFromOutcome(rules, "not_interested", statuses, "contacted", NOW);
    expect(p.nextStatus).toBe("not_interested");
    expect(p.followOnDate).toBe(null);
  });

  it("never proposes a status the tenant has retired", () => {
    // Statuses are data; a rule can outlive the status it points at.
    const retired = statuses.map((s) =>
      s.value === "negotiation" ? { ...s, is_active: false } : s,
    );
    const p = proposeFromOutcome(rules, "interested", retired, "contacted", NOW);
    expect(p.nextStatus).toBe(null);
    expect(p.followOnDate).toBe("2026-08-31"); // the reminder still stands
  });

  it("has nothing to say about an outcome with no rule", () => {
    expect(proposeFromOutcome(rules, "invented", statuses, "contacted", NOW)).toEqual({
      nextStatus: null,
      followOnDate: null,
      reason: null,
    });
    expect(proposeFromOutcome(rules, null, statuses, "contacted", NOW).reason).toBe(null);
  });

  it("ignores a rule the tenant has switched off", () => {
    const off = rules.map((r) =>
      r.outcome_slug === "interested" ? { ...r, is_active: false } : r,
    );
    expect(ruleFor(off, "interested")).toBeUndefined();
  });

  it("crosses a month boundary correctly", () => {
    const p = proposeFromOutcome(
      rules,
      "budget_mismatch",
      statuses,
      "contacted",
      new Date(2026, 7, 25),
    );
    expect(p.followOnDate).toBe("2026-09-08");
  });
});
