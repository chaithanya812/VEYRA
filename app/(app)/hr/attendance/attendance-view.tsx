"use client";

import { useActionState, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Download,
  Home,
  Plane,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, EmptyState, StatusChip } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FormError,
  FormGrid,
  StatTile,
  SubmitButton,
  TileGrid,
} from "../../dashboard/workspace-ui";
import {
  attendanceCsv,
  formatHours,
  monthLabel,
  timeDifference,
  type AttendanceDay,
  type RequestRow,
} from "@/lib/hr-model";
import { formatPhotoDate } from "@/lib/site-photos-model";
import type { AttendanceBoard } from "@/lib/data/hr";
import { applyLeaveAction, type HrFormState } from "./actions";

/**
 * My Dashboard (frame `110318`).
 *
 * Three things this screen is careful about:
 *
 * 1. **An unfinished day prints `—`, never `0 Hrs 0 Min`.** The frame's
 *    `1 check-in / 0 check-out / -` row is the whole reason attendance is
 *    derived rather than stored, and a confident zero would throw that away.
 * 2. **The three approval tiles show BOTH numbers.** `1 Granted` and
 *    `16 In process` are different facts; collapsing them to one figure hides
 *    the pair the frame is making a point of.
 * 3. **The WFH collision is named on the screen.** A `leave_type = 'wfh'` row
 *    from before WFH had its own table is counted here and never against paid
 *    leave — but the screen says so, because whether those rows get migrated
 *    is the owner's decision and it has not been made (HANDOFF §10.5).
 *
 * Red appears once: `Apply` is the one primary action. `Export` is a black
 * secondary — the frame makes both red, which is a sixth job red does not
 * have (DESIGN-DIRECTION §2). Status chips are grey / amber / green and every
 * one carries its label.
 */

export type AttendanceTab = "attendance" | "leaves" | "wfh" | "holidays";

const initial: HrFormState = undefined;

/* ── Table plumbing ───────────────────────────────────────────────────────── */

