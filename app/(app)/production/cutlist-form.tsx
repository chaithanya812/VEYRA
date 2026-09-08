"use client";

import { useActionState, useState } from "react";
import { createCutlistAction, type FormState } from "./actions";
import {
  cutlistTotals,
  panelAreaSqm,
  panelBandingMm,
  type Grain,
} from "@/lib/production-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import { ProjectSelect, type ProjectOption } from "@/components/ui/project-select";

interface DraftPanel {
  panel_name: string;
  room_label: string;
  length_mm: string;
  width_mm: string;
  qty: string;
  grain: Grain;
  material: string;
  edge_l1: boolean;
  edge_l2: boolean;
  edge_w1: boolean;
  edge_w2: boolean;
}

const EMPTY_PANEL: DraftPanel = {
  panel_name: "",
  room_label: "",
  length_mm: "",
  width_mm: "",
  qty: "1",
  grain: "none",
  material: "",
  edge_l1: false,
  edge_l2: false,
  edge_w1: false,
  edge_w2: false,
};

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const EDGE_FIELDS = [
  { key: "edge_l1" as const, label: "L1" },
  { key: "edge_l2" as const, label: "L2" },
  { key: "edge_w1" as const, label: "W1" },
  { key: "edge_w2" as const, label: "W2" },
];

/** Add-cutlist form — the Cutlist section's one red primary (§Design). The
 *  live area/banding preview runs the SAME pure helpers the hub renders
 *  (panelAreaSqm/panelBandingMm/cutlistTotals), so what you see while typing
 *  is exactly what the stored cutlist totals to. */
