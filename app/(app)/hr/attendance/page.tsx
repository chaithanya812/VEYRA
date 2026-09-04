import { getMyAttendance } from "@/lib/data/hr";
import { formatHours, monthLabel } from "@/lib/hr-model";
import { PageHeader } from "@/components/ui/primitives";
import { AttendanceView, type AttendanceTab } from "./attendance-view";

/**
 * My Dashboard — attendance, leave, WFH and holidays (PLAN-V4 §11, frame
 * `110318`).
 *
 * The tab is resolved HERE, on the server, from `?view=`. A client component
 * that picks its tab in an effect server-renders the wrong one, which means
 * `/hr/attendance?view=holidays` cannot be verified by fetching HTML and a
 * deep link lands somebody on the wrong table. The month and leave-type
 * filters come from the query string for the same reason: a filtered view is
 * a URL somebody can send to their manager.
 */

const TABS: AttendanceTab[] = ["attendance", "leaves", "wfh", "holidays"];

function tabOf(view: string | undefined): AttendanceTab {
  return (TABS as string[]).includes(String(view)) ? (view as AttendanceTab) : "attendance";
}

export default async function HrAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; type?: string }>;
}) {
  const { view, month, type } = await searchParams;
  const board = await getMyAttendance({ month, type });

  const t = board.attendanceTotals;
  const hours = t.openDays > 0 ? `${formatHours(t.sessionHours)} over the closed days` : formatHours(t.sessionHours);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My attendance"
        subtitle={`${board.member.name} · ${monthLabel(board.month)} · ${t.days} ${
          t.days === 1 ? "day" : "days"
        } recorded · ${hours}`}
      />

      <AttendanceView board={board} initialTab={tabOf(view)} />
    </div>
  );
}
