#!/usr/bin/env node
/**
 * Generate the client-facing build status report as a PDF.
 *
 *   node scripts/client-report.mjs [out.pdf]
 *
 * Same toolchain the product itself uses for quotations and the progress
 * report (jsPDF + autotable), so the document looks like it came out of VEYRA
 * rather than out of a word processor.
 *
 * The figures at the bottom are the six gates. Re-run them before regenerating
 * this — a status report carrying stale numbers is worse than none.
 */
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ── VEYRA's palette (app/globals.css) ─────────────────────────────────────
   Red keeps its closed list of jobs: here it is the rule under the masthead
   and the two items that need the client to act. Delivered is green,
   outstanding is amber, everything else is ink and grey. */
const INK = [23, 23, 26];
const INK2 = [86, 86, 94];
const INK3 = [139, 139, 147];
const LINE = [230, 230, 233];
const RED = [214, 18, 43];
const GREEN = [19, 122, 63];
const GREEN_T = [231, 244, 236];
const AMBER = [154, 103, 0];
const AMBER_T = [251, 241, 220];
const SLATE = [107, 107, 115];
const SLATE_T = [240, 240, 242];

const REPORT_DATE = "3 September 2026";
const LIVE_URL = "veyra-five-beta.vercel.app";

const doc = new jsPDF({ unit: "pt", format: "a4" });
const PW = doc.internal.pageSize.getWidth();
const PH = doc.internal.pageSize.getHeight();
const M = 48;
const W = PW - M * 2;
let y = 0;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const setInk = (c) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

/** Start a new page when `needed` points would run past the footer. */
function room(needed) {
  if (y + needed > PH - 64) {
    doc.addPage();
    y = M + 8;
  }
}

function heading(text) {
  room(56);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setInk(INK);
  doc.text(text, M, y);
  y += 16;
}

function lede(text) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setInk(INK2);
  const lines = doc.splitTextToSize(text, W * 0.78);
  room(lines.length * 13 + 8);
  doc.text(lines, M, y);
  y += lines.length * 13 + 8;
}

function eyebrow(text, atY = y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setInk(INK3);
  doc.text(text.toUpperCase(), M, atY, { charSpace: 0.8 });
}

/* ── Masthead ─────────────────────────────────────────────────────────────── */

y = M + 6;
setFill(RED);
doc.rect(M, y, 34, 3, "F");
y += 20;

eyebrow(`Build status  ·  ${REPORT_DATE}`);
y += 22;

doc.setFont("helvetica", "bold");
doc.setFontSize(26);
setInk(INK);
doc.text("VEYRA build ledger", M, y);
y += 22;

doc.setFont("helvetica", "normal");
doc.setFontSize(10.5);
setInk(INK2);
const stand = doc.splitTextToSize(
  "Where the platform stands today: stages 0 through 8 of 12 are built, tested and " +
    "running on the live environment. This is what is working, what is still to come, " +
    "and the three things worth knowing before the next stage starts.",
  W * 0.82,
);
doc.text(stand, M, y);
y += stand.length * 14 + 12;

// Meta strip
setDraw(LINE);
doc.setLineWidth(0.75);
doc.line(M, y, M + W, y);
y += 14;

doc.setFontSize(8.5);
const meta = [
  ["Live at", LIVE_URL],
  ["Stages", "0–8 of 12 delivered"],
  ["Screens live", "63"],
];
let mx = M;
for (const [k, v] of meta) {
  doc.setFont("helvetica", "bold");
  setInk(INK3);
  doc.text(k, mx, y);
  const kw = doc.getTextWidth(k);
  doc.setFont("helvetica", "normal");
  setInk(INK2);
  doc.text(v, mx + kw + 6, y);
  mx += kw + 6 + doc.getTextWidth(v) + 26;
}
y += 24;

/* ── Progress band ────────────────────────────────────────────────────────── */

const BAND_H = 74;
setFill([247, 247, 248]);
setDraw(LINE);
doc.roundedRect(M, y, W, BAND_H, 5, 5, "FD");

let by = y + 20;
eyebrow("Delivery stages", by);
doc.setFont("helvetica", "bold");
doc.setFontSize(11);
setInk(INK);
doc.text("9 of 13 complete", M + W - 14, by, { align: "right" });

