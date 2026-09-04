import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getApprovalBoard } from "@/lib/data/hr";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { AdminView } from "./admin-view";

/**
 * Attendance Report — Approvals & Report (PLAN-V4 §11, frame `110339`).
 *
 * The owner's framing: *"the manager side might be same as the staff, but
 * here's the thing — they get to see the HR."* So this is not a second
 * dashboard; it is the same data with the approver's controls, reached by a
 * role and refused politely rather than hidden behind a 404.
 *
 * THE TAB, THE PANEL AND THE EMPLOYEE FILTER ARE RESOLVED HERE, on the server,
 * from the query string. A client component that picked them in an effect
 * would server-render the wrong half, which makes `?tab=wfh` unverifiable by
 * fetching HTML and lands a deep link on the wrong table.
 *
 * NO RED PAGE-PRIMARY. The frame puts `Apply Leave for employee` in the header
 * as a red primary; that action is not built (it needs a writer whose actor is
 * not its subject, and an audit record that Unit 5's spine does not exist to
 * give it yet). Even when it lands, red on this screen belongs to Deny: a
 * filled red button in the header would compete with the red Deny on every row
 * of the queue, which is the exact offender DESIGN-DIRECTION names.
 */

export default async function AttendanceApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; panel?: string; member?: string }>;
}) {
  const { tab, panel, member } = await searchParams;
  const board = await getApprovalBoard({ tab, panel, memberId: member });

  // TODO(§11.3): Unit 6 replaces this coarse role check with `can("hr",
  // "approve", scope)` once Unit 5 lands the permission spine and
  // `audit_events`. Until then `canManageTeam` (via getActingContext) is the
  // guard, and the SAME check is applied again in the writer — a screen that
  // only hid the buttons would not be a permission, it would be a decoration.
  if (!board.canApprove) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Attendance report"
          subtitle="Approvals are a manager's view of the same attendance data."
        />
        <EmptyState
          icon={<ShieldAlert className="size-8" />}
          title="You do not approve attendance requests"
          description={`${board.actor.name} is signed in as ${board.actor.role}. Deciding leave and work-from-home requests is a manager's job — your own requests live on My attendance.`}
          action={
            <Link href="/hr/attendance">
              <Button variant="secondary" size="sm">
                Go to my attendance
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const waiting = board.counts.leaves + board.counts.wfh;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Attendance report"
        subtitle={`${board.today.totalEmployees} employees · ${
          waiting === 0 ? "nothing waiting for a decision" : `${waiting} waiting for a decision`
        }`}
        actions={
          <Link href="/hr/attendance">
            <Button variant="secondary" size="sm">
              My attendance
            </Button>
          </Link>
        }
      />

      <AdminView board={board} />

      <Card className="mt-5 p-4">
        <p className="text-[13px] text-[var(--color-ink-secondary)]">
          A decision is written as a status change plus who decided it and when —
          nothing is deleted, and a denial must carry a reason. Applying for
          leave on somebody else&rsquo;s behalf is still not built here: it
          writes a request in another person&rsquo;s name, and while the audit
          ledger now exists to record that, who may do it for whom is a policy
          nobody has set.
        </p>
      </Card>
    </div>
  );
}
