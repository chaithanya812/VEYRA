"use client";

import { useActionState, useState } from "react";
import { addVarianceAction, type FormState } from "./actions";
import { variancePct, varianceTone } from "@/lib/site-model";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, StatusChip } from "@/components/ui/primitives";

const TONE_TO_CHIP = {
  neutral: "neutral",
  warning: "amber",
  alert: "red",
} as const;

/** Add-variance form on the Measurement variance tab — the tab's one red
 *  primary. The live preview runs the SAME pure math the table renders
 *  (variancePct/varianceTone) so what you see while typing is what gets
 *  graded: neutral/amber, with red strictly reserved for a large variance. */
export function AddVarianceForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addVarianceAction,
    undefined,
  );
  const [quoted, setQuoted] = useState("");
  const [measured, setMeasured] = useState("");

  const q = Number(quoted);
  const m = Number(measured);
  const hasBoth =
    quoted.trim() !== "" && measured.trim() !== "" &&
    Number.isFinite(q) && Number.isFinite(m);
  const pct = hasBoth ? variancePct(q, m) : null;
  const tone = pct == null ? "neutral" : varianceTone(pct);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
          Add measurement
        </h2>
        {pct != null && (
          <StatusChip
            tone={TONE_TO_CHIP[tone]}
            label={`Variance ${pct > 0 ? "+" : ""}${pct}%`}
          />
        )}
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Project" htmlFor="mv_project" hint="Optional label">
            <Input
              id="mv_project"
              name="project_label"
              placeholder="e.g. Malviya Nagar site"
            />
          </Field>
          <Field label="Item" htmlFor="mv_item" required>
            <Input
              id="mv_item"
              name="item_name"
              placeholder="e.g. 18mm plywood"
            />
          </Field>
          <Field label="UOM" htmlFor="mv_uom">
            <Input id="mv_uom" name="uom" placeholder="e.g. sheet" />
          </Field>
          <Field label="Quoted qty" htmlFor="mv_quoted" required>
            <Input
              id="mv_quoted"
              name="quoted_qty"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={quoted}
              onChange={(e) => setQuoted(e.target.value)}
            />
          </Field>
          <Field label="Measured qty" htmlFor="mv_measured" required>
            <Input
              id="mv_measured"
              name="measured_qty"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={measured}
              onChange={(e) => setMeasured(e.target.value)}
            />
          </Field>
          <Field label="Note" htmlFor="mv_note">
            <Input
              id="mv_note"
              name="note"
              placeholder="Why the difference, if any"
            />
          </Field>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add variance"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
