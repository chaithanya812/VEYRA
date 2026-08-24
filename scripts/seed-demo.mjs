/**
 * Seed a persistent DEMO tenant on the real Supabase, so the app can be logged
 * into and clicked through as a paying client would. Idempotent, SECTION BY
 * SECTION: it resolves (or creates) the demo user + org, then tops up each
 * module only if that module is still empty — so it can be re-run any time to
 * fill gaps without duplicating data. Uses the admin API (same path as
 * lib/data/provisioning.ts) — this is test-data seeding in the owner's own DB.
 *
 * Covers: catalogue items, a GST quotation, a full procurement chain
 * (MR → RFQ → bids → award → PO → partial receipt → GRN → stock ledger),
 * finance (contract + milestones + payments), CRM (pipeline + leads +
 * follow-ups + interactions), design vault, site execution (logs, attendance,
 * measurement variance), and config (numbering series, approval rules).
 *
 * Run: node scripts/seed-demo.mjs
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

const DEMO = {
  email: "demo@veyra.app",
  password: "VeyraDemo!2026",
  fullName: "Demo Owner",
  orgName: "Veyra Demo Interiors",
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const nameKey = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const phoneKey = (raw) => {
  const d = (raw || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d || null;
};
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoFromNow = (mins) => new Date(Date.now() + mins * 60000).toISOString();

// Insert one row and return its id (throws with context on failure).
async function ins(table, row) {
  const { data, error } = await sb.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.id;
}
async function count(table, orgId) {
  const { count: c } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  return c ?? 0;
}

async function findUserByEmail(email) {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data?.users?.find((u) => u.email === email) ?? null;
}

/* ── Org resolution (create or fetch) ──────────────────────────────────────── */
async function ensureOrg() {
  const existing = await findUserByEmail(DEMO.email);
  let userId;
  if (existing) {
    userId = existing.id;
    const { data: mem } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (mem) return { userId, orgId: mem.org_id, fresh: false };
  } else {
    const { data: created, error } = await sb.auth.admin.createUser({
      email: DEMO.email,
      password: DEMO.password,
      email_confirm: true,
      user_metadata: { full_name: DEMO.fullName },
    });
    if (error) throw error;
    userId = created.user.id;
  }

  await sb.from("app_users").upsert({ id: userId, email: DEMO.email, full_name: DEMO.fullName });
  const orgId = await ins("orgs", { name: DEMO.orgName, slug: "veyra-demo-" + Date.now().toString(36) });
  await sb.from("branches").insert({ org_id: orgId, name: "Head Office", code: "HO", is_default: true });
  await sb.from("roles").insert({ org_id: orgId, name: "Owner", is_system: true, permissions: { all: true } });
  await sb.from("org_members").insert({ org_id: orgId, user_id: userId, role: "owner", status: "active" });
  return { userId, orgId, fresh: true };
}

/* ── Catalogue items (returns a code→row map, seeding if empty) ─────────────── */
async function ensureItems(orgId, userId) {
  // Keep every row's key set UNIFORM: a heterogeneous batch makes PostgREST send
  // explicit NULL (not DEFAULT) for keys a row omits, which blows up NOT-NULL
  // columns like purchase_to_base_factor. So all four carry the same fields.
  const defs = [
    { name: "18mm BWP Plywood", code: "PLY-18-BWP", type: "material", category: "Plywood", brand: "Century", base_uom: "sheet", purchase_uom: "sheet", purchase_to_base_factor: 1, base_rate: 1850, hsn_sac: "4412", tax_rate: 18 },
    { name: "1mm Laminate — Matte", code: "LAM-1-MT", type: "material", category: "Laminate", brand: "Merino", base_uom: "sheet", purchase_uom: "sheet", purchase_to_base_factor: 1, base_rate: 950, hsn_sac: "4823", tax_rate: 18 },
    { name: "Soft-close Hinge", code: "HW-HINGE-SC", type: "material", category: "Hardware", brand: "Hettich", base_uom: "nos", purchase_uom: "box", purchase_to_base_factor: 50, base_rate: 210, hsn_sac: "8302", tax_rate: 18 },
    { name: "Carpentry — Installation", code: "LAB-CARP", type: "labour", category: "Labour", brand: null, base_uom: "day", purchase_uom: "day", purchase_to_base_factor: 1, base_rate: 1200, hsn_sac: "9954", tax_rate: 18 },
  ];
  if ((await count("items", orgId)) === 0) {
    const { error } = await sb.from("items").insert(
      defs.map((it) => ({ org_id: orgId, name_key: nameKey(it.name), created_by: userId, ...it })),
    );
    if (error) throw new Error(`items: ${error.message}`);
  }
  const { data: rows } = await sb.from("items").select("id, code, name, base_uom, base_rate, tax_rate, hsn_sac").eq("org_id", orgId);
  const byCode = {};
  for (const r of rows) byCode[r.code] = r;
  return byCode;
}

