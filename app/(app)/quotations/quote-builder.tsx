"use client";

import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  marginPct,
  INDIAN_STATES,
  type Quotation,
  type QuotationSection,
  type QuotationLine,
} from "@/lib/quotations-model";
import { uomLabel } from "@/lib/items-ui";
import { inr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import { LineDialog } from "./line-dialog";
import {
  updateMetaAction,
  addSectionAction,
  deleteSectionAction,
  deleteLineAction,
} from "./actions";

export function QuoteBuilder({
  quotation,
  sections,
  lines,
}: {
  quotation: Quotation;
  sections: QuotationSection[];
  lines: QuotationLine[];
}) {
  const linesBySection = new Map<string | null, QuotationLine[]>();
  for (const l of lines) {
    const key = l.section_id ?? null;
    if (!linesBySection.has(key)) linesBySection.set(key, []);
    linesBySection.get(key)!.push(l);
  }
  const ungrouped = linesBySection.get(null) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {/* Customer & document meta */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Customer & document</h2>
          <form action={updateMetaAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={quotation.id} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="title">
                <Input id="title" name="title" defaultValue={quotation.title} />
              </Field>
              <Field label="Customer name" htmlFor="customer_name">
                <Input id="customer_name" name="customer_name" defaultValue={quotation.customer_name ?? ""} />
              </Field>
              <Field label="Customer phone" htmlFor="customer_phone">
                <Input id="customer_phone" name="customer_phone" defaultValue={quotation.customer_phone ?? ""} />
              </Field>
              <Field label="Customer email" htmlFor="customer_email">
                <Input id="customer_email" name="customer_email" defaultValue={quotation.customer_email ?? ""} />
              </Field>
              <Field label="Valid until" htmlFor="valid_until">
                <Input id="valid_until" name="valid_until" type="date" defaultValue={quotation.valid_until ?? ""} />
              </Field>
            </div>
            <Field label="Site address" htmlFor="site_address">
              <Input id="site_address" name="site_address" defaultValue={quotation.site_address ?? ""} />
            </Field>

            {/* GST & place of supply — drives the CGST/SGST vs IGST split. */}
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
              <p className="mb-3 text-xs font-medium text-[var(--color-ink-secondary)]">
                GST &amp; place of supply
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Seller state" htmlFor="seller_state">
                  <Select id="seller_state" name="seller_state" defaultValue={quotation.seller_state ?? ""}>
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.name}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Place of supply" htmlFor="place_of_supply">
                  <Select id="place_of_supply" name="place_of_supply" defaultValue={quotation.place_of_supply ?? ""}>
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.name}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="GST treatment"
                  htmlFor="gst_treatment"
                  hint="Auto: intra-state → CGST + SGST, inter-state → IGST."
                >
                  <Select id="gst_treatment" name="gst_treatment" defaultValue={quotation.gst_treatment}>
                    <option value="auto">Auto (from states)</option>
                    <option value="intra">Intra-state (CGST + SGST)</option>
                    <option value="inter">Inter-state (IGST)</option>
                  </Select>
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-ink)]">
                <input
                  type="checkbox"
                  name="works_contract"
                  defaultChecked={quotation.works_contract}
                  className="size-4 accent-[var(--color-red)]"
                />
                Works contract (turnkey) — shows the works-contract note on the quote
              </label>
            </div>
            <Field label="Terms & notes" htmlFor="terms">
              <Textarea id="terms" name="terms" defaultValue={quotation.terms ?? ""} placeholder="Payment terms, warranty, inclusions…" />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" size="sm">Save details</Button>
            </div>
          </form>
        </Card>

        {/* BOQ */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Bill of quantities</h2>
            <LineDialog
              quotationId={quotation.id}
              sections={sections}
              trigger={
                <Button variant="primary" size="sm">
                  <Plus className="size-4" /> Add line
                </Button>
              }
            />
          </div>

          <div className="flex flex-col gap-5">
            {sections.map((s) => (
              <SectionBlock
                key={s.id}
                quotationId={quotation.id}
                section={s}
                sections={sections}
                lines={linesBySection.get(s.id) ?? []}
              />
            ))}

            {ungrouped.length > 0 && (
              <SectionBlock
                quotationId={quotation.id}
                section={null}
                sections={sections}
                lines={ungrouped}
              />
            )}

            {sections.length === 0 && lines.length === 0 && (
              <p className="rounded-md border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-ink-secondary)]">
                No lines yet. Add a section (e.g. “Wood Work”) then add lines, or add an ungrouped line.
              </p>
            )}
          </div>

          {/* Add section */}
          <form action={addSectionAction} className="mt-5 flex items-end gap-2 border-t border-[var(--color-border)] pt-4">
            <input type="hidden" name="quotationId" value={quotation.id} />
            <div className="flex-1">
              <Field label="New section" htmlFor="section-title">
                <Input id="section-title" name="title" placeholder="e.g. Wood Work, Modular Kitchen, Painting" />
              </Field>
            </div>
            <Button type="submit" variant="secondary">
              <Plus className="size-4" /> Add section
            </Button>
          </form>
        </Card>
      </div>

      {/* Totals */}
      <div className="lg:col-span-1">
        <TotalsCard quotation={quotation} />
      </div>
    </div>
  );
}

