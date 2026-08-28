"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  Gauge,
  IdCard,
  MapPin,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/data/team";
import type { MyWorkspace, TeamWorkspace } from "@/lib/data/workspace";
import type { DashboardData } from "@/lib/data/dashboard";
import { canConfigureOrg } from "@/lib/workspace-model";
import { TabBar, type TabDef } from "./workspace-ui";
import {
  ExpensesPanel,
  MyInfoPanel,
  OverviewPanel,
  TasksPanel,
  VisitsPanel,
} from "./panels-my";
import {
  ApprovalsPanel,
  SetupPanel,
  TaskBoardPanel,
  TeamOverviewPanel,
  TeamPanel,
} from "./panels-team";

/**
 * The workspace shell.
 *
 * The brief was explicit: buttons across the top, and pressing one swaps what
 * is below it *in this page* — no navigation, no new tab, no second screen.
 * So tab state lives here in React and the URL is kept in sync with
 * history.replaceState: a refresh lands you back where you were, but a tab
 * press never costs a round-trip or a route change.
 *
 * A manager or owner additionally gets a My work / Team switch. Same shell,
 * same components, different scope — the two dashboards are one product.
 */

const MY_TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: <Gauge className="size-4" /> },
  { id: "info", label: "My info", icon: <IdCard className="size-4" /> },
  { id: "tasks", label: "Tasks", icon: <ClipboardList className="size-4" /> },
  { id: "expenses", label: "Expenses", icon: <Wallet className="size-4" /> },
  { id: "visits", label: "Field visits", icon: <MapPin className="size-4" /> },
];

const TEAM_TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: <Gauge className="size-4" /> },
  { id: "team", label: "Team", icon: <Users className="size-4" /> },
  { id: "board", label: "Task board", icon: <ClipboardList className="size-4" /> },
  { id: "approvals", label: "Approvals", icon: <BadgeCheck className="size-4" /> },
  { id: "setup", label: "Setup", icon: <Settings2 className="size-4" /> },
];

type View = "my" | "team";

/**
 * The manager/owner view is built and tested but PARKED at the owner's request
 * — they want to specify what belongs on it before it ships, so for now every
 * role sees the employee workspace. The panels, data layer and approval
 * actions all still work; flip this to true to bring the switch back.
 */
export const TEAM_VIEW_ENABLED = false;

export function WorkspaceShell({
  w,
  team,
  org,
  members,
}: {
  w: MyWorkspace;
  team: TeamWorkspace | null;
  org: DashboardData | null;
  members: Member[];
}) {
  const teamView = TEAM_VIEW_ENABLED ? team : null;
  const [view, setView] = useState<View>("my");
  const [tab, setTab] = useState("overview");

  // Restore the last position from the URL. The greeting and the date are
  // rendered on the server (see page.tsx) — this only restores position.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    const t = params.get("tab");
    const tabs = v === "team" && teamView ? TEAM_TABS : MY_TABS;
    if (v === "team" && teamView) setView("team");
    if (t && tabs.some((x) => x.id === t)) setTab(t);
  }, [teamView]);

  const sync = useCallback((nextView: View, nextTab: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", nextView);
    params.set("tab", nextTab);
    // replaceState, not router.push — the panel swap must not be a navigation.
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const selectTab = useCallback(
    (id: string) => {
      setTab(id);
      sync(view, id);
    },
    [sync, view],
  );

  const selectView = useCallback(
    (v: View) => {
      setView(v);
      setTab("overview");
      sync(v, "overview");
    },
    [sync],
  );

  const isTeam = view === "team" && !!teamView;
  const tabs = (isTeam ? TEAM_TABS : MY_TABS).map((t) => {
    if (!isTeam && t.id === "tasks") {
      return { ...t, badge: w.taskCounts.overdue, alert: true };
    }
    if (isTeam && t.id === "approvals" && teamView) {
      return {
        ...t,
        badge: teamView.pendingLeave.length + teamView.pendingExpenses.length,
      };
    }
    if (isTeam && t.id === "board" && teamView) {
      return { ...t, badge: teamView.taskCounts.overdue, alert: true };
    }
    return t;
  });

  return (
    <>
      {/* The greeting lives in page.tsx so it can paint before any query
          resolves. What stays here is the scope switch, which depends on the
          data this shell was given. */}
      {teamView && (
        <div className="mb-3 flex justify-end">
          <div
            role="tablist"
            aria-label="Dashboard scope"
            className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1"
          >
            {(
              [
                { id: "my" as const, label: "My work" },
                { id: "team" as const, label: "Team" },
              ]
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => selectView(v.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                  view === v.id
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1 pt-1">
        <TabBar tabs={tabs} active={tab} onSelect={selectTab} />
      </div>

      <div className="pt-6">
        {!isTeam && (
          <>
            {tab === "overview" && <OverviewPanel w={w} />}
            {tab === "info" && <MyInfoPanel w={w} />}
            {tab === "tasks" && <TasksPanel w={w} />}
            {tab === "expenses" && <ExpensesPanel w={w} />}
            {tab === "visits" && <VisitsPanel w={w} />}
          </>
        )}
        {isTeam && teamView && (
          <>
            {tab === "overview" && org && (
              <TeamOverviewPanel team={teamView} org={org} />
            )}
            {tab === "team" && <TeamPanel team={teamView} />}
            {tab === "board" && (
              <TaskBoardPanel team={teamView} w={w} members={members} />
            )}
            {tab === "approvals" && (
              <ApprovalsPanel team={teamView} options={w.options} members={members} />
            )}
            {tab === "setup" && (
              <SetupPanel
                options={w.options}
                members={members}
                canConfigure={canConfigureOrg(w.member.role)}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

export const dashboardIcons = { CalendarDays };
