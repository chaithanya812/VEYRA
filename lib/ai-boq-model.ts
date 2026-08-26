/**
 * Client-safe AI-BOQ model (REQ-01). The AI ONLY structures scope
 * (rooms → items → qty/uom); it NEVER produces a price. This module defines the
 * shape the model must return and a strict validator that:
 *   • coerces/guards qty to a finite non-negative number,
 *   • normalises uom to a known unit,
 *   • DROPS any price/rate/amount field the model might emit (defence in depth),
 * so downstream every line is created with unit_price = 0 and the deterministic
 * pricing engine (computeLine) — or the user — supplies the rate. No `server-only`
 * import, so the builder UI and the server action share the same validation.
 */

import { UOMS, type Uom } from "./items-model";

export interface AiBoqLine {
  title: string;
  category: string | null;
  description: string | null;
  qty: number;
  uom: Uom;
}

export interface AiBoqRoom {
  name: string;
  lines: AiBoqLine[];
}

export interface AiBoq {
  rooms: AiBoqRoom[];
}

/** The exact JSON contract we ask Claude to return (kept beside the validator). */
export const AI_BOQ_JSON_SHAPE = `{
  "rooms": [
    {
      "name": "string — a room or area, e.g. \\"Kitchen\\", \\"Master Bedroom\\", \\"All Areas\\"",
      "lines": [
        {
          "title": "string — the scope item, e.g. \\"Base unit with drawers\\"",
          "category": "string | null — e.g. \\"Modular\\", \\"Civil\\", \\"Electrical\\"",
          "description": "string | null — a short spec note",
          "qty": "number — quantity derived from the brief (never a price)",
          "uom": "one of: ${UOMS.join(", ")}"
        }
      ]
    }
  ]
}`;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normUom(v: unknown): Uom {
  const s = String(v ?? "").trim().toLowerCase();
  return (UOMS as readonly string[]).includes(s) ? (s as Uom) : "nos";
}

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/**
 * Validate + sanitise a raw model response into an AiBoq. Rejects only when the
 * top-level structure is unusable; otherwise it repairs per-line (bad qty → 0,
 * unknown uom → nos) and silently ignores any extra fields — including any
 * price/rate the model should never have sent.
 */
export function parseAiBoq(raw: unknown): { boq: AiBoq } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "AI returned no structured scope." };
  const roomsRaw = (raw as { rooms?: unknown }).rooms;
  if (!Array.isArray(roomsRaw)) return { error: "AI response missing a rooms array." };

  const rooms: AiBoqRoom[] = [];
  for (const r of roomsRaw) {
    if (!r || typeof r !== "object") continue;
    const name = str((r as { name?: unknown }).name) ?? "General";
    const linesRaw = (r as { lines?: unknown }).lines;
    const lines: AiBoqLine[] = [];
    if (Array.isArray(linesRaw)) {
      for (const l of linesRaw) {
        if (!l || typeof l !== "object") continue;
        const title = str((l as { title?: unknown }).title);
        if (!title) continue; // a line with no title is meaningless
        lines.push({
          title,
          category: str((l as { category?: unknown }).category),
          description: str((l as { description?: unknown }).description),
          qty: num((l as { qty?: unknown }).qty),
          uom: normUom((l as { uom?: unknown }).uom),
        });
      }
    }
    if (lines.length > 0) rooms.push({ name, lines });
  }

  if (rooms.length === 0) return { error: "AI produced no usable BOQ lines." };
  return { boq: { rooms } };
}

/** Total scope-item count across all rooms (for metering/preview). */
export function aiBoqLineCount(boq: AiBoq): number {
  return boq.rooms.reduce((n, r) => n + r.lines.length, 0);
}
