"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Camera,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  HardHat,
  IndianRupee,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Ruler,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import { MilestoneCell } from "@/components/ui/milestone-cell";
import { StatTile, TabBar, TileGrid, type TabDef } from "../../dashboard/workspace-ui";
import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_TONE,
  milestoneVariance,
  scheduleHealth,
  statusOf,
} from "@/lib/milestones-model";
import { STAGE_LABELS } from "@/lib/projects-model";
import { seriesColor } from "@/lib/palette";
import type { ProjectWorkspaceData } from "@/lib/data/projects";
import { cn, fmtDate, inr } from "@/lib/utils";

/**
 * The project (PLAN-V4 §8.2, frames `104529` / `104705`).
 *
 * The owner on the Summary tab: *"the very most important part of the UI."*
 * Two page tabs, swapped in place like every other tab row in this product —
 * Summary, which is the whole project on one screen, and Modules, which is the
 * way in to everything else.
 *
 * The header band states progress honestly: actual against a *derived*
 * estimate, with the shortfall named. The competitor hardcodes "100% est",
 * which makes every project look behind from day one.
 */
const TABS: TabDef[] = [
  { id: "summary", label: "Summary", icon: <LayoutGrid className="size-4" /> },
  { id: "modules", label: "Modules", icon: <Boxes className="size-4" /> },
];

export function ProjectWorkspace({ data }: { data: ProjectWorkspaceData }) {
  const [tab, setTab] = useState("summary");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, []);

  const select = useCallback((id: string) => {
    setTab(id);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  return (
    <>
      <ProjectHeader data={data} />

      <div className="sticky top-0 z-10 -mx-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1 pt-1">
        <TabBar tabs={TABS} active={tab} onSelect={select} />
      </div>

      <div className="pt-6">
        {tab === "summary" ? <SummaryTab data={data} /> : <ModulesTab data={data} />}
      </div>
    </>
  );
}

/* ── Header band ──────────────────────────────────────────────────────────── */

function ProjectHeader({ data }: { data: ProjectWorkspaceData }) {
  const { project, rollup } = data;
  const health = scheduleHealth(rollup);

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            {project.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-ink-secondary)]">
            <span>{project.client_name ?? "No client"}</span>
            <span className="rounded-full bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[12px] font-medium text-[var(--color-ink)]">
              {STAGE_LABELS[project.stage]}
            </span>
            <span className="tabular">
              {fmtDate(project.start_date)} → {fmtDate(project.handover_date)}
            </span>
          </p>
        </div>

        <div className="flex items-end gap-4">
          <div className="min-w-52">
            <ProgressBar
              label="Estimated"
              pct={rollup.estimatedPct}
              color="var(--color-info)"
            />
            <ProgressBar
              label="Actual"
              pct={rollup.actualPct}
              color={health.behind ? "var(--color-red)" : "var(--color-green)"}
            />
            <p
              className={cn(
                "mt-1 text-[12px] font-medium",
                health.behind
                  ? "text-[var(--color-red)]"
                  : "text-[var(--color-ink-secondary)]",
              )}
            >
              {health.label}
            </p>
          </div>
          <Link href={`/projects/${project.id}/report`}>
            <Button variant="secondary" size="sm">
              <FileText className="size-4" /> View report
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="w-16 text-[11px] text-[var(--color-ink-secondary)]">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </span>
      <span className="w-12 text-right text-[11px] font-medium tabular text-[var(--color-ink)]">
        {pct}%
      </span>
    </div>
  );
}

/* ── Summary ──────────────────────────────────────────────────────────────── */

