import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  ScrollText,
  UserRound,
} from "lucide-react";
import { getVendor, getVendorProjects } from "@/lib/data/vendors";
import {
  VENDOR_STATUS_META,
  WORKING_MODEL_LABELS,
  nextVendorStatuses,
  vendorRatingLabel,
  vendorStatusOf,
  workingModelOf,
  type VendorTone,
} from "@/lib/vendors-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { AddRateContractForm } from "./add-rate-contract-form";
import {
  deactivateVendorAction,
  addRateContractAction,
  setVendorStatusAction,
} from "../actions";
import { inr, fmtDate } from "@/lib/utils";

/**
 * Vendor Data (PLAN-V4 §10.3, frame `110227`).
 *
 * The frame is three module cards — `Basic Details` · `Vendor Projects` ·
 * `Vendor Documents` — over an info bar. Two of the three are real here.
 *
 * ⛔ `Vendor Documents` IS NOT BUILT, and the reason is a schema decision
 *    nobody has taken yet. This codebase has ONE file model
 *    (`project_files`, 0029) and `project_id` on it is NOT NULL — every file
 *    belongs to exactly one project, which is the isolation guarantee three
 *    modules lean on. A vendor's GST certificate belongs to no project.
 *    Relaxing that column, or adding a fifth attachment table, are both real
 *    choices with consequences, and quietly making one to fill a card would be
 *    the worse outcome. The card says so rather than 404-ing or pretending.
 */
const STATUS_TONE: Record<VendorTone, "neutral" | "green" | "amber"> = {
  neutral: "neutral",
  active: "amber",
  positive: "green",
};

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getVendor(id);
  if (!result) notFound();
  const { vendor, contracts } = result;

  // The Vendor Projects card shows its own headline figure, so it is read
  // here rather than making somebody click to find out there is nothing.
  const { rows: projectRows, totals } = await getVendorProjects(id);

  const status = vendorStatusOf(vendor.status);
  const meta = VENDOR_STATUS_META[status];
  const advance = nextVendorStatuses(status);

  const subtitleParts = [
    vendor.categories.length > 0 ? vendor.categories.join(", ") : "No category",
    WORKING_MODEL_LABELS[workingModelOf(vendor.working_model)],
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
            <StatusChip tone={STATUS_TONE[meta.tone]} label={meta.label} />
            {!vendor.is_active && (
              <StatusChip tone="neutral" label="Archived" />
            )}
            {/* Created → Verified → Onboarded, forward only. The server
                re-checks the step, because "we checked their GSTIN" is a thing
                that happened and a dropdown does not un-happen it. */}
            {advance.map((next) => (
              <form key={next} action={setVendorStatusAction}>
                <input type="hidden" name="id" value={vendor.id} />
                <input type="hidden" name="status" value={next} />
                <Button type="submit" variant="secondary" size="sm">
                  Mark {VENDOR_STATUS_META[next].label.toLowerCase()}
                </Button>
              </form>
            ))}
            {vendor.is_active && (
              <form action={deactivateVendorAction}>
                <input type="hidden" name="id" value={vendor.id} />
                <Button type="submit" variant="danger" size="sm">
                  Archive
                </Button>
              </form>
            )}
          </div>
        }
      />

      {/* The frame's three module cards (`110227`). */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ModuleCard
          icon={<UserRound className="size-5" />}
          title="Basic Details"
          detail={meta.hint}
        />
        <ModuleCard
          icon={<Briefcase className="size-5" />}
          title="Vendor Projects"
          detail={
            projectRows.length === 0
              ? "Not on any project yet"
              : `${projectRows.length} ${projectRows.length === 1 ? "project" : "projects"} · ${inr(totals.committed)} committed`
          }
          href={`/vendors/${vendor.id}/projects`}
        />
        <ModuleCard
          icon={<FileText className="size-5" />}
          title="Vendor Documents"
          detail="Not built — every file in VEYRA belongs to a project, and a vendor's paperwork does not"
          muted
        />
      </div>

      {/* Details */}
      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Details
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Contact person" value={vendor.contact_person ?? "—"} />
          <Row label="Phone" value={vendor.phone ?? "—"} />
          <Row label="Email" value={vendor.email ?? "—"} />
          <Row
            label="Working model"
            value={WORKING_MODEL_LABELS[workingModelOf(vendor.working_model)]}
          />
          <Row
            label="Categories"
            value={
              vendor.categories.length > 0 ? vendor.categories.join(", ") : "—"
            }
            muted={vendor.categories.length === 0}
          />
          <Row label="Country" value={vendor.country ?? "—"} />
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


/**
 * One of `110227`'s module cards. A card that leads nowhere says so plainly
 * instead of looking clickable — a control that does nothing is worse than an
 * absent one.
 */
function ModuleCard({
  icon,
  title,
  detail,
  href,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href?: string;
  muted?: boolean;
}) {
  const body = (
    <Card
      className={
        "flex h-full items-start gap-3 p-4 " +
        (href
          ? "transition-colors hover:border-[var(--color-border-strong)]"
          : muted
            ? "border-dashed"
            : "")
      }
    >
      <span
        className={
          muted
            ? "text-[var(--color-ink-disabled)]"
            : "text-[var(--color-ink-secondary)]"
        }
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={
            "block text-sm font-medium " +
            (muted ? "text-[var(--color-ink-secondary)]" : "text-[var(--color-ink)]")
          }
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--color-ink-secondary)]">
          {detail}
        </span>
      </span>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
