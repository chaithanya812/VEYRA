/**
 * Seed the WORKSPACE + LEAD MANAGEMENT + QUOTATION STUDIO surfaces (migrations
 * 0023–0025) with realistic demo data, so both screens can be clicked through
 * as a real firm would use them.
 *
 * Idempotent section by section: each block tops up only if that table is still
 * empty for the demo org, so re-running fills gaps rather than duplicating.
 * Companion to seed-demo.mjs, which covers the older modules.
 *
 * Run: node scripts/seed-workspace.mjs
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env.local") });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const DEMO_ORG_SLUG_NAME = "Veyra Demo Interiors";

const phoneKey = (raw) => {
  const d = (raw || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d || null;
};
const dayISO = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const at = (dayOffset, hh, mm = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

async function ins(table, row) {
  const { data, error } = await sb.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.id;
}
async function insMany(table, rows) {
  if (rows.length === 0) return;
  const { error } = await sb.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
}
async function countIn(table, orgId) {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

/* ── Resolve the demo org and its people ─────────────────────────────────── */

const { data: org, error: orgErr } = await sb
  .from("orgs")
  .select("id, name")
  .eq("name", DEMO_ORG_SLUG_NAME)
  .maybeSingle();
if (orgErr) throw orgErr;
if (!org) {
  console.error(`No org named "${DEMO_ORG_SLUG_NAME}". Run: node scripts/seed-demo.mjs first.`);
  process.exit(1);
}
const orgId = org.id;
console.log(`org: ${org.name} (${orgId})`);

const { data: members } = await sb
  .from("org_members")
  .select("id, role, display_name")
  .eq("org_id", orgId)
  .eq("status", "active")
  .order("created_at", { ascending: true });

if (!members || members.length < 2) {
  console.error(
    "Fewer than 2 members. Open the app once (the workspace seeds demo profiles on first load), then re-run.",
  );
  process.exit(1);
}

const byRole = (role) => members.filter((m) => m.role === role);
const staff = byRole("member");
const manager = byRole("manager")[0] ?? members[0];
const owner = byRole("owner")[0] ?? members[0];
const [rahul, sneha, karthik] = [staff[0] ?? manager, staff[1] ?? manager, staff[2] ?? manager];
console.log(`people: ${members.map((m) => `${m.display_name ?? "?"} (${m.role})`).join(", ")}`);

/* ── Attendance ──────────────────────────────────────────────────────────── */

if ((await countIn("work_sessions", orgId)) === 0) {
  const rows = [];
  for (const m of [rahul, sneha, karthik, manager]) {
    for (let d = 6; d >= 1; d--) {
      if (new Date(Date.now() - d * 86400000).getDay() === 0) continue; // skip Sunday
      rows.push({
        org_id: orgId,
        member_id: m.id,
        check_in: at(-d, 9, 30 + (d % 3) * 5),
        check_out: at(-d, 18, 15),
        location_label: m.id === karthik.id ? "DLF Greens site" : "Office",
      });
    }
  }
  // Rahul is still clocked in today — makes the live "hours today" figure move.
  rows.push({
    org_id: orgId,
    member_id: rahul.id,
    check_in: at(0, 9, 45),
    check_out: null,
    location_label: "Office",
  });
  await insMany("work_sessions", rows);
  console.log(`work_sessions: +${rows.length}`);
}

/* ── Tasks ───────────────────────────────────────────────────────────────── */

