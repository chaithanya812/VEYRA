"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  HardHat,
  List,
  Minus,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ClientVisibleToggle,
  MultiValueCell,
  SegmentedControl,
} from "@/components/ui/patterns";
import { AreaTrend, Donut } from "@/components/ui/charts";
import { StatTile, TileGrid, FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import {
  NO_CONTRACT,
  NO_VENDOR,
  byCategory,
  byContract,
  bySkill,
  byVendor,
  dailyTrend,
  filterEntries,
  summarise,
  totalOf,
  type LabourBreakdown,
  type LabourEntry,
} from "@/lib/labour-model";
import type { LabourBoard } from "@/lib/data/labour";
import { seriesColor } from "@/lib/palette";
import {
  addAttendanceAction,
  deleteEntryAction,
  setLabourVisibilityAction,
  updateEntryAction,
  type LabourState,
} from "./actions";
import { cn, fmtDate } from "@/lib/utils";

/**
 * Labour Report (PLAN-V4 §9.6, frames `105620` – `105716`).
 *
 * Three things this screen refuses to do, all of them the same refusal:
 *
 * 1. **It never shows a chart without the numbers behind it.** Every analytics
 *    card carries a `Chart | Table` toggle, as the owner asked — a donut tells
 *    you a shape, and the shape is not the answer.
 * 2. **It never prints a total it did not derive.** `71 = 34 + 25 + 12` comes
 *    out of `lib/labour-model.ts` every time, in the header, in the table and
 *    in the charts.
 * 3. **It never hides a double-count.** An entry tagged with two trades belongs
 *    to both, so the by-trade slices can sum past the headcount. The card says
 *    so out loud instead of quietly presenting an inflated total.
 *
 * Red appears twice, both on the closed list (DESIGN-DIRECTION §2): the one
 * primary action (`Add attendance`) and the hero metric. The frame's red ⊕
 * stepper button is NOT copied — a plus button is not one of red's five jobs.
 */

export function LabourView({
  projectId,
  board,
  initialTab,
}: {
  projectId: string;
  board: LabourBoard;
  initialTab: "overview" | "analytics";
}) {
  const [tab, setTab] = useState<"overview" | "analytics">(initialTab);
  const [clientOnly, setClientOnly] = useState(false);
  const [category, setCategory] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [contractId, setContractId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const vendorName = useMemo(() => {
    const m = new Map(board.vendors.map((v) => [v.id, v.name]));
    return (id: string) => m.get(id) ?? "Unknown vendor";
  }, [board.vendors]);

  const contractName = useMemo(() => {
    const m = new Map(board.contracts.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? "Unknown contract";
  }, [board.contracts]);

  const categoryLabel = useMemo(() => {
    const m = new Map(board.categories.map((c) => [c.value, c.label]));
    return (slug: string) => m.get(slug) ?? slug;
  }, [board.categories]);

  const shown = useMemo(
    () =>
      filterEntries(
        board.entries,
        {
          clientVisibleOnly: clientOnly,
          category: category || null,
          vendorId: vendorId || null,
          contractId: contractId || null,
          query,
        },
        vendorName,
      ),
    [board.entries, clientOnly, category, vendorId, contractId, query, vendorName],
  );

  // The header strip counts what is ON SCREEN. A summary that ignores the
  // filters would contradict the table directly underneath it.
  const totals = useMemo(() => summarise(shown), [shown]);
  const filtered = shown.length !== board.entries.length;

  const attachmentsByEntry = useMemo(() => {
    const m = new Map<string, LabourBoard["attachments"]>();
    for (const a of board.attachments) {
      const list = m.get(a.entryId) ?? [];
      list.push(a);
      m.set(a.entryId, list);
    }
    return m;
  }, [board.attachments]);

  function run(
    action: (prev: LabourState, fd: FormData) => Promise<LabourState>,
    fd: FormData,
  ) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const r = await action(undefined, fd);
      if (r?.error) setError(r.error);
      if (r?.note) setNote(r.note);
    });
  }

  function toggleVisible(id: string, next: boolean) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.append("ids", id);
    fd.set("visible", next ? "true" : "false");
    run(setLabourVisibilityAction, fd);
  }

  return (
    <>
      {/* ── The header strip (`105620`) ── */}
      <TileGrid>
        <StatTile
          label="Total labour count"
          value={totals.total}
          hero
          icon={<Users className="size-4" />}
          hint={
            filtered
              ? `across ${totals.entries} of ${board.entries.length} days`
              : `across ${totals.entries} ${totals.entries === 1 ? "day" : "days"}`
          }
        />
        <StatTile label="Skilled" value={totals.skilled} tone="info" />
        <StatTile label="Unskilled" value={totals.unskilled} tone="neutral" />
        <StatTile label="Coordinator" value={totals.coordinator} tone="neutral" />
      </TileGrid>

      <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Labour view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Overview", icon: <List className="size-3.5" /> },
            { value: "analytics", label: "Analytics", icon: <BarChart3 className="size-3.5" /> },
          ]}
        />

        <div className="flex flex-wrap items-center gap-3">
          {/* A FILTER, not the flag. The per-row switch in the table is the
              flag; conflating the two is how somebody "hides" a day by
              changing what they are looking at. */}
          <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={clientOnly}
              onChange={(e) => setClientOnly(e.target.checked)}
              className="size-4 accent-[var(--color-ink)]"
            />
            Client visible only
          </label>
          <AttendanceDialog projectId={projectId} board={board} />
        </div>
      </div>

      {/* ── Filters (the funnel icon in `105620`) ── */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Trade
          </span>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-48 text-[13px]"
            aria-label="Filter by trade"
          >
            <option value="">All trades</option>
            {board.categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Vendor
          </span>
          <Select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="h-8 w-48 text-[13px]"
            aria-label="Filter by vendor"
          >
            <option value="">All vendors</option>
            {/* A real answer in the frame's own table, so a real filter. */}
            <option value={NO_VENDOR}>No vendor</option>
            {board.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Contract
          </span>
          <Select
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            className="h-8 w-48 text-[13px]"
            aria-label="Filter by contract"
          >
            <option value="">All contracts</option>
            <option value={NO_CONTRACT}>No contract</option>
            {board.contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Search
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Remark, trade or vendor"
            aria-label="Search labour entries"
            className="h-8 min-w-40 text-[13px]"
          />
        </label>

        {(category || vendorId || contractId || query || clientOnly) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCategory("");
              setVendorId("");
              setContractId("");
              setQuery("");
              setClientOnly(false);
            }}
          >
            Clear
          </Button>
        )}
      </Card>

      {error && (
        <p className="mb-3 rounded-md border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-3 py-2 text-[13px] text-[var(--color-red)]">
          {error}
        </p>
      )}
      {note && !error && (
        <p className="mb-3 rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-[13px] text-[var(--color-ink-secondary)]">
          {note}
        </p>
      )}

      {tab === "overview" ? (
        <OverviewTable
          projectId={projectId}
          board={board}
          entries={shown}
          totals={totals}
          attachments={attachmentsByEntry}
          categoryLabel={categoryLabel}
          vendorName={vendorName}
          contractName={contractName}
          onVisibility={toggleVisible}
          busy={busy}
        />
      ) : (
        <AnalyticsTab
          entries={shown}
          categoryLabel={categoryLabel}
          vendorName={vendorName}
          contractName={contractName}
        />
      )}
    </>
  );
}