/* ── A sample GST quotation (only when the org has none) ────────────────────── */
async function ensureQuote(orgId, userId) {
  if ((await count("quotations", orgId)) > 0) return;
  const qId = await ins("quotations", {
    org_id: orgId, number: "QT/2026-27/0001", title: "3BHK Interiors — Demo", status: "sent",
    customer_name: "Mr Suresh", customer_phone: "+91 98765 43210", place_of_supply: "Telangana", created_by: userId,
  });
  const mkSection = (title, sort) => ins("quotation_sections", { org_id: orgId, quotation_id: qId, title, sort_order: sort });
  const wood = await mkSection("Wood Work", 0);
  const kitchen = await mkSection("Modular Kitchen", 1);
  const rawLines = [
    { section_id: wood, title: "01 Wooden Partition", area: "Living", category: "Wood Work / Partitions", qty: 21, uom: "sqft", unit_price: 2160, discount_type: "amount", discount_value: 4536, tax_rate: 18, cost_rate: 1400 },
    { section_id: wood, title: "02 TV Unit", area: "Living", category: "Wood Work / Units", qty: 32, uom: "sqft", unit_price: 1850, discount_type: "percent", discount_value: 5, tax_rate: 18, cost_rate: 1150 },
    { section_id: kitchen, title: "Base Cabinets", area: "Kitchen", category: "Modular", qty: 18, uom: "sqft", unit_price: 2400, discount_type: "amount", discount_value: 0, tax_rate: 18, cost_rate: 1600 },
  ];
  const computed = rawLines.map((l, i) => {
    const sub = round2(l.qty * l.unit_price);
    const disc = round2(Math.min(l.discount_type === "percent" ? (sub * l.discount_value) / 100 : l.discount_value, sub));
    const taxable = round2(sub - disc);
    const tax = round2((taxable * l.tax_rate) / 100);
    const total = round2(taxable + tax);
    const cost = round2(l.qty * l.cost_rate);
    return { org_id: orgId, quotation_id: qId, sort_order: i, ...l, discount_amount: disc, line_subtotal: sub, taxable, tax_amount: tax, line_total: total, line_cost: cost };
  });
  await sb.from("quotation_lines").insert(computed);
  const t = computed.reduce((a, c) => ({
    subtotal: a.subtotal + c.line_subtotal, discount_total: a.discount_total + c.discount_amount,
    taxable_total: a.taxable_total + c.taxable, tax_total: a.tax_total + c.tax_amount,
    grand_total: a.grand_total + c.line_total, cost_total: a.cost_total + c.line_cost,
  }), { subtotal: 0, discount_total: 0, taxable_total: 0, tax_total: 0, grand_total: 0, cost_total: 0 });
  await sb.from("quotations").update({
    subtotal: round2(t.subtotal), discount_total: round2(t.discount_total), taxable_total: round2(t.taxable_total),
    tax_total: round2(t.tax_total), grand_total: round2(t.grand_total), cost_total: round2(t.cost_total),
    margin_total: round2(t.taxable_total - t.cost_total),
  }).eq("id", qId);
}

