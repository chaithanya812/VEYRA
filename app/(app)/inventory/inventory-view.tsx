"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  Package,
  Search,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, StatusChip } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import { StatTile, TileGrid } from "../dashboard/workspace-ui";
import {
  GRN_STATUS_META,
  INVENTORY_TABS,
  INVENTORY_TAB_LABELS,
  NOTE_DIRECTION_LABELS,
  NOTE_KIND_LABELS,
  type GrnStatus,
  type GrnTone,
  type InventoryTab,
  type NoteDirection,
  type StockLevel,
  type StockNote,
  type WarehouseNode,
} from "@/lib/inventory-model";
import type {
  DeliveryStockInRow,
  ExpenseStockInRow,
  InventoryData,
  UnlinkedMovement,
} from "@/lib/data/inventory";
import { deactivateWarehouseAction, reactivateWarehouseAction } from "./actions";
import { cn, fmtDate, inr } from "@/lib/utils";

/**
 * Inventory Management (PLAN-V4 §10.2, frames `110109` / `110101`).
 *
 * Four tabs over ONE append-only ledger, plus the frame's `Material Search`
 * as a fifth:
 *
 *   Warehouse/Site · Deliveries StockIn · Expense StockIn · Transaction History
 *
 * Two things this screen refuses to do, both of them things the frame does.
 *
 * 1. **It does not print a number it cannot source.** `Goods Value` is the
 *    ledger's own arithmetic over the movements below it, and a warehouse with
 *    bins shows the roll-up because a shelf's stock is in the warehouse. Rows
 *    written before the document model existed (0033) are shown as unlinked
 *    entries rather than given an invented GRN number.
 *
 * 2. **It does not use a second red.** `110109` puts `Add Warehouse` (filled)
 *    beside `Material Search` (outlined red) — two primaries per view, which
 *    DESIGN-DIRECTION §7 lists as a mistake to fix rather than copy. One
 *    filled primary per tab; everything else is black.
 */

const GRN_TONE_TO_CHIP: Record<GrnTone, "neutral" | "green" | "amber"> = {
  positive: "green",
  active: "amber",
  muted: "neutral",
};

/** `Company Warehouses` | `Project Warehouses` — the split the owner named. */
type WarehouseScope = "company" | "project" | "orphaned";

