#!/usr/bin/env node
/**
 * Generate the client-facing build status report as a PDF.
 *
 *   node scripts/client-report.mjs [out.pdf]
 *
 * jsPDF, the same library the product uses for quotations and the progress
 * report, but laid out by hand rather than through autotable. autotable has no
 * rich text: a cell is one font, so a bold heading with a grey sentence under
 * it means drawing the heading back on top — which double-strikes it. Every
 * row here is measured and drawn explicitly instead, which is also what makes
 * the page breaks predictable.
 *
 * The figures at the bottom are the six gates. Re-run them before regenerating:
 * a status report carrying stale numbers is worse than none.
 */
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

/* ── VEYRA's palette (app/globals.css) ─────────────────────────────────────
   Red keeps its closed list of jobs: the rule under the masthead, and the two
   items that need the client to act. Delivered is green, next is amber,
   everything else is ink and grey. */
const INK = [23, 23, 26];
const INK2 = [86, 86, 94];
const INK3 = [139, 139, 147];
const HAIR = [228, 228, 232];
const SUNK = [247, 247, 248];
const RED = [214, 18, 43];
const GREEN = [19, 122, 63];
const AMBER = [154, 103, 0];
const SLATE = [122, 122, 130];
const BAR_BG = [216, 216, 221];

const REPORT_DATE = "3 September 2026";
const LIVE_URL = "veyra-five-beta.vercel.app";

const doc = new jsPDF({ unit: "pt", format: "a4" });
const PW = doc.internal.pageSize.getWidth();
const PH = doc.internal.pageSize.getHeight();
const M = 54;
const W = PW - M * 2;
const FOOT = 56;
let y = 0;

/* ── Primitives ───────────────────────────────────────────────────────────── */

const ink = (c) => doc.setTextColor(c[0], c[1], c[2]);
const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
const draw = (c) => doc.setDrawColor(c[0], c[1], c[2]);
const font = (style, size) => {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
};

/** Break to a new page when `needed` points would run into the footer. */
function room(needed) {
  if (y + needed > PH - FOOT) {
    doc.addPage();
    y = M;
    return true;
  }
  return false;
}

function rule(width = W, colour = HAIR) {
  draw(colour);
  doc.setLineWidth(0.6);
  doc.line(M, y, M + width, y);
}

/** Letter-spaced small caps, drawn a character at a time — jsPDF has no tracking. */
function tracked(text, x, atY, spacing = 1.1) {
  let cx = x;
  for (const ch of text) {
    doc.text(ch, cx, atY);
    cx += doc.getTextWidth(ch) + spacing;
  }
  return cx - x - spacing;
}

function eyebrow(text, atY = y, colour = INK3) {
  font("bold", 7.5);
  ink(colour);
  tracked(text.toUpperCase(), M, atY);
}

function wrap(text, width, size, style = "normal") {
  font(style, size);
  return doc.splitTextToSize(text, width);
}

/* ── Masthead ─────────────────────────────────────────────────────────────── */

y = M + 4;
fill(RED);
doc.rect(M, y, 38, 3, "F");
y += 22;

eyebrow(`Build status  ·  ${REPORT_DATE}`);
y += 26;

font("bold", 27);
ink(INK);
doc.text("VEYRA build ledger", M, y);
y += 26;

const stand = wrap(
  "Where the platform stands today: stages 0 through 8 of 12 are built, tested and " +
    "running on the live environment. This is what is working, what is still to come, " +
    "and the three things worth knowing before the next stage starts.",
  W * 0.86,
  10.5,
);
ink(INK2);
doc.text(stand, M, y, { lineHeightFactor: 1.45 });
y += stand.length * 15 + 16;

rule();
y += 15;

font("normal", 8.5);
let mx = M;
for (const [k, v] of [
  ["Live at", LIVE_URL],
  ["Stages", "0–8 of 12 delivered"],
  ["Screens live", "63"],
]) {
  font("bold", 8.5);
  ink(INK3);
  doc.text(k, mx, y);
  const kw = doc.getTextWidth(k);
  font("normal", 8.5);
  ink(INK2);
  doc.text(v, mx + kw + 7, y);
  mx += kw + 7 + doc.getTextWidth(v) + 30;
}
y += 26;

/* ── Progress band ────────────────────────────────────────────────────────── */

const BAND = 82;
fill(SUNK);
draw(HAIR);
doc.setLineWidth(0.6);
doc.roundedRect(M, y, W, BAND, 6, 6, "FD");

let by = y + 22;
font("bold", 7.5);
ink(INK3);
tracked("DELIVERY STAGES", M + 18, by);

