"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormError, SubmitButton } from "@/app/(app)/dashboard/workspace-ui";
import {
  decidePettyClaimAction,
  recordPettyEntryAction,
  reversePettyEntryAction,
  type FormState,
} from "./actions";

/**
 * The three controls on `110521` that a person actually clicks.
 *
 * ⚠ EVERY ONE OF THEM CALLS `router.refresh()` AFTER A SUCCESSFUL WRITE.
 * `revalidatePath` in the action invalidates the CACHE; it does not re-render
 * a client component, which still holds the props it was rendered with. Without
 * the refresh the row lands in Postgres while the checkbox springs back and the
 * ledger keeps its old total — feedback that says the save failed when it
 * succeeded. HANDOFF-V8 §11; this is the defect the browser pass exists to
 * catch.
 *
 * ⚠ NO VOCABULARY IS DEFINED HERE. Labels, kinds and tabs all come from
 * `lib/petty-finance-model.ts`. A `"use client"` module's exported const is a
 * client reference on the server: `tsc` passes, `next build` passes, every
 * request throws.
 */

function useRefreshOnSuccess(state: FormState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
}

/* ── The reversed-transactions checkbox ───────────────────────────────────── */

/**
 * A real checkbox whose state is the URL, not a hook. The server resolves it
 * from `searchParams` and hands back both destinations, so the page can be
 * fetched in either state and this component never has to know how the query
 * string is spelt.
 */
export function ReversedToggle({
  checked,
  onHref,
  offHref,
  hiddenCount,
}: {
  checked: boolean;
  onHref: string;
  offHref: string;
  hiddenCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--color-ink)]">
      <input
        type="checkbox"
        name="reversed"
        data-testid="view-reversed"
        checked={checked}
        disabled={pending}
        onChange={() =>
          startTransition(() => router.push(checked ? offHref : onHref))
        }
        className="size-4 accent-[var(--color-ink)]"
      />
      View Reversed Transactions
      <span className="text-[var(--color-ink-secondary)]">
        {hiddenCount === 0
          ? "· none this month"
          : `· ${hiddenCount} row${hiddenCount === 1 ? "" : "s"}`}
      </span>
    </label>
  );
}

/* ── Record my own expense or fund ────────────────────────────────────────── */

export function RecordPettyEntry({
  kind,
  kindNoun,
  today,
  categories,
  projects,
}: {
  kind: string;
  kindNoun: string;
  today: string;
  categories: { value: string; label: string }[];
  projects: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    recordPettyEntryAction,
    undefined,
  );
  useRefreshOnSuccess(state);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Transaction date" htmlFor="spent_on" required
          hint="The day the money moved — not the day you are typing this.">
          <Input id="spent_on" name="spent_on" type="date" defaultValue={today} required />
        </Field>
        <Field label="Amount (₹)" htmlFor="amount" required>
          <Input id="amount" name="amount" type="number" min="0" step="0.01"
            placeholder="0.00" required />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue="other">
            {categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Project" htmlFor="project_id" hint="Leave blank for company-wide spend.">
          <Select id="project_id" name="project_id" defaultValue="">
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Remark" htmlFor="remark">
        <Textarea id="remark" name="remark" placeholder="What was it for?" />
      </Field>
      <FormError error={state?.error} />
      <div className="flex items-center gap-3">
        <SubmitButton variant="primary" pendingLabel="Saving…">
          Record {kindNoun.toLowerCase()}
        </SubmitButton>
        {state?.ok && (
          <span role="status" data-testid="petty-saved"
            className="text-[13px] text-[var(--color-green)]">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

/* ── Approver controls on somebody else's row ─────────────────────────────── */

export function RowApprovals({
  id,
  status,
  reversed,
}: {
  id: string;
  status: string;
  /** True when this row is already a reversal, or already reversed. */
  reversed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = useCallback(
    (label: string, action: (p: FormState, f: FormData) => Promise<FormState>, fd: FormData) => {
      setError(null);
      setBusy(label);
      startTransition(async () => {
        const r = await action(undefined, fd);
        setBusy(null);
        if (r?.error) {
          setError(r.error);
          return;
        }
        // See the note at the top of this file: without this the write lands
        // and the row springs back looking unchanged.
        router.refresh();
      });
    },
    [router],
  );

  const decide = (decision: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("decision", decision);
    run(decision, decidePettyClaimAction, fd);
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error && (
        <span role="alert" className="text-[12px] text-[var(--color-red)]">
          {error}
        </span>
      )}
      {status === "submitted" && (
        <Button size="sm" variant="secondary" disabled={busy !== null}
          onClick={() => decide("approved")}>
          {busy === "approved" ? "…" : "Approve"}
        </Button>
      )}
      {status === "approved" && (
        <Button size="sm" variant="secondary" disabled={busy !== null}
          onClick={() => decide("reimbursed")}>
          {busy === "reimbursed" ? "…" : "Reimburse"}
        </Button>
      )}
      {!reversed && (
        <Button
          size="sm"
          variant="danger"
          data-testid={`reverse-${id}`}
          title="Append a reversing entry. The original row stays."
          disabled={busy !== null}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", id);
            run("reverse", reversePettyEntryAction, fd);
          }}
        >
          {busy === "reverse" ? "…" : "Reverse"}
        </Button>
      )}
    </div>
  );
}
