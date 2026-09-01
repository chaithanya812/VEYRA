import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  MILESTONE_STATUS_LABELS,
  rollupMilestones,
  statusOf,
  type ProjectMilestone,
} from "./milestones-model";

/**
 * The Progress Report (PLAN-V4 §8.3, frame `104636`).
 *
 * A **composable** export, not a fixed PDF: the user ticks what goes in and the
 * preview redraws. That matters because this document is the one thing that
 * actually reaches the client — VEYRA ships no client portal (PLAN-V4 §0), so
 * `client_visible` earns its keep right here. Choosing "Client visible only"
 * filters the milestone table to the rows the client is allowed to see.
 *
 * Same jsPDF + autotable path as the quotation PDF, and the same discipline:
 * this module lays out numbers it is handed and computes none of its own
 * beyond counting rows.
 */

export interface ReportOptions {
  projectName: boolean;
  startDate: boolean;
  handoverDate: boolean;
  actualProgress: boolean;
  totalDays: boolean;
  /** none = omit the table entirely. */
  milestones: "none" | "all" | "client_visible";
  sitePictures: "none" | "all" | "client_visible";
  labourChart: boolean;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  projectName: true,
  startDate: true,
  handoverDate: true,
  actualProgress: true,
  totalDays: true,
  milestones: "all",
  sitePictures: "all",
  labourChart: false,
};

export interface ReportProject {
  name: string;
  clientName: string | null;
  startDate: string | null;
  handoverDate: string | null;
}

export interface ReportData {
  project: ReportProject;
  milestones: ProjectMilestone[];
  /** Every site photo on record. */
  photoCount: number;
  /** The subset marked `client_visible` (PLAN-V4 §9.5). */
  clientVisiblePhotoCount: number;
  orgName: string;
}

/** Milestones the chosen audience is allowed to see. */
export function reportMilestones(
  milestones: ProjectMilestone[],
  mode: ReportOptions["milestones"],
): ProjectMilestone[] {
  if (mode === "none") return [];
  if (mode === "client_visible") return milestones.filter((m) => m.client_visible);
  return milestones;
}

/**
 * How many site photos this report would carry.
 *
 * The `client_visible` flag exists precisely here: "All site progress" is a
 * count of what the firm has, "Client visible only" is a count of what the
 * client is allowed to see, and those are different numbers on any real
 * project. Reading the same field for both would quietly ship the internal
 * snag photos with the progress report.
 */
export function reportPhotoCount(
  data: Pick<ReportData, "photoCount" | "clientVisiblePhotoCount">,
  mode: ReportOptions["sitePictures"],
): number {
  if (mode === "none") return 0;
  if (mode === "client_visible") return data.clientVisiblePhotoCount;
  return data.photoCount;
}

/** Photos held back by the current choice — shown so the gap is never silent. */
export function withheldPhotoCount(
  data: Pick<ReportData, "photoCount" | "clientVisiblePhotoCount">,
  mode: ReportOptions["sitePictures"],
): number {
  if (mode !== "client_visible") return 0;
  return Math.max(0, data.photoCount - data.clientVisiblePhotoCount);
}

/** Whole days from start to handover, inclusive of both ends. */
export function totalProjectDays(
  start: string | null,
  end: string | null,
): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(end.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

function fmt(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function generateProgressReport(
  data: ReportData,
  options: ReportOptions,
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.orgName, marginX, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Progress Report", marginX, y);
  doc.setTextColor(0);
  y += 24;

  // The four boxes across the top of `104636`.
  const rollup = rollupMilestones(data.milestones);
  const days = totalProjectDays(data.project.startDate, data.project.handoverDate);
  const boxes: [string, string][] = [];
  if (options.projectName) boxes.push(["Project", data.project.name]);
  if (options.startDate) boxes.push(["Start date", fmt(data.project.startDate)]);
  if (options.handoverDate) boxes.push(["Target handover", fmt(data.project.handoverDate)]);
  if (options.actualProgress) boxes.push(["Progress", `${rollup.actualPct}%`]);
  if (options.totalDays) boxes.push(["Total days", days == null ? "—" : String(days)]);

  if (boxes.length > 0) {
    autoTable(doc, {
      startY: y,
      body: boxes.map(([k, v]) => [k, v]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 120, textColor: [110, 110, 110] },
      },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  const rows = reportMilestones(data.milestones, options.milestones);
  if (options.milestones !== "none") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      options.milestones === "client_visible"
        ? "Milestones shared with you"
        : "Milestones",
      marginX,
      y,
    );
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [["Milestone", "Progress", "Planned", "Status", "Update"]],
      body:
        rows.length > 0
          ? rows.map((m) => [
              m.name,
              `${Number(m.progress_pct) || 0}%`,
              `${fmt(m.planned_start)} – ${fmt(m.planned_end)}`,
              MILESTONE_STATUS_LABELS[statusOf(m)],
              m.last_update ?? "—",
            ])
          : [["No milestones to show", "", "", "", ""]],
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [23, 23, 26], textColor: 255 },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  if (options.sitePictures !== "none") {
    const photos = reportPhotoCount(data, options.sitePictures);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      `${photos} site ${photos === 1 ? "photo" : "photos"} ${
        options.sitePictures === "client_visible" ? "shared with you" : "on record"
      }.`,
      marginX,
      y,
    );
    doc.setTextColor(0);
  }

  const safe = data.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`progress-report-${safe}.pdf`);
}
