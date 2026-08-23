"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  CHANNELS,
  DIRECTIONS,
  DISPOSITIONS,
  STATUSES,
  STATUS_META,
} from "@/lib/interactions-model";
import { logInteractionAction } from "./actions";

/**
 * Log interaction — the one primary action per view (red, DESIGN-DIRECTION §2).
 * A simple manual-entry form over the channel-agnostic interactions table.
 */

const channelLabel: Record<string, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  visit: "Visit",
};

const dispositionLabel: Record<string, string> = {
  interested: "Interested",
  busy: "Busy",
  follow_up: "Follow-up",
  not_interested: "Not interested",
  wrong_number: "Wrong number",
  no_answer: "No answer",
};

export function LogInteractionDialog() {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  async function handleAction(formData: FormData) {
    setError(undefined);
    const result = await logInteractionAction(formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(undefined); }}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="size-4" /> Log interaction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log interaction</DialogTitle>
          <DialogDescription>
            Record a call, WhatsApp, email, SMS or site visit against a lead.
          </DialogDescription>
        </DialogHeader>

        <form action={handleAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Channel" htmlFor="channel" required>
              <Select id="channel" name="channel" defaultValue="call">
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {channelLabel[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Direction" htmlFor="direction" required>
              <Select id="direction" name="direction" defaultValue="outbound">
                {DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === "inbound" ? "Inbound" : "Outbound"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status" required>
              <Select id="status" name="status" defaultValue="completed">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer no." htmlFor="customer_no">
              <Input
                id="customer_no"
                name="customer_no"
                placeholder="+91 98765 43210"
              />
            </Field>
            <Field
              label="Lead ID"
              htmlFor="lead_id"
              hint="Optional — paste a lead's ID to link this interaction."
            >
              <Input id="lead_id" name="lead_id" placeholder="—" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Duration (seconds)" htmlFor="duration_sec">
              <Input
                id="duration_sec"
                name="duration_sec"
                type="number"
                min={0}
                defaultValue={0}
                className="tabular"
              />
            </Field>
            <Field label="Disposition" htmlFor="disposition">
              <Select id="disposition" name="disposition" defaultValue="">
                <option value="">—</option>
                {DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>
                    {dispositionLabel[d]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Note" htmlFor="note">
            <Textarea name="note" placeholder="Outcome, next step…" />
          </Field>

          {error && (
            <p className="text-xs text-[var(--color-red)]" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" variant="primary">
              Save interaction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
