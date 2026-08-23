import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ScrollText } from "lucide-react";
import { getVendor } from "@/lib/data/vendors";
import { vendorRatingLabel } from "@/lib/vendors-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { AddRateContractForm } from "./add-rate-contract-form";
import { deactivateVendorAction, addRateContractAction } from "../actions";
import { inr, fmtDate } from "@/lib/utils";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getVendor(id);
  if (!result) notFound();
  const { vendor, contracts } = result;

  const subtitleParts = [
    vendor.category ?? "No category",
    vendor.gstin ? `GSTIN ${vendor.gstin}` : "No GSTIN",
    `Rating: ${vendorRatingLabel(vendor.rating)}`,
    `Updated ${fmtDate(vendor.updated_at)}`,
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/vendors"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to vendors
      </Link>

      <PageHeader
        title={vendor.name}
        subtitle={subtitleParts.join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip
              tone={vendor.is_active ? "green" : "neutral"}
              label={vendor.is_active ? "Active" : "Inactive"}
            />
            {vendor.is_active && (
              <form action={deactivateVendorAction}>
                <input type="hidden" name="id" value={vendor.id} />
                <Button type="submit" variant="danger" size="sm">
                  Deactivate
                </Button>
              </form>
            )}
          </div>
        }
      />

      {/* Details */}
      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Details
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Contact person" value={vendor.contact_person ?? "—"} />
          <Row label="Phone" value={vendor.phone ?? "—"} />
          <Row label="Email" value={vendor.email ?? "—"} />
          <Row label="Payment terms" value={vendor.payment_terms ?? "—"} />
          <Row label="Lead time" value={vendor.lead_time_days != null ? `${vendor.lead_time_days} days` : "—"} />
          <Row
            label="Rating"
            value={vendorRatingLabel(vendor.rating)}
            muted={vendor.rating == null}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-ink-secondary)]">Address</dt>
              <dd className="text-right text-[var(--color-ink)]">
                {addressLine(vendor) || "—"}
              </dd>
            </div>
          </div>
        </dl>
      </Card>

      {/* Rate contracts — rate is CONFIG the user entered, shown ₹ with Indian grouping. */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">
          Rate contracts
        </h2>

        {contracts.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="size-7" />}
            title="No rate contracts yet"
            description="Record negotiated rates per item so RFQs and POs start from agreed numbers."
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">UOM</th>
                  <th className="px-4 py-3 font-medium text-right">Rate ₹</th>
                  <th className="px-4 py-3 font-medium text-right">MOQ</th>
                  <th className="px-4 py-3 font-medium text-right">Lead time</th>
                  <th className="px-4 py-3 font-medium">Valid range</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                      {c.item_name ?? (c.item_id ? `Item ${c.item_id.slice(0, 8)}…` : "—")}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {c.uom ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{inr(Number(c.rate))}</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--color-ink-secondary)]">
                      {c.moq == null ? "—" : Number(c.moq).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-[var(--color-ink-secondary)]">
                      {c.lead_time_days != null ? `${c.lead_time_days} d` : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                      {c.valid_from || c.valid_to
                        ? `${fmtDate(c.valid_from)} – ${fmtDate(c.valid_to)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AddRateContractForm vendorId={vendor.id} action={addRateContractAction} />
      </Card>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-ink-secondary)]">{label}</dt>
      <dd
        className={`text-right ${
          muted ? "text-[var(--color-ink-disabled)]" : "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function addressLine(v: {
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}): string {
  return [v.address, v.city, v.state, v.pincode]
    .filter((p): p is string => !!p && p.trim() !== "")
    .join(", ");
}
