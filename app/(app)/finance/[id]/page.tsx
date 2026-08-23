import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";
import {
  getContract,
  DIRECTION_META,
  MILESTONE_META,
  SOURCE_LABELS,
  milestonesFoot,
  sumBy,
  milestoneOverdue,
  pnl,
} from "@/lib/data/finance";
import { MilestoneToggle } from "./milestone-toggle";
import { PaymentForm } from "./payment-form";
import { Card, PageHeader, StatusChip } from "@/components/ui/primitives";
import { inr, fmtDate, cn } from "@/lib/utils";

const MODE_LABELS: Record<string, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getContract(id);
  if (!result) notFound();
  const { contract, milestones, payments } = result;

  const foot = milestonesFoot(milestones);
  const received = sumBy(
    payments.filter((p) => p.direction === "inflow"),
    (p) => Number(p.amount),
  );
  const paidOut = sumBy(
    payments.filter((p) => p.direction === "outflow"),
    (p) => Number(p.amount),
  );
  const net = pnl(received, paidOut);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/finance"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to finance
      </Link>

      <PageHeader
        title={contract.name}
        subtitle={`${SOURCE_LABELS[contract.source] ?? contract.source} contract · ${contract.project_label ?? "No project"} · created ${fmtDate(contract.created_at)}`}
      />

      {/* Contract cash tiles — SUMs of stored values only (HARD RULE 4). */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile
          icon={<Wallet className="size-4" />}
          label="Contract Value"
          value={inr(Number(contract.amount))}
        />
        <Tile icon={<Landmark className="size-4" />} label="Received" value={inr(received)} tone="green" />
        <Tile icon={<ReceiptText className="size-4" />} label="Paid Out" value={inr(paidOut)} tone="amber" />
        <div
          className={cn(
            "rounded-[var(--radius-card)] border p-5",
            net >= 0
              ? "border-[color-mix(in_srgb,var(--color-green)_25%,white)] bg-[var(--color-green-tint)]"
              : "border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)]",
          )}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)]">
            {net >= 0 ? (
              <CircleCheck className="size-4 text-[var(--color-green)]" />
            ) : (
              <CircleAlert className="size-4 text-[var(--color-red)]" />
            )}
            Net Cash
          </p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular",
              net >= 0 ? "text-[var(--color-green)]" : "text-[var(--color-red)]",
            )}
          >
            {inr(net)}
          </p>
        </div>
      </div>

      {/* Milestones */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Milestones
          </h2>
          <span
            className={cn(
              "text-[13px] font-medium tabular",
              foot.ok
                ? "text-[var(--color-green)]"
                : "text-[var(--color-red)]",
            )}
          >
            Σ {foot.total}%
          </span>
        </div>
        {milestones.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--color-ink-secondary)]">
            No milestones on this contract.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Milestone</th>
                  <th className="px-4 py-3 font-medium text-right">%</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Tentative due
                  </th>
                  <th className="px-4 py-3 font-medium">Work done</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => {
                  const meta = MILESTONE_META[m.work_done ? "done" : "pending"];
                  const overdue = milestoneOverdue(m.tentative_due, m.work_done);
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                    >
                      <td className="px-4 py-3 tabular text-[var(--color-ink-secondary)]">
                        {m.seq}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        {m.name}
                      </td>
                      <td className="px-4 py-3 text-right tabular text-[var(--color-ink-secondary)]">
                        {Number(m.pct)}%
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {inr(Number(m.amount))}
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        <span className="inline-flex items-center justify-end gap-2">
                          {overdue && (
                            <StatusChip tone="red" label="Overdue" />
                          )}
                          <span
                            className={cn(
                              overdue
                                ? "font-medium text-[var(--color-red)]"
                                : "text-[var(--color-ink-secondary)]",
                            )}
                          >
                            {fmtDate(m.tentative_due)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <StatusChip
                            tone={
                              meta.tone === "neutral"
                                ? "neutral"
                                : meta.tone === "green"
                                  ? "green"
                                  : meta.tone === "amber"
                                    ? "amber"
                                    : "red"
                            }
                            label={meta.label}
                          />
                          <MilestoneToggle
                            milestoneId={m.id}
                            contractId={contract.id}
                            workDone={m.work_done}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[13px]">
                  <td colSpan={2} className="px-4 py-3 font-medium">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        foot.ok
                          ? "text-[var(--color-green)]"
                          : "text-[var(--color-red)]",
                      )}
                    >
                      {foot.ok && (
                        <CircleCheck className="size-4 text-[var(--color-green)]" />
                      )}{" "}
                      Σ {foot.total}%
                    </span>
                  </td>
                  <td colSpan={2} className="px-4 py-3 text-right font-medium tabular">
                    {inr(sumBy(milestones, (m) => Number(m.amount)))}
                  </td>
                  <td colSpan={2} className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Payments */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
          Payments
        </h2>

        <PaymentForm
          contractId={contract.id}
          projectLabel={contract.project_label}
          milestones={milestones}
        />

        {payments.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-secondary)]">
            No payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Paid on</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const dir = DIRECTION_META[p.direction] ?? {
                    label: p.direction,
                    tone: "neutral" as const,
                  };
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                    >
                      <td className="px-4 py-3 tabular text-[var(--color-ink-secondary)]">
                        {fmtDate(p.paid_on)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip
                          tone={
                            dir.tone === "neutral"
                              ? "neutral"
                              : dir.tone === "green"
                                ? "green"
                                : dir.tone === "amber"
                                  ? "amber"
                                  : "red"
                          }
                          label={dir.label}
                        />
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {inr(Number(p.amount))}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {p.mode
                          ? (MODE_LABELS[p.mode] ?? p.mode)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {p.reference ?? "—"}
                      </td>
                      <td className="max-w-48 truncate px-4 py-3 text-[var(--color-ink-secondary)]">
                        {p.note ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "green" | "amber";
}) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)]">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular",
          tone === "green"
            ? "text-[var(--color-green)]"
            : tone === "amber"
              ? "text-[var(--color-amber)]"
              : "text-[var(--color-ink)]",
        )}
      >
        {value}
      </p>
    </Card>
  );
}
