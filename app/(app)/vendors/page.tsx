import Link from "next/link";
import { Truck, Plus, RotateCcw } from "lucide-react";
import { listVendors, vendorFilterOptions } from "@/lib/data/vendors";
import {
  VENDOR_STATUSES,
  VENDOR_STATUS_META,
  WORKING_MODELS,
  WORKING_MODEL_LABELS,
  categorySummary,
  vendorStatusOf,
  workingModelOf,
  type VendorStatus,
  type VendorTone,
  type WorkingModel,
} from "@/lib/vendors-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/field";

/**
 * Vendors (PLAN-V4 §10.3, frames `110146` / `110215`).
 *
 * Columns and filters are the frame's: `Vendor Name · Phone no. · City ·
 * Category (+n) · Working Model · Status · Action`, filtered by
 * `Category · Working Model · Status · Country · State · City` with a Reset.
 *
 * Two things are deliberately not the frame's.
 *
 * 1. **Status is a chip with a dot AND a label**, and it is never red.
 *    `Created` is not an alarm, it is a vendor somebody has not got to yet
 *    (DESIGN-DIRECTION §7 lists colour-only chips as a mistake to fix).
 *
 * 2. **Category is multi-valued and says so.** `110215` shows
 *    `Carpentry Woodwork + 2`; here the `+2` carries a tooltip with the rest,
 *    because a cell that silently shows one of three trades makes a
 *    three-trade vendor look like a one-trade vendor to anyone scanning.
 *
 * The whole filter band is a GET form — server-rendered, shareable as a URL,
 * and verifiable by fetching HTML.
 */
const STATUS_TONE: Record<VendorTone, "neutral" | "green" | "amber"> = {
  neutral: "neutral",
  active: "amber",
  positive: "green",
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    model?: string;
    status?: string;
    country?: string;
    state?: string;
    city?: string;
    q?: string;
    active?: string;
  }>;
}) {
  const sp = await searchParams;

  const workingModel = (WORKING_MODELS as readonly string[]).includes(
    sp.model ?? "",
  )
    ? (sp.model as WorkingModel)
    : undefined;
  const status = (VENDOR_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as VendorStatus)
    : undefined;

  const filter = {
    category: sp.category || undefined,
    workingModel,
    status,
    country: sp.country || undefined,
    state: sp.state || undefined,
    city: sp.city || undefined,
    query: sp.q || undefined,
    activeOnly: sp.active === "1",
  };

  const [vendors, all, options] = await Promise.all([
    listVendors(filter),
    listVendors(),
    vendorFilterOptions(),
  ]);

  const filtered = Object.values(filter).some(Boolean);
  const byStatus = (s: VendorStatus) =>
    all.filter((v) => vendorStatusOf(v.status) === s).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Vendors"
        subtitle={`${all.length} vendors · ${byStatus("onboarded")} onboarded · ${byStatus("verified")} verified · ${byStatus("created")} not checked yet`}
        actions={
          <Link href="/vendors/new">
            <Button variant="primary">
              <Plus className="size-4" /> New Vendor
            </Button>
          </Link>
        }
      />

      {/* The frame's filter band. A GET form: no client JS, and the filtered
          view is a URL somebody can send to a colleague. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <FilterSelect name="category" label="Category" value={sp.category}>
          {options.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect name="model" label="Working Model" value={sp.model}>
          {WORKING_MODELS.map((m) => (
            <option key={m} value={m}>
              {WORKING_MODEL_LABELS[m]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect name="status" label="Status" value={sp.status}>
          {VENDOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {VENDOR_STATUS_META[s].label}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect name="country" label="Country" value={sp.country}>
          {options.countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect name="state" label="State" value={sp.state}>
          {options.states.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect name="city" label="City" value={sp.city}>
          {options.cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Search
          </span>
          <Input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name, phone, contact"
            className="h-9 w-52 text-[13px]"
          />
        </label>

        <label className="flex h-9 items-center gap-2 text-[13px] text-[var(--color-ink)]">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={filter.activeOnly}
            className="size-4 accent-[var(--color-ink)]"
          />
          Active only
        </label>

        <Button type="submit" variant="secondary" className="h-9">
          Filter
        </Button>
        {filtered && (
          <Link href="/vendors">
            <Button type="button" variant="ghost" className="h-9">
              <RotateCcw className="size-3.5" /> Reset
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
              ? "Nothing matches every filter at once. Reset and narrow one at a time."
              : "Add the parties you buy from — rate contracts, POs and vendor contracts all hang off this master."
          }
          action={
            filtered ? (
              <Link href="/vendors">
                <Button variant="secondary">
                  <RotateCcw className="size-4" /> Reset filters
                </Button>
              </Link>
            ) : (
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
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2 font-medium">Vendor Name</th>
                  <th className="px-4 py-2 font-medium">Phone no.</th>
                  <th className="px-4 py-2 font-medium">City</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Working Model</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const cats = categorySummary(v.categories);
                  const meta = VENDOR_STATUS_META[vendorStatusOf(v.status)];
                  return (
                    <tr
                      key={v.id}
                      className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/vendors/${v.id}`}
                          className="font-medium text-[var(--color-ink)] hover:underline"
                        >
                          {v.name}
                        </Link>
                        {!v.is_active && (
                          <span className="ml-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                            archived
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                        {v.phone ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                        {v.city ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                        {cats.first ?? "—"}
                        {cats.overflow > 0 && (
                          <span
                            className="ml-1.5 rounded-full bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-ink)]"
                            title={v.categories.join(", ")}
                          >
                            +{cats.overflow}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                        {WORKING_MODEL_LABELS[workingModelOf(v.working_model)]}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip
                          tone={STATUS_TONE[meta.tone]}
                          label={meta.label}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/vendors/${v.id}/projects`}
                          className="text-[12px] text-[var(--color-ink)] underline-offset-2 hover:underline"
                        >
                          Projects
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
        {label}
      </span>
      <Select
        name={name}
        defaultValue={value ?? ""}
        className="h-9 w-44 text-[13px]"
      >
        <option value="">All</option>
        {children}
      </Select>
    </label>
  );
}
