/**
 * Seed a persistent DEMO tenant on the real Supabase, so the app can be logged
 * into and clicked through. Idempotent: if the demo user already has an org, it
 * just prints the credentials and exits. Uses the admin API (same path as
 * lib/data/provisioning.ts) — this is test-data seeding in the owner's own DB.
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

async function findUserByEmail(email) {
  // listUsers is paginated; the demo project is small, one page suffices.
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data?.users?.find((u) => u.email === email) ?? null;
}

async function main() {
  let userId;
  const existing = await findUserByEmail(DEMO.email);

  if (existing) {
    userId = existing.id;
    const { data: mem } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (mem) {
      console.log("✓ Demo tenant already seeded.");
      return report(mem.org_id);
    }
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

  // Profile + org + branch + role + membership (mirror provisioning.ts).
  await sb.from("app_users").upsert({ id: userId, email: DEMO.email, full_name: DEMO.fullName });
  const { data: org } = await sb
    .from("orgs")
    .insert({ name: DEMO.orgName, slug: "veyra-demo-" + Date.now().toString(36) })
    .select("id")
    .single();
  const orgId = org.id;
  await sb.from("branches").insert({ org_id: orgId, name: "Head Office", code: "HO", is_default: true });
  await sb.from("roles").insert({ org_id: orgId, name: "Owner", is_system: true, permissions: { all: true } });
  await sb.from("org_members").insert({ org_id: orgId, user_id: userId, role: "owner", status: "active" });

  // Catalogue items.
  const items = [
    { name: "18mm BWP Plywood", code: "PLY-18-BWP", type: "material", category: "Plywood", brand: "Century", base_uom: "sheet", purchase_uom: "sheet", purchase_to_base_factor: 1, base_rate: 1850, hsn_sac: "4412", tax_rate: 18 },
    { name: "1mm Laminate — Matte", code: "LAM-1-MT", type: "material", category: "Laminate", brand: "Merino", base_uom: "sheet", base_rate: 950, hsn_sac: "4823", tax_rate: 18 },
    { name: "Soft-close Hinge", code: "HW-HINGE-SC", type: "material", category: "Hardware", brand: "Hettich", base_uom: "nos", base_rate: 210, hsn_sac: "8302", tax_rate: 18 },
    { name: "Carpentry — Installation", code: "LAB-CARP", type: "labour", category: "Labour", base_uom: "day", base_rate: 1200, hsn_sac: "9954", tax_rate: 18 },
  ];
  await sb.from("items").insert(
    items.map((it) => ({ org_id: orgId, name_key: nameKey(it.name), created_by: userId, ...it })),
  );

  // A sample quotation with 2 sections + lines (totals computed like the engine).
  const { data: quote } = await sb
    .from("quotations")
    .insert({
      org_id: orgId,
      number: "QT/2026-27/0001",
      title: "3BHK Interiors — Demo",
      status: "draft",
      customer_name: "Mr Suresh",
      customer_phone: "+91 98765 43210",
      place_of_supply: "Telangana",
      created_by: userId,
    })
    .select("id")
    .single();
  const qId = quote.id;

  const mkSection = async (title, sort) => {
    const { data } = await sb.from("quotation_sections").insert({ org_id: orgId, quotation_id: qId, title, sort_order: sort }).select("id").single();
    return data.id;
  };
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

  const totals = computed.reduce(
    (a, c) => ({
      subtotal: a.subtotal + c.line_subtotal,
      discount_total: a.discount_total + c.discount_amount,
      taxable_total: a.taxable_total + c.taxable,
      tax_total: a.tax_total + c.tax_amount,
      grand_total: a.grand_total + c.line_total,
      cost_total: a.cost_total + c.line_cost,
    }),
    { subtotal: 0, discount_total: 0, taxable_total: 0, tax_total: 0, grand_total: 0, cost_total: 0 },
  );
  await sb.from("quotations").update({
    subtotal: round2(totals.subtotal),
    discount_total: round2(totals.discount_total),
    taxable_total: round2(totals.taxable_total),
    tax_total: round2(totals.tax_total),
    grand_total: round2(totals.grand_total),
    cost_total: round2(totals.cost_total),
    margin_total: round2(totals.taxable_total - totals.cost_total),
  }).eq("id", qId);

  console.log("✓ Seeded demo tenant with 4 items + 1 quotation.");
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
