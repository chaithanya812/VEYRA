"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "./actions";
import {
  VENDOR_CATEGORIES,
  WORKING_MODELS,
  WORKING_MODEL_LABELS,
  workingModelOf,
  type Vendor,
} from "@/lib/vendors-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function VendorForm({
  action,
  mode,
  vendor,
}: {
  action: Action;
  mode: "create" | "edit";
  vendor?: Vendor;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-5">
        {mode === "edit" && vendor && (
          <input type="hidden" name="id" value={vendor.id} />
        )}

        {/* Identity */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vendor name" htmlFor="name" required hint="Deduped — one vendor per name">
            <Input
              id="name"
              name="name"
              defaultValue={vendor?.name}
              placeholder="e.g. Sri Venkateswara Hardware"
            />
          </Field>
          <Field label="Contact person" htmlFor="contact_person">
            <Input
              id="contact_person"
              name="contact_person"
              defaultValue={vendor?.contact_person ?? ""}
              placeholder="e.g. Ramesh Kumar"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Phone" htmlFor="phone" hint="Deduped — one vendor per phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={vendor?.phone ?? ""}
              placeholder="e.g. +91 98450 12345"
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={vendor?.email ?? ""}
              placeholder="e.g. orders@vendor.in"
            />
          </Field>
          <Field label="GSTIN" htmlFor="gstin">
            <Input
              id="gstin"
              name="gstin"
              defaultValue={vendor?.gstin ?? ""}
              placeholder="e.g. 29ABCDE1234F1Z5"
            />
          </Field>
        </div>

        {/* Trades. A vendor does more than one — `110215` shows
            `Carpentry Woodwork + 2` — so this is checkboxes over a table, not
            a single select over a string (0039). */}
        <Field
          label="Categories"
          htmlFor="categories"
          hint="Everything this vendor works in. A vendor filter is a lookup over these, not a substring search."
        >
          <div
            id="categories"
            className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-[var(--color-border)] p-3 sm:grid-cols-3"
          >
            {VENDOR_CATEGORIES.map((c) => (
              <label
                key={c}
                className="flex items-center gap-2 text-[13px] text-[var(--color-ink)]"
              >
                <input
                  type="checkbox"
                  name="categories"
                  value={c}
                  defaultChecked={vendor?.categories?.includes(c) ?? false}
                  className="size-4 accent-[var(--color-ink)]"
                />
                {c}
              </label>
            ))}
          </div>
        </Field>

        {/* Buying terms */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Working model"
            htmlFor="working_model"
            hint="What they can supply — it decides which requests they can bid on"
          >
            <Select
              id="working_model"
              name="working_model"
              defaultValue={workingModelOf(vendor?.working_model)}
            >
              {WORKING_MODELS.map((m) => (
                <option key={m} value={m}>
                  {WORKING_MODEL_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment terms" htmlFor="payment_terms">
            <Input
              id="payment_terms"
              name="payment_terms"
              defaultValue={vendor?.payment_terms ?? ""}
              placeholder="e.g. 30 days credit / 50% advance"
            />
          </Field>
          <Field label="Lead time (days)" htmlFor="lead_time_days">
            <Input
              id="lead_time_days"
              name="lead_time_days"
              type="number"
              min="0"
              step="1"
              defaultValue={vendor?.lead_time_days ?? ""}
              placeholder="e.g. 7"
            />
          </Field>
        </div>

        {/* Location */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Country" htmlFor="country">
            <Input
              id="country"
              name="country"
              defaultValue={vendor?.country ?? "India"}
              placeholder="India"
            />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={vendor?.city ?? ""} placeholder="e.g. Bengaluru" />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" name="state" defaultValue={vendor?.state ?? ""} placeholder="e.g. Karnataka" />
          </Field>
          <Field label="Pincode" htmlFor="pincode">
            <Input id="pincode" name="pincode" defaultValue={vendor?.pincode ?? ""} placeholder="e.g. 560001" />
          </Field>
        </div>

        <Field label="Address" htmlFor="address">
          <Textarea
            id="address"
            name="address"
            defaultValue={vendor?.address ?? ""}
            placeholder="Shop/shop no., street, landmark…"
          />
        </Field>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        {/* Sticky footer — Cancel ghost-left, primary red-right (DESIGN-DIRECTION §5). */}
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 rounded-b-[var(--radius-card)]">
          <Link href={mode === "edit" && vendor ? `/vendors/${vendor.id}` : "/vendors"}>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "edit"
                ? "Save changes"
                : "Create vendor"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