// The bar, mirroring the segmented count bars inside the product.
by += 12;
const barW = W - 28;
const doneW = barW * (9 / 13);
setFill([211, 211, 216]);
doc.roundedRect(M + 14, by, barW, 7, 3.5, 3.5, "F");
setFill(GREEN);
doc.roundedRect(M + 14, by, doneW, 7, 3.5, 3.5, "F");

by += 24;
doc.setFontSize(8.5);
setFill(GREEN);
doc.circle(M + 17, by - 2.5, 3, "F");
doc.setFont("helvetica", "normal");
setInk(INK2);
doc.text("Delivered and live", M + 25, by);
doc.setFont("helvetica", "bold");
setInk(INK);
doc.text("9", M + 25 + doc.getTextWidth("Delivered and live ") + 4, by);

setFill([211, 211, 216]);
doc.circle(M + 150, by - 2.5, 3, "F");
doc.setFont("helvetica", "normal");
setInk(INK2);
doc.text("Remaining", M + 158, by);
doc.setFont("helvetica", "bold");
setInk(INK);
doc.text("4", M + 158 + doc.getTextWidth("Remaining ") + 4, by);

y += BAND_H + 26;

/* ── Delivered ────────────────────────────────────────────────────────────── */

heading("What is delivered");
lede(
  "Stages 0 through 8. Each was checked against the reference screens, verified " +
    "against the live database, and deployed.",
);

const delivered = [
  [
    "00–03",
    "Foundations, navigation and design system",
    "Grouped two-level menus, the shared component set every screen is built from, and a colour system where red means one of five specific things and nothing else.",
  ],
  [
    "04–05",
    "Leads, follow-ups and pipeline",
    "Completing a follow-up proposes the next status and the next date for a person to confirm. The pipeline is a funnel over a grouped table showing how long each deal has been sitting.",
  ],
  [
    "06",
    "The scope spine",
    "One shared record of scope that quotations, material requests, purchase orders and site work all point at — so a line quoted in March is the same line ordered in June.",
  ],
  [
    "07",
    "Projects and the client progress report",
    "The project list with live milestone progress, the project workspace, and a report you compose by ticking what the client should see, then export as a PDF.",
  ],
  [
    "08",
    "The eight project modules",
    "Documents, plan, financial planning, payments, site progress, labour and procurement — each scoped to one project and unable to see another's. Listed overleaf.",
  ],
];

autoTable(doc, {
  startY: y,
  head: [["Stage", "What it is", "Status"]],
  body: delivered.map(([s, t, d]) => [s, { content: `${t}\n${d}`, styles: {} }, "Live"]),
  theme: "plain",
  styles: {
    font: "helvetica",
    fontSize: 9,
    cellPadding: { top: 8, right: 8, bottom: 8, left: 0 },
    textColor: INK2,
    lineColor: LINE,
    lineWidth: { bottom: 0.75 },
    valign: "top",
  },
  headStyles: {
    fontSize: 7.5,
    fontStyle: "bold",
    textColor: INK3,
    lineWidth: { bottom: 0.75 },
  },
  columnStyles: {
    0: { cellWidth: 46, textColor: INK3, fontSize: 8.5 },
    1: { cellWidth: "auto" },
    2: { cellWidth: 56, textColor: GREEN, fontStyle: "bold", fontSize: 8.5 },
  },
  margin: { left: M, right: M },
  // The module name sits on the first line of the cell in ink; the sentence
  // under it is secondary. autoTable has no rich text, so it is drawn back on.
  didParseCell: (data) => {
    if (data.section === "body" && data.column.index === 1) {
      data.cell.styles.textColor = INK2;
    }
  },
  didDrawCell: (data) => {
    if (data.section === "body" && data.column.index === 1) {
      const title = String(data.cell.raw.content).split("\n")[0];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      setInk(INK);
      doc.text(title, data.cell.x, data.cell.y + 8 + 7);
      doc.setFont("helvetica", "normal");
    }
  },
});
y = doc.lastAutoTable.finalY + 20;

/* ── The modules ──────────────────────────────────────────────────────────── */

heading("Inside a project");

