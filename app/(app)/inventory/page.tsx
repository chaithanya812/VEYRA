import Link from "next/link";
import {
  Boxes,
  Plus,
  AlertTriangle,
  ArrowLeftRight,
  Warehouse as WarehouseIcon,
  ClipboardCheck,
} from "lucide-react";
import {
  listWarehouses,
  listMovements,
  stockLevels,
  listGrns,
  DIRECTION_META,
  GRN_STATUS_META,
} from "@/lib/data/inventory";
import type {
  DirectionTone,
  GrnStatus,
  GrnTone,
  StockLevel,
} from "@/lib/inventory-model";
import type { Warehouse } from "@/lib/inventory-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { inr, fmtDate } from "@/lib/utils";
import { WarehouseForm } from "./warehouse-form";
import { deactivateWarehouseAction } from "./actions";

/**
 * Inventory home (FEATURE-REGISTER PROC-WH-001/002 · PROC-GRN-001).
 * Four tabs over one ledger: stock levels (a PROJECTION over movements),
 * the append-only movement ledger itself, warehouses, and posted GRNs.
 *
 * Red discipline (§Design): the ONLY red here is genuine alert (negative
 * stock), the primary action (Record stock-in) and the destructive
 * deactivate. Direction chips are green/amber/grey — never red.
 */
const TONE_TO_CHIP: Record<DirectionTone, "neutral" | "green" | "amber"> = {
  positive: "green",
  warning: "amber",
  neutral: "neutral",
};

const GRN_TONE_TO_CHIP: Record<GrnTone, "neutral" | "green" | "amber"> = {
  positive: "green",
  active: "amber",
  muted: "neutral",
};

const TABS = [
  { key: "levels", label: "Stock levels", href: "/inventory" },
  { key: "movements", label: "Movements", href: "/inventory?tab=movements" },
  { key: "warehouses", label: "Warehouses", href: "/inventory?tab=warehouses" },
  { key: "grns", label: "GRNs", href: "/inventory?tab=grns" },
];