function Th({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
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
}: {
  children: React.ReactNode;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2.5 text-[13px] ${
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

/** A tile that shows a pair: `1 Granted` beside `16 In process`. */
function Pair({ granted, inProcess }: { granted: number; inProcess: number }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xl">
      <span>
        {granted}
        <span className="ml-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
          granted
        </span>
      </span>
      <span className="text-[var(--color-ink-secondary)]">
        {inProcess}
        <span className="ml-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
          in process
        </span>
      </span>
    </span>
  );
}

/* ── The screen ───────────────────────────────────────────────────────────── */

export function AttendanceView({
  board,
  initialTab,
}: {
  board: AttendanceBoard;
  initialTab: AttendanceTab;
}) {
  const [tab, setTab] = useState<AttendanceTab>(initialTab);
  const [applyOpen, setApplyOpen] = useState(false);
  const [state, apply] = useActionState(applyLeaveAction, initial);

  const today = new Date().toISOString().slice(0, 10);
  const month = monthLabel(board.month);

  const download = () => {
    const csv = attendanceCsv(board.attendance, board.expectedStart);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${board.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── The four tiles ───────────────────────────────────────────────── */}
      <TileGrid>
        <StatTile
          hero
          tone="positive"
          label="Available paid leave"
          value={board.tiles.available}
          hint={`of ${board.tiles.entitlement} days a year · ${board.tiles.paid.granted} granted so far`}
        />
        <StatTile
          tone="neutral"
          label="Paid leave"
          value={<Pair granted={board.tiles.paid.granted} inProcess={board.tiles.paid.inProcess} />}
          hint="Days, not requests"
        />
        <StatTile
          tone="neutral"
          label="Unpaid leave"
          value={
            <Pair granted={board.tiles.unpaid.granted} inProcess={board.tiles.unpaid.inProcess} />
          }
          hint="Days, not requests"
        />
        <StatTile
          tone="info"
          label="Work from home"
          value={<Pair granted={board.tiles.wfh.granted} inProcess={board.tiles.wfh.inProcess} />}
          hint={
            board.legacyWfhCount > 0
              ? `Includes ${board.legacyWfhCount} legacy row — see the WFH tab`
              : "Never deducted from leave"
          }
        />
      </TileGrid>

      <p className="-mt-1 text-xs text-[var(--color-ink-secondary)]">
        The tiles count your whole year against an entitlement of{" "}
        {board.tiles.entitlement} days. The tabs below show {month}.
      </p>

      {/* ── Tabs + filter band + actions ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<AttendanceTab>
          label="Attendance sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: "attendance", label: "Attendance", badge: board.attendance.length },
            { value: "leaves", label: "Leaves", badge: board.leaves.length },
            { value: "wfh", label: "WFH", badge: board.wfh.length },
            { value: "holidays", label: "Holidays", badge: board.holidays.length },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={download} type="button">
            <Download className="size-4" /> Export to CSV
          </Button>

          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" size="sm">
                Apply (Leave / WFH)
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply for leave or work from home</DialogTitle>
                <DialogDescription>
                  A work-from-home day is not leave — the person worked — so it is
                  requested here but never deducted from your entitlement.
                </DialogDescription>
              </DialogHeader>
              <form action={apply} className="flex flex-col gap-4">
                <FormError error={state?.error} />
                <FormGrid>
                  <Field label="Type" htmlFor="kind" required>
                    <Select id="kind" name="kind" defaultValue="casual">
                      {board.leaveTypes.map((o) => (
                        <option key={o.id} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      <option value="wfh_request">Work from home</option>
                    </Select>
                  </Field>
                  <Field label="From" htmlFor="from_date" required>
                    <Input id="from_date" name="from_date" type="date" defaultValue={today} />
                  </Field>
                  <Field label="To" htmlFor="to_date" required>
                    <Input id="to_date" name="to_date" type="date" defaultValue={today} />
                  </Field>
                  <Field label="Reason" htmlFor="reason">
                    <Textarea id="reason" name="reason" placeholder="Family function" />
                  </Field>
                </FormGrid>
                <div className="flex items-center gap-2">
                  <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
                  {state?.ok && (
                    <span className="text-[13px] text-[var(--color-green)]">
                      Request sent for approval.
                    </span>
                  )}
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* The filter band is a GET form, so a filtered view is a URL somebody
          can send to their manager — and a page anybody can verify by fetch. */}
      <form method="get" action="/hr/attendance" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={tab} />
        <div className="w-44">
          <Field label="Filter by month" htmlFor="month">
            <Select id="month" name="month" defaultValue={board.month} className="h-9">
              {board.monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {tab === "leaves" && (
          <div className="w-44">
            <Field label="Leave type" htmlFor="type">
              <Select id="type" name="type" defaultValue={board.type} className="h-9">
                <option value="">All types</option>
                {board.leaveTypes.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Button type="submit" variant="secondary" size="sm" className="mb-0.5">
          Apply filter
        </Button>
      </form>

      {tab === "attendance" && <AttendanceTable board={board} />}
      {tab === "leaves" && <LeavesTab board={board} />}
      {tab === "wfh" && <WfhTab board={board} />}
      {tab === "holidays" && <HolidaysTab board={board} />}
    </div>
  );
}

/* ── Attendance ───────────────────────────────────────────────────────────── */

function AttendanceTable({ board }: { board: AttendanceBoard }) {
  const t = board.attendanceTotals;

  if (board.attendance.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="size-8" />}
        title={`Nothing recorded in ${monthLabel(board.month)}`}
        description="Days appear here once you check in or start a field visit. Pick another month above."
      />
    );
  }

  return (
    <>
      <TableFrame>
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
          <tr>
            <Th>Date</Th>
            <Th numeric>No. of check-in</Th>
            <Th numeric>No. of check-out</Th>
            <Th numeric>Total check-in hours</Th>
            <Th numeric>Total visit count</Th>
            <Th numeric>Total visit hours</Th>
            <Th>Time difference</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {board.attendance.map((d: AttendanceDay) => {
            const verdict = timeDifference(d, board.expectedStart);
            return (
              <tr key={d.date} className="hover:bg-[var(--color-surface-sunken)]">
                {/* Formatted FROM THE STRING — `2026-08-26` through a `Date`
                    and back comes out as the 25th. */}
                <Td>{formatPhotoDate(d.date)}</Td>
                <Td numeric>{d.checkIns}</Td>
                <Td numeric>{d.checkOuts}</Td>
                {/* An open day is a dash. It is not zero hours — it is hours
                    nobody can know yet. */}
                <Td numeric muted={d.open}>
                  {d.open ? "—" : formatHours(d.sessionHours)}
                </Td>
                <Td numeric>{d.visitCount}</Td>
                <Td numeric>{formatHours(d.visitHours)}</Td>
                <Td>
                  {d.open ? (
                    <StatusChip tone="amber" label="Still checked in" />
                  ) : verdict ? (
                    <StatusChip
                      tone={verdict === "On-time" ? "green" : "amber"}
                      label={verdict}
                    />
                  ) : (
                    <span className="text-[var(--color-ink-secondary)]">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
          <tr>
            <Td>
              <span className="font-semibold">{t.days} days</span>
            </Td>
            <Td numeric>—</Td>
            <Td numeric>—</Td>
            <Td numeric>
              <span className="font-semibold">{formatHours(t.sessionHours)}</span>
            </Td>
            <Td numeric>
              <span className="font-semibold">{t.visitCount}</span>
            </Td>
            <Td numeric>
              <span className="font-semibold">{formatHours(t.visitHours)}</span>
            </Td>
            <Td muted>{t.openDays > 0 ? `${t.openDays} day still open` : ""}</Td>
          </tr>
        </tfoot>
      </TableFrame>

      <p className="text-xs text-[var(--color-ink-secondary)]">
        On-time is measured against a {board.expectedStart} start. Hours are
        derived from your check-in and check-out stamps — a day still open
        contributes nothing to the total, because nobody knows yet how long it
        was.
      </p>
    </>
  );
}

/* ── Requests (Leaves + WFH share one table) ──────────────────────────────── */

function RequestTable({
  rows,
  showType,
}: {
  rows: RequestRow[];
  showType: boolean;
}) {
  return (
    <TableFrame>
      <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
        <tr>
          {showType && <Th>Type</Th>}
          <Th>Start date</Th>
          <Th>End date</Th>
          <Th numeric>Days</Th>
          <Th>Reason</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-border)]">
        {rows.map((r) => (
          <tr key={`${r.source}:${r.id}`} className="hover:bg-[var(--color-surface-sunken)]">
            {showType && <Td>{r.typeLabel}</Td>}
            <Td>{r.fromLabel}</Td>
            <Td>{r.toLabel}</Td>
            <Td numeric>{r.days}</Td>
            <Td muted>{r.reason ?? "No reason recorded"}</Td>
            <Td>
              <span className="inline-flex items-center gap-1.5">
                <StatusChip tone={r.tone} label={r.statusLabel} />
                {r.legacy && <StatusChip tone="neutral" label="Legacy row" />}
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function LeavesTab({ board }: { board: AttendanceBoard }) {
  return (
    <>
      {board.leaves.length === 0 ? (
        <EmptyState
          icon={<Plane className="size-8" />}
          title={`No leave in ${monthLabel(board.month)}`}
          description="Requests that overlap the selected month appear here. Apply above."
        />
      ) : (
        <RequestTable rows={board.leaves} showType />
      )}

      {board.legacyWfhCount > 0 && (
        <p className="text-xs text-[var(--color-ink-secondary)]">
          {board.legacyWfhCount} request stored with{" "}
          <code className="rounded bg-[var(--color-surface-sunken)] px-1">
            leave_type = &lsquo;wfh&rsquo;
          </code>{" "}
          is not listed here. It is shown on the WFH tab, and it does not draw
          against your paid entitlement.
        </p>
      )}
    </>
  );
}

function WfhTab({ board }: { board: AttendanceBoard }) {
  return (
    <>
      {board.wfh.length === 0 ? (
        <EmptyState
          icon={<Home className="size-8" />}
          title={`No work-from-home days in ${monthLabel(board.month)}`}
          description="A WFH day is requested and approved separately from leave, because the person worked."
        />
      ) : (
        <RequestTable rows={board.wfh} showType={false} />
      )}

      {board.legacyWfhCount > 0 && (
        <Card className="border-[color-mix(in_srgb,var(--color-amber)_30%,var(--color-border))] bg-[var(--color-amber-tint)] p-4">
          <p className="text-[13px] font-medium text-[var(--color-ink)]">
            Work from home is stored in two places right now.
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-ink-secondary)]">
            {board.legacyWfhCount} of your work-from-home days are older rows on{" "}
            <code className="rounded bg-[var(--color-surface)] px-1">leave_requests</code>{" "}
            with{" "}
            <code className="rounded bg-[var(--color-surface)] px-1">
              leave_type = &lsquo;wfh&rsquo;
            </code>
            , from before work from home had its own table. They are counted
            here and never against paid leave, and they are marked{" "}
            <em>Legacy row</em> above. Whether they are migrated into{" "}
            <code className="rounded bg-[var(--color-surface)] px-1">wfh_requests</code>,
            left readable where they are, or retired is not yet decided — so
            this tab counts from two tables and says so rather than picking one
            quietly.
          </p>
        </Card>
      )}
    </>
  );
}

/* ── Holidays ─────────────────────────────────────────────────────────────── */

function HolidaysTab({ board }: { board: AttendanceBoard }) {
  if (board.holidays.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-8" />}
        title={`No holidays listed for ${board.holidayWindow.label}`}
        description="The holiday calendar belongs to your workspace — an admin adds the dates your office closes."
      />
    );
  }

  return (
    <>
      <TableFrame>
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
          <tr>
            <Th>Date</Th>
            <Th>Day</Th>
            <Th>Holiday</Th>
            <Th>Kind</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {board.holidays.map((h) => (
            <tr key={h.id} className="hover:bg-[var(--color-surface-sunken)]">
              <Td>{h.label}</Td>
              <Td muted>{h.weekday}</Td>
              <Td>{h.name}</Td>
              <Td>
                <StatusChip
                  tone={h.isOptional ? "neutral" : "green"}
                  label={h.isOptional ? "Optional" : "Office closed"}
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </TableFrame>

      <p className="text-xs text-[var(--color-ink-secondary)]">
        {board.holidayWindow.label} — a holiday calendar is a year, not a month,
        so this tab is not narrowed by the month filter. An optional holiday is
        one you may take; the office stays open.
      </p>
    </>
  );
}
