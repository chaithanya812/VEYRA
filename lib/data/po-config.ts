import "server-only";
import { withOrg } from "./with-org";
import { validateMilestones } from "@/lib/po-plan-model";

/**
 * PO payment-plan library and PO terms library. Tenant-owned configuration,
 * independent of quotation_terms / quotation-studio (owner decision Q2).
 *
 * Everything goes through withOrg(), so org_id filtering/stamping is automatic.
 * Milestone amounts are NOT written here — only pct. The rupee figure is
 * derived at render by allocateMilestoneAmounts().
 */

export interface PaymentPlan {
  id: string;
  name: string;
  is_demo: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PaymentPlanMilestone {
  id: string;
  plan_id: string;
  label: string;
  pct: number;
  sort: number;
}

export interface PaymentPlanWithMilestones extends PaymentPlan {
  milestones: PaymentPlanMilestone[];
}

export interface PoTermsClause {
  id: string;
  title: string;
  body: string;
  is_default: boolean;
  seq: number;
  is_active: boolean;
  is_demo: boolean;
}

/* ── Demo seed (is_demo = true). The self-clearing box is a later unit. ──── */

const DEMO_PLANS: {
  name: string;
  milestones: { label: string; pct: number; sort: number }[];
}[] = [
  {
    name: "Residential 25 / 45 / 30",
    milestones: [
      { label: "Advance", pct: 25, sort: 0 },
      { label: "Delivery", pct: 45, sort: 1 },
      { label: "Installation", pct: 30, sort: 2 },
    ],
  },
  {
    name: "Commercial 40 / 40 / 20",
    milestones: [
      { label: "Advance", pct: 40, sort: 0 },
      { label: "On dispatch", pct: 40, sort: 1 },
      { label: "Retention", pct: 20, sort: 2 },
    ],
  },
];

const DEMO_TERMS: { title: string; body: string; is_default: boolean; seq: number }[] = [
  {
    title: "GST exclusive",
    is_default: true,
    seq: 0,
    body:
      "Prices are exclusive of GST unless stated otherwise. GST will be charged at the rate applicable on the date of invoice, against a tax invoice.",
  },
  {
    title: "Delivery, risk and inspection",
    is_default: false,
    seq: 1,
    body:
      "Goods remain the vendor's risk until received at site and inspected. Shortages or damage must be notified within three working days of delivery.",
  },
];

async function ensureDemoPoLibraries(): Promise<void> {
  const { db } = await withOrg();

  const { data: existingPlans } = await db.table("po_payment_plans").select("id, name");
  const plans = (existingPlans ?? []) as unknown as { id: string; name: string }[];
  const havePlan = new Set(plans.map((p) => p.name));
  const missingPlans = DEMO_PLANS.filter((p) => !havePlan.has(p.name));
  if (missingPlans.length > 0) {
    await db.table("po_payment_plans").insert(
      missingPlans.map((p) => ({
        name: p.name,
        is_demo: true,
        is_active: true,
      })),
    );
  }

  const { data: allPlans } = await db.table("po_payment_plans").select("id, name");
  const byName = new Map(
    ((allPlans ?? []) as unknown as { id: string; name: string }[]).map((p) => [p.name, p.id]),
  );
  const { data: existingMs } = await db
    .table("po_payment_plan_milestones")
    .select("plan_id, label");
  const haveMs = new Set(
    ((existingMs ?? []) as unknown as { plan_id: string; label: string }[]).map(
      (m) => `${m.plan_id}::${m.label}`,
    ),
  );
  const msToInsert: { plan_id: string; label: string; pct: number; sort: number }[] = [];
  for (const demo of DEMO_PLANS) {
    const planId = byName.get(demo.name);
    if (!planId) continue;
    for (const m of demo.milestones) {
      if (!haveMs.has(`${planId}::${m.label}`)) {
        msToInsert.push({ plan_id: planId, label: m.label, pct: m.pct, sort: m.sort });
      }
    }
  }
  if (msToInsert.length > 0) {
    await db.table("po_payment_plan_milestones").insert(msToInsert);
  }

  const { data: existingTerms } = await db.table("po_terms").select("title");
  const haveTerm = new Set(
    ((existingTerms ?? []) as unknown as { title: string }[]).map((t) => t.title),
  );
  const missingTerms = DEMO_TERMS.filter((t) => !haveTerm.has(t.title));
  if (missingTerms.length > 0) {
    await db.table("po_terms").insert(
      missingTerms.map((t) => ({
        title: t.title,
        body: t.body,
        is_default: t.is_default,
        seq: t.seq,
        is_demo: true,
        is_active: true,
      })),
    );
  }
}

function asPlan(row: {
  id: string;
  name: string;
  is_demo: boolean;
  is_active: boolean;
  created_at: string;
}): PaymentPlan {
  return {
    id: row.id,
    name: row.name,
    is_demo: Boolean(row.is_demo),
    is_active: row.is_active !== false,
    created_at: row.created_at,
  };
}

function asMilestone(row: {
  id: string;
  plan_id: string;
  label: string;
  pct: number | string;
  sort: number | string;
}): PaymentPlanMilestone {
  return {
    id: row.id,
    plan_id: row.plan_id,
    label: row.label,
    pct: Number(row.pct),
    sort: Number(row.sort),
  };
}

function asTerms(row: {
  id: string;
  title: string;
  body: string;
  is_default: boolean;
  seq: number | string;
  is_active: boolean;
  is_demo: boolean;
}): PoTermsClause {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    is_default: Boolean(row.is_default),
    seq: Number(row.seq),
    is_active: row.is_active !== false,
    is_demo: Boolean(row.is_demo),
  };
}

