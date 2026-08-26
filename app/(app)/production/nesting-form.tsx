"use client";

import { useActionState, useMemo, useState } from "react";
import { runNestingAction, type FormState } from "./nesting-actions";
import { nestPanels } from "@/lib/production-nesting-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

export interface NestableCutlist {
  id: string;
  title: string;
  board_length_mm: number | null;
  board_width_mm: number | null;
  panels: {
    panel_name: string;
    length_mm: number;
    width_mm: number;
    qty: number;
  }[];
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Run-nesting form — the Nesting section's one red primary (§Design). The
 *  live boards/waste preview runs the SAME pure nestPanels() the server
 *  recomputes on submit, so the preview is exactly what gets stored (the
 *  server never trusts a client-computed figure). */
export function NestingForm({ cutlists }: { cutlists: NestableCutlist[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    runNestingAction,
    undefined,
  );
  const [cutlistId, setCutlistId] = useState("");
  const [boardLength, setBoardLength] = useState("");
  const [boardWidth, setBoardWidth] = useState("");
  const [kerf, setKerf] = useState("3");

  function pickCutlist(id: string) {
    setCutlistId(id);
    const c = cutlists.find((x) => x.id === id);
    if (!c) return;
    if (c.board_length_mm != null) setBoardLength(String(c.board_length_mm));
    if (c.board_width_mm != null) setBoardWidth(String(c.board_width_mm));
  }

  // Deterministic preview — identical to what computeAndSaveNesting stores.
  const preview = useMemo(() => {
    const c = cutlists.find((x) => x.id === cutlistId);
    const l = num(boardLength);
    const w = num(boardWidth);
    const k = Math.max(0, num(kerf));
    if (!c || l <= 0 || w <= 0) return null;
    return nestPanels(
      c.panels.map((p) => ({
        name: p.panel_name,
        w_mm: Number(p.length_mm),
        h_mm: Number(p.width_mm),
        qty: Number(p.qty),
      })),
      { length_mm: l, width_mm: w },
      k,
    );
  }, [cutlistId, boardLength, boardWidth, kerf, cutlists]);

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Run nesting
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cutlist" htmlFor="nest_cutlist" required>
            <Select
              id="nest_cutlist"
              name="cutlist_id"
              value={cutlistId}
              onChange={(e) => pickCutlist(e.target.value)}
            >
              <option value="">Pick a cutlist…</option>
              {cutlists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Board L (mm)" htmlFor="nest_board_len" required>
              <Input
                id="nest_board_len"
                name="board_length_mm"
                type="number"
                min="1"
                step="0.01"
                inputMode="numeric"
                placeholder="2440"
                value={boardLength}
                onChange={(e) => setBoardLength(e.target.value)}
              />
            </Field>
            <Field label="Board W (mm)" htmlFor="nest_board_wid" required>
              <Input
                id="nest_board_wid"
                name="board_width_mm"
                type="number"
                min="1"
                step="0.01"
                inputMode="numeric"
                placeholder="1220"
                value={boardWidth}
                onChange={(e) => setBoardWidth(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Kerf (mm)" htmlFor="nest_kerf" hint="Saw gap between cuts">
            <Input
              id="nest_kerf"
              name="kerf_mm"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={kerf}
              onChange={(e) => setKerf(e.target.value)}
            />
          </Field>
          <div className="flex items-end text-[13px] text-[var(--color-ink-secondary)] tabular">
            {preview ? (
              preview.placements.length > 0 ? (
                <span>
                  ≈ {preview.boardsUsed} board
                  {preview.boardsUsed === 1 ? "" : "s"} ·{" "}
                  {preview.wastePct}% waste
                  {preview.skipped.length > 0 && (
                    <>
                      {" "}
                      · {preview.skipped.length} panel
                      {preview.skipped.length === 1 ? "" : "s"} won&apos;t fit
                    </>
                  )}
                </span>
              ) : (
                <span>No panel fits that board size.</span>
              )
            ) : (
              <span>Pick a cutlist + board for a live preview</span>
            )}
          </div>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Computing…" : "Run nesting"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
