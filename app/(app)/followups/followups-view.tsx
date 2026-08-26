"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Gauge, Phone, Users } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { cn, fmtDate } from "@/lib/utils";
import {
  FOLLOW_UP_KIND_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUS_TONE,
  effectiveFollowUpStatus,
  formatTalkTime,
  type FollowUpStatus,
} from "@/lib/lead-management-model";
import { STATUS_META } from "@/lib/interactions-model";
import { optionLabel } from "@/lib/workspace-model";
import type { FollowUpsOverview } from "@/lib/data/followups";
import {
  Chip,
  Empty,
  List,
  Row,
  Section,
  StatTile,
  TabBar,
  TileGrid,
  type TabDef,
} from "../dashboard/workspace-ui";

/**
 * Follow-ups — Overview, the working list, the call log, and the team board.
 *
 * The counts on Overview are the same numbers the tables below show, computed
 * once by the pure engine in lead-management-model. Note what "Missed" means
 * here: a follow-up whose time went by while it was still open. It is derived,
 * not a status anyone has to remember to set — which is the only way that
 * number stays honest.
 */

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: <Gauge className="size-4" /> },
  { id: "list", label: "Follow-ups", icon: <CalendarClock className="size-4" /> },
  { id: "calls", label: "Call logs", icon: <Phone className="size-4" /> },
  { id: "team", label: "Team", icon: <Users className="size-4" /> },
];

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";
}

