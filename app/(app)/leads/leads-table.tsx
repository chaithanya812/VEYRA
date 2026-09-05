"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Columns3,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Card, EmptyState, StatusChip } from "@/components/ui/primitives";
import { cn, fmtDate, inr } from "@/lib/utils";
import {
  searchLeads,
  sortLeads,
  statusToneOf,
  type LeadStatusDef,
  type SortKey,
} from "@/lib/lead-management-model";
import { optionLabel, type WorkspaceOption } from "@/lib/workspace-model";
import type { LeadListRow } from "@/lib/data/lead-management";
import type { Member } from "@/lib/data/team";
import { setStatusAction } from "./actions";
import { Avatar } from "../dashboard/workspace-ui";

/**
 * The Lead Management list.
 *
 * The competitor's version carries the right columns and the wrong density —
 * eleven of them at once, three filter bars, and a status chip in the same red
 * as its overdue warning. Same information here, but: columns are toggleable so
 * you choose your own working set, filtering is one row, and red appears only
 * on a genuinely overdue follow-up. Status is a dropdown you change in place,
 * because that is what people do all day.
 */

type ColumnId =
  | "status" | "phone" | "followup" | "assigned" | "remark"
  | "project" | "budget" | "scope" | "value" | "created";

const COLUMNS: { id: ColumnId; label: string; default: boolean }[] = [
  { id: "status", label: "Status", default: true },
  { id: "phone", label: "Phone", default: true },
  { id: "followup", label: "Follow-up", default: true },
  { id: "assigned", label: "Assigned to", default: true },
  { id: "remark", label: "Latest remark", default: true },
  { id: "project", label: "Project", default: true },
  { id: "budget", label: "Budget", default: true },
  { id: "scope", label: "Scope", default: false },
  { id: "value", label: "Value", default: false },
  { id: "created", label: "Created", default: false },
];