if ((await countIn("tasks", orgId)) === 0) {
  const tasks = [
    { title: "Site measurement — Anil Residence", task_type: "site_measurement", priority: "high", due_at: at(-2, 11), assignee_id: karthik.id, status: "created" },
    { title: "Send revised quote to Mr Ramesh", task_type: "task", priority: "urgent", due_at: at(0, 17, 30), assignee_id: rahul.id, status: "in_progress" },
    { title: "Client meeting — Skyview Apartment", task_type: "client_meeting", priority: "medium", due_at: at(0, 15), assignee_id: sneha.id, status: "created" },
    { title: "Finalise 3D renders for Penthouse", task_type: "project_task", priority: "high", due_at: at(2, 18), assignee_id: sneha.id, status: "in_progress" },
    { title: "Collect vendor quotes for plywood", task_type: "project_task", priority: "medium", due_at: at(3, 18), assignee_id: rahul.id, status: "created" },
    { title: "Approve PO for hardware", task_type: "approval", priority: "medium", due_at: at(1, 12), assignee_id: manager.id, status: "created" },
    { title: "Update the material catalogue", task_type: "adhoc", priority: "low", due_at: null, assignee_id: rahul.id, status: "created" },
    { title: "Handover checklist — Grand Abode", task_type: "project_task", priority: "medium", due_at: at(-5, 18), assignee_id: karthik.id, status: "done", completed_at: at(-5, 17) },
    { title: "Set up the team's follow-up cadence", task_type: "task", priority: "low", due_at: at(-8, 18), assignee_id: manager.id, status: "done", completed_at: at(-8, 16) },
  ];
  for (const t of tasks) {
    const id = await ins("tasks", { org_id: orgId, created_by: manager.id, ...t });
    if (t.title.startsWith("Site measurement")) {
      await insMany("task_checklist", [
        { org_id: orgId, task_id: id, label: "Carry laser measure and tape", done: true, seq: 0 },
        { org_id: orgId, task_id: id, label: "Photograph existing wardrobe", done: false, seq: 1 },
        { org_id: orgId, task_id: id, label: "Note electrical points", done: false, seq: 2 },
      ]);
    }
  }
  console.log(`tasks: +${tasks.length}`);
}

/* ── Expenses ────────────────────────────────────────────────────────────── */

if ((await countIn("expense_claims", orgId)) === 0) {
  const rows = [
    { member_id: karthik.id, spent_on: dayISO(-6), amount: 2750, category: "materials", remark: "Board, laminates & edge bands", project_label: "DLF Greens", status: "approved", decided_by: manager.id, decided_at: at(-5, 10) },
    { member_id: karthik.id, spent_on: dayISO(-4), amount: 480, category: "transport", remark: "Auto to site and back", project_label: "DLF Greens", status: "reimbursed", decided_by: manager.id, decided_at: at(-3, 10) },
    { member_id: rahul.id, spent_on: dayISO(-2), amount: 1200, category: "site_refreshments", remark: "Tea and snacks for the crew", project_label: "Skyview Apartment", status: "submitted" },
    { member_id: sneha.id, spent_on: dayISO(-1), amount: 5400, category: "electrical", remark: "Emergency switch replacement", project_label: "The Penthouse Project", status: "submitted" },
    { member_id: karthik.id, spent_on: dayISO(-9), amount: 15000, category: "labour", remark: "Labour payment 14th", project_label: "The Grand Abode", status: "approved", decided_by: manager.id, decided_at: at(-8, 11) },
  ];
  await insMany("expense_claims", rows.map((r) => ({ org_id: orgId, ...r })));
  console.log(`expense_claims: +${rows.length}`);
}

/* ── Leave ───────────────────────────────────────────────────────────────── */

if ((await countIn("leave_requests", orgId)) === 0) {
  const rows = [
    { member_id: rahul.id, leave_type: "casual", from_date: dayISO(4), to_date: dayISO(5), days: 2, reason: "Family function", status: "pending" },
    { member_id: sneha.id, leave_type: "sick", from_date: dayISO(-7), to_date: dayISO(-7), days: 1, reason: "Fever", status: "approved", decided_by: manager.id, decided_at: at(-7, 9) },
    { member_id: karthik.id, leave_type: "wfh", from_date: dayISO(2), to_date: dayISO(2), days: 1, reason: "Drafting from home", status: "pending" },
  ];
  await insMany("leave_requests", rows.map((r) => ({ org_id: orgId, ...r })));
  console.log(`leave_requests: +${rows.length}`);
}