/* ── CRM: pipeline stages, leads, follow-ups, interactions ─────────────────── */
async function ensureCrm(orgId, userId) {
  if ((await count("pipeline_stages", orgId)) === 0) {
    const stages = [
      { name: "New Inquiry", seq: 0, is_won: false, is_lost: false },
      { name: "Contacted", seq: 1, is_won: false, is_lost: false },
      { name: "Site Measurement", seq: 2, is_won: false, is_lost: false },
      { name: "Design Pitch", seq: 3, is_won: false, is_lost: false },
      { name: "Quotation", seq: 4, is_won: false, is_lost: false },
      { name: "Negotiation", seq: 5, is_won: false, is_lost: false },
      { name: "Won", seq: 6, is_won: true, is_lost: false },
      { name: "Lost", seq: 7, is_won: false, is_lost: true },
    ];
    await sb.from("pipeline_stages").insert(stages.map((s) => ({ org_id: orgId, ...s })));
  }

  let leadIds = [];
  if ((await count("leads", orgId)) === 0) {
    const leads = [
      { name: "Mr Suresh Reddy", phone: "+91 98765 43210", source: "referral", status: "Quotation", value: 1800000 },
      { name: "Anita Desai", phone: "+91 90123 45678", source: "website", status: "New Inquiry", value: 950000 },
      { name: "Karthik Nair", phone: "+91 99887 66554", source: "walk_in", status: "Site Measurement", value: 1250000 },
      { name: "Priya Menon", phone: "+91 98450 11223", source: "instagram", status: "Design Pitch", value: 640000 },
      { name: "Rohit Sharma", phone: "+91 91234 55667", source: "referral", status: "Negotiation", value: 2100000 },
      { name: "Fatima Sheikh", phone: "+91 90000 22334", source: "website", status: "Won", value: 1550000 },
    ];
    for (const l of leads) {
      leadIds.push(await ins("leads", { org_id: orgId, phone_key: phoneKey(l.phone), ...l }));
    }
  } else {
    const { data } = await sb.from("leads").select("id").eq("org_id", orgId);
    leadIds = data.map((r) => r.id);
  }

  if ((await count("follow_ups", orgId)) === 0 && leadIds.length) {
    await sb.from("follow_ups").insert([
      { org_id: orgId, lead_id: leadIds[0], due_at: isoFromNow(-2880), done: false, note: "Send revised quote", assigned_to: userId, created_by: userId },
      { org_id: orgId, lead_id: leadIds[1], due_at: isoFromNow(120), done: false, note: "First call — qualify budget", assigned_to: userId, created_by: userId },
      { org_id: orgId, lead_id: leadIds[2], due_at: isoFromNow(2880), done: false, note: "Site visit for measurement", assigned_to: userId, created_by: userId },
      { org_id: orgId, lead_id: leadIds[4], due_at: isoFromNow(-60), done: false, note: "Close negotiation — 5% discount cap", assigned_to: userId, created_by: userId },
    ]);
  }

  if ((await count("interactions", orgId)) === 0 && leadIds.length) {
    await sb.from("interactions").insert([
      { org_id: orgId, lead_id: leadIds[0], channel: "call", direction: "outbound", status: "completed", customer_no: "+91 98765 43210", duration_sec: 214, disposition: "interested", note: "Discussed kitchen layout; keen on matte laminate", agent_id: userId, created_by: userId },
      { org_id: orgId, lead_id: leadIds[1], channel: "whatsapp", direction: "inbound", status: "completed", customer_no: "+91 90123 45678", duration_sec: 0, disposition: "follow_up", note: "Asked for portfolio", agent_id: userId, created_by: userId },
      { org_id: orgId, lead_id: leadIds[4], channel: "call", direction: "outbound", status: "not_connected", customer_no: "+91 91234 55667", duration_sec: 0, disposition: "busy", note: "No answer — retry evening", agent_id: userId, created_by: userId },
    ]);
  }
  return leadIds;
}

