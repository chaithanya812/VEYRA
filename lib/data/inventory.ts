import "server-only";
import { withOrg } from "./with-org";
import { listMembers, type Member } from "./team";
import { issueDocNumber } from "./config";
import {
  MOVEMENT_DIRECTIONS,
  DIRECTION_META,
  GRN_STATUSES,
  GRN_STATUS_META,
  WAREHOUSE_KINDS,
  WAREHOUSE_KIND_LABELS,
  buildWarehouseTree,
  movedAmount,
  movedQty,
  noteDirectionOf,
  projectStock,
  warehouseKindOf,
  type CatalogueItemRef,
  type Grn,
  type GrnStatus,
  type LedgerLine,
  type NoteDirection,
  type StockLevel,
  type StockMovement,
  type StockNote,
  type Warehouse,
  type WarehouseKind,
  type WarehouseNode,
} from "@/lib/inventory-model";

/**
 * Inventory data module — warehouses, the append-only stock-movement ledger,
 * and the documents that group it (FEATURE-REGISTER PROC-WH-001/002 ·
 * PROC-GRN-001 · PLAN-V4 §10.2, frames `110109` / `110101`).
 *
 * No table is ever touched directly — everything goes through withOrg(), so
 * org_id filtering/stamping is automatic and cross-tenant leakage is
 * impossible by construction.
 *
 * THREE RULES THIS FILE KEEPS.
 *
 * 1. Stock level is NEVER a stored counter. `stockLevels()` reads movements
 *    and sums them via `projectStock`; `Goods Value` sums them via
 *    `goodsValue`. Both are projections over the ledger.
 *
 * 2. A document has no totals of its own. `grns` has no `qty` and no `amount`
 *    column (0033), so a note's figures are summed from the movements that
 *    point at it. There is nothing to drift.
 *
 * 3. A PROJECT WAREHOUSE BELONGS TO EXACTLY ONE PROJECT, enforced three ways,
 *    the way project folders are (HANDOFF §3):
 *      · schema — `kind` + a real `project_id` FK, and uniqueness scoped to
 *        the project, so two projects may each own a "Site store" (0033);
 *      · data layer — every write re-checks ownership here, never trusting an
 *        id that arrived from a form;
 *      · reads — a project's warehouses are fetched by `project_id`, never by
 *        name.
 *
 * Client-safe enums/types live in @/lib/inventory-model (this file is
 * server-only). unit_rate / gst_pct are user-entered CONFIG; no amount here is
 * ever produced by an LLM (PLAN §8).
 */
export {
  MOVEMENT_DIRECTIONS,
  DIRECTION_META,
  GRN_STATUSES,
  GRN_STATUS_META,
  WAREHOUSE_KINDS,
  WAREHOUSE_KIND_LABELS,
  type CatalogueItemRef,
  type Grn,
  type GrnStatus,
  type StockLevel,
  type StockMovement,
  type StockNote,
  type Warehouse,
  type WarehouseKind,
  type WarehouseNode,
};

/* ── Warehouses ─────────────────────────────────────────────────────────────── */

const WH_COLS =
  "id, org_id, name, kind, project_id, parent_id, project_label, address, is_active, created_by, created_at";

function toWarehouse(raw: Record<string, unknown>): Warehouse {
  return {
    id: String(raw.id),
    org_id: String(raw.org_id),
    name: String(raw.name ?? ""),
    kind: warehouseKindOf(raw.kind as string | null),
    project_id: (raw.project_id as string | null) ?? null,
    parent_id: (raw.parent_id as string | null) ?? null,
    project_label: (raw.project_label as string | null) ?? null,
    address: (raw.address as string | null) ?? null,
    is_active: raw.is_active !== false,
    created_by: (raw.created_by as string | null) ?? null,
    created_at: String(raw.created_at ?? ""),
  };
}

