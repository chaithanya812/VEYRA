"use client";

import { useActionState, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  Home,
  MapPin,
  Plane,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Card, EmptyState, StatusChip } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import { StatTile, TileGrid } from "../../../dashboard/workspace-ui";
import {
  formatHours,
  type ApprovalRow,
  type EmployeeReportRow,
  type VisitRow,
} from "@/lib/hr-model";
import { formatPhotoDate } from "@/lib/site-photos-model";
import type { ApprovalAdminBoard } from "@/lib/data/hr";
import { decideRequestAction, type HrFormState } from "../actions";

/**
 * Approvals & Report (frame `110339`) — the manager's half of `/hr/attendance`.
 *
 * Four things this screen is careful about:
 *
 * 1. **ONE QUEUE OVER TWO TABLES.** Leave and WFH are the same row shape and
 *    the same decision, so they are one table component and one server action
 *    switched by `source`. `wfh_requests` was built to mirror `leave_requests`
 *    precisely so this could be true.
 *
 * 2. **DENY OPENS A REASON BOX AND WILL NOT SUBMIT WITHOUT ONE.** Approve is
 *    immediate. The rule lives in `lib/hr-model.ts::decisionError` and is
 *    enforced again in the writer — the greyed-out button and the refusing
 *    write cannot disagree, because they read the same predicate.
 *
 * 3. **RED APPEARS ONCE, ON DENY.** Deny is destructive, which is one of red's
 *    five allowed jobs. Approve is a GREEN outline, not red — on a queue whose
 *    every row already carries a red button, a red Approve would be the sixth
 *    job and would put two competing reds in one row. There is deliberately no
 *    red page-primary here either; see the page comment.
 *
 * 4. **NOTHING IS DELETED, EVER.** A decided request stays on the screen under
 *    the queue with its decider, its timestamp and its reason. That log is the
 *    reason to write a decision down in the first place.
 */

const initial: HrFormState = undefined;

/* ── Table plumbing (matches the My Dashboard tables next door) ───────────── */

function Th({ children, numeric }: { children: React.ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)] ${
        numeric ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
  muted,
  wrap,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  muted?: boolean;
  wrap?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2.5 text-[13px] ${wrap ? "" : "whitespace-nowrap"} ${
        numeric ? "text-right tabular" : "text-left"
      } ${muted ? "text-[var(--color-ink-secondary)]" : "text-[var(--color-ink)]"}`}
    >
      {children}
    </td>
  );
}

function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </Card>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
      <tr>{children}</tr>
    </thead>
  );
}

/** `granted / in process`, the pair the frame refuses to collapse into one. */
function Pair({ granted, inProcess }: { granted: number; inProcess: number }) {
  return (
    <span className="tabular">
      {granted}
      <span className="mx-1 text-[var(--color-ink-disabled)]">/</span>
      <span className="text-[var(--color-ink-secondary)]">{inProcess}</span>
    </span>
  );
}

/* ── Per-row decision ─────────────────────────────────────────────────────── */

/**
 * Approve / Deny for one pending request.
 *
 * Both buttons submit ONE form, so the reason typed into the box travels with
 * the denial that needs it. Deny is a two-step: the first click opens the box,
 * the second submits — and the submit is disabled until the box has something
 * in it, which is the same rule the server will apply anyway.
 */
function DecideActions({ row, canApprove }: { row: ApprovalRow; canApprove: boolean }) {
  const [state, decide, pending] = useActionState(decideRequestAction, initial);
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState("");

  if (!canApprove) {
    return <span className="text-[13px] text-[var(--color-ink-secondary)]">View only</span>;
  }

  return (
    <form action={decide} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="source" value={row.source} />
      <input type="hidden" name="id" value={row.id} />

      {denying && (
        <textarea
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          autoFocus
          placeholder="Why is this denied? (required)"
          aria-label={`Reason for denying ${row.memberName}'s request`}
          className="w-64 resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]"
        />
      )}

      <div className="flex items-center justify-end gap-1.5">
        {denying ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setDenying(false);
                setNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              name="decision"
              value="rejected"
              variant="danger"
              size="sm"
              disabled={pending || !note.trim()}
            >
              Deny
            </Button>
          </>
        ) : (
          <>
            {/* Green outline, not red: approving is not destructive, and a red
                Approve beside a red Deny is two competing reds in one row. */}
            <Button
              type="submit"
              name="decision"
              value="approved"
              variant="secondary"
              size="sm"
              disabled={pending}
              className="border-[var(--color-green)] text-[var(--color-green)] hover:bg-[var(--color-green-tint)]"
            >
              <CheckCircle2 className="size-3.5" /> Approve
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => setDenying(true)}
            >
              Deny
            </Button>
          </>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="max-w-64 text-right text-xs text-[var(--color-red)]">
          {state.error}
        </p>
      )}
    </form>
  );
}