function SectionBlock({
  quotationId,
  section,
  sections,
  lines,
}: {
  quotationId: string;
  section: QuotationSection | null;
  sections: QuotationSection[];
  lines: QuotationLine[];
}) {
  const subtotal = lines.reduce((s, l) => s + Number(l.line_total), 0);
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      <div className="flex items-center justify-between gap-2 bg-[var(--color-surface-sunken)] px-4 py-2.5">
        <span className="text-sm font-semibold text-[var(--color-ink)]">
          {section ? section.title : "Ungrouped"}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular text-[var(--color-ink-secondary)]">{inr(subtotal)}</span>
          {section && (
            <form action={deleteSectionAction}>
              <input type="hidden" name="id" value={section.id} />
              <input type="hidden" name="quotationId" value={quotationId} />
              <button
                type="submit"
                className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]"
                aria-label="Delete section"
                title="Delete section (lines become ungrouped)"
              >
                <Trash2 className="size-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-ink-secondary)]">
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium text-right">Qty</th>
              <th className="px-4 py-2 font-medium">UOM</th>
              <th className="px-4 py-2 font-medium text-right">Rate</th>
              <th className="px-4 py-2 font-medium text-right">Disc</th>
              <th className="px-4 py-2 font-medium text-right">GST</th>
              <th className="px-4 py-2 font-medium text-right">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-[var(--color-ink)]">{l.title}</div>
                  {(l.area || l.category) && (
                    <div className="text-xs text-[var(--color-ink-secondary)]">
                      {[l.area, l.category].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular">{Number(l.qty)}</td>
                <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">{uomLabel[l.uom as keyof typeof uomLabel] ?? l.uom}</td>
                <td className="px-4 py-2.5 text-right tabular">{inr(l.unit_price)}</td>
                <td className="px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">
                  {Number(l.discount_amount) > 0 ? inr(l.discount_amount) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">{Number(l.tax_rate)}%</td>
                <td className="px-4 py-2.5 text-right tabular font-medium">{inr(l.line_total)}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1">
                    <LineDialog
                      quotationId={quotationId}
                      sections={sections}
                      line={l}
                      trigger={
                        <button type="button" className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]" aria-label="Edit line">
                          <Pencil className="size-4" />
                        </button>
                      }
                    />
                    <form action={deleteLineAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="quotationId" value={quotationId} />
                      <button type="submit" className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]" aria-label="Delete line">
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-2">
        <LineDialog
          quotationId={quotationId}
          sections={sections}
          defaultSectionId={section?.id}
          trigger={
            <button type="button" className="inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]">
              <Plus className="size-3.5" /> Add line to {section ? section.title : "ungrouped"}
            </button>
          }
        />
      </div>
    </div>
  );
}

function TotalsCard({ quotation }: { quotation: Quotation }) {
  const mPct = marginPct(quotation.taxable_total, quotation.cost_total);
  return (
    <Card className="sticky top-6 p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Totals</h2>
      <dl className="flex flex-col gap-2 text-sm tabular">
        <Row label="Subtotal" value={inr(quotation.subtotal)} />
        <Row label="Discount" value={`− ${inr(quotation.discount_total)}`} />
        <Row label="Taxable" value={inr(quotation.taxable_total)} />
        {quotation.gst_treatment === "inter" ? (
          <Row label="IGST" value={inr(quotation.igst_total)} />
        ) : (
          <>
            <Row label="CGST" value={inr(quotation.cgst_total)} />
            <Row label="SGST" value={inr(quotation.sgst_total)} />
          </>
        )}
        <div className="mt-1 flex justify-between border-t border-[var(--color-border)] pt-2 text-base font-semibold text-[var(--color-ink)]">
          <dt>Grand total</dt>
          <dd>{inr(quotation.grand_total)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">
        {quotation.gst_treatment === "inter" ? "Inter-state supply · IGST" : "Intra-state supply · CGST + SGST"}
        {quotation.works_contract ? " · Works contract" : ""}
      </p>

      {/* Internal — never printed on the client document (VEYRA delta over Dzylo). */}
      <div className="mt-4 rounded-md border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] p-3">
        <p className="mb-2 text-xs font-medium text-[var(--color-ink-secondary)]">
          Internal · not printed
        </p>
        <dl className="flex flex-col gap-1.5 text-sm tabular text-[var(--color-ink-secondary)]">
          <Row label="Cost" value={inr(quotation.cost_total)} />
          <Row label="Margin" value={`${inr(quotation.margin_total)} · ${mPct}%`} />
        </dl>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-ink-secondary)]">{label}</dt>
      <dd className="text-right text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