export async function listWarehouses(
  filter?: boolean | { activeOnly?: boolean; kind?: WarehouseKind; projectId?: string },
): Promise<Warehouse[]> {
  // The old signature was `listWarehouses(activeOnly?: boolean)` and three
  // callers still use it. Both shapes resolve to the same options object.
  const opts =
    typeof filter === "boolean" ? { activeOnly: filter } : (filter ?? {});

  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("warehouses").select(WH_COLS);
  if (opts.activeOnly) q = q.eq("is_active", true);
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toWarehouse);
}

export interface WarehouseInput {
  name: string;
  kind?: WarehouseKind;
  /** Required when `kind` is "project". Ignored otherwise. */
  project_id?: string | null;
  /** A bin inside another warehouse — it inherits that warehouse's scope. */
  parent_id?: string | null;
  address?: string | null;
}

/**
 * Create a warehouse, a project warehouse, or a bin inside either.
 *
 * The half of 0033's invariant that a CHECK constraint cannot carry lives
 * here: a project warehouse must name a project that is in THIS workspace. An
 * id off a form is not evidence of anything until it has been looked up.
 *
 * A bin does not get to choose its own scope — it inherits its parent's kind
 * and project. Letting a bin declare itself a company location inside a
 * project warehouse is exactly the leak the `kind` column exists to close.
 */
export async function createWarehouse(
  input: WarehouseInput,
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Warehouse name is required." };

  const { db, ctx } = await withOrg();

  let kind: WarehouseKind = input.kind ?? "company";
  let projectId = input.project_id?.trim() || null;
  let projectLabel: string | null = null;
  const parentId = input.parent_id?.trim() || null;

  if (parentId) {
    const { data: parent } = await db
      .table("warehouses")
      .select("id, kind, project_id, project_label")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) return { error: "That warehouse is not in this workspace." };
    const p = parent as unknown as Record<string, unknown>;
    kind = warehouseKindOf(p.kind as string | null);
    projectId = (p.project_id as string | null) ?? null;
    projectLabel = (p.project_label as string | null) ?? null;
  } else if (kind === "project") {
    if (!projectId) {
      return { error: "A project warehouse has to name its project." };
    }
    const { data: project } = await db
      .table("projects")
      .select("id, name")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return { error: "That project is not in this workspace." };
    projectLabel = String((project as unknown as { name: string }).name);
  } else {
    // 0033 checks this too; refusing here gives a sentence instead of a
    // constraint-violation string.
    projectId = null;
  }

  const { data, error } = await db.table("warehouses").insert({
    name,
    kind,
    project_id: projectId,
    parent_id: parentId,
    project_label: projectLabel,
    address: input.address?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) {
    // The scoped unique indexes from 0033 speak in constraint names; a person
    // reading the screen needs the sentence.
    if (/uq_warehouses_/.test(error.message)) {
      return {
        error: parentId
          ? "This warehouse already has a location by that name."
          : kind === "project"
            ? "This project already has a warehouse by that name."
            : "A company warehouse by that name already exists.",
      };
    }
    return { error: error.message };
  }
  return { id: (data?.[0] as { id: string }).id };
}

/** Soft-deactivate instead of delete — the ledger references warehouse ids. */
export async function deactivateWarehouse(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("warehouses").updateById(id, {
    is_active: false,
  });
  return error ? { error: error.message } : {};
}

/** `Unarchived ▾` in `110109` is a filter, so archiving has to be reversible. */
export async function reactivateWarehouse(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("warehouses").updateById(id, {
    is_active: true,
  });
  return error ? { error: error.message } : {};
}

/**
 * A warehouse belongs to exactly one project. Never trust an id from a form.
 * Bins are checked through their own `project_id`, which they inherited from
 * the parent at creation.
 */
export async function assertWarehouseBelongsToProject(
  warehouseId: string,
  projectId: string,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data } = await db
    .table("warehouses")
    .select("id, project_id")
    .eq("id", warehouseId)
    .maybeSingle();
  if (!data) return { error: "That warehouse is not in this workspace." };
  if ((data as unknown as { project_id: string | null }).project_id !== projectId) {
    return { error: "That warehouse belongs to a different project." };
  }
  return {};
}