font("bold", 11.5);
ink(INK);
doc.text("9 of 13 complete", M + W - 18, by, { align: "right" });

by += 14;
const barW = W - 36;
fill(BAR_BG);
doc.roundedRect(M + 18, by, barW, 8, 4, 4, "F");
fill(GREEN);
doc.roundedRect(M + 18, by, barW * (9 / 13), 8, 4, 4, "F");

by += 26;
font("normal", 9);
let lx = M + 18;
for (const [colour, label, count] of [
  [GREEN, "Delivered and live", "9"],
  [BAR_BG, "Remaining", "4"],
]) {
  fill(colour);
  doc.circle(lx + 3.5, by - 3, 3.5, "F");
  lx += 13;
  font("normal", 9);
  ink(INK2);
  doc.text(label, lx, by);
  lx += doc.getTextWidth(label) + 6;
  font("bold", 9);
  ink(INK);
  doc.text(count, lx, by);
  lx += doc.getTextWidth(count) + 26;
}

y += BAND + 30;

/* ── Section furniture ────────────────────────────────────────────────────── */

function section(title, blurb) {
  room(90);
  font("bold", 15);
  ink(INK);
  doc.text(title, M, y);
  y += 17;

  if (blurb) {
    const lines = wrap(blurb, W * 0.8, 9.5);
    ink(INK2);
    doc.text(lines, M, y, { lineHeightFactor: 1.45 });
    y += lines.length * 13.5 + 10;
  } else {
    y += 4;
  }
}

const STAGE_W = 46;
const STATUS_W = 62;

/**
 * One ledger row: stage number, a bold title with its sentence underneath, and
 * a status on the right. Height is measured before anything is drawn, so a row
 * never straddles a page break.
 */
function ledgerRow({ stage, title, body, status, statusColour }) {
  const textX = M + STAGE_W;
  const textW = W - STAGE_W - STATUS_W - 14;

  const titleLines = wrap(title, textW, 10.5, "bold");
  const bodyLines = wrap(body, textW, 9, "normal");
  const h = 14 + titleLines.length * 13 + bodyLines.length * 12.5 + 15;

  room(h);
  const top = y;

  font("normal", 8.5);
  ink(INK3);
  doc.text(stage, M, top + 14 + 8);

  font("bold", 10.5);
  ink(INK);
  doc.text(titleLines, textX, top + 14 + 8, { lineHeightFactor: 1.25 });

  font("normal", 9);
  ink(INK2);
  doc.text(bodyLines, textX, top + 14 + titleLines.length * 13 + 8, {
    lineHeightFactor: 1.4,
  });

  if (status) {
    font("bold", 8.5);
    ink(statusColour);
    doc.text(status, M + W, top + 14 + 8, { align: "right" });
  }

  y = top + h;
  rule();
}

/* ── What is delivered ────────────────────────────────────────────────────── */

section(
  "What is delivered",
  "Stages 0 through 8. Each was checked against the reference screens, verified against " +
    "the live database, and deployed.",
);

rule();

for (const [stage, title, body] of [
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
    "Documents, plan, financial planning, payments, site progress, labour and procurement — each scoped to one project and unable to see another's. Listed below.",
  ],
]) {
  ledgerRow({ stage, title, body, status: "Live", statusColour: GREEN });
}

y += 26;

/* ── Inside a project ─────────────────────────────────────────────────────── */

section("Inside a project");

/** A module: bold name, sentence under it, hairline. No stage, no status. */
function moduleRow(name, body) {
  const nameLines = wrap(name, W, 10, "bold");
  const bodyLines = wrap(body, W * 0.94, 9, "normal");
  const h = 12 + nameLines.length * 12.5 + bodyLines.length * 12.5 + 13;

  room(h);
  const top = y;

  font("bold", 10);
  ink(INK);
  doc.text(nameLines, M, top + 12 + 7);

  font("normal", 9);
  ink(INK2);
  doc.text(bodyLines, M, top + 12 + nameLines.length * 12.5 + 7, {
    lineHeightFactor: 1.4,
  });

  y = top + h;
  rule();
}

rule();
for (const [name, body] of [
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
]) {
  moduleRow(name, body);
}

y += 26;

/* ── What is still to be built ────────────────────────────────────────────── */

section(
  "What is still to be built",
  "Stages 9 through 12, in the order they will be delivered. Each depends on the one before it.",
);

rule();

