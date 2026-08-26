/**
 * Client-safe production nesting + traceability model (Wave 5b) — types and
 * PURE helpers with NO server-only import, mirroring production-model.ts so
 * client components (the nesting form's live preview) and the server data
 * module (lib/data/production-nesting.ts) share the SAME math: what the
 * supervisor previews while picking a board size is exactly what gets stored.
 *
 * nestPanels is deterministic geometry — a shelf / first-fit-decreasing-height
 * 2D bin-packing of rectangular panels onto identical boards. The same input
 * ALWAYS yields byte-identical output, and wastage is pure arithmetic
 * (wastePct = 1 − panel area / used board area). No LLM ever produces a number
 * here (HARD RULE 2), and there is NO pricing in this slice at all.
 *
 * Units are metric: mm for panel/board dimensions and saw kerf, sqm for areas.
 */

import { round2, round3 } from "./production-model";

/* ── Row types matching migration 0021 columns ─────────────────────────────── */

export interface NestingRun {
  id: string;
  org_id: string;
  cutlist_id: string;
  board_length_mm: number;
  board_width_mm: number;
  kerf_mm: number;
  boards_used: number;
  total_panel_area_sqm: number;
  board_area_sqm: number;
  waste_pct: number;
  status: string;
  created_by: string | null;
  created_at: string;
}

export interface NestingPlacement {
  id: string;
  org_id: string;
  nesting_run_id: string;
  panel_name: string;
  board_index: number;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotated: boolean;
  created_at: string;
}

export type PanelStage =
  | "cut"
  | "edgebanded"
  | "drilled"
  | "qc"
  | "packed"
  | "dispatched"
  | "installed";

export const PANEL_STAGES = [
  "cut",
  "edgebanded",
  "drilled",
  "qc",
  "packed",
  "dispatched",
  "installed",
] as const;

export interface PanelTag {
  id: string;
  org_id: string;
  cutlist_panel_id: string | null;
  panel_name: string;
  token: string;
  stage: PanelStage;
  created_at: string;
}

