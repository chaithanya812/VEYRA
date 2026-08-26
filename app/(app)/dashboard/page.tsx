import { getDashboard } from "@/lib/data/dashboard";
import { getMyWorkspace, getTeamWorkspace } from "@/lib/data/workspace";
import { TEAM_VIEW_ENABLED, WorkspaceShell } from "./workspace-shell";

/**
 * Dashboard = the workspace. Two dashboards in one route: an employee's own day
 * and, for a manager or owner, the whole team — the shell switches between them
 * without a navigation.
 *
 * All fetching happens here on the server; the shell and its panels are client
 * components purely so the tab bar can swap panels in-page. The team query only
 * runs when the acting member is actually allowed to see it.
 */
export default async function DashboardPage() {
  const w = await getMyWorkspace();
  const [team, org] = await Promise.all([
    w.isManager && TEAM_VIEW_ENABLED ? getTeamWorkspace() : Promise.resolve(null),
    getDashboard(),
  ]);

  return <WorkspaceShell w={w} team={team} org={org} members={w.members} />;
}