/* ── The screen ───────────────────────────────────────────────────────────── */

export type AdminTab = ApprovalAdminBoard["tab"];
export type AdminPanel = ApprovalAdminBoard["panel"];

export function AdminView({ board }: { board: ApprovalAdminBoard }) {
  // Resolved on the SERVER and handed down. Picking these in an effect would
  // server-render the wrong half and make the page unverifiable by fetch.
  const [panel, setPanel] = useState<AdminPanel>(board.panel);
  const [tab, setTab] = useState<AdminTab>(board.tab);

  const t = board.today;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Today's status ───────────────────────────────────────────────── */}
      <TileGrid>
        <StatTile
          hero
          tone="neutral"
          icon={<Users className="size-4" />}
          label="Total employees"
          value={t.totalEmployees}
          hint={`Active members on ${formatPhotoDate(t.date)}`}
        />
        <StatTile
          tone="positive"
          label="Checked in today"
          value={t.checkedIn}
          hint={`of ${t.totalEmployees} — counted per person, not per stamp`}
        />
        <StatTile
          tone="neutral"
          label="On leave"
          value={t.onLeave}
          hint="Approved leave spanning today"
        />
        <StatTile
          tone="info"
          label="Work from home"
          value={t.workingFromHome}
          hint={
            t.wfhFromLegacy > 0
              ? `${t.wfhFromLegacy} from a legacy leave row — see the WFH tab`
              : "Approved WFH spanning today"
          }
        />
      </TileGrid>

      <p className="-mt-1 text-xs text-[var(--color-ink-secondary)]">
        Today&rsquo;s tiles count people, not requests — one person on a
        three-day leave is one person away. Only an approved request counts; a
        pending one is a question, not an absence.
      </p>

      {/* ── The centre toggle ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<AdminPanel>
          label="Approvals or report"
          value={panel}
          onChange={setPanel}
          options={[
            { value: "approvals", label: "Approvals", badge: board.counts.leaves + board.counts.wfh },
            { value: "report", label: "Report" },
          ]}
        />

        {panel === "approvals" && (
          <SegmentedControl<AdminTab>
            label="Request type"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "leaves", label: "Leave requests", badge: board.counts.leaves },
              { value: "wfh", label: "WFH requests", badge: board.counts.wfh },
              { value: "visits", label: "Visit requests", badge: board.counts.visits },
            ]}
          />
        )}
      </div>

      {/* The frame's `FILTER BY: [Select User ▾]`, as a GET form — so a
          filtered queue is a URL a manager can send to somebody else, and a
          URL anybody can verify by fetching the HTML. */}
      <form method="get" action="/hr/attendance/admin" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="panel" value={panel} />
        <input type="hidden" name="tab" value={tab} />
        <div className="w-56">
          <Field label="Filter by employee" htmlFor="member">
            <Select id="member" name="member" defaultValue={board.memberId} className="h-9">
              <option value="">Everyone</option>
              {board.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="secondary" size="sm" className="mb-0.5">
          Apply filter
        </Button>
      </form>

      {panel === "report" ? (
        <ReportPanel board={board} />
      ) : tab === "visits" ? (
        <VisitsPanel board={board} />
      ) : (
        <RequestsPanel board={board} tab={tab} />
      )}
    </div>
  );
}

/* ── Approvals: leave + WFH, one table ────────────────────────────────────── */

