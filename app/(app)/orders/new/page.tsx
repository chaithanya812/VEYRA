import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listVendors } from "@/lib/data/vendors";
import { PageHeader } from "@/components/ui/primitives";
import { NewPurchaseOrderForm } from "./new-order-form";

/**
 * Standalone/direct PO against a preferred vendor. The vendor list comes from
 * the org-scoped master (server side); everything else is the client form.
 */
export default async function NewOrderPage() {
  const vendors = await listVendors({ activeOnly: true });

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to orders
      </Link>
      <PageHeader
        title="New purchase order"
        subtitle="Rates are your own config — the amount is the pure sum of the line totals."
      />
      <NewPurchaseOrderForm
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
      />
    </div>
  );
}
