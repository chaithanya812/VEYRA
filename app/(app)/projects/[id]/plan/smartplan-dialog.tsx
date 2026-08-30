"use client";

import { useActionState, useEffect, useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import { dayDiff } from "@/lib/schedule-model";
import type { DatedStep } from "@/lib/smartplan-model";
import {
  applySmartPlanAction,
  smartPlanAction,
  type SmartPlanState,
} from "./smartplan-actions";

/**
 * SmartPlan (PLAN-V4 §9.2 — the `SmartPlan` button on each scope band in
 * `105010`).
 *
 * **Nothing is written until a person presses Add.** The model's answer arrives
 * as an editable draft: rename a milestone, move a date, drop a row you
 * disagree with, then accept what is left. A model proposing a delivery
 * schedule directly into the database is not a feature, it is a way to be
 * quietly wrong about a client's handover date.
 *
 * What the model supplied: names, an order, and how many days each step runs.
 * What it did not supply: a single date — those were computed from the start
 * date in this form — and not one rupee, quantity or rate (HARD RULE 2).
 */
const initial: SmartPlanState = undefined;

export function SmartPlanDialog({
  projectId,
  projectName,
  scopeGroup,
  scopeItemId,
  startDate,
  handoverDate,
  existing,
}: {
  projectId: string;
  projectName: string;
  scopeGroup: string;
  scopeItemId: string | null;
  startDate: string;
  handoverDate: string | null;
  /** Milestone names already on this band, so the model does not repeat them. */
  existing: string[];
}) {
  const [open, setOpen] = useState(false);
  const [genState, generate] = useActionState(smartPlanAction, initial);
  const [applyState, apply] = useActionState(applySmartPlanAction, initial);
  const [steps, setSteps] = useState<DatedStep[] | null>(null);

  // A fresh proposal replaces whatever draft was on screen.
  useEffect(() => {
    if (genState?.draft) setSteps(genState.draft.steps);
  }, [genState]);

  useEffect(() => {
    if (applyState?.created) {
      setOpen(false);
      setSteps(null);
    }
  }, [applyState]);

  const horizon = handoverDate ? Math.max(0, dayDiff(startDate, handoverDate)) : null;

  function patch(i: number, next: Partial<DatedStep>) {
    setSteps((cur) =>
      cur ? cur.map((s, j) => (i === j ? { ...s, ...next } : s)) : cur,
    );
  }

  function drop(i: number) {
    setSteps((cur) => {
      if (!cur) return cur;
      const kept = cur.filter((_, j) => j !== i);
      // Dependencies are indices into this list, so removing a row has to
      // renumber them — otherwise a step ends up waiting on the wrong thing.
      return kept.map((s) => ({
        ...s,
        dependsOn: s.dependsOn
          .filter((d) => d !== i)
          .map((d) => (d > i ? d - 1 : d)),
      }));
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSteps(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title={`Draft a plan for ${scopeGroup}`}>
          <Sparkles className="size-3.5" /> SmartPlan
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>SmartPlan — {scopeGroup}</DialogTitle>
          <DialogDescription>
            The model proposes which milestones and in what order. Every date is
            calculated here from the start you choose, and nothing is saved
            until you press Add.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step one: ask ── */}
        <form action={generate} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="project_name" value={projectName} />
          <input type="hidden" name="scope_group" value={scopeGroup} />
          <input type="hidden" name="scope_item_id" value={scopeItemId ?? ""} />
          <input type="hidden" name="existing" value={existing.join("\n")} />
          <input type="hidden" name="horizon_days" value={horizon ?? ""} />
          <FormError error={genState?.error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Start the plan on"
              htmlFor="sp_start"
              required
              hint={
                horizon != null
                  ? `${horizon} days to the handover date.`
                  : "No handover date set on this project."
              }
            >
              <Input
                id="sp_start"
                name="start_date"
                type="date"
                defaultValue={startDate}
                required
              />
            </Field>
            <Field label="Floor plan or BOQ" htmlFor="sp_files" hint="Optional. Images or PDF.">
              <input
                id="sp_files"
                name="attachments"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="block w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface-sunken)] file:px-3 file:py-1.5 file:text-[13px]"
              />
            </Field>
          </div>

          <Field label="Anything it should know" htmlFor="sp_brief">
            <Textarea
              id="sp_brief"
              name="brief"
              rows={2}
              placeholder="3BHK, modular kitchen and two wardrobes, occupied flat so noisy work is weekends only"
            />
          </Field>

          <div>
            <SubmitButton pendingLabel="Thinking…">
              <Sparkles className="size-4" /> Draft a plan
            </SubmitButton>
          </div>
        </form>

        {/* ── Step two: review, edit, accept ── */}
        {steps && (
          <div className="mt-2 border-t border-[var(--color-border)] pt-4">
            {genState?.draft?.note && (
              <p className="mb-3 rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-[12px] text-[var(--color-ink-secondary)]">
                {genState.draft.note}
              </p>
            )}

            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-[var(--color-ink)]">
                <span className="tabular">{steps.length}</span> proposed —
                edit anything before you add it
              </p>
              {horizon != null && steps.length > 0 && (
                <LateWarning steps={steps} handoverDate={handoverDate} />
              )}
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[var(--color-surface-sunken)]">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                    <th className="px-3 py-2 font-medium">Milestone</th>
                    <th className="px-3 py-2 font-medium">Start</th>
                    <th className="px-3 py-2 font-medium">End</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s, i) => (
                    <tr
                      key={i}
                      className="border-t border-[var(--color-border)]"
                    >
                      <td className="px-3 py-2">
                        <Input
                          value={s.name}
                          onChange={(e) => patch(i, { name: e.target.value })}
                          aria-label={`Name of proposed milestone ${i + 1}`}
                          className="h-7 text-[12px]"
                        />
                        {s.dependsOn.length > 0 && (
                          <span className="mt-0.5 block text-[11px] text-[var(--color-ink-secondary)]">
                            waits for{" "}
                            {s.dependsOn
                              .map((d) => steps[d]?.name ?? "—")
                              .join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={s.plannedStart}
                          onChange={(e) => patch(i, { plannedStart: e.target.value })}
                          aria-label={`Start of ${s.name}`}
                          className="h-7 w-36 text-[12px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={s.plannedEnd}
                          onChange={(e) => patch(i, { plannedEnd: e.target.value })}
                          aria-label={`End of ${s.name}`}
                          className="h-7 w-36 text-[12px]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => drop(i)}
                          title={`Remove ${s.name}`}
                          className="rounded-md p-1 text-[var(--color-ink-disabled)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-red)]"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form action={apply} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="scope_item_id" value={scopeItemId ?? ""} />
              <input type="hidden" name="steps" value={JSON.stringify(steps)} />
              <FormError error={applyState?.error} />
              <div className="flex items-center gap-2">
                <SubmitButton pendingLabel="Adding…">
                  Add {steps.length} {steps.length === 1 ? "milestone" : "milestones"}
                </SubmitButton>
                <Button type="button" variant="secondary" size="sm" onClick={() => setSteps(null)}>
                  Discard
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A plan that finishes after handover is the single most useful thing to notice
 * before accepting it — so it is said in words, in red, with an icon, rather
 * than left for the reviewer to work out from twenty dates.
 */
function LateWarning({
  steps,
  handoverDate,
}: {
  steps: DatedStep[];
  handoverDate: string | null;
}) {
  if (!handoverDate) return null;
  const end = steps.reduce(
    (latest, s) => (s.plannedEnd > latest ? s.plannedEnd : latest),
    steps[0].plannedEnd,
  );
  const over = dayDiff(handoverDate, end);
  if (over <= 0) {
    return (
      <span className="text-[12px] text-[var(--color-green)]">
        Finishes {Math.abs(over)} days before handover
      </span>
    );
  }
  return (
    <span className="text-[12px] font-medium text-[var(--color-red)]">
      ⚠ Runs {over} days past the handover date
    </span>
  );
}
