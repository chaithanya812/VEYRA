import Link from "next/link";
import { PackageOpen, Plus, AlertTriangle } from "lucide-react";
import { listMaterialRequests, mrCreatorNames } from "@/lib/data/material-requests";
import {
  MR_STAGE_META,
  isOverdue,
  type MaterialRequest,
  type MRTone,
} from "@/lib/material-requests-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";

/**
 * Stage chips are green/amber/grey ONLY (MR_STAGE_META has no red tone) — red
 * is reserved (§Design); its single status job on this screen is the overdue
 * delivery alert.
 */
const TONE_TO_CHIP: Record<MRTone, "neutral" | "green" | "amber"> = {
  neutral: "neutral",
  muted: "neutral",
  active: "amber",
  positive: "green",
};

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const draftsOnly = tab === "draft";
  const [requests, creators] = await Promise.all([
    listMaterialRequests(draftsOnly ? { draftsOnly: true } : undefined),
    listMaterialRequests().then((rows) =>
      mrCreatorNames(rows.map((r) => r.created_by)),
    ),
  ]);
  const overdueCount = requests.filter((r) => isOverdue(r.expected_delivery, r.stage)).length;

  const tabs = [
    { key: "all", label: "All Requests", href: "/procurement" },
    { key: "draft", label: "Draft", href: "/procurement?tab=draft" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Procurement"
        subtitle={
          overdueCount > 0
            ? `${requests.length} material requests · ${overdueCount} overdue`
            : `${requests.length} material requests`
        }
        actions={
          <Link href="/procurement/new">
            <Button variant="primary">
              <Plus className="size-4" /> Raise Request
            </Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--color-border)]">
        {tabs.map((t) => {
          const active = (t.key === "draft") === draftsOnly;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={
                "border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors " +
                (active
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="size-8" />}
          title={draftsOnly ? "No draft requests" : "No material requests yet"}
          description={
            draftsOnly
              ? "Drafts park here until the site team raises them."
              : "No material requests yet — raise one."
          }
          action={
            <Link href="/procurement/new">
              <Button variant="primary">
                <Plus className="size-4" /> Raise Request
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Expected Delivery</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Created By</th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((mr) => (
                  <MrRow key={mr.id} mr={mr} creatorLabel={creators[mr.created_by ?? ""]} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function MrRow({ mr, creatorLabel }: { mr: MaterialRequest; creatorLabel?: string }) {
  const overdue = isOverdue(mr.expected_delivery, mr.stage);
  const meta = MR_STAGE_META[mr.stage];
  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40">
      <td className="px-4 py-3">
        <Link
          href={`/procurement/${mr.id}`}
          className="font-medium text-[var(--color-ink)] hover:underline tabular"
          title={mr.id}
        >
          {mr.id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">{mr.title}</td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {mr.project_label ?? "—"}
      </td>
      <td className="px-4 py-3">
        {mr.expected_delivery == null ? (
          <span className="text-[var(--color-ink-secondary)]">—</span>
        ) : overdue ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-red)]">
            <AlertTriangle className="size-3.5 shrink-0" />
            {fmtDate(mr.expected_delivery)}
          </span>
        ) : (
          <span className="text-[var(--color-ink)]">{fmtDate(mr.expected_delivery)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusChip tone={TONE_TO_CHIP[meta.tone]} label={meta.label} />
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {creatorLabel ?? mr.created_by?.slice(0, 8) ?? "—"}
      </td>
      <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
        {fmtDate(mr.created_at)}
      </td>
    </tr>
  );
}
