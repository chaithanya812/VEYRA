"use client";

import { useRef, useState, useTransition } from "react";
import { recordPaymentAction } from "../actions";
import {
  PAYMENT_DIRECTIONS,
  DIRECTION_META,
  type Milestone,
} from "@/lib/finance-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const MODES: { value: string; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export function PaymentForm({
  contractId,
  projectLabel,
  milestones,
}: {
  contractId: string;
  projectLabel: string | null;
  milestones: Milestone[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      ref={formRef}
      className="mb-5 flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(undefined);
        startTransition(async () => {
          const res = await recordPaymentAction(fd);
          if (res?.error) {
            setError(res.error);
          } else {
            formRef.current?.reset();
          }
        });
      }}
    >
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="project_label" value={projectLabel ?? ""} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Direction" htmlFor="direction" required>
          <Select id="direction" name="direction" defaultValue="inflow">
            {PAYMENT_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {DIRECTION_META[d].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" htmlFor="amount" required>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="e.g. 250000"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Mode" htmlFor="mode">
          <Select id="mode" name="mode" defaultValue="bank_transfer">
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid on" htmlFor="paid_on">
          <Input id="paid_on" name="paid_on" type="date" defaultValue={today} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field
          label="Milestone"
          htmlFor="milestone_id"
          hint="Optionally tie this payment to a milestone"
        >
          <Select id="milestone_id" name="milestone_id" defaultValue="">
            <option value="">Not linked</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                #{m.seq} {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="reference">
          <Input
            id="reference"
            name="reference"
            placeholder="UTR / cheque no…"
          />
        </Field>
      </div>

      <Field label="Note" htmlFor="note">
        <Textarea name="note" placeholder="Optional context…" className="min-h-16" />
      </Field>

      {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
