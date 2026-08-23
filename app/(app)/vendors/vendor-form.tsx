"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "./actions";
import { VENDOR_CATEGORIES, type Vendor } from "@/lib/vendors-model";
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

        {/* Buying terms */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue={vendor?.category ?? ""}>
              <option value="">— None —</option>
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