/* ── Payment plans ────────────────────────────────────────────────────────── */

export async function listPaymentPlans(): Promise<PaymentPlanWithMilestones[]> {
  await ensureDemoPoLibraries();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("po_payment_plans")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const { data: ms, error: msErr } = await db
    .table("po_payment_plan_milestones")
    .select("*")
    .order("sort", { ascending: true });
  if (msErr) throw msErr;

  const byPlan = new Map<string, PaymentPlanMilestone[]>();
  for (const raw of (ms ?? []) as unknown as Parameters<typeof asMilestone>[0][]) {
    const m = asMilestone(raw);
    const list = byPlan.get(m.plan_id) ?? [];
    list.push(m);
    byPlan.set(m.plan_id, list);
  }

  return ((data ?? []) as unknown as Parameters<typeof asPlan>[0][]).map((p) => ({
    ...asPlan(p),
    milestones: byPlan.get(p.id) ?? [],
  }));
}

export async function getPaymentPlan(
  id: string,
): Promise<PaymentPlanWithMilestones | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("po_payment_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: ms, error: msErr } = await db
    .table("po_payment_plan_milestones")
    .select("*")
    .eq("plan_id", id)
    .order("sort", { ascending: true });
  if (msErr) throw msErr;

  return {
    ...asPlan(data as unknown as Parameters<typeof asPlan>[0]),
    milestones: ((ms ?? []) as unknown as Parameters<typeof asMilestone>[0][]).map(asMilestone),
  };
}

export async function savePaymentPlan(input: {
  name: string;
  milestones: { label: string; pct: number }[];
}): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Give the payment plan a name." };

  const milestones = input.milestones.map((m) => ({
    label: m.label.trim(),
    pct: Number(m.pct),
  }));
  const check = validateMilestones(milestones);
  if (!check.ok) return { error: check.error };
  if (milestones.some((m) => !m.label)) {
    return { error: "Every milestone needs a label." };
  }

  const { db, ctx } = await withOrg();
  const { data, error } = await db.table("po_payment_plans").insert({
    name,
    is_demo: false,
    is_active: true,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  const id = (data?.[0] as { id: string } | undefined)?.id;
  if (!id) return { error: "The payment plan could not be saved." };

  const { error: msErr } = await db.table("po_payment_plan_milestones").insert(
    milestones.map((m, i) => ({
      plan_id: id,
      label: m.label,
      pct: m.pct,
      sort: i,
    })),
  );
  if (msErr) {
    await db.table("po_payment_plans").deleteById(id);
    return { error: msErr.message };
  }
  return { id };
}

export async function deletePaymentPlan(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("po_payment_plans").deleteById(id);
  return error ? { error: error.message } : {};
}

/* ── PO terms ─────────────────────────────────────────────────────────────── */

export async function listPoTerms(): Promise<PoTermsClause[]> {
  await ensureDemoPoLibraries();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("po_terms")
    .select("*")
    .order("seq", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Parameters<typeof asTerms>[0][]).map(asTerms);
}

export async function getPoTerms(id: string): Promise<PoTermsClause | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("po_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return asTerms(data as unknown as Parameters<typeof asTerms>[0]);
}

export async function savePoTerms(input: {
  id?: string;
  title: string;
  body: string;
  is_default?: boolean;
}): Promise<{ error?: string }> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { error: "Give the clause a title." };
  if (!body) return { error: "The clause text cannot be empty." };

  const { db, ctx } = await withOrg();
  if (input.id) {
    const { error } = await db.table("po_terms").updateById(input.id, {
      title,
      body,
      ...(input.is_default !== undefined ? { is_default: input.is_default } : {}),
    });
    return error ? { error: error.message } : {};
  }

  const existing = await listPoTerms();
  const { error } = await db.table("po_terms").insert({
    title,
    body,
    is_default: input.is_default ?? false,
    seq: existing.length,
    is_demo: false,
    is_active: true,
    created_by: ctx.userId,
  });
  return error ? { error: error.message } : {};
}

export async function deletePoTerms(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("po_terms").deleteById(id);
  return error ? { error: error.message } : {};
}
