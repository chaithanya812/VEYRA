import { describe, it, expect } from "vitest";
import {
  buildScorecard,
  canConfigureOrg,
  canManageTeam,
  completionPct,
  expenseSummary,
  isClosedTask,
  leaveBalance,
  leaveDays,
  openSession,
  optionLabel,
  optionTone,
  roleRank,
  sessionHours,
  sessionsOnDay,
  startOfWeek,
  taskBucket,
  taskCounts,
  totalHours,
  type ExpenseClaim,
  type LeaveRequest,
  type Member,
  type Task,
  type WorkspaceOption,
  type WorkSession,
} from "./workspace-model";

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const NOW = new Date("2026-06-27T14:00:00");

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: null,
    task_type: "task",
    priority: "medium",
    status: "created",
    due_at: null,
    assignee_id: "m1",
    created_by: "m1",
    project_id: null,
    lead_id: null,
    completed_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...over,
  };
}

function session(over: Partial<WorkSession> = {}): WorkSession {
  return {
    id: "s1",
    member_id: "m1",
    check_in: "2026-06-27T09:00:00",
    check_out: "2026-06-27T17:30:00",
    lat: null,
    lng: null,
    location_label: null,
    source: "web",
    note: null,
    ...over,
  };
}

function claim(over: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: "e1",
    member_id: "m1",
    project_id: null,
    project_label: null,
    spent_on: "2026-06-20",
    amount: 1000,
    category: "materials",
    remark: null,
    receipt_url: null,
    status: "submitted",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    created_at: NOW.toISOString(),
    ...over,
  };
}

function leave(over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "l1",
    member_id: "m1",
    leave_type: "casual",
    from_date: "2026-06-22",
    to_date: "2026-06-23",
    days: 2,
    reason: null,
    status: "pending",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    created_at: NOW.toISOString(),
    ...over,
  };
}

/* ── Roles ────────────────────────────────────────────────────────────────── */

describe("roles", () => {
  it("ranks admin above owner above manager above member", () => {
    expect(roleRank("admin")).toBeLessThan(roleRank("owner"));
    expect(roleRank("owner")).toBeLessThan(roleRank("manager"));
    expect(roleRank("manager")).toBeLessThan(roleRank("member"));
  });

  it("treats an unknown or missing role as the least privileged", () => {
    expect(roleRank("wizard")).toBe(roleRank("member"));
    expect(roleRank(null)).toBe(roleRank("member"));
    expect(canManageTeam(undefined)).toBe(false);
  });

  it("opens the team view from manager upward only", () => {
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("manager")).toBe(true);
    expect(canManageTeam("member")).toBe(false);
  });

  it("keeps org configuration above the manager tier", () => {
    expect(canConfigureOrg("owner")).toBe(true);
    expect(canConfigureOrg("manager")).toBe(false);
  });
});

/* ── Attendance ───────────────────────────────────────────────────────────── */

describe("attendance hours", () => {
  it("measures a closed session between its own timestamps", () => {
    expect(sessionHours(session(), NOW)).toBe(8.5);
  });

  it("measures an open session up to now, so the figure is live", () => {
    const open = session({ check_out: null, check_in: "2026-06-27T11:30:00" });
    expect(sessionHours(open, NOW)).toBe(2.5);
  });

  it("never returns negative hours when check-out precedes check-in", () => {
    const bad = session({ check_in: "2026-06-27T17:00:00", check_out: "2026-06-27T09:00:00" });
    expect(sessionHours(bad, NOW)).toBe(0);
  });

  it("sums across sessions and finds the open one", () => {
    const list = [
      session({ id: "a", check_in: "2026-06-27T09:00:00", check_out: "2026-06-27T12:00:00" }),
      session({ id: "b", check_in: "2026-06-27T13:00:00", check_out: null }),
    ];
    expect(totalHours(list, NOW)).toBe(4);
    expect(openSession(list)?.id).toBe("b");
  });

  it("returns no open session when everything is checked out", () => {
    expect(openSession([session()])).toBeNull();
  });

  it("filters sessions to one local calendar day", () => {
    const list = [
      session({ id: "a", check_in: "2026-06-27T09:00:00" }),
      session({ id: "b", check_in: "2026-06-26T09:00:00" }),
    ];
    expect(sessionsOnDay(list, NOW).map((s) => s.id)).toEqual(["a"]);
  });
});

/* ── Tasks ────────────────────────────────────────────────────────────────── */

describe("task buckets", () => {
  it("puts a past due date in overdue", () => {
    expect(taskBucket(task({ due_at: "2026-06-25T10:00:00" }), NOW)).toBe("overdue");
  });

  it("puts a due date later today in today, not overdue", () => {
    expect(taskBucket(task({ due_at: "2026-06-27T18:00:00" }), NOW)).toBe("today");
  });

  it("counts earlier today as today, not overdue — the day is the unit", () => {
    expect(taskBucket(task({ due_at: "2026-06-27T09:00:00" }), NOW)).toBe("today");
  });

  it("puts a future date in upcoming and no date in someday", () => {
    expect(taskBucket(task({ due_at: "2026-06-30T09:00:00" }), NOW)).toBe("upcoming");
    expect(taskBucket(task({ due_at: null }), NOW)).toBe("someday");
  });

  it("never calls a finished task overdue", () => {
    const stale = { due_at: "2026-06-01T09:00:00" };
    expect(taskBucket(task({ ...stale, status: "done" }), NOW)).toBe("closed");
    expect(taskBucket(task({ ...stale, status: "cancelled" }), NOW)).toBe("closed");
  });

  it("treats done and cancelled as closed, others as open", () => {
    expect(isClosedTask("done")).toBe(true);
    expect(isClosedTask("cancelled")).toBe(true);
    expect(isClosedTask("blocked")).toBe(false);
  });

  it("counts buckets with open excluding both terminal states", () => {
    const c = taskCounts(
      [
        task({ id: "1", due_at: "2026-06-25T09:00:00" }),
        task({ id: "2", due_at: "2026-06-27T09:00:00" }),
        task({ id: "3", due_at: "2026-06-29T09:00:00" }),
        task({ id: "4", due_at: null }),
        task({ id: "5", status: "done" }),
        task({ id: "6", status: "cancelled" }),
      ],
      NOW,
    );
    expect(c).toMatchObject({
      overdue: 1, today: 1, upcoming: 1, someday: 1, done: 1, open: 4, total: 6,
    });
  });

  it("computes completion percentage, and 0 for an empty list", () => {
    expect(completionPct([task({ status: "done" }), task({ status: "created" })])).toBe(50);
    expect(completionPct([])).toBe(0);
  });
});

