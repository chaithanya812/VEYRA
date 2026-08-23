import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Wallet,
  Landmark,
  ReceiptText,
} from "lucide-react";
import { getProject } from "@/lib/data/projects";
import {
  HEALTH_META,
  STAGE_LABELS,
  computePnl,
} from "@/lib/projects-model";
import { StageControl } from "./stage-control";
import { AddNoteForm } from "./note-form";
import { Card, PageHeader, StatusChip } from "@/components/ui/primitives";
import { inr, fmtDate, cn } from "@/lib/utils";

/** HEALTH_META tone (positive/warning/alert) → StatusChip tone. Red = true alert only. */
const healthChipTone = {
  positive: "green",
  warning: "amber",
  alert: "red",
} as const;

const MODULE_TABS = ["Details", "Finance", "Site", "Procurement"] as const;

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getProject(id);
  if (!result) notFound();
  const { project, updates } = result;

  const health = HEALTH_META[project.health];
  const pnl = computePnl(project);
  const progress = Math.min(
    100,
    Math.max(0, Number(project.physical_progress_pct) || 0),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to projects
      </Link>

      <PageHeader
        title={project.name}
        subtitle={`${project.client_name ?? "No client"} · ${fmtDate(project.start_date)} → ${fmtDate(project.handover_date)}`}
        actions={<StatusChip tone={healthChipTone[health.tone]} label={health.label} />}
      />

      {/* Module tab bar — only Details is live; the rest are declared "soon" like nav placeholders. */}
      <div className="mb-6 flex items-center gap-6 border-b border-[var(--color-border)]">
        {MODULE_TABS.map((tab, i) => {
          const active = i === 0;
          return active ? (
            <span
              key={tab}
              className="-mb-px border-b-2 border-[var(--color-red)] pb-2.5 text-sm font-medium text-[var(--color-red)]"
            >
              {tab}
            </span>
          ) : (
            <span
              key={tab}
              title="Coming soon"
              className="flex cursor-not-allowed select-none items-center gap-1.5 border-b-2 border-transparent pb-2.5 text-sm text-[var(--color-ink-disabled)]"
            >
              {tab}
              <span className="text-[10px] uppercase tracking-wide">soon</span>
            </span>
          );
        })}
      </div>

      {/* Physical progress */}
      <Card className="mb-6 p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Physical progress
          </h2>
          <span className="text-sm font-medium tabular text-[var(--color-ink-secondary)]">
            {progress}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
          <div
            className="h-full rounded-full bg-[var(--color-ink)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Card>

      {/* Financial tiles — SUMs of stored values only (HARD RULE 4). P&L: green ≥ 0, red < 0 (true alert). */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile icon={<Wallet className="size-4" />} label="Project Value" value={inr(project.project_value)} />
        <Tile icon={<Landmark className="size-4" />} label="Funds Received" value={inr(project.funds_received)} />
        <Tile icon={<ReceiptText className="size-4" />} label="Total Payable" value={inr(project.total_payable)} />
        <div
          className={cn(
            "rounded-[var(--radius-card)] border p-5",
            pnl >= 0
              ? "border-[color-mix(in_srgb,var(--color-green)_25%,white)] bg-[var(--color-green-tint)]"
              : "border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)]",
          )}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)]">
            {pnl >= 0 ? (
              <CircleCheck className="size-4 text-[var(--color-green)]" />
            ) : (
              <CircleAlert className="size-4 text-[var(--color-red)]" />
            )}
            P&amp;L
          </p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular",
              pnl >= 0 ? "text-[var(--color-green)]" : "text-[var(--color-red)]",
            )}
          >
            {inr(pnl)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Details + stage control */}
        <div className="flex flex-col gap-6 md:col-span-1">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Details
            </h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              <Row label="Client" value={project.client_name ?? "—"} />
              <Row label="Stage" value={STAGE_LABELS[project.stage]} />
              <Row label="City" value={project.city ?? "—"} />
              <Row label="State" value={project.state ?? "—"} />
              <Row label="Pincode" value={project.pincode ?? "—"} />
              <Row label="Address" value={project.address ?? "—"} />
              <Row label="Start" value={fmtDate(project.start_date)} />
              <Row label="Handover" value={fmtDate(project.handover_date)} />
              <Row label="Created" value={fmtDate(project.created_at)} />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Change stage
            </h2>
            <StageControl projectId={project.id} current={project.stage} />
          </Card>
        </div>

        {/* Updates feed */}
        <div className="md:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
              Updates
            </h2>

            <AddNoteForm projectId={project.id} />

            {updates.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-secondary)]">
                No updates yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-4">
                {updates.map((u) => (
                  <li key={u.id} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--color-border-strong)]" />
                    <div>
                      <p className="text-sm text-[var(--color-ink)]">
                        {u.note ?? u.kind}
                      </p>
                      <p className="text-xs text-[var(--color-ink-secondary)]">
                        {fmtDate(u.created_at)} · {u.kind.replace("_", " ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)]">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
        {value}
      </p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-ink-secondary)]">{label}</dt>
      <dd className="text-right text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