/* ── Procurement chain: vendors → warehouses → project → MR → RFQ → PO → GRN ── */
async function ensureProcurement(orgId, userId, items) {
  if ((await count("vendors", orgId)) > 0) return; // whole chain seeded together

  const PLY = items["PLY-18-BWP"];
  const LAM = items["LAM-1-MT"];

  // Vendors
  const vCentury = await ins("vendors", { org_id: orgId, name: "Century Ply Distributors", name_key: nameKey("Century Ply Distributors"), contact_person: "Mahesh Gupta", phone: "+91 98800 10101", phone_key: phoneKey("+91 98800 10101"), email: "sales@centuryply.example", gstin: "36ABCDE1234F1Z5", category: "Plywood", payment_terms: "30 days", lead_time_days: 5, city: "Hyderabad", state: "Telangana", created_by: userId });
  const vHettich = await ins("vendors", { org_id: orgId, name: "Hettich Hardware House", name_key: nameKey("Hettich Hardware House"), contact_person: "Sneha Rao", phone: "+91 98800 20202", phone_key: phoneKey("+91 98800 20202"), gstin: "36FGHIJ5678K1Z2", category: "Hardware", payment_terms: "15 days", lead_time_days: 3, city: "Hyderabad", state: "Telangana", created_by: userId });
  await ins("vendors", { org_id: orgId, name: "Sharma Electricals", name_key: nameKey("Sharma Electricals"), contact_person: "Vikas Sharma", phone: "+91 98800 30303", phone_key: phoneKey("+91 98800 30303"), category: "Electrical", payment_terms: "Advance", lead_time_days: 2, city: "Hyderabad", state: "Telangana", created_by: userId });

  // Vendor rate contract (config)
  await sb.from("vendor_rate_contracts").insert({ org_id: orgId, vendor_id: vCentury, item_id: PLY.id, item_name: PLY.name, uom: "sheet", rate: 1820, moq: 20, lead_time_days: 5, valid_from: daysFromNow(-60), valid_to: daysFromNow(120), created_by: userId });

  // Warehouses
  const whHO = await ins("warehouses", { org_id: orgId, name: "Head Office Store", address: "HO — Jubilee Hills", created_by: userId });
  await ins("warehouses", { org_id: orgId, name: "Malviya Nagar Site", project_label: "Malviya Nagar 3BHK", created_by: userId });

  // Project
  await ins("projects", { org_id: orgId, name: "Malviya Nagar 3BHK", client_name: "Mr Suresh Reddy", stage: "execution", health: "on_track", project_value: 1800000, funds_received: 560000, total_payable: 250000, start_date: daysFromNow(-40), handover_date: daysFromNow(35), city: "Hyderabad", state: "Telangana", physical_progress_pct: 45, created_by: userId });

  // Material Request
  const mrId = await ins("material_requests", { org_id: orgId, title: "Site materials — Malviya Nagar", project_label: "Malviya Nagar 3BHK", expected_delivery: daysFromNow(7), stage: "ordered", source: "manual", remarks: "Carcass + shutters phase", created_by: userId });
  await sb.from("material_request_items").insert([
    { org_id: orgId, mr_id: mrId, item_id: PLY.id, item_name: PLY.name, is_adhoc: false, uom: "sheet", qty: 40, remarks: "Carcass" },
    { org_id: orgId, mr_id: mrId, item_id: LAM.id, item_name: LAM.name, is_adhoc: false, uom: "sheet", qty: 25, remarks: "Shutters" },
    { org_id: orgId, mr_id: mrId, item_id: null, item_name: "L-bracket 90° heavy", is_adhoc: true, uom: "nos", qty: 12, remarks: "Not in catalogue yet" },
  ]);

  // RFQ from the MR
  const rfqId = await ins("rfqs", { org_id: orgId, mr_id: mrId, title: "Plywood & Laminate — Malviya Nagar", project_label: "Malviya Nagar 3BHK", place_of_supply: "Telangana", bid_deadline: daysFromNow(-2), status: "awarded", remarks: "Two vendors invited", created_by: userId });
  const rfqItemPly = await ins("rfq_items", { org_id: orgId, rfq_id: rfqId, item_id: PLY.id, item_name: PLY.name, uom: "sheet", qty: 40 });
  const rfqItemLam = await ins("rfq_items", { org_id: orgId, rfq_id: rfqId, item_id: LAM.id, item_name: LAM.name, uom: "sheet", qty: 25 });
  await sb.from("rfq_vendors").insert([
    { org_id: orgId, rfq_id: rfqId, vendor_id: vCentury, response_status: "submitted" },
    { org_id: orgId, rfq_id: rfqId, vendor_id: vHettich, response_status: "submitted" },
  ]);
  const landed = (qty, rate, freight) => round2(qty * rate + freight);
  // Century bid (L1)
  const bidC = await ins("rfq_bids", { org_id: orgId, rfq_id: rfqId, vendor_id: vCentury, version: 1, delivery_date: daysFromNow(5), remark: "Stock ready", entry_mode: "proxy", submitted_by: userId });
  await sb.from("rfq_bid_lines").insert([
    { org_id: orgId, bid_id: bidC, rfq_item_id: rfqItemPly, unit_rate: 1820, tax_pct: 18, freight: 800, line_total: landed(40, 1820, 800) },
    { org_id: orgId, bid_id: bidC, rfq_item_id: rfqItemLam, unit_rate: 940, tax_pct: 18, freight: 400, line_total: landed(25, 940, 400) },
  ]);
  // Hettich bid (L2)
  const bidH = await ins("rfq_bids", { org_id: orgId, rfq_id: rfqId, vendor_id: vHettich, version: 1, delivery_date: daysFromNow(7), remark: "3-day dispatch", entry_mode: "proxy", submitted_by: userId });
  await sb.from("rfq_bid_lines").insert([
    { org_id: orgId, bid_id: bidH, rfq_item_id: rfqItemPly, unit_rate: 1850, tax_pct: 18, freight: 500, line_total: landed(40, 1850, 500) },
    { org_id: orgId, bid_id: bidH, rfq_item_id: rfqItemLam, unit_rate: 930, tax_pct: 18, freight: 600, line_total: landed(25, 930, 600) },
  ]);

  // PO awarded to Century (L1)
  const poLines = [
    { item_id: PLY.id, item_name: PLY.name, uom: "sheet", qty: 40, unit_rate: 1820, tax_pct: 18 },
    { item_id: LAM.id, item_name: LAM.name, uom: "sheet", qty: 25, unit_rate: 940, tax_pct: 18 },
  ];
  const poAmount = round2(poLines.reduce((s, l) => s + round2(l.qty * l.unit_rate), 0));
  const poId = await ins("purchase_orders", { org_id: orgId, name: "PO — Century Ply (Malviya Nagar)", vendor_id: vCentury, project_label: "Malviya Nagar 3BHK", rfq_id: rfqId, type: "purchase_order", amount: poAmount, order_state: "partially_delivered", payment_state: "partial", order_date: daysFromNow(-3), delivery_date: daysFromNow(4), remarks: "Awarded from RFQ (L1)", created_by: userId });
  const poLineIds = [];
  for (const l of poLines) {
    poLineIds.push(await ins("po_lines", { org_id: orgId, po_id: poId, item_id: l.item_id, item_name: l.item_name, uom: l.uom, qty: l.qty, unit_rate: l.unit_rate, tax_pct: l.tax_pct, line_total: round2(l.qty * l.unit_rate) }));
  }
  // Partial receipt: PLY full (40), LAM partial (10) → ordered 65 / received 50 → partially_delivered
  const rcptId = await ins("po_receipts", { org_id: orgId, po_id: poId, received_by: userId, mode: "admin_override", note: "First truck" });
  await sb.from("po_receipt_lines").insert([
    { org_id: orgId, receipt_id: rcptId, po_line_id: poLineIds[0], qty_received: 40 },
    { org_id: orgId, receipt_id: rcptId, po_line_id: poLineIds[1], qty_received: 10 },
  ]);
  // GRN posted for the receipt
  await ins("grns", { org_id: orgId, po_id: poId, warehouse_id: whHO, grn_no: "GRN/2026-27/0001", status: "recorded", recorded_by: userId, note: "Matched against PO" });

  // Stock ledger (append-only): the received goods in, plus one issue out to site
  await sb.from("stock_movements").insert([
    { org_id: orgId, item_id: PLY.id, item_name: PLY.name, warehouse_id: whHO, direction: "in", qty: 40, uom: "sheet", unit_rate: 1820, gst_pct: 18, hsn_sac: PLY.hsn_sac, source_doc: "GRN/2026-27/0001", note: "PO receipt", created_by: userId },
    { org_id: orgId, item_id: LAM.id, item_name: LAM.name, warehouse_id: whHO, direction: "in", qty: 10, uom: "sheet", unit_rate: 940, gst_pct: 18, hsn_sac: LAM.hsn_sac, source_doc: "GRN/2026-27/0001", note: "PO receipt", created_by: userId },
    { org_id: orgId, item_id: PLY.id, item_name: PLY.name, warehouse_id: whHO, direction: "out", qty: 8, uom: "sheet", unit_rate: 1820, gst_pct: 18, hsn_sac: PLY.hsn_sac, source_doc: "ISSUE/0001", note: "Issued to site", created_by: userId },
  ]);
}

