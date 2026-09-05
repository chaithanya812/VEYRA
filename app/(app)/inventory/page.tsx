import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getInventory } from "@/lib/data/inventory";
import { inventoryTabOf, type InventoryTab } from "@/lib/inventory-model";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { AddWarehouseDialog } from "./warehouse-form";
import { InventoryView } from "./inventory-view";

/**
 * Inventory Management (PLAN-V4 §10.2, frames `110109` / `110101`).
 *
 * Tabs Warehouse/Site · Deliveries StockIn · Expense StockIn · Transaction
 * History, plus the frame's `Material Search` as a fifth tab rather than a
 * second red button (DESIGN-DIRECTION §7).
 *
 * The tab is resolved on the SERVER from `?tab=`. A client component that
 * picks its tab in an effect server-renders the wrong one and cannot be
 * verified by fetching HTML.
 */
const SUBTITLES: Record<InventoryTab, string> = {
  warehouses:
    "Company godowns and project site stores. A project's stock is never shared with another project.",
  deliveries:
    "What procurement says arrived, against what has actually been booked into a warehouse.",
  expense:
    "Project expenses flagged as material arriving on site, waiting for their goods.",
  history:
    "Every numbered stock note. Qty and Amount are summed from the ledger — neither is stored.",
  materials:
    "Current stock is a projection over the movement ledger, never a stored counter.",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; archived?: string }>;
}) {
  const { tab: tabParam, archived } = await searchParams;
  const tab = inventoryTabOf(tabParam);
  const includeArchived = archived === "1";

  const data = await getInventory(includeArchived);

  // Every warehouse can hold a location, so every one is a candidate parent.
  const parents = [...data.company, ...data.projects, ...data.orphaned].map((w) => ({
    id: w.id,
    name: w.project_label ? `${w.name} — ${w.project_label}` : w.name,
    kind: w.kind,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory"
        subtitle={SUBTITLES[tab]}
        actions={
          <div className="flex items-center gap-2">
            {/* One filled primary per tab. `110109` puts a second red button
                here (`Material Search`, outlined red) — the fix, not the copy. */}
            <Button asChild variant="secondary">
              <Link href="/inventory?tab=materials">
                <Search className="size-4" /> Material search
              </Link>
            </Button>
            {tab === "warehouses" ? (
              <AddWarehouseDialog
                projects={data.projectOptions}
                parents={parents}
              />
            ) : (
              <Button asChild variant="primary">
                <Link href="/inventory/stock-in">
                  <Plus className="size-4" /> Record stock movement
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <InventoryView data={data} tab={tab} includeArchived={includeArchived} />
    </div>
  );
}
