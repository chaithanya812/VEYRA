"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import {
  DEFAULT_REPORT_OPTIONS,
  generateProgressReport,
  reportMilestones,
  reportPhotoCount,
  totalProjectDays,
  withheldPhotoCount,
  type ReportData,
  type ReportOptions,
} from "@/lib/progress-report";
import {
  MILESTONE_STATUS_LABELS,
  rollupMilestones,
  statusOf,
} from "@/lib/milestones-model";
import { fmtDate } from "@/lib/utils";

/**
 * Progress Report (PLAN-V4 §8.3, frame `104636`).
 *
 * Checkboxes on the left, a live preview on the right, and what you see is
 * what downloads. The two "client visible only" options are the reason the
 * `client_visible` flag exists at all: VEYRA ships no client portal, so this
 * document is what actually reaches the client, and it must be possible to
 * send it without leaking the internal plan.
 */
export function ReportBuilder({ data }: { data: ReportData }) {
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);

  const shown = useMemo(
    () => reportMilestones(data.milestones, options.milestones),
    [data.milestones, options.milestones],
  );
  const rollup = useMemo(() => rollupMilestones(data.milestones), [data.milestones]);
  const days = totalProjectDays(data.project.startDate, data.project.handoverDate);

  const set = <K extends keyof ReportOptions>(key: K, value: ReportOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const hiddenCount = data.milestones.length - shown.length;
  // The same two functions the PDF uses, so the preview cannot promise the
  // client a different number of photos from the one it sends.
  const photos = reportPhotoCount(data, options.sitePictures);
  const withheldPhotos = withheldPhotoCount(data, options.sitePictures);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Left rail — what goes in. */}
      <Card className="h-fit p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Preview settings
        </h2>

        <Group title="Project details">
          <Check label="Project name" checked={options.projectName} onChange={(v) => set("projectName", v)} />
          <Check label="Start date" checked={options.startDate} onChange={(v) => set("startDate", v)} />
          <Check label="Target handover" checked={options.handoverDate} onChange={(v) => set("handoverDate", v)} />
          <Check label="Actual progress" checked={options.actualProgress} onChange={(v) => set("actualProgress", v)} />
          <Check label="Total project days" checked={options.totalDays} onChange={(v) => set("totalDays", v)} />
        </Group>

        <Group title="Milestones">
          <Radio name="ms" label="No milestones" checked={options.milestones === "none"} onChange={() => set("milestones", "none")} />
          <Radio name="ms" label="All milestones" checked={options.milestones === "all"} onChange={() => set("milestones", "all")} />
          <Radio name="ms" label="Client visible only" checked={options.milestones === "client_visible"} onChange={() => set("milestones", "client_visible")} />
        </Group>

        <Group title="Site pictures">
          <Radio name="sp" label="No site progress" checked={options.sitePictures === "none"} onChange={() => set("sitePictures", "none")} />
          <Radio name="sp" label="All site progress" checked={options.sitePictures === "all"} onChange={() => set("sitePictures", "all")} />
          <Radio name="sp" label="Client visible only" checked={options.sitePictures === "client_visible"} onChange={() => set("sitePictures", "client_visible")} />
        </Group>

        <Button
          variant="primary"
          className="mt-4 w-full"
          onClick={() => generateProgressReport(data, options)}
        >
          <Download className="size-4" /> Download PDF
        </Button>
        <p className="mt-2 text-[11px] text-[var(--color-ink-secondary)]">
          The PDF may differ slightly from this preview — fonts and page breaks
          are laid out differently.
        </p>
      </Card>

      {/* Right — the live preview. */}
      <Card className="p-6">
        <p className="text-lg font-semibold text-[var(--color-ink)]">{data.orgName}</p>
        <p className="text-xs text-[var(--color-ink-secondary)]">Progress report</p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {options.projectName && <Box label="Project" value={data.project.name} />}
          {options.startDate && <Box label="Start" value={fmtDate(data.project.startDate)} />}
          {options.handoverDate && (
            <Box label="Target handover" value={fmtDate(data.project.handoverDate)} />
          )}
          {options.actualProgress && <Box label="Progress" value={`${rollup.actualPct}%`} />}
          {options.totalDays && (
            <Box label="Total days" value={days == null ? "—" : String(days)} />
          )}
        </div>

        {options.milestones !== "none" && (
          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                Milestones
              </h3>
              {options.milestones === "client_visible" && hiddenCount > 0 && (
                <span className="text-[12px] text-[var(--color-ink-secondary)]">
                  {hiddenCount} internal{" "}
                  {hiddenCount === 1 ? "milestone" : "milestones"} withheld
                </span>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center text-sm text-[var(--color-ink-secondary)]">
                {data.milestones.length === 0
                  ? "This project has no milestones yet."
                  : "No milestone is marked client-visible, so this report would show none."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                      <th className="py-2 font-medium">Milestone</th>
                      <th className="py-2 font-medium">Progress</th>
                      <th className="py-2 font-medium">Planned</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-[var(--color-border)] last:border-0"
                      >
                        <td className="py-2 pr-3 text-[var(--color-ink)]">{m.name}</td>
                        <td className="py-2 pr-3 tabular">
                          {Number(m.progress_pct) || 0}%
                        </td>
                        <td className="py-2 pr-3 tabular text-[var(--color-ink-secondary)]">
                          {fmtDate(m.planned_start)} – {fmtDate(m.planned_end)}
                        </td>
                        <td className="py-2 text-[var(--color-ink-secondary)]">
                          {MILESTONE_STATUS_LABELS[statusOf(m)]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {options.sitePictures !== "none" && (
          <p className="mt-6 text-[13px] text-[var(--color-ink-secondary)]">
            <span className="tabular">{photos}</span> site{" "}
            {photos === 1 ? "photo" : "photos"}{" "}
            {options.sitePictures === "client_visible"
              ? "shared with you"
              : "on record"}
            .
            {withheldPhotos > 0 && (
              <span className="tabular">
                {" "}
                {withheldPhotos} internal{" "}
                {withheldPhotos === 1 ? "photo" : "photos"} withheld.
              </span>
            )}
          </p>
        )}
      </Card>
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────────────────────────── */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-disabled)]">
        {title}
      </p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-red)]"
      />
      {label}
    </label>
  );
}

function Radio({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-[var(--color-red)]"
      />
      {label}
    </label>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
      <p className="text-[11px] text-[var(--color-ink-secondary)]">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--color-ink)]">
        {value}
      </p>
    </div>
  );
}
