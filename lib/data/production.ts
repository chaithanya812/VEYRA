import "server-only";
import { withOrg } from "./with-org";
import type {
  Bom,
  BomLine,
  Cutlist,
  CutlistPanel,
  Grain,
} from "@/lib/production-model";
import { effectiveQty } from "@/lib/production-model";

/**
 * The display label for a chosen project. `project_id` is the link (0028);
 * `project_label` survives only as a fallback for pre-0028 rows (PLAN-V4 §7.3),
 * so it is DERIVED from the project here and never typed by a user.
 */
async function labelForProject(
  db: Awaited<ReturnType<typeof withOrg>>["db"],
  projectId: string | null | undefined,
): Promise<string | null> {
  if (!projectId) return null;
  const { data } = await db
    .table("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}


/**
 * Production data module (FEATURE-REGISTER OPS-PROD-001) — BOM explosion and
 * the panel-wise Cutlist with grain direction + edge-banding, the factory
 * moat. Follows the Site reference pattern exactly: no table is touched
 * directly, everything goes through withOrg() so org_id filtering / stamping
 * is automatic and cross-tenant leakage is impossible by construction.
 *
 * Dimensions/quantities are CONFIG the user enters (metric — mm, sqm). The
 * server recomputes effective_qty via effectiveQty() and NEVER trusts a client
 * value for it. There is NO pricing in this slice (HARD RULE 2); every number
 * here is deterministic arithmetic in lib/production-model.ts.
 */
export type { Bom, BomLine, Cutlist, CutlistPanel };

/* ── Bills of materials ────────────────────────────────────────────────────── */

export async function listBoms(projectId?: string): Promise<Bom[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("boms").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Bom[];
}

export interface BomWithLines {
  bom: Bom;
  lines: BomLine[];
}

export async function getBom(id: string): Promise<BomWithLines | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("boms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const bom = data as unknown as Bom;

  const { data: linesData, error: linesError } = await db
    .table("bom_lines")
    .select("*")
    .eq("bom_id", id)
    .order("created_at", { ascending: true });
  if (linesError) throw linesError;

  return { bom, lines: (linesData ?? []) as unknown as BomLine[] };
}

export async function addBom(input: {
  project_id?: string | null;
  title: string;
  source_ref?: string | null;
  notes?: string | null;
  status?: string | null;
  lines?: {
    material_name: string;
    uom?: string | null;
    qty: number;
    waste_pct?: number | null;
    notes?: string | null;
  }[];
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const { data, error } = await db.table("boms").insert({
    project_id: input.project_id ?? null,
    project_label: await labelForProject(db, input.project_id),
    title: input.title.trim(),
    source_ref: input.source_ref?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  const lines = (input.lines ?? []).filter((l) => l.material_name?.trim());
  if (lines.length > 0) {
    // Server recomputes effective_qty — never trusts a client value for it.
    const { error: lineError } = await db.table("bom_lines").insert(
      lines.map((l) => {
        const qty = Number(l.qty);
        const wastePct = Number(l.waste_pct ?? 0);
        return {
          bom_id: id,
          material_name: l.material_name.trim(),
          uom: l.uom?.trim() || null,
          qty: Number.isFinite(qty) ? qty : 0,
          waste_pct: Number.isFinite(wastePct) ? wastePct : 0,
          effective_qty: effectiveQty(qty, wastePct),
          notes: l.notes?.trim() || null,
        };
      }),
    );
    if (lineError) return { error: lineError.message };
  }
  return { id };
}

/* ── Cutlists ──────────────────────────────────────────────────────────────── */

export async function listCutlists(
  projectId?: string,
): Promise<Cutlist[]> {
  const { db } = await withOrg();
  let q = db.table("cutlists").select("*");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Cutlist[];
}

export interface CutlistWithPanels {
  cutlist: Cutlist;
  panels: CutlistPanel[];
}

export async function getCutlist(
  id: string,
): Promise<CutlistWithPanels | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("cutlists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const cutlist = data as unknown as Cutlist;

  const { data: panelsData, error: panelsError } = await db
    .table("cutlist_panels")
    .select("*")
    .eq("cutlist_id", id)
    .order("created_at", { ascending: true });
  if (panelsError) throw panelsError;

  return { cutlist, panels: (panelsData ?? []) as unknown as CutlistPanel[] };
}

const GRAINS: Grain[] = ["length", "width", "none"];

function safeGrain(raw: unknown): Grain {
  return GRAINS.includes(raw as Grain) ? (raw as Grain) : "none";
}

function safeBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function safeMm(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function safeCount(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export async function addCutlist(input: {
  bom_id?: string | null;
  project_id?: string | null;
  title: string;
  board_material?: string | null;
  board_length_mm?: number | null;
  board_width_mm?: number | null;
  notes?: string | null;
  status?: string | null;
  panels?: {
    panel_name: string;
    room_label?: string | null;
    length_mm: number;
    width_mm: number;
    qty?: number | null;
    grain?: string | null;
    material?: string | null;
    edge_l1?: boolean | null;
    edge_l2?: boolean | null;
    edge_w1?: boolean | null;
    edge_w2?: boolean | null;
    notes?: string | null;
  }[];
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const boardLength = Number(input.board_length_mm);
  const boardWidth = Number(input.board_width_mm);

  const { data, error } = await db.table("cutlists").insert({
    bom_id: input.bom_id?.trim() || null,
    project_id: input.project_id ?? null,
    project_label: await labelForProject(db, input.project_id),
    title: input.title.trim(),
    board_material: input.board_material?.trim() || null,
    board_length_mm:
      input.board_length_mm != null && Number.isFinite(boardLength)
        ? boardLength
        : null,
    board_width_mm:
      input.board_width_mm != null && Number.isFinite(boardWidth)
        ? boardWidth
        : null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  const panels = (input.panels ?? []).filter((p) => p.panel_name?.trim());
  if (panels.length > 0) {
    // Server is the source of truth: dimensions/qty coerced + guarded here,
    // never taken on faith from the client.
    const { error: panelError } = await db.table("cutlist_panels").insert(
      panels.map((p) => ({
        cutlist_id: id,
        panel_name: p.panel_name.trim(),
        room_label: p.room_label?.trim() || null,
        length_mm: safeMm(p.length_mm),
        width_mm: safeMm(p.width_mm),
        qty: safeCount(p.qty ?? 1),
        grain: safeGrain(p.grain),
        material: p.material?.trim() || null,
        edge_l1: safeBool(p.edge_l1),
        edge_l2: safeBool(p.edge_l2),
        edge_w1: safeBool(p.edge_w1),
        edge_w2: safeBool(p.edge_w2),
        notes: p.notes?.trim() || null,
      })),
    );
    if (panelError) return { error: panelError.message };
  }
  return { id };
}
