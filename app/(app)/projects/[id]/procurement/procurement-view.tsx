"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, EmptyState, StatusChip } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SegmentedControl, SegmentedCountBar } from "@/components/ui/patterns";
import { StatTile, TileGrid, FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import {
  MR_ITEM_STAGE_META,
  PROC_TABS,
  PROC_TAB_LABELS,
  REQUEST_PROGRESS_LABELS,
  isOverdue,
  nextItemStages,
  procurementTotals,
  requestProgress,
  stageBreakdown,
  type MRItemStage,
  type ProcTab,
} from "@/lib/material-requests-model";
import { RFQ_STATUS_META } from "@/lib/rfq-model";
import {
  ACCEPTANCE_META,
  ACCEPTANCE_STATES,
  ACCEPTANCE_FILTER_LABELS,
  acceptanceBucketOf,
  type AcceptanceState,
} from "@/lib/po-model";
import type {
  ProjectProcurement,
  RequestRow,
  ProjectRef,
} from "@/lib/data/project-procurement";
import type { ProjectInventory } from "@/lib/data/inventory";
import { seriesColor } from "@/lib/palette";
import {
  createRequestAction,
  deleteRequestAction,
  setStageAction,
  type ProcState,
} from "./actions";
import { cn, fmtDate, inr } from "@/lib/utils";

/**
 * Project Procurement (PLAN-V4 §9.7, frames `105729` – `105927`).
 *
 * The owner named four things as non-negotiable — *"you got RFQs, you got
 * Orders, you got Acceptance… you have got to keep those four things"* — so the
 * sub-tabs are Request · RFQs · Orders · Deliveries · Inventory.
 *
 * **The whole screen is built on one idea: a request does not have a status.**
 * `105729`'s Stage cell stacks `Ordered (4) · Pending (8) · In Stock (4)`,
 * because a request of sixteen items is in four places at once. So every stage
 * control here moves LINE ITEMS, and every count — the tiles included — is an
 * aggregation over lines. Nothing on this screen stores a summary that could
 * drift from what it summarises.
 *
 * ── ONE VIEW, TWO SCOPES (PLAN-V4 §10.1, frame `110014`) ───────────────────
 * `/procurement` is this same component with `scope.kind === "company"`: the
 * project filter and the `Project` column appear, the tables gain a column,
 * and nothing else differs. Two implementations of "where is this order" is
 * how a company screen and a project screen start disagreeing about the same
 * purchase order.
 */

const TONE_CHIP = {
  neutral: "neutral",
  muted: "neutral",
  active: "amber",
  positive: "green",
} as const;

/** The company view's `All Requests` / `Draft Requests` toggle (`110014`). */
type DraftFilter = "all" | "draft";

export type ProcScope =
  | { kind: "project"; projectId: string }
  | { kind: "company" };

/** The project a row's own writes must be guarded against. */
function rowProject(ref: ProjectRef, scope: ProcScope): string {
  return scope.kind === "project" ? scope.projectId : (ref.project_id ?? "");
}

export function ProcurementView({
  scope,
  data,
  inventory,
  initialTab,
  initialAccept = null,
  initialOtype = "purchase",
}: {
  scope: ProcScope;
  data: ProjectProcurement;
  /** This project's own stock. Absent in company scope — /inventory owns that. */
  inventory?: ProjectInventory;
  initialTab: ProcTab;
  /**
   * The delivery-acceptance queue's two filters, resolved on the SERVER from
   * the URL (`?accept=` / `?otype=`) and passed straight through — not held in
   * client state, so the server-rendered HTML already reflects the query and a
   * fetch of `?view=deliveries&accept=partial` is verifiable.
   */
  initialAccept?: AcceptanceState | null;
  initialOtype?: "purchase" | "work";
}) {
  const companyWide = scope.kind === "company";
  // The project's own site store — where a queue-initiated ad-hoc receipt lands
  // (company scope has no single store, so the stock-in form picks one).
  const adhocWarehouseId = inventory?.warehouses[0]?.id ?? null;
  const [tab, setTab] = useState<ProcTab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  /* The company view's two filters (`110014`). Both are client-side over rows
     already read — the scope switch is a server predicate; narrowing WITHIN a
     scope is not worth a round trip. */
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [draftFilter, setDraftFilter] = useState<DraftFilter>("all");

  const inScope = useMemo(() => {
    if (!companyWide) return data;
    const keep = <T extends ProjectRef>(rows: T[]) =>
      projectFilter ? rows.filter((r) => r.project_id === projectFilter) : rows;
    return {
      ...data,
      requests: keep(data.requests).filter((r) =>
        draftFilter === "draft" ? r.stage === "draft" : true,
      ),
      rfqs: keep(data.rfqs),
      orders: keep(data.orders),
      deliveries: keep(data.deliveries),
    };
  }, [companyWide, data, projectFilter, draftFilter]);

  const totals = useMemo(
    () => procurementTotals(inScope.requests),
    [inScope.requests],
  );

  function run(
    action: (prev: ProcState, fd: FormData) => Promise<ProcState>,
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

  function moveLines(projectId: string, itemIds: string[], stage: MRItemStage) {
    if (!projectId) {
      setError(
        "This request is not linked to a project, so its lines cannot be moved. Link it to a project first.",
      );
      return;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("stage", stage);
    for (const id of itemIds) fd.append("item_ids", id);
    run(setStageAction, fd);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Procurement view"
          value={tab}
          onChange={setTab}
          options={PROC_TABS.map((t) => ({
            value: t,
            label: PROC_TAB_LABELS[t],
            badge:
              t === "requests"
                ? inScope.requests.length
                : t === "rfqs"
                  ? inScope.rfqs.length
                  : t === "orders"
                    ? inScope.orders.length
                    : t === "deliveries"
                      ? inScope.orders.length
                      : undefined,
          }))}
        />
        {tab === "requests" && <NewRequestDialog scope={scope} data={data} />}
      </div>

      {/* The company view's filter band (`110014`). Filters top-left, the one
          primary action top-right — DESIGN-DIRECTION §3. */}
      {companyWide && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {tab === "requests" && (
            <SegmentedControl
              label="Request set"
              value={draftFilter}
              onChange={setDraftFilter}
              options={[
                { value: "all", label: "All Requests" },
                {
                  value: "draft",
                  label: "Draft Requests",
                  badge: data.requests.filter((r) => r.stage === "draft").length,
                },
              ]}
            />
          )}
          <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink-secondary)]">
            Project
            <Select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
              className="h-8 w-56 text-[13px]"
            >
              <option value="">All projects</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          {projectFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProjectFilter("")}
              title="Clear the project filter"
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          )}
        </div>
      )}

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

      {tab === "requests" && (
        <>
          {/* The four tiles from `105729`. `Total items` is a segmented bar
              because its parts are the point — 39 + 11 + 127 = 177. */}
          <TileGrid>
            <StatTile
              label="Total requests"
              value={totals.requests}
              hero
              icon={<ClipboardList className="size-4" />}
              hint={`${totals.items} ${totals.items === 1 ? "item" : "items"} in all`}
            />
            <StatTile
              label="In progress"
              value={totals.inProgress}
              tone="info"
              hint="Some lines moved, not all landed"
            />
            <StatTile
              label="Due within 7 days"
              value={totals.dueSoon}
              tone={totals.dueSoon > 0 ? "warning" : "neutral"}
            />
            {/* Overdue is the one genuine alarm on this screen. */}
            <StatTile
              label="Overdue"
              value={totals.overdue}
              tone={totals.overdue > 0 ? "negative" : "neutral"}
              icon={totals.overdue > 0 ? <AlertTriangle className="size-4" /> : undefined}
            />
          </TileGrid>

          {totals.items > 0 && (
            <Card className="mt-4 p-4">
              <SegmentedCountBar
                label="Total items"
                total={`${totals.items}`}
                segments={totals.byStage.map((s, i) => ({
                  key: s.stage,
                  label: s.label,
                  value: s.count,
                  color: seriesColor(i),
                }))}
              />
            </Card>
          )}

          <div className="mt-4 flex flex-col gap-3">
            {inScope.requests.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="size-8" />}
                title={
                  companyWide
                    ? draftFilter === "draft"
                      ? "No draft requests"
                      : "No requests raised yet"
                    : "No requests raised for this project"
                }
                description={
                  companyWide && draftFilter === "draft"
                    ? "Drafts park here until somebody raises them. Switch to All Requests to see the raised ones."
                    : "Raise one to start the trail: request → RFQ → order → delivery."
                }
              />
            ) : (
              inScope.requests.map((r) => (
                <RequestCard
                  key={r.id}
                  projectId={rowProject(r, scope)}
                  showProject={companyWide}
                  request={r}
                  onMove={moveLines}
                  busy={busy}
                />
              ))
            )}
          </div>
        </>
      )}

      {tab === "rfqs" && <RfqTable data={inScope} showProject={companyWide} />}
      {tab === "orders" && <OrderTable data={inScope} showProject={companyWide} />}
      {tab === "deliveries" && (
        <DeliveryQueue
          data={inScope}
          showProject={companyWide}
          accept={initialAccept}
          otype={initialOtype}
          adhocWarehouseId={adhocWarehouseId}
        />
      )}
      {tab === "inventory" && (
        <InventoryPanel
          inventory={inventory ?? null}
          projectId={scope.kind === "project" ? scope.projectId : null}
        />
      )}
    </>
  );
}