/* ── Field visits ────────────────────────────────────────────────────────── */

if ((await countIn("field_visits", orgId)) === 0) {
  const rows = [
    { member_id: karthik.id, purpose: "measurement", title: "Final measurement before production", location_label: "DLF Greens, Gurgaon", started_at: at(0, 11), ended_at: null, status: "in_progress" },
    { member_id: sneha.id, purpose: "client_meeting", title: "Present revised layout", location_label: "Skyview Apartment", started_at: at(-2, 15), ended_at: at(-2, 16, 30), status: "completed", notes: "Client approved the living room layout" },
    { member_id: rahul.id, purpose: "vendor_visit", title: "Plywood rates and stock check", location_label: "Peenya market", started_at: at(-4, 10), ended_at: at(-4, 12), status: "completed" },
  ];
  await insMany("field_visits", rows.map((r) => ({ org_id: orgId, ...r })));
  console.log(`field_visits: +${rows.length}`);
}

/* ── Leads with the full 360° brief ──────────────────────────────────────── */

const { data: statusRows } = await sb
  .from("lead_statuses")
  .select("value")
  .eq("org_id", orgId);
const haveStatuses = new Set((statusRows ?? []).map((s) => s.value));
const pickStatus = (want, fallback = "new") =>
  haveStatuses.has(want) ? want : fallback;

const DEMO_LEADS = [
  { name: "Mr Ramesh", phone: "+91 98990 09988", email: "ramesh@example.in", status: pickStatus("negotiation"), source: "referral", value: 1450000, project_name: "B-1023", project_type: "apartment", budget_band: "10_20l", scope: "full_execution", layout_sqft: 1200, theme: "Modern minimal, warm woods", rooms: ["Kitchen", "Master bedroom", "Living"], city: "Bengaluru", org_type: "residential", contact_role: "owner", latest_remark: "Busy on another call — asked to try tomorrow morning", rating: 4, description: "3BHK, modular kitchen in acrylic, wardrobes in both bedrooms, false ceiling in living.", owner: rahul },
  { name: "Mr Raghav", phone: "+91 96033 44444", email: null, status: pickStatus("qualified"), source: "meta_ads", value: 1800000, project_name: "Project - 1319", project_type: "villa", budget_band: "10_20l", scope: "full_execution", layout_sqft: 2400, theme: "Contemporary", rooms: ["Living", "Dining", "3 bedrooms"], city: "Hyderabad", org_type: "commercial", contact_role: "owner", latest_remark: "Lead created — awaiting site visit", rating: 3, description: "Full execution for a commercial villa conversion.", owner: sneha },
  { name: "Radhika Rana", phone: "+91 82332 77044", email: null, status: pickStatus("site_measurement"), source: "website", value: 6500000, project_name: "Project - 3553", project_type: "villa", budget_band: "50l_1cr", scope: "full_execution", layout_sqft: 3800, theme: "Classic Indian contemporary", rooms: ["Whole villa"], city: "Bengaluru", org_type: "residential", contact_role: "spouse", latest_remark: "Measurement scheduled with Karthik", rating: 5, description: "Large villa, full interiors including landscaping consultation.", owner: karthik },
  { name: "Anil", phone: "+91 96097 11798", email: "anil@example.in", status: pickStatus("design_pitch"), source: "walk_in", value: 4200000, project_name: "Anil Residence", project_type: "apartment", budget_band: "30_50l", scope: "design_now_execution_later", layout_sqft: 1850, theme: "Scandinavian", rooms: ["Kitchen", "Living", "2 bedrooms"], city: "Bengaluru", org_type: "residential", contact_role: "owner", latest_remark: "Renders due Thursday", rating: 4, description: "Wants design first, execution decision after seeing the 3D.", owner: sneha },
  { name: "Mr Suresh", phone: "+91 99000 09900", email: null, status: pickStatus("contacted"), source: "referral", value: 3500000, project_name: "D-1023 A", project_type: "apartment", budget_band: "30_50l", scope: "design_only", layout_sqft: 1600, theme: null, rooms: ["Kitchen", "Living"], city: "Chennai", org_type: "residential", contact_role: "architect", latest_remark: "Interested in 3BHK — sending brochure", rating: 3, description: null, owner: rahul },
  { name: "Shivani", phone: "+91 93994 10561", email: null, status: pickStatus("new"), source: "google_ads", value: 1500000, project_name: "Project - 9357", project_type: "apartment", budget_band: "10_20l", scope: "modular_only", layout_sqft: 1100, theme: null, rooms: ["Kitchen"], city: "Pune", org_type: "residential", contact_role: "owner", latest_remark: "Asked to connect tomorrow", rating: 2, description: "Modular kitchen only, budget conscious.", owner: rahul },
  { name: "Aditi Sharma", phone: "+91 99999 99999", email: null, status: pickStatus("won"), source: "architect", value: 8900000, project_name: "The Penthouse Project", project_type: "apartment", budget_band: "50l_1cr", scope: "full_execution", layout_sqft: 4200, theme: "Luxury modern", rooms: ["Whole penthouse"], city: "Mumbai", org_type: "residential", contact_role: "owner", latest_remark: "Advance received — moving to execution", rating: 5, description: "Penthouse, full interiors. Referred by the architect.", owner: sneha },
  { name: "Vikram Reddy", phone: "+91 90000 12345", email: null, status: pickStatus("not_interested", "lost"), source: "meta_ads", value: 900000, project_name: "Project - 7216", project_type: "apartment", budget_band: "5_10l", scope: "modular_only", layout_sqft: 950, theme: null, rooms: ["Kitchen"], city: "Bengaluru", org_type: "residential", contact_role: "owner", latest_remark: "Budget mismatch — went with a local carpenter", rating: 1, description: null, owner: rahul },
];

