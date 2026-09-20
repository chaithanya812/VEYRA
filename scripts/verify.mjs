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
  const { data: rfqB } = await sb.from("rfqs").insert({ org_id: B.id, title: "B RFQ" }).select("id").single();
  const { data: rfqItemA } = await sb.from("rfq_items")
    .insert({ org_id: A.id, rfq_id: rfqA.id, item_id: aItemId, item_name: "18mm Ply", uom: "sheet", qty: 20 }).select("id").single();
  const { data: rvA } = await sb.from("rfq_vendors")
    .insert({ org_id: A.id, rfq_id: rfqA.id, vendor_id: aVendId, response_status: "submitted" }).select("id").single();
  const { data: bidA } = await sb.from("rfq_bids")
    .insert({ org_id: A.id, rfq_id: rfqA.id, vendor_id: aVendId, version: 1, entry_mode: "proxy" }).select("id").single();
  const landed = round2(20 * 1850 + 500); // qty × unit_rate + freight = landedLineTotal
  await sb.from("rfq_bid_lines").insert({ org_id: A.id, bid_id: bidA.id, rfq_item_id: rfqItemA.id, unit_rate: 1850, tax_pct: 18, freight: 500, line_total: landed });
  const { data: aRfq } = await sb.from("rfqs").select("id").eq("org_id", A.id);
  const { data: bidLineA } = await sb.from("rfq_bid_lines").select("line_total").eq("org_id", A.id).single();
  check("org A sees exactly its 1 RFQ", aRfq.length === 1, `got ${aRfq.length}`);
  check("RFQ bid line lands at qty×rate+freight (37500)", Number(bidLineA.line_total) === landed, `got ${bidLineA.line_total}`);

  // ── RFQ vendor portal token (0044): per-(rfq,vendor), cannot cross tenants ─
  const portalToken = "u4-token-a-" + Date.now();
  const { error: mintErr } = await sb.from("rfq_vendors")
    .update({ share_token: portalToken, share_enabled: true }).eq("id", rvA.id);
  check("portal token mints on org A's vendor invite", !mintErr, mintErr?.message || "");
  const { data: resolvedA } = await sb.from("rfq_vendors")
    .select("org_id, rfq_id, vendor_id").eq("share_token", portalToken).eq("share_enabled", true);
  check(
    "portal token resolves only inside org A",
    (resolvedA ?? []).length === 1 && resolvedA[0].org_id === A.id && resolvedA[0].rfq_id === rfqA.id,
    `rows=${(resolvedA ?? []).length} org=${resolvedA?.[0]?.org_id}`,
  );
  const bVendId = bVend[0].id;
  const steal = await sb.from("rfq_vendors").insert({
    org_id: B.id, rfq_id: rfqB.id, vendor_id: bVendId,
    share_token: portalToken, share_enabled: true,
  });
  check(
    "org B cannot claim org A's portal token (unique index)",
    steal.error !== null,
    steal.error?.code || steal.error?.message || "steal succeeded",
  );
  const { data: byToken } = await sb.from("rfq_vendors").select("org_id").eq("share_token", portalToken);
  check(
    "a token minted in org A never resolves into org B",
    (byToken ?? []).length === 1 && byToken.every((r) => r.org_id !== B.id),
    `rows=${(byToken ?? []).length}`,
  );

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

  // ── PO payment plans + terms (0045): org-scoped libraries; milestones cannot cross parents ─
  const planAIns = await sb.from("po_payment_plans")
    .insert({ org_id: A.id, name: "A Plan 25/75", is_demo: false }).select("id, is_demo").single();
  const planBIns = await sb.from("po_payment_plans")
    .insert({ org_id: B.id, name: "B Plan", is_demo: false }).select("id").single();
  check(
    "org A can insert a payment plan",
    !planAIns.error && !!planAIns.data,
    planAIns.error?.message ?? "",
  );
  const planAId = planAIns.data?.id;
  const planBId = planBIns.data?.id;
  if (planAId) {
    await sb.from("po_payment_plan_milestones").insert([
      { org_id: A.id, plan_id: planAId, label: "Advance", pct: 25, sort: 0 },
      { org_id: A.id, plan_id: planAId, label: "Balance", pct: 75, sort: 1 },
    ]);
  }
  if (planBId) {
    await sb.from("po_payment_plan_milestones").insert({
      org_id: B.id, plan_id: planBId, label: "All", pct: 100, sort: 0,
    });
  }
  const { data: aPlans } = await sb.from("po_payment_plans").select("id, name, is_demo").eq("org_id", A.id);
  const { data: bPlans } = await sb.from("po_payment_plans").select("id, name").eq("org_id", B.id);
  check(
    "org A sees exactly its 1 payment plan (no B leakage)",
    (aPlans ?? []).length === 1 && aPlans[0].name === "A Plan 25/75" && !(bPlans ?? []).some((p) => p.name.startsWith("A ")),
    `A=${(aPlans ?? []).length} B=${(bPlans ?? []).length}`,
  );
  check(
    "org B sees exactly its 1 payment plan",
    (bPlans ?? []).length === 1 && bPlans[0].name === "B Plan",
    `got ${(bPlans ?? []).length}`,
  );
  check(
    "is_demo defaults to false on a tenant-authored plan",
    aPlans?.[0]?.is_demo === false,
    `got ${aPlans?.[0]?.is_demo}`,
  );
  const { data: aPlanMs } = await sb.from("po_payment_plan_milestones").select("id, plan_id").eq("org_id", A.id);
  check(
    "milestones are org-scoped (A has 2, none of B's)",
    (aPlanMs ?? []).length === 2 && (aPlanMs ?? []).every((m) => m.plan_id === planAId),
    `got ${(aPlanMs ?? []).length}`,
  );
  const crossMs = await sb.from("po_payment_plan_milestones").insert({
    org_id: A.id, plan_id: planBId, label: "Smuggled", pct: 10, sort: 9,
  });
  check(
    "a milestone cannot be attached to another org's plan",
    crossMs.error !== null,
    crossMs.error?.code || "cross-org milestone accepted",
  );

  const termsAIns = await sb.from("po_terms")
    .insert({ org_id: A.id, title: "A Terms", body: "Pay on delivery.", is_default: false, is_demo: false }).select("id").single();
  await sb.from("po_terms").insert({ org_id: B.id, title: "B Terms", body: "B only." });
  const { data: aPoTerms } = await sb.from("po_terms").select("title").eq("org_id", A.id);
  const { data: bPoTerms } = await sb.from("po_terms").select("title").eq("org_id", B.id);
  check(
    "org A sees exactly its 1 PO terms row (no B leakage)",
    (aPoTerms ?? []).length === 1 && aPoTerms[0].title === "A Terms",
    `A=${(aPoTerms ?? []).length} B=${(bPoTerms ?? []).length}`,
  );

  // Soft link: deleting a plan must never cascade away the PO.
  const { data: poWithPlan } = await sb.from("purchase_orders")
    .insert({
      org_id: A.id, name: "A PO-plan", vendor_id: aVendId, amount: 1000,
      payment_plan_id: planAId, po_terms_id: termsAIns.data?.id ?? null,
    }).select("id").single();
  const delPlan = await sb.from("po_payment_plans").delete().eq("id", planAId);
  const { data: poAfterDel } = await sb.from("purchase_orders").select("id").eq("id", poWithPlan?.id).maybeSingle();
  check(
    "deleting a payment plan does not cascade away the PO",
    !delPlan.error && !!poAfterDel,
    `del=${delPlan.error?.message ?? "ok"} po=${poAfterDel?.id ?? "gone"}`,
  );

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

  // ── The reporting line (org_members.manager_id, 0023 / Phase 10 Unit 4) ───
  // `manager_id` is a self-reference on ONE table. Two things about it are
  // worth pinning down, because /settings/users writes it.
  const { data: bossA } = await sb
    .from("org_members")
    .insert({ org_id: A.id, user_id: crypto.randomUUID(), role: "manager", display_name: "A Boss" })
    .select("id")
    .single();
  const reportsTo = await sb
    .from("org_members").update({ manager_id: bossA.id }).eq("id", memA.id).select("manager_id");
  check(
    "a member may report to another member of the same org",
    !reportsTo.error && reportsTo.data?.[0]?.manager_id === bossA.id,
    reportsTo.error?.message ?? `got ${reportsTo.data?.[0]?.manager_id}`,
  );

  // No `on delete` clause on the self-FK, so Postgres refuses to remove a
  // manager while somebody still points at them. The middle of a hierarchy
  // cannot vanish and leave the people under it dangling — which is why
  // `setMemberStatus` DEACTIVATES rather than deletes, and refuses even that
  // while direct reports remain.
  const removeBoss = await sb.from("org_members").delete().eq("id", bossA.id);
  const bossStill = await sb.from("org_members").select("id").eq("id", bossA.id);
  check(
    "a manager with direct reports cannot be deleted out from under them",
    !!removeBoss.error && (bossStill.data ?? []).length === 1,
    removeBoss.error?.code ?? "delete accepted",
  );
  await sb.from("org_members").update({ manager_id: null }).eq("id", memA.id);

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

  // ── The viewer's pins and the comment lifecycle (PLAN-V4 §9.1) ───────────
  // A pin is a comment with coordinates. They are fractions of the page, not
  // pixels, so the marker lands in the same place on any screen — and the
  // column must actually round-trip, or the drawing loses its markers.
  await sb.from("entity_comments").insert({
    org_id: A.id, entity_type: "project_file", entity_id: aFile.id,
    audience: "internal", status: "open",
    body: "Increase counter space near the sink", page: 1, x: 0.812, y: 0.934,
  });
  const pinned = await sb
    .from("entity_comments").select("page, x, y")
    .eq("org_id", A.id).eq("entity_id", aFile.id).not("x", "is", null);
  check(
    "a pinned comment keeps its place on the drawing",
    (pinned.data ?? []).length === 1
      && Number(pinned.data[0].x) === 0.812
      && Number(pinned.data[0].y) === 0.934
      && pinned.data[0].page === 1,
    `got ${JSON.stringify(pinned.data?.[0] ?? null)}`,
  );

  // Accept / Not required / Reopen move a comment through its lifecycle. The
  // pin stays exactly where it was — resolving a comment is not moving it.
  const { data: toAccept } = await sb
    .from("entity_comments").select("id")
    .eq("org_id", A.id).eq("entity_id", aFile.id).not("x", "is", null).limit(1).single();
  await sb.from("entity_comments").update({ status: "accepted" }).eq("id", toAccept.id);
  const accepted = await sb
    .from("entity_comments").select("status, x, y").eq("id", toAccept.id).single();
  check(
    "accepting a comment does not move its pin",
    accepted.data.status === "accepted" && Number(accepted.data.x) === 0.812,
    `${accepted.data?.status} @ ${accepted.data?.x}`,
  );

  // A comment carrying no coordinates is a comment on the file as a whole —
  // a legitimate state, not a broken pin.
  const unpinned = await sb
    .from("entity_comments").select("id")
    .eq("org_id", A.id).eq("entity_id", aFile.id).is("x", null);
  check(
    "a comment on the whole file needs no coordinates",
    (unpinned.data ?? []).length === 2,
    `got ${(unpinned.data ?? []).length}`,
  );

  // ── Site progress photos (PLAN-V4 §9.5, migration 0038) ─────────────────
  // Same rule as documents: a photo belongs to exactly ONE project. And the
  // flag that decides whether a client ever sees it is stored per row, because
  // the Progress Report is the only thing that reaches them.
  const { data: sitePics } = await sb.from("site_photos").insert([
    { org_id: A.id, project_id: payProj.id, caption: "Ceiling framing", taken_on: "2026-03-24", client_visible: true,  storage_path: `${A.id}/${payProj.id}/p1/photo-a.jpg`, mime_type: "image/jpeg", size_bytes: 10 },
    { org_id: A.id, project_id: payProj.id, caption: "Snag: cracked tile", taken_on: "2026-03-24", client_visible: false, storage_path: `${A.id}/${payProj.id}/p2/photo-b.jpg`, mime_type: "image/jpeg", size_bytes: 10 },
    { org_id: A.id, project_id: projA2.id, caption: "Other project",     taken_on: "2026-03-24", client_visible: false, storage_path: `${A.id}/${projA2.id}/p3/photo-c.jpg`, mime_type: "image/jpeg", size_bytes: 10 },
  ]).select("id, caption");

  const picsP1 = await sb.from("site_photos").select("id").eq("org_id", A.id).eq("project_id", payProj.id);
  const picsP2 = await sb.from("site_photos").select("id").eq("org_id", A.id).eq("project_id", projA2.id);
  check(
    "one project's site photos are invisible to another project",
    (picsP1.data ?? []).length === 2 && (picsP2.data ?? []).length === 1,
    `p1=${(picsP1.data ?? []).length} p2=${(picsP2.data ?? []).length}`,
  );

  const bPics = await sb.from("site_photos").select("id").eq("org_id", B.id);
  check(
    "one tenant's site photos are invisible to another tenant",
    (bPics.data ?? []).length === 0,
    `got ${(bPics.data ?? []).length}`,
  );

  // What a client-facing report would carry — and only that.
  const shared = await sb
    .from("site_photos").select("caption")
    .eq("org_id", A.id).eq("project_id", payProj.id).eq("client_visible", true);
  check(
    "only client-visible photos come back for a client-facing report",
    (shared.data ?? []).length === 1 && shared.data[0].caption === "Ceiling framing",
    `got ${(shared.data ?? []).length}`,
  );

  // Nothing is shared by accident: the column defaults to false, so a photo
  // uploaded without a decision stays internal.
  const { data: bare } = await sb
    .from("site_photos")
    .insert({ org_id: A.id, project_id: payProj.id, caption: "No decision made" })
    .select("client_visible, taken_on")
    .single();
  check(
    "a photo is internal until somebody says otherwise",
    bare.client_visible === false,
    `client_visible=${bare.client_visible}`,
  );

  // The day the work was photographed and the day the file landed are two
  // different facts. Only the first can be typed.
  const dated = await sb
    .from("site_photos").select("taken_on, created_at")
    .eq("org_id", A.id).eq("project_id", payProj.id).eq("caption", "Ceiling framing").single();
  check(
    "site date is typed while upload date is stamped",
    dated.data.taken_on === "2026-03-24"
      && dated.data.created_at.slice(0, 10) !== "2026-03-24",
    `taken_on ${dated.data.taken_on}, uploaded ${dated.data.created_at.slice(0, 10)}`,
  );

  // A stored object with no project would have nowhere to live: the storage key
  // embeds the project id. 0038 refuses it at the database.
  const orphanPhoto = await sb.from("site_photos").insert({
    org_id: A.id, project_id: null, caption: "Nowhere",
    storage_path: `${A.id}/nowhere/photo.jpg`,
  });
  check(
    "a stored photo cannot exist without a project (check constraint)",
    !!orphanPhoto.error,
    orphanPhoto.error?.code || "no error",
  );

  // The thread is the SHARED one. A photo's comments and a drawing's comments
  // live in one table, told apart by entity_type — never mixed by accident.
  const photoId = (sitePics ?? [])[0].id;
  await sb.from("entity_comments").insert([
    { org_id: A.id, entity_type: "site_photo", entity_id: photoId, audience: "client", body: "Is this the agreed profile?", status: "open" },
    { org_id: A.id, entity_type: "site_photo", entity_id: photoId, audience: "internal", body: "Ask the carpenter to redo", status: "open" },
  ]);
  const photoClient = await sb
    .from("entity_comments").select("body")
    .eq("org_id", A.id).eq("entity_type", "site_photo").eq("entity_id", photoId)
    .eq("audience", "client");
  check(
    "a site photo carries the same two-audience thread as a drawing",
    (photoClient.data ?? []).length === 1
      && photoClient.data[0].body === "Is this the agreed profile?",
    `got ${(photoClient.data ?? []).length}`,
  );

  const fileThread = await sb
    .from("entity_comments").select("id")
    .eq("org_id", A.id).eq("entity_type", "project_file").eq("entity_id", photoId);
  check(
    "entity_type keeps a photo's thread out of a file's",
    (fileThread.data ?? []).length === 0,
    `got ${(fileThread.data ?? []).length}`,
  );

  // ── Labour (PLAN-V4 §9.6, migration 0031) ────────────────────────────────
  // The headline assertion: the schema CANNOT store a total, so the report's
  // 34 + 25 + 12 = 71 can never drift from its own parts.
  const totalCol = await sb.from("labour_entries").select("total").limit(1);
  check(
    "labour_entries has no `total` column — the total is always derived",
    !!totalCol.error,
    totalCol.error?.code || "a total column exists",
  );

  const { data: labourDays } = await sb.from("labour_entries").insert([
    { org_id: A.id, project_id: payProj.id, entry_date: "2026-03-24", skilled: 20, unskilled: 15, coordinator: 7, client_visible: true,  remark: "Peak week" },
    { org_id: A.id, project_id: payProj.id, entry_date: "2026-03-25", skilled: 10, unskilled: 6,  coordinator: 3, client_visible: false, remark: null },
    { org_id: A.id, project_id: payProj.id, entry_date: "2026-03-26", skilled: 4,  unskilled: 4,  coordinator: 2, client_visible: false, remark: null },
    { org_id: A.id, project_id: projA2.id,  entry_date: "2026-03-24", skilled: 99, unskilled: 99, coordinator: 99, client_visible: false, remark: null },
  ]).select("id, project_id, skilled, unskilled, coordinator");

  const onProject = (labourDays ?? []).filter((r) => r.project_id === payProj.id);
  const sum = onProject.reduce(
    (acc, r) => ({
      s: acc.s + r.skilled, u: acc.u + r.unskilled, c: acc.c + r.coordinator,
    }),
    { s: 0, u: 0, c: 0 },
  );
  check(
    "the frame's arithmetic holds at the database: 34 + 25 + 12 = 71",
    sum.s === 34 && sum.u === 25 && sum.c === 12 && sum.s + sum.u + sum.c === 71,
    `${sum.s} + ${sum.u} + ${sum.c} = ${sum.s + sum.u + sum.c}`,
  );

  const otherProjectLabour = await sb
    .from("labour_entries").select("id").eq("org_id", A.id).eq("project_id", projA2.id);
  check(
    "one project's labour is invisible to another project",
    (otherProjectLabour.data ?? []).length === 1 && onProject.length === 3,
    `p1=${onProject.length} p2=${(otherProjectLabour.data ?? []).length}`,
  );

  const bLabour = await sb.from("labour_entries").select("id").eq("org_id", B.id);
  check(
    "one tenant's labour is invisible to another tenant",
    (bLabour.data ?? []).length === 0,
    `got ${(bLabour.data ?? []).length}`,
  );

  // A headcount cannot be negative. The check constraint says so, not the form.
  const negative = await sb.from("labour_entries").insert({
    org_id: A.id, project_id: payProj.id, entry_date: "2026-03-27", skilled: -3,
  });
  check(
    "a negative headcount is refused at the database",
    !!negative.error,
    negative.error?.code || "no error",
  );

  // Trades and vendors are ROWS, each at most once per day — `105716` groups by
  // them and you cannot group by a substring.
  const dayId = onProject[0].id;
  await sb.from("labour_entry_categories").insert([
    { org_id: A.id, entry_id: dayId, category: "carpentry_woodwork" },
    { org_id: A.id, entry_id: dayId, category: "false_ceiling_pop_work" },
  ]);
  const dupTrade = await sb
    .from("labour_entry_categories")
    .insert({ org_id: A.id, entry_id: dayId, category: "carpentry_woodwork" });
  const trades = await sb
    .from("labour_entry_categories").select("category").eq("entry_id", dayId);
  check(
    "a day carries many trades, each exactly once",
    (trades.data ?? []).length === 2 && !!dupTrade.error,
    `${(trades.data ?? []).length} trades, dup ${dupTrade.error?.code || "accepted"}`,
  );

  // `No Vendor` is the ABSENCE of vendor rows, not a magic vendor row — a
  // tenant who later creates a vendor called "No Vendor" must not absorb a
  // year of unattributed labour.
  const noVendorDay = await sb
    .from("labour_entry_vendors").select("id").eq("entry_id", onProject[1].id);
  check(
    "No Vendor is modelled as no rows, not as a placeholder vendor",
    (noVendorDay.data ?? []).length === 0,
    `got ${(noVendorDay.data ?? []).length}`,
  );

  // Only what a person marked visible would reach a client.
  const visibleDays = await sb
    .from("labour_entries").select("remark")
    .eq("org_id", A.id).eq("project_id", payProj.id).eq("client_visible", true);
  check(
    "only client-visible labour days come back for a client-facing report",
    (visibleDays.data ?? []).length === 1 && visibleDays.data[0].remark === "Peak week",
    `got ${(visibleDays.data ?? []).length}`,
  );

  // The trade vocabulary is the SHARED one. A second list would let a tenant
  // rename a trade in one module and not the other.
  const sharedTrades = await sb
    .from("workspace_options").select("value")
    .eq("org_id", A.id).eq("kind", "labour_category");
  check(
    "labour reads the shared trade vocabulary, not a private enum",
    !sharedTrades.error,
    sharedTrades.error?.message ?? `${(sharedTrades.data ?? []).length} options`,
  );

  // An attachment is a project file that knows what it is evidence for.
  await sb.from("project_files").insert({
    org_id: A.id, project_id: payProj.id, labour_entry_id: dayId,
    name: "muster-roll.jpg", internal_status: "draft",
    client_approval: "not_shared", current_version: 1,
  });
  const musterRoll = await sb
    .from("project_files").select("id").eq("org_id", A.id).eq("labour_entry_id", dayId);
  check(
    "a muster roll is a project file, not a fourth attachment table",
    (musterRoll.data ?? []).length === 1,
    `got ${(musterRoll.data ?? []).length}`,
  );

  // Deleting a day takes its trades with it and LEAVES the attachment: the
  // photograph of the muster roll outlives the headcount row.
  await sb.from("labour_entries").delete().eq("id", dayId);
  const orphanTrades = await sb
    .from("labour_entry_categories").select("id").eq("entry_id", dayId);
  const survivingFile = await sb
    .from("project_files").select("labour_entry_id").eq("name", "muster-roll.jpg").single();
  check(
    "deleting a day removes its trades but keeps the attachment, detached",
    (orphanTrades.data ?? []).length === 0
      && survivingFile.data?.labour_entry_id === null,
    `${(orphanTrades.data ?? []).length} trades, file link ${survivingFile.data?.labour_entry_id}`,
  );

  // ── Procurement: status lives on the LINE (PLAN-V4 §9.7, migration 0036) ─
  // The assertion that matters: one request holds several stages at once,
  // which is what `105729`'s Stage cell shows and what a single
  // `material_requests.stage` could never express.
  const { data: req } = await sb.from("material_requests").insert({
    org_id: A.id, project_id: payProj.id, title: "Kitchen interior material request",
    request_type: "material", number: "DZY-REQ-170", stage: "requested",
    expected_delivery: "2026-06-30",
  }).select("id").single();

  await sb.from("material_request_items").insert([
    // Uniform keys: a PostgREST bulk insert sends an explicit NULL for a key
    // one row omits, which defeats the column default.
    { org_id: A.id, mr_id: req.id, item_name: "Plywood 18mm", uom: "sheet", qty: 12, stage: "ordered",         item_id: null, is_adhoc: true, remarks: null },
    { org_id: A.id, mr_id: req.id, item_name: "Laminate",     uom: "sheet", qty: 20, stage: "pending",         item_id: null, is_adhoc: true, remarks: null },
    { org_id: A.id, mr_id: req.id, item_name: "Edge banding", uom: "m",     qty: 60, stage: "in_stock",        item_id: null, is_adhoc: true, remarks: null },
    { org_id: A.id, mr_id: req.id, item_name: "Hinges",       uom: "no",    qty: 40, stage: "order_requested", item_id: null, is_adhoc: true, remarks: null },
  ]);

  const lines = await sb
    .from("material_request_items").select("stage").eq("org_id", A.id).eq("mr_id", req.id);
  const stageSet = new Set((lines.data ?? []).map((l) => l.stage));
  check(
    "ONE request holds several line stages at once (the §9.7 model)",
    stageSet.size === 4,
    `stages: ${[...stageSet].sort().join(", ")}`,
  );

  // The tile's arithmetic: the breakdown adds back to the item count.
  const counted = {};
  for (const l of lines.data ?? []) counted[l.stage] = (counted[l.stage] ?? 0) + 1;
  const breakdownTotal = Object.values(counted).reduce((a, b) => a + b, 0);
  check(
    "the stage breakdown adds back to the total item count",
    breakdownTotal === (lines.data ?? []).length && breakdownTotal === 4,
    `${Object.entries(counted).map(([k, v]) => `${k}(${v})`).join(" · ")} = ${breakdownTotal}`,
  );

  // A typo'd stage is refused rather than becoming a fifth column nobody
  // planned for.
  const badStage = await sb.from("material_request_items").insert({
    org_id: A.id, mr_id: req.id, item_name: "Mystery", qty: 1, stage: "hlaf_ordered",
  });
  check(
    "an unknown line stage is refused at the database",
    !!badStage.error,
    badStage.error?.code || "no error",
  );

  // Request numbers are unique per tenant, not globally: two orgs may each run
  // their own DZY-REQ-170.
  const dupNumber = await sb.from("material_requests").insert({
    org_id: A.id, project_id: payProj.id, title: "Duplicate number", number: "DZY-REQ-170",
  });
  const sameNumberOtherOrg = await sb.from("material_requests").insert({
    org_id: B.id, title: "Another tenant's 170", number: "DZY-REQ-170",
  });
  check(
    "a request number is unique WITHIN a tenant, and free across tenants",
    !!dupNumber.error && !sameNumberOtherOrg.error,
    `${dupNumber.error?.code || "dup accepted"} / ${sameNumberOtherOrg.error?.message ?? "other org ok"}`,
  );

  // Project isolation, the same rule as everywhere else in this phase.
  const otherProjectReqs = await sb
    .from("material_requests").select("id").eq("org_id", A.id).eq("project_id", projA2.id);
  check(
    "one project's requests are invisible to another project",
    (otherProjectReqs.data ?? []).length === 0,
    `got ${(otherProjectReqs.data ?? []).length}`,
  );

  // ── The award is a decision, not arithmetic (frame `105853`) ─────────────
  // `name_key` is the dedupe key the vendors table requires (0004).
  const { data: vendorCheap } = await sb
    .from("vendors")
    .insert({ org_id: A.id, name: "Cheaper Traders", name_key: nameKey("Cheaper Traders") })
    .select("id").single();
  const { data: vendorChosen } = await sb
    .from("vendors")
    .insert({ org_id: A.id, name: "Reliable Timbers", name_key: nameKey("Reliable Timbers") })
    .select("id").single();

  const { data: rfq } = await sb.from("rfqs").insert({
    org_id: A.id, project_id: payProj.id, mr_id: req.id, title: "Ply and laminate",
    status: "awarded", awarded_vendor_id: vendorChosen.id,
    award_reason: "Can deliver by the 14th; the cheaper vendor was short twice.",
  }).select("id, awarded_vendor_id, award_reason").single();

  check(
    "an award records WHO won and WHY, not just a status",
    rfq.awarded_vendor_id === vendorChosen.id
      && (rfq.award_reason ?? "").length > 10,
    rfq.award_reason ?? "no reason",
  );

  check(
    "the awarded vendor need not be the cheapest — that is the point",
    rfq.awarded_vendor_id !== vendorCheap.id,
    "a person chose",
  );

  // ── Milestone dependencies (PLAN-V4 §9.2) ────────────────────────────────
  const deliveryRows = await sb
    .from("project_milestones").select("id, name")
    .eq("org_id", A.id).eq("project_id", payProj.id).order("name");
  const [snag, measure] = deliveryRows.data ?? [];

  await sb.from("project_milestone_deps").insert({
    org_id: A.id, milestone_id: snag.id, depends_on_id: measure.id,
  });
  const aDeps = await sb.from("project_milestone_deps").select("id").eq("org_id", A.id);
  const bDeps = await sb.from("project_milestone_deps").select("id").eq("org_id", B.id);
  check(
    "milestone dependencies are org-scoped (A has 1, B has none)",
    (aDeps.data ?? []).length === 1 && (bDeps.data ?? []).length === 0,
    `A=${(aDeps.data ?? []).length} B=${(bDeps.data ?? []).length}`,
  );

  // A milestone that waits for itself is a typo, not a plan — the table's own
  // CHECK refuses it, so no app bug can write one.
  const selfDep = await sb.from("project_milestone_deps").insert({
    org_id: A.id, milestone_id: snag.id, depends_on_id: snag.id,
  });
  check(
    "a milestone cannot depend on itself (DB check refuses it)",
    !!selfDep.error,
    selfDep.error?.code || "no error",
  );

  // Linking the same pair twice is the state the caller asked for, not a second
  // row — the unique index is what makes the toggle idempotent.
  const dupDep = await sb.from("project_milestone_deps").insert({
    org_id: A.id, milestone_id: snag.id, depends_on_id: measure.id,
  });
  check(
    "a dependency cannot be recorded twice",
    dupDep.error?.code === "23505",
    dupDep.error?.code || "no error",
  );

  // Deleting a milestone takes its links with it; a dependency pointing at a
  // row that no longer exists would render as a permanent phantom blocker.
  await sb.from("project_milestones").delete().eq("id", measure.id);
  const orphanDeps = await sb
    .from("project_milestone_deps").select("id").eq("org_id", A.id);
  check(
    "deleting a milestone removes the links that pointed at it",
    (orphanDeps.data ?? []).length === 0,
    `got ${(orphanDeps.data ?? []).length}`,
  );

  // ── Milestone templates stay per-tenant (PLAN-V4 §9.2) ───────────────────
  // SmartPlan and the template picker both read these; one tenant's edits must
  // never appear in another's plan.
  await sb.from("milestone_templates").insert([
    { org_id: A.id, scope_group: "Execution Team", name: "Site Marking", offset_days: 0, duration_days: 2, seq: 0, is_system: true },
    { org_id: B.id, scope_group: "Execution Team", name: "Site Marking", offset_days: 0, duration_days: 2, seq: 0, is_system: true },
  ]);
  const aTemplates = await sb
    .from("milestone_templates").select("id").eq("org_id", A.id).eq("name", "Site Marking");
  const bTemplates = await sb
    .from("milestone_templates").select("id").eq("org_id", B.id).eq("name", "Site Marking");
  check(
    "two tenants can each own a template of the same name, kept apart",
    (aTemplates.data ?? []).length === 1 && (bTemplates.data ?? []).length === 1
      && aTemplates.data[0].id !== bTemplates.data[0].id,
    `A=${(aTemplates.data ?? []).length} B=${(bTemplates.data ?? []).length}`,
  );

  // ── A file belongs to ONE project — the viewer's 404 guard (§9.1) ────────
  // /projects/<A2>/documents/<file-from-A1> must resolve to nothing, and this
  // is the query behind it: same org, wrong project, no row.
  const wrongProject = await sb
    .from("project_files").select("id")
    .eq("org_id", A.id).eq("id", aFile.id).eq("project_id", projA2.id);
  check(
    "a file is not reachable under another project's id",
    (wrongProject.data ?? []).length === 0,
    `got ${(wrongProject.data ?? []).length}`,
  );

  // ── A version carries its uploader, which the Audits tab reads ───────────
  await sb.from("project_file_versions").insert({
    org_id: A.id, file_id: aFile.id, version_no: 1,
    storage_path: `${A.id}/${payProj.id}/${aFile.id}/v1-plan.png`,
    size_bytes: 2048, mime_type: "image/png", note: "First issue",
  });
  const ver = await sb
    .from("project_file_versions").select("version_no, note, uploaded_by")
    .eq("org_id", A.id).eq("file_id", aFile.id);
  check(
    "a version keeps its note and uploader for the audit trail",
    (ver.data ?? []).length === 1 && ver.data[0].note === "First issue",
    `got ${(ver.data ?? []).length}`,
  );

  // ── Financial Planning (PLAN-V4 §9.3, migration 0030) ───────────────────
  // Inflow and outflow are the SAME table with `source` flipped. Asserting it
  // here so nobody "simplifies" them into two tables later.
  const { data: inflowC } = await sb.from("contracts").insert({
    org_id: A.id, project_id: payProj.id, name: "Civil",
    amount: 2000000, source: "client",
  }).select("id").single();

  const { data: outflowC } = await sb.from("contracts").insert({
    org_id: A.id, project_id: payProj.id, name: "Carpentry",
    amount: 650000, source: "vendor", vendor_id: null,
  }).select("id").single();

  const aContracts = await sb
    .from("contracts").select("id, source").eq("org_id", A.id).eq("project_id", payProj.id);
  // B has contracts of its own from an earlier block; what must be true is
  // that none of them belong to A's project.
  const bOnAsProject = await sb
    .from("contracts").select("id").eq("org_id", B.id).eq("project_id", payProj.id);
  check(
    "project contracts are org-scoped and split by source",
    (aContracts.data ?? []).length === 2
      && (aContracts.data ?? []).filter((c) => c.source === "client").length === 1
      && (bOnAsProject.data ?? []).length === 0,
    `A=${(aContracts.data ?? []).length} B-on-A's-project=${(bOnAsProject.data ?? []).length}`,
  );

  // A vendor contract with a NULL vendor is the "Unlisted Vendor /
  // Miscellaneous" row from `105325` — ad-hoc spend needs a home, so a null
  // here is a legitimate state and must not be constrained away.
  check(
    "a vendor contract may have no vendor (the miscellaneous row)",
    !!outflowC?.id,
    outflowC?.id ? "accepted" : "rejected",
  );

  // The payment schedule lives on `milestones` (0015) — NOT a new table. This
  // is the row Account Receivables (§12.3) will age.
  await sb.from("milestones").insert([
    { org_id: A.id, contract_id: inflowC.id, seq: 1, name: "1st", pct: 40, amount: 800000, tentative_due: "2026-03-20", work_done: true,  actual_due: "2026-03-20" },
    { org_id: A.id, contract_id: inflowC.id, seq: 2, name: "2nd", pct: 60, amount: 1200000, tentative_due: "2026-06-20", work_done: false, actual_due: null },
  ]);
  const sched = await sb
    .from("milestones").select("pct, amount, work_done, actual_due")
    .eq("org_id", A.id).eq("contract_id", inflowC.id).order("seq");
  const pctSum = (sched.data ?? []).reduce((a, m) => a + Number(m.pct), 0);
  check(
    "a payment schedule foots to 100%",
    Math.abs(pctSum - 100) < 0.05,
    `Σ = ${pctSum}%`,
  );

  // The receivables engine in one assertion: Actual Due exists only where the
  // work is done. An unticked milestone is not billable and has no due date.
  const billable = (sched.data ?? []).filter((m) => m.work_done);
  const unbilled = (sched.data ?? []).filter((m) => !m.work_done);
  check(
    "Actual Due exists only where Work Done is ticked",
    billable.length === 1 && billable[0].actual_due === "2026-03-20"
      && unbilled.length === 1 && unbilled[0].actual_due === null,
    `billable=${billable.length} unbilled=${unbilled.length}`,
  );

  // ── Account Receivables: writing one off (§12.3, migration 0042) ────────
  // Receivables got COLUMNS on `milestones`, not a table: `110534` ages the
  // payment schedule the Financial Planning screen already wrote. These
  // assertions are what stop somebody adding a receivables ledger later, and
  // what prove the three 0042 columns behave the way a write-off must.
  // Selecting a column that does not exist empties the WHOLE read silently
  // (HANDOFF-V8 §11), so the error is captured and reported AS ITSELF rather
  // than surfacing as "this tenant has no milestones".
  const { data: aMilestones, error: aMilestonesErr } = await sb
    .from("milestones").select("id, amount, written_off_at")
    .eq("org_id", A.id).eq("contract_id", inflowC.id).order("seq");
  const woTarget = (aMilestones ?? [])[1] ?? null;
  check(
    "0042's write-off columns exist and every milestone starts un-written-off",
    (aMilestones ?? []).length === 2
      && (aMilestones ?? []).every((m) => "written_off_at" in m && m.written_off_at === null),
    aMilestonesErr?.message || `got ${(aMilestones ?? []).length} milestones`,
  );

  // A write-off with no reason is not discouraged, it is IMPOSSIBLE.
  const reasonless = woTarget
    ? await sb.from("milestones")
        .update({ written_off_at: new Date().toISOString(), written_off_by: memA.id })
        .eq("id", woTarget.id)
    : { error: null };
  check(
    "a write-off without a reason cannot exist (0042 CHECK)",
    !!reasonless.error,
    reasonless.error?.code || "a reasonless write-off was accepted",
  );

  // The composite FK, per 0035's rule: only your own tenant's member can be
  // recorded as the person who gave up on your money.
  const crossOrgWriter = woTarget
    ? await sb.from("milestones")
        .update({
          written_off_at: new Date().toISOString(),
          written_off_by: memB.id,
          write_off_reason: "Cross-tenant attempt",
        })
        .eq("id", woTarget.id)
    : { error: null };
  check(
    "a write-off cannot name another tenant's member (composite FK)",
    !!crossOrgWriter.error,
    crossOrgWriter.error?.code || "a cross-tenant write-off was accepted",
  );

  // The real thing. HARD RULE 4 in spirit: nothing is deleted and the amount is
  // untouched — the firm has stopped expecting the money, that is all.
  const wroteOff = woTarget
    ? await sb.from("milestones")
        .update({
          written_off_at: "2026-06-25T09:00:00.000Z",
          written_off_by: memA.id,
          write_off_reason: "Client dispute settled at zero",
        })
        .eq("id", woTarget.id).select("amount, written_off_at, write_off_reason").single()
    : { data: null, error: { message: "no milestone — the 0042 columns are missing" } };
  check(
    "writing a milestone off keeps its full value and records who, when and why",
    !wroteOff.error
      && Number(wroteOff.data?.amount) === Number(woTarget?.amount)
      && !!wroteOff.data?.written_off_at
      && wroteOff.data?.write_off_reason === "Client dispute settled at zero",
    wroteOff.error?.message || `amount ${wroteOff.data?.amount}`,
  );

  // Org isolation on the new columns: B cannot see, and cannot reach, A's.
  const bWrittenOff = await sb
    .from("milestones").select("id").eq("org_id", B.id).not("written_off_at", "is", null);
  check(
    "one tenant's written-off milestones are invisible to another",
    (bWrittenOff.data ?? []).length === 0,
    `got ${(bWrittenOff.data ?? []).length}`,
  );

  // PROJECT isolation. A milestone reaches a project only through its contract,
  // so a second project's schedule must never appear under the first's.
  const { data: otherProjContract } = await sb.from("contracts").insert({
    org_id: A.id, project_id: projA2.id, name: "Other project client agreement",
    amount: 500000, source: "client",
  }).select("id").single();
  await sb.from("milestones").insert([
    { org_id: A.id, contract_id: otherProjContract.id, seq: 1, name: "Only", pct: 100, amount: 500000, tentative_due: "2026-05-01", work_done: false, actual_due: null },
  ]);
  const onPayProjSchedule = await sb
    .from("milestones").select("id").eq("org_id", A.id).eq("contract_id", inflowC.id);
  const onOtherSchedule = await sb
    .from("milestones").select("id").eq("org_id", A.id).eq("contract_id", otherProjContract.id);
  check(
    "one project's payment schedule is invisible to another project",
    (onPayProjSchedule.data ?? []).length === 2 && (onOtherSchedule.data ?? []).length === 1,
    `p1=${(onPayProjSchedule.data ?? []).length} p2=${(onOtherSchedule.data ?? []).length}`,
  );

  // HARD RULE 6: no stored written-off TOTAL anywhere. The tile is Σ of rows.
  const woTotalCol = await sb.from("milestones").select("written_off_total").limit(1);
  check(
    "milestones has no `written_off_total` column — the tile is always derived",
    !!woTotalCol.error,
    woTotalCol.error ? "absent" : "a stored written-off total exists",
  );

  // Categories are ROWS, not a comma-joined string — `105325` shows a vendor
  // carrying several trades, and a string cannot be filtered on.
  await sb.from("contract_categories").insert([
    { org_id: A.id, contract_id: outflowC.id, category: "Carpentry Woodwork" },
    { org_id: A.id, contract_id: outflowC.id, category: "Civil Masonry Work" },
  ]);
  const dupCat = await sb.from("contract_categories").insert({
    org_id: A.id, contract_id: outflowC.id, category: "Carpentry Woodwork",
  });
  const cats = await sb
    .from("contract_categories").select("category").eq("org_id", A.id).eq("contract_id", outflowC.id);
  check(
    "a contract carries many categories, each once",
    (cats.data ?? []).length === 2 && dupCat.error?.code === "23505",
    `${(cats.data ?? []).length} categories, dup ${dupCat.error?.code || "accepted"}`,
  );

  // A contract document is a project_file with a contract_id — one storage
  // layer, not a second file table with its own versions and rules.
  const { data: contractDoc } = await sb.from("project_files").insert({
    org_id: A.id, project_id: payProj.id, contract_id: outflowC.id,
    name: "Signed vendor agreement.pdf", internal_status: "approved",
    client_approval: "not_shared", current_version: 1,
  }).select("id").single();
  const docs = await sb
    .from("project_files").select("id").eq("org_id", A.id).eq("contract_id", outflowC.id);
  check(
    "a contract document is a project file, not a second file table",
    (docs.data ?? []).length === 1 && !!contractDoc?.id,
    `got ${(docs.data ?? []).length}`,
  );

  // Deleting a contract must not take the file with it — the signed agreement
  // outlives the contract row it was filed against.
  await sb.from("contracts").delete().eq("id", outflowC.id);
  const orphanDoc = await sb
    .from("project_files").select("contract_id").eq("id", contractDoc.id).single();
  check(
    "deleting a contract keeps its documents, detached",
    orphanDoc.data?.contract_id === null,
    `contract_id = ${orphanDoc.data?.contract_id}`,
  );

  // ── The payment ledger is APPEND-ONLY (PLAN-V4 §9.4, migration 0037) ────
  // A correction is a new row with the opposite sign pointing back at the one
  // it cancels. Both stay. This is the assertion that stops someone "tidying"
  // the ledger with a delete later.
  const { data: spend } = await sb.from("payments").insert({
    org_id: A.id, project_id: payProj.id, direction: "outflow",
    amount: 50000, paid_on: "2026-08-22", mode: "cash",
    expense_type: "material", category: "Paint Works", reference: "BILL-9",
  }).select("id").single();

  await sb.from("payments").insert({
    org_id: A.id, project_id: payProj.id, direction: "outflow",
    amount: -50000, paid_on: "2026-08-25", mode: "cash",
    expense_type: "material", category: "Paint Works",
    reversal_of: spend.id, note: "Reversal of BILL-9",
  });

  const ledger = await sb
    .from("payments").select("id, amount, reversal_of")
    .eq("org_id", A.id).eq("project_id", payProj.id).eq("direction", "outflow");
  const rows = ledger.data ?? [];
  const net = rows.reduce((a, r) => a + Number(r.amount), 0);
  check(
    "a reversal is a row, and the pair nets to zero",
    rows.length === 2 && net === 0,
    `${rows.length} rows, net ${net}`,
  );

  check(
    "the original entry is still there after being reversed",
    rows.some((r) => r.id === spend.id),
    "present",
  );

  // Transaction date and recorded date are genuinely different columns:
  // `paid_on` is typed, `created_at` is stamped and cannot be.
  const dates = await sb
    .from("payments").select("paid_on, created_at").eq("id", spend.id).single();
  check(
    "transaction date is typed while recorded date is stamped",
    dates.data.paid_on === "2026-08-22"
      && dates.data.created_at.slice(0, 10) !== "2026-08-22",
    `paid_on ${dates.data.paid_on}, recorded ${dates.data.created_at.slice(0, 10)}`,
  );

  // A receipt is a project file carrying a payment id — one file model.
  await sb.from("project_files").insert({
    org_id: A.id, project_id: payProj.id, payment_id: spend.id,
    name: "BILL-9.pdf", internal_status: "draft",
    client_approval: "not_shared", current_version: 1,
  });
  const receipts = await sb
    .from("project_files").select("id").eq("org_id", A.id).eq("payment_id", spend.id);
  check(
    "a receipt is a project file, not a second attachment table",
    (receipts.data ?? []).length === 1,
    `got ${(receipts.data ?? []).length}`,
  );

  // Ledger rows are org-scoped like everything else.
  const bLedger = await sb
    .from("payments").select("id").eq("org_id", B.id).eq("project_id", payProj.id);
  check(
    "one tenant's ledger is invisible to another",
    (bLedger.data ?? []).length === 0,
    `got ${(bLedger.data ?? []).length}`,
  );

  // ── Petty Finance (PLAN-V4 §12.2, migration 0041) ───────────────────────
  // Petty Finance EXTENDS `expense_claims`; it did not get a table. These
  // assertions are what stop somebody adding a second petty ledger later, and
  // what prove the three 0041 columns behave the way `110521` needs.
  const { data: pettyRows, error: pettyErr } = await sb.from("expense_claims").insert([
    // Uniform keys across the batch, every one of them: a PostgREST batch sends
    // an explicit NULL for a key one row omits, which defeats the `kind`
    // default and trips its NOT NULL (HANDOFF-V8 §11).
    { org_id: A.id, member_id: memA.id, project_id: payProj.id, spent_on: "2026-08-04", amount: 20000, category: "other",     kind: "fund",    status: "approved" },
    { org_id: A.id, member_id: memA.id, project_id: payProj.id, spent_on: "2026-08-06", amount: 5400,  category: "materials", kind: "expense", status: "approved" },
    { org_id: A.id, member_id: memA.id, project_id: projA2.id,  spent_on: "2026-08-07", amount: 1200,  category: "transport", kind: "expense", status: "approved" },
    { org_id: B.id, member_id: memB.id, project_id: null,       spent_on: "2026-08-08", amount: 77777, category: "other",     kind: "expense", status: "approved" },
  ]).select("id, kind, project_id, org_id, amount");
  check(
    "0041's kind column accepts expense and fund",
    !pettyErr && (pettyRows ?? []).length === 4,
    pettyErr?.message || `got ${(pettyRows ?? []).length}`,
  );

  const badKind = await sb.from("expense_claims").insert({
    org_id: A.id, member_id: memA.id, spent_on: "2026-08-09", amount: 1, category: "other", kind: "advance",
  });
  check(
    "a petty entry is either an expense or a fund — nothing else",
    !!badKind.error,
    badKind.error?.code || "an unknown kind was accepted",
  );

  const aPetty = (pettyRows ?? []).filter((r) => r.org_id === A.id);
  const bPettySeen = await sb
    .from("expense_claims").select("id").eq("org_id", B.id).eq("member_id", memA.id);
  check(
    "one tenant's petty ledger is invisible to another",
    aPetty.length === 3 && (bPettySeen.data ?? []).length === 0,
    `A=${aPetty.length} B-on-A's-member=${(bPettySeen.data ?? []).length}`,
  );

  const onPayProj = await sb
    .from("expense_claims").select("id, amount")
    .eq("org_id", A.id).eq("project_id", payProj.id);
  const onProjA2 = await sb
    .from("expense_claims").select("id").eq("org_id", A.id).eq("project_id", projA2.id);
  check(
    "one project's petty spend is invisible to another project",
    (onPayProj.data ?? []).length === 2 && (onProjA2.data ?? []).length === 1,
    `p1=${(onPayProj.data ?? []).length} p2=${(onProjA2.data ?? []).length}`,
  );

  // A reversal is a ROW (HARD RULE 4). Both halves stay; the pair nets to zero.
  // Guarded rather than assumed: if 0041 has not been applied the insert above
  // failed, and a thrown TypeError here would take the remaining ~90 checks
  // down with it and report as an unrelated crash.
  const original = aPetty.find((r) => Number(r.amount) === 5400) ?? null;
  const pettyReversalRes = original
    ? await sb.from("expense_claims").insert({
        org_id: A.id, member_id: memA.id, project_id: payProj.id, spent_on: "2026-08-06",
        amount: -5400, category: "materials", kind: "expense", status: "approved",
        reversal_of: original.id,
      }).select("id, amount").single()
    : { data: null, error: { message: "no original — the kind insert failed" } };
  const pair = original
    ? await sb
        .from("expense_claims").select("amount")
        .eq("org_id", A.id).or(`id.eq.${original.id},reversal_of.eq.${original.id}`)
    : { data: [] };
  const pettyNet = (pair.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
  check(
    "a petty reversal is a row, and the pair nets to zero",
    !pettyReversalRes.error && (pair.data ?? []).length === 2 && pettyNet === 0,
    pettyReversalRes.error?.message || `${(pair.data ?? []).length} rows, net ${pettyNet}`,
  );

  // 0041's composite FK: a reversal may only ever point inside its own tenant.
  const crossOrgReversal = original
    ? await sb.from("expense_claims").insert({
        org_id: B.id, member_id: memB.id, spent_on: "2026-08-06", amount: -5400,
        category: "materials", kind: "expense", reversal_of: original.id,
      })
    : { error: null };
  check(
    "a reversal cannot point at another tenant's entry (composite FK)",
    !!crossOrgReversal.error,
    crossOrgReversal.error?.code || "a cross-tenant reversal was accepted",
  );

  // Transaction date is typed; recorded date is stamped. Two columns, and the
  // screen shows both — deriving one from the other would be a quiet lie.
  const pettyDates = original
    ? await sb.from("expense_claims").select("spent_on, created_at").eq("id", original.id).single()
    : { data: null };
  check(
    "a petty entry's transaction date is typed while its recorded date is stamped",
    !!pettyDates.data
      && pettyDates.data.spent_on === "2026-08-06"
      && pettyDates.data.created_at.slice(0, 10) !== "2026-08-06",
    pettyDates.data
      ? `spent_on ${pettyDates.data.spent_on}, recorded ${pettyDates.data.created_at.slice(0, 10)}`
      : "no row to read",
  );

  // No stored balance, ever (HARD RULE 6). The balance is funds − expenses.
  const balanceCol = await sb.from("expense_claims").select("balance").limit(1);
  check(
    "expense_claims has no `balance` column — a balance is always derived",
    !!balanceCol.error,
    balanceCol.error?.code || "a balance column exists",
  );

  // ── Inventory warehouses & stock documents (PLAN-V4 §10.2, migration 0033) ──
  // The owner's split — Company Warehouses | Project Warehouses — asserted at
  // the database, plus the three-way isolation a project warehouse gets.

  // A company warehouse may not carry a project. This half of the invariant IS
  // a CHECK constraint (0033's header explains why the mirror is not).
  const badCompanyWh = await sb.from("warehouses").insert({
    org_id: A.id, name: "A Contradiction", kind: "company", project_id: payProj.id,
  });
  check(
    "a company warehouse cannot carry a project (0033 check)",
    !!badCompanyWh.error,
    badCompanyWh.error?.code || "the insert was accepted",
  );

  // Scoped uniqueness — the 0029 folder rule, applied to warehouses: two
  // projects may each own a "Site store", and neither may own two.
  const { data: whP1 } = await sb.from("warehouses").insert({
    org_id: A.id, name: "Site store", kind: "project", project_id: payProj.id,
  }).select("id").single();
  const { data: whP2 } = await sb.from("warehouses").insert({
    org_id: A.id, name: "Site store", kind: "project", project_id: projA2.id,
  }).select("id").single();
  check(
    "two projects in one org can each own a warehouse called Site store",
    !!whP1 && !!whP2 && whP1.id !== whP2.id,
    `p1=${whP1?.id ? "ok" : "missing"} p2=${whP2?.id ? "ok" : "missing"}`,
  );

  const dupProjectWh = await sb.from("warehouses").insert({
    org_id: A.id, name: "site STORE", kind: "project", project_id: payProj.id,
  });
  check(
    "a warehouse name is unique WITHIN a project, case-insensitively",
    !!dupProjectWh.error,
    dupProjectWh.error?.code || "the duplicate was accepted",
  );

  // A bin is a warehouse inside a warehouse, and its name is unique within its
  // container — not globally, and not within the project.
  const { data: binA } = await sb.from("warehouses").insert({
    org_id: A.id, name: "Rack A", kind: "project", project_id: payProj.id, parent_id: whP1.id,
  }).select("id").single();
  await sb.from("warehouses").insert({
    org_id: A.id, name: "Rack A", kind: "project", project_id: projA2.id, parent_id: whP2.id,
  });
  const dupBin = await sb.from("warehouses").insert({
    org_id: A.id, name: "Rack A", kind: "project", project_id: payProj.id, parent_id: whP1.id,
  });
  check(
    "a location name is unique within its warehouse, not across warehouses",
    !!binA && !!dupBin.error,
    dupBin.error?.code || "the duplicate bin was accepted",
  );

  // Emptying a warehouse takes its bins with it — no orphan shelves.
  const { data: throwaway } = await sb.from("warehouses").insert({
    org_id: A.id, name: "Temp store", kind: "company",
  }).select("id").single();
  await sb.from("warehouses").insert({
    org_id: A.id, name: "Shelf 1", kind: "company", parent_id: throwaway.id,
  });
  await sb.from("warehouses").delete().eq("id", throwaway.id);
  const orphanBins = await sb
    .from("warehouses").select("id").eq("org_id", A.id).eq("parent_id", throwaway.id);
  check(
    "deleting a warehouse cascades to its locations",
    (orphanBins.data ?? []).length === 0,
    `got ${(orphanBins.data ?? []).length}`,
  );

  // Warehouses are org-scoped like everything else.
  const bSeesAWh = await sb
    .from("warehouses").select("id").eq("org_id", B.id).eq("kind", "project");
  check(
    "one tenant's project warehouses are invisible to another",
    (bSeesAWh.data ?? []).length === 0,
    `got ${(bSeesAWh.data ?? []).length}`,
  );

  // ── Stock documents: totals are DERIVED, never stored ──────────────────────
  // The headline assertion, the same shape as labour_entries above: the schema
  // CANNOT hold a document total, so a note's Qty and Amount can never drift
  // from the movements they are summed from.
  const noteQtyCol = await sb.from("grns").select("qty").limit(1);
  const noteAmtCol = await sb.from("grns").select("amount").limit(1);
  check(
    "grns has no `qty` and no `amount` column — both are summed from the ledger",
    !!noteQtyCol.error && !!noteAmtCol.error,
    `${noteQtyCol.error?.code ?? "qty exists"} / ${noteAmtCol.error?.code ?? "amount exists"}`,
  );

  const { data: noteIn } = await sb.from("grns").insert({
    org_id: A.id, warehouse_id: whP1.id, grn_no: "V-GRN-1",
    direction: "in", status: "recorded",
  }).select("id").single();
  await sb.from("stock_movements").insert([
    { org_id: A.id, item_id: aItemId, item_name: "Ply", warehouse_id: whP1.id, grn_id: noteIn.id, direction: "in", qty: 10, unit_rate: 100, gst_pct: 18 },
    { org_id: A.id, item_id: aItemId, item_name: "Ply", warehouse_id: binA.id,  grn_id: noteIn.id, direction: "in", qty: 5,  unit_rate: 100, gst_pct: 18 },
  ]);
  const noteLines = await sb
    .from("stock_movements").select("qty, unit_rate, warehouse_id").eq("grn_id", noteIn.id);
  const noteQty = (noteLines.data ?? []).reduce((s, l) => s + Number(l.qty), 0);
  const noteAmount = (noteLines.data ?? []).reduce((s, l) => s + Number(l.qty) * Number(l.unit_rate), 0);
  check(
    "a stock note's Qty and Amount are sums over its linked movements (15 / 1500)",
    noteQty === 15 && noteAmount === 1500,
    `qty=${noteQty} amount=${noteAmount}`,
  );

  // The bin's stock rolls up into its warehouse — a shelf's stock is in the
  // warehouse whether or not the row is expanded.
  const rolled = (noteLines.data ?? [])
    .filter((l) => l.warehouse_id === whP1.id || l.warehouse_id === binA.id)
    .reduce((s, l) => s + Number(l.qty) * Number(l.unit_rate), 0);
  const ownOnly = (noteLines.data ?? [])
    .filter((l) => l.warehouse_id === whP1.id)
    .reduce((s, l) => s + Number(l.qty) * Number(l.unit_rate), 0);
  check(
    "a warehouse's goods value rolls its locations up (1500 rolled vs 1000 own)",
    rolled === 1500 && ownOnly === 1000,
    `rolled=${rolled} own=${ownOnly}`,
  );

  // A number is unique per tenant, and only per tenant.
  const dupNoteNumber = await sb.from("grns").insert({
    org_id: A.id, warehouse_id: whP1.id, grn_no: "V-GRN-1", direction: "in", status: "recorded",
  });
  const sameNoteNumberOtherOrg = await sb.from("grns").insert({
    org_id: B.id, warehouse_id: whP1.id, grn_no: "V-GRN-1", direction: "in", status: "recorded",
  });
  check(
    "a document number is unique within a tenant, and two tenants may share one",
    !!dupNoteNumber.error && !sameNoteNumberOtherOrg.error,
    `${dupNoteNumber.error?.code ?? "dup accepted"} / ${sameNoteNumberOtherOrg.error?.message ?? "ok"}`,
  );

  // An outward note is not a GRN, and the vocabulary is enforced.
  const badDirection = await sb.from("grns").insert({
    org_id: A.id, warehouse_id: whP1.id, direction: "sideways", status: "recorded",
  });
  check(
    "a stock note moves in or out — nothing else (0033 check)",
    !!badDirection.error,
    badDirection.error?.code || "the insert was accepted",
  );

  // Discarding a document must NEVER delete the ledger rows that prove goods
  // moved. `set null`, not `cascade`.
  await sb.from("grns").delete().eq("id", noteIn.id);
  const survivors = await sb
    .from("stock_movements").select("id, grn_id").eq("org_id", A.id).eq("warehouse_id", binA.id);
  check(
    "deleting a stock note keeps its movements, unlinked",
    (survivors.data ?? []).length === 1 && survivors.data[0].grn_id === null,
    `got ${(survivors.data ?? []).length} rows, grn_id=${survivors.data?.[0]?.grn_id}`,
  );

  {
  // ── Vendors: working model, status ladder, trades as rows (0039) ───────────
  const { data: vendA } = await sb.from("vendors").insert({
    org_id: A.id, name: "A Vendor 0039", name_key: nameKey("A Vendor 0039"),
    working_model: "material", status: "verified", country: "India",
    city: "Hyderabad", state: "Telangana",
  }).select("id").single();
  await sb.from("vendors").insert({
    org_id: B.id, name: "B Vendor 0039", name_key: nameKey("B Vendor 0039"),
  });

  const badModel = await sb.from("vendors").insert({
    org_id: A.id, name: "A Bad Model", name_key: nameKey("A Bad Model"),
    working_model: "subcontract",
  });
  const badStatus = await sb.from("vendors").insert({
    org_id: A.id, name: "A Bad Status", name_key: nameKey("A Bad Status"),
    status: "blacklisted",
  });
  check(
    "working model and status are closed vocabularies (0039 checks)",
    !!badModel.error && !!badStatus.error,
    `${badModel.error?.code ?? "model accepted"} / ${badStatus.error?.code ?? "status accepted"}`,
  );

  // Trades are ROWS. `110215` shows `Carpentry Woodwork + 2`, and a
  // comma-joined string cannot answer "which vendors do POP work" without also
  // matching "POP Work Removal".
  await sb.from("vendor_categories").insert([
    { org_id: A.id, vendor_id: vendA.id, category: "Carpentry Woodwork" },
    { org_id: A.id, vendor_id: vendA.id, category: "Plywood" },
    { org_id: A.id, vendor_id: vendA.id, category: "Hardware" },
  ]);
  const vendorTrades = await sb
    .from("vendor_categories").select("category").eq("org_id", A.id).eq("vendor_id", vendA.id);
  const dupVendorTrade = await sb.from("vendor_categories").insert({
    org_id: A.id, vendor_id: vendA.id, category: "carpentry woodwork",
  });
  check(
    "a vendor carries many trades, each once, case-insensitively",
    (vendorTrades.data ?? []).length === 3 && !!dupVendorTrade.error,
    `${(vendorTrades.data ?? []).length} trades, dup ${dupVendorTrade.error?.code ?? "accepted"}`,
  );

  // The category filter is a LOOKUP, not a substring match.
  await sb.from("vendor_categories").insert({
    org_id: A.id, vendor_id: vendA.id, category: "POP Work Removal",
  });
  const exactTrade = await sb
    .from("vendor_categories").select("vendor_id")
    .eq("org_id", A.id).ilike("category", "Plywood");
  const substringTrade = await sb
    .from("vendor_categories").select("category")
    .eq("org_id", A.id).ilike("category", "%POP Work%");
  check(
    "a trade lookup is exact, where a substring search would over-match",
    (exactTrade.data ?? []).length === 1 && (substringTrade.data ?? []).length === 1,
    `exact=${(exactTrade.data ?? []).length} substring=${(substringTrade.data ?? []).length}`,
  );

  const bTrades = await sb
    .from("vendor_categories").select("id").eq("org_id", B.id);
  check(
    "one tenant's vendor trades are invisible to another",
    (bTrades.data ?? []).length === 0,
    `got ${(bTrades.data ?? []).length}`,
  );

  // Retiring a vendor takes its trades with it — no orphan rows pointing at
  // a vendor that is gone.
  const { data: throwawayVendor } = await sb.from("vendors").insert({
    org_id: A.id, name: "A Temp Vendor", name_key: nameKey("A Temp Vendor"),
  }).select("id").single();
  await sb.from("vendor_categories").insert({
    org_id: A.id, vendor_id: throwawayVendor.id, category: "Paint",
  });
  await sb.from("vendors").delete().eq("id", throwawayVendor.id);
  const orphanTrades = await sb
    .from("vendor_categories").select("id").eq("vendor_id", throwawayVendor.id);
  check(
    "deleting a vendor cascades to its trades",
    (orphanTrades.data ?? []).length === 0,
    `got ${(orphanTrades.data ?? []).length}`,
  );

  // ── Vendor Projects (`110234`) reads rows that already exist ───────────────
  // Agreed 27,000 · disbursed 13,500 · billed 13,500 →
  //   Total Payables (agreed − disbursed) = 13,500
  //   Payable Dues   (billed − disbursed) = 0
  const { data: vCt } = await sb.from("contracts").insert({
    org_id: A.id, name: "A Vendor Contract", amount: 27000, source: "vendor",
    vendor_id: vendA.id, project_id: payProj.id,
  }).select("id").single();
  await sb.from("milestones").insert([
    { org_id: A.id, contract_id: vCt.id, seq: 1, name: "Stage 1", pct: 50, amount: 13500, work_done: true },
    { org_id: A.id, contract_id: vCt.id, seq: 2, name: "Stage 2", pct: 50, amount: 13500, work_done: false },
  ]);
  await sb.from("payments").insert({
    org_id: A.id, direction: "outflow", amount: 13500,
    vendor_id: vendA.id, project_id: payProj.id, contract_id: vCt.id,
  });

  const vContracts = await sb
    .from("contracts").select("id, amount, project_id")
    .eq("org_id", A.id).eq("vendor_id", vendA.id);
  const vMilestones = await sb
    .from("milestones").select("amount, work_done").eq("org_id", A.id).eq("contract_id", vCt.id);
  const vPayments = await sb
    .from("payments").select("amount").eq("org_id", A.id)
    .eq("vendor_id", vendA.id).eq("direction", "outflow");

  const vAgreed = (vContracts.data ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const vBilled = (vMilestones.data ?? [])
    .filter((m) => m.work_done === true)
    .reduce((s, m) => s + Number(m.amount), 0);
  const vPaidOut = (vPayments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  check(
    "Vendor Projects is a read over existing rows (27,000 / 13,500 / 13,500 / 0)",
    vAgreed === 27000 && vPaidOut === 13500 && vAgreed - vPaidOut === 13500 && vBilled - vPaidOut === 0,
    `agreed=${vAgreed} disbursed=${vPaidOut} payables=${vAgreed - vPaidOut} dues=${vBilled - vPaidOut}`,
  );

  // A vendor joins a project by FK. Renaming the project must not empty this.
  const vByFk = await sb
    .from("contracts").select("id")
    .eq("org_id", A.id).eq("vendor_id", vendA.id).eq("project_id", payProj.id);
  const bSeesVendorContract = await sb
    .from("contracts").select("id").eq("org_id", B.id).eq("vendor_id", vendA.id);
  check(
    "a vendor joins a project by FK, and the join is org-scoped",
    (vByFk.data ?? []).length === 1 && (bSeesVendorContract.data ?? []).length === 0,
    `A=${(vByFk.data ?? []).length} B=${(bSeesVendorContract.data ?? []).length}`,
  );
  }

  {
  // ── HR: WFH requests and the tenant's own holiday calendar (0034) ─────────
  // ⚠ UNIFORM KEY SETS. PostgREST sends an explicit NULL for a key that one row
  // in a batch omits, defeating the column default (Part 1 §11). Every row here
  // carries every key, and the insert's `.error` is CHECKED — an unchecked error
  // turns one failed batch into three misleading downstream assertions.
  const wfhSeed = await sb.from("wfh_requests").insert([
    { org_id: A.id, member_id: memA.id, from_date: "2026-06-22", to_date: "2026-06-23", days: 2, reason: "Society water shutdown", status: "approved" },
    { org_id: A.id, member_id: memA.id, from_date: "2026-07-01", to_date: "2026-07-01", days: 1, reason: null, status: "pending" },
  ]);
  const wfhSeedB = await sb.from("wfh_requests").insert({
    org_id: B.id, member_id: memB.id, from_date: "2026-06-22", to_date: "2026-06-22", days: 1,
  });
  const aWfh = await sb.from("wfh_requests").select("days, status").eq("org_id", A.id);
  const bWfh = await sb.from("wfh_requests").select("id").eq("org_id", B.id);
  check(
    "WFH requests are org-scoped (A has 2, B has 1, no leakage)",
    !wfhSeed.error && !wfhSeedB.error &&
      (aWfh.data ?? []).length === 2 && (bWfh.data ?? []).length === 1,
    `seed=${wfhSeed.error?.message ?? "ok"} A=${(aWfh.data ?? []).length} B=${(bWfh.data ?? []).length}`,
  );

  // A WFH day is NOT leave — the person worked. The two live in separate
  // tables precisely so a WFH day can never be deducted from an entitlement,
  // and `wfh_requests` has no `leave_type` because WFH has no sub-kinds.
  const wfhAsLeaveType = await sb.from("wfh_requests").select("leave_type").eq("org_id", A.id);
  const aLeaveAfterWfh = await sb.from("leave_requests").select("id").eq("org_id", A.id);
  check(
    "a WFH day is not leave: no leave_type column, and leave is untouched",
    !!wfhAsLeaveType.error && (aLeaveAfterWfh.data ?? []).length === 1,
    `${wfhAsLeaveType.error?.code ?? "leave_type accepted"} / leave rows ${(aLeaveAfterWfh.data ?? []).length}`,
  );

  // The same closed status vocabulary leave uses, and a typo'd date range is
  // a typo, not a short request.
  const badWfhStatus = await sb.from("wfh_requests").insert({
    org_id: A.id, member_id: memA.id, from_date: "2026-08-01", to_date: "2026-08-01", status: "granted",
  });
  const backwardsWfh = await sb.from("wfh_requests").insert({
    org_id: A.id, member_id: memA.id, from_date: "2026-08-05", to_date: "2026-08-01",
  });
  check(
    "WFH status is a closed vocabulary and its dates must be ordered",
    !!badWfhStatus.error && !!backwardsWfh.error,
    `${badWfhStatus.error?.code ?? "status accepted"} / ${backwardsWfh.error?.code ?? "range accepted"}`,
  );

  // A DECISION IS A STATUS CHANGE PLUS AN ATTRIBUTION, NEVER A DELETE. The
  // approvals screen writes the quartet in one update and the row survives —
  // a denied request that vanished would take its reason with it, and the
  // reason is the entire point of writing a denial down.
  const pendingWfh = await sb
    .from("wfh_requests")
    .select("id")
    .eq("org_id", A.id)
    .eq("status", "pending")
    .maybeSingle();
  const decidedWfh = await sb
    .from("wfh_requests")
    .update({
      status: "rejected",
      decided_by: memA.id,
      decided_at: new Date().toISOString(),
      decision_note: "Client walkthrough that day",
    })
    .eq("id", pendingWfh.data?.id ?? "00000000-0000-0000-0000-000000000000")
    .select("status, decided_by, decided_at, decision_note")
    .maybeSingle();
  const survivedWfh = await sb.from("wfh_requests").select("id").eq("org_id", A.id);
  const d = decidedWfh.data ?? {};
  check(
    "a decision updates the row and attributes it — the request is never deleted",
    !decidedWfh.error &&
      d.status === "rejected" &&
      !!d.decided_by &&
      !!d.decided_at &&
      !!d.decision_note &&
      (survivedWfh.data ?? []).length === 2,
    `${decidedWfh.error?.message ?? d.status} by=${d.decided_by ? "set" : "null"} at=${
      d.decided_at ? "set" : "null"
    } note=${d.decision_note ? "set" : "null"} rows=${(survivedWfh.data ?? []).length}`,
  );

  // Holidays are TENANT-OWNED: a Hyderabad firm and a Gurugram firm do not
  // share a calendar, so the same date is free in both.
  // Every row carries `is_optional`. Omitting it on two rows of three made
  // PostgREST send an explicit NULL for them, `not null` rejected the batch,
  // and A ended up with ZERO holidays — which then read as three separate
  // failures downstream. One bug, three misleading symptoms.
  const holidaySeed = await sb.from("holidays").insert([
    { org_id: A.id, holiday_date: "2026-03-24", name: "Ugadi", is_optional: false },
    { org_id: A.id, holiday_date: "2026-11-08", name: "Diwali", is_optional: false },
    { org_id: A.id, holiday_date: "2026-03-25", name: "Holi (restricted)", is_optional: true },
  ]);
  // Single-row and deliberately WITHOUT `is_optional`, which is how the column
  // default gets exercised. A default is only reachable when the key is absent
  // from a lone row — never from a batch that omits it on some rows.
  const sharedDate = await sb.from("holidays").insert({
    org_id: B.id, holiday_date: "2026-03-24", name: "Ugadi",
  });
  const aHolidays = await sb.from("holidays").select("id").eq("org_id", A.id);
  const bHolidays = await sb.from("holidays").select("id, is_optional").eq("org_id", B.id);
  check(
    "holidays are org-scoped, and two tenants may share a date",
    !holidaySeed.error && !sharedDate.error &&
      (aHolidays.data ?? []).length === 3 && (bHolidays.data ?? []).length === 1,
    `seed=${holidaySeed.error?.message ?? "ok"} A=${(aHolidays.data ?? []).length} B=${(bHolidays.data ?? []).length} shared=${sharedDate.error?.code ?? "ok"}`,
  );
  check(
    "an omitted is_optional falls to the column default, not to NULL",
    (bHolidays.data ?? []).length === 1 && bHolidays.data[0].is_optional === false,
    `got ${JSON.stringify(bHolidays.data?.[0]?.is_optional)}`,
  );

  // Unique on (org, date, lower(name)) — case-insensitively, because "Diwali"
  // and "diwali" are the same day to whoever is reading the calendar.
  const dupHoliday = await sb.from("holidays").insert({
    org_id: A.id, holiday_date: "2026-11-08", name: "diwali",
  });
  check(
    "a holiday name is unique per date per tenant, case-insensitively",
    !!dupHoliday.error,
    dupHoliday.error?.code ?? "duplicate accepted",
  );

  // ...but a DATE may carry more than one name: firms do list two observances
  // on one day, and the index is deliberately on the name, not the date.
  const secondObservance = await sb.from("holidays").insert({
    org_id: A.id, holiday_date: "2026-11-08", name: "Govardhan Puja",
  });
  const onDiwali = await sb
    .from("holidays").select("name").eq("org_id", A.id).eq("holiday_date", "2026-11-08");
  check(
    "one date may carry two observances (Diwali + Govardhan Puja)",
    !secondObservance.error && (onDiwali.data ?? []).length === 2,
    `${secondObservance.error?.code ?? "ok"} / ${(onDiwali.data ?? []).length} rows`,
  );

  // The optional/closure distinction survives the round trip — an office
  // closure and a floating holiday are different facts.
  const optional = await sb
    .from("holidays").select("name, is_optional").eq("org_id", A.id).eq("is_optional", true);
  check(
    "a restricted holiday stays distinguishable from an office closure",
    (optional.data ?? []).length === 1 && optional.data[0].name === "Holi (restricted)",
    `got ${(optional.data ?? []).length}`,
  );

  // Removing a person takes their WFH history with them — no orphan requests
  // pointing at a membership that is gone.
  const { data: tempMember } = await sb.from("org_members").insert({
    org_id: A.id, user_id: crypto.randomUUID(), role: "member", display_name: "A Temp Staff",
  }).select("id").single();
  await sb.from("wfh_requests").insert({
    org_id: A.id, member_id: tempMember.id, from_date: "2026-09-01", to_date: "2026-09-01",
  });
  await sb.from("org_members").delete().eq("id", tempMember.id);
  const orphanWfh = await sb.from("wfh_requests").select("id").eq("member_id", tempMember.id);
  check(
    "removing a member cascades to their WFH requests",
    (orphanWfh.data ?? []).length === 0,
    `got ${(orphanWfh.data ?? []).length}`,
  );
  }

  {
  // ── Saved views (0043) ──────────────────────────────────────────
  // A saved view is scoped to a TENANT and to a PERSON. There is no
  // project-isolation assertion here because the table is not project-scoped:
  // a view is a saved query string for a company-wide screen. Its second axis
  // is the OWNER, so that is what is asserted instead.
  //
  // ⚠ Every row below carries every key (`query` is exercised once, alone,
  // through a single-row insert) — a batch that omits a key on some rows makes
  // PostgREST send an explicit NULL and defeats the column default (§11).
  const svSeed = await sb.from("saved_views").insert([
    { org_id: A.id, member_id: memA.id, screen: "finance.payments", name: "Overdue only", query: "dues=1" },
    { org_id: A.id, member_id: memA.id, screen: "finance.receivables", name: "90+ bucket", query: "bucket=90plus" },
  ]);
  const svSeedB = await sb.from("saved_views").insert([
    { org_id: B.id, member_id: memB.id, screen: "finance.payments", name: "Overdue only", query: "dues=1" },
  ]);
  const aViews = await sb.from("saved_views").select("id, name, query").eq("org_id", A.id);
  const bViews = await sb.from("saved_views").select("id, name").eq("org_id", B.id);
  check(
    "saved views are org-scoped, and two tenants may use the same view name",
    !svSeed.error && !svSeedB.error &&
      (aViews.data ?? []).length === 2 && (bViews.data ?? []).length === 1,
    `seed=${svSeed.error?.message ?? "ok"} A=${(aViews.data ?? []).length} B=${(bViews.data ?? []).length}`,
  );

  // The composite FK from 0035's rule. A plain `references org_members(id)`
  // would accept this row, and tenant A would own a view belonging to B's
  // member — which is exactly the isolation hole RLS-off has to close in the
  // schema, because nothing else will.
  const crossOwner = await sb.from("saved_views").insert({
    org_id: A.id, member_id: memB.id, screen: "finance.payments", name: "Smuggled", query: "",
  });
  // ⚠ The CODE, not merely "an error". Before 0043 is applied every insert
  // here fails with PGRST205 ("no such table"), which would make this and the
  // three constraint checks below pass while examining nothing — the exact
  // failure §11 calls the worst outcome available. Naming the constraint code
  // keeps them honestly RED until the migration lands.
  check(
    "a saved view cannot be owned by another tenant's member",
    crossOwner.error?.code === "23503",
    crossOwner.error?.code ?? "cross-org owner accepted",
  );

  // Saving a name you already used REPLACES that view; two chips with one
  // label would be unusable. Case-insensitive, like the holidays index.
  const dupView = await sb.from("saved_views").insert({
    org_id: A.id, member_id: memA.id, screen: "finance.payments", name: "OVERDUE ONLY", query: "dues=1&q=x",
  });
  check(
    "a view name is unique per owner per screen, case-insensitively",
    dupView.error?.code === "23505",
    dupView.error?.code ?? "duplicate accepted",
  );

  // …but the SAME name on a different screen is a different view, and so is
  // the same name owned by a different person in the same tenant.
  const { data: otherMember } = await sb.from("org_members").insert({
    org_id: A.id, user_id: crypto.randomUUID(), role: "member", display_name: "A View Owner",
  }).select("id").single();
  const sameNameOtherOwner = await sb.from("saved_views").insert({
    org_id: A.id, member_id: otherMember.id, screen: "finance.payments", name: "Overdue only", query: "dues=1",
  });
  check(
    "two people in one tenant may each keep their own view of the same name",
    !sameNameOtherOwner.error,
    sameNameOtherOwner.error?.message ?? "ok",
  );

  // Single-row and deliberately WITHOUT `query` — the only way a column
  // default is reachable. An empty query means "the unfiltered screen", which
  // is a perfectly reasonable view to save; it must not arrive as NULL.
  const noQuery = await sb.from("saved_views").insert({
    org_id: A.id, member_id: otherMember.id, screen: "finance.receivables", name: "Everything",
  });
  const defaulted = await sb.from("saved_views")
    .select("query").eq("org_id", A.id).eq("member_id", otherMember.id)
    .eq("screen", "finance.receivables");
  check(
    "an omitted query falls to the empty-string default, not to NULL",
    !noQuery.error && (defaulted.data ?? []).length === 1 && defaulted.data[0].query === "",
    `${noQuery.error?.message ?? "ok"} got ${JSON.stringify(defaulted.data?.[0]?.query)}`,
  );

  // The 40-character cap lib/saved-views-model.ts::validateViewName enforces,
  // stated in the schema too — a limit only the browser knows is not a limit.
  const longName = await sb.from("saved_views").insert({
    org_id: A.id, member_id: memA.id, screen: "finance.payments", name: "x".repeat(41), query: "",
  });
  check(
    "a saved view name cannot exceed 40 characters",
    longName.error?.code === "23514",
    longName.error?.code ?? "over-length name accepted",
  );

  // A view belongs to a person. Removing them takes their views with them —
  // CASCADE, not SET NULL, because a view with no owner is a row nothing can
  // ever list, apply or delete.
  await sb.from("org_members").delete().eq("id", otherMember.id);
  const orphanViews = await sb.from("saved_views").select("id").eq("member_id", otherMember.id);
  check(
    "removing a member cascades to their saved views",
    // `!orphanViews.error` matters: without it a missing table reads as zero
    // orphans and this passes having read nothing at all.
    !orphanViews.error && (orphanViews.data ?? []).length === 0,
    `${orphanViews.error?.code ?? "ok"} rows=${(orphanViews.data ?? []).length}`,
  );
  }

  // ── Permissions + audit (0035) ────────────────────────────────────────────
  // The security boundary. With RLS off these assertions are the only thing
  // standing between "we have permissions" and "we have a permissions screen".
  {
    // audit_events is a LEDGER: org-scoped, and it survives its actor.
    const { data: auditor } = await sb.from("org_members").insert({
      org_id: A.id, user_id: crypto.randomUUID(), role: "manager", display_name: "An Auditor",
    }).select("id").single();

    await sb.from("audit_events").insert([
      { org_id: A.id, actor_member_id: auditor.id, actor_name: "An Auditor",
        entity: "purchase_order", entity_id: crypto.randomUUID(), action: "approve",
        before: { status: "pending" }, after: { status: "approved" } },
    ]);
    await sb.from("audit_events").insert([
      { org_id: B.id, actor_member_id: null, actor_name: "Someone Else",
        entity: "purchase_order", entity_id: crypto.randomUUID(), action: "approve",
        before: null, after: null },
    ]);

    const aAudit = await sb.from("audit_events").select("id, before, after").eq("org_id", A.id);
    const bAudit = await sb.from("audit_events").select("id").eq("org_id", B.id);
    check(
      "audit events are org-scoped",
      (aAudit.data ?? []).length === 1 && (bAudit.data ?? []).length === 1,
      `A=${(aAudit.data ?? []).length} B=${(bAudit.data ?? []).length}`,
    );
    check(
      "an audit row keeps before AND after as structured jsonb, not a text diff",
      (aAudit.data ?? [])[0]?.before?.status === "pending" &&
        (aAudit.data ?? [])[0]?.after?.status === "approved",
      JSON.stringify((aAudit.data ?? [])[0]?.after ?? null),
    );

    // Deleting the actor must NOT delete what the actor did — otherwise
    // removing a person quietly erases the record of their decisions.
    await sb.from("org_members").delete().eq("id", auditor.id);
    const survived = await sb
      .from("audit_events").select("id, actor_member_id, actor_name").eq("org_id", A.id);
    check(
      "an audit event survives its actor's deletion, keeping the name",
      (survived.data ?? []).length === 1 &&
        survived.data[0].actor_member_id === null &&
        survived.data[0].actor_name === "An Auditor",
      `rows=${(survived.data ?? []).length} actor=${survived.data?.[0]?.actor_member_id ?? "null"}`,
    );

    // ── Role inheritance ───────────────────────────────────────────────────
    const { data: parentRole } = await sb.from("roles").insert({
      org_id: A.id, name: "Verify Parent", is_system: false, permissions: {},
    }).select("id").single();
    const { data: childRole } = await sb.from("roles").insert({
      org_id: A.id, name: "Verify Child", is_system: false, permissions: {},
      inherits_from: parentRole.id,
    }).select("id").single();

    const selfInherit = await sb
      .from("roles").update({ inherits_from: childRole.id }).eq("id", childRole.id);
    check(
      "a role cannot inherit from itself",
      !!selfInherit.error,
      selfInherit.error?.code ?? "self-inheritance accepted",
    );

    // The third capability segment, and one grant per capability.
    await sb.from("permissions").insert({
      org_id: A.id, role_id: parentRole.id,
      module: "procurement", entity: "po", action: "approve", scope: "org",
    });
    const dupGrant = await sb.from("permissions").insert({
      org_id: A.id, role_id: parentRole.id,
      module: "procurement", entity: "po", action: "approve", scope: "own",
    });
    check(
      "the same capability cannot be granted to one role twice",
      !!dupGrant.error,
      dupGrant.error?.code ?? "duplicate grant accepted",
    );
    // ...but the SAME action on a different entity is a different capability.
    const siblingGrant = await sb.from("permissions").insert({
      org_id: A.id, role_id: parentRole.id,
      module: "procurement", entity: "mr", action: "approve", scope: "org",
    });
    check(
      "approving a PO and approving an MR are different grants",
      !siblingGrant.error,
      siblingGrant.error?.message ?? "ok",
    );

    // Deleting a parent role ORPHANS its children; it must not cascade-delete
    // roles that people are actively assigned to.
    await sb.from("roles").delete().eq("id", parentRole.id);
    const orphaned = await sb.from("roles").select("id, inherits_from").eq("id", childRole.id);
    check(
      "deleting a parent role orphans its child rather than deleting it",
      (orphaned.data ?? []).length === 1 && orphaned.data[0].inherits_from === null,
      `rows=${(orphaned.data ?? []).length}`,
    );

    // ── The same-org FK holes Units 3 and 4 found ──────────────────────────
    // Each of these would have been ACCEPTED before 0035.
    const { data: mA } = await sb.from("org_members").insert({
      org_id: A.id, user_id: crypto.randomUUID(), role: "member", display_name: "Org A Person",
    }).select("id").single();
    const { data: mB } = await sb.from("org_members").insert({
      org_id: B.id, user_id: crypto.randomUUID(), role: "manager", display_name: "Org B Manager",
    }).select("id").single();

    const crossManager = await sb
      .from("org_members").update({ manager_id: mB.id }).eq("id", mA.id);
    check(
      "a member cannot report to a manager in another tenant",
      !!crossManager.error,
      crossManager.error?.code ?? "cross-org manager accepted",
    );

    const { data: crossLeave } = await sb.from("leave_requests").insert({
      org_id: A.id, member_id: mA.id, leave_type: "casual",
      from_date: "2026-10-01", to_date: "2026-10-01", days: 1, status: "pending",
    }).select("id").single();
    const crossDecide = await sb
      .from("leave_requests").update({ decided_by: mB.id, status: "approved" })
      .eq("id", crossLeave.id);
    check(
      "leave cannot be decided by a manager in another tenant",
      !!crossDecide.error,
      crossDecide.error?.code ?? "cross-org decider accepted",
    );

    const { data: crossWfh } = await sb.from("wfh_requests").insert({
      org_id: A.id, member_id: mA.id, from_date: "2026-10-02", to_date: "2026-10-02", days: 1,
    }).select("id").single();
    const crossWfhDecide = await sb
      .from("wfh_requests").update({ decided_by: mB.id, status: "approved" })
      .eq("id", crossWfh.id);
    check(
      "WFH cannot be decided by a manager in another tenant",
      !!crossWfhDecide.error,
      crossWfhDecide.error?.code ?? "cross-org decider accepted",
    );

    // A member may only hold a role from their OWN tenant.
    const { data: roleB } = await sb.from("roles").insert({
      org_id: B.id, name: "Org B Role", is_system: false, permissions: {},
    }).select("id").single();
    const crossRole = await sb
      .from("org_members").update({ role_id: roleB.id }).eq("id", mA.id);
    check(
      "a member cannot hold a role belonging to another tenant",
      !!crossRole.error,
      crossRole.error?.code ?? "cross-org role accepted",
    );

    // ── The role description cap (0040) ───────────────────────────────────
    // Frame `110413` counts `0/155`. A limit only the browser knows is not a
    // limit, and this column is written by a server action.
    const longDesc = await sb.from("roles").insert({
      org_id: A.id, name: "Verify Long Desc", is_system: false, permissions: {},
      description: "x".repeat(156),
    });
    check(
      "a role description cannot exceed 155 characters",
      !!longDesc.error,
      longDesc.error?.code ?? "over-length description accepted",
    );
    const okDesc = await sb.from("roles").insert({
      org_id: A.id, name: "Verify OK Desc", is_system: false, permissions: {},
      description: "x".repeat(155),
    });
    check(
      "exactly 155 characters is accepted",
      !okDesc.error,
      okDesc.error?.message ?? "ok",
    );
  }

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