const modules = [
  [
    "Designs & documents",
    "Private file storage with real version history. Reviewers pin numbered comments onto a drawing, on two separate threads — one internal, one for the client.",
  ],
  [
    "Project plan",
    "Milestones, a Gantt view and real dependencies between tasks, plus an assisted planner that drafts a schedule for a person to edit and accept.",
  ],
  [
    "Financial planning",
    "Client and vendor contracts with percentage payment schedules that must total 100%. An amount due appears only once the work is marked done.",
  ],
  [
    "Project payments",
    "Expenses and funds with their own analytics. Corrections are reversing entries, never deletions — the record of what happened stays intact.",
  ],
  [
    "Site progress",
    "Photos grouped by the day the work was photographed, each marked visible to the client or not, each with its own chat thread.",
  ],
  [
    "Labour report",
    "Daily headcount split by skilled, unskilled and coordinator, broken down by trade, vendor and contract — every chart paired with the numbers behind it.",
  ],
  [
    "Procurement",
    "Requests, RFQs, orders and deliveries. A request tracks each line separately, so one request can be part ordered, part in stock and part still waiting.",
  ],
  [
    "Quotations",
    "A builder with templates, version comparison, a shareable client link and a GST-correct PDF. An approved quotation raises the material request in one step.",
  ],
];

autoTable(doc, {
  startY: y,
  body: modules.map(([t, d]) => [{ content: `${t}\n${d}` }]),
  theme: "plain",
  styles: {
    font: "helvetica",
    fontSize: 9,
    cellPadding: { top: 7, right: 6, bottom: 7, left: 0 },
    textColor: INK2,
    lineColor: LINE,
    lineWidth: { bottom: 0.75 },
    valign: "top",
  },
  columnStyles: { 0: { cellWidth: "auto" } },
  margin: { left: M, right: M },
  didDrawCell: (data) => {
    if (data.section === "body") {
      const title = String(data.cell.raw.content).split("\n")[0];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      setInk(INK);
      doc.text(title, data.cell.x, data.cell.y + 7 + 7);
      doc.setFont("helvetica", "normal");
    }
  },
});
y = doc.lastAutoTable.finalY + 20;

/* ── Remaining ────────────────────────────────────────────────────────────── */

heading("What is still to be built");
lede(
  "Stages 9 through 12, in the order they will be delivered. Each depends on the one before it.",
);

const remaining = [
  [
    "09",
    "Company-wide procurement, inventory and vendors",
    "The same procurement data seen across every project at once; warehouses split into company and project stock with goods-received numbering; and the vendor record — payment history, outstanding balances and which projects each vendor is on.",
    "Next",
  ],
  [
    "10",
    "HR, users and permission enforcement",
    "Attendance, leave and work-from-home approvals; the user list with a real reporting line; and — the largest single piece of work left — making the permission settings actually govern what each role can do, plus a full audit trail.",
    "Planned",
  ],
  [
    "11",
    "Accounting and finance",
    "The payments dashboard across all projects, petty expenses per person, and account receivables — which reads the payment schedules already captured in financial planning, so nothing is entered twice.",
    "Planned",
  ],
  [
    "12",
    "Reports and polish",
    "The reporting suite, saved views and CSV export on every list, an accessibility pass, and a final review of the whole interface for consistency.",
    "Planned",
  ],
];

autoTable(doc, {
  startY: y,
  head: [["Stage", "What it is", "Status"]],
  body: remaining.map(([s, t, d, st]) => [s, { content: `${t}\n${d}` }, st]),
  theme: "plain",
  styles: {
    font: "helvetica",
    fontSize: 9,
    cellPadding: { top: 8, right: 8, bottom: 8, left: 0 },
    textColor: INK2,
    lineColor: LINE,
    lineWidth: { bottom: 0.75 },
    valign: "top",
  },
  headStyles: {
    fontSize: 7.5,
    fontStyle: "bold",
    textColor: INK3,
    lineWidth: { bottom: 0.75 },
  },
  columnStyles: {
    0: { cellWidth: 46, textColor: INK3, fontSize: 8.5 },
    1: { cellWidth: "auto" },
    2: { cellWidth: 56, fontStyle: "bold", fontSize: 8.5 },
  },
  margin: { left: M, right: M },
  didParseCell: (data) => {
    if (data.section === "body" && data.column.index === 2) {
      data.cell.styles.textColor = data.cell.raw === "Next" ? AMBER : SLATE;
    }
  },
  didDrawCell: (data) => {
    if (data.section === "body" && data.column.index === 1) {
      const title = String(data.cell.raw.content).split("\n")[0];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      setInk(INK);
      doc.text(title, data.cell.x, data.cell.y + 8 + 7);
      doc.setFont("helvetica", "normal");
    }
  },
});
y = doc.lastAutoTable.finalY + 22;

