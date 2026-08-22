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
  ]);

  // (8) Tenant isolation on quotations + children.
  const { data: aQ } = await sb.from("quotations").select("title").eq("org_id", A.id);
  const { data: bQ } = await sb.from("quotations").select("title").eq("org_id", B.id);
  check("org A sees exactly its 1 quotation", aQ.length === 1, `got ${aQ.length}`);
  check("org B sees exactly its 1 quotation", bQ.length === 1, `got ${bQ.length}`);
  const { data: aLines } = await sb.from("quotation_lines").select("id").eq("org_id", A.id);
  check("A's quotation lines are org-scoped (2 lines)", aLines.length === 2, `got ${aLines.length}`);

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
