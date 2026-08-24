import Link from "next/link";
import { Truck, Plus } from "lucide-react";
import { listVendors } from "@/lib/data/vendors";
import {
  VENDOR_CATEGORIES,
  vendorRatingLabel,
} from "@/lib/vendors-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Select } from "@/components/ui/field";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; active?: string }>;
}) {
  const sp = await searchParams;
  const category =
    sp.category && (VENDOR_CATEGORIES as readonly string[]).includes(sp.category)
      ? sp.category
      : undefined;
  const activeOnly = sp.active === "1";

  const [vendors, all] = await Promise.all([
    listVendors({ category, activeOnly }),
    listVendors(),
  ]);
  const counts = {
    total: all.length,
    active: all.filter((v) => v.is_active).length,
  };

  const filtered = activeOnly || !!category;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Vendors"
        subtitle={`${counts.total} vendors · ${counts.active} active`}
        actions={
          <Link href="/vendors/new">
            <Button variant="primary">
              <Plus className="size-4" /> New Vendor
            </Button>
          </Link>
        }
      />

      {/* Filter bar — server-rendered GET form, no client JS. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <Select name="category" defaultValue={sp.category ?? ""} className="w-52">
          <option value="">All categories</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <label className="flex h-10 items-center gap-2 text-sm text-[var(--color-ink)]">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={activeOnly}
            className="size-4 accent-[var(--color-ink)]"
          />
          Active only
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <Link href="/vendors">
            <Button type="button" variant="ghost">
              Clear
            </Button>
          </Link>
        )}
      </form>

      {vendors.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-8" />}
          title={filtered ? "No vendors match" : "No vendors yet"}
          description={
            filtered
              ? "Try a different category or clear the filter."
              : "Add the parties you buy from — rate contracts and POs hang off this master."
          }
          action={
            !filtered && (
              <Link href="/vendors/new">
                <Button variant="primary">
                  <Plus className="size-4" /> New Vendor
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Contact person</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">GSTIN</th>
                  <th className="px-4 py-3 font-medium">Rating</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/vendors/${v.id}`}
                        className="font-medium text-[var(--color-ink)] hover:underline"
                      >
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {v.contact_person ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                      {v.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {v.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular uppercase">
                      {v.gstin ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-3 tabular ${
                        v.rating == null
                          ? "text-[var(--color-ink-disabled)]"
                          : "text-[var(--color-ink)]"
                      }`}
                    >
                      {vendorRatingLabel(v.rating)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        tone={v.is_active ? "green" : "neutral"}
                        label={v.is_active ? "Active" : "Inactive"}
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
