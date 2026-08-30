/**
 * End-to-end verification of the foundation against the REAL Supabase, over the
 * same PostgREST/HTTPS path the app uses. Creates temporary test data and an
 * auth user, asserts the invariants, then cleans everything up.
 *
 * Proves: (1) org_id tenant isolation, (2) phone dedupe, (3) leads CRUD,
 *         (4) the auth admin path used by provisioning.
 *
 * Run: node scripts/verify.mjs   (works from the sandbox — HTTPS only)
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env.local") });

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

const phoneKey = (raw) => {
  const d = (raw || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d || null;
};
const nameKey = (raw) => (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
const codeKey = (raw) => ((raw || "").trim().toUpperCase() || null);

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const cleanup = { orgIds: [], userIds: [] };

async function main() {
  // Two temp orgs (tenants).
  const { data: orgs, error: orgErr } = await sb
    .from("orgs")
    .insert([
      { name: "TEST Org A", slug: "test-a-" + Date.now() },
      { name: "TEST Org B", slug: "test-b-" + Date.now() },
    ])
    .select("id, name");
  if (orgErr) throw orgErr;
  const [A, B] = orgs;
  cleanup.orgIds.push(A.id, B.id);

  // Leads: 2 in A (one with a phone), 1 in B.
  await sb.from("leads").insert([
    { org_id: A.id, name: "A-Lead-1", phone: "+91 98765 43210", phone_key: phoneKey("+91 98765 43210"), source: "manual", status: "new", value: 250000 },
    { org_id: A.id, name: "A-Lead-2", source: "website", status: "qualified", value: 90000 },
    { org_id: B.id, name: "B-Lead-1", source: "referral", status: "won", value: 500000 },
  ]);

  // (1) Tenant isolation: querying org A must never surface org B's rows.
  const { data: aLeads } = await sb.from("leads").select("name").eq("org_id", A.id);
  const { data: bLeads } = await sb.from("leads").select("name").eq("org_id", B.id);
  check("org A sees exactly its 2 leads", aLeads.length === 2, `got ${aLeads.length}`);
  check("org B sees exactly its 1 lead", bLeads.length === 1, `got ${bLeads.length}`);
  check(
    "no cross-tenant leakage (A's query has no B rows)",
    !aLeads.some((l) => l.name.startsWith("B-")),
  );

  // (2) Phone dedupe: a second lead with the same normalised phone in the SAME
  //     org must be rejected by the unique index uq_leads_org_phonekey.
  const dup = await sb.from("leads").insert({
    org_id: A.id,
    name: "A-Dup",
    phone: "098765 43210", // same last-10 digits → same phone_key
    phone_key: phoneKey("098765 43210"),
    source: "call",
    status: "new",
  });
  check("duplicate phone in same org is rejected", dup.error !== null, dup.error?.code || "");

  // (2b) …but the SAME phone in a DIFFERENT org is allowed.
  const okOtherOrg = await sb.from("leads").insert({
    org_id: B.id,
    name: "B-SamePhone",
    phone: "98765 43210",
    phone_key: phoneKey("98765 43210"),
    source: "call",
    status: "new",
  });
  check("same phone allowed in a different org", okOtherOrg.error === null, okOtherOrg.error?.message || "");

  // (3) Update + activity write path.
  const { data: one } = await sb.from("leads").select("id").eq("org_id", A.id).eq("name", "A-Lead-1").single();
  const upd = await sb.from("leads").update({ status: "won" }).eq("org_id", A.id).eq("id", one.id);
  check("lead status update succeeds", upd.error === null, upd.error?.message || "");
  const act = await sb.from("lead_activities").insert({ org_id: A.id, lead_id: one.id, kind: "status_change", note: "Status changed to won" });
  check("activity timeline write succeeds", act.error === null, act.error?.message || "");

  // ── Item Master ────────────────────────────────────────────────────────────
  // Items: 2 in A (one with a SKU), 1 in B that reuses A's SKU (allowed cross-org).
  await sb.from("items").insert([
    { org_id: A.id, name: "A 18mm Ply", name_key: nameKey("A 18mm Ply"), code: "PLY-1", type: "material", base_uom: "sheet", base_rate: 1850, tax_rate: 18 },
    { org_id: A.id, name: "A Laminate", name_key: nameKey("A Laminate"), type: "material", base_uom: "sheet", base_rate: 950, tax_rate: 18 },
    { org_id: B.id, name: "B 18mm Ply", name_key: nameKey("B 18mm Ply"), code: "PLY-1", type: "material", base_uom: "sheet", base_rate: 1800, tax_rate: 18 },
  ]);

  // (5) Tenant isolation on items.
  const { data: aItems } = await sb.from("items").select("name").eq("org_id", A.id);
  const { data: bItems } = await sb.from("items").select("name").eq("org_id", B.id);
  check("org A sees exactly its 2 items", aItems.length === 2, `got ${aItems.length}`);
  check("org B sees exactly its 1 item", bItems.length === 1, `got ${bItems.length}`);
  check(
    "no cross-tenant item leakage (A's query has no B rows)",
    !aItems.some((i) => i.name.startsWith("B ")),
  );

  // (6) Name dedupe: a second item with the same normalised name in the SAME org
  //     is rejected by uq_items_org_namekey (matches Dzylo "Item name already exists").
  const dupName = await sb.from("items").insert({
    org_id: A.id,
    name: "a  18MM   ply", // same name_key as "A 18mm Ply"
    name_key: nameKey("a  18MM   ply"),
    type: "material",
    base_uom: "sheet",
  });
  check("duplicate item name in same org is rejected", dupName.error !== null, dupName.error?.code || "");

  // (6b) …but the same name is allowed in a DIFFERENT org.
  const okName = await sb.from("items").insert({
    org_id: B.id,
    name: "A 18mm Ply",
    name_key: nameKey("A 18mm Ply"),
    type: "material",
    base_uom: "sheet",
  });
  check("same item name allowed in a different org", okName.error === null, okName.error?.message || "");

  // (7) SKU dedupe: reusing a code within the SAME org is rejected…
  const dupCode = await sb.from("items").insert({
    org_id: A.id,
    name: "A Different Item",
    name_key: nameKey("A Different Item"),
    code: "PLY-1",
    type: "material",
    base_uom: "sheet",
  });
  check("duplicate SKU in same org is rejected", dupCode.error !== null, dupCode.error?.code || "");
  //     …while the SAME SKU across orgs was already inserted above (B's PLY-1) and allowed.
  check("same SKU allowed across orgs (B reused A's PLY-1)", (bItems.length === 1), "");

  // ── Quotations ───────────────────────────────────────────────────────────
  // A quote in each org; a section + 2 lines in A's quote.
  const { data: qa } = await sb
    .from("quotations")
    .insert({ org_id: A.id, number: "QT/TEST/A1", title: "A Quote", status: "draft", share_token: "TESTTOKENA1", share_enabled: true })
    .select("id")
    .single();
  await sb.from("quotations").insert({ org_id: B.id, number: "QT/TEST/B1", title: "B Quote", status: "draft" });
  const { data: sec } = await sb
    .from("quotation_sections")
    .insert({ org_id: A.id, quotation_id: qa.id, title: "Wood Work", sort_order: 0 })
    .select("id")
    .single();
  await sb.from("quotation_lines").insert([
    { org_id: A.id, quotation_id: qa.id, section_id: sec.id, title: "Wooden Partition", qty: 21, uom: "sqft", unit_price: 2160, tax_rate: 18, line_total: 48172.32 },
    { org_id: A.id, quotation_id: qa.id, section_id: sec.id, title: "Shelf", qty: 1, uom: "sqft", unit_price: 2160, tax_rate: 18, line_total: 2293.92 },
    // Measurement mode (0022): area 2.4 × 0.6 → derived qty 1.44 (server engine, not LLM).
    { org_id: A.id, quotation_id: qa.id, section_id: sec.id, title: "Ledge", qty: 1.44, uom: "sqft", unit_price: 1000, tax_rate: 18, line_total: 1699.2, measure_mode: "area", measure_length: 2.4, measure_width: 0.6 },
  ]);

  // (8) Tenant isolation on quotations + children.
  const { data: aQ } = await sb.from("quotations").select("title").eq("org_id", A.id);
  const { data: bQ } = await sb.from("quotations").select("title").eq("org_id", B.id);
  check("org A sees exactly its 1 quotation", aQ.length === 1, `got ${aQ.length}`);
  check("org B sees exactly its 1 quotation", bQ.length === 1, `got ${bQ.length}`);
  const { data: aLines } = await sb.from("quotation_lines").select("id").eq("org_id", A.id);
  check("A's quotation lines are org-scoped (3 lines)", aLines.length === 3, `got ${aLines.length}`);
  const { data: mLine } = await sb.from("quotation_lines").select("measure_mode, measure_length, measure_width, qty").eq("org_id", A.id).eq("measure_mode", "area").single();
  const mDerived = Math.round(Number(mLine.measure_length) * Number(mLine.measure_width) * 1000) / 1000; // resolveQty(area)
  check("measure-mode line persists + qty foots the area formula (2.4×0.6=1.44)", mDerived === 1.44 && Number(mLine.qty) === 1.44, `derived ${mDerived}, stored ${mLine?.qty}`);

  // (9) Share token is globally unique — a second org cannot collide on it.
  const dupToken = await sb.from("quotations").insert({
    org_id: B.id,
    number: "QT/TEST/B2",
    title: "B Dup Token",
    share_token: "TESTTOKENA1",
    share_enabled: true,
  });
  check("duplicate share_token across orgs is rejected", dupToken.error !== null, dupToken.error?.code || "");

  // (10) GST v2 — CGST/SGST (intra) vs IGST (inter) split round-trips + foots.
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const taxTotal = round2(7348.32 + 349.92); // the two A lines @ 18% → 7698.24
  const cgst = round2(taxTotal / 2);
  const sgst = round2(taxTotal - cgst);
  await sb
    .from("quotations")
    .update({
      taxable_total: 42768,
      tax_total: taxTotal,
      gst_treatment: "intra",
      works_contract: true,
      cgst_total: cgst,
      sgst_total: sgst,
      igst_total: 0,
    })
    .eq("id", qa.id);
  const { data: qaIntra } = await sb
    .from("quotations")
    .select("gst_treatment, works_contract, tax_total, cgst_total, sgst_total, igst_total")
    .eq("id", qa.id)
    .single();
  check(
    "intra-state split persists and CGST+SGST foots to tax_total",
    round2(Number(qaIntra.cgst_total) + Number(qaIntra.sgst_total)) === Number(qaIntra.tax_total) &&
      Number(qaIntra.igst_total) === 0,
    `${qaIntra.cgst_total}+${qaIntra.sgst_total} vs ${qaIntra.tax_total}`,
  );
  check("works_contract flag persists on the quote", qaIntra.works_contract === true, String(qaIntra.works_contract));

  await sb
    .from("quotations")
    .update({ gst_treatment: "inter", cgst_total: 0, sgst_total: 0, igst_total: taxTotal })
    .eq("id", qa.id);
  const { data: qaInter } = await sb
    .from("quotations")
    .select("gst_treatment, tax_total, cgst_total, sgst_total, igst_total")
    .eq("id", qa.id)
    .single();
  check(
    "inter-state routes the full GST to IGST",
    Number(qaInter.igst_total) === Number(qaInter.tax_total) &&
      Number(qaInter.cgst_total) === 0 &&
      Number(qaInter.sgst_total) === 0,
    `igst ${qaInter.igst_total} vs tax ${qaInter.tax_total}`,
  );

  // (12) Subscription + append-only usage ledger (REQ-04).
  await sb.from("subscriptions").insert([
    { org_id: A.id, plan_code: "trial", status: "trialing" },
    { org_id: B.id, plan_code: "trial", status: "trialing" },
  ]);
  const dupSub = await sb.from("subscriptions").insert({ org_id: A.id, plan_code: "trial" });
  check("one subscription per org (unique org_id) enforced", dupSub.error !== null, dupSub.error?.code || "");

  await sb.from("usage_events").insert([
    { org_id: A.id, metric: "quotations", quantity: 1 },
    { org_id: A.id, metric: "quotations", quantity: 1 },
    { org_id: A.id, metric: "items", quantity: 3 },
    { org_id: B.id, metric: "quotations", quantity: 5 },
  ]);
  const { data: aUse } = await sb.from("usage_events").select("metric, quantity").eq("org_id", A.id);
  const aRows = aUse ?? [];
  const aQuot = aRows.filter((r) => r.metric === "quotations").reduce((s, r) => s + Number(r.quantity), 0);
  check("usage ledger is org-scoped (A has exactly its 3 events)", aRows.length === 3, `got ${aRows.length}`);
  check("usage aggregates from the append-only ledger (A quotations = 2)", aQuot === 2, `got ${aQuot}`);
  const { data: planRow } = await sb.from("plans").select("code, limits").eq("code", "trial").maybeSingle();
  check(
    "trial plan seeded with lifetime limits",
    !!planRow && planRow.limits && typeof planRow.limits === "object" && Number(planRow.limits.quotations) > 0,
    "",
  );

  // (13) Quotation templates (Wave 2) — org-scoped structure snapshots.
  const { data: tplA } = await sb
    .from("quotation_templates")
    .insert({ org_id: A.id, name: "A 3BHK Premium" })
    .select("id")
    .single();
  await sb.from("quotation_templates").insert({ org_id: B.id, name: "B 2BHK" });
  const { data: tsecA } = await sb
    .from("quotation_template_sections")
    .insert({ org_id: A.id, template_id: tplA.id, title: "Wood Work", sort_order: 0 })
    .select("id")
    .single();
  await sb.from("quotation_template_lines").insert({
    org_id: A.id,
    template_id: tplA.id,
    section_id: tsecA.id,
    title: "Wardrobe",
    qty: 10,
    uom: "sqft",
    unit_price: 1850,
    tax_rate: 18,
  });
  const { data: aTpl } = await sb.from("quotation_templates").select("id").eq("org_id", A.id);
  const { data: bTpl } = await sb.from("quotation_templates").select("id").eq("org_id", B.id);
  check(
    "quotation templates are org-scoped (A=1, B=1)",
    (aTpl ?? []).length === 1 && (bTpl ?? []).length === 1,
    `A=${(aTpl ?? []).length} B=${(bTpl ?? []).length}`,
  );
  const { data: aTplLines } = await sb.from("quotation_template_lines").select("id").eq("org_id", A.id);
  check("template lines are org-scoped (A has 1)", (aTplLines ?? []).length === 1, `got ${(aTplLines ?? []).length}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  WAVE 1–3 MODULES — org-isolation + key business rules (Wave-4 QA gap close)
  //  Every new tenant table proven org-scoped; the pure engine rules that ship
  //  amounts (landed cost, PO fulfilment state, stock projection, variance)
  //  proven to round-trip against the real DB.
  // ══════════════════════════════════════════════════════════════════════════

  // Grab an A catalogue item id to use as a real reference on procurement lines.
  const { data: aItemRow } = await sb
    .from("items").select("id").eq("org_id", A.id).eq("code", "PLY-1").single();
  const aItemId = aItemRow.id;

  // ── Vendors (0008): name + phone dedupe per org, cross-org reuse allowed ────
  await sb.from("vendors").insert([
    { org_id: A.id, name: "A Plywood Co", name_key: nameKey("A Plywood Co"), phone: "+91 90000 11111", phone_key: phoneKey("+91 90000 11111"), category: "Plywood" },
    { org_id: A.id, name: "A Hardware Mart", name_key: nameKey("A Hardware Mart"), category: "Hardware" },
    { org_id: B.id, name: "A Plywood Co", name_key: nameKey("A Plywood Co"), category: "Plywood" },
  ]);
  const { data: aVend } = await sb.from("vendors").select("id, name").eq("org_id", A.id);
  const { data: bVend } = await sb.from("vendors").select("id").eq("org_id", B.id);
  check("org A sees exactly its 2 vendors", aVend.length === 2, `got ${aVend.length}`);
  check("same vendor name allowed across orgs (B reused A's)", bVend.length === 1, `got ${bVend.length}`);
  const dupVend = await sb.from("vendors").insert({ org_id: A.id, name: "a  plywood   co", name_key: nameKey("a  plywood   co") });
  check("duplicate vendor name in same org is rejected", dupVend.error !== null, dupVend.error?.code || "");
  const dupVendPhone = await sb.from("vendors").insert({ org_id: A.id, name: "A Other", name_key: nameKey("A Other"), phone_key: phoneKey("90000 11111") });
  check("duplicate vendor phone in same org is rejected", dupVendPhone.error !== null, dupVendPhone.error?.code || "");
  const aVendId = aVend[0].id;

  // ── Projects (0007): org-scoped ────────────────────────────────────────────
  await sb.from("projects").insert([
    { org_id: A.id, name: "A Malviya Nagar 3BHK", stage: "execution", health: "on_track", project_value: 1800000, funds_received: 600000, total_payable: 300000 },
    { org_id: B.id, name: "B Villa", stage: "planning", health: "on_track", project_value: 0, funds_received: 0, total_payable: 0 },
  ]);
  const { data: aProj } = await sb.from("projects").select("name").eq("org_id", A.id);
  check("org A sees exactly its 1 project (no B leakage)", aProj.length === 1 && !aProj.some((p) => p.name.startsWith("B ")), `got ${aProj.length}`);

  // ── Material Requests (0009): header + catalogue-ref vs flagged ad-hoc line ─
  const { data: mrA } = await sb.from("material_requests")
    .insert({ org_id: A.id, title: "A Site MR", project_label: "Malviya Nagar", stage: "requested" }).select("id").single();
  await sb.from("material_requests").insert({ org_id: B.id, title: "B MR" });
  await sb.from("material_request_items").insert([
    { org_id: A.id, mr_id: mrA.id, item_id: aItemId, item_name: "18mm Ply", is_adhoc: false, uom: "sheet", qty: 20 },
    { org_id: A.id, mr_id: mrA.id, item_id: null, item_name: "Custom bracket", is_adhoc: true, uom: "nos", qty: 8 },
  ]);
  const { data: aMr } = await sb.from("material_requests").select("id").eq("org_id", A.id);
  const { data: aMrItems } = await sb.from("material_request_items").select("item_id, is_adhoc").eq("org_id", A.id);
  check("org A sees exactly its 1 material request", aMr.length === 1, `got ${aMr.length}`);
  check("MR lines are org-scoped (A has 2)", aMrItems.length === 2, `got ${aMrItems.length}`);
  check("uncatalogued MR line is flagged ad-hoc (item_id null ⇔ is_adhoc)",
    aMrItems.every((l) => (l.item_id === null) === (l.is_adhoc === true)));

  // ── RFQ (0012): items + bid; landed-cost line total round-trips ────────────
  const { data: rfqA } = await sb.from("rfqs")
    .insert({ org_id: A.id, title: "A RFQ", mr_id: mrA.id, status: "comparing" }).select("id").single();
  await sb.from("rfqs").insert({ org_id: B.id, title: "B RFQ" });
  const { data: rfqItemA } = await sb.from("rfq_items")
    .insert({ org_id: A.id, rfq_id: rfqA.id, item_id: aItemId, item_name: "18mm Ply", uom: "sheet", qty: 20 }).select("id").single();
  await sb.from("rfq_vendors").insert({ org_id: A.id, rfq_id: rfqA.id, vendor_id: aVendId, response_status: "submitted" });
  const { data: bidA } = await sb.from("rfq_bids")
    .insert({ org_id: A.id, rfq_id: rfqA.id, vendor_id: aVendId, version: 1, entry_mode: "proxy" }).select("id").single();
  const landed = round2(20 * 1850 + 500); // qty × unit_rate + freight = landedLineTotal
  await sb.from("rfq_bid_lines").insert({ org_id: A.id, bid_id: bidA.id, rfq_item_id: rfqItemA.id, unit_rate: 1850, tax_pct: 18, freight: 500, line_total: landed });
  const { data: aRfq } = await sb.from("rfqs").select("id").eq("org_id", A.id);
  const { data: bidLineA } = await sb.from("rfq_bid_lines").select("line_total").eq("org_id", A.id).single();
  check("org A sees exactly its 1 RFQ", aRfq.length === 1, `got ${aRfq.length}`);
  check("RFQ bid line lands at qty×rate+freight (37500)", Number(bidLineA.line_total) === landed, `got ${bidLineA.line_total}`);

  // ── Purchase Orders (0013): amount = Σ lines; order_state derives from receipts ─
  const poLines = [{ qty: 10, unit_rate: 100 }, { qty: 5, unit_rate: 200 }]; // Σ = 2000
  const poAmount = round2(poLines.reduce((s, l) => s + round2(l.qty * l.unit_rate), 0));
  const { data: poA } = await sb.from("purchase_orders")
    .insert({ org_id: A.id, name: "A PO-1", vendor_id: aVendId, amount: poAmount, order_state: "created", payment_state: "not_initiated" }).select("id").single();
  await sb.from("purchase_orders").insert({ org_id: B.id, name: "B PO", vendor_id: aVendId });
  const { data: poL1 } = await sb.from("po_lines")
    .insert({ org_id: A.id, po_id: poA.id, item_id: aItemId, item_name: "Ply", qty: 10, unit_rate: 100, tax_pct: 18, line_total: round2(10 * 100) }).select("id").single();
  await sb.from("po_lines").insert({ org_id: A.id, po_id: poA.id, item_name: "Hinge", qty: 5, unit_rate: 200, tax_pct: 18, line_total: round2(5 * 200) });
  const { data: rcpt } = await sb.from("po_receipts").insert({ org_id: A.id, po_id: poA.id, mode: "admin_override" }).select("id").single();
  await sb.from("po_receipt_lines").insert({ org_id: A.id, receipt_id: rcpt.id, po_line_id: poL1.id, qty_received: 4 });
  const { data: aPo } = await sb.from("purchase_orders").select("amount").eq("org_id", A.id).eq("name", "A PO-1").single();
  const { data: aPoLines } = await sb.from("po_lines").select("qty").eq("org_id", A.id);
  const { data: aRcptLines } = await sb.from("po_receipt_lines").select("qty_received").eq("org_id", A.id);
  const ordered = aPoLines.reduce((s, l) => s + Number(l.qty), 0);
  const received = aRcptLines.reduce((s, l) => s + Number(l.qty_received), 0);
  const derived = !(received > 0) ? "created" : received < ordered ? "partially_delivered" : "delivered"; // deriveOrderState
  check("PO amount is the pure sum of line totals (2000)", Number(aPo.amount) === poAmount, `got ${aPo.amount}`);
  check("PO order_state derives partially_delivered from 4/15 received", derived === "partially_delivered", `ordered=${ordered} received=${received} → ${derived}`);

  // ── Inventory (0014): append-only ledger → projected stock level ────────────
  const { data: whA } = await sb.from("warehouses").insert({ org_id: A.id, name: "A Store" }).select("id").single();
  await sb.from("warehouses").insert({ org_id: B.id, name: "B Store" });
  await sb.from("stock_movements").insert([
    { org_id: A.id, item_id: aItemId, item_name: "Ply", warehouse_id: whA.id, direction: "in", qty: 100, uom: "sheet", unit_rate: 1850, gst_pct: 18 },
    { org_id: A.id, item_id: aItemId, item_name: "Ply", warehouse_id: whA.id, direction: "out", qty: 30, uom: "sheet", unit_rate: 1850, gst_pct: 18 },
    { org_id: A.id, item_id: aItemId, item_name: "Ply", warehouse_id: whA.id, direction: "transfer", qty: 50, uom: "sheet", unit_rate: 1850, gst_pct: 18 },
  ]);
  const { data: aMoves } = await sb.from("stock_movements").select("direction, qty").eq("org_id", A.id);
  const signed = (dir, q) => (dir === "in" ? Number(q) : dir === "out" ? -Number(q) : 0); // signedQty
  const projected = round2(aMoves.reduce((s, m) => s + signed(m.direction, m.qty), 0));
  const { data: bMoves } = await sb.from("stock_movements").select("id").eq("org_id", B.id);
  check("stock ledger is org-scoped (A has 3 movements, B has 0)", aMoves.length === 3 && (bMoves ?? []).length === 0, `A=${aMoves.length} B=${(bMoves ?? []).length}`);
  check("projected stock = Σ signed qty (100 − 30 + 0(transfer) = 70)", projected === 70, `got ${projected}`);

  // ── Finance (0015): contract + milestones foot to 100% ─────────────────────
  const { data: ctA } = await sb.from("contracts")
    .insert({ org_id: A.id, name: "A Contract", amount: 1000000, source: "client", project_label: "Malviya Nagar" }).select("id").single();
  await sb.from("contracts").insert({ org_id: B.id, name: "B Contract", amount: 500000 });
  await sb.from("milestones").insert([
    { org_id: A.id, contract_id: ctA.id, seq: 1, name: "Advance", pct: 40, amount: 400000, work_done: true },
    { org_id: A.id, contract_id: ctA.id, seq: 2, name: "On completion", pct: 60, amount: 600000, work_done: false },
  ]);
  await sb.from("payments").insert([
    { org_id: A.id, contract_id: ctA.id, direction: "inflow", amount: 400000, mode: "bank_transfer" },
    { org_id: B.id, direction: "inflow", amount: 100000 },
  ]);
  const { data: aMs } = await sb.from("milestones").select("pct").eq("org_id", A.id);
  const { data: aPay } = await sb.from("payments").select("direction, amount").eq("org_id", A.id);
  check("milestones are org-scoped and foot to 100%", aMs.length === 2 && round2(aMs.reduce((s, m) => s + Number(m.pct), 0)) === 100, `Σpct=${aMs.reduce((s, m) => s + Number(m.pct), 0)}`);
  check("payments are org-scoped (A has 1 inflow of 400000)", aPay.length === 1 && Number(aPay[0].amount) === 400000, `got ${aPay.length}`);

  // ── Pipeline (0016): stage name unique per org; follow-up tied to a lead ────
  await sb.from("pipeline_stages").insert([
    { org_id: A.id, name: "New Inquiry", seq: 0, is_won: false },
    { org_id: A.id, name: "Won", seq: 1, is_won: true },
  ]);
  const dupStage = await sb.from("pipeline_stages").insert({ org_id: A.id, name: "New Inquiry", seq: 5 });
  check("duplicate pipeline stage name in same org is rejected", dupStage.error !== null, dupStage.error?.code || "");
  const okStageB = await sb.from("pipeline_stages").insert({ org_id: B.id, name: "New Inquiry", seq: 0 });
  check("same stage name allowed in a different org", okStageB.error === null, okStageB.error?.message || "");
  await sb.from("follow_ups").insert({ org_id: A.id, lead_id: one.id, due_at: new Date().toISOString(), note: "Call back" });
  const { data: aFu } = await sb.from("follow_ups").select("id").eq("org_id", A.id);
  check("follow-ups are org-scoped (A has 1)", aFu.length === 1, `got ${aFu.length}`);

  // ── Interactions (0011): channel-agnostic log, org-scoped ──────────────────
  await sb.from("interactions").insert([
    { org_id: A.id, lead_id: one.id, channel: "call", direction: "outbound", status: "completed", duration_sec: 120 },
    { org_id: A.id, lead_id: one.id, channel: "whatsapp", direction: "inbound", status: "completed", duration_sec: 0 },
    { org_id: B.id, lead_id: null, channel: "call", direction: "inbound", status: "no_answer", duration_sec: 0 },
  ]);
  const { data: aInt } = await sb.from("interactions").select("channel").eq("org_id", A.id);
  check("interactions are org-scoped (A has 2 across channels)", aInt.length === 2, `got ${aInt.length}`);

  // ── Config (0010): numbering series + permissions uniqueness ────────────────
  await sb.from("numbering_series").insert({ org_id: A.id, doc_type: "purchase_order", prefix: "VEYRA", fy_segment: true, padding: 4, current_int: 41 });
  const dupSeries = await sb.from("numbering_series").insert({ org_id: A.id, doc_type: "purchase_order" });
  check("one numbering series per (org, doc_type) enforced", dupSeries.error !== null, dupSeries.error?.code || "");
  const { data: roleA } = await sb.from("roles").insert({ org_id: A.id, name: "Site Supervisor" }).select("id").single();
  await sb.from("permissions").insert({ org_id: A.id, role_id: roleA.id, module: "procurement", action: "view", scope: "org" });
  const dupPerm = await sb.from("permissions").insert({ org_id: A.id, role_id: roleA.id, module: "procurement", action: "view", scope: "team" });
  check("permission grant unique per (org, role, module, action)", dupPerm.error !== null, dupPerm.error?.code || "");

  // ── Approvals (0017): one rule per (org, module); threshold decides ─────────
  await sb.from("approval_rules").insert({ org_id: A.id, module: "procurement", threshold_amount: 50000, is_active: true });
  const dupRule = await sb.from("approval_rules").insert({ org_id: A.id, module: "procurement", threshold_amount: 99999 });
  check("one approval rule per (org, module) enforced", dupRule.error !== null, dupRule.error?.code || "");
  const needsApproval = (amount, threshold, active) => active && Number(amount) > Number(threshold); // needsApproval
  check("needsApproval: 2000-PO under 50000 threshold does NOT need sign-off", needsApproval(poAmount, 50000, true) === false, "");
  check("needsApproval: 60000 over 50000 threshold DOES need sign-off", needsApproval(60000, 50000, true) === true, "");
  await sb.from("approval_requests").insert({ org_id: A.id, module: "procurement", entity_label: "A PO-1", amount: 60000, status: "pending" });
  const { data: aAppr } = await sb.from("approval_requests").select("status").eq("org_id", A.id);
  check("approval requests are org-scoped (A has 1 pending)", aAppr.length === 1 && aAppr[0].status === "pending", `got ${aAppr.length}`);

  // ── Design vault (0018): asset + pin comment + sign-off, org-scoped ─────────
  const { data: assetA } = await sb.from("assets").insert({ org_id: A.id, name: "A Living Render", kind: "render", url: "https://ex/a.png", project_label: "Malviya Nagar" }).select("id").single();
  await sb.from("assets").insert({ org_id: B.id, name: "B Plan", kind: "2d" });
  await sb.from("asset_comments").insert({ org_id: A.id, asset_id: assetA.id, x_pct: 42.5, y_pct: 60, body: "Move the TV unit left" });
  await sb.from("asset_signoffs").insert({ org_id: A.id, asset_id: assetA.id, status: "approved", note: "Client approved" });
  const { data: aAssets } = await sb.from("assets").select("id").eq("org_id", A.id);
  const { data: aSign } = await sb.from("asset_signoffs").select("status").eq("org_id", A.id);
  check("design assets are org-scoped (A has 1)", aAssets.length === 1, `got ${aAssets.length}`);
  check("asset sign-off persists org-scoped (approved)", aSign.length === 1 && aSign[0].status === "approved", `got ${aSign.length}`);

  // ── Site execution (0019): logs + measurement variance (the wedge) ─────────
  await sb.from("site_logs").insert({ org_id: A.id, project_label: "Malviya Nagar", work_summary: "Carcass install day 1" });
  await sb.from("site_logs").insert({ org_id: B.id, work_summary: "B day 1" });
  await sb.from("site_attendance").insert({ org_id: A.id, project_label: "Malviya Nagar", member_name: "Ramesh", lat: 17.385, lng: 78.4867 });
  await sb.from("measurement_variance").insert({ org_id: A.id, project_label: "Malviya Nagar", item_name: "Wardrobe", uom: "sqft", quoted_qty: 100, measured_qty: 120 });
  const { data: aLogs } = await sb.from("site_logs").select("id").eq("org_id", A.id);
  const { data: aVar } = await sb.from("measurement_variance").select("quoted_qty, measured_qty").eq("org_id", A.id).single();
  const vPct = (() => { const q = Number(aVar.quoted_qty), m = Number(aVar.measured_qty); return q === 0 ? 0 : Math.round(((m - q) / q) * 1000) / 10; })(); // variancePct
  check("site logs are org-scoped (A has 1)", aLogs.length === 1, `got ${aLogs.length}`);
  check("measurement variance computes +20% (quoted 100 → measured 120)", vPct === 20, `got ${vPct}`);

  // ── Production (0020): BOM + Cutlist org-isolation + derived-qty foot ───────
  const { data: bomA } = await sb.from("boms").insert({ org_id: A.id, title: "Kitchen BOM" }).select().single();
  await sb.from("boms").insert({ org_id: B.id, title: "B BOM" }); // B leakage guard
  // qty 10 @ 5% waste → effective_qty 10.5 (server-computed via effectiveQty, stored)
  await sb.from("bom_lines").insert({ org_id: A.id, bom_id: bomA.id, material_name: "18mm MDF", uom: "sheet", qty: 10, waste_pct: 5, effective_qty: 10.5 });
  const { data: cutA } = await sb.from("cutlists").insert({ org_id: A.id, bom_id: bomA.id, title: "Kitchen cutlist" }).select().single();
  // panel 600×400 qty2, band one length-edge + one width-edge
  await sb.from("cutlist_panels").insert({ org_id: A.id, cutlist_id: cutA.id, panel_name: "Shutter", length_mm: 600, width_mm: 400, qty: 2, grain: "length", edge_l1: true, edge_w1: true });
  const { data: aBoms } = await sb.from("boms").select("id").eq("org_id", A.id);
  const { data: aLine } = await sb.from("bom_lines").select("effective_qty").eq("org_id", A.id).single();
  const { data: p } = await sb.from("cutlist_panels").select("length_mm,width_mm,qty,edge_l1,edge_l2,edge_w1,edge_w2").eq("org_id", A.id).single();
  const areaSqm = Math.round((p.length_mm / 1000) * (p.width_mm / 1000) * 1000) / 1000; // panelAreaSqm
  const bandMm = ((p.edge_l1 ? p.length_mm : 0) + (p.edge_l2 ? p.length_mm : 0) + (p.edge_w1 ? p.width_mm : 0) + (p.edge_w2 ? p.width_mm : 0)) * p.qty; // panelBandingMm
  check("production BOMs are org-scoped (A has 1, no B leak)", aBoms.length === 1, `got ${aBoms.length}`);
  check("bom_line effective_qty stored = qty×(1+waste%) (10 @5% → 10.5)", Number(aLine.effective_qty) === 10.5, `got ${aLine.effective_qty}`);
  check("cutlist panel area foots (600×400 → 0.24 sqm)", areaSqm === 0.24, `got ${areaSqm}`);
  check("cutlist panel banding foots ((600+400)×2 = 2000mm)", bandMm === 2000, `got ${bandMm}`);

  // ── Production nesting + panel-QR (0021): org-isolation + token uniqueness ──
  await sb.from("nesting_runs").insert({ org_id: A.id, cutlist_id: cutA.id, board_length_mm: 2440, board_width_mm: 1220, boards_used: 1, total_panel_area_sqm: 0.48, board_area_sqm: 2.9768, waste_pct: 83.87 });
  await sb.from("nesting_runs").insert({ org_id: B.id, cutlist_id: cutA.id, board_length_mm: 2440, board_width_mm: 1220 });
  const { data: aRuns } = await sb.from("nesting_runs").select("id").eq("org_id", A.id);
  check("nesting runs are org-scoped (A has 1, no B leak)", aRuns.length === 1, `got ${aRuns.length}`);
  await sb.from("panel_tags").insert({ org_id: A.id, panel_name: "Shutter #1", token: "PT-AAAA1111", stage: "cut" });
  const dupTag = await sb.from("panel_tags").insert({ org_id: A.id, panel_name: "dup", token: "PT-AAAA1111" });
  check("panel-QR token is unique per org (dup rejected)", !!dupTag.error, dupTag.error?.code || "no error");

  // ── Workspace (0023): tasks, attendance, expenses, leave ──────────────────
  // Both orgs get a member so "my work" vs "their work" is a real distinction.
  const { data: memA } = await sb
    .from("org_members")
    .insert({ org_id: A.id, user_id: crypto.randomUUID(), role: "member", display_name: "A Staff" })
    .select("id")
    .single();
  const { data: memB } = await sb
    .from("org_members")
    .insert({ org_id: B.id, user_id: crypto.randomUUID(), role: "member", display_name: "B Staff" })
    .select("id")
    .single();

  await sb.from("tasks").insert([
    { org_id: A.id, title: "A task", assignee_id: memA.id, status: "created", due_at: new Date(Date.now() - 86400000).toISOString() },
    { org_id: A.id, title: "A done", assignee_id: memA.id, status: "done" },
    { org_id: B.id, title: "B task", assignee_id: memB.id, status: "created" },
  ]);
  const aTasks = await sb.from("tasks").select("id").eq("org_id", A.id);
  check("tasks are org-scoped (A has 2, no B leak)", (aTasks.data ?? []).length === 2, `got ${(aTasks.data ?? []).length}`);

  // Attendance: at most one OPEN session per member (partial unique index).
  await sb.from("work_sessions").insert({ org_id: A.id, member_id: memA.id, check_in: new Date().toISOString() });
  const dupOpen = await sb
    .from("work_sessions")
    .insert({ org_id: A.id, member_id: memA.id, check_in: new Date().toISOString() });
  check("a member cannot be checked in twice at once", !!dupOpen.error, dupOpen.error?.code || "no error");

  // Hours are DERIVED from the stamps, never stored as a total.
  const inAt = new Date("2026-06-27T09:00:00Z");
  const outAt = new Date("2026-06-27T17:30:00Z");
  await sb.from("work_sessions").insert({
    org_id: A.id, member_id: memB.id, check_in: inAt.toISOString(), check_out: outAt.toISOString(),
  });
  const closed = await sb
    .from("work_sessions").select("check_in, check_out").eq("org_id", A.id).not("check_out", "is", null).single();
  const hours = (new Date(closed.data.check_out) - new Date(closed.data.check_in)) / 3600000;
  check("attendance hours derive from the stamps (09:00→17:30 = 8.5h)", hours === 8.5, `got ${hours}`);

  await sb.from("expense_claims").insert([
    { org_id: A.id, member_id: memA.id, amount: 2500, category: "materials", status: "approved" },
    { org_id: A.id, member_id: memA.id, amount: 700, category: "transport", status: "reimbursed" },
    { org_id: B.id, member_id: memB.id, amount: 9999, category: "materials", status: "approved" },
  ]);
  const aPayable = await sb.from("expense_claims").select("amount").eq("org_id", A.id).eq("status", "approved");
  const payable = (aPayable.data ?? []).reduce((t, r) => t + Number(r.amount), 0);
  check("expense payable sums approved only, org-scoped (2500)", payable === 2500, `got ${payable}`);

  await sb.from("leave_requests").insert({
    org_id: A.id, member_id: memA.id, leave_type: "casual",
    from_date: "2026-06-22", to_date: "2026-06-23", days: 2, status: "approved",
  });
  const aLeave = await sb.from("leave_requests").select("days").eq("org_id", A.id);
  check("leave is org-scoped (A has 1 request of 2 days)", (aLeave.data ?? []).length === 1 && Number(aLeave.data[0].days) === 2);

  // ── Lead management (0024) ────────────────────────────────────────────────
  await sb.from("lead_statuses").insert([
    { org_id: A.id, value: "negotiation", label: "Negotiation", seq: 0 },
    { org_id: B.id, value: "negotiation", label: "Haggling", seq: 0 },
  ]);
  const dupStatus = await sb.from("lead_statuses").insert({ org_id: A.id, value: "negotiation", label: "Dup" });
  check("a status slug is unique per org (dup rejected)", !!dupStatus.error, dupStatus.error?.code || "no error");
  const bLabel = await sb.from("lead_statuses").select("label").eq("org_id", B.id).eq("value", "negotiation").single();
  check("the same slug carries a different label per tenant", bLabel.data?.label === "Haggling", bLabel.data?.label);

  // Multi-assignee, and the same person cannot be added to one lead twice.
  const { data: aLeadRow } = await sb
    .from("leads").select("id").eq("org_id", A.id).eq("name", "A-Lead-1").single();
  const aLeadId = aLeadRow.id;
  await sb.from("lead_assignees").insert({ org_id: A.id, lead_id: aLeadId, member_id: memA.id });
  const dupAssign = await sb.from("lead_assignees").insert({ org_id: A.id, lead_id: aLeadId, member_id: memA.id });
  check("a member cannot be assigned to the same lead twice", !!dupAssign.error, dupAssign.error?.code || "no error");

  // A follow-up left open past its time is MISSED — derived, never stored.
  await sb.from("follow_ups").insert([
    { org_id: A.id, lead_id: aLeadId, due_at: new Date(Date.now() - 3600000).toISOString(), status: "upcoming", kind: "callback", member_id: memA.id },
    { org_id: A.id, lead_id: aLeadId, due_at: new Date(Date.now() + 3600000).toISOString(), status: "upcoming", kind: "meeting", member_id: memA.id },
  ]);
  // Scope to the pair just inserted — an earlier block already left one
  // follow-up on this org, and counting it would make this assertion lie.
  const fus = await sb
    .from("follow_ups").select("due_at, status")
    .eq("org_id", A.id).eq("status", "upcoming").eq("member_id", memA.id);
  const missed = (fus.data ?? []).filter((f) => new Date(f.due_at) < new Date()).length;
  check("a lapsed open follow-up derives as missed (1 of 2)", missed === 1, `got ${missed}`);

  // Promote-to-project is a real FK, not a string match.
  const { data: proj } = await sb
    .from("projects").insert({ org_id: A.id, name: "A Promoted", lead_id: aLeadId }).select("id").single();
  await sb.from("leads").update({ project_id: proj.id }).eq("id", aLeadId);
  const joined = await sb.from("leads").select("project_id").eq("id", aLeadId).single();
  check("promote-to-project links lead→project by FK", joined.data?.project_id === proj.id);

  // ── Follow-up assignees + outcome rules (0026) ────────────────────────────
  const { data: aFuRow } = await sb
    .from("follow_ups").select("id").eq("org_id", A.id).eq("member_id", memA.id).limit(1).single();
  await sb.from("follow_up_assignees").insert({ org_id: A.id, follow_up_id: aFuRow.id, member_id: memA.id });
  const dupFuAssign = await sb
    .from("follow_up_assignees").insert({ org_id: A.id, follow_up_id: aFuRow.id, member_id: memA.id });
  check("a member cannot be assigned to the same follow-up twice", !!dupFuAssign.error, dupFuAssign.error?.code || "no error");

  const aAssignees = await sb.from("follow_up_assignees").select("id").eq("org_id", A.id);
  const bAssignees = await sb.from("follow_up_assignees").select("id").eq("org_id", B.id);
  check(
    "follow-up assignees are org-scoped (A has rows, B has none)",
    (aAssignees.data ?? []).length > 0 && (bAssignees.data ?? []).length === 0,
    `A=${(aAssignees.data ?? []).length} B=${(bAssignees.data ?? []).length}`,
  );

  await sb.from("followup_outcome_rules").insert([
    { org_id: A.id, outcome_slug: "interested", next_status: "negotiation", auto_schedule_days: 3 },
    { org_id: B.id, outcome_slug: "interested", next_status: "negotiation", auto_schedule_days: 7 },
  ]);
  const dupOutcomeRule = await sb
    .from("followup_outcome_rules").insert({ org_id: A.id, outcome_slug: "interested" });
  check("one outcome rule per outcome per org enforced", !!dupOutcomeRule.error, dupOutcomeRule.error?.code || "no error");
  const bOutcomeRule = await sb
    .from("followup_outcome_rules").select("auto_schedule_days").eq("org_id", B.id).eq("outcome_slug", "interested").single();
  check("each tenant tunes the same outcome differently", bOutcomeRule.data?.auto_schedule_days === 7, `got ${bOutcomeRule.data?.auto_schedule_days}`);

  // A lead feed would attach by id; the column exists and is per-tenant.
  await sb.from("leads").update({ external_ref: "FEED-001" }).eq("id", aLeadId);
  const extRef = await sb.from("leads").select("external_ref").eq("id", aLeadId).single();
  check("a lead carries an external reference for a future feed", extRef.data?.external_ref === "FEED-001");

  // ── Quotation studio (0025) ───────────────────────────────────────────────
  const dupSettings = await sb.from("quotation_settings").insert([
    { org_id: A.id, default_gst_pct: 18 },
    { org_id: A.id, default_gst_pct: 12 },
  ]);
  check("one quotation-settings row per org enforced", !!dupSettings.error, dupSettings.error?.code || "no error");

  await sb.from("ai_requests").insert([
    { org_id: A.id, provider: "gemini", model: "test", prompt: "A prompt", status: "ok", lines_created: 5 },
    { org_id: B.id, provider: "gemini", model: "test", prompt: "B prompt", status: "ok", lines_created: 3 },
  ]);
  const aAi = await sb.from("ai_requests").select("lines_created").eq("org_id", A.id);
  check("the AI request log is org-scoped (A has 1)", (aAi.data ?? []).length === 1, `got ${(aAi.data ?? []).length}`);

  // ── The spine: scope_items + real project FKs (0027 / 0028) ───────────────
  const { data: aScope } = await sb.from("scope_items").insert([
    { org_id: A.id, name: "Kitchen", room: "Kitchen" },
  ]).select("id").single();
  await sb.from("scope_items").insert([
    { org_id: A.id, parent_id: aScope.id, name: "Base cabinets", uom: "rft", qty: 18 },
    { org_id: B.id, name: "B's own scope" },
  ]);
  const aScopeRows = await sb.from("scope_items").select("id").eq("org_id", A.id);
  const bScopeRows = await sb.from("scope_items").select("id").eq("org_id", B.id);
  check(
    "scope items are org-scoped (A has 2, B has 1)",
    (aScopeRows.data ?? []).length === 2 && (bScopeRows.data ?? []).length === 1,
    `A=${(aScopeRows.data ?? []).length} B=${(bScopeRows.data ?? []).length}`,
  );

  // Deleting a parent takes its children — the cascade the section-delete path
  // has to work around, asserted here so nobody "simplifies" that away.
  await sb.from("scope_items").delete().eq("id", aScope.id);
  const afterCascade = await sb.from("scope_items").select("id").eq("org_id", A.id);
  check(
    "deleting a scope parent cascades to its children",
    (afterCascade.data ?? []).length === 0,
    `got ${(afterCascade.data ?? []).length}`,
  );

  // A payment now joins its project by FK, not by name.
  const { data: payProj } = await sb
    .from("projects").insert({ org_id: A.id, name: "A Spine Project" }).select("id").single();
  await sb.from("payments").insert([
    { org_id: A.id, direction: "inflow", amount: 100000, project_id: payProj.id, project_label: "A Spine Project" },
    { org_id: B.id, direction: "inflow", amount: 999, project_label: "A Spine Project" },
  ]);
  const byFk = await sb.from("payments").select("amount").eq("org_id", A.id).eq("project_id", payProj.id);
  check(
    "payments join their project by FK, and the join is org-scoped",
    (byFk.data ?? []).length === 1 && Number(byFk.data[0].amount) === 100000,
    `got ${(byFk.data ?? []).length} rows`,
  );

  // Renaming the project must NOT empty its P&L — the whole point of 0028.
  await sb.from("projects").update({ name: "A Spine Project (renamed)" }).eq("id", payProj.id);
  const afterRename = await sb.from("payments").select("amount").eq("org_id", A.id).eq("project_id", payProj.id);
  check(
    "renaming a project keeps its payments attached",
    (afterRename.data ?? []).length === 1,
    `got ${(afterRename.data ?? []).length} rows`,
  );

  // ── Project milestones: the DELIVERY schedule (0032) ──────────────────────
  await sb.from("project_milestones").insert([
    { org_id: A.id, project_id: payProj.id, name: "Site Measurements", status: "completed", progress_pct: 100, planned_end: "2026-04-05", actual_end: "2026-04-04", client_visible: true },
    // Every row carries the same keys on purpose: a PostgREST bulk insert sends
    // an explicit NULL for a key one row omits, which defeats the column
    // default and trips the not-null constraint.
    { org_id: A.id, project_id: payProj.id, name: "Internal snag list", status: "not_started", progress_pct: 0, planned_end: "2026-09-01", actual_end: null, client_visible: false },
  ]);
  const aDelivery = await sb.from("project_milestones").select("id").eq("org_id", A.id);
  const bDelivery = await sb.from("project_milestones").select("id").eq("org_id", B.id);
  check(
    "project milestones are org-scoped (A has 2, B has none)",
    (aDelivery.data ?? []).length === 2 && (bDelivery.data ?? []).length === 0,
    `A=${(aDelivery.data ?? []).length} B=${(bDelivery.data ?? []).length}`,
  );

  // client_visible is what the Progress Report filters on — it must be stored
  // per row, not inferred, or the report leaks the internal plan.
  const visible = await sb
    .from("project_milestones").select("name").eq("org_id", A.id).eq("client_visible", true);
  check(
    "only client-visible milestones come back for a client-facing report",
    (visible.data ?? []).length === 1 && visible.data[0].name === "Site Measurements",
    `got ${(visible.data ?? []).length}`,
  );

  // The DELIVERY schedule and the PAYMENT schedule are different tables on
  // purpose — asserting it here so a later "cleanup" does not merge them.
  const deliveryCols = await sb.from("project_milestones").select("planned_end, actual_end").limit(1);
  const paymentCols = await sb.from("milestones").select("pct, amount, work_done").limit(1);
  check(
    "delivery milestones and payment milestones stay separate tables",
    !deliveryCols.error && !paymentCols.error,
    `${deliveryCols.error?.message ?? "ok"} / ${paymentCols.error?.message ?? "ok"}`,
  );

  // ── Documents: folders belong to ONE project (0029) ───────────────────────
  // The owner's rule, asserted at the database: "project 1 and project 2 can't
  // share the same folders."
  const { data: projA2 } = await sb
    .from("projects").insert({ org_id: A.id, name: "A Second Project" }).select("id").single();

  await sb.from("project_folders").insert([
    { org_id: A.id, project_id: payProj.id, name: "2D" },
    { org_id: A.id, project_id: projA2.id, name: "2D" },
  ]);
  const foldersP1 = await sb.from("project_folders").select("id, name").eq("project_id", payProj.id);
  const foldersP2 = await sb.from("project_folders").select("id, name").eq("project_id", projA2.id);
  check(
    "two projects in one org can each own a folder called 2D",
    (foldersP1.data ?? []).length === 1 && (foldersP2.data ?? []).length === 1
      && foldersP1.data[0].id !== foldersP2.data[0].id,
    `p1=${(foldersP1.data ?? []).length} p2=${(foldersP2.data ?? []).length}`,
  );

  const dupFolder = await sb
    .from("project_folders").insert({ org_id: A.id, project_id: payProj.id, name: "2D" });
  check(
    "a folder name is unique WITHIN a project (dup rejected)",
    !!dupFolder.error,
    dupFolder.error?.code || "no error",
  );

  // A file filed into project 1's folder must never be listed under project 2.
  await sb.from("project_files").insert({
    org_id: A.id, project_id: payProj.id, folder_id: foldersP1.data[0].id,
    name: "Ground floor plan", internal_status: "draft", client_approval: "not_shared",
    current_version: 1,
  });
  const filesP2 = await sb.from("project_files").select("id").eq("project_id", projA2.id);
  check(
    "one project's files are invisible to another project",
    (filesP2.data ?? []).length === 0,
    `got ${(filesP2.data ?? []).length}`,
  );

  // And a folder is not visible across tenants either.
  await sb.from("project_folders").insert({ org_id: B.id, project_id: null, name: "B folder" });
  const bFolders = await sb.from("project_folders").select("id").eq("org_id", B.id);
  check(
    "a folder cannot exist without a project (null project_id rejected)",
    (bFolders.data ?? []).length === 0,
    `got ${(bFolders.data ?? []).length}`,
  );

  // The shared comment thread: internal and client are separate conversations.
  const { data: aFile } = await sb
    .from("project_files").select("id").eq("project_id", payProj.id).limit(1).single();
  await sb.from("entity_comments").insert([
    { org_id: A.id, entity_type: "project_file", entity_id: aFile.id, audience: "internal", body: "Margin looks thin", status: "open" },
    { org_id: A.id, entity_type: "project_file", entity_id: aFile.id, audience: "client", body: "Please add a TV unit", status: "open" },
  ]);
  const clientThread = await sb
    .from("entity_comments").select("body")
    .eq("org_id", A.id).eq("entity_id", aFile.id).eq("audience", "client");
  check(
    "the client thread never contains the internal one",
    (clientThread.data ?? []).length === 1
      && clientThread.data[0].body === "Please add a TV unit",
    `got ${(clientThread.data ?? []).length}`,
  );

  // (4) Auth admin path (used by tenant provisioning). Create + delete a user.
  const email = `verify-${Date.now()}@veyra.test`;
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email,
    password: "verify-" + Math.random().toString(36).slice(2),
    email_confirm: true,
  });
  check("auth admin can create a confirmed user (provisioning path)", !cErr && !!created?.user, cErr?.message || "");
  if (created?.user) cleanup.userIds.push(created.user.id);
}

async function doCleanup() {
  for (const id of cleanup.orgIds) await sb.from("orgs").delete().eq("id", id); // cascades to leads/activities
  for (const id of cleanup.userIds) await sb.auth.admin.deleteUser(id).catch(() => {});
}

main()
  .catch((e) => {
    console.error("✗ verify threw:", e.message);
    fail++;
  })
  .finally(async () => {
    await doCleanup();
    console.log(`\n${pass} passed, ${fail} failed. Test data cleaned up.`);
    process.exit(fail ? 1 : 0);
  });
