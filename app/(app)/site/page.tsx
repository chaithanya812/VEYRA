import Link from "next/link";
import {
  ClipboardList,
  Camera,
  MapPin,
  Ruler,
} from "lucide-react";
import {
  listSiteLogs,
  listPhotos,
  listAttendance,
  listVariance,
} from "@/lib/data/site";
import { variancePct, varianceTone } from "@/lib/site-model";
import type { VarianceTone } from "@/lib/site-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { AddLogForm } from "./log-form";
import { listProjectOptions } from "@/lib/data/projects";
import { AddPhotoForm } from "./photo-form";
import { CheckInForm } from "./check-in-form";
import { AddVarianceForm } from "./variance-form";
import { checkOutAction } from "./actions";

/**
 * Site execution home (FEATURE-REGISTER OPS-SITE-001): daily logs with a photo
 * feed, geo check-in attendance, and measurement variance — measured vs quoted
 * being VEYRA's wedge.
 *
 * Red discipline (§Design): red appears ONLY as each tab's single primary
 * action and as the large-variance ALERT chip (|variance| ≥ 15% via
 * varianceTone). Small deviations are neutral/amber. Photos are pasted links
 * in v1 — no uploads.
 */

const TABS = [
  { key: "logs", label: "Daily logs", href: "/site" },
  { key: "photos", label: "Photos", href: "/site?tab=photos" },
  { key: "attendance", label: "Attendance", href: "/site?tab=attendance" },
  { key: "variance", label: "Measurement variance", href: "/site?tab=variance" },
];

const SUBTITLES: Record<string, string> = {
  logs: "The field engineers' daily work log, newest first.",
  photos: "Progress photos pasted as links (v1 — no file storage yet).",
  attendance: "Geo check-in/out for the crew on site.",
  variance: "Measured vs quoted quantities — the wedge no competitor tracks.",
};

const VARIANCE_CHIP_TONE: Record<VarianceTone, "neutral" | "amber" | "red"> = {
  neutral: "neutral",
  warning: "amber",
  alert: "red",
};

function qty(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function shortAuthor(id: string | null): string {
  return id ? id.slice(0, 8) : "—";
}

export default async function SitePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "logs";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Site execution" subtitle={SUBTITLES[tab]} />

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => {
          const active = t.key === tab;
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

      {tab === "logs" && <LogsTab />}
      {tab === "photos" && <PhotosTab />}
      {tab === "attendance" && <AttendanceTab />}
      {tab === "variance" && <VarianceTab />}
    </div>
  );
}

/* ── Daily logs ─────────────────────────────────────────────────────────────── */

async function LogsTab() {
  const [logs, projects] = await Promise.all([
    listSiteLogs(),
    listProjectOptions(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <AddLogForm projects={projects} />

      {logs.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title="No daily logs yet"
          description="Log today's site work above — it lands here and stays on record."
        />
      ) : (
        <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
          {logs.map((log) => (
            <div key={log.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-[var(--color-ink)] tabular">
                  {fmtDate(log.log_date)}
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--color-ink-secondary)] tabular">
                  {log.project_label && <span>{log.project_label}</span>}
                  <span title={log.author ?? undefined}>
                    by {shortAuthor(log.author)}
                  </span>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-ink)]">
                {log.work_summary}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ── Photos ─────────────────────────────────────────────────────────────────── */

async function PhotosTab() {
  const [photos, projects] = await Promise.all([
    listPhotos(),
    listProjectOptions(),
  ]);

  if (photos.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <AddPhotoForm projects={projects} />
        <EmptyState
          icon={<Camera className="size-8" />}
          title="No photos yet"
          description="Paste a hosted image URL above — progress shots build the site's visual record."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AddPhotoForm projects={projects} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <Card key={p.id} className="flex flex-col overflow-hidden">
            {/* Pasted external URL — no next/image domain allowlist in v1, no upload pipeline. */}
            <img
              src={p.url ?? ""}
              alt={p.caption ?? "Site photo"}
              className="h-36 w-full bg-[var(--color-surface-sunken)] object-cover"
            />
            <div className="flex flex-col gap-1 px-3 py-2">
              <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                {p.caption ?? "Untitled"}
              </p>
              <span className="flex items-center justify-between gap-2 text-xs text-[var(--color-ink-secondary)]">
                {p.project_label && (
                  <span className="truncate">{p.project_label}</span>
                )}
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 underline hover:text-[var(--color-ink)]"
                  >
                    Open link
                  </a>
                )}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── Attendance ─────────────────────────────────────────────────────────────── */

async function AttendanceTab() {
  const [rows, projects] = await Promise.all([
    listAttendance(),
    listProjectOptions(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <CheckInForm projects={projects} />

      {rows.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-8" />}
          title="No attendance yet"
          description="Check a crew member in above — coordinates attach when location is allowed."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Check-in</th>
                  <th className="px-4 py-3 font-medium">Check-out</th>
                  <th className="px-4 py-3 font-medium">Geo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const hasGeo =
                    r.lat != null && r.lng != null &&
                    Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng));
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        {r.member_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {r.project_label ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                        {fmtTime(r.check_in)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                        {fmtTime(r.check_out)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                        {hasGeo
                          ? `${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip
                          tone={r.check_out ? "neutral" : "green"}
                          label={r.check_out ? "Checked out" : "On site"}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!r.check_out && (
                          <form action={checkOutAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button type="submit" variant="secondary" size="sm">
                              Check out
                            </Button>
                          </form>
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
    </div>
  );
}

/* ── Measurement variance ─────────────────────────────────────────────────── */

async function VarianceTab() {
  const rows = await listVariance();

  return (
    <div className="flex flex-col gap-4">
      <AddVarianceForm />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Ruler className="size-8" />}
          title="No measurements yet"
          description="Record measured vs quoted quantities above — variance is computed, never guessed."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">UOM</th>
                  <th className="px-4 py-3 font-medium text-right">Quoted</th>
                  <th className="px-4 py-3 font-medium text-right">Measured</th>
                  <th className="px-4 py-3 font-medium text-right">Variance</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const quoted = Number(v.quoted_qty);
                  const measured = Number(v.measured_qty);
                  const pct = variancePct(quoted, measured);
                  const tone = varianceTone(pct);
                  const sign = pct > 0 ? "+" : "";
                  return (
                    <tr
                      key={v.id}
                      className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        {v.item_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {v.project_label ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {v.uom ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-ink)] tabular">
                        {qty(quoted)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-ink)] tabular">
                        {qty(measured)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span
                            className={
                              "font-medium tabular " +
                              (tone === "alert"
                                ? "text-[var(--color-red)]"
                                : "text-[var(--color-ink)]")
                            }
                          >
                            {sign}{pct}%
                          </span>
                          <StatusChip
                            tone={VARIANCE_CHIP_TONE[tone]}
                            label={
                              tone === "alert"
                                ? "Alert"
                                : tone === "warning"
                                  ? "Watch"
                                  : "OK"
                            }
                          />
                        </span>
                      </td>
                      <td className="max-w-72 truncate px-4 py-3 text-[var(--color-ink-secondary)]">
                        {v.note ?? "—"}
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
