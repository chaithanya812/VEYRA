import Link from "next/link";
import { Package, Plus, Search, Upload, Library } from "lucide-react";
import { listItems, itemCounts, listItemTaxonomy } from "@/lib/data/items";
import { ITEM_TYPES, type ItemType } from "@/lib/items-model";
import { typeLabel, uomLabel } from "@/lib/items-ui";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/field";
import { inr } from "@/lib/utils";
import { importStarterCatalogueAction } from "./actions";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    category?: string;
    good_type?: string;
    imported?: string;
    skipped?: string;
    import_error?: string;
  }>;
}) {
  const sp = await searchParams;
  const type = (ITEM_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as ItemType)
    : undefined;
  const q = sp.q?.trim() || undefined;
  const category = sp.category?.trim() || undefined;
  const goodType = sp.good_type?.trim() || undefined;

  const [items, counts, taxonomy] = await Promise.all([
    listItems({ type, q, category, good_type: goodType }),
    itemCounts(),
    listItemTaxonomy(),
  ]);

  const filtered = q || type || category || goodType;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Items"
        subtitle={`${counts.total} items · ${counts.active} active`}
        actions={
          <div className="flex items-center gap-2">
            <form action={importStarterCatalogueAction}>
              <Button type="submit" variant="secondary">
                <Library className="size-4" /> Import starter catalogue
              </Button>
            </form>
            <Button asChild variant="secondary">
              <Link href="/items/import">
                <Upload className="size-4" /> Import CSV
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/items/new">
                <Plus className="size-4" /> New item
              </Link>
            </Button>
          </div>
        }
      />

      {sp.import_error && (
        <p className="mb-4 text-sm text-[var(--color-amber)]">{sp.import_error}</p>
      )}
      {sp.imported != null && !sp.import_error && (
        <p className="mb-4 text-sm text-[var(--color-ink-secondary)]">
          Starter catalogue: {sp.imported} created, {sp.skipped ?? "0"} already
          present.
        </p>
      )}

      {/* Filter bar — server-rendered GET form, no client JS. */}
      <form
        method="get"
        key={`${q ?? ""}|${type ?? ""}|${category ?? ""}|${goodType ?? ""}`}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <div className="relative flex-1 min-w-52">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-disabled)]" />
          <Input
            name="q"
            aria-label="Search items"
            defaultValue={q ?? ""}
            placeholder="Search name, code, category, brand, good type…"
            className="pl-9"
          />
        </div>
        <Select name="type" aria-label="Item type" defaultValue={type ?? ""} className="w-44">
          <option value="">All types</option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel[t]}
            </option>
          ))}
        </Select>
        <Select
          name="category"
          aria-label="Category"
          defaultValue={category ?? ""}
          className="w-44"
        >
          <option value="">All categories</option>
          {taxonomy.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          name="good_type"
          aria-label="Good type"
          defaultValue={goodType ?? ""}
          className="w-44"
        >
          <option value="">All good types</option>
          {taxonomy.goodTypes.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <Button asChild type="button" variant="ghost">
            <Link href="/items">
              Clear
            </Link>
          </Button>
        )}
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="size-8" />}
          title={filtered ? "No items match" : "No items yet"}
          description={
            filtered
              ? "Try a different search or clear the filter."
              : "Build the catalogue every quotation, PO and BOM will reference — or import the starter sample."
          }
          action={
            !filtered && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <form action={importStarterCatalogueAction}>
                  <Button type="submit" variant="secondary">
                    <Library className="size-4" /> Import starter catalogue
                  </Button>
                </form>
                <Button asChild variant="primary">
                  <Link href="/items/new">
                    <Plus className="size-4" /> New item
                  </Link>
                </Button>
              </div>
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
                  <th className="px-4 py-3 font-medium">Good type</th>
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
                      {it.good_type ?? "—"}
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
