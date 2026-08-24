import Link from "next/link";
import { Package, Plus, Search, Upload } from "lucide-react";
import { listItems, itemCounts } from "@/lib/data/items";
import { ITEM_TYPES, type ItemType } from "@/lib/items-model";
import { typeLabel, uomLabel } from "@/lib/items-ui";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/field";
import { inr } from "@/lib/utils";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const type = (ITEM_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as ItemType)
    : undefined;
  const q = sp.q?.trim() || undefined;

  const [items, counts] = await Promise.all([
    listItems({ type, q }),
    itemCounts(),
  ]);

  const filtered = q || type;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Items"
        subtitle={`${counts.total} items · ${counts.active} active`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/items/import">
              <Button variant="secondary">
                <Upload className="size-4" /> Import CSV
              </Button>
            </Link>
            <Link href="/items/new">
              <Button variant="primary">
                <Plus className="size-4" /> New item
              </Button>
            </Link>
          </div>
        }
      />

      {/* Filter bar — server-rendered GET form, no client JS. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-disabled)]" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, code, category, brand…"
            className="pl-9"
          />
        </div>
        <Select name="type" defaultValue={type ?? ""} className="w-44">
          <option value="">All types</option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel[t]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <Link href="/items">
            <Button type="button" variant="ghost">
              Clear
            </Button>
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="size-8" />}
          title={filtered ? "No items match" : "No items yet"}
          description={
            filtered
              ? "Try a different search or clear the filter."
              : "Build the catalogue every quotation, PO and BOM will reference."
          }
          action={
            !filtered && (
              <Link href="/items/new">
                <Button variant="primary">
                  <Plus className="size-4" /> New item
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium text-right">Rate</th>
                  <th className="px-4 py-3 font-medium text-right">GST</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/items/${it.id}`}
                        className="font-medium text-[var(--color-ink)] hover:underline"
                      >
                        {it.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                      {it.code ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {typeLabel[it.type]}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {it.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {uomLabel[it.base_uom]}
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {it.base_rate == null
                        ? "—"
                        : `${inr(it.base_rate)}/${uomLabel[it.base_uom]}`}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
                      {it.tax_rate}%
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        tone={it.is_active ? "green" : "neutral"}
                        label={it.is_active ? "Active" : "Inactive"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