const SUBTITLES: Record<string, string> = {
  levels: "Current stock is a projection over the movement ledger — never a stored counter.",
  movements: "The append-only ledger. Every entry is kept; levels are summed from it.",
  warehouses: "Where stock lives.",
  grns: "Posted records of goods receipts.",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "levels";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory"
        subtitle={SUBTITLES[tab]}
        actions={
          <Link href="/inventory/stock-in">
            <Button variant="primary">
              <Plus className="size-4" /> Record stock-in
            </Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={
                "border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors " +
                (active
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "levels" && <LevelsTab />}
      {tab === "movements" && <MovementsTab />}
      {tab === "warehouses" && <WarehousesTab />}
      {tab === "grns" && <GrnsTab />}
    </div>
  );
}

/* ── Stock levels (projection) ─────────────────────────────────────────────── */

async function LevelsTab() {
  const [levels, warehouses] = await Promise.all([
    stockLevels(),
    listWarehouses(),
  ]);
  const whName = new Map(warehouses.map((w) => [w.id, w.name]));

  if (levels.length === 0) {
    return (
      <EmptyState
        icon={<Boxes className="size-8" />}
        title={
          warehouses.length === 0
            ? "No warehouses yet"
            : "No stock recorded yet"
        }
        description={
          warehouses.length === 0
            ? "Create a warehouse first, then record your first stock-in."
            : "Stock levels appear here once you record your first stock-in."
        }
        action={
          <Link href="/inventory/stock-in">
            <Button variant="primary">
              <Plus className="size-4" /> Record stock-in
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium">UOM</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <LevelRow key={`${l.item_id ?? l.item_name}-${l.warehouse_id}`} level={l} whName={whName} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LevelRow({
  level,
  whName,
}: {
  level: StockLevel;
  whName: Map<string, string>;
}) {
  const negative = level.qty < 0;
  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40">
      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
        <span className="inline-flex items-center gap-1.5">
          {level.item_name}
          {!level.item_id && (
            <span
              title="Not in catalogue — promote it in Items"
              className="rounded-full border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-red-hover)]"
            >
              unlisted
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {whName.get(level.warehouse_id) ?? level.warehouse_id.slice(0, 8)}
      </td>
      <td className="px-4 py-3 text-right">
        {negative ? (
          <span
            className="inline-flex items-center justify-end gap-1.5 font-medium text-[var(--color-red)] tabular"
            title="Negative stock — check for missing outward entries"
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            {level.qty}
          </span>
        ) : (
          <span className="text-[var(--color-ink)] tabular">{level.qty}</span>
        )}
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {level.uom ?? "—"}
      </td>
    </tr>
  );
}

/* ── Movements (the ledger) ─────────────────────────────────────────────────── */

async function MovementsTab() {
  const [movements, warehouses] = await Promise.all([
    listMovements(),
    listWarehouses(),
  ]);
  const whName = new Map(warehouses.map((w) => [w.id, w.name]));

  if (movements.length === 0) {
    return (
      <EmptyState
        icon={<ArrowLeftRight className="size-8" />}
        title="No movements yet"
        description="Every receipt, issue and transfer lands here — the ledger everything sums from."
        action={
          <Link href="/inventory/stock-in">
            <Button variant="primary">
              <Plus className="size-4" /> Record stock-in
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium text-right">Rate ₹</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr
                key={m.id}
                className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
              >
                <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                  {fmtDate(m.created_at)}
                </td>
                <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                  <span className="inline-flex items-center gap-1.5">
                    {m.item_name}
                    {!m.item_id && (
                      <span
                        title="Not in catalogue — promote it in Items"
                        className="rounded-full border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-red-hover)]"
                      >
                        unlisted
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                  {whName.get(m.warehouse_id) ?? m.warehouse_id.slice(0, 8)}
                </td>
                <td className="px-4 py-3">
                  <StatusChip
                    tone={TONE_TO_CHIP[DIRECTION_META[m.direction].tone]}
                    label={DIRECTION_META[m.direction].label}
                  />
                </td>
                <td className="px-4 py-3 text-right text-[var(--color-ink)] tabular">
                  {m.qty}
                </td>
                <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
                  {inr(m.unit_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Warehouses ─────────────────────────────────────────────────────────────── */

async function WarehousesTab() {
  const warehouses = await listWarehouses(false);

  return (
    <div className="flex flex-col gap-4">
      <WarehouseForm />

      {warehouses.length === 0 ? (
        <EmptyState
          icon={<WarehouseIcon className="size-8" />}
          title="No warehouses yet"
          description="Create your godown / site stores above — every movement books against one."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Address</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w: Warehouse) => (
                  <tr
                    key={w.id}
                    className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                      {w.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {w.project_label ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {w.address ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {fmtDate(w.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        tone={w.is_active ? "green" : "neutral"}
                        label={w.is_active ? "Active" : "Inactive"}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {w.is_active && (
                        <form action={deactivateWarehouseAction}>
                          <input type="hidden" name="id" value={w.id} />
                          <Button type="submit" variant="danger" size="sm">
                            Deactivate
                          </Button>
                        </form>
                      )}
                    </td>
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

/* ── GRNs ───────────────────────────────────────────────────────────────────── */

async function GrnsTab() {
  const [grns, warehouses] = await Promise.all([listGrns(), listWarehouses()]);
  const whName = new Map(warehouses.map((w) => [w.id, w.name]));

  if (grns.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="size-8" />}
        title="No GRNs yet"
        description="A GRN is the posted record of a receipt — generate one while recording stock-in."
        action={
          <Link href="/inventory/stock-in">
            <Button variant="primary">
              <Plus className="size-4" /> Record stock-in
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
              <th className="px-4 py-3 font-medium">GRN No</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">PO</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Recorded</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {grns.map((g) => {
              const meta = GRN_STATUS_META[g.status as GrnStatus];
              return (
                <tr
                  key={g.id}
                  className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                >
                  <td
                    className="px-4 py-3 font-medium text-[var(--color-ink)] tabular"
                    title={g.id}
                  >
                    {g.grn_no ?? g.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                    {whName.get(g.warehouse_id) ?? g.warehouse_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                    {g.po_id ? g.po_id.slice(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      tone={
                        meta
                          ? GRN_TONE_TO_CHIP[meta.tone]
                          : "neutral"
                      }
                      label={meta?.label ?? g.status}
                    />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                    {fmtDate(g.recorded_at)}
                  </td>
                  <td className="max-w-72 truncate px-4 py-3 text-[var(--color-ink-secondary)]">
                    {g.note ?? "—"}
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