export function InventoryView({
  data,
  tab,
  includeArchived,
}: {
  data: InventoryData;
  tab: InventoryTab;
  includeArchived: boolean;
}) {
  const [scope, setScope] = useState<WarehouseScope>("company");
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<NoteDirection>("in");

  const nodes =
    scope === "company"
      ? data.company
      : scope === "project"
        ? data.projects
        : data.orphaned;

  return (
    <>
      {/* ── Tabs (`110109`) ────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {INVENTORY_TABS.map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={
                t === "warehouses"
                  ? `/inventory${includeArchived ? "?archived=1" : ""}`
                  : `/inventory?tab=${t}${includeArchived ? "&archived=1" : ""}`
              }
              className={cn(
                "shrink-0 border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors",
                active
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
              )}
            >
              {INVENTORY_TAB_LABELS[t]}
            </Link>
          );
        })}
      </div>

      {tab === "warehouses" && (
        <WarehousesTab
          data={data}
          nodes={nodes}
          scope={scope}
          setScope={setScope}
          includeArchived={includeArchived}
        />
      )}
      {tab === "deliveries" && <DeliveriesTab rows={data.deliveries} />}
      {tab === "expense" && <ExpenseTab rows={data.expenseQueue} data={data} />}
      {tab === "history" && (
        <HistoryTab
          notes={data.notes}
          unlinked={data.unlinked}
          direction={direction}
          setDirection={setDirection}
        />
      )}
      {tab === "materials" && (
        <MaterialsTab
          levels={data.levels}
          warehouseNames={data.warehouseNames}
          query={query}
          setQuery={setQuery}
        />
      )}
    </>
  );
}

/* ── Warehouse/Site (`110109`) ────────────────────────────────────────────── */

function WarehousesTab({
  data,
  nodes,
  scope,
  setScope,
  includeArchived,
}: {
  data: InventoryData;
  nodes: WarehouseNode[];
  scope: WarehouseScope;
  setScope: (s: WarehouseScope) => void;
  includeArchived: boolean;
}) {
  const options: { value: WarehouseScope; label: string; badge?: number }[] = [
    { value: "company", label: "Company Warehouses", badge: data.company.length },
    { value: "project", label: "Project Warehouses", badge: data.projects.length },
  ];
  // The orphaned tab appears only when there is something in it — a permanent
  // empty tab teaches people to ignore a real warning.
  if (data.orphaned.length > 0) {
    options.push({
      value: "orphaned",
      label: "Project removed",
      badge: data.orphaned.length,
    });
  }

  const total = nodes.reduce((sum, n) => sum + n.rolledValue, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Warehouse scope"
          value={scope}
          onChange={setScope}
          options={options}
        />
        {/* `Unarchived ▾` — and it says how much it is hiding, because a
            filter that silently shrinks a list is how a warehouse goes
            missing. */}
        <Link
          href={
            includeArchived
              ? "/inventory"
              : "/inventory?archived=1"
          }
          className="text-[13px] text-[var(--color-ink-secondary)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
        >
          {includeArchived
            ? "Hide archived"
            : `Show archived${data.archivedCount > 0 ? ` (${data.archivedCount})` : ""}`}
        </Link>
      </div>

      {scope === "orphaned" && (
        <p className="mb-4 rounded-md border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-3 py-2 text-[13px] text-[var(--color-red)]">
          These warehouses were created against a project that no longer exists.
          Their stock is still real, so nothing has been moved or re-labelled —
          but nobody owns them until they are reassigned.
        </p>
      )}

      {nodes.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <WarehouseIcon className="mx-auto size-6 text-[var(--color-ink-disabled)]" />
          <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
            {scope === "company"
              ? "No company warehouses yet"
              : "No project warehouses yet"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-ink-secondary)]">
            {scope === "company"
              ? "A company warehouse is a godown every project can draw from. Add one — every movement books against a warehouse."
              : "A project warehouse is a site store that belongs to exactly one project, and its stock is never shared with another."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="w-14 px-4 py-2 font-medium">S.No</th>
                  <th className="px-4 py-2 font-medium">Warehouse</th>
                  <th className="px-4 py-2 text-right font-medium">Goods Value</th>
                  <th className="px-4 py-2 font-medium">Last Stock In</th>
                  <th className="px-4 py-2 font-medium">Last Stock Out</th>
                  <th className="px-4 py-2 font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n, i) => (
                  <WarehouseRows key={n.id} node={n} index={i + 1} depth={0} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                    {nodes.length} {nodes.length === 1 ? "warehouse" : "warehouses"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular text-[var(--color-ink)]">
                    {inr(total)}
                  </td>
                  <td colSpan={3} className="px-4 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-3 text-xs text-[var(--color-ink-secondary)]">
        Goods Value is the ledger&apos;s own arithmetic — every inward line at
        its recorded rate, less every outward one. It is not a FIFO or
        weighted-average valuation; those are finance decisions nobody has made
        yet. What it can always do is name the movements it came from.
      </p>
    </>
  );
}

/** One warehouse row, plus its bins when expanded (`1st Warehouse ❯`). */
function WarehouseRows({
  node,
  index,
  depth,
}: {
  node: WarehouseNode;
  index: number;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const hasBins = node.bins.length > 0;
  const negative = node.rolledValue < 0;

  return (
    <>
      <tr
        className={cn(
          "border-b border-[var(--color-border)] last:border-0",
          depth === 0 && "odd:bg-[var(--color-surface-sunken)]",
          depth > 0 && "bg-[var(--color-surface-sunken)]/60",
          "hover:bg-[var(--color-border)]/40",
        )}
      >
        <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
          {depth === 0 ? index : ""}
        </td>
        <td className="px-4 py-2.5" style={{ paddingLeft: 16 + depth * 20 }}>
          <span className="inline-flex items-center gap-1.5">
            {hasBins ? (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} locations in ${node.name}`}
                className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
              >
                {open ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            ) : (
              <span className="inline-block w-4" />
            )}
            <span className="font-medium text-[var(--color-ink)]">{node.name}</span>
            {hasBins && (
              <span className="text-[11px] text-[var(--color-ink-secondary)]">
                {node.bins.length}{" "}
                {node.bins.length === 1 ? "location" : "locations"}
              </span>
            )}
            {!node.is_active && <StatusChip tone="neutral" label="Archived" />}
          </span>
          {node.project_label && depth === 0 && (
            <span className="ml-6 block text-[11px] text-[var(--color-ink-secondary)]">
              {node.project_label}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          {negative ? (
            <span
              className="inline-flex items-center justify-end gap-1.5 font-medium tabular text-[var(--color-red)]"
              title="Negative value — more has been issued than was ever received"
            >
              <AlertTriangle className="size-3.5 shrink-0" />
              {inr(node.rolledValue)}
            </span>
          ) : (
            <span className="tabular text-[var(--color-ink)]">
              {inr(node.rolledValue)}
            </span>
          )}
          {hasBins && node.ownValue !== node.rolledValue && (
            <span className="block text-[11px] tabular text-[var(--color-ink-secondary)]">
              {inr(node.ownValue)} outside locations
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
          {node.lastIn ? fmtDate(node.lastIn) : "—"}
        </td>
        <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
          {node.lastOut ? fmtDate(node.lastOut) : "—"}
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/inventory/stock-in?warehouse=${node.id}`}
              className="text-[12px] text-[var(--color-ink)] underline-offset-2 hover:underline"
            >
              Stock in
            </Link>
            <form
              action={
                node.is_active
                  ? deactivateWarehouseAction
                  : reactivateWarehouseAction
              }
            >
              <input type="hidden" name="id" value={node.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className={cn(
                  "text-[12px]",
                  node.is_active && "hover:text-[var(--color-red)]",
                )}
              >
                {node.is_active ? "Archive" : "Restore"}
              </Button>
            </form>
          </div>
        </td>
      </tr>
      {open &&
        node.bins.map((b, i) => (
          <WarehouseRows key={b.id} node={b} index={i + 1} depth={depth + 1} />
        ))}
    </>
  );
}

/* ── Deliveries StockIn ───────────────────────────────────────────────────── */

/**
 * The join the two modules were missing. Procurement records that goods
 * ARRIVED; inventory records that they were PUT SOMEWHERE. On a real site those
 * are hours apart, so the gap is a queue and not a bug — but it has to be
 * visible, or a delivery sits unbooked and the stock screen quietly lies.
 */
function DeliveriesTab({ rows }: { rows: DeliveryStockInRow[] }) {
  const waiting = rows.filter((r) => r.noteNumbers.length === 0);

  if (rows.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <Truck className="mx-auto size-6 text-[var(--color-ink-disabled)]" />
        <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
          No deliveries recorded yet
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-ink-secondary)]">
          A receipt against a purchase order lands here, waiting to be booked
          into a warehouse. Record one from the order.
        </p>
        <Link
          href="/orders"
          className="mt-3 inline-block text-[13px] text-[var(--color-ink)] underline-offset-2 hover:underline"
        >
          Go to orders
        </Link>
      </Card>
    );
  }

  return (
    <>
      <TileGrid>
        <StatTile
          label="Deliveries"
          value={rows.length}
          hero
          icon={<Truck className="size-4" />}
        />
        <StatTile
          label="Not yet booked in"
          value={waiting.length}
          tone={waiting.length > 0 ? "warning" : "neutral"}
          hint="Goods arrived; no stock note against the order yet"
        />
        <StatTile
          label="Booked in"
          value={rows.length - waiting.length}
          tone="neutral"
        />
      </TileGrid>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                <th className="px-4 py-2 font-medium">Received on</th>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Stock note</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)]"
                >
                  <td className="px-4 py-2.5 tabular">{fmtDate(r.received_on)}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/orders/${r.po_id}`}
                      className="text-[var(--color-ink)] hover:underline"
                    >
                      {r.orderName ?? "Order"}
                    </Link>
                    {r.note && (
                      <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                        {r.note}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {r.project_id ? (
                      <Link
                        href={`/projects/${r.project_id}`}
                        className="hover:text-[var(--color-ink)] hover:underline"
                      >
                        {r.projectName ?? "Untitled project"}
                      </Link>
                    ) : (
                      (r.projectName ?? "—")
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {r.vendorName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.noteNumbers.length === 0 ? (
                      <StatusChip tone="amber" label="Awaiting stock-in" />
                    ) : (
                      <span className="tabular text-[var(--color-ink-secondary)]">
                        {r.noteNumbers.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/inventory/stock-in?po=${r.po_id}${r.received_on ? `&ref=${encodeURIComponent(r.orderName ?? "")}` : ""}`}
                      className="text-[12px] text-[var(--color-ink)] underline-offset-2 hover:underline"
                    >
                      Book into stock
                    </Link>
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

/* ── Expense StockIn (§9.4 → §10.2) ───────────────────────────────────────── */

/**
 * The landing point for the `Raise a stock-in request` checkbox on a project
 * expense. 0037 wrote the flag; until now nothing read it, which made it a
 * promise the product did not keep.
 */
function ExpenseTab({
  rows,
  data,
}: {
  rows: ExpenseStockInRow[];
  data: InventoryData;
}) {
  const waiting = rows.filter((r) => !r.stock_in_grn_id);
  const waitingValue = waiting.reduce((sum, r) => sum + r.amount, 0);

  if (rows.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <Package className="mx-auto size-6 text-[var(--color-ink-disabled)]" />
        <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
          Nothing waiting on a stock-in
        </p>
        <p className="mx-auto mt-1 max-w-lg text-xs text-[var(--color-ink-secondary)]">
          Tick <span className="font-medium">Raise a stock-in request</span> when
          recording a project expense for material, and it appears here until
          the goods are booked into a warehouse.
        </p>
      </Card>
    );
  }

  return (
    <>
      <TileGrid>
        <StatTile
          label="Flagged expenses"
          value={rows.length}
          hero
          icon={<Package className="size-4" />}
        />
        <StatTile
          label="Awaiting stock-in"
          value={waiting.length}
          tone={waiting.length > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Value awaiting"
          value={inr(waitingValue)}
          tone="neutral"
          hint="What was paid for but is not on a shelf yet"
        />
      </TileGrid>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                <th className="px-4 py-2 font-medium">Paid on</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Stock note</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)]"
                >
                  <td className="px-4 py-2.5 tabular">{fmtDate(r.paid_on)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {r.project_id ? (
                      <Link
                        href={`/projects/${r.project_id}/payments`}
                        className="hover:text-[var(--color-ink)] hover:underline"
                      >
                        {r.projectName ?? "Untitled project"}
                      </Link>
                    ) : (
                      (r.projectName ?? "—")
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {r.vendorName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {r.category ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{inr(r.amount)}</td>
                  <td className="px-4 py-2.5">
                    {r.stock_in_grn_id ? (
                      <span className="tabular text-[var(--color-ink-secondary)]">
                        {r.grnNumber ?? "Recorded"}
                      </span>
                    ) : (
                      <StatusChip tone="amber" label="Awaiting stock-in" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.stock_in_grn_id ? (
                      <span className="text-[12px] text-[var(--color-ink-disabled)]">
                        Booked in
                      </span>
                    ) : (
                      <Link
                        href={
                          `/inventory/stock-in?payment=${r.id}` +
                          (r.vendor_id ? `&vendor=${r.vendor_id}` : "") +
                          (r.reference ? `&ref=${encodeURIComponent(r.reference)}` : "") +
                          projectWarehouseParam(data, r.project_id)
                        }
                        className="text-[12px] text-[var(--color-ink)] underline-offset-2 hover:underline"
                      >
                        Record stock-in
                      </Link>
                    )}
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

/**
 * A flagged expense on a project that owns exactly one warehouse can name it;
 * two would be a guess, and a guess that lands stock in the wrong store is
 * worse than an unfilled field.
 */
function projectWarehouseParam(
  data: InventoryData,
  projectId: string | null,
): string {
  if (!projectId) return "";
  const matches = data.projects.filter((w) => w.project_id === projectId);
  return matches.length === 1 ? `&warehouse=${matches[0].id}` : "";
}

/* ── Transaction History (`110101`) ───────────────────────────────────────── */

function HistoryTab({
  notes,
  unlinked,
  direction,
  setDirection,
}: {
  notes: StockNote[];
  unlinked: UnlinkedMovement[];
  direction: NoteDirection;
  setDirection: (d: NoteDirection) => void;
}) {
  const shown = notes.filter((n) => n.direction === direction);
  const strays = unlinked.filter((m) =>
    direction === "in" ? m.direction === "in" : m.direction === "out",
  );

  return (
    <>
      <div className="mb-4">
        <SegmentedControl
          label="Movement direction"
          value={direction}
          onChange={setDirection}
          options={[
            {
              value: "in" as NoteDirection,
              label: NOTE_DIRECTION_LABELS.in,
              badge: notes.filter((n) => n.direction === "in").length,
            },
            {
              value: "out" as NoteDirection,
              label: NOTE_DIRECTION_LABELS.out,
              badge: notes.filter((n) => n.direction === "out").length,
            },
          ]}
        />
      </div>

      {shown.length === 0 && (
        <Card className="border-dashed p-10 text-center">
          <Boxes className="mx-auto size-6 text-[var(--color-ink-disabled)]" />
          <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
            No {NOTE_KIND_LABELS[direction].toLowerCase()}s yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-ink-secondary)]">
            Every movement posts one numbered document and one ledger line per
            item. Both are append-only.
            {strays.length > 0 &&
              " The movements below predate stock notes, so they have no number to show."}
          </p>
          <Link
            href={`/inventory/stock-in?direction=${direction}`}
            className="mt-3 inline-block text-[13px] text-[var(--color-ink)] underline-offset-2 hover:underline"
          >
            Record one
          </Link>
        </Card>
      )}

      {shown.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2 font-medium">Id</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Warehouse/Site</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">Recorded By</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((n) => {
                  const meta = GRN_STATUS_META[n.status as GrnStatus];
                  return (
                    <tr
                      key={n.id}
                      className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)]"
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className="font-medium tabular text-[var(--color-ink)]"
                          title={n.id}
                        >
                          {n.number ?? "Unnumbered"}
                        </span>
                        <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                          {n.lineCount} {n.lineCount === 1 ? "line" : "lines"}
                          {n.reference ? ` · ${n.reference}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                        {fmtDate(n.recorded_at)}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                        {n.warehouseName ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{n.qty}</td>
                      <td className="px-4 py-2.5 text-right tabular">
                        {inr(n.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                        {n.vendorName ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                        {n.recordedByName ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip
                          tone={meta ? GRN_TONE_TO_CHIP[meta.tone] : "neutral"}
                          label={meta?.label ?? n.status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pre-0033 history: shown as itself, never given a number it never had. */}
      {strays.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-2.5">
            <p className="text-[13px] font-medium text-[var(--color-ink)]">
              {strays.length} movement{strays.length === 1 ? "" : "s"} with no
              document
            </p>
            <p className="text-[11px] text-[var(--color-ink-secondary)]">
              Recorded before stock notes existed, so there is no number to
              show. They are listed as themselves rather than given one they
              never had.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Warehouse/Site</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {strays.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-2.5 text-[var(--color-ink)]">
                      {m.item_name}
                    </td>
                    <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                      {fmtDate(m.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {m.warehouseName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{m.qty}</td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {inr(m.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {m.recordedByName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ── Material search (`110109`'s header control) ──────────────────────────── */

function MaterialsTab({
  levels,
  warehouseNames,
  query,
  setQuery,
}: {
  levels: StockLevel[];
  warehouseNames: Record<string, string>;
  query: string;
  setQuery: (q: string) => void;
}) {
  const term = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      term
        ? levels.filter(
            (l) =>
              l.item_name.toLowerCase().includes(term) ||
              (warehouseNames[l.warehouse_id] ?? "").toLowerCase().includes(term),
          )
        : levels,
    [levels, term, warehouseNames],
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-secondary)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a material or a warehouse…"
            aria-label="Search materials"
            className="pl-8"
          />
        </div>
        <span className="text-[13px] text-[var(--color-ink-secondary)] tabular">
          {shown.length} of {levels.length}
        </span>
      </div>

      {levels.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <Boxes className="mx-auto size-6 text-[var(--color-ink-disabled)]" />
          <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
            No stock recorded yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-ink-secondary)]">
            Levels are summed from the movement ledger, never stored. Record a
            stock-in and this fills itself.
          </p>
        </Card>
      ) : shown.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-ink)]">
            Nothing matches “{query}”
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Warehouse</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 font-medium">UOM</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr
                    key={`${l.item_id ?? l.item_name}-${l.warehouse_id}`}
                    className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                      <span className="inline-flex items-center gap-1.5">
                        {l.item_name}
                        {!l.item_id && (
                          <span
                            title="Not in catalogue — promote it in Items"
                            className="rounded-full border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-red-hover)]"
                          >
                            unlisted
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {warehouseNames[l.warehouse_id] ??
                        l.warehouse_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {l.qty < 0 ? (
                        <span
                          className="inline-flex items-center justify-end gap-1.5 font-medium tabular text-[var(--color-red)]"
                          title="Negative stock — check for missing inward entries"
                        >
                          <AlertTriangle className="size-3.5 shrink-0" />
                          {l.qty}
                        </span>
                      ) : (
                        <span className="tabular text-[var(--color-ink)]">
                          {l.qty}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {l.uom ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