function RequestsPanel({ board, tab }: { board: ApprovalAdminBoard; tab: AdminTab }) {
  const noun = tab === "wfh" ? "work-from-home request" : "leave request";
  const { pending, decided } = board.queue;

  return (
    <div className="flex flex-col gap-4">
      {board.legacyPendingWfh > 0 && (
        <Card className="border-[color-mix(in_srgb,var(--color-amber)_30%,var(--color-border))] bg-[var(--color-amber-tint)] p-4">
          <p className="text-[13px] font-medium text-[var(--color-ink)]">
            {board.legacyPendingWfh} pending work-from-home request is stored as a
            leave row.
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-ink-secondary)]">
            It carries{" "}
            <code className="rounded bg-[var(--color-surface)] px-1">
              leave_type = &lsquo;wfh&rsquo;
            </code>{" "}
            on{" "}
            <code className="rounded bg-[var(--color-surface)] px-1">leave_requests</code>,
            from before work from home had its own table. Deciding it writes to
            that table, and it is marked <em>Legacy row</em> in the queue. It is
            counted as work from home and never against paid leave — but whether
            these rows are migrated into{" "}
            <code className="rounded bg-[var(--color-surface)] px-1">wfh_requests</code>,
            left where they are, or retired is not yet decided, so the screen
            says so rather than folding it in quietly.
          </p>
        </Card>
      )}

      {pending.length === 0 ? (
        <EmptyState
          icon={tab === "wfh" ? <Home className="size-8" /> : <Plane className="size-8" />}
          title={`No ${noun} is waiting`}
          description={
            board.memberId
              ? "Nothing pending for this employee. Clear the filter to see everyone."
              : "Every request has been decided. Decided requests are listed below."
          }
        />
      ) : (
        <TableFrame>
          <Head>
            <Th>Name</Th>
            <Th>Applied on</Th>
            <Th>Start date</Th>
            <Th>End date</Th>
            <Th numeric>Days</Th>
            {tab === "leaves" && <Th>Leave type</Th>}
            <Th>Reason</Th>
            <Th numeric>Action</Th>
          </Head>
          <tbody className="divide-y divide-[var(--color-border)]">
            {pending.map((r) => (
              <tr key={`${r.source}:${r.id}`} className="align-top hover:bg-[var(--color-surface-sunken)]">
                <Td>
                  <span className="font-medium">{r.memberName}</span>
                  {r.legacy && (
                    <span className="ml-2 inline-flex">
                      <StatusChip tone="neutral" label="Legacy row" />
                    </span>
                  )}
                </Td>
                <Td muted>{formatPhotoDate(String(r.appliedOn).slice(0, 10))}</Td>
                <Td>{r.fromLabel}</Td>
                <Td>{r.toLabel}</Td>
                <Td numeric>{r.days}</Td>
                {tab === "leaves" && <Td>{r.typeLabel}</Td>}
                <Td muted wrap>
                  <span className="block max-w-64">{r.reason ?? "No reason given"}</span>
                </Td>
                <Td numeric>
                  <DecideActions row={r} canApprove={board.canApprove} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <DecidedLog rows={decided} noun={noun} showType={tab === "leaves"} />
    </div>
  );
}

/**
 * The decided half. Not an afterthought: it is the only place the decision
 * quartet is visible, and a decision nobody can read back is indistinguishable
 * from a value that changed on its own.
 */
function DecidedLog({
  rows,
  noun,
  showType,
}: {
  rows: ApprovalRow[];
  noun: string;
  showType: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">
        Already decided
        <span className="ml-2 font-normal text-[var(--color-ink-secondary)]">
          {rows.length} {noun}
          {rows.length === 1 ? "" : "s"}
        </span>
      </h2>
      <TableFrame>
        <Head>
          <Th>Name</Th>
          <Th>Start date</Th>
          <Th>End date</Th>
          <Th numeric>Days</Th>
          {showType && <Th>Leave type</Th>}
          <Th>Status</Th>
          <Th>Decided by</Th>
          <Th>Reason given</Th>
        </Head>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <tr key={`${r.source}:${r.id}`} className="align-top hover:bg-[var(--color-surface-sunken)]">
              <Td>
                {r.memberName}
                {r.legacy && (
                  <span className="ml-2 inline-flex">
                    <StatusChip tone="neutral" label="Legacy row" />
                  </span>
                )}
              </Td>
              <Td>{r.fromLabel}</Td>
              <Td>{r.toLabel}</Td>
              <Td numeric>{r.days}</Td>
              {showType && <Td>{r.typeLabel}</Td>}
              <Td>
                <StatusChip tone={r.tone} label={r.statusLabel} />
              </Td>
              <Td muted>
                {r.decidedByName ?? "—"}
                {r.decidedAt && (
                  <span className="block text-xs">
                    {formatPhotoDate(String(r.decidedAt).slice(0, 10))}
                  </span>
                )}
              </Td>
              <Td muted wrap>
                <span className="block max-w-64">{r.decisionNote ?? "No reason recorded"}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </div>
  );
}

/* ── Visit requests — read-only, and the screen says why ──────────────────── */

function VisitsPanel({ board }: { board: ApprovalAdminBoard }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-[13px] font-medium text-[var(--color-ink)]">
          A field visit has a lifecycle, not an approval.
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-ink-secondary)]">
          Leave and WFH carry{" "}
          <code className="rounded bg-[var(--color-surface-sunken)] px-1">
            pending / approved / rejected
          </code>{" "}
          plus who decided, when, and why.{" "}
          <code className="rounded bg-[var(--color-surface-sunken)] px-1">field_visits</code>{" "}
          carries{" "}
          <code className="rounded bg-[var(--color-surface-sunken)] px-1">
            planned / in progress / completed
          </code>{" "}
          and none of that quartet — so approving one here would move a status
          that no row could say who moved, or why. This tab reads until that is
          decided.
        </p>
      </Card>

      {board.visits.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-8" />}
          title="No field visits recorded"
          description="Visits appear here when somebody starts one from their workspace."
        />
      ) : (
        <TableFrame>
          <Head>
            <Th>Name</Th>
            <Th>Date</Th>
            <Th>Visit</Th>
            <Th>Purpose</Th>
            <Th numeric>Hours</Th>
            <Th>Status</Th>
          </Head>
          <tbody className="divide-y divide-[var(--color-border)]">
            {board.visits.map((v: VisitRow) => (
              <tr key={v.id} className="hover:bg-[var(--color-surface-sunken)]">
                <Td>{v.memberName}</Td>
                <Td muted={!v.day}>{v.dayLabel}</Td>
                <Td>{v.title}</Td>
                <Td muted>{v.purpose}</Td>
                {/* A visit still running has no knowable length — a dash, not
                    a zero, for exactly the reason an open work day gets one. */}
                <Td numeric muted={v.hours === null}>
                  {v.hours === null ? "—" : formatHours(v.hours)}
                </Td>
                <Td>
                  <StatusChip tone={v.tone} label={v.statusLabel} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </div>
  );
}

/* ── Report: the same rows, per employee ──────────────────────────────────── */

function ReportPanel({ board }: { board: ApprovalAdminBoard }) {
  if (board.report.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="size-8" />}
        title="Nobody on the roster"
        description="The report lists every active member, including those with no requests."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <TableFrame>
        <Head>
          <Th>Employee</Th>
          <Th numeric>Requests</Th>
          <Th numeric>Pending</Th>
          <Th numeric>Paid leave</Th>
          <Th numeric>Unpaid leave</Th>
          <Th numeric>Work from home</Th>
          <Th numeric>Days granted</Th>
        </Head>
        <tbody className="divide-y divide-[var(--color-border)]">
          {board.report.map((r: EmployeeReportRow) => (
            <tr key={r.memberId} className="hover:bg-[var(--color-surface-sunken)]">
              <Td>
                <span className="font-medium">{r.name}</span>
              </Td>
              <Td numeric muted={r.requests === 0}>
                {r.requests}
              </Td>
              <Td numeric>
                {r.pending > 0 ? (
                  <StatusChip tone="amber" label={`${r.pending} waiting`} />
                ) : (
                  <span className="text-[var(--color-ink-secondary)]">—</span>
                )}
              </Td>
              <Td numeric>
                <Pair granted={r.paid.granted} inProcess={r.paid.inProcess} />
              </Td>
              <Td numeric>
                <Pair granted={r.unpaid.granted} inProcess={r.unpaid.inProcess} />
              </Td>
              <Td numeric>
                <Pair granted={r.wfh.granted} inProcess={r.wfh.inProcess} />
              </Td>
              <Td numeric>
                <span className="font-semibold">{r.grantedDays}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableFrame>

      <p className="text-xs text-[var(--color-ink-secondary)]">
        Every column reads <span className="tabular">granted / in process</span>,
        in DAYS — the same pair the tiles on My Attendance show, aggregated from
        the same rows the Approvals queue lists. Everybody on the roster gets a
        line, including those with nothing to report, so this count and{" "}
        <em>Total employees</em> above answer the same question.
      </p>
    </div>
  );
}