for (const [stage, title, body, status, colour] of [
  [
    "09",
    "Company-wide procurement, inventory and vendors",
    "The same procurement data seen across every project at once; warehouses split into company and project stock with goods-received numbering; and the vendor record — payment history, outstanding balances and which projects each vendor is on.",
    "Next",
    AMBER,
  ],
  [
    "10",
    "HR, users and permission enforcement",
    "Attendance, leave and work-from-home approvals; the user list with a real reporting line; and — the largest single piece of work left — making the permission settings actually govern what each role can do, plus a full audit trail.",
    "Planned",
    SLATE,
  ],
  [
    "11",
    "Accounting and finance",
    "The payments dashboard across all projects, petty expenses per person, and account receivables — which reads the payment schedules already captured in financial planning, so nothing is entered twice.",
    "Planned",
    SLATE,
  ],
  [
    "12",
    "Reports and polish",
    "The reporting suite, saved views and CSV export on every list, an accessibility pass, and a final review of the whole interface for consistency.",
    "Planned",
    SLATE,
  ],
]) {
  ledgerRow({ stage, title, body, status, statusColour: colour });
}

y += 26;

/* ── Worth knowing now ────────────────────────────────────────────────────── */

section(
  "Worth knowing now",
  "Three open items. None blocks the next stage, and each needs a decision rather than more code.",
);

for (const [tag, tone, title, body] of [
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
]) {
  const textX = M + 78;
  const textW = W - 78;
  const titleLines = wrap(title, textW, 10.5, "bold");
  const bodyLines = wrap(body, textW, 9, "normal");
  const h = 14 + titleLines.length * 13 + bodyLines.length * 12.5 + 14;

  room(h + 10);
  const top = y;

  fill(tone);
  doc.rect(M, top, 2.5, h, "F");

  font("bold", 7.5);
  ink(tone);
  tracked(tag.toUpperCase(), M + 14, top + 14 + 8, 0.7);

  font("bold", 10.5);
  ink(INK);
  doc.text(titleLines, textX, top + 14 + 8, { lineHeightFactor: 1.25 });

  font("normal", 9);
  ink(INK2);
  doc.text(bodyLines, textX, top + 14 + titleLines.length * 13 + 8, {
    lineHeightFactor: 1.4,
  });

  y = top + h + 12;
}

y += 16;

/* ── How this is verified ─────────────────────────────────────────────────── */

section(
  "How this is verified",
  "Every stage has to pass the same six checks before it is called done. These are the " +
    "current figures, re-run on the live database.",
);

const figures = [
  ["560", "automated\ntests"],
  ["142", "database\nisolation checks"],
  ["11", "file storage\nchecks"],
  ["63", "screens\ncompiled"],
  ["0", "type or lint\nerrors"],
];

room(78);
const gap = 8;
const fw = (W - gap * (figures.length - 1)) / figures.length;
figures.forEach(([n, label], i) => {
  const x = M + i * (fw + gap);
  fill(SUNK);
  draw(HAIR);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, fw, 58, 5, 5, "FD");

  font("bold", 18);
  ink(INK);
  doc.text(n, x + 11, y + 26);

  font("normal", 7.5);
  ink(INK2);
  doc.text(label.split("\n"), x + 11, y + 38, { lineHeightFactor: 1.35 });
});
y += 58 + 22;

const closing = wrap(
  "The isolation checks are the important ones: they prove, against the real database, that " +
    "one company cannot see another's data and one project cannot reach another's files, " +
    "folders, photos, labour or orders — the rule you asked for at the start: project 1 and " +
    "project 2 can't share the same folders.",
  W * 0.86,
  9.5,
);
room(closing.length * 14 + 40);
ink(INK2);
doc.text(closing, M, y, { lineHeightFactor: 1.45 });
y += closing.length * 14 + 20;

font("bold", 10);
ink(INK);
doc.text("Next up is stage 9 — company-wide procurement, inventory and the vendor record.", M, y);
y += 15;
font("normal", 9.5);
ink(INK2);
doc.text(`The live build is at ${LIVE_URL}.`, M, y);

/* ── Footers ──────────────────────────────────────────────────────────────── */

const pages = doc.getNumberOfPages();
for (let p = 1; p <= pages; p++) {
  doc.setPage(p);
  draw(HAIR);
  doc.setLineWidth(0.6);
  doc.line(M, PH - 40, M + W, PH - 40);
  font("normal", 7.5);
  ink(INK3);
  doc.text(`VEYRA — build status, ${REPORT_DATE}`, M, PH - 26);
  doc.text(`${p} of ${pages}`, M + W, PH - 26, { align: "right" });
}

const out = process.argv[2] || "VEYRA-build-status.pdf";
writeFileSync(out, Buffer.from(doc.output("arraybuffer")));
console.log(`✓ ${out} — ${pages} pages`);