export interface PanelEvent {
  id: string;
  org_id: string;
  panel_tag_id: string;
  stage: PanelStage;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WorkCenter {
  id: string;
  org_id: string;
  name: string;
  kind: string | null;
  capacity_per_day: number | null;
  notes: string | null;
  created_at: string;
}

/* ── Stage chain ───────────────────────────────────────────────────────────── */

/** Index of the stage in PANEL_STAGES; −1 when unknown. */
export function stageIndex(stage: string): number {
  return (PANEL_STAGES as readonly string[]).indexOf(stage);
}

/** The following stage, or null at `installed` (terminal) / unknown input. */
export function nextStage(stage: string): PanelStage | null {
  const i = stageIndex(stage);
  if (i < 0 || i >= PANEL_STAGES.length - 1) return null;
  return PANEL_STAGES[i + 1];
}

export type StageTone = "neutral" | "warning" | "success";

/**
 * Stage chip tone: installed=success (green), qc=warning (amber), else neutral.
 * NEVER red — the timeline is progress, not an alarm (§Design red discipline).
 */
export function panelStageTone(stage: string): StageTone {
  if (stage === "installed") return "success";
  if (stage === "qc") return "warning";
  return "neutral";
}

/* ── Nesting math ──────────────────────────────────────────────────────────── */

export interface NestPanelInput {
  name: string;
  w_mm: number;
  h_mm: number;
  qty: number;
}

export interface NestBoardInput {
  length_mm: number;
  width_mm: number;
}

/** A placement draft — NestingPlacement minus server-stamped columns. */
export interface NestingPlacementDraft {
  panel_name: string;
  board_index: number;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotated: boolean;
}

export interface NestResult {
  placements: NestingPlacementDraft[];
  boardsUsed: number;
  totalPanelAreaSqm: number;
  boardAreaSqm: number;
  wastePct: number;
  /** Names of panels that cannot fit the board in either orientation. */
  skipped: string[];
}

interface Rect {
  name: string;
  w: number;
  h: number;
}

/** One horizontal band on a board; panels stack left→right inside it. */
interface Shelf {
  y: number;
  height: number;
  xCursor: number;
}

interface WorkBoard {
  shelves: Shelf[];
  yCursor: number;
}

const ORIENTS = [false, true] as const;

/** Coerce to a positive finite mm value; anything else → 0 (never NaN). */
function positiveMm(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Coerce kerf: non-finite or negative → 0. */
function kerfMm(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * Deterministic shelf nesting (first-fit-decreasing-height):
 *
 *  1. Expand qty into individual rectangles; drop (and report) any panel with
 *     a non-positive dimension or one too big for the board in EITHER
 *     orientation — oversized input is skipped, never a crash.
 *  2. Sort by height desc (tie: width desc, then name by code-unit order).
 *  3. Place each rectangle into the first existing shelf where it fits,
 *     choosing the orientation with the tightest leftover width (unrotated on
 *     ties); kerf separates placements inside a shelf and shelves on a board.
 *  4. Otherwise open a new shelf on the first board with vertical room,
 *     oriented to maximise copies across the board length (ties → thinner
 *     shelf, then unrotated).
 *  5. Otherwise open a fresh identical board.
 *
 * Pure + deterministic: same input → identical output, every time.
 */
export function nestPanels(
  panels: NestPanelInput[],
  board: NestBoardInput,
  kerf: number,
): NestResult {
  const L = positiveMm(board?.length_mm);
  const W = positiveMm(board?.width_mm);
  const k = kerfMm(kerf);

  if (L <= 0 || W <= 0) {
    return {
      placements: [],
      boardsUsed: 0,
      totalPanelAreaSqm: 0,
      boardAreaSqm: 0,
      wastePct: 0,
      skipped: [],
    };
  }

  // Expand qty into physical panels; collect skippable rows first.
  const rects: Rect[] = [];
  const skipped: string[] = [];
  const seenSkipped = new Set<string>();
  const markSkipped = (name: string) => {
    if (!seenSkipped.has(name)) {
      seenSkipped.add(name);
      skipped.push(name);
    }
  };

  for (const p of panels ?? []) {
    const name = String(p?.name ?? "").trim();
    const w = positiveMm(p?.w_mm);
    const h = positiveMm(p?.h_mm);
    const rawQty = Math.floor(Number(p?.qty));
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 0;
    if (!name) continue;
    if (w <= 0 || h <= 0) {
      markSkipped(name);
      continue;
    }
    // Fits unrotated (w×h) or rotated (h×w)? If neither, skip & report.
    if (!((w <= L && h <= W) || (w <= W && h <= L))) {
      markSkipped(name);
      continue;
    }
    for (let i = 0; i < qty; i++) rects.push({ name, w, h });
  }

  rects.sort(
    (a, b) =>
      b.h - a.h ||
      b.w - a.w ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );

  const boards: WorkBoard[] = [];
  const placements: NestingPlacementDraft[] = [];

  function pushPlacement(
    boardIndex: number,
    shelf: Shelf,
    rect: Rect,
    pw: number,
    ph: number,
    rotated: boolean,
  ) {
    placements.push({
      panel_name: rect.name,
      board_index: boardIndex,
      x_mm: round2(shelf.xCursor),
      y_mm: round2(shelf.y),
      w_mm: round2(pw),
      h_mm: round2(ph),
      rotated,
    });
    shelf.xCursor += pw + k;
  }

  /** Best-fit orientation into an existing shelf; tightest leftover wins. */
  function tryExistingShelves(rect: Rect): boolean {
    for (let bi = 0; bi < boards.length; bi++) {
      for (const shelf of boards[bi].shelves) {
        let best: {
          pw: number;
          ph: number;
          rotated: boolean;
          leftover: number;
        } | null = null;
        for (const rotated of ORIENTS) {
          const pw = rotated ? rect.h : rect.w;
          const ph = rotated ? rect.w : rect.h;
          if (ph > shelf.height) continue;
          const avail = L - shelf.xCursor;
          if (pw > avail) continue;
          const leftover = avail - pw;
          if (!best || leftover < best.leftover) best = { pw, ph, rotated, leftover };
        }
        if (best) {
          pushPlacement(bi, shelf, rect, best.pw, best.ph, best.rotated);
          return true;
        }
      }
    }
    return false;
  }

  /** Open a new shelf on this board, oriented to maximise copies per row. */
  function tryOpenShelf(boardIndex: number, b: WorkBoard, rect: Rect): boolean {
    const roomY = W - b.yCursor;
    let best: { pw: number; ph: number; rotated: boolean; copies: number } | null =
      null;
    for (const rotated of ORIENTS) {
      const pw = rotated ? rect.h : rect.w;
      const ph = rotated ? rect.w : rect.h;
      if (ph > roomY || pw > L) continue;
      const copies = Math.floor((L + k) / (pw + k));
      if (
        !best ||
        copies > best.copies ||
        (copies === best.copies && ph < best.ph)
      ) {
        best = { pw, ph, rotated, copies };
      }
    }
    if (!best) return false;
    // Start the cursor at 0; pushPlacement stamps x=0 and advances past the
    // first panel (+kerf) itself.
    const shelf: Shelf = { y: b.yCursor, height: best.ph, xCursor: 0 };
    b.shelves.push(shelf);
    b.yCursor = shelf.y + best.ph + k;
    pushPlacement(boardIndex, shelf, rect, best.pw, best.ph, best.rotated);
    return true;
  }

  for (const rect of rects) {
    // 3) First-fit into shelves that already exist.
    if (tryExistingShelves(rect)) continue;

    // 4) New shelf on the first board with vertical room left.
    let opened = false;
    for (let bi = 0; bi < boards.length; bi++) {
      if (tryOpenShelf(bi, boards[bi], rect)) {
        opened = true;
        break;
      }
    }
    if (opened) continue;

    // 5) Nothing fits anywhere → open a fresh identical board.
    boards.push({ shelves: [], yCursor: 0 });
    tryOpenShelf(boards.length - 1, boards[boards.length - 1], rect);
  }

  // Waste is pure arithmetic over the placed panels vs consumed board area.
  const totalRawSqMm = rects.reduce((sum, r) => sum + r.w * r.h, 0);
  const boardRawSqMm = L * W;
  const boardsUsed = boards.length;
  const totalPanelAreaSqm = round3(totalRawSqMm / 1e6);
  const boardAreaSqm = round3(boardRawSqMm / 1e6);
  let wastePct = 0;
  if (boardsUsed > 0 && boardRawSqMm > 0) {
    wastePct = round2(
      Math.min(
        100,
        Math.max(0, (1 - totalRawSqMm / (boardsUsed * boardRawSqMm)) * 100),
      ),
    );
  }

  return {
    placements,
    boardsUsed,
    totalPanelAreaSqm,
    boardAreaSqm,
    wastePct,
    skipped,
  };
}