export function LeadsTable({
  leads,
  statuses,
  options,
  members,
  total,
  value,
}: {
  leads: LeadListRow[];
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
  members: Member[];
  total: number;
  value: number;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [showCols, setShowCols] = useState(false);
  const [visible, setVisible] = useState<Set<ColumnId>>(
    () => new Set(COLUMNS.filter((c) => c.default).map((c) => c.id)),
  );

  const shown = useMemo(() => {
    let rows = leads;
    if (status) rows = rows.filter((l) => l.status === status);
    if (source) rows = rows.filter((l) => l.source === source);
    if (owner) {
      rows = rows.filter(
        (l) => l.sales_owner_id === owner || l.assignees.some((a) => a.id === owner),
      );
    }
    return sortLeads(searchLeads(rows, query), sort);
  }, [leads, status, source, owner, query, sort]);

  const shownValue = shown.reduce((s, l) => s + (Number(l.value) || 0), 0);
  const filtered = shown.length !== total;
  const sources = options.filter((o) => o.kind === "lead_source" && o.is_active);

  const toggleCol = (id: ColumnId) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const on = (id: ColumnId) => visible.has(id);

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Count + value, the two numbers this screen exists to show. */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Lead Management
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-ink-secondary)]">
            <span>
              <span className="font-semibold tabular text-[var(--color-ink)]">
                {filtered ? `${shown.length} of ${total}` : total}
              </span>{" "}
              leads
            </span>
            <span>
              <span className="font-semibold tabular text-[var(--color-ink)]">
                {inr(filtered ? shownValue : value)}
              </span>{" "}
              pipeline value
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCols((v) => !v)}
            aria-expanded={showCols}
          >
            <Columns3 className="size-4" /> Columns
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/leads/new">
              <Plus className="size-4" /> New lead
            </Link>
          </Button>
        </div>
      </div>

      {showCols && (
        <Card className="mb-3 p-3">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Show columns
          </p>
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCol(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors",
                  on(c.id)
                    ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)]"
                    : "border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
                )}
              >
                {on(c.id) && <Check className="size-3" />}
                {c.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* One filter row. Not three. */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-disabled)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, project or last remark"
              className="h-9 pl-9"
              aria-label="Search leads"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 w-44"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {statuses
              .filter((s) => s.is_active)
              .map((s) => (
                <option key={s.id} value={s.value}>
                  {s.label}
                </option>
              ))}
          </Select>
          <Select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="h-9 w-40"
            aria-label="Filter by owner"
          >
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-9 w-40"
            aria-label="Filter by source"
          >
            <option value="">Any source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 w-40"
            aria-label="Sort"
          >
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="value_desc">Highest value</option>
            <option value="value_asc">Lowest value</option>
            <option value="name">Name A–Z</option>
          </Select>
          {(query || status || owner || source) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus("");
                setOwner("");
                setSource("");
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </Card>

      {shown.length === 0 ? (
        <EmptyState
          icon={leads.length === 0 ? <Users className="size-8" /> : <SlidersHorizontal className="size-8" />}
          title={leads.length === 0 ? "No leads yet" : "Nothing matches those filters"}
          description={
            leads.length === 0
              ? "Capture your first enquiry to start the pipeline."
              : "Widen the search or reset the filters to see the rest."
          }
          action={
            leads.length === 0 ? (
              <Button asChild variant="primary">
                <Link href="/leads/new">
                  <Plus className="size-4" /> New lead
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  {on("status") && <th className="px-4 py-2.5 font-medium">Status</th>}
                  {on("phone") && <th className="px-4 py-2.5 font-medium">Phone</th>}
                  {on("followup") && <th className="px-4 py-2.5 font-medium">Follow-up</th>}
                  {on("assigned") && <th className="px-4 py-2.5 font-medium">Assigned</th>}
                  {on("remark") && <th className="px-4 py-2.5 font-medium">Latest remark</th>}
                  {on("project") && <th className="px-4 py-2.5 font-medium">Project</th>}
                  {on("budget") && <th className="px-4 py-2.5 font-medium">Budget</th>}
                  {on("scope") && <th className="px-4 py-2.5 font-medium">Scope</th>}
                  {on("value") && <th className="px-4 py-2.5 text-right font-medium">Value</th>}
                  {on("created") && <th className="px-4 py-2.5 text-right font-medium">Created</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((l, i) => (
                  <tr
                    key={l.id}
                    className={cn(
                      "border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]",
                      i % 2 === 1 && "bg-[color-mix(in_srgb,var(--color-surface-sunken)_40%,white)]",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/leads/${l.id}`}
                        className="font-medium text-[var(--color-ink)] hover:underline"
                      >
                        {l.name}
                      </Link>
                      {l.org_type && (
                        <span className="ml-2 text-xs text-[var(--color-ink-secondary)]">
                          {l.org_type === "commercial" ? "Commercial" : "Residential"}
                        </span>
                      )}
                    </td>

                    {on("status") && (
                      <td className="px-4 py-2.5">
                        <InlineStatus lead={l} statuses={statuses} />
                      </td>
                    )}

                    {on("phone") && (
                      <td className="whitespace-nowrap px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                        {l.phone ?? "—"}
                      </td>
                    )}

                    {on("followup") && (
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <FollowUpCell lead={l} />
                      </td>
                    )}

                    {on("assigned") && (
                      <td className="px-4 py-2.5">
                        {l.assignees.length === 0 ? (
                          <span className="text-xs text-[var(--color-ink-secondary)]">
                            No members
                          </span>
                        ) : (
                          <span className="flex -space-x-1.5">
                            {l.assignees.slice(0, 3).map((a) => (
                              <Avatar key={a.id} name={a.name} />
                            ))}
                            {l.assignees.length > 3 && (
                              <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-surface-sunken)] text-[10px] font-semibold text-[var(--color-ink-secondary)] ring-1 ring-[var(--color-border)]">
                                +{l.assignees.length - 3}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    )}

                    {on("remark") && (
                      <td className="max-w-72 px-4 py-2.5 text-[13px] text-[var(--color-ink-secondary)]">
                        <span className="line-clamp-2">{l.latest_remark ?? "—"}</span>
                      </td>
                    )}

                    {on("project") && (
                      <td className="px-4 py-2.5 text-[13px] text-[var(--color-ink-secondary)]">
                        {l.project_name ?? "—"}
                      </td>
                    )}

                    {on("budget") && (
                      <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-[var(--color-ink-secondary)]">
                        {l.budget_band ? optionLabel(options, "budget_band", l.budget_band) : "—"}
                      </td>
                    )}

                    {on("scope") && (
                      <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-[var(--color-ink-secondary)]">
                        {l.scope ? optionLabel(options, "lead_scope", l.scope) : "—"}
                      </td>
                    )}

                    {on("value") && (
                      <td className="px-4 py-2.5 text-right tabular">{inr(l.value)}</td>
                    )}

                    {on("created") && (
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">
                        {fmtDate(l.created_at)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Change a lead's status without leaving the list — the most common action. */
function InlineStatus({
  lead,
  statuses,
}: {
  lead: LeadListRow;
  statuses: LeadStatusDef[];
}) {
  return (
    <form action={setStatusAction} className="relative inline-flex">
      <input type="hidden" name="id" value={lead.id} />
      <select
        name="status"
        defaultValue={lead.status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={`Status for ${lead.name}`}
        className={cn(
          "h-7 cursor-pointer appearance-none rounded-full border pl-2.5 pr-6 text-xs font-medium outline-none",
          chipClass(statusToneOf(statuses, lead.status)),
        )}
      >
        {statuses
          .filter((s) => s.is_active || s.value === lead.status)
          .map((s) => (
            <option key={s.id} value={s.value}>
              {s.label}
            </option>
          ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 opacity-60" />
      <noscript>
        <button type="submit" className="ml-1 text-xs underline">
          Set
        </button>
      </noscript>
    </form>
  );
}

function chipClass(tone: "neutral" | "green" | "amber" | "red"): string {
  switch (tone) {
    case "green":
      return "bg-[var(--color-green-tint)] text-[var(--color-green)] border-[color-mix(in_srgb,var(--color-green)_25%,white)]";
    case "amber":
      return "bg-[var(--color-amber-tint)] text-[var(--color-amber)] border-[color-mix(in_srgb,var(--color-amber)_30%,white)]";
    case "red":
      return "bg-[var(--color-red-tint)] text-[var(--color-red-hover)] border-[color-mix(in_srgb,var(--color-red)_25%,white)]";
    default:
      return "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)] border-[var(--color-border)]";
  }
}

/**
 * The follow-up column: calls logged, when the next one is due, and how many
 * have been missed. Overdue is the one place red is earned on this table.
 */
function FollowUpCell({ lead }: { lead: LeadListRow }) {
  if (lead.followUpCount === 0 && lead.callCount === 0) {
    return (
      <Link
        href={`/leads/${lead.id}?tab=followups`}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)] hover:underline"
      >
        <Plus className="size-3.5" /> Add follow-up
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-secondary)]">
        {lead.callCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3.5" />
            {lead.callCount} call{lead.callCount === 1 ? "" : "s"}
          </span>
        )}
        {lead.nextFollowUpAt && <span>{fmtDate(lead.nextFollowUpAt)}</span>}
      </span>
      {lead.overdueFollowUps > 0 && (
        <StatusChip tone="red" label={`${lead.overdueFollowUps} overdue`} />
      )}
    </div>
  );
}

export { COLUMNS };
