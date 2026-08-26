import "server-only";
import { randomUUID } from "node:crypto";
import { withOrg } from "./with-org";
import type {
  NestingPlacement,
  NestingRun,
  PanelEvent,
  PanelStage,
  PanelTag,
  WorkCenter,
} from "@/lib/production-nesting-model";
import { nestPanels, nextStage } from "@/lib/production-nesting-model";
import type { Cutlist, CutlistPanel } from "@/lib/production-model";

/**
 * Production nesting + traceability data module (FEATURE-REGISTER OPS-PROD-001,
 * Wave 5b) — sheet nesting, panel-QR traceability and work centers. Follows the
 * production.ts pattern exactly: no table is touched directly, everything goes
 * through withOrg() so org_id filtering / stamping is automatic and
 * cross-tenant leakage is impossible by construction.
 *
 * The SERVER recomputes every nested figure: computeAndSaveNesting() loads the
 * cutlist's panels via withOrg, runs the pure deterministic nestPanels(), and
 * stores the result — it never trusts a client-supplied boards/waste number
 * (HARD RULE 2). No pricing anywhere in this slice.
 */
export type {
  Cutlist,
  NestingPlacement,
  NestingRun,
  PanelEvent,
  PanelTag,
  WorkCenter,
};

function safeMm(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function safeKerf(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function safeCount(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

/* ── Nesting runs ──────────────────────────────────────────────────────────── */

export async function listNestingRuns(): Promise<NestingRun[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("nesting_runs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as NestingRun[];
}

export interface NestingRunWithPlacements {
  run: NestingRun;
  placements: NestingPlacement[];
}

export async function getNestingRun(
  id: string,
): Promise<NestingRunWithPlacements | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("nesting_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const run = data as unknown as NestingRun;

  const { data: placementsData, error: placementsError } = await db
    .table("nesting_placements")
    .select("*")
    .eq("nesting_run_id", id)
    .order("created_at", { ascending: true });
  if (placementsError) throw placementsError;

  return {
    run,
    placements: (placementsData ?? []) as unknown as NestingPlacement[],
  };
}

export interface ComputeNestingInput {
  cutlist_id: string;
  board_length_mm: number;
  board_width_mm: number;
  kerf_mm?: number | null;
}

/**
 * Load a cutlist's panels via withOrg, run the pure deterministic nestPanels()
 * and persist the run + placements. Every stored number is recomputed
 * server-side — never taken from the client.
 */
export async function computeAndSaveNesting(
  input: ComputeNestingInput,
): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const cutlistId = input.cutlist_id?.trim();
  if (!cutlistId) return { error: "Pick a cutlist to nest." };

  const boardLength = safeMm(input.board_length_mm);
  const boardWidth = safeMm(input.board_width_mm);
  if (boardLength <= 0 || boardWidth <= 0) {
    return { error: "Board length and width must be positive millimetres." };
  }
  const kerf = safeKerf(input.kerf_mm ?? 0);

  const { data: panelsData, error: panelsError } = await db
    .table("cutlist_panels")
    .select("*")
    .eq("cutlist_id", cutlistId)
    .order("created_at", { ascending: true });
  if (panelsError) return { error: panelsError.message };
  const panels = (panelsData ?? []) as unknown as CutlistPanel[];
  if (panels.length === 0) {
    return { error: "That cutlist has no panels to nest." };
  }

  // Deterministic geometry — same input, same layout, every time.
  const result = nestPanels(
    panels.map((p) => ({
      name: p.panel_name,
      w_mm: safeMm(p.length_mm),
      h_mm: safeMm(p.width_mm),
      qty: safeCount(p.qty),
    })),
    { length_mm: boardLength, width_mm: boardWidth },
    kerf,
  );

  if (result.placements.length === 0) {
    return {
      error:
        result.skipped.length > 0
          ? "No panel fits that board size — nothing to nest."
          : "That cutlist has no placeable panels.",
    };
  }

  const { data, error } = await db.table("nesting_runs").insert({
    cutlist_id: cutlistId,
    board_length_mm: boardLength,
    board_width_mm: boardWidth,
    kerf_mm: kerf,
    boards_used: result.boardsUsed,
    total_panel_area_sqm: result.totalPanelAreaSqm,
    board_area_sqm: result.boardAreaSqm,
    waste_pct: result.wastePct,
    status: "computed",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  const id = (data?.[0] as { id: string }).id;

  const { error: placeError } = await db.table("nesting_placements").insert(
    result.placements.map((p) => ({
      nesting_run_id: id,
      panel_name: p.panel_name,
      board_index: p.board_index,
      x_mm: p.x_mm,
      y_mm: p.y_mm,
      w_mm: p.w_mm,
      h_mm: p.h_mm,
      rotated: p.rotated,
    })),
  );
  if (placeError) return { error: placeError.message };

  return { id };
}

/* ── Panel tags + traceability ─────────────────────────────────────────────── */

/** All tags for the org, optionally narrowed to one cutlist's panels. */
export async function listPanelTags(cutlistId?: string): Promise<PanelTag[]> {
  const { db } = await withOrg();
  let q = db.table("panel_tags").select("*");
  if (cutlistId) {
    const { data: panelIdsData, error: idsError } = await db
      .table("cutlist_panels")
      .select("id")
      .eq("cutlist_id", cutlistId);
    if (idsError) throw idsError;
    const ids = ((panelIdsData ?? []) as unknown as { id: string }[]).map(
      (r) => r.id,
    );
    if (ids.length === 0) return [];
    q = q.in("cutlist_panel_id", ids);
  }
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PanelTag[];
}

/**
 * One tag per PHYSICAL panel (a qty-3 row becomes three tags), each with a
 * unique short QR token unique per org. Regenerating for a cutlist that
 * already has tags is refused so physical panels are never double-labelled.
 */
export async function generatePanelTags(
  cutlistId: string,
): Promise<{ count: number } | { error: string }> {
  const { db } = await withOrg();

  const id = cutlistId?.trim();
  if (!id) return { error: "Pick a cutlist to tag." };

  const { data: panelsData, error: panelsError } = await db
    .table("cutlist_panels")
    .select("*")
    .eq("cutlist_id", id)
    .order("created_at", { ascending: true });
  if (panelsError) return { error: panelsError.message };
  const panels = (panelsData ?? []) as unknown as CutlistPanel[];
  if (panels.length === 0) {
    return { error: "That cutlist has no panels to tag." };
  }

  const { data: existing, error: existingError } = await db
    .table("panel_tags")
    .select("id")
    .in(
      "cutlist_panel_id",
      panels.map((p) => p.id),
    );
  if (existingError) return { error: existingError.message };
  if ((existing ?? []).length > 0) {
    return { error: "Tags already generated for that cutlist." };
  }

  const rows = panels.flatMap((p) => {
    const qty = Math.max(1, safeCount(p.qty) || 1);
    return Array.from({ length: qty }, () => ({
      cutlist_panel_id: p.id,
      panel_name: p.panel_name,
      token: randomUUID().slice(0, 8),
      stage: "cut" as PanelStage,
    }));
  });

  const { error: insertError } = await db.table("panel_tags").insert(rows);
  if (insertError) return { error: insertError.message };
  return { count: rows.length };
}

/**
 * Append a panel_event at the tag's NEXT stage and move the tag there.
 * The event records the stage achieved; `installed` is terminal.
 */
export async function advancePanel(
  tagId: string,
  note?: string | null,
): Promise<{ stage: PanelStage } | { error: string }> {
  const { db, ctx } = await withOrg();

  const id = tagId?.trim();
  if (!id) return { error: "Missing panel tag." };

  const { data, error } = await db
    .table("panel_tags")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  const tag = data as unknown as PanelTag | null;
  if (!tag) return { error: "Panel tag not found." };

  const stage = nextStage(tag.stage);
  if (!stage) {
    return { error: "Panel is already installed — no further stage." };
  }

  const { error: evError } = await db.table("panel_events").insert({
    panel_tag_id: id,
    stage,
    note: note?.trim() || null,
    created_by: ctx.userId,
  });
  if (evError) return { error: evError.message };

  const { error: updateError } = await db
    .table("panel_tags")
    .updateById(id, { stage });
  if (updateError) return { error: updateError.message };

  return { stage };
}

/** Append-only timeline of one panel's stage transitions, oldest first. */
export async function getPanelTimeline(tagId: string): Promise<PanelEvent[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("panel_events")
    .select("*")
    .eq("panel_tag_id", tagId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PanelEvent[];
}

/* ── Work centers ──────────────────────────────────────────────────────────── */

export async function listWorkCenters(): Promise<WorkCenter[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("work_centers")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as WorkCenter[];
}

export async function addWorkCenter(input: {
  name: string;
  kind?: string | null;
  capacity_per_day?: number | null;
  notes?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();

  const name = input.name?.trim();
  if (!name) return { error: "Work center name is required." };

  const capacityRaw = Number(input.capacity_per_day);
  const capacity =
    input.capacity_per_day != null &&
    Number.isFinite(capacityRaw) &&
    capacityRaw > 0
      ? Math.floor(capacityRaw)
      : null;

  const { data, error } = await db.table("work_centers").insert({
    name,
    kind: input.kind?.trim() || null,
    capacity_per_day: capacity,
    notes: input.notes?.trim() || null,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}