function SummaryTab({ data }: { data: ProjectWorkspaceData }) {
  const [showMoney, setShowMoney] = useState(true);
  const [rightPane, setRightPane] = useState<"milestones" | "procurement">("milestones");
  const f = data.financials;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      {/* Left column — what happened lately. */}
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <PanelHead
            icon={<Camera className="size-4" />}
            title={`Site progress (${data.sitePhotos.length})`}
            href="/site"
          />
          {data.sitePhotos.length === 0 ? (
            <Blank>No site photos uploaded yet.</Blank>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {data.sitePhotos.slice(0, 8).map((p) => (
                  <div
                    key={p.id}
                    title={p.caption ?? undefined}
                    className="aspect-square overflow-hidden rounded-md bg-[var(--color-surface-sunken)]"
                  >
                    {p.url && (
                      /* A plain <img>: these are user-uploaded URLs on an
                         arbitrary host, which next/image would need configured
                         domains for. */
                      <img
                        src={p.url}
                        alt={p.caption ?? "Site photo"}
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">
                Last uploaded {fmtDate(data.sitePhotos[0].created_at)}
              </p>
            </>
          )}
        </Card>

        <Card className="p-4">
          <PanelHead
            icon={<FileText className="size-4" />}
            title={`Design documents (${data.documents.length})`}
            href={`/projects/${data.project.id}/documents`}
          />
          {data.documents.length === 0 ? (
            <Blank>No documents yet.</Blank>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.documents.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate text-[var(--color-ink)]">{d.name}</span>
                  <span className="shrink-0 text-xs tabular text-[var(--color-ink-secondary)]">
                    {fmtDate(d.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <PanelHead icon={<MessageSquare className="size-4" />} title="Latest updates" />
          {data.updates.length === 0 ? (
            <Blank>Nothing logged yet.</Blank>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.updates.slice(0, 6).map((u) => (
                <li key={u.id} className="text-[13px]">
                  <p className="text-[var(--color-ink)]">{u.note}</p>
                  <p className="text-xs tabular text-[var(--color-ink-secondary)]">
                    {fmtDate(u.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Right column — the money and the work. */}
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
              <IndianRupee className="size-4 text-[var(--color-ink-secondary)]" />
              Project financials
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-[12px] font-medium tabular text-[var(--color-ink)]">
                Value {inr(f.projectValue)}
              </span>
              {/* The first hook for field-level visibility (PLAN-V4 §11.3): a
                  supervisor standing on site should be able to hide the money. */}
              <button
                type="button"
                onClick={() => setShowMoney((v) => !v)}
                aria-pressed={!showMoney}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-[12px] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-sunken)]"
              >
                {showMoney ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                {showMoney ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {showMoney ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Figure label="Funds received" value={inr(f.fundsReceived)} tone="green" />
                <Figure label="Total disbursed" value={inr(f.totalDisbursed)} tone="red" />
                <Figure label="Total receivables" value={inr(f.totalReceivables)} />
                <Figure label="Receivable dues" value={inr(f.receivableDues)} tone="amber" />
                <Figure label="Estimated expenses" value={inr(f.estimatedExpenses)} />
                <Figure label="Committed" value={inr(f.committed)} tone="amber" />
              </div>
              <div className="mt-3">
                <TileGrid>
                  <StatTile
                    hero
                    label="Cash flow"
                    value={inr(f.cashFlow)}
                    tone={f.cashFlow >= 0 ? "positive" : "negative"}
                    hint="Funds received less disbursed"
                  />
                  <StatTile
                    label="Expected P&L"
                    value={inr(f.pnl)}
                    tone={f.pnl >= 0 ? "positive" : "negative"}
                    hint="Project value less estimated expenses"
                  />
                </TileGrid>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-ink-secondary)]">
              Financials hidden.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              {rightPane === "milestones" ? "Milestones" : "Procurement"}
            </h2>
            <SegmentedControl
              label="Panel"
              size="sm"
              value={rightPane}
              onChange={setRightPane}
              options={[
                { value: "milestones", label: "Milestones", badge: data.milestones.length },
                {
                  value: "procurement",
                  label: "Procurement",
                  badge: data.orders.length + data.requests.length,
                },
              ]}
            />
          </div>

          {rightPane === "milestones" ? (
            <MilestoneTable data={data} />
          ) : (
            <ProcurementTable data={data} />
          )}
        </Card>
      </div>
    </div>
  );
}

function MilestoneTable({ data }: { data: ProjectWorkspaceData }) {
  const nameById = new Map(data.members.map((m) => [m.id, m.name]));

  if (data.milestones.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center">
        <p className="text-sm font-medium text-[var(--color-ink)]">No plan yet</p>
        <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
          <Link
            href={`/projects/${data.project.id}/plan`}
            className="font-medium text-[var(--color-red)] hover:underline"
          >
            Open Project planning
          </Link>{" "}
          to lay one out — start from a template or write your own.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
            <th className="py-2 font-medium">Milestone</th>
            <th className="py-2 font-medium">Progress</th>
            <th className="py-2 font-medium">Timeline</th>
            <th className="py-2 font-medium">Assignee</th>
          </tr>
        </thead>
        <tbody>
          {data.milestones.slice(0, 12).map((m) => {
            const v = milestoneVariance(m);
            const status = statusOf(m);
            return (
              <tr key={m.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2.5 pr-3">
                  <span className="font-medium text-[var(--color-ink)]">{m.name}</span>
                  <span
                    className={cn(
                      "ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      MILESTONE_STATUS_TONE[status] === "green" &&
                        "bg-[var(--color-green-tint)] text-[var(--color-green)]",
                      MILESTONE_STATUS_TONE[status] === "amber" &&
                        "bg-[var(--color-amber-tint)] text-[var(--color-amber)]",
                      MILESTONE_STATUS_TONE[status] === "red" &&
                        "bg-[var(--color-red-tint)] text-[var(--color-red-hover)]",
                      MILESTONE_STATUS_TONE[status] === "neutral" &&
                        "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]",
                    )}
                  >
                    {MILESTONE_STATUS_LABELS[status]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 tabular">{Number(m.progress_pct) || 0}%</td>
                <td className="py-2.5 pr-3">
                  <span className="block tabular text-[var(--color-ink-secondary)]">
                    {fmtDate(m.planned_start)} → {fmtDate(m.planned_end)}
                  </span>
                  {v.state === "late" && (
                    <span className="text-[12px] font-medium text-[var(--color-red)]">
                      {v.label}
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-[var(--color-ink-secondary)]">
                  {m.assignee_id ? (nameById.get(m.assignee_id) ?? "—") : "Unassigned"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProcurementTable({ data }: { data: ProjectWorkspaceData }) {
  if (data.orders.length === 0 && data.requests.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center">
        <p className="text-sm font-medium text-[var(--color-ink)]">
          Nothing procured yet
        </p>
        <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
          An approved quotation can raise its material request in one click.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.requests.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Requests
          </p>
          <ul className="flex flex-col gap-1">
            {data.requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-[13px]">
                <Link
                  href={`/procurement/${r.id}`}
                  className="truncate text-[var(--color-ink)] hover:underline"
                >
                  {r.title}
                </Link>
                <span className="shrink-0 rounded-full bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] text-[var(--color-ink-secondary)]">
                  {r.stage}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.orders.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Orders
          </p>
          <ul className="flex flex-col gap-1">
            {data.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 text-[13px]">
                <Link
                  href={`/orders/${o.id}`}
                  className="truncate text-[var(--color-ink)] hover:underline"
                >
                  {o.number ?? "Order"}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-[var(--color-ink-secondary)]">
                    {inr(o.amount)}
                  </span>
                  <span className="rounded-full bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] text-[var(--color-ink-secondary)]">
                    {o.order_state}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Modules ──────────────────────────────────────────────────────────────── */

interface ModuleCard {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  hint: string;
}

function ModulesTab({ data }: { data: ProjectWorkspaceData }) {
  const id = data.project.id;

  // Built and reachable.
  const live: ModuleCard[] = [
    { key: "details", label: "Details", icon: <FolderKanban className="size-5" />, href: `/projects/${id}?tab=summary`, hint: "The project's own record" },
    { key: "report", label: "Progress report", icon: <FileText className="size-5" />, href: `/projects/${id}/report`, hint: "What reaches the client" },
    { key: "planning", label: "Project planning", icon: <ListChecks className="size-5" />, href: `/projects/${id}/plan`, hint: "Milestones grouped by scope" },
    { key: "procurement", label: "Procurement", icon: <ShoppingCart className="size-5" />, href: `/projects/${id}/procurement`, hint: "Requests, RFQs, orders and deliveries" },
    { key: "site", label: "Site progress", icon: <HardHat className="size-5" />, href: `/projects/${id}/site`, hint: "Dated photos, and what the client sees" },
    { key: "design", label: "Designs & documents", icon: <FileText className="size-5" />, href: `/projects/${id}/documents`, hint: "Folders and files for this project" },
    { key: "finplan", label: "Financial planning", icon: <IndianRupee className="size-5" />, href: `/projects/${id}/finance`, hint: "Inflow and outflow contracts" },
    { key: "payments", label: "Project payments", icon: <Wallet className="size-5" />, href: `/projects/${id}/payments`, hint: "Expenses, funds and analytics" },
    { key: "labour", label: "Labour report", icon: <Users className="size-5" />, href: `/projects/${id}/labour`, hint: "Daily headcount by trade and vendor" },
    { key: "finance", label: "Company finance", icon: <IndianRupee className="size-5" />, href: "/finance", hint: "Across every project" },
  ];

  // Specified in PLAN-V4 §9 and not built yet. Shown, not hidden — the shell
  // should describe the real product shape (and never an "(Old)" tile, which
  // is what `104705` ships).
  const soon: ModuleCard[] = [
    { key: "mb", label: "MB sheet", icon: <Ruler className="size-5" />, hint: "Placeholder — awaiting a spec" },
    { key: "renders", label: "2D → 3D renders", icon: <Boxes className="size-5" />, hint: "Placeholder — awaiting a spec" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Modules</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((m, i) => (
            <Link key={m.key} href={m.href ?? "#"}>
              <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:bg-[var(--color-surface-sunken)]">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-card)]"
                  style={{
                    background: `color-mix(in srgb, ${seriesColor(i)} 10%, white)`,
                    color: seriesColor(i),
                  }}
                >
                  {m.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--color-ink)]">
                    {m.label}
                  </span>
                  <span className="block text-xs text-[var(--color-ink-secondary)]">
                    {m.hint}
                  </span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Coming next
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {soon.map((m) => (
            <Card
              key={m.key}
              className="flex h-full items-start gap-3 border-dashed p-4 opacity-70"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-disabled)]">
                {m.icon}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink-secondary)]">
                  {m.label}
                  <span className="rounded-full bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    soon
                  </span>
                </span>
                <span className="block text-xs text-[var(--color-ink-disabled)]">
                  {m.hint}
                </span>
              </span>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Where this project stands
        </h2>
        <MilestoneCell milestones={data.milestones} />
      </Card>
    </div>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────────── */

function PanelHead({
  icon,
  title,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
        <span className="text-[var(--color-ink-secondary)]">{icon}</span>
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-[12px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)] hover:underline"
        >
          Open
        </Link>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber";
}) {
  return (
    <div className="rounded-md bg-[var(--color-surface-sunken)] px-3 py-2">
      <p className="text-[11px] text-[var(--color-ink-secondary)]">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular",
          tone === "green" && "text-[var(--color-green)]",
          tone === "red" && "text-[var(--color-red)]",
          tone === "amber" && "text-[var(--color-amber)]",
          !tone && "text-[var(--color-ink)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--color-border-strong)] px-3 py-6 text-center text-xs text-[var(--color-ink-secondary)]">
      {children}
    </p>
  );
}