export function CutlistForm({
  projects,
  lockedTo,
}: {
  projects: ProjectOption[];
  /** Pin to one project — used by the project-scoped Production screen. */
  lockedTo?: ProjectOption;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCutlistAction,
    undefined,
  );
  const [panels, setPanels] = useState<DraftPanel[]>([{ ...EMPTY_PANEL }]);

  function updatePanel(i: number, patch: Partial<DraftPanel>) {
    setPanels((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    );
  }

  const filled = panels.filter((p) => p.panel_name.trim());
  const totals = cutlistTotals(
    filled.map((p) => ({
      length_mm: num(p.length_mm),
      width_mm: num(p.width_mm),
      qty: Math.max(1, Math.floor(num(p.qty)) || 1),
      edge_l1: p.edge_l1,
      edge_l2: p.edge_l2,
      edge_w1: p.edge_w1,
      edge_w2: p.edge_w2,
    })),
  );

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        New cutlist
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        {/* Panels ride along as JSON; the server re-validates and guards every
            dimension itself (never trusts this payload). */}
        <input
          type="hidden"
          name="panels_json"
          value={JSON.stringify(
            filled.map((p) => ({
              panel_name: p.panel_name.trim(),
              room_label: p.room_label.trim() || undefined,
              length_mm: num(p.length_mm),
              width_mm: num(p.width_mm),
              qty: Math.max(1, Math.floor(num(p.qty)) || 1),
              grain: p.grain,
              material: p.material.trim() || undefined,
              edge_l1: p.edge_l1,
              edge_l2: p.edge_l2,
              edge_w1: p.edge_w1,
              edge_w2: p.edge_w2,
            })),
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Title" htmlFor="cl_title" required>
            <Input
              id="cl_title"
              name="title"
              placeholder="e.g. Bedroom wardrobe — shutters"
            />
          </Field>
          <ProjectSelect projects={projects} lockedTo={lockedTo} id="cl_project" hint="Attach this cutlist to a job, or leave it company-wide" />
          <Field label="Board material" htmlFor="cl_board_material">
            <Input
              id="cl_board_material"
              name="board_material"
              placeholder="e.g. 19mm MR prelaminated"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Board L (mm)" htmlFor="cl_board_len">
              <Input
                id="cl_board_len"
                name="board_length_mm"
                type="number"
                min="0"
                step="0.01"
                inputMode="numeric"
                placeholder="2440"
              />
            </Field>
            <Field label="Board W (mm)" htmlFor="cl_board_wid">
              <Input
                id="cl_board_wid"
                name="board_width_mm"
                type="number"
                min="0"
                step="0.01"
                inputMode="numeric"
                placeholder="1220"
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Panels
          </p>
          {panels.map((p, i) => {
            const l = num(p.length_mm);
            const w = num(p.width_mm);
            const qty = Math.max(1, Math.floor(num(p.qty)) || 1);
            const hasDims = p.length_mm.trim() !== "" && p.width_mm.trim() !== "";
            const areaSqm = hasDims ? panelAreaSqm(l, w) : null;
            const bandingMm =
              hasDims ? panelBandingMm({ ...p, length_mm: l, width_mm: w, qty }) : null;
            return (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-3"
              >
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <Field label={`Panel ${i + 1}`} htmlFor={`cl_panel_${i}`} required>
                      <Input
                        id={`cl_panel_${i}`}
                        value={p.panel_name}
                        onChange={(e) =>
                          updatePanel(i, { panel_name: e.target.value })
                        }
                        placeholder="e.g. Shutter left"
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Room" htmlFor={`cl_room_${i}`}>
                      <Input
                        id={`cl_room_${i}`}
                        value={p.room_label}
                        onChange={(e) =>
                          updatePanel(i, { room_label: e.target.value })
                        }
                        placeholder="e.g. Bedroom 2"
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-1">
                    <Field label="L (mm)" htmlFor={`cl_len_${i}`} required>
                      <Input
                        id={`cl_len_${i}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="numeric"
                        value={p.length_mm}
                        onChange={(e) =>
                          updatePanel(i, { length_mm: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-1">
                    <Field label="W (mm)" htmlFor={`cl_wid_${i}`} required>
                      <Input
                        id={`cl_wid_${i}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="numeric"
                        value={p.width_mm}
                        onChange={(e) =>
                          updatePanel(i, { width_mm: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-1">
                    <Field label="Qty" htmlFor={`cl_qty_${i}`} required>
                      <Input
                        id={`cl_qty_${i}`}
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={p.qty}
                        onChange={(e) => updatePanel(i, { qty: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Grain" htmlFor={`cl_grain_${i}`}>
                      <Select
                        id={`cl_grain_${i}`}
                        value={p.grain}
                        onChange={(e) =>
                          updatePanel(i, { grain: e.target.value as Grain })
                        }
                      >
                        <option value="none">No grain</option>
                        <option value="length">Along length</option>
                        <option value="width">Along width</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Material" htmlFor={`cl_material_${i}`}>
                      <Input
                        id={`cl_material_${i}`}
                        value={p.material}
                        onChange={(e) =>
                          updatePanel(i, { material: e.target.value })
                        }
                        placeholder="Optional override"
                      />
                    </Field>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-xs font-medium text-[var(--color-ink-secondary)]">
                    Edge-band:
                  </span>
                  {EDGE_FIELDS.map((f) => (
                    <label
                      key={f.key}
                      htmlFor={`cl_${f.key}_${i}`}
                      className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-ink)]"
                    >
                      <input
                        id={`cl_${f.key}_${i}`}
                        type="checkbox"
                        className="size-4"
                        checked={p[f.key]}
                        onChange={(e) =>
                          updatePanel(i, { [f.key]: e.target.checked })
                        }
                      />
                      {f.label}
                    </label>
                  ))}
                  <span className="ml-auto text-xs text-[var(--color-ink-secondary)] tabular">
                    {areaSqm != null && bandingMm != null
                      ? `${areaSqm} sqm · ${(bandingMm / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 })} m banding`
                      : "Enter L × W for live area/banding"}
                  </span>
                  {panels.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPanels((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPanels((prev) => [...prev, { ...EMPTY_PANEL }])}
            >
              Add panel
            </Button>
            <span className="text-[13px] text-[var(--color-ink-secondary)] tabular">
              {totals.panelCount} panels · {totals.totalAreaSqm} sqm ·{" "}
              {(totals.totalBandingMm / 1000).toLocaleString("en-IN", {
                maximumFractionDigits: 3,
              })}{" "}
              m banding
            </span>
          </div>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Creating…" : "Create cutlist"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