let leadIds = [];
const existingLeadCount = await countIn("leads", orgId);
{
  const { data: existing } = await sb
    .from("leads")
    .select("id, name, phone_key")
    .eq("org_id", orgId);
  const haveKeys = new Set((existing ?? []).map((l) => l.phone_key).filter(Boolean));
  const created = [];

  for (const l of DEMO_LEADS) {
    const key = phoneKey(l.phone);
    if (key && haveKeys.has(key)) continue;
    const id = await ins("leads", {
      org_id: orgId,
      name: l.name,
      phone: l.phone,
      phone_key: key,
      email: l.email,
      status: l.status,
      source: l.source,
      value: l.value,
      project_name: l.project_name,
      project_type: l.project_type,
      budget_band: l.budget_band,
      scope: l.scope,
      layout_sqft: l.layout_sqft,
      theme: l.theme,
      rooms: l.rooms,
      city: l.city,
      org_type: l.org_type,
      contact_role: l.contact_role,
      latest_remark: l.latest_remark,
      rating: l.rating,
      description: l.description,
      sales_owner_id: l.owner.id,
      financial_year: (() => {
        const d = new Date();
        const y = d.getFullYear();
        const s = d.getMonth() >= 3 ? y : y - 1;
        return `${s}-${String(s + 1).slice(-2)}`;
      })(),
    });
    created.push({ id, lead: l });
    await insMany("lead_assignees", [{ org_id: orgId, lead_id: id, member_id: l.owner.id }]);
    await insMany("lead_activities", [
      { org_id: orgId, lead_id: id, kind: "created", note: `Lead created via ${l.source}` },
      { org_id: orgId, lead_id: id, kind: "note", note: l.latest_remark },
    ]);
  }
  leadIds = created;
  console.log(`leads: +${created.length} (had ${existingLeadCount})`);
}

/* ── Follow-ups and call logs ────────────────────────────────────────────── */

