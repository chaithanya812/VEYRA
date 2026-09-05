import Link from "next/link";
import { ClipboardCheck, Plus, AlertTriangle } from "lucide-react";
import { listPurchaseOrders, vendorNames } from "@/lib/data/purchase-orders";
import { listVendors } from "@/lib/data/vendors";
import {
  ORDER_STATES,
  PAYMENT_STATES,
  ORDER_STATE_META,
  PAYMENT_STATE_META,
  isDeliveryOverdue,
  type PoTone,
} from "@/lib/po-model";
import type { PurchaseOrder } from "@/lib/po-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Select } from "@/components/ui/field";
import { fmtDate, inr } from "@/lib/utils";

/**
 * Two independent status machines, two chips per row (order vs payment).
 * Chips are green/amber/grey — red appears ONLY on the cancelled chip (true
 * terminal alert), the overdue delivery date, and the one primary action.
 */
const TONE_TO_CHIP: Record<PoTone, "neutral" | "green" | "amber" | "red"> = {
  neutral: "neutral",
  active: "amber",
  positive: "green",
  red: "red",
};

const TYPE_LABEL: Record<string, string> = {
  purchase_order: "PO",
  work_order: "Work order",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ os?: string | string[]; ps?: string; vendor?: string }>;
}) {
  const sp = await searchParams;
  const selOs = (Array.isArray(sp.os) ? sp.os : sp.os ? [sp.os] : []).filter(
    (s): s is (typeof ORDER_STATES)[number] =>
      (ORDER_STATES as readonly string[]).includes(s),
  );
  const ps =
    sp.ps && (PAYMENT_STATES as readonly string[]).includes(sp.ps) ? sp.ps : undefined;
  const vendorId = sp.vendor || undefined;

  const [orders, vendors] = await Promise.all([
    listPurchaseOrders({
      order_state: selOs.length === 1 ? selOs[0] : undefined,
      payment_state: ps,
      vendorId,
    }),
    listVendors(),
  ]);
  // Multi order-state selection filters locally (the data module takes one).
  const rows =
    selOs.length > 1
      ? orders.filter((o) => selOs.includes(o.order_state))
      : orders;
  const names = await vendorNames(rows.map((r) => r.vendor_id));
  const overdueCount = rows.filter((r) =>
    isDeliveryOverdue(r.delivery_date, r.order_state),
  ).length;

  const filtered = selOs.length > 0 || !!ps || !!vendorId;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Orders"
        subtitle={
          overdueCount > 0
            ? `${rows.length} purchase orders · ${overdueCount} overdue`
            : `${rows.length} purchase orders`
        }
        actions={
          <Link href="/orders/new">
            <Button variant="primary">
              <Plus className="size-4" /> Create Order
            </Button>
          </Link>
        }
      />

      {/* Filter bar — server-rendered GET form, no client JS. Order state is
          multi-select (checkboxes); payment + vendor are single.
          Keyed on the resolved filter: `defaultChecked`/`defaultValue` apply on
          mount only, so without this the controls keep the previous URL's state
          after a soft navigation and the next Filter press silently drops a
          filter (§11). Today's Reset is a hard nav, which hid it. */}
      <form
        method="get"
        key={`${selOs.join(",")}|${ps ?? ""}|${vendorId ?? ""}`}
        className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3"
      >
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="mb-1 w-full text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Order state
          </legend>
          {ORDER_STATES.map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 text-sm text-[var(--color-ink)]"
            >
              <input
                type="checkbox"
                name="os"
                value={s}
                defaultChecked={selOs.includes(s)}
                className="size-4 accent-[var(--color-ink)]"
              />
              {ORDER_STATE_META[s].label}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          <Select name="ps" defaultValue={ps ?? ""} className="w-44" aria-label="Payment state">
            <option value="">All payment states</option>
            {PAYMENT_STATES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATE_META[s].label}
              </option>
            ))}
          </Select>
          <Select name="vendor" defaultValue={vendorId ?? ""} className="w-52" aria-label="Vendor">
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {filtered && (
            <Link href="/orders">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="size-8" />}
          title={filtered ? "No orders match" : "No purchase orders yet"}
          description={
            filtered
              ? "No order is in every state, payment state and vendor you picked."
              : "Raise a standalone PO against a preferred vendor — lines carry your rates."
          }
          action={
            /* The way out of a filtered empty belongs inside the box — the
               filter bar is scrolled off above it. */
            filtered ? (
              <Link href="/orders">
                <Button variant="secondary">Clear all filters</Button>
              </Link>
            ) : (
              <Link href="/orders/new">
                <Button variant="primary">
                  <Plus className="size-4" /> Create Order
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Order name</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Order state</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Order date</th>
                  <th className="px-4 py-3 font-medium">Delivery date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((po) => (
                  <PoRow key={po.id} po={po} vendorLabel={names[po.vendor_id]} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function PoRow({ po, vendorLabel }: { po: PurchaseOrder; vendorLabel?: string }) {
  const overdue = isDeliveryOverdue(po.delivery_date, po.order_state);
  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40">
      <td className="px-4 py-3">
        <Link
          href={`/orders/${po.id}`}
          className="font-medium text-[var(--color-ink)] hover:underline"
        >
          {po.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {vendorLabel ?? po.vendor_id.slice(0, 8)}
      </td>
      <td className="px-4 py-3 text-right tabular text-[var(--color-ink)]">
        {inr(po.amount)}
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {TYPE_LABEL[po.type] ?? po.type}
      </td>
      <td className="px-4 py-3">
        <StatusChip
          tone={TONE_TO_CHIP[ORDER_STATE_META[po.order_state].tone]}
          label={ORDER_STATE_META[po.order_state].label}
        />
      </td>
      <td className="px-4 py-3">
        <StatusChip
          tone={TONE_TO_CHIP[PAYMENT_STATE_META[po.payment_state].tone]}
          label={PAYMENT_STATE_META[po.payment_state].label}
        />
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {po.project_label ?? "—"}
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
        {fmtDate(po.order_date)}
      </td>
      <td className="px-4 py-3 tabular">
        {po.delivery_date == null ? (
          <span className="text-[var(--color-ink-secondary)]">—</span>
        ) : overdue ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-red)]">
            <AlertTriangle className="size-3.5 shrink-0" />
            {fmtDate(po.delivery_date)}
          </span>
        ) : (
          <span className="text-[var(--color-ink)]">{fmtDate(po.delivery_date)}</span>
        )}
      </td>
    </tr>
  );
}
