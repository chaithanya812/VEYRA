"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { PaymentPlanWithMilestones, PoTermsClause, PoTemplate } from "@/lib/data/po-config";
import { PoTemplateCard } from "./po-template-card";
import { validateMilestones } from "@/lib/po-plan-model";
import {
  deletePaymentPlanAction,
  deletePoTermsAction,
  savePaymentPlanAction,
  savePoTermsAction,
  type FormState,
} from "./actions";
import {
  Chip,
  Disclosure,
  Empty,
  FormError,
  List,
  Row,
  RowAction,
  Section,
  SubmitButton,
} from "../../dashboard/workspace-ui";

/**
 * Procurement configuration: the payment-plan library and the PO terms
 * library. Both are attached optionally when a purchase order is created.
 * Percentages are typed here; rupee amounts are derived on the PO.
 */

const initial: FormState = undefined;

interface MsRow {
  key: string;
  label: string;
  pct: string;
}

let msSeq = 0;
const newMs = (): MsRow => ({ key: `m${++msSeq}`, label: "", pct: "" });

function AddPlanForm() {
  const [planState, addPlan] = useActionState(savePaymentPlanAction, initial);
  const [rows, setRows] = useState<MsRow[]>([newMs()]);

  const parsed = rows.map((r) => ({
    label: r.label.trim(),
    pct: Number(r.pct),
  }));
  const check = validateMilestones(parsed);
  const pctSum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const sumLabel = Number.isFinite(pctSum)
    ? Math.round(pctSum * 100) / 100
    : 0;

  return (
    <form action={addPlan} className="flex flex-col gap-4">
      <FormError error={planState?.error} />
      {planState?.ok && (
        <p className="text-[13px] text-[var(--color-green)]">Saved.</p>
      )}
      <Field label="Plan name" htmlFor="plan_name" required>
        <Input
          id="plan_name"
          name="name"
          placeholder="Residential 25 / 45 / 30"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
          Milestones
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_88px_28px] gap-2 text-xs font-medium text-[var(--color-ink-secondary)]">
          <span>Label</span>
          <span className="text-right">%</span>
          <span />
        </div>
        {rows.map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-[minmax(0,1fr)_88px_28px] items-center gap-2"
          >
            <Input
              value={r.label}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)),
                )
              }
              placeholder="Advance"
              aria-label="Milestone label"
            />
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={r.pct}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((x) => (x.key === r.key ? { ...x, pct: e.target.value } : x)),
                )
              }
              className="text-right tabular"
              aria-label="Milestone percent"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove milestone"
              onClick={() =>
                setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))
              }
              className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRows((rs) => [...rs, newMs()])}
          >
            <Plus className="size-4" /> Add milestone
          </Button>
          <p
            className={
              check.ok
                ? "text-[13px] text-[var(--color-green)]"
                : "text-[13px] text-[var(--color-ink-secondary)]"
            }
          >
            {check.ok
              ? "Percentages add up to 100%."
              : `Percentages total ${sumLabel}% — they must add up to 100%.`}
          </p>
        </div>
      </div>

      <input type="hidden" name="milestones" value={JSON.stringify(parsed)} />
      <div>
        <SubmitButton pendingLabel="Adding…" disabled={!check.ok}>
          Add plan
        </SubmitButton>
      </div>
    </form>
  );
}

export function ProcurementSettingsView({
  plans,
  terms,
  template,
}: {
  plans: PaymentPlanWithMilestones[];
  terms: PoTermsClause[];
  template: PoTemplate;
}) {
  const [termsState, addTerms] = useActionState(savePoTermsAction, initial);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to settings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold text-[var(--color-ink)]">
        Procurement
      </h1>
      <p className="mb-6 text-sm text-[var(--color-ink-secondary)]">
        Payment plans and terms written once, then attached to a purchase order.
        Percentages are yours; rupee amounts are derived on the order. The PDF
        template decides what a vendor sees on the document.
      </p>

      <PoTemplateCard template={template} />

      <Section
        title="Payment plans"
        description="A named schedule of percentages. The rupee figure is computed from the PO amount when the plan is attached — nothing is stored twice."
      >
        <Disclosure label="Add a payment plan">
          <AddPlanForm />
        </Disclosure>

        <div className="mt-3">
          {plans.length === 0 ? (
            <Empty
              message="No payment plans yet"
              hint="Use “Add a payment plan” above. A typical residential split is 25 / 45 / 30."
            />
          ) : (
            <List>
              {plans.map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  meta={
                    p.milestones.length === 0
                      ? "No milestones"
                      : p.milestones
                          .map((m) => `${m.label} ${Number(m.pct)}%`)
                          .join(" · ")
                  }
                  right={
                    <form action={deletePaymentPlanAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <RowAction variant="danger" title="Delete payment plan">
                        Delete
                      </RowAction>
                    </form>
                  }
                />
              ))}
            </List>
          )}
        </div>
      </Section>

      <Section
        title="Terms & conditions"
        description="Clauses you attach to a purchase order. Separate from quotation terms — a PO's terms are not a quote's terms."
      >
        <Disclosure label="Add a clause">
          <form action={addTerms} className="flex flex-col gap-4">
            <FormError error={termsState?.error} />
            <Field label="Title" htmlFor="po_terms_title" required>
              <Input id="po_terms_title" name="title" placeholder="GST exclusive" />
            </Field>
            <Field label="Clause" htmlFor="po_terms_body" required>
              <Textarea id="po_terms_body" name="body" rows={4} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                name="is_default"
                className="size-4 rounded border-[var(--color-border-strong)] accent-[var(--color-ink)]"
              />
              Mark as default
            </label>
            <div>
              <SubmitButton pendingLabel="Adding…">Add clause</SubmitButton>
            </div>
          </form>
        </Disclosure>

        <div className="mt-3">
          {terms.length === 0 ? (
            <Empty
              message="No clauses yet"
              hint="Use “Add a clause” above. Attaching a clause to a PO is optional."
            />
          ) : (
            <List>
              {terms.map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  chips={t.is_default ? <Chip tone="green" label="Default" /> : undefined}
                  meta={t.body}
                  right={
                    <form action={deletePoTermsAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <RowAction variant="danger" title="Delete clause">
                        Delete
                      </RowAction>
                    </form>
                  }
                />
              ))}
            </List>
          )}
        </div>
      </Section>
    </div>
  );
}