/* ── Overview (frame `105620`) ────────────────────────────────────────────── */

function OverviewTable({
  projectId,
  board,
  entries,
  totals,
  attachments,
  categoryLabel,
  vendorName,
  contractName,
  onVisibility,
  busy,
}: {
  projectId: string;
  board: LabourBoard;
  entries: LabourEntry[];
  totals: ReturnType<typeof summarise>;
  attachments: Map<string, LabourBoard["attachments"]>;
  categoryLabel: (slug: string) => string;
  vendorName: (id: string) => string;
  contractName: (id: string) => string;
  onVisibility: (id: string, next: boolean) => void;
  busy: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={
          board.entries.length === 0 ? (
            <HardHat className="size-8" />
          ) : (
            <Search className="size-8" />
          )
        }
        title={
          board.entries.length === 0
            ? "No labour recorded yet"
            : "No labour days match those filters"
        }
        description={
          board.entries.length === 0
            ? "Record a day's attendance — how many skilled, unskilled and coordinating people were on site, and which trades they worked."
            : `Clear a filter above to see the rest of this project's ${board.entries.length} labour days.`
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Contract</th>
              <th className="px-3 py-2 font-medium">Trade</th>
              <th className="px-3 py-2 text-right font-medium">Skilled</th>
              <th className="px-3 py-2 text-right font-medium">Unskilled</th>
              <th className="px-3 py-2 text-right font-medium">Coordinator</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Remark</th>
              <th className="px-3 py-2 font-medium">Attachment</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const files = attachments.get(e.id) ?? [];
              return (
                <tr
                  key={e.id}
                  className="border-b border-[var(--color-border)] align-top last:border-0"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 tabular text-[var(--color-ink)]">
                    {fmtDate(e.entry_date)}
                  </td>
                  <td className="px-3 py-2.5">
                    {/* `No Vendor` is a value, not an absence — the frame prints
                        it, so we do too rather than showing an em dash. */}
                    <MultiValueCell
                      values={e.vendor_ids.map(vendorName)}
                      emptyLabel="No vendor"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {/* Contract names are long ("Malviya Nagar 3BHK — Client
                        Agreement") and would give every row three lines. One
                        line, with the whole name on hover. */}
                    <span
                      title={e.contract_id ? contractName(e.contract_id) : "No contract"}
                      className="block max-w-40 truncate text-[var(--color-ink-secondary)]"
                    >
                      {e.contract_id ? contractName(e.contract_id) : "No contract"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <MultiValueCell
                      values={e.categories.map(categoryLabel)}
                      emptyLabel="No trade"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{e.skilled}</td>
                  <td className="px-3 py-2.5 text-right tabular">{e.unskilled}</td>
                  <td className="px-3 py-2.5 text-right tabular">{e.coordinator}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular text-[var(--color-ink)]">
                    {totalOf(e)}
                  </td>
                  <td className="max-w-48 px-3 py-2.5 text-[var(--color-ink-secondary)]">
                    {e.remark || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {files.length === 0 ? (
                      <span className="text-[var(--color-ink-disabled)]">—</span>
                    ) : (
                      <span className="flex flex-col gap-1">
                        {files.map((f) =>
                          f.url ? (
                            <a
                              key={f.id}
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[12px] text-[var(--color-ink)] underline-offset-2 hover:underline"
                            >
                              <Paperclip className="size-3" />
                              <span className="max-w-32 truncate">{f.name}</span>
                            </a>
                          ) : (
                            <span key={f.id} className="text-[12px] text-[var(--color-ink-disabled)]">
                              {f.name}
                            </span>
                          ),
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <ClientVisibleToggle
                      key={String(e.client_visible)}
                      checked={e.client_visible}
                      disabled={busy}
                      onChange={(next) => onVisibility(e.id, next)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1">
                      <AttendanceDialog
                        projectId={projectId}
                        board={board}
                        entry={e}
                      />
                      <form action={deleteEntryAction}>
                        <input type="hidden" name="project_id" value={projectId} />
                        <input type="hidden" name="id" value={e.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Delete this day"
                          className="hover:text-[var(--color-red)]"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </form>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {/* The footer is the header strip again, from the same function.
                Two totals on one screen that disagree is the failure this
                module is built to avoid. */}
            <tr className="border-t-2 border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] text-[13px] font-medium">
              <td className="px-3 py-2.5 text-[var(--color-ink-secondary)]" colSpan={4}>
                {totals.entries} {totals.entries === 1 ? "day" : "days"}
              </td>
              <td className="px-3 py-2.5 text-right tabular">{totals.skilled}</td>
              <td className="px-3 py-2.5 text-right tabular">{totals.unskilled}</td>
              <td className="px-3 py-2.5 text-right tabular">{totals.coordinator}</td>
              <td className="px-3 py-2.5 text-right tabular text-[var(--color-ink)]">
                {totals.total}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/* ── Analytics (frame `105716`) ───────────────────────────────────────────── */

function AnalyticsTab({
  entries,
  categoryLabel,
  vendorName,
  contractName,
}: {
  entries: LabourEntry[];
  categoryLabel: (slug: string) => string;
  vendorName: (id: string) => string;
  contractName: (id: string) => string;
}) {
  const trend = useMemo(() => dailyTrend(entries), [entries]);
  const vendors = useMemo(() => byVendor(entries, vendorName), [entries, vendorName]);
  const categories = useMemo(
    () => byCategory(entries, categoryLabel),
    [entries, categoryLabel],
  );
  const contracts = useMemo(
    () => byContract(entries, contractName),
    [entries, contractName],
  );
  const skills = useMemo(() => bySkill(entries), [entries]);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-8" />}
        title="Nothing to chart yet"
        description="Analytics draw from the days that match the filters above. Clear a filter, or record a labour day on the Entries tab."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Daily labour trend" table={<TrendTable points={trend} />}>
        <AreaTrend
          points={trend}
          valueLabel="Labour count"
          color={seriesColor(2)}
          height={180}
        />
      </ChartCard>

      <BreakdownCard title="Labour by vendor" data={vendors} />
      <BreakdownCard title="Labour by trade" data={categories} />
      <BreakdownCard title="Labour by contract" data={contracts} />
      <BreakdownCard title="Labour by skill" data={skills} />
    </div>
  );
}

/**
 * Every analytic on this screen is a chart AND a table, switched by the same
 * control. The owner asked for it and he is right: a donut without its numbers
 * is a decoration.
 */
function ChartCard({
  title,
  children,
  table,
  footnote,
}: {
  title: string;
  children: React.ReactNode;
  table: React.ReactNode;
  footnote?: string;
}) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
        <SegmentedControl
          label={`${title} view`}
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {mode === "chart" ? children : table}
      {footnote && (
        <p className="mt-3 text-[11px] text-[var(--color-ink-secondary)]">{footnote}</p>
      )}
    </Card>
  );
}

function BreakdownCard({ title, data }: { title: string; data: LabourBreakdown }) {
  const slices = data.slices.map((s, i) => ({
    key: s.key,
    label: s.label,
    count: s.count,
    pct: data.sliceTotal > 0 ? Math.round((s.count / data.sliceTotal) * 1000) / 10 : 0,
    color: seriesColor(i),
  }));

  return (
    <ChartCard
      title={title}
      table={<BreakdownTable data={data} />}
      // The double-count, stated rather than hidden. Nine people who did two
      // trades were nine people on each — so the slices sum past the headcount,
      // and a reader deserves to know before they quote the number.
      footnote={
        data.overlaps
          ? `Slices total ${data.sliceTotal} against a headcount of ${data.reportTotal} — days tagged with more than one count under each.`
          : `Slices total ${data.sliceTotal}, which is the whole headcount.`
      }
    >
      <Donut
        slices={slices}
        centerLabel="People"
        centerValue={data.reportTotal}
      />
    </ChartCard>
  );
}

function BreakdownTable({ data }: { data: LabourBreakdown }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
          <th className="py-1.5 font-medium">Name</th>
          <th className="py-1.5 text-right font-medium">People</th>
          <th className="py-1.5 text-right font-medium">Share</th>
        </tr>
      </thead>
      <tbody>
        {data.slices.map((s) => (
          <tr key={s.key} className="border-b border-[var(--color-border)] last:border-0">
            <td className="py-1.5 text-[var(--color-ink)]">{s.label}</td>
            <td className="py-1.5 text-right tabular">{s.count}</td>
            {/* A percentage always travels with the two numbers it came from. */}
            <td className="py-1.5 text-right tabular text-[var(--color-ink-secondary)]">
              {data.sliceTotal > 0
                ? `${Math.round((s.count / data.sliceTotal) * 100)}% of ${data.sliceTotal}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendTable({ points }: { points: { date: string; count: number }[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
          <th className="py-1.5 font-medium">Date</th>
          <th className="py-1.5 text-right font-medium">Labour count</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.date} className="border-b border-[var(--color-border)] last:border-0">
            <td className="py-1.5 tabular text-[var(--color-ink)]">{fmtDate(p.date)}</td>
            <td className="py-1.5 text-right tabular">{p.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── The attendance dialog (frame `105638`) ───────────────────────────────── */

function AttendanceDialog({
  projectId,
  board,
  entry,
}: {
  projectId: string;
  board: LabourBoard;
  /** Present = editing that day rather than recording a new one. */
  entry?: LabourEntry;
}) {
  const editing = !!entry;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const [categories, setCategories] = useState<string[]>(entry?.categories ?? []);
  const [vendors, setVendors] = useState<string[]>(entry?.vendor_ids ?? []);
  const [skilled, setSkilled] = useState(entry?.skilled ?? 0);
  const [unskilled, setUnskilled] = useState(entry?.unskilled ?? 0);
  const [coordinator, setCoordinator] = useState(entry?.coordinator ?? 0);

  const total = skilled + unskilled + coordinator;

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await (editing
        ? updateEntryAction(undefined, fd)
        : addAttendanceAction(undefined, fd));
      if (r?.error && !r.ok) setError(r.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm" title="Edit this day">
            <PenLine className="size-3.5" />
          </Button>
        ) : (
          <Button variant="primary" size="sm">
            <Plus className="size-4" /> Add attendance
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit attendance" : "Labour attendance"}</DialogTitle>
          <DialogDescription>
            One day, one contract, and the trades and vendors that supplied the
            people. No vendor and no contract are both valid answers.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          {editing && <input type="hidden" name="id" value={entry.id} />}
          {/* Present-but-empty tells the server "clear these", which is the
              difference between removing every trade and not touching them. */}
          <input type="hidden" name="categories" value="" />
          <input type="hidden" name="vendors" value="" />
          {categories.map((c) => (
            <input key={c} type="hidden" name="categories" value={c} />
          ))}
          {vendors.map((v) => (
            <input key={v} type="hidden" name="vendors" value={v} />
          ))}
          <FormError error={error ?? undefined} />

          <Field label="Date" htmlFor={`day_${entry?.id ?? "new"}`} required>
            <Input
              id={`day_${entry?.id ?? "new"}`}
              name="entry_date"
              type="date"
              required
              defaultValue={entry?.entry_date ?? new Date().toISOString().slice(0, 10)}
            />
          </Field>

          <MultiSelect
            label="Trades"
            placeholder="Select trades"
            options={board.categories.map((c) => ({ value: c.value, label: c.label }))}
            selected={categories}
            onChange={setCategories}
            emptyHint="No trades configured — add them under Settings › Workspace."
          />

          <MultiSelect
            label="Vendors"
            placeholder="Select vendors"
            options={board.vendors.map((v) => ({ value: v.id, label: v.name }))}
            selected={vendors}
            onChange={setVendors}
            emptyHint="No vendors yet. Leaving this empty records the day as No Vendor."
          />

          <Field label="Contract" htmlFor={`ct_${entry?.id ?? "new"}`}>
            <Select
              id={`ct_${entry?.id ?? "new"}`}
              name="contract_id"
              defaultValue={entry?.contract_id ?? ""}
            >
              <option value="">No contract</option>
              {board.contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] p-3">
            <Stepper label="Skilled labour" value={skilled} onChange={setSkilled} name="skilled" />
            <Stepper label="Unskilled labour" value={unskilled} onChange={setUnskilled} name="unskilled" />
            <Stepper label="Coordinator" value={coordinator} onChange={setCoordinator} name="coordinator" />
            <div className="mt-1 flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-[13px]">
              <span className="text-[var(--color-ink-secondary)]">Total on site</span>
              <span className="font-semibold tabular text-[var(--color-ink)]">{total}</span>
            </div>
          </div>

          {!editing && (
            <Field
              label="Attachment"
              htmlFor="labour_attachment"
              hint="A muster roll or a signed sheet. Filed in this project's documents."
            >
              <input
                id="labour_attachment"
                name="attachment"
                type="file"
                className="block w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface-sunken)] file:px-3 file:py-1.5 file:text-[13px] file:text-[var(--color-ink)]"
              />
            </Field>
          )}

          <Field label="Remarks" htmlFor={`rm_${entry?.id ?? "new"}`}>
            <Textarea
              id={`rm_${entry?.id ?? "new"}`}
              name="remark"
              rows={2}
              defaultValue={entry?.remark ?? ""}
              placeholder="Half day — rain after 2pm"
            />
          </Field>

          <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="client_visible"
              value="true"
              defaultChecked={entry?.client_visible ?? false}
              className="mt-0.5 size-4 accent-[var(--color-red)]"
            />
            <span>
              Show this day to the client
              <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                Off by default. Only what is marked visible reaches the progress
                report.
              </span>
            </span>
          </label>

          <div>
            <SubmitButton pendingLabel="Saving…" disabled={busy || total === 0}>
              <HardHat className="size-4" /> {editing ? "Save" : "Submit"}
            </SubmitButton>
            {total === 0 && (
              <p className="mt-1.5 text-[11px] text-[var(--color-ink-secondary)]">
                Enter at least one person — an attendance of nobody records
                nothing.
              </p>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The frame paints ⊖ grey and ⊕ red. We do not: a stepper's plus is not one of
 * red's five jobs (DESIGN-DIRECTION §2), and the red on this dialog belongs to
 * Submit. The control still reads as a stepper without it.
 */
function Stepper({
  label,
  value,
  onChange,
  name,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  name: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <input type="hidden" name={name} value={value} />
      <span className="text-[13px] text-[var(--color-ink)]">{label}</span>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label={`Fewer ${label}`}
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="flex size-7 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-ink-secondary)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <input
          type="number"
          min={0}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
          className="h-7 w-14 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-center text-[13px] tabular text-[var(--color-ink)] outline-none"
        />
        <button
          type="button"
          aria-label={`More ${label}`}
          onClick={() => onChange(value + 1)}
          className="flex size-7 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-ink-secondary)] transition-colors hover:text-[var(--color-ink)]"
        >
          <Plus className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

/**
 * The searchable checkbox dropdown from `105659` / `105706`.
 *
 * Searchable because nine trades is fine and forty vendors is not, and the
 * frame searches both. The trigger says what is chosen rather than just "3
 * selected" until the list gets long — the values are the reason somebody
 * opened it.
 */
function MultiSelect({
  label,
  placeholder,
  options,
  selected,
  onChange,
  emptyHint,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const labelOf = useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options],
  );

  const shown = options.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.map((v) => labelOf.get(v) ?? v).join(", ")
        : `${selected.length} selected`;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--color-ink)]">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-left text-sm outline-none"
          >
            <span
              className={cn(
                "truncate",
                selected.length === 0
                  ? "text-[var(--color-ink-disabled)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              {summary}
            </span>
            <ChevronDown className="size-4 shrink-0 text-[var(--color-ink-secondary)]" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <Search className="size-3.5 text-[var(--color-ink-disabled)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label={`Search ${label}`}
              className="w-full bg-transparent text-[13px] text-[var(--color-ink)] outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {shown.length === 0 && (
              <li className="px-2 py-3 text-center text-[12px] text-[var(--color-ink-secondary)]">
                {options.length === 0 ? (emptyHint ?? "Nothing to choose from.") : "No match."}
              </li>
            )}
            {shown.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        on
                          ? selected.filter((v) => v !== o.value)
                          : [...selected, o.value],
                      )
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        on
                          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                          : "border-[var(--color-border-strong)]",
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
