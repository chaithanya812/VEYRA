"use client";

import { useState } from "react";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SubmitButton } from "../../dashboard/workspace-ui";
import { awardRfqAction, type RfqActionState } from "../actions";
import { inr } from "@/lib/utils";

/**
 * Awarding an RFQ (PLAN-V4 §9.7, frame `105853`).
 *
 * **This dialog exists because the cheapest bid is not automatically the
 * winner.** The owner's own frame shows a buyer ordering from the dearer
 * vendor, and VEYRA used to award to rank 1 with one click — turning a
 * judgement into arithmetic.
 *
 * So the ranking is still here, on the left of each option, as information.
 * The decision is the dropdown, and the reason is required: an award nobody can
 * explain six months later is an award nobody can defend. When the buyer does
 * not pick rank 1, the dialog says so plainly rather than warning them off it.
 */
export function AwardDialog({
  rfqId,
  options,
}: {
  rfqId: string;
  /** Every invited vendor that actually bid, cheapest first. */
  options: { vendorId: string; vendorName: string; total: number; rank?: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RfqActionState>(undefined);
  const [chosen, setChosen] = useState(options[0]?.vendorId ?? "");

  const pick = options.find((o) => o.vendorId === chosen);
  const cheapest = options[0];
  const dearer =
    pick && cheapest && pick.vendorId !== cheapest.vendorId
      ? pick.total - cheapest.total
      : 0;

  async function submit(fd: FormData) {
    const r = await awardRfqAction(undefined, fd);
    if (r?.error) setState(r);
    else setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" disabled={options.length === 0}>
          <Award className="size-4" /> Award
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Award this RFQ</DialogTitle>
          <DialogDescription>
            The totals below rank the bids. They do not decide between them —
            delivery date, past performance and who answers the phone are not in
            the arithmetic.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={rfqId} />
          <FormError error={state?.error} />

          <Field label="Award to" htmlFor="award_vendor" required>
            <Select
              id="award_vendor"
              name="vendor_id"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              required
            >
              {options.map((o) => (
                <option key={o.vendorId} value={o.vendorId}>
                  {o.rank ? `L${o.rank} · ` : ""}
                  {o.vendorName} — {inr(o.total)}
                </option>
              ))}
            </Select>
          </Field>

          {dearer > 0 && (
            // Stated, not warned about. Paying more is often the right call;
            // pretending it did not happen is not.
            <p className="rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-[12px] text-[var(--color-ink-secondary)]">
              This is <span className="tabular">{inr(dearer)}</span> more than
              the lowest bid ({cheapest?.vendorName}). Worth saying why below.
            </p>
          )}

          <Field
            label="Why this vendor"
            htmlFor="award_reason"
            required
            hint="Recorded against the RFQ. This is the answer to “why did we pay that?” in six months."
          >
            <Textarea
              id="award_reason"
              name="reason"
              rows={3}
              required
              minLength={3}
              placeholder="Can deliver by the 14th; last two loads from the cheaper vendor were short."
            />
          </Field>

          <div>
            <SubmitButton pendingLabel="Awarding…">Award and draft the PO</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