export function FollowUpsView({ data }: { data: FollowUpsOverview }) {
  const [tab, setTab] = useState("overview");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [bucket, setBucket] = useState<FollowUpStatus | "">("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "overdue") {
      setTab("list");
      setBucket("missed");
    } else if (t && TABS.some((x) => x.id === t)) {
      setTab(t);
    }
  }, []);

  const select = useCallback((id: string) => {
    setTab(id);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const now = useMemo(() => new Date(), []);
  const nameById = new Map(data.members.map((m) => [m.id, m.name]));

  const rows = useMemo(() => {
    let out = data.followUps;
    if (scope === "mine") out = out.filter((f) => f.member_id === data.actingMemberId);
    if (bucket) out = out.filter((f) => effectiveFollowUpStatus(f, now) === bucket);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((f) =>
        [f.lead_name, f.title, f.note, f.lead_phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return out;
  }, [data.followUps, data.actingMemberId, scope, bucket, query, now]);

  const tabs = TABS.map((t) =>
    t.id === "list" ? { ...t, badge: data.summary.missed, alert: true } : t,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Follow-ups</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
          Callbacks and meetings you owe clients — and the record of the calls that happened.
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1 pt-1">
        <TabBar tabs={tabs} active={tab} onSelect={select} />
      </div>

      <div className="pt-6">
        {tab === "overview" && <Overview data={data} />}

        {tab === "list" && (
          <>
            <Section title="Working list">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="min-w-52 flex-1">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search client, title or note"
                    className="h-9"
                    aria-label="Search follow-ups"
                  />
                </div>
                <Select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value as FollowUpStatus | "")}
                  className="h-9 w-40"
                  aria-label="Filter by state"
                >
                  <option value="">All states</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="missed">Missed</option>
                  <option value="completed">Completed</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
                <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1">
                  {(["all", "mine"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      aria-pressed={scope === s}
                      className={cn(
                        "rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors",
                        scope === s
                          ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
                          : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
                      )}
                    >
                      {s === "all" ? "Everyone" : "Mine"}
                    </button>
                  ))}
                </div>
              </div>

              {rows.length === 0 ? (
                <Empty
                  message={
                    data.followUps.length === 0
                      ? "No follow-ups scheduled"
                      : "Nothing matches those filters"
                  }
                  hint="Schedule one from a lead's Follow-ups tab."
                />
              ) : (
                <List>
                  {rows.map((f) => {
                    const status = effectiveFollowUpStatus(f, now);
                    return (
                      <Row
                        key={f.id}
                        alert={status === "missed"}
                        title={
                          <Link
                            href={`/leads/${f.lead_id}?tab=followups`}
                            className="hover:underline"
                          >
                            {f.lead_name}
                          </Link>
                        }
                        chips={
                          <>
                            <Chip tone={FOLLOW_UP_STATUS_TONE[status]} label={FOLLOW_UP_STATUS_LABELS[status]} />
                            <Chip
                              tone="neutral"
                              label={FOLLOW_UP_KIND_LABELS[f.kind === "meeting" ? "meeting" : "callback"]}
                            />
                          </>
                        }
                        meta={[
                          f.title,
                          fmtWhen(f.due_at),
                          f.assignee_name,
                          f.lead_phone,
                          f.outcome ? optionLabel(data.options, "followup_outcome", f.outcome) : null,
                          f.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        right={
                          <Link
                            href={`/leads/${f.lead_id}?tab=followups`}
                            className="text-[13px] font-medium text-[var(--color-ink)] hover:underline"
                          >
                            Open
                          </Link>
                        }
                      />
                    );
                  })}
                </List>
              )}
            </Section>
          </>
        )}

        {tab === "calls" && <Calls data={data} nameById={nameById} />}
        {tab === "team" && <Team data={data} />}
      </div>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function Overview({ data }: { data: FollowUpsOverview }) {
  const s = data.summary;
  return (
    <>
      <TileGrid>
        <StatTile label="Total follow-ups" value={s.total} />
        <StatTile label="Completed" value={s.completed} tone="green" />
        <StatTile label="Upcoming" value={s.upcoming} />
        <StatTile
          label="Missed"
          value={s.missed}
          tone={s.missed > 0 ? "red" : "neutral"}
          hint={s.missed > 0 ? "Went past their time while still open" : "Nothing lapsed"}
        />
      </TileGrid>

      <Section
        title="Meeting summary"
        description="Scheduled visits and client meetings."
      >
        <TileGrid>
          <StatTile label="Total meetings" value={data.meetings.total} />
          <StatTile label="Completed" value={data.meetings.completed} tone="green" />
          <StatTile
            label="Rescheduled"
            value={data.meetings.rescheduled}
            tone={data.meetings.rescheduled > 0 ? "amber" : "neutral"}
          />
          <StatTile
            label="Missed"
            value={data.meetings.missed}
            tone={data.meetings.missed > 0 ? "red" : "neutral"}
          />
        </TileGrid>
      </Section>

      <Section
        title="Call summary"
        description="Calls actually logged — the record, not the reminders."
      >
        <TileGrid>
          <StatTile label="Total dialed" value={data.callStats.dialed} />
          <StatTile label="Connected" value={data.callStats.connected} tone="green" />
          <StatTile label="Not received" value={data.callStats.notReceived} />
          <StatTile
            label="Talk time"
            value={formatTalkTime(data.callStats.talkTimeSec)}
            hint={`${data.callStats.connectRate}% connect rate`}
          />
        </TileGrid>
      </Section>

      <Section title="Callbacks">
        <TileGrid>
          <StatTile label="Scheduled" value={data.callbacks.total} />
          <StatTile label="Completed" value={data.callbacks.completed} tone="green" />
          <StatTile label="Upcoming" value={data.callbacks.upcoming} />
          <StatTile
            label="Completion"
            value={`${data.callbacks.completionRate}%`}
            hint="Of the ones that came due"
          />
        </TileGrid>
      </Section>
    </>
  );
}

/* ── Calls ────────────────────────────────────────────────────────────────── */

function Calls({
  data,
  nameById,
}: {
  data: FollowUpsOverview;
  nameById: Map<string, string>;
}) {
  const calls = data.calls.filter((c) => c.channel === "call");
  return (
    <>
      <TileGrid>
        <StatTile label="Dialed" value={data.callStats.dialed} />
        <StatTile label="Connected" value={data.callStats.connected} tone="green" />
        <StatTile label="Not received" value={data.callStats.notReceived} />
        <StatTile label="Connect rate" value={`${data.callStats.connectRate}%`} />
      </TileGrid>

      <Section title="Call log">
        {calls.length === 0 ? (
          <Empty
            message="No calls logged"
            hint="Log a call from a lead's Call logs tab — VEYRA records calls, it does not place them."
          />
        ) : (
          <List>
            {calls.map((c) => {
              const meta = STATUS_META[c.status as keyof typeof STATUS_META];
              return (
                <Row
                  key={c.id}
                  title={
                    c.lead_id ? (
                      <Link href={`/leads/${c.lead_id}?tab=calls`} className="hover:underline">
                        {c.direction === "inbound" ? "Incoming" : "Outgoing"} call
                      </Link>
                    ) : (
                      "Call"
                    )
                  }
                  chips={
                    <Chip
                      tone={
                        meta?.tone === "positive" ? "green" : meta?.tone === "warning" ? "amber" : "neutral"
                      }
                      label={meta?.label ?? c.status}
                    />
                  }
                  meta={[
                    fmtWhen(c.occurred_at),
                    c.agent_id ? nameById.get(c.agent_id) : null,
                    formatTalkTime(Number(c.duration_sec) || 0),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}

/* ── Team ─────────────────────────────────────────────────────────────────── */

function Team({ data }: { data: FollowUpsOverview }) {
  const active = data.performance.filter(
    (p) => p.followUps.total > 0 || p.calls.dialed > 0,
  );
  const ranked = [...active].sort(
    (a, b) => b.followUps.completed - a.followUps.completed,
  );

  return (
    <Section
      title="Team performance"
      description="Completion is measured only against follow-ups that actually came due, so planning ahead never counts against anyone."
    >
      {ranked.length === 0 ? (
        <Empty
          message="No activity yet"
          hint="Once follow-ups are scheduled and calls logged, everyone's numbers appear here."
        />
      ) : (
        <List>
          {ranked.map((p, i) => (
            <Row
              key={p.memberId}
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-surface-sunken)] text-[11px] font-semibold text-[var(--color-ink-secondary)] ring-1 ring-[var(--color-border)]">
                    {i + 1}
                  </span>
                  {p.name}
                </span>
              }
              chips={
                <>
                  {p.streakDays > 1 && <Chip tone="green" label={`${p.streakDays}-day streak`} />}
                  {p.followUps.missed > 0 && (
                    <Chip tone="red" label={`${p.followUps.missed} missed`} />
                  )}
                </>
              }
              meta={[
                `${p.followUps.completed}/${p.followUps.total} follow-ups done`,
                `${p.calls.connected}/${p.calls.dialed} calls connected`,
                `${formatTalkTime(p.calls.talkTimeSec)} talk time`,
              ].join(" · ")}
              right={
                <div className="text-right">
                  <p className="text-sm font-semibold tabular text-[var(--color-ink)]">
                    {p.followUps.completionRate}%
                  </p>
                  <p className="text-[11px] text-[var(--color-ink-secondary)]">
                    {p.calls.connectRate}% connect
                  </p>
                </div>
              }
            />
          ))}
        </List>
      )}
    </Section>
  );
}

export { fmtDate };
