import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, ClipboardCheck } from "lucide-react";
import {
  getPurchaseOrder,
  getOrgBranding,
  vendorNames,
  ORDER_STATES,
  PAYMENT_STATES,
} from "@/lib/data/purchase-orders";
import { getPaymentPlan, getPoTerms, getPoTemplate } from "@/lib/data/po-config";
import { getVendor } from "@/lib/data/vendors";
import { DownloadPoButton } from "@/components/download-po-button";
import type { PoPdfData } from "@/lib/po-pdf";
import { deriveTreatment } from "@/lib/quotations-model";
import {
  ORDER_STATE_META,
  PAYMENT_STATE_META,
  isDeliveryOverdue,
  type PoTone,
} from "@/lib/po-model";
import { allocateMilestoneAmounts } from "@/lib/po-plan-model";
import {
  updateOrderStateAction,
  updatePaymentStateAction,
} from "../actions";
import { ReceiveGoodsForm } from "./receive-goods-form";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate, inr } from "@/lib/utils";

/**
 * PO detail — TWO independent state machines get TWO chips and TWO controls.
 * Chips are green/amber/grey; red appears only on the cancelled chip (true
 * alert), the overdue delivery date, and the one primary action (Receive
 * goods) on this screen.
 */
const TONE_TO_CHIP: Record<PoTone, "neutral" | "green" | "amber" | "red"> = {
  neutral: "neutral",
  active: "amber",
  positive: "green",
  red: "red",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPurchaseOrder(id);
  if (!result) notFound();
  const { po, lines, receipts } = result;

  const [names, plan, terms, template, branding, vendorRow] = await Promise.all([
    vendorNames([po.vendor_id]),
    po.payment_plan_id ? getPaymentPlan(po.payment_plan_id) : Promise.resolve(null),
    po.po_terms_id ? getPoTerms(po.po_terms_id) : Promise.resolve(null),
    getPoTemplate(),
    getOrgBranding(),
    getVendor(po.vendor_id),
  ]);
  const vendor = vendorRow?.vendor ?? null;
  const vendorLabel = vendor?.name ?? names[po.vendor_id] ?? po.vendor_id.slice(0, 8);
  const documentNumber = (po.number && po.number.trim()) || po.name;
  const vendorAddress = vendor
    ? [vendor.address, vendor.city, vendor.state, vendor.pincode].filter(Boolean).join(", ") || null
    : null;
  const vendorContact = vendor
    ? [vendor.contact_person, vendor.phone].filter(Boolean).join("   |   ") || null
    : null;
  const gstTreatment =
    deriveTreatment(branding.gstin?.slice(0, 2), vendor?.gstin?.slice(0, 2)) ?? "intra";
  const pdfData: PoPdfData = {
    number: po.number,
    name: po.name,
    orderDate: po.order_date,
    deliveryDate: po.delivery_date,
    seller: { name: branding.name, gstin: branding.gstin },
    vendor: {
      name: vendorLabel,
      gstin: vendor?.gstin ?? null,
      address: vendorAddress,
      contact: vendorContact,
    },
    projectLabel: po.project_label,
    lines: lines.map((l) => ({
      item_name: l.item_name,
      uom: l.uom,
      qty: Number(l.qty),
      unit_rate: Number(l.unit_rate),
      tax_pct: Number(l.tax_pct),
    })),
    amount: Number(po.amount),
    paymentMilestones: plan
      ? plan.milestones.map((m) => ({ label: m.label, pct: Number(m.pct) }))
      : [],
    termsTitle: terms?.title ?? null,
    termsBody: terms?.body ?? null,
    template: {
      footer_note: template.footer_note,
      signature_label: template.signature_label,
      logo_url: template.logo_url,
      signature_url: template.signature_url,
      show_tax_column: template.show_tax_column,
      show_uom_column: template.show_uom_column,
      show_payment_plan: template.show_payment_plan,
      show_terms: template.show_terms,
      show_bank_details: template.show_bank_details,
      bank_details: template.bank_details,
    },
    gstTreatment,
  };
  const planRows =
    plan && plan.milestones.length > 0
      ? allocateMilestoneAmounts(plan.milestones, po.amount)
      : [];

  const overdue = isDeliveryOverdue(po.delivery_date, po.order_state);
  const orderMeta = ORDER_STATE_META[po.order_state];
  const paymentMeta = PAYMENT_STATE_META[po.payment_state];

  // Received-to-date per line across ALL receipt batches.
  const receivedByLine: Record<string, number> = {};
  for (const r of receipts) {
    for (const rl of r.lines) {
      receivedByLine[rl.po_line_id] =
        (receivedByLine[rl.po_line_id] ?? 0) + (Number(rl.qty_received) || 0);
    }
  }
  const receivables = lines.map((l) => ({
    id: l.id,
    item_name: l.item_name,
    uom: l.uom,
    qty_ordered: Number(l.qty),
    qty_outstanding: Math.max(Number(l.qty) - (receivedByLine[l.id] ?? 0), 0),
  }));

  const lineName: Record<string, string> = {};
  for (const l of lines) lineName[l.id] = l.item_name;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to orders
      </Link>

      <PageHeader
        title={po.name}
        subtitle={po.number ? po.number : undefined}
        actions={
          <>
            <StatusChip tone={TONE_TO_CHIP[orderMeta.tone]} label={orderMeta.label} />
            <StatusChip tone={TONE_TO_CHIP[paymentMeta.tone]} label={paymentMeta.label} />
            <DownloadPoButton data={pdfData} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Details + the two state-machine controls ─────────────────── */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Details
            </h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              <Row label="Number" value={documentNumber} />
              <Row label="Vendor" value={vendorLabel} />
              <Row label="Type" value={po.type === "work_order" ? "Work order" : "Purchase order"} />
              <Row label="Project" value={po.project_label ?? "—"} />
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-ink-secondary)]">Amount</dt>
                <dd className="text-right font-medium tabular text-[var(--color-ink)]">
                  {inr(po.amount)}
                </dd>
              </div>
              <Row label="Order date" value={fmtDate(po.order_date)} />
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-ink-secondary)]">Delivery date</dt>
                <dd className="text-right">
                  {po.delivery_date == null ? (
                    <span className="text-[var(--color-ink)]">—</span>
                  ) : overdue ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-red)]">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {fmtDate(po.delivery_date)}
                      <span className="sr-only">(overdue)</span>
                    </span>
                  ) : (
                    <span className="text-[var(--color-ink)]">{fmtDate(po.delivery_date)}</span>
                  )}
                </dd>
              </div>
              <Row label="Created" value={fmtDate(po.created_at)} />
            </dl>
            {po.remarks && (
              <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-ink-secondary)]">
                {po.remarks}
              </p>
            )}
          </Card>

          {/* Fulfilment machine */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Order state{" "}
              <span className="font-normal text-[var(--color-ink-secondary)]">
                · fulfilment
              </span>
            </h2>
            <form action={updateOrderStateAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={po.id} />
              <Field label="Move to state" htmlFor="order_state">
                <Select id="order_state" name="state" defaultValue={po.order_state}>
                  {ORDER_STATES.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_STATE_META[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary" size="sm">
                Update order state
              </Button>
            </form>
          </Card>

          {/* Payment machine — independent of fulfilment */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Payment state{" "}
              <span className="font-normal text-[var(--color-ink-secondary)]">
                · money
              </span>
            </h2>
            <form action={updatePaymentStateAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={po.id} />
              <Field label="Move to state" htmlFor="payment_state">
                <Select id="payment_state" name="state" defaultValue={po.payment_state}>
                  {PAYMENT_STATES.map((s) => (
                    <option key={s} value={s}>
                      {PAYMENT_STATE_META[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary" size="sm">
                Update payment state
              </Button>
            </form>
          </Card>

          {plan && planRows.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                Payment plan
              </h2>
              <p className="mb-3 text-xs text-[var(--color-ink-secondary)]">
                {plan.name}
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {planRows.map((row, i) => (
                  <li key={`${row.label}-${i}`} className="flex justify-between gap-4">
                    <span className="text-[var(--color-ink)]">
                      {row.label}{" "}
                      <span className="text-[var(--color-ink-secondary)]">
                        ({Number(row.pct)}%)
                      </span>
                    </span>
                    <span className="tabular font-medium text-[var(--color-ink)]">
                      {inr(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between gap-4 border-t border-[var(--color-border)] pt-3 text-sm">
                <span className="text-[var(--color-ink-secondary)]">Total</span>
                <span className="tabular font-semibold text-[var(--color-ink)]">
                  {inr(Number(po.amount))}
                </span>
              </div>
            </Card>
          )}

          {terms && (
            <Card className="p-5">
              <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                Terms &amp; conditions
              </h2>
              <p className="mb-2 text-sm font-medium text-[var(--color-ink)]">
                {terms.title}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink-secondary)]">
                {terms.body}
              </p>
            </Card>
          )}
        </div>

        {/* ── Lines + receiving ────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
              Lines{" "}
              <span className="font-normal text-[var(--color-ink-secondary)]">
                ({lines.length})
              </span>
            </h2>

            {lines.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="size-8" />}
                title="No lines on this order"
                description="The order was created without line items."
              />
            ) : (
              <div className="max-h-[50vh] overflow-x-auto overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                      <th className="px-3 py-3 font-medium">S.No</th>
                      <th className="px-3 py-3 font-medium">Item</th>
                      <th className="px-3 py-3 font-medium">UOM</th>
                      <th className="px-3 py-3 text-right font-medium">Qty</th>
                      <th className="px-3 py-3 text-right font-medium">Received</th>
                      <th className="px-3 py-3 text-right font-medium">Rate ₹</th>
                      <th className="px-3 py-3 text-right font-medium">Tax %</th>
                      <th className="px-3 py-3 text-right font-medium">Total ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const received = receivedByLine[l.id] ?? 0;
                      return (
                        <tr
                          key={l.id}
                          className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                        >
                          <td className="px-3 py-2.5 tabular text-[var(--color-ink-secondary)]">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">{l.item_name}</td>
                          <td className="px-3 py-2.5 text-[var(--color-ink-secondary)]">{l.uom ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[var(--color-ink)]">{Number(l.qty)}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">{received}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[var(--color-ink)]">{Number(l.unit_rate)}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">{Number(l.tax_pct)}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[var(--color-ink)]">{inr(Number(l.line_total))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
                Receive goods
              </h3>
              {receivables.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-secondary)]">
                  Add lines first — there is nothing to receive against.
                </p>
              ) : (
                <ReceiveGoodsForm
                  poId={po.id}
                  disabled={po.order_state === "cancelled"}
                  lines={receivables}
                />
              )}
            </div>
          </Card>

          {/* ── Receipt history ──────────────────────────────────────── */}
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
              Receipts{" "}
              <span className="font-normal text-[var(--color-ink-secondary)]">
                ({receipts.length})
              </span>
            </h2>

            {receipts.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-secondary)]">
                No goods received yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {receipts.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-[var(--color-border)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--color-ink)]">
                        {fmtDate(r.received_at)}{" "}
                        <span className="font-normal text-[var(--color-ink-secondary)]">
                          · {r.mode === "vendor" ? "confirmed by vendor" : "logged by us"}
                        </span>
                      </p>
                      <span className="text-xs tabular text-[var(--color-ink-secondary)]">
                        {r.received_at.slice(11, 16)}
                      </span>
                    </div>
                    <ul className="mt-2 flex flex-col gap-1 text-[13px] text-[var(--color-ink-secondary)]">
                      {r.lines.map((rl) => (
                        <li key={rl.id} className="flex justify-between gap-4">
                          <span className="truncate">{lineName[rl.po_line_id] ?? rl.po_line_id.slice(0, 8)}</span>
                          <span className="tabular text-[var(--color-ink)]">
                            +{Number(rl.qty_received)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {r.note && (
                      <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-ink-secondary)]">
                        {r.note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
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
