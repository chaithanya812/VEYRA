import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { listWarehouses } from "@/lib/data/inventory";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import { StockInForm } from "./stock-in-form";

/**
 * Record stock-in (FEATURE-REGISTER PROC-WH-002): a warehouse, an optional
 * source-doc reference, and the line grid — each line captures HSN + GST% and
 * a user-entered unit rate (CONFIG, never AI), with the line total computed
 * purely. Optionally generates the GRN for the receipt.
 */
export default async function StockInPage() {
  const warehouses = await listWarehouses(true);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/inventory"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to inventory
      </Link>
      <PageHeader
        title="Record stock-in"
        subtitle="Lines reference your catalogue — anything uncatalogued is flagged unlisted so it can be promoted."
      />

      {warehouses.length === 0 ? (
        <EmptyState
          icon={<Boxes className="size-8" />}
          title="No active warehouses"
          description="Create a warehouse first — every movement books against one."
          action={
            <Link href="/inventory?tab=warehouses">
              <Button variant="primary">Go to warehouses</Button>
            </Link>
          }
        />
      ) : (
        <StockInForm
          warehouses={warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            project_label: w.project_label,
          }))}
        />
      )}
    </div>
  );
}
