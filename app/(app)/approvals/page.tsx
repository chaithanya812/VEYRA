import Link from "next/link";
import { CheckCircle2, Inbox, Settings2 } from "lucide-react";
import {
  listRequests,
  approvalUserNames,
} from "@/lib/data/approvals";
import {
  APPROVAL_STATUSES,
  MODULE_LABELS,
  STATUS_META,
  type ApprovalModule,
  type ApprovalStatus,
} from "@/lib/approvals-model";
import { Button } from "@/components/ui/button";
import {
  Card,
  PageHeader,
  StatusChip,
  EmptyState,
} from "@/components/ui/primitives";
import { inr, fmtDate } from "@/lib/utils";
import { RequestActions } from "./request-actions";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  pending: {
    title: "Nothing awaiting approval",
    description:
      "Drafts at or above a module's threshold land here for sign-off.",
  },
  approved: {
    title: "No approved requests yet",
    description: "Decisions you approve will appear here with who decided.",
  },
  rejected: {
    title: "No rejected requests",
    description: "Rejected drafts stay here as a ledger of what was declined.",
  },
  all: {
    title: "No approval requests yet",
    description:
      "Raise a draft above a threshold in Procurement, Quotations or Finance.",
  },
};

function isTabKey(value: string | undefined): value is TabKey {
  return TABS.some((t) => t.key === value);
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab: TabKey = isTabKey(tab) ? tab : "pending";

  const [requests, names] = await Promise.all([
    listRequests(
      activeTab === "all"
        ? undefined
        : { status: activeTab as ApprovalStatus },
    ),
    listRequests().then((rows) =>
      approvalUserNames(rows.flatMap((r) => [r.requested_by, r.decided_by])),
    ),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Approvals"
        subtitle={`${requests.length} request${requests.length === 1 ? "" : "s"} · threshold rules per module`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/approvals/rules">
              <Settings2 className="size-4" /> Rules
            </Link>
          </Button>
        }
      />

      {/* Tabs — Pending / Approved / Rejected / All */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.key === "pending" ? "/approvals" : `/approvals?tab=${t.key}`}
              className={
                "border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors " +
                (isActive
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
          icon={
            activeTab === "approved" ? (
              <CheckCircle2 className="size-8" />
            ) : (
              <Inbox className="size-8" />
            )
          }
          title={EMPTY_COPY[activeTab].title}
          description={EMPTY_COPY[activeTab].description}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Module</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium text-right">Requested at</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const meta = STATUS_META[r.status];
                  const requester = r.requested_by ? names[r.requested_by] : undefined;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        {MODULE_LABELS[r.module as ApprovalModule] ?? r.module}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--color-ink)]">
                          {r.entity_label ?? r.entity_id?.slice(0, 8) ?? "—"}
                        </span>
                        {r.decision_comment && (
                          <span
                            className="ml-2 text-xs text-[var(--color-ink-secondary)]"
                            title={r.decision_comment}
                          >
                            “{r.decision_comment.length > 40
                              ? r.decision_comment.slice(0, 40) + "…"
                              : r.decision_comment}”
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular text-[var(--color-ink)]">
                        {inr(Number(r.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip tone={meta.tone} label={meta.label} />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {requester ?? r.requested_by?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular text-[var(--color-ink-secondary)]">
                        {fmtDate(r.requested_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === "pending" ? (
                          <RequestActions id={r.id} />
                        ) : (
                          <span className="text-xs text-[var(--color-ink-disabled)]">
                            Decided {fmtDate(r.decided_at)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-3 text-xs text-[var(--color-ink-secondary)]">
        Statuses: {APPROVAL_STATUSES.map((s) => STATUS_META[s].label).join(" · ")}.
        A rejection always records the reason.
      </p>
    </div>
  );
}