/* ── Finance: contract + milestones + payments ─────────────────────────────── */
async function ensureFinance(orgId, userId) {
  if ((await count("contracts", orgId)) > 0) return;
  const ctId = await ins("contracts", { org_id: orgId, project_label: "Malviya Nagar 3BHK", name: "Malviya Nagar 3BHK — Client Agreement", amount: 1800000, source: "client", created_by: userId });
  await sb.from("milestones").insert([
    { org_id: orgId, contract_id: ctId, seq: 1, name: "Advance (booking)", pct: 20, amount: 360000, tentative_due: daysFromNow(-35), work_done: true, actual_due: daysFromNow(-35) },
    { org_id: orgId, contract_id: ctId, seq: 2, name: "Design freeze", pct: 20, amount: 360000, tentative_due: daysFromNow(-10), work_done: true, actual_due: daysFromNow(-8) },
    { org_id: orgId, contract_id: ctId, seq: 3, name: "Production & carcass", pct: 30, amount: 540000, tentative_due: daysFromNow(10), work_done: false },
    { org_id: orgId, contract_id: ctId, seq: 4, name: "Handover", pct: 30, amount: 540000, tentative_due: daysFromNow(35), work_done: false },
  ]);
  await sb.from("payments").insert([
    { org_id: orgId, contract_id: ctId, project_label: "Malviya Nagar 3BHK", direction: "inflow", amount: 360000, mode: "upi", paid_on: daysFromNow(-35), reference: "UPI/ADV/001", note: "Advance", created_by: userId },
    { org_id: orgId, contract_id: ctId, project_label: "Malviya Nagar 3BHK", direction: "inflow", amount: 200000, mode: "bank_transfer", paid_on: daysFromNow(-7), reference: "NEFT/DES/002", note: "Design freeze part", created_by: userId },
    { org_id: orgId, project_label: "Malviya Nagar 3BHK", direction: "outflow", amount: 50000, mode: "bank_transfer", paid_on: daysFromNow(-2), reference: "NEFT/CENT/001", note: "Century Ply — part payment", created_by: userId },
  ]);
}