/* ── Expenses ─────────────────────────────────────────────────────────────── */

describe("expense summary", () => {
  it("sums by status and exposes approved-but-unpaid as payable", () => {
    const s = expenseSummary([
      claim({ id: "a", amount: 1000, status: "submitted" }),
      claim({ id: "b", amount: 2500, status: "approved" }),
      claim({ id: "c", amount: 400, status: "rejected" }),
      claim({ id: "d", amount: 700, status: "reimbursed" }),
    ]);
    expect(s).toMatchObject({
      submitted: 1000, approved: 2500, rejected: 400, reimbursed: 700, payable: 2500, count: 4,
    });
  });

  it("returns zeroes for no claims", () => {
    expect(expenseSummary([])).toMatchObject({ submitted: 0, payable: 0, count: 0 });
  });

  it("coerces a non-numeric amount to zero rather than NaN", () => {
    const s = expenseSummary([
      claim({ amount: "nonsense" as unknown as number, status: "approved" }),
    ]);
    expect(s.approved).toBe(0);
  });
});

/* ── Leave ────────────────────────────────────────────────────────────────── */

describe("leave balance", () => {
  it("deducts approved as taken and holds pending without deducting twice", () => {
    const b = leaveBalance(
      [
        leave({ id: "a", days: 3, status: "approved" }),
        leave({ id: "b", days: 2, status: "pending" }),
        leave({ id: "c", days: 5, status: "rejected" }),
      ],
      12,
    );
    expect(b).toEqual({ allowance: 12, taken: 3, pending: 2, remaining: 7 });
  });

  it("floors remaining at zero rather than going negative", () => {
    const b = leaveBalance([leave({ days: 20, status: "approved" })], 12);
    expect(b.remaining).toBe(0);
  });

  it("counts an inclusive day span, same day being one day", () => {
    expect(leaveDays("2026-06-22", "2026-06-23")).toBe(2);
    expect(leaveDays("2026-06-22", "2026-06-22")).toBe(1);
    expect(leaveDays("2026-06-25", "2026-06-22")).toBe(0);
  });
});

/* ── Options ──────────────────────────────────────────────────────────────── */

describe("tenant option resolution", () => {
  const opts: WorkspaceOption[] = [
    {
      id: "o1", kind: "task_priority", value: "urgent", label: "Drop everything",
      seq: 3, tone: "red", is_active: true, is_system: true,
    },
  ];

  it("uses the tenant's renamed label and tone", () => {
    expect(optionLabel(opts, "task_priority", "urgent")).toBe("Drop everything");
    expect(optionTone(opts, "task_priority", "urgent")).toBe("red");
  });

  it("falls back to the raw slug and neutral for an unknown value", () => {
    expect(optionLabel(opts, "task_priority", "mythical")).toBe("mythical");
    expect(optionTone(opts, "task_priority", "mythical")).toBe("neutral");
  });
});

/* ── Scorecard ────────────────────────────────────────────────────────────── */

describe("team scorecard", () => {
  const member: Member = {
    id: "m1", user_id: "u1", role: "member", status: "active", manager_id: null,
    display_name: "Aditi", designation: "Sales executive", name: "Aditi", email: "a@x.com",
  };

  it("only counts the rows belonging to that member", () => {
    const card = buildScorecard(
      member,
      [
        task({ id: "1", assignee_id: "m1", status: "done" }),
        task({ id: "2", assignee_id: "m1", due_at: "2026-06-25T09:00:00" }),
        task({ id: "3", assignee_id: "m2", due_at: "2026-06-25T09:00:00" }),
      ],
      [session({ member_id: "m1", check_out: null, check_in: "2026-06-27T12:00:00" })],
      [claim({ member_id: "m1", amount: 900, status: "approved" }), claim({ member_id: "m2", amount: 5000, status: "approved" })],
      [leave({ member_id: "m1", status: "pending" }), leave({ member_id: "m2", status: "pending" })],
      NOW,
    );
    expect(card).toMatchObject({
      memberId: "m1", name: "Aditi", tasksTotal: 2, tasksDone: 1, tasksOverdue: 1,
      completion: 50, hoursThisWeek: 2, checkedIn: true, expensePayable: 900, leavePending: 1,
    });
  });

  it("reports a member with nothing assigned as empty, not broken", () => {
    const card = buildScorecard(member, [], [], [], [], NOW);
    expect(card).toMatchObject({
      tasksTotal: 0, completion: 0, hoursThisWeek: 0, checkedIn: false, expensePayable: 0,
    });
  });
});

describe("week boundary", () => {
  it("starts the week on Monday at local midnight", () => {
    const start = startOfWeek(NOW); // Sat 27 Jun 2026
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(22);
    expect(start.getHours()).toBe(0);
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    const start = startOfWeek(new Date("2026-06-28T10:00:00"));
    expect(start.getDate()).toBe(22);
  });
});