/* ── Stock movements (append-only ledger) ───────────────────────────────────── */

const MV_COLS =
  "id, org_id, item_id, item_name, warehouse_id, direction, qty, uom, unit_rate, gst_pct, hsn_sac, source_doc, note, grn_id, created_by, created_at";

export async function listMovements(filter?: {
  warehouseId?: string;
  itemId?: string;
}): Promise<StockMovement[]> {
  const { db } = await withOrg();
  let q = db.table("stock_movements").select(MV_COLS);
  if (filter?.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
  if (filter?.itemId) q = q.eq("item_id", filter.itemId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StockMovement[];
}

export interface StockInLineInput {
  item_id?: string | null;
  item_name: string;
  uom?: string | null;
  qty: number;
  /** User-entered CONFIG ₹/uom — never produced by an LLM (PLAN §8). */
  unit_rate: number;
  gst_pct?: number | null;
  hsn_sac?: string | null;
}

/**
 * Post a stock movement: ONE document, and one append-only line per item.
 *
 * Before 0033 the document and the lines were unrelated rows, so a GRN number
 * pointed at nothing and Transaction History could not exist. Now the document
 * comes first, takes a number from the tenant's series, and every line carries
 * its id.
 *
 * The number is CONSUMED, not previewed — the receipt exists now, so its
 * number does too. A tenant with no series gets an unnumbered note rather than
 * a refusal, which is the same call `createProjectRequest` makes.
 */
export async function postStockMovement(input: {
  warehouse_id: string;
  direction: NoteDirection;
  vendor_id?: string | null;
  source_doc?: string | null;
  note?: string | null;
  po_id?: string | null;
  /** The payment whose `stock_in_requested` flag this receipt answers. */
  payment_id?: string | null;
  lines: StockInLineInput[];
}): Promise<{ id?: string; number?: string | null; error?: string }> {
  const { db, ctx } = await withOrg();

  if (!input.warehouse_id) return { error: "Warehouse is required." };
  const lines = input.lines.filter((l) => l.item_name.trim());
  if (lines.length === 0) return { error: "At least one line is required." };

  const { data: warehouse } = await db
    .table("warehouses")
    .select("id")
    .eq("id", input.warehouse_id)
    .maybeSingle();
  if (!warehouse) return { error: "That warehouse is not in this workspace." };

  if (input.vendor_id) {
    const { data: vendor } = await db
      .table("vendors")
      .select("id")
      .eq("id", input.vendor_id)
      .maybeSingle();
    if (!vendor) return { error: "That vendor is not in this workspace." };
  }

  const direction = noteDirectionOf(input.direction);
  const number = await issueDocNumber(direction === "in" ? "grn" : "stock_issue");

  const { data: noteRows, error: noteErr } = await db.table("grns").insert({
    po_id: input.po_id || null,
    warehouse_id: input.warehouse_id,
    vendor_id: input.vendor_id || null,
    grn_no: number,
    direction,
    reference: input.source_doc?.trim() || null,
    status: "recorded",
    recorded_by: ctx.userId,
    recorded_at: new Date().toISOString(),
    note: input.note?.trim() || null,
  });
  if (noteErr) return { error: noteErr.message };
  const noteId = (noteRows?.[0] as { id: string }).id;

  // Every row carries the same keys: a PostgREST bulk insert sends an explicit
  // NULL for a key one row omits, which defeats the column default and trips
  // `not null` (HANDOFF §10).
  const rows = lines.map((l) => ({
    item_id: l.item_id || null, // null = unlisted item — flagged for promotion
    item_name: l.item_name.trim(),
    warehouse_id: input.warehouse_id,
    direction: direction === "in" ? ("in" as const) : ("out" as const),
    qty: Number(l.qty) || 0,
    uom: l.uom?.trim() || null,
    unit_rate: Number(l.unit_rate) || 0,
    gst_pct: l.gst_pct == null || Number.isNaN(Number(l.gst_pct)) ? 18 : Number(l.gst_pct),
    hsn_sac: l.hsn_sac?.trim() || null,
    source_doc: input.source_doc?.trim() || null,
    note: input.note?.trim() || null,
    grn_id: noteId,
    created_by: ctx.userId,
  }));

  const { error } = await db.table("stock_movements").insert(rows);
  if (error) {
    // A document with no lines is a number burnt on nothing. Take it back.
    await db.table("grns").deleteById(noteId);
    return { error: error.message };
  }

  if (input.payment_id) {
    // Answering the queue item is part of the same act. If the stamp fails the
    // stock is still real, so the receipt stands and the flag stays raised —
    // a duplicate queue entry is recoverable; a lost receipt is not.
    await db.table("payments").updateById(input.payment_id, {
      stock_in_grn_id: noteId,
    });
  }

  return { id: noteId, number };
}

/**
 * The pre-0033 entry point, kept so `/inventory/stock-in` and any caller that
 * predates the document model keep working. `createGrn` is gone as a choice:
 * a movement always has a document now, because a movement without one is a
 * row Transaction History cannot name.
 */
export async function addStockIn(input: {
  warehouse_id: string;
  vendor_id?: string | null;
  source_doc?: string | null;
  note?: string | null;
  po_id?: string | null;
  payment_id?: string | null;
  lines: StockInLineInput[];
}): Promise<{ error?: string; number?: string | null }> {
  const r = await postStockMovement({ ...input, direction: "in" });
  return r.error ? { error: r.error } : { number: r.number };
}

/**
 * Current stock = SUM of signed movements per item per warehouse — a
 * projection over the append-only ledger, never a stored counter.
 */
export async function stockLevels(warehouseId?: string): Promise<StockLevel[]> {
  const { db } = await withOrg();
  let q = db
    .table("stock_movements")
    .select("item_id, item_name, warehouse_id, direction, qty, uom");
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw error;
  return projectStock((data ?? []) as unknown as Parameters<typeof projectStock>[number]);
}

/* ── GRNs / issue notes ─────────────────────────────────────────────────────── */

const GRN_COLS =
  "id, org_id, po_id, warehouse_id, vendor_id, grn_no, direction, reference, status, recorded_by, recorded_at, note";

export async function listGrns(filter?: {
  status?: GrnStatus;
}): Promise<Grn[]> {
  const { db } = await withOrg();
  let q = db.table("grns").select(GRN_COLS);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Grn[];
}

/* ── The whole Inventory screen, in one read ───────────────────────────────── */

/** A movement that belongs to no document — pre-0033 history, shown as itself. */
export interface UnlinkedMovement {
  id: string;
  item_name: string;
  warehouse_id: string;
  warehouseName: string | null;
  direction: string;
  qty: number;
  amount: number;
  created_at: string;
  recordedByName: string | null;
}

/** One flagged expense waiting for its goods (`Expense StockIn`, §9.4 → §10.2). */
export interface ExpenseStockInRow {
  id: string;
  project_id: string | null;
  projectName: string | null;
  vendor_id: string | null;
  vendorName: string | null;
  amount: number;
  paid_on: string | null;
  category: string | null;
  reference: string | null;
  note: string | null;
  /** The receipt that answered it, if one has been recorded. */
  stock_in_grn_id: string | null;
  grnNumber: string | null;
}

/**
 * One PO delivery waiting to be booked into stock (`Deliveries StockIn`).
 *
 * This is the join the two modules were missing: procurement records that
 * goods ARRIVED (`po_receipts`, §9.7); inventory records that they were PUT
 * SOMEWHERE. Those are different events and a real site gets them hours or
 * days apart, so the gap between them is a queue and not a bug.
 */
export interface DeliveryStockInRow {
  id: string;
  po_id: string;
  orderName: string | null;
  vendorName: string | null;
  project_id: string | null;
  projectName: string | null;
  received_on: string | null;
  note: string | null;
  /** Stock notes already recorded against this order, newest first. */
  noteNumbers: string[];
}

export interface InventoryData {
  company: WarehouseNode[];
  projects: WarehouseNode[];
  /** Warehouses flagged `project` whose project row has since gone. */
  orphaned: WarehouseNode[];
  notes: StockNote[];
  unlinked: UnlinkedMovement[];
  deliveries: DeliveryStockInRow[];
  expenseQueue: ExpenseStockInRow[];
  levels: StockLevel[];
  warehouseNames: Record<string, string>;
  projectOptions: { id: string; name: string }[];
  vendorOptions: { id: string; name: string }[];
  members: Member[];
  archivedCount: number;
}

/**
 * Everything the Inventory screen shows, from one pass over the ledger.
 *
 * `includeArchived` is the `Unarchived ▾` filter in `110109`. Archived
 * warehouses are excluded by default and COUNTED either way, so the filter can
 * say how much it is hiding rather than silently shrinking the list.
 */
export async function getInventory(
  includeArchived = false,
): Promise<InventoryData> {
  const { db } = await withOrg();

  const [whRes, mvRes, noteRes, payRes, projRes, vendorRes, poRes, receiptRes, members] =
    await Promise.all([
      db.table("warehouses").select(WH_COLS).order("name", { ascending: true }),
      db
        .table("stock_movements")
        .select(
          "id, item_id, item_name, warehouse_id, direction, qty, uom, unit_rate, grn_id, created_by, created_at",
        )
        .order("created_at", { ascending: false }),
      db.table("grns").select(GRN_COLS).order("recorded_at", { ascending: false }),
      db
        .table("payments")
        .select(
          "id, project_id, project_label, vendor_id, amount, paid_on, category, reference, note, stock_in_requested, stock_in_grn_id",
        )
        .eq("stock_in_requested", true)
        .order("paid_on", { ascending: false }),
      db.table("projects").select("id, name").order("name", { ascending: true }),
      db.table("vendors").select("id, name").order("name", { ascending: true }),
      db
        .table("purchase_orders")
        .select("id, name, vendor_id, project_id, project_label"),
      db
        .table("po_receipts")
        // `received_at`, not `received_on` (0013). Naming a column that does
        // not exist makes PostgREST error and empties the WHOLE read with no
        // sign on the screen — the mistake HANDOFF §10 records.
        .select("id, po_id, received_at, note")
        .order("received_at", { ascending: false }),
      listMembers(),
    ]);
  if (whRes.error) throw whRes.error;
  if (mvRes.error) throw mvRes.error;

  const allWarehouses = ((whRes.data ?? []) as unknown as Record<string, unknown>[]).map(
    toWarehouse,
  );
  const archivedCount = allWarehouses.filter((w) => !w.is_active).length;
  const warehouses = includeArchived
    ? allWarehouses
    : allWarehouses.filter((w) => w.is_active);

  const warehouseNames: Record<string, string> = {};
  for (const w of allWarehouses) warehouseNames[w.id] = w.name;

  const movements = (mvRes.data ?? []) as unknown as Record<string, unknown>[];

  // The ledger, bucketed by warehouse — the input to every figure in `110109`.
  const linesByWarehouse = new Map<string, LedgerLine[]>();
  const linesByNote = new Map<string, LedgerLine[]>();
  for (const m of movements) {
    const line: LedgerLine = {
      warehouse_id: String(m.warehouse_id),
      direction: String(m.direction ?? "in"),
      qty: Number(m.qty ?? 0),
      unit_rate: Number(m.unit_rate ?? 0),
      created_at: String(m.created_at ?? ""),
    };
    const wh = linesByWarehouse.get(line.warehouse_id) ?? [];
    wh.push(line);
    linesByWarehouse.set(line.warehouse_id, wh);

    if (m.grn_id) {
      const key = String(m.grn_id);
      const list = linesByNote.get(key) ?? [];
      list.push(line);
      linesByNote.set(key, list);
    }
  }

  const projectIds = new Set(
    ((projRes.data ?? []) as unknown as { id: string }[]).map((p) => String(p.id)),
  );
  const projectName = new Map(
    ((projRes.data ?? []) as unknown as { id: string; name: string }[]).map((p) => [
      String(p.id),
      String(p.name ?? ""),
    ]),
  );
  const vendorName = new Map(
    ((vendorRes.data ?? []) as unknown as { id: string; name: string }[]).map((v) => [
      String(v.id),
      String(v.name ?? ""),
    ]),
  );
  const memberName = new Map(members.map((m) => [m.user_id ?? m.id, m.name]));

  // A project warehouse whose project has gone is NOT re-labelled a company
  // warehouse — that would quietly move stock between two ledgers a person
  // reads separately. It gets its own list and says what happened.
  const companySrc = warehouses.filter((w) => w.kind === "company");
  const projectSrc = warehouses.filter(
    (w) => w.kind === "project" && w.project_id && projectIds.has(w.project_id),
  );
  const orphanSrc = warehouses.filter(
    (w) => w.kind === "project" && (!w.project_id || !projectIds.has(w.project_id)),
  );

  const notes: StockNote[] = (
    (noteRes.data ?? []) as unknown as Record<string, unknown>[]
  ).map((n) => {
    const lines = linesByNote.get(String(n.id)) ?? [];
    return {
      id: String(n.id),
      number: (n.grn_no as string | null) ?? null,
      direction: noteDirectionOf(n.direction as string | null),
      status: String(n.status ?? "recorded") as GrnStatus,
      warehouse_id: String(n.warehouse_id),
      warehouseName: warehouseNames[String(n.warehouse_id)] ?? null,
      vendor_id: (n.vendor_id as string | null) ?? null,
      vendorName: n.vendor_id ? (vendorName.get(String(n.vendor_id)) ?? null) : null,
      po_id: (n.po_id as string | null) ?? null,
      reference: (n.reference as string | null) ?? null,
      note: (n.note as string | null) ?? null,
      recorded_at: (n.recorded_at as string | null) ?? null,
      recordedByName: n.recorded_by
        ? (memberName.get(String(n.recorded_by)) ?? null)
        : null,
      lineCount: lines.length,
      qty: movedQty(lines),
      amount: movedAmount(lines),
    };
  });

  const unlinked: UnlinkedMovement[] = movements
    .filter((m) => !m.grn_id)
    .map((m) => ({
      id: String(m.id),
      item_name: String(m.item_name ?? ""),
      warehouse_id: String(m.warehouse_id),
      warehouseName: warehouseNames[String(m.warehouse_id)] ?? null,
      direction: String(m.direction ?? "in"),
      qty: Number(m.qty ?? 0),
      amount: movedAmount([
        {
          warehouse_id: String(m.warehouse_id),
          direction: String(m.direction ?? "in"),
          qty: Number(m.qty ?? 0),
          unit_rate: Number(m.unit_rate ?? 0),
          created_at: String(m.created_at ?? ""),
        },
      ]),
      created_at: String(m.created_at ?? ""),
      recordedByName: m.created_by
        ? (memberName.get(String(m.created_by)) ?? null)
        : null,
    }));

  /* `Deliveries StockIn` — what procurement says arrived, against what
     inventory says was put away. */
  const notesByPo = new Map<string, string[]>();
  for (const n of notes) {
    if (!n.po_id) continue;
    const list = notesByPo.get(n.po_id) ?? [];
    // An unnumbered note still counts as an answer; it just cannot be cited.
    list.push(n.number ?? "Unnumbered note");
    notesByPo.set(n.po_id, list);
  }

  const orderById = new Map(
    ((poRes.data ?? []) as unknown as Record<string, unknown>[]).map((o) => [
      String(o.id),
      o,
    ]),
  );

  const deliveries: DeliveryStockInRow[] = (
    (receiptRes.data ?? []) as unknown as Record<string, unknown>[]
  ).map((rc) => {
    const po = orderById.get(String(rc.po_id));
    const pid = (po?.project_id as string | null) ?? null;
    return {
      id: String(rc.id),
      po_id: String(rc.po_id),
      orderName: (po?.name as string | null) ?? null,
      vendorName: po?.vendor_id
        ? (vendorName.get(String(po.vendor_id)) ?? null)
        : null,
      project_id: pid,
      projectName:
        (pid ? (projectName.get(pid) ?? null) : null) ??
        ((po?.project_label as string | null) ?? null),
      received_on: (rc.received_at as string | null) ?? null,
      note: (rc.note as string | null) ?? null,
      noteNumbers: notesByPo.get(String(rc.po_id)) ?? [],
    };
  });

  const noteNumber = new Map(notes.map((n) => [n.id, n.number]));
  const expenseQueue: ExpenseStockInRow[] = (
    (payRes.data ?? []) as unknown as Record<string, unknown>[]
  ).map((p) => {
    const pid = (p.project_id as string | null) ?? null;
    return {
      id: String(p.id),
      project_id: pid,
      // The FK first; the legacy label only as a display fallback (0028).
      projectName:
        (pid ? (projectName.get(pid) ?? null) : null) ??
        ((p.project_label as string | null) ?? null),
      vendor_id: (p.vendor_id as string | null) ?? null,
      vendorName: p.vendor_id ? (vendorName.get(String(p.vendor_id)) ?? null) : null,
      amount: Number(p.amount ?? 0),
      paid_on: (p.paid_on as string | null) ?? null,
      category: (p.category as string | null) ?? null,
      reference: (p.reference as string | null) ?? null,
      note: (p.note as string | null) ?? null,
      stock_in_grn_id: (p.stock_in_grn_id as string | null) ?? null,
      grnNumber: p.stock_in_grn_id
        ? (noteNumber.get(String(p.stock_in_grn_id)) ?? null)
        : null,
    };
  });

  return {
    company: buildWarehouseTree(companySrc, linesByWarehouse),
    projects: buildWarehouseTree(projectSrc, linesByWarehouse),
    orphaned: buildWarehouseTree(orphanSrc, linesByWarehouse),
    notes,
    unlinked,
    deliveries,
    expenseQueue,
    levels: projectStock(
      movements as unknown as Parameters<typeof projectStock>[number],
    ),
    warehouseNames,
    projectOptions: ((projRes.data ?? []) as unknown as { id: string; name: string }[]).map(
      (p) => ({ id: String(p.id), name: String(p.name ?? "") }),
    ),
    vendorOptions: ((vendorRes.data ?? []) as unknown as { id: string; name: string }[]).map(
      (v) => ({ id: String(v.id), name: String(v.name ?? "") }),
    ),
    members,
    archivedCount,
  };
}

/* ── One project's stock (the project procurement Inventory tab) ──────────── */

export interface ProjectInventory {
  warehouses: WarehouseNode[];
  levels: StockLevel[];
  notes: StockNote[];
  warehouseNames: Record<string, string>;
}

/**
 * A project's own stock — its site stores and what is in them.
 *
 * Scoped by `project_id`, never by name, and the levels are computed from the
 * movements in THOSE warehouses only. A project's stock is not shared with
 * another project, and this read cannot accidentally show it: the warehouse
 * ids come from the project first, and the ledger is filtered to them.
 *
 * Company warehouses are deliberately absent. A godown every project draws
 * from is not this project's stock, and counting it here would let two
 * projects each claim the same sheet of plywood.
 */
export async function getProjectInventory(
  projectId: string,
): Promise<ProjectInventory> {
  const { db } = await withOrg();

  const warehouses = await listWarehouses({ projectId });
  const ids = warehouses.map((w) => w.id);
  const warehouseNames: Record<string, string> = {};
  for (const w of warehouses) warehouseNames[w.id] = w.name;

  if (ids.length === 0) {
    return { warehouses: [], levels: [], notes: [], warehouseNames };
  }

  const [mvRes, noteRes, members] = await Promise.all([
    db
      .table("stock_movements")
      .select(
        "id, item_id, item_name, warehouse_id, direction, qty, uom, unit_rate, grn_id, created_at",
      )
      .in("warehouse_id", ids)
      .order("created_at", { ascending: false }),
    db.table("grns").select(GRN_COLS).in("warehouse_id", ids),
    listMembers(),
  ]);
  if (mvRes.error) throw mvRes.error;

  const movements = (mvRes.data ?? []) as unknown as Record<string, unknown>[];
  const memberName = new Map(members.map((m) => [m.user_id ?? m.id, m.name]));

  const linesByWarehouse = new Map<string, LedgerLine[]>();
  const linesByNote = new Map<string, LedgerLine[]>();
  for (const m of movements) {
    const l: LedgerLine = {
      warehouse_id: String(m.warehouse_id),
      direction: String(m.direction ?? "in"),
      qty: Number(m.qty ?? 0),
      unit_rate: Number(m.unit_rate ?? 0),
      created_at: String(m.created_at ?? ""),
    };
    const wh = linesByWarehouse.get(l.warehouse_id) ?? [];
    wh.push(l);
    linesByWarehouse.set(l.warehouse_id, wh);
    if (m.grn_id) {
      const key = String(m.grn_id);
      const list = linesByNote.get(key) ?? [];
      list.push(l);
      linesByNote.set(key, list);
    }
  }

  const notes: StockNote[] = (
    (noteRes.data ?? []) as unknown as Record<string, unknown>[]
  ).map((n) => {
    const lines = linesByNote.get(String(n.id)) ?? [];
    return {
      id: String(n.id),
      number: (n.grn_no as string | null) ?? null,
      direction: noteDirectionOf(n.direction as string | null),
      status: String(n.status ?? "recorded") as GrnStatus,
      warehouse_id: String(n.warehouse_id),
      warehouseName: warehouseNames[String(n.warehouse_id)] ?? null,
      vendor_id: (n.vendor_id as string | null) ?? null,
      vendorName: null,
      po_id: (n.po_id as string | null) ?? null,
      reference: (n.reference as string | null) ?? null,
      note: (n.note as string | null) ?? null,
      recorded_at: (n.recorded_at as string | null) ?? null,
      recordedByName: n.recorded_by
        ? (memberName.get(String(n.recorded_by)) ?? null)
        : null,
      lineCount: lines.length,
      qty: movedQty(lines),
      amount: movedAmount(lines),
    };
  });

  return {
    warehouses: buildWarehouseTree(warehouses, linesByWarehouse),
    levels: projectStock(
      movements as unknown as Parameters<typeof projectStock>[number],
    ),
    notes: notes.sort((a, b) =>
      String(b.recorded_at ?? "").localeCompare(String(a.recorded_at ?? "")),
    ),
    warehouseNames,
  };
}

/* ── Catalogue autocomplete for the stock-in grid ──────────────────────────── */

/**
 * Catalogue autocomplete — reads the Item master through withOrg (`items` is
 * on the tenant allowlist), active items matched by name (ilike), slim shape
 * with the GST/HSN/rate defaults a stock-in line pre-fills from. Same shape
 * of query as the procurement module's searchCatalogueItems.
 */
export async function searchCatalogueItems(query: string): Promise<CatalogueItemRef[]> {
  const term = query.trim();
  if (!term) return [];
  const { db } = await withOrg();
  const like = `%${term}%`;
  const { data, error } = await db
    .table("items")
    .select("id, name, base_uom, base_rate, tax_rate, hsn_sac")
    .eq("is_active", true)
    .ilike("name", like)
    .order("name", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as CatalogueItemRef[];
}
