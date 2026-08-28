import { Suspense } from "react";
import { getDashboard } from "@/lib/data/dashboard";
import { getMyWorkspace, getTeamWorkspace } from "@/lib/data/workspace";
import { getActingContext } from "@/lib/data/team";
import { TEAM_VIEW_ENABLED, WorkspaceShell } from "./workspace-shell";
import { WorkspaceSkeleton } from "./workspace-skeleton";

/**
 * Dashboard = the workspace. Two dashboards in one route: an employee's own day
 * and, for a manager or owner, the whole team — the shell switches between them
 * without a navigation.
 *
 * The greeting is served from `getActingContext()`, which the layout has
 * already resolved and request-cached, so the page frame paints immediately.
 * Everything that needs a real query sits behind a Suspense boundary and
 * streams in underneath it (frame `102211` caught the whole content area
 * blocking on the fetches).
 */
export default async function DashboardPage() {
  const acting = await getActingContext();

  return (
    <div className="mx-auto max-w-6xl">
      <WorkspaceHeader name={acting.member.name} />
      <Suspense fallback={<WorkspaceSkeleton />}>
        <WorkspaceBody />
      </Suspense>
    </div>
  );
}

/**
 * Everything below the greeting. The team query only runs when the acting
 * member is actually allowed to see it AND the parked manager view is switched
 * on — `getDashboard()` fans out to six module queries and, while the view is
 * parked, nothing rendered them. That cost came straight off first paint.
 */
async function WorkspaceBody() {
  const w = await getMyWorkspace();
  const wantsTeam = TEAM_VIEW_ENABLED && w.isManager;
  const [team, org] = wantsTeam
    ? await Promise.all([getTeamWorkspace(), getDashboard()])
    : [null, null];

  return <WorkspaceShell w={w} team={team} org={org} members={w.members} />;
}

/* ── Greeting ─────────────────────────────────────────────────────────────── */

/**
 * Rendered on the server against Asia/Kolkata rather than the machine clock.
 * A build/serve host in another timezone would otherwise greet an Indian user
 * good evening at breakfast — and computing it in the browser instead costs a
 * hydration mismatch or a visible flicker.
 */
function WorkspaceHeader({ name }: { name: string }) {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const today = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
        {greeting(hour)}, {name.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
        {today} · Your work today
      </p>
    </div>
  );
}

const IST = "Asia/Kolkata";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
