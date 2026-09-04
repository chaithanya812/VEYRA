import "server-only";
import { withOrg } from "./with-org";
import { recordAudit } from "./permissions";
import { getActingContext, listMembers } from "./team";
import { listOptions } from "./workspace";
import {
  pettyReversalOf,
  validatePettyEntry,
  type PettyClaim,
} from "@/lib/petty-finance-model";
import type { WorkspaceOption } from "@/lib/workspace-model";

/**
 * Petty Finance data module — PLAN-V4 §12.2, frame `110521`.
 *
 * It reads `expense_claims`, the table the workspace has always written, and
 * nothing else. No new ledger, no second expense table: Petty Finance is the
 * same rows seen per person.
 *
 * ⚠ EVERY READ IS `select("*")`, ON PURPOSE. Migration 0041 adds `kind`,
 * `reversal_of` and `vendor_id`; naming them in a `select` before it is applied
 * would empty the WHOLE read silently (HANDOFF-V8 §11), turning a missing
 * column into "this tenant has no petty spend". With `*` the columns simply
 * arrive undefined and `petty-finance-model.ts` treats every row as the plain
 * expense it currently is. Every `.error` below is checked and reported as
 * itself (HARD RULE 12).
 *
 * This module computes no money. Balances, totals and reversals all come from
 * `lib/petty-finance-model.ts`, which is the same engine the tests exercise.
 */

export interface PettyFinanceData {
  claims: PettyClaim[];
  members: { id: string; name: string }[];
  /** project id → name, for the ledger's Project Name column. */
  projectNames: Record<string, string>;
  /** vendor id → name, for the ledger's Vendor column. */
  vendorNames: Record<string, string>;
  /** Live projects, for the record-an-entry form's project picker. */
  projects: { id: string; name: string }[];
  categories: WorkspaceOption[];
  actingMemberId: string;
}

export async function pettyFinanceData(): Promise<PettyFinanceData> {
  const { db } = await withOrg();

  const [claimRes, projRes, vendorRes] = await Promise.all([
    db.table("expense_claims").select("*").order("spent_on", { ascending: false }),
    db.table("projects").select("id, name").order("created_at", { ascending: false }),
    db.table("vendors").select("id, name"),
  ]);
  if (claimRes.error) throw claimRes.error;
  if (projRes.error) throw projRes.error;
  if (vendorRes.error) throw vendorRes.error;

  const projects = (projRes.data ?? []) as unknown as {
    id: string;
    name: string | null;
  }[];
  const vendors = (vendorRes.data ?? []) as unknown as {
    id: string;
    name: string | null;
  }[];

  const [members, categories, acting] = await Promise.all([
    listMembers(),
    listOptions("expense_category"),
    getActingContext(),
  ]);

  return {
    claims: (claimRes.data ?? []) as unknown as PettyClaim[],
    members: members.map((m) => ({ id: m.id, name: m.name })),
    projectNames: Object.fromEntries(
      projects.filter((p) => p.name).map((p) => [p.id, p.name as string]),
    ),
    vendorNames: Object.fromEntries(
      vendors.filter((v) => v.name).map((v) => [v.id, v.name as string]),
    ),
    projects: projects.map((p) => ({ id: p.id, name: p.name ?? "Untitled project" })),
    categories: categories.filter((c) => c.is_active),
    actingMemberId: acting.member.id,
  };
}

/**
 * Record one petty entry — an expense the acting member spent, or a fund they
 * received.
 *
 * ⚠ `member_id` comes from the acting context, NEVER from the form. That single
 * line is what makes this safe to leave ungated: a person can only ever file
 * against their own name, so there is nothing here to escalate. Gating it would
 * lock a member out of their own money (HANDOFF-V8 §5a).
 */
export async function recordPettyEntry(input: {
  kind: string;
  spent_on: string;
  amount: number | string;
  category: string;
  project_id?: string | null;
  remark?: string | null;
}): Promise<{ error?: string; id?: string }> {
  const parsed = validatePettyEntry(input);
  if (!parsed.ok) return { error: parsed.error };

  const { db } = await withOrg();
  const { data, error } = await db.table("expense_claims").insert({
    member_id: (await getActingContext()).member.id,
    project_id: input.project_id?.trim() || null,
    spent_on: parsed.spent_on,
    amount: parsed.amount,
    category: input.category || "other",
    kind: parsed.kind,
    remark: input.remark?.trim() || null,
    status: "submitted",
  });
  // The PostgREST message, verbatim. Collapsing it into "could not save" would
  // name a different cause than the real one (HARD RULE 12).
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string } | undefined)?.id };
}

/**
 * Reverse a petty entry: a NEW row with the opposite sign pointing at the one
 * it cancels. The original is never touched and never deleted — HARD RULE 4.
 *
 * The caller has already been checked for `billing.payment.approve`; this acts
 * on somebody else's money, so it is not self-service.
 */
export async function reversePettyEntry(
  id: string,
): Promise<{ error?: string }> {
  const { db } = await withOrg();

  // Read the row BEFORE writing, so the audit ledger has a real `before`.
  const { data, error } = await db
    .table("expense_claims")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  const original = data as unknown as PettyClaim | null;
  if (!original) return { error: "That petty entry no longer exists." };
  if (original.reversal_of) {
    return { error: "A reversal cannot itself be reversed — reverse the original." };
  }

  const already = await db
    .table("expense_claims")
    .select("id")
    .eq("reversal_of", id);
  if (already.error) return { error: already.error.message };
  if ((already.data ?? []).length > 0) {
    return { error: "That entry has already been reversed." };
  }

  const row = pettyReversalOf(original);
  const ins = await db.table("expense_claims").insert(row);
  if (ins.error) return { error: ins.error.message };

  await recordAudit({
    entity: "expense_claims",
    entityId: id,
    action: "reverse",
    before: { amount: original.amount, reversal_of: null },
    after: {
      reversed_by: (ins.data?.[0] as { id: string } | undefined)?.id ?? null,
      amount: row.amount,
    },
  });
  return {};
}
