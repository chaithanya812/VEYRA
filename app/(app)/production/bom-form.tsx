"use client";

import { useActionState, useState } from "react";
import { createBomAction, type FormState } from "./actions";
import { effectiveQty } from "@/lib/production-model";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

interface DraftLine {
  material_name: string;
  uom: string;
  qty: string;
  waste_pct: string;
  notes: string;
}

const EMPTY_LINE: DraftLine = {
  material_name: "",
  uom: "",
  qty: "",
  waste_pct: "0",
  notes: "",
};

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Add-BOM form — the BOM section's one red primary (§Design). Each line's
 *  effective qty is live-computed with the SAME pure helper the server stamps
 *  (effectiveQty), so the preview is exactly what gets stored. */
export function BomForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createBomAction,
    undefined,
  );
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        New BOM
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        {/* Lines ride along as JSON; the server re-validates and recomputes
            every effective_qty itself (never trusts this payload). */}
        <input
          type="hidden"
          name="lines_json"
          value={JSON.stringify(
            lines
              .filter((l) => l.material_name.trim())
              .map((l) => ({
                material_name: l.material_name.trim(),
                uom: l.uom.trim() || undefined,
                qty: num(l.qty),
                waste_pct: num(l.waste_pct),
                notes: l.notes.trim() || undefined,
              })),
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Title" htmlFor="bom_title" required>
            <Input
              id="bom_title"
              name="title"
              placeholder="e.g. Wardrobe shutters — Sharma residence"
            />
          </Field>
          <Field label="Project" htmlFor="bom_project" hint="Optional label">
            <Input
              id="bom_project"
              name="project_label"
              placeholder="e.g. Malviya Nagar site"
            />
          </Field>
          <Field
            label="Source ref"
            htmlFor="bom_source_ref"
            hint="Optional — drawing / scope id"
          >
            <Input id="bom_source_ref" name="source_ref" />
          </Field>
          <Field label="Notes" htmlFor="bom_notes">
            <Input id="bom_notes" name="notes" placeholder="Optional" />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Material lines
          </p>
          {lines.map((line, i) => {
            const eff = line.qty.trim()
              ? effectiveQty(num(line.qty), num(line.waste_pct))
              : null;
            return (
              <div
                key={i}
                className="grid grid-cols-1 items-end gap-3 rounded-md border border-[var(--color-border)] p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-4">
                  <Field label={`Material ${i + 1}`} htmlFor={`bom_mat_${i}`} required>
                    <Input
                      id={`bom_mat_${i}`}
                      value={line.material_name}
                      onChange={(e) =>
                        updateLine(i, { material_name: e.target.value })
                      }
                      placeholder="e.g. 18mm plywood"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="UOM" htmlFor={`bom_uom_${i}`}>
                    <Input
                      id={`bom_uom_${i}`}
                      value={line.uom}
                      onChange={(e) => updateLine(i, { uom: e.target.value })}
                      placeholder="e.g. sheet"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Qty" htmlFor={`bom_qty_${i}`} required>
                    <Input
                      id={`bom_qty_${i}`}
                      type="number"
                      min="0"
                      step="0.001"
                      inputMode="decimal"
                      value={line.qty}
                      onChange={(e) => updateLine(i, { qty: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Waste %" htmlFor={`bom_waste_${i}`}>
                    <Input
                      id={`bom_waste_${i}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      inputMode="decimal"
                      value={line.waste_pct}
                      onChange={(e) =>
                        updateLine(i, { waste_pct: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-2 sm:col-span-2">
                  <span className="text-xs text-[var(--color-ink-secondary)] tabular">
                    {eff != null ? `Eff ${eff}` : "Eff —"}
                  </span>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setLines((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
            >
              Add material line
            </Button>
          </div>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Creating…" : "Create BOM"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