/* ── Design vault ──────────────────────────────────────────────────────────── */
async function ensureDesign(orgId, userId) {
  if ((await count("assets", orgId)) > 0) return;
  const a1 = await ins("assets", { org_id: orgId, project_label: "Malviya Nagar 3BHK", name: "Living Room — 3D Render v2", kind: "render", url: "https://placehold.co/1200x800?text=Living+Render", note: "Final render for sign-off", uploaded_by: userId });
  const a2 = await ins("assets", { org_id: orgId, project_label: "Malviya Nagar 3BHK", name: "Ground Floor — 2D Plan", kind: "2d", url: "https://placehold.co/1200x800?text=Floor+Plan", note: "As-built dimensions", uploaded_by: userId });
  await sb.from("asset_comments").insert([
    { org_id: orgId, asset_id: a1, x_pct: 38.5, y_pct: 55.2, body: "Move the TV unit 6 inches left to align with the false ceiling cove.", author: userId },
    { org_id: orgId, asset_id: a1, x_pct: 72, y_pct: 30, body: "Client wants warmer lighting here.", author: userId },
  ]);
  await sb.from("asset_signoffs").insert([
    { org_id: orgId, asset_id: a1, status: "approved", note: "Client approved on call", signed_by: userId, signed_at: daysFromNow(-1) },
    { org_id: orgId, asset_id: a2, status: "pending", note: "Awaiting client review" },
  ]);
}

