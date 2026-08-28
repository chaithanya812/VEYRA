"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Chip, FormError, SubmitButton } from "../../dashboard/workspace-ui";
import {
  retireLeadStatusAction,
  upsertLeadStatusAction,
} from "../../leads/actions";
import type { LeadStatusDef } from "@/lib/lead-management-model";
import type { FormState } from "../../leads/actions";

/**
 * The lead status ladder, editable at last.
 *
 * `upsertLeadStatus` and `retireLeadStatus` have shipped since migration 0024
 * and **nothing ever called them** — the only stage editor in the product was
 * /pipeline/stages, which wrote to `pipeline_stages`, a table the board stopped
 * reading. So a tenant could "configure stages" all afternoon and watch nothing
 * change (PLAN-V4 §6.1). This is the one editor now; that route is gone.
 *
 * Retiring a status that still holds leads is refused by the data layer, with
 * the count in the message — the leads have to go somewhere first.
 */
const initial: FormState = undefined;

export function LeadStatusEditor({ statuses }: { statuses: LeadStatusDef[] }) {
  const [addState, add] = useActionState(upsertLeadStatusAction, initial);
  const live = statuses.filter((s) => s.is_active);
  const retired = statuses.filter((s) => !s.is_active);

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
          Lead statuses
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
          The ladder every lead climbs, and the stages on the pipeline. Rename
          them to your own words; add what you are missing; retire what you do
          not use.
        </p>
      </div>

      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {live.map((s) => (
          <StatusRow key={s.id} status={s} />
        ))}

        <form action={add} className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1">
            <Field label="Add a status" htmlFor="new_status_label">
              <Input
                id="new_status_label"
                name="label"
                placeholder="Site visit booked"
                required
              />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Tone" htmlFor="new_status_tone">
              <Select id="new_status_tone" name="tone" defaultValue="neutral">
                <option value="neutral">Neutral</option>
                <option value="amber">In progress</option>
                <option value="green">Good</option>
              </Select>
            </Field>
          </div>
          <SubmitButton pendingLabel="Adding…">
            <Plus className="size-4" /> Add
          </SubmitButton>
          <FormError error={addState?.error} />
        </form>
      </div>

      {retired.length > 0 && (
        <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">
          Retired: {retired.map((s) => s.label).join(", ")}. Retired statuses
          keep their history and stop appearing in pickers.
        </p>
      )}
    </section>
  );
}

function StatusRow({ status }: { status: LeadStatusDef }) {
  const [renameState, rename] = useActionState(upsertLeadStatusAction, initial);
  const [retireState, retire] = useActionState(retireLeadStatusAction, initial);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <form action={rename} className="flex flex-1 items-center gap-2">
        <input type="hidden" name="id" value={status.id} />
        {status.is_won && <input type="hidden" name="is_won" value="on" />}
        {status.is_lost && <input type="hidden" name="is_lost" value="on" />}
        <Input
          name="label"
          defaultValue={status.label}
          aria-label={`Name for ${status.label}`}
          className="h-8 max-w-64 text-[13px]"
        />
        <Select
          name="tone"
          defaultValue={status.tone}
          aria-label={`Tone for ${status.label}`}
          className="h-8 w-32 text-[13px]"
        >
          <option value="neutral">Neutral</option>
          <option value="amber">In progress</option>
          <option value="green">Good</option>
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Save
        </Button>
      </form>

      <div className="flex items-center gap-2">
        {status.is_won && <Chip tone="green" label="Won" />}
        {status.is_lost && <Chip tone="neutral" label="Closes the lead" />}
        {status.is_system && <Chip tone="neutral" label="Built in" />}
        <form action={retire}>
          <input type="hidden" name="id" value={status.id} />
          <Button type="submit" variant="ghost" size="sm">
            Retire
          </Button>
        </form>
      </div>

      {(renameState?.error || retireState?.error) && (
        <div className="w-full">
          <FormError error={renameState?.error ?? retireState?.error} />
        </div>
      )}
    </div>
  );
}