/* ── One request, with its lines (frame `105729`) ─────────────────────────── */

function RequestCard({
  projectId,
  showProject,
  request,
  onMove,
  busy,
}: {
  projectId: string;
  showProject: boolean;
  request: RequestRow;
  onMove: (projectId: string, itemIds: string[], stage: MRItemStage) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const breakdown = useMemo(() => stageBreakdown(request.items), [request.items]);
  const progress = requestProgress(request.items);
  const late = isOverdue(request.expected_delivery, request.stage);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-left"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="size-4 shrink-0 text-[var(--color-ink-secondary)]" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-[var(--color-ink-secondary)]" />
            )}
            <span className="font-medium text-[var(--color-ink)]">{request.title}</span>
          </button>
          {/* `110014`'s `ID` column is the deep link: the number opens the
              request's own page, where its lines and remarks live. */}
          <Link
            href={`/procurement/${request.id}`}
            className="ml-1.5 tabular text-[12px] text-[var(--color-ink-secondary)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            {request.number ?? "Open request"}
          </Link>
          {/* The `Project` column from `110014`, as the card's own line. A
              request whose project never resolved says so rather than showing
              a blank cell that reads like "no project needed". */}
          {showProject && (
            <p className="mt-1 pl-6 text-[12px]">
              {request.project_id ? (
                <Link
                  href={`/projects/${request.project_id}/procurement`}
                  className="font-medium text-[var(--color-ink)] hover:underline"
                >
                  {request.projectName ?? "Untitled project"}
                </Link>
              ) : (
                <span
                  className="text-[var(--color-ink-secondary)]"
                  title="This request has no project FK — the name shown is the legacy label"
                >
                  {request.projectName ?? "No project linked"}
                </span>
              )}
            </p>
          )}
          <p className="mt-1 pl-6 text-[12px] text-[var(--color-ink-secondary)]">
            {request.request_type} · raised by {request.createdByName ?? "someone"} on{" "}
            <span className="tabular">{fmtDate(request.created_at)}</span>
            {request.expected_delivery && (
              <>
                {" · expected "}
                <span className={cn("tabular", late && "font-medium text-[var(--color-red)]")}>
                  {fmtDate(request.expected_delivery)}
                </span>
                {late && " (overdue)"}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusChip tone="neutral" label={REQUEST_PROGRESS_LABELS[progress]} />
          <form action={deleteRequestAction}>
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="id" value={request.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={!projectId}
              title={
                projectId
                  ? "Delete this request"
                  : "This request is not linked to a project"
              }
              className="hover:text-[var(--color-red)]"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* THE Stage cell: a breakdown, never a single status. */}
      <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] px-4 py-2.5">
        {breakdown.length === 0 ? (
          <span className="text-[12px] text-[var(--color-ink-disabled)]">
            No line items
          </span>
        ) : (
          breakdown.map((s) => (
            <span
              key={s.stage}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-[12px] text-[var(--color-ink-secondary)]"
            >
              {s.label}
              <span className="font-medium tabular text-[var(--color-ink)]">
                ({s.count})
              </span>
            </span>
          ))
        )}
      </div>

      {open && request.items.length > 0 && (
        <div className="overflow-x-auto border-t border-[var(--color-border)]">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">UOM</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Move to</th>
              </tr>
            </thead>
            <tbody>
              {request.items.map((it) => {
                const meta = MR_ITEM_STAGE_META[it.stage];
                const next = nextItemStages(it.stage);
                return (
                  <tr
                    key={it.id}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-[var(--color-ink)]">{it.item_name}</span>
                      {it.is_adhoc && (
                        <span className="ml-2 rounded-full bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                          ad-hoc
                        </span>
                      )}
                      {it.remarks && (
                        <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                          {it.remarks}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{it.qty}</td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {it.uom ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusChip tone={TONE_CHIP[meta.tone]} label={meta.label} />
                      {it.stage_changed_at && (
                        <span className="ml-2 text-[11px] tabular text-[var(--color-ink-secondary)]">
                          {fmtDate(it.stage_changed_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {/* Forward only. Un-ordering something is a conversation
                          with a vendor, not a dropdown (nextItemStages). */}
                      <Select
                        value=""
                        disabled={busy || next.length === 0 || !projectId}
                        aria-label={`Move ${it.item_name} to another stage`}
                        onChange={(e) => {
                          const to = e.target.value as MRItemStage;
                          if (to) onMove(projectId, [it.id], to);
                        }}
                        className="h-7 w-44 text-[12px]"
                      >
                        <option value="">Move to…</option>
                        {next.map((s) => (
                          <option key={s} value={s}>
                            {MR_ITEM_STAGE_META[s].label}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── The `Project` column the company scope adds (`110014`) ──────────────── */

function ProjectCell({ ref: r }: { ref: ProjectRef }) {
  if (!r.project_id) {
    return (
      <span
        className="text-[var(--color-ink-disabled)]"
        title="No project FK on this row — any name shown is the legacy label"
      >
        {r.projectName ?? "—"}
      </span>
    );
  }
  return (
    <Link
      href={`/projects/${r.project_id}/procurement`}
      className="text-[var(--color-ink)] hover:underline"
    >
      {r.projectName ?? "Untitled project"}
    </Link>
  );
}

/* ── RFQs (frame `105818`) ────────────────────────────────────────────────── */

function RfqTable({
  data,
  showProject,
}: {
  data: ProjectProcurement;
  showProject: boolean;
}) {
  if (data.rfqs.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="size-8" />}
        title="No RFQs yet"
        description="Raise one from a request's lines on the Requests tab. Bids, comparison and the award reason live in the RFQ itself."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
              <th className="px-4 py-2 font-medium">Name</th>
              {showProject && <th className="px-4 py-2 font-medium">Project</th>}
              <th className="px-4 py-2 font-medium">Vendors</th>
              <th className="px-4 py-2 text-right font-medium">Items</th>
              <th className="px-4 py-2 font-medium">Bid deadline</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Awarded to</th>
            </tr>
          </thead>
          <tbody>
            {data.rfqs.map((r) => {
              const meta = RFQ_STATUS_META[r.status as keyof typeof RFQ_STATUS_META];
              return (
                <tr key={r.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/rfq/${r.id}`}
                      className="font-medium text-[var(--color-ink)] hover:underline"
                    >
                      {r.title}
                    </Link>
                    <span className="block text-[11px] tabular text-[var(--color-ink-secondary)]">
                      {fmtDate(r.created_at)}
                      {r.place_of_supply ? ` · ${r.place_of_supply}` : ""}
                    </span>
                  </td>
                  {showProject && (
                    <td className="px-4 py-2.5">
                      <ProjectCell ref={r} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {r.vendorNames.length === 0
                      ? "—"
                      : r.vendorNames.length <= 2
                        ? r.vendorNames.join(", ")
                        : `${r.vendorNames[0]} +${r.vendorNames.length - 1} more`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{r.itemCount}</td>
                  <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                    {r.bid_deadline ? fmtDate(r.bid_deadline) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip
                      tone={meta ? TONE_CHIP[meta.tone] : "neutral"}
                      label={meta?.label ?? r.status}
                    />
                  </td>
                  <td className="max-w-64 px-4 py-2.5">
                    {r.awardedVendorName ? (
                      <>
                        <span className="text-[var(--color-ink)]">
                          {r.awardedVendorName}
                        </span>
                        {/* The reason is the point of recording the award at
                            all — it is the answer to "why did we pay that?" */}
                        <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                          {r.awardReason ?? "No reason recorded"}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--color-ink-disabled)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Orders (frame `105913`) ──────────────────────────────────────────────── */

function OrderTable({
  data,
  showProject,
}: {
  data: ProjectProcurement;
  showProject: boolean;
}) {
  const value = data.orders.reduce((sum, o) => sum + o.amount, 0);

  if (data.orders.length === 0) {
    return (
      <EmptyState
        icon={<Package className="size-8" />}
        title="No orders yet"
        description="Awarding an RFQ on the RFQ tab drafts a purchase order for the winning vendor."
      />
    );
  }

  return (
    <>
      <TileGrid>
        <StatTile label="Orders" value={data.orders.length} hero icon={<Package className="size-4" />} />
        <StatTile label="Order value" value={inr(value)} tone="info" />
        <StatTile
          label="Fully received"
          value={data.orders.filter((o) => o.lineCount > 0 && o.receivedLines === o.lineCount).length}
          tone="neutral"
        />
        <StatTile
          label="Part delivered"
          value={
            data.orders.filter((o) => o.receivedLines > 0 && o.receivedLines < o.lineCount)
              .length
          }
          tone="neutral"
        />
      </TileGrid>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                <th className="px-4 py-2 font-medium">Order</th>
                {showProject && <th className="px-4 py-2 font-medium">Project</th>}
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
                <th className="px-4 py-2 font-medium">Delivery</th>
                <th className="px-4 py-2 font-medium">Lines received</th>
                <th className="px-4 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-[var(--color-ink)] hover:underline"
                    >
                      {o.name ?? "Untitled order"}
                    </Link>
                    {/* Work orders and purchase orders share this table, as
                        `105913` does — DZY-WO-8 beside DZY-PO-299. */}
                    <span className="block text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                      {o.kind === "work" ? "Work order" : "Purchase order"}
                    </span>
                  </td>
                  {showProject && (
                    <td className="px-4 py-2.5">
                      <ProjectCell ref={o} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {o.vendorName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{inr(o.amount)}</td>
                  <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                    {o.expected_date ? fmtDate(o.expected_date) : "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                    {o.lineCount === 0 ? "—" : `${o.receivedLines} / ${o.lineCount}`}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip tone="neutral" label={o.order_state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ── Deliveries — the "Acceptance" the owner called non-negotiable ────────── */

/**
 * The delivery-ACCEPTANCE QUEUE (frame `105913`'s Acceptance sub-view).
 *
 * Rows are purchase/work ORDERS, not receipt-log lines: a queue answers "what
 * is still owed to us and how much has landed", so the unit is the order and
 * the chip is its acceptance status derived from `order_state` through
 * `ACCEPTANCE_META` (Pending / Partial / Accepted — the acceptance lens, never
 * the Orders tab's Created/Partially-delivered/Delivered, and never red).
 *
 * Two filters resolve on the SERVER from the URL, mirroring `?view=`:
 *   · `?otype=` splits Purchase Orders from Work Orders (Dzylo's two sub-views);
 *   · `?accept=` narrows to one status bucket.
 * They are Links that change the query, so the server re-renders the filtered
 * rows and a fetch of the URL is verifiable — no client-only state that never
 * reaches the URL.
 *
 * The flat receipt LOG this tab used to be is NOT lost: it is folded into each
 * order as an expandable "what has landed" detail (`data.deliveries` per PO).
 */
function DeliveryQueue({
  data,
  showProject,
  accept,
  otype,
  adhocWarehouseId,
}: {
  data: ProjectProcurement;
  showProject: boolean;
  accept: AcceptanceState | null;
  otype: "purchase" | "work";
  adhocWarehouseId: string | null;
}) {
  const pathname = usePathname();

  // Receipts (the old flat log) grouped under the order they arrived against.
  const receiptsByPo = useMemo(() => {
    const m = new Map<string, typeof data.deliveries>();
    for (const d of data.deliveries) {
      const list = m.get(d.poId) ?? [];
      list.push(d);
      m.set(d.poId, list);
    }
    return m;
  }, [data.deliveries]);

  // The current PO/WO sub-view. Counts and chips are over THIS set.
  const ofType = useMemo(
    () => data.orders.filter((o) => (otype === "work" ? o.kind === "work" : o.kind === "purchase")),
    [data.orders, otype],
  );

  const counts = useMemo(() => {
    const c = { pending: 0, partial: 0, accepted: 0 };
    for (const o of ofType) {
      const b = acceptanceBucketOf(o.order_state);
      if (b) c[b] += 1;
    }
    return c;
  }, [ofType]);

  const rows = accept
    ? ofType.filter((o) => acceptanceBucketOf(o.order_state) === accept)
    : ofType;

  function hrefFor(next: { accept?: AcceptanceState | null; otype?: "purchase" | "work" }) {
    const a = next.accept === undefined ? accept : next.accept;
    const t = next.otype === undefined ? otype : next.otype;
    const params = new URLSearchParams();
    params.set("view", "deliveries");
    params.set("otype", t);
    if (a) params.set("accept", a);
    return `${pathname}?${params.toString()}`;
  }

  const adhocHref = adhocWarehouseId
    ? `/inventory/stock-in?direction=in&warehouse=${adhocWarehouseId}`
    : `/inventory/stock-in?direction=in`;

  return (
    <div className="flex flex-col gap-4">
      {/* PO/WO split (top-left) and the one primary action (top-right). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5">
          {(["purchase", "work"] as const).map((t) => (
            <Link
              key={t}
              href={hrefFor({ otype: t })}
              scroll={false}
              className={cn(
                "rounded px-3 py-1 text-[13px]",
                otype === t
                  ? "bg-[var(--color-surface-sunken)] font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
              )}
            >
              {t === "purchase" ? "Purchase Orders" : "Work Orders"}
            </Link>
          ))}
        </div>
        {/* Ad-hoc receive (Q4): goods with NO purchase order. Routes to the
            existing guarded stock-in form (guards inventory.movement.create,
            posts a GRN with po_id null) — a receipt off no PO line, kept a
            separate path so PO-traced receipts keep their line integrity. */}
        <Button asChild variant="secondary" size="sm">
          <Link href={adhocHref} title="Record goods that arrived without a purchase order">
            <Plus className="size-4" /> Receive ad-hoc
          </Link>
        </Button>
      </div>

      {/* Status filter chips — Pending · Partial · Accepted, plus All. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefFor({ accept: null })}
          scroll={false}
          className={cn(
            "rounded-full border px-3 py-1 text-[12px]",
            accept === null
              ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-surface)]"
              : "border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
          )}
        >
          All ({ofType.length})
        </Link>
        {ACCEPTANCE_STATES.map((s) => (
          <Link
            key={s}
            href={hrefFor({ accept: s })}
            scroll={false}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px]",
              accept === s
                ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-surface)]"
                : "border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
            )}
          >
            {ACCEPTANCE_FILTER_LABELS[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-8" />}
          title={
            data.orders.length === 0
              ? "Nothing to accept yet"
              : accept
                ? `No ${ACCEPTANCE_FILTER_LABELS[accept].toLowerCase()} ${otype === "work" ? "work orders" : "purchase orders"}`
                : `No ${otype === "work" ? "work orders" : "purchase orders"} yet`
          }
          description="Awarding an RFQ drafts an order; recording a receipt on the order moves it Pending → Partial → Accepted here. Goods with no order use Receive ad-hoc."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2 font-medium">Order</th>
                  {showProject && <th className="px-4 py-2 font-medium">Project</th>}
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">Delivery</th>
                  <th className="px-4 py-2 font-medium">Lines received</th>
                  <th className="px-4 py-2 font-medium">Acceptance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <QueueRow
                    key={o.id}
                    order={o}
                    showProject={showProject}
                    receipts={receiptsByPo.get(o.id) ?? []}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** One order in the queue, expandable to the receipts that have landed on it. */
function QueueRow({
  order: o,
  showProject,
  receipts,
}: {
  order: ProjectProcurement["orders"][number];
  showProject: boolean;
  receipts: ProjectProcurement["deliveries"];
}) {
  const [open, setOpen] = useState(false);
  const meta = ACCEPTANCE_META[o.order_state as keyof typeof ACCEPTANCE_META] ?? {
    label: o.order_state,
    tone: "neutral" as const,
  };
  const colSpan = showProject ? 6 : 5;

  return (
    <>
      <tr className="border-b border-[var(--color-border)] last:border-0">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            {receipts.length > 0 ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={open ? "Hide receipts" : "Show receipts"}
                className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
              >
                {open ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            ) : (
              <span className="inline-block size-4" />
            )}
            <div className="min-w-0">
              <Link
                href={`/orders/${o.id}`}
                className="font-medium text-[var(--color-ink)] hover:underline"
              >
                {o.name ?? "Untitled order"}
              </Link>
              <span className="block text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                {o.kind === "work" ? "Work order" : "Purchase order"}
                {receipts.length > 0 && ` · ${receipts.length} receipt${receipts.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
        </td>
        {showProject && (
          <td className="px-4 py-2.5">
            <ProjectCell ref={o} />
          </td>
        )}
        <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
          {o.vendorName ?? "—"}
        </td>
        <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
          {o.expected_date ? fmtDate(o.expected_date) : "—"}
        </td>
        <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
          {o.lineCount === 0 ? "—" : `${o.receivedLines} / ${o.lineCount}`}
        </td>
        <td className="px-4 py-2.5">
          <StatusChip tone={TONE_CHIP[meta.tone]} label={meta.label} />
        </td>
      </tr>
      {open && receipts.length > 0 && (
        <tr className="border-b border-[var(--color-border)] last:border-0">
          <td colSpan={colSpan} className="bg-[var(--color-surface-sunken)] px-4 py-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
              What has landed
            </p>
            <ul className="flex flex-col gap-1">
              {receipts.map((d) => (
                <li key={d.id} className="text-[12px] text-[var(--color-ink-secondary)]">
                  <span className="tabular text-[var(--color-ink)]">
                    {fmtDate(d.received_on)}
                  </span>
                  {d.vendorName ? ` · ${d.vendorName}` : ""}
                  {d.note ? ` · ${d.note}` : ""}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Inventory (PLAN-V4 §10.2 — the placeholder this replaces) ───────────── */

/**
 * This project's own stock: its site stores, what is in them, and the notes
 * that put it there.
 *
 * Company warehouses are deliberately not here. A godown every project draws
 * from is not this project's stock, and showing it would let two projects each
 * claim the same sheet of plywood. The link out is how you reach it.
 */
function InventoryPanel({
  inventory,
  projectId,
}: {
  inventory: ProjectInventory | null;
  projectId: string | null;
}) {
  if (!inventory || inventory.warehouses.length === 0) {
    return (
      <EmptyState
        icon={<Boxes className="size-8" />}
        title="No site store for this project yet"
        description="A project warehouse belongs to exactly one project and its stock is never shared with another. Add one from Inventory, then goods received against this project land here."
        action={
          <Button asChild variant="secondary">
            <Link href="/inventory">
              <Truck className="size-4" /> Company-wide inventory
            </Link>
          </Button>
        }
      />
    );
  }

  const total = inventory.warehouses.reduce((s, w) => s + w.rolledValue, 0);

  return (
    <div className="flex flex-col gap-4">
      <TileGrid>
        <StatTile
          label="Site stores"
          value={inventory.warehouses.length}
          hero
          icon={<Boxes className="size-4" />}
        />
        <StatTile label="Goods value" value={inr(total)} tone="info" />
        <StatTile
          label="Stock notes"
          value={inventory.notes.length}
          tone="neutral"
          hint="Receipts and issues against this project"
        />
      </TileGrid>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Warehouse</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">UOM</th>
              </tr>
            </thead>
            <tbody>
              {inventory.levels.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-[var(--color-ink-secondary)]"
                  >
                    Nothing in stock yet. Levels are summed from the movement
                    ledger, never stored.
                  </td>
                </tr>
              ) : (
                inventory.levels.map((l) => (
                  <tr
                    key={`${l.item_id ?? l.item_name}-${l.warehouse_id}`}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-2.5 text-[var(--color-ink)]">
                      {l.item_name}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {inventory.warehouseNames[l.warehouse_id] ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{l.qty}</td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {l.uom ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {inventory.warehouses.map((w) => (
          <Link
            key={w.id}
            href={`/inventory/stock-in?warehouse=${w.id}`}
            className="text-[13px] text-[var(--color-ink)] underline-offset-2 hover:underline"
          >
            Stock in to {w.name}
          </Link>
        ))}
        <Link
          href={`/inventory?tab=history${projectId ? "" : ""}`}
          className="inline-flex items-center gap-1 text-[13px] text-[var(--color-ink-secondary)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
        >
          <Truck className="size-3.5" /> All stock notes
        </Link>
      </div>
    </div>
  );
}

/* ── New request: the two-step wizard from `105800` ───────────────────────── */

interface DraftLine {
  key: string;
  item_id: string | null;
  item_name: string;
  uom: string | null;
  qty: number;
  remarks: string | null;
}

function NewRequestDialog({
  scope,
  data,
}: {
  scope: ProcScope;
  data: ProjectProcurement;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [requestType, setRequestType] = useState("material");
  const [expected, setExpected] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  // Company scope has to ask which project — a request is always FOR one, and
  // `createProjectRequest` will not accept a request without a project id.
  const [picked, setPicked] = useState("");

  const projectId = scope.kind === "project" ? scope.projectId : picked;
  const ready = title.trim().length > 0 && projectId.length > 0;
  const usable = lines.filter((l) => l.item_name.trim() && l.qty > 0);

  function addLine() {
    setLines((cur) => [
      ...cur,
      {
        key: `${Date.now()}-${cur.length}`,
        item_id: null,
        item_name: "",
        uom: null,
        qty: 1,
        remarks: null,
      },
    ]);
  }

  function patch(key: string, next: Partial<DraftLine>) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createRequestAction(undefined, fd);
      if (r?.error) setError(r.error);
      else {
        setOpen(false);
        setStep(1);
        setTitle("");
        setLines([]);
        setPicked("");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setStep(1);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="size-4" /> Raise request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "New request" : `Line items — ${title}`}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "The frame's wizard says Next, not Create: details first, then what you actually need."
              : "Quantities are typed by a person. Nothing on this screen invents one."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <FormError error={error ?? undefined} />

            {scope.kind === "company" && (
              <Field label="Project" htmlFor="req_project" required>
                <Select
                  id="req_project"
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                  required
                >
                  <option value="">Choose a project…</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Request type" htmlFor="req_type" required>
              <Select
                id="req_type"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
              >
                <option value="material">Material</option>
                <option value="service">Service</option>
                <option value="labour">Labour</option>
              </Select>
            </Field>

            <Field label="Title" htmlFor="req_title" required>
              <Input
                id="req_title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Kitchen interior material request"
                required
              />
            </Field>

            <Field label="Expected delivery" htmlFor="req_expected">
              <Input
                id="req_expected"
                type="date"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </Field>

            <Field label="Remarks" htmlFor="req_remarks">
              <Textarea
                id="req_remarks"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!ready}
                onClick={() => {
                  if (lines.length === 0) addLine();
                  setStep(2);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          <form action={submit} className="flex flex-col gap-4">
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="request_type" value={requestType} />
            <input type="hidden" name="expected_delivery" value={expected} />
            <input type="hidden" name="remarks" value={remarks} />
            <input
              type="hidden"
              name="lines"
              value={JSON.stringify(
                usable.map((l) => ({
                  item_id: l.item_id,
                  item_name: l.item_name,
                  uom: l.uom,
                  qty: l.qty,
                  remarks: l.remarks,
                })),
              )}
            />
            <FormError error={error ?? undefined} />

            <div className="flex flex-col gap-2">
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] items-end gap-2"
                >
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                      Item
                    </span>
                    <Select
                      value={l.item_id ?? "__adhoc__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__adhoc__") {
                          patch(l.key, { item_id: null });
                          return;
                        }
                        const it = data.catalogue.find((c) => c.id === v);
                        patch(l.key, {
                          item_id: v,
                          item_name: it?.name ?? "",
                          uom: it?.base_uom ?? null,
                        });
                      }}
                      className="h-8 text-[13px]"
                    >
                      {/* No catalogue match is flagged ad-hoc, never a silent
                          free string (the rule 0009 set). */}
                      <option value="__adhoc__">Not in the catalogue…</option>
                      {data.catalogue.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    {!l.item_id && (
                      <Input
                        value={l.item_name}
                        onChange={(e) => patch(l.key, { item_name: e.target.value })}
                        placeholder="Name it anyway"
                        className="mt-1 h-8 text-[13px]"
                      />
                    )}
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                      Qty
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={l.qty}
                      onChange={(e) => patch(l.key, { qty: Number(e.target.value) || 0 })}
                      className="h-8 text-[13px]"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                      UOM
                    </span>
                    <Input
                      value={l.uom ?? ""}
                      onChange={(e) => patch(l.key, { uom: e.target.value || null })}
                      className="h-8 text-[13px]"
                    />
                  </label>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                    title="Remove this line"
                    className="hover:text-[var(--color-red)]"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div>
              <Button variant="secondary" size="sm" onClick={addLine}>
                <Plus className="size-3.5" /> Add line
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
              <Button variant="secondary" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
              <SubmitButton pendingLabel="Raising…" disabled={busy || usable.length === 0}>
                Raise request
                {usable.length > 0 ? ` (${usable.length})` : ""}
              </SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