/* ── Site execution: logs, photos, attendance, measurement variance ────────── */
async function ensureSite(orgId, userId) {
  if ((await count("site_logs", orgId)) > 0) return;
  const logId = await ins("site_logs", { org_id: orgId, project_label: "Malviya Nagar 3BHK", log_date: daysFromNow(-1), work_summary: "Carcass installation — bedroom 2 & living. Laminate pending shutter delivery.", author: userId });
  await sb.from("site_photos").insert([
    { org_id: orgId, site_log_id: logId, project_label: "Malviya Nagar 3BHK", caption: "Wardrobe carcass in place", url: "https://placehold.co/800x600?text=Site+1" },
    { org_id: orgId, site_log_id: logId, project_label: "Malviya Nagar 3BHK", caption: "Kitchen base units", url: "https://placehold.co/800x600?text=Site+2" },
  ]);
  await sb.from("site_attendance").insert([
    { org_id: orgId, project_label: "Malviya Nagar 3BHK", member_name: "Ramesh (Carpenter)", check_in: isoFromNow(-480), check_out: isoFromNow(-60), lat: 17.385044, lng: 78.486671 },
    { org_id: orgId, project_label: "Malviya Nagar 3BHK", member_name: "Suresh (Helper)", check_in: isoFromNow(-475), check_out: null, lat: 17.385044, lng: 78.486671 },
  ]);
  await sb.from("measurement_variance").insert([
    { org_id: orgId, project_label: "Malviya Nagar 3BHK", item_name: "Wardrobe (Bedroom 2)", uom: "sqft", quoted_qty: 100, measured_qty: 118, note: "Wall longer than drawing", created_by: userId },
    { org_id: orgId, project_label: "Malviya Nagar 3BHK", item_name: "TV Unit (Living)", uom: "sqft", quoted_qty: 32, measured_qty: 30, note: "Minor trim", created_by: userId },
    { org_id: orgId, project_label: "Malviya Nagar 3BHK", item_name: "Kitchen Base", uom: "sqft", quoted_qty: 18, measured_qty: 18, note: "As quoted", created_by: userId },
  ]);
}

/* ── Config: numbering series + approval rules & a pending request ──────────── */
async function ensureConfig(orgId, userId) {
  if ((await count("numbering_series", orgId)) === 0) {
    await sb.from("numbering_series").insert([
      { org_id: orgId, doc_type: "quotation", prefix: "QT", fy_segment: true, padding: 4, current_int: 1 },
      { org_id: orgId, doc_type: "material_request", prefix: "MR", fy_segment: true, padding: 4, current_int: 1 },
      { org_id: orgId, doc_type: "rfq", prefix: "RFQ", fy_segment: true, padding: 4, current_int: 1 },
      { org_id: orgId, doc_type: "purchase_order", prefix: "PO", fy_segment: true, padding: 4, current_int: 1 },
      { org_id: orgId, doc_type: "grn", prefix: "GRN", fy_segment: true, padding: 4, current_int: 1 },
    ]);
  }
  if ((await count("approval_rules", orgId)) === 0) {
    await sb.from("approval_rules").insert([
      { org_id: orgId, module: "procurement", threshold_amount: 100000, approver_role: "owner", is_active: true },
      { org_id: orgId, module: "quotations", threshold_amount: 500000, approver_role: "owner", is_active: true },
    ]);
  }
  if ((await count("approval_requests", orgId)) === 0) {
    await sb.from("approval_requests").insert([
      { org_id: orgId, module: "procurement", entity_label: "PO — Premium Italian Marble", amount: 240000, status: "pending", requested_by: userId },
      { org_id: orgId, module: "quotations", entity_label: "QT/2026-27/0007 — Villa turnkey", amount: 620000, status: "approved", requested_by: userId, decided_by: userId, decision_comment: "Within margin band", decided_at: daysFromNow(-2) },
    ]);
  }
}

async function main() {
  const { orgId, userId, fresh } = await ensureOrg();
  const items = await ensureItems(orgId, userId);
  await ensureQuote(orgId, userId);
  await ensureCrm(orgId, userId);
  await ensureProcurement(orgId, userId, items);
  await ensureFinance(orgId, userId);
  await ensureDesign(orgId, userId);
  await ensureSite(orgId, userId);
  await ensureConfig(orgId, userId);

  console.log(`✓ Demo tenant ${fresh ? "created" : "topped up"} with a full cross-module slice.`);
  report(orgId);
}

function report(orgId) {
  console.log("\n── DEMO LOGIN ─────────────────────────────");
  console.log(`  URL:      http://localhost:3010/login`);
  console.log(`  Email:    ${DEMO.email}`);
  console.log(`  Password: ${DEMO.password}`);
  console.log(`  Org:      ${orgId}`);
  console.log("───────────────────────────────────────────");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("✗ seed failed:", e.message);
  process.exit(1);
});
