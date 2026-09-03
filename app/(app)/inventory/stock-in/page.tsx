import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { listWarehouses } from "@/lib/data/inventory";
import { listVendors } from "@/lib/data/vendors";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import { StockInForm } from "./stock-in-form";

/**
 * Record a stock movement (FEATURE-REGISTER PROC-WH-002 · PLAN-V4 §10.2).
 *
 * A warehouse, a direction, an optional vendor and reference, and the line
 * grid — each line captures HSN + GST% and a user-entered unit rate (CONFIG,
 * never AI), with the line total computed purely. Posting always creates ONE
 * numbered document: a GRN inward, an issue note outward.
 *
 * The prefill comes off a queue row (`Deliveries StockIn`, `Expense StockIn`)
 * so the receipt keeps its link back to the delivery or the payment that
 * expected it. It is resolved from searchParams on the SERVER, because a
 * client component that fills itself in an effect renders the empty form first
 * and cannot be verified by fetching HTML.
 */
export default async function StockInPage({
  searchParams,
}: {
  searchParams: Promise<{
    warehouse?: string;
    vendor?: string;
    po?: string;
    payment?: string;
    ref?: string;
    direction?: string;
  }>;
}) {
  const [sp, warehouses, vendors] = await Promise.all([
    searchParams,
    listWarehouses({ activeOnly: true }),
    listVendors(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/inventory"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>
      <PageHeader
        title="Record stock movement"
        subtitle="Lines reference your catalogue — anything uncatalogued is flagged unlisted so it can be promoted."
      />

      {warehouses.length === 0 ? (
        <EmptyState
          icon={<Boxes className="size-8" />}
          title="No active warehouses"
          description="Create a warehouse first — every movement books against one."
          action={
            <Link href="/inventory">
              <Button variant="primary">Go to warehouses</Button>
            </Link>
          }
        />
      ) : (
        <StockInForm
          warehouses={warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            project_label: w.kind === "project" ? w.project_label : null,
          }))}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          prefill={{
            warehouseId: sp.warehouse,
            vendorId: sp.vendor,
            poId: sp.po,
            paymentId: sp.payment,
            reference: sp.ref,
            direction: sp.direction === "out" ? "out" : "in",
          }}
        />
      )}
    </div>
  );
}