/* ── Worth knowing ────────────────────────────────────────────────────────── */

heading("Worth knowing now");
lede(
  "Three open items. None blocks the next stage, and each needs a decision rather than more code.",
);

const notes = [
  [
    "Action",
    RED,
    "Permissions are configurable but not yet enforced",
    "Roles and permissions can be set up today and the settings save correctly — but the system does not yet act on them. Stage 10 makes them real. Until then, treat every signed-in user as having full access.",
  ],
  [
    "Action",
    RED,
    "Two hosting limits on the live environment",
    "The AI-assisted features need their API keys added in the hosting dashboard before they will run in production. Separately, uploads above roughly 4.5 MB succeed locally but are rejected by the host, which affects large drawings and phone photos. Both are configuration, not rework.",
  ],
  [
    "By design",
    SLATE,
    "There is no client login, and that is deliberate",
    "Clients do not get an account. The progress report is what reaches them, which is why every photo, milestone and labour day carries a visible-to-client switch. Staff sign-in is currently disabled so the preview can be opened without credentials.",
  ],
];

for (const [tag, tone, title, body] of notes) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(body, W - 84);
  const h = 20 + lines.length * 12 + 12;
  room(h + 10);

  setFill(tone);
  doc.rect(M, y, 2.5, h, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setInk(tone);
  doc.text(tag.toUpperCase(), M + 12, y + 14, { charSpace: 0.6 });

  doc.setFontSize(10);
  setInk(INK);
  doc.text(title, M + 74, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setInk(INK2);
  doc.text(lines, M + 74, y + 29);

  y += h + 8;
}

y += 12;

/* ── Verification ─────────────────────────────────────────────────────────── */

heading("How this is verified");
lede(
  "Every stage has to pass the same six checks before it is called done. These are the current figures, re-run on the live database.",
);

const figures = [
  ["560", "automated tests"],
  ["142", "database isolation checks"],
  ["11", "file storage checks"],
  ["63", "screens compiled"],
  ["0", "type or lint errors"],
];

room(72);
const fw = W / figures.length;
figures.forEach(([n, label], i) => {
  const x = M + i * fw;
  setFill([247, 247, 248]);
  setDraw(LINE);
  doc.roundedRect(x, y, fw - 8, 52, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  setInk(INK);
  doc.text(n, x + 10, y + 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setInk(INK2);
  doc.text(doc.splitTextToSize(label, fw - 24), x + 10, y + 36);
});
y += 52 + 18;

doc.setFont("helvetica", "normal");
doc.setFontSize(9.5);
setInk(INK2);
const closing = doc.splitTextToSize(
  "The isolation checks are the important ones: they prove, against the real database, " +
    "that one company cannot see another's data and one project cannot reach another's " +
    "files, folders, photos, labour or orders — the rule you asked for at the start. " +
    "Project 1 and project 2 can't share the same folders.",
  W * 0.82,
);
room(closing.length * 13 + 10);
doc.text(closing, M, y);
y += closing.length * 13 + 16;

doc.setFontSize(9.5);
setInk(INK);
doc.setFont("helvetica", "bold");
room(28);
doc.text(
  `Next up is stage 9 — company-wide procurement, inventory and the vendor record.`,
  M,
  y,
);
y += 14;
doc.setFont("helvetica", "normal");
setInk(INK2);
doc.text(`The live build is at ${LIVE_URL}.`, M, y);

/* ── Footers ──────────────────────────────────────────────────────────────── */

const pages = doc.getNumberOfPages();
for (let p = 1; p <= pages; p++) {
  doc.setPage(p);
  setDraw(LINE);
  doc.setLineWidth(0.75);
  doc.line(M, PH - 44, M + W, PH - 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setInk(INK3);
  doc.text(`VEYRA — build status, ${REPORT_DATE}`, M, PH - 30);
  doc.text(`${p} of ${pages}`, M + W, PH - 30, { align: "right" });
}

const out = process.argv[2] || "VEYRA-build-status.pdf";
writeFileSync(out, Buffer.from(doc.output("arraybuffer")));
console.log(`✓ ${out} — ${pages} pages`);
