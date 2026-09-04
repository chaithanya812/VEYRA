"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FormError, SubmitButton } from "@/app/(app)/dashboard/workspace-ui";
import {
  restoreMilestoneAction,
  writeOffMilestoneAction,
  type FormState,
} from "./actions";

/**
 * The two controls on `110534` a person actually clicks.
 *
 * ⚠ BOTH CALL `router.refresh()` AFTER A SUCCESSFUL WRITE. `revalidatePath` in
 * the action invalidates the CACHE; it does not re-render a client component,
 * which still holds the props it was rendered with. Without the refresh the
 * write-off lands in Postgres while the row springs back to "Write off" and the
 * tiles keep their old totals — feedback that says the save failed when it
 * succeeded (HANDOFF-V8 §11). This is the defect the browser pass exists to
 * catch, so it is fixed before it can happen.
 *
 * ⚠ NO VOCABULARY IS DEFINED HERE. Bucket names, notes and tones all live in
 * `lib/receivables-model.ts`: a `"use client"` module's exported const is a
 * client reference on the server, and every request would throw.
 */

function useRefreshOnSuccess(state: FormState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
}

/**
 * Write one milestone off.
 *
 * The reason box is not optional and not a nicety: it is the difference between
 * an audit entry somebody can act on and a hole in the ledger. It is inline
 * rather than in a dialog so that it is present in the server HTML the moment
 * the button is pressed — a Radix dialog's contents are not.
 */
export function WriteOffControl({
  milestoneId,
  label,
  amount,
}: {
  milestoneId: string;
  label: string;
  amount: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<FormState, FormData>(
    writeOffMilestoneAction,
    undefined,
  );
  useRefreshOnSuccess(state);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        data-testid="write-off-open"
        title={`Stop expecting ${amount} for ${label}`}
        onClick={() => setOpen(true)}
      >
        Write off
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 text-left">
      <input type="hidden" name="milestone_id" value={milestoneId} />
      <p className="text-[12px] text-[var(--color-ink-secondary)]">
        Writing off {amount} on {label}. The milestone keeps its value; the firm
        stops expecting the money.
      </p>
      <Input
        name="reason"
        data-testid="write-off-reason"
        placeholder="Why is this being written off?"
        aria-label="Reason for writing this off"
        required
        minLength={4}
        maxLength={500}
        className="w-64"
      />
      <div className="flex items-center gap-2">
        <span data-testid="write-off-confirm">
          <SubmitButton>Confirm write-off</SubmitButton>
        </span>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <FormError error={state?.error} />
    </form>
  );
}

/**
 * Undo a write-off.
 *
 * Nothing is erased by this: the original decision, its reason and the person
 * who made it stay in `audit_events` forever, and the restoration is appended
 * on top. A write-off with no way back is a one-way door people stop using.
 */
export function RestoreControl({
  milestoneId,
  label,
}: {
  milestoneId: string;
  label: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    restoreMilestoneAction,
    undefined,
  );
  useRefreshOnSuccess(state);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="milestone_id" value={milestoneId} />
      <span data-testid="write-off-restore">
        <SubmitButton variant="ghost">
          <Undo2 className="size-4" /> Restore
        </SubmitButton>
      </span>
      <span className="sr-only">Restore {label} to the receivables ledger</span>
      <FormError error={state?.error} />
    </form>
  );
}