if (leadIds.length > 0) {
  const find = (name) => leadIds.find((x) => x.lead.name === name);
  const fus = [];
  const calls = [];

  const ramesh = find("Mr Ramesh");
  if (ramesh) {
    // Deliberately in the past and still open → shows as MISSED (derived).
    fus.push({ lead_id: ramesh.id, kind: "callback", title: "Mr Ramesh — revised quote", due_at: at(-1, 17, 30), member_id: rahul.id, priority: "high", status: "upcoming" });
    fus.push({ lead_id: ramesh.id, kind: "callback", title: "Mr Ramesh — first call", due_at: at(-4, 11), member_id: rahul.id, priority: "medium", status: "completed", done: true, completed_at: at(-4, 11, 20), outcome: "interested", note: "Interested in 3BHK, wants the quote by Friday" });
    calls.push({ lead_id: ramesh.id, status: "connected", duration_sec: 340, note: "Interested in 3BHK, wants the quote by Friday", agent_id: rahul.id, occurred_at: at(-4, 11, 5) });
    calls.push({ lead_id: ramesh.id, status: "not_connected", duration_sec: 0, note: "Busy on another call", agent_id: rahul.id, occurred_at: at(-1, 17, 35) });
  }
  const radhika = find("Radhika Rana");
  if (radhika) {
    fus.push({ lead_id: radhika.id, kind: "meeting", title: "Site measurement visit", due_at: at(1, 11), member_id: karthik.id, priority: "high", status: "upcoming" });
    calls.push({ lead_id: radhika.id, status: "connected", duration_sec: 620, note: "Confirmed measurement slot", agent_id: karthik.id, occurred_at: at(-2, 10) });
  }
  const anil = find("Anil");
  if (anil) {
    fus.push({ lead_id: anil.id, kind: "meeting", title: "Present 3D renders", due_at: at(2, 16), member_id: sneha.id, priority: "high", status: "upcoming" });
    fus.push({ lead_id: anil.id, kind: "callback", title: "Anil — confirm render date", due_at: at(-3, 15), member_id: sneha.id, status: "rescheduled", done: true, note: "Client asked to move to Thursday" });
    calls.push({ lead_id: anil.id, status: "connected", duration_sec: 210, agent_id: sneha.id, occurred_at: at(-3, 15, 5), note: "Asked to move the review to Thursday" });
  }
  const shivani = find("Shivani");
  if (shivani) {
    fus.push({ lead_id: shivani.id, kind: "callback", title: "Shivani — kitchen brief", due_at: at(0, 17, 30), member_id: rahul.id, priority: "medium", status: "upcoming" });
    calls.push({ lead_id: shivani.id, status: "no_answer", duration_sec: 0, agent_id: rahul.id, occurred_at: at(-1, 12) });
    calls.push({ lead_id: shivani.id, status: "not_connected", duration_sec: 0, agent_id: rahul.id, occurred_at: at(-2, 12) });
  }
  const suresh = find("Mr Suresh");
  if (suresh) {
    fus.push({ lead_id: suresh.id, kind: "callback", title: "Mr Suresh — brochure follow-up", due_at: at(-2, 16), member_id: rahul.id, priority: "medium", status: "upcoming" });
    calls.push({ lead_id: suresh.id, status: "connected", duration_sec: 150, agent_id: rahul.id, occurred_at: at(-5, 16), note: "Interested in 3BHK" });
  }

  await insMany(
    "follow_ups",
    fus.map((f) => ({
      org_id: orgId,
      done: f.done ?? false,
      priority: f.priority ?? "medium",
      ...f,
    })),
  );
  await insMany(
    "interactions",
    calls.map((c) => ({
      org_id: orgId,
      channel: "call",
      direction: "outbound",
      provider: "manual",
      ...c,
    })),
  );
  console.log(`follow_ups: +${fus.length} · interactions(call): +${calls.length}`);
}

console.log("\nDone. Open http://localhost:3010/dashboard and use the View-as picker.");
