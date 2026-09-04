import "server-only";
import { withOrg } from "./with-org";
import { recordAudit } from "./permissions";
import { getActingContext } from "./team";
import {
  validateWriteOff,
  type ReceivableContract,
  type ReceivableMilestone,
  type ReceivableProject,
  type ReceivableReceipt,
} from "@/lib/receivables-model";

/**
 * Account Receivables data module — PLAN-V4 §12.3, frame `110534`.
 *
 * It reads `projects`, `contracts`, `milestones` and `payments` — the four
 * tables Phase 8 §9.3 already writes — and NOTHING ELSE. There is no
 * receivables table, because ageing a receivable is a question asked of the
 * payment schedule rather than a second copy of it.
 *
 * ⚠ THE MILESTONE READ IS `select("*")`, ON PURPOSE. Migration 0042 adds
 * `written_off_at` / `written_off_by` / `write_off_reason`; naming them in a
 * `select` before it is applied would empty the WHOLE read silently
 * (HANDOFF-V8 §11) and turn a missing column into "this tenant has no
 * receivables". With `*` they simply arrive undefined and every milestone reads
 * as the plain, un-written-off row it is today.
 *
 * Every `.error` below is checked and reported as itself (HARD RULE 12).
 * This module computes no money: `lib/receivables-model.ts` does all of it.
 */

export interface ReceivablesData {
  projects: ReceivableProject[];
  contracts: ReceivableContract[];
  milestonesByContract: Map<string, ReceivableMilestone[]>;
  receipts: ReceivableReceipt[];
  /** True once 0042 is applied — the screen says so rather than faking a tile. */
  writeOffAvailable: boolean;
}

export async function receivablesData(): Promise<ReceivablesData> {
  const { db } = await withOrg();

  const [projRes, conRes, payRes, memRes] = await Promise.all([
    db
      .table("projects")
      .select("id, name, client_name, stage, lead_id")
      .order("created_at", { ascending: false }),
    // `contracts` has NO `kind` column — a CLIENT contract is `source = client`
    // (HANDOFF-V8 §11 on columns that do not exist), and `name`, not `title`.
    db.table("contracts").select("id, project_id, name, amount, source, created_by"),
    db
      .table("payments")
      .select("id, contract_id, milestone_id, direction, amount, paid_on, created_at, reversal_of")
      .eq("direction", "inflow"),
    // `org_members` has `display_name`, not `full_name`.
    db.table("org_members").select("id, user_id, display_name"),
  ]);
  if (projRes.error) throw projRes.error;
  if (conRes.error) throw conRes.error;
  if (payRes.error) throw payRes.error;
  if (memRes.error) throw memRes.error;

  const rawProjects = (projRes.data ?? []) as unknown as {
    id: string;
    name: string | null;
    client_name: string | null;
    stage: string | null;
    lead_id: string | null;
  }[];
  const allContracts = (conRes.data ?? []) as unknown as (ReceivableContract & {
    source: string;
    created_by: string | null;
  })[];
  const contracts = allContracts.filter((c) => c.source !== "vendor");
  const members = (memRes.data ?? []) as unknown as {
    id: string;
    user_id: string | null;
    display_name: string | null;
  }[];

  const nameByMemberId = new Map(members.map((m) => [m.id, m.display_name]));
  const nameByUserId = new Map(
    members.filter((m) => m.user_id).map((m) => [m.user_id as string, m.display_name]),
  );

  // The sales owner lives on the originating LEAD (`leads.sales_owner_id`);
  // `projects` has no such column. Read only the leads this tenant's projects
  // actually point at.
  const leadIds = rawProjects.map((p) => p.lead_id).filter((id): id is string => !!id);
  const leadRes = leadIds.length
    ? await db.table("leads").select("id, sales_owner_id").in("id", leadIds)
    : { data: [], error: null };
  if (leadRes.error) throw leadRes.error;
  const ownerByLead = new Map(
    ((leadRes.data ?? []) as unknown as { id: string; sales_owner_id: string | null }[]).map(
      (l) => [l.id, l.sales_owner_id],
    ),
  );

  // Whoever raised the client contract, as the weaker fallback the row labels.
  const raiserByProject = new Map<string, string | null>();
  for (const c of contracts) {
    if (!c.project_id || raiserByProject.has(c.project_id)) continue;
    raiserByProject.set(
      c.project_id,
      c.created_by ? (nameByUserId.get(c.created_by) ?? null) : null,
    );
  }

  const ids = contracts.map((c) => c.id);
  const msRes = ids.length
    ? await db.table("milestones").select("*").in("contract_id", ids)
    : { data: [], error: null };
  if (msRes.error) throw msRes.error;

  const milestoneRows = (msRes.data ?? []) as unknown as ReceivableMilestone[];
  const milestonesByContract = new Map<string, ReceivableMilestone[]>();
  for (const m of milestoneRows) {
    const list = milestonesByContract.get(m.contract_id) ?? [];
    list.push(m);
    milestonesByContract.set(m.contract_id, list);
  }
  for (const list of milestonesByContract.values()) {
    list.sort((a, b) => Number(a.seq) - Number(b.seq));
  }

  return {
    projects: rawProjects.map((p) => {
      const leadOwner = p.lead_id ? ownerByLead.get(p.lead_id) : null;
      const fromLead = leadOwner ? (nameByMemberId.get(leadOwner) ?? null) : null;
      const fromContract = raiserByProject.get(p.id) ?? null;
      return {
        id: p.id,
        name: p.name,
        clientName: p.client_name,
        salesOwner: fromLead ?? fromContract,
        salesOwnerSource: fromLead ? "lead" : fromContract ? "contract" : "none",
        stage: p.stage,
      } satisfies ReceivableProject;
    }),
    contracts,
    milestonesByContract,
    receipts: (payRes.data ?? []) as unknown as ReceivableReceipt[],
    // `written_off_at` arrives as a key only once 0042 has been applied. Asking
    // the ROWS rather than the schema keeps this a fact about what was read.
    writeOffAvailable:
      milestoneRows.length === 0 || milestoneRows.some((m) => "written_off_at" in m),
  };
}

/**
 * Write one milestone off: stop expecting the money, and say who said so, when,
 * and why.
 *
 * ⚠ NOT A DELETE, and not a zeroed amount. The milestone keeps its full value
 * forever; `written_off_at` is the only thing that changes, and the screen goes
 * on printing both figures. Migration 0042's CHECK makes a reasonless write-off
 * impossible in the database, not merely discouraged here.
 *
 * The caller has already been checked for `billing.payment.approve` — this is
 * somebody else's money and is nothing like self-service.
 */
export async function writeOffMilestone(input: {
  milestoneId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const parsed = validateWriteOff(input);
  if (!parsed.ok) return { error: parsed.error };

  const { db } = await withOrg();

  // Read the row BEFORE the update, so the audit ledger has a real `before`.
  const { data, error } = await db
    .table("milestones")
    .select("*")
    .eq("id", parsed.milestoneId)
    .maybeSingle();
  if (error) return { error: error.message };
  const before = data as unknown as ReceivableMilestone | null;
  if (!before) return { error: "That milestone no longer exists." };
  if (before.written_off_at) {
    return { error: "That milestone has already been written off." };
  }

  const acting = await getActingContext();
  const patch = {
    written_off_at: new Date().toISOString(),
    written_off_by: acting.member.id,
    write_off_reason: parsed.reason,
  };
  const upd = await db.table("milestones").updateById(parsed.milestoneId, patch);
  if (upd.error) return { error: upd.error.message };

  await recordAudit({
    entity: "milestones",
    entityId: parsed.milestoneId,
    action: "write_off",
    before: { written_off_at: null, write_off_reason: null, amount: before.amount },
    after: { written_off_at: patch.written_off_at, write_off_reason: patch.write_off_reason },
  });
  return {};
}

/**
 * Undo a write-off.
 *
 * A write-off is a decision, and a decision made in error must be reversible or
 * the screen becomes a one-way door somebody will avoid using. Nothing is
 * erased: the audit ledger keeps the original decision, its reason and the
 * person who made it, and this row records the restoration on top.
 */
export async function restoreMilestone(
  milestoneId: string,
): Promise<{ error?: string }> {
  const id = String(milestoneId ?? "").trim();
  if (!id) return { error: "Nothing to restore." };

  const { db } = await withOrg();
  const { data, error } = await db
    .table("milestones")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  const before = data as unknown as ReceivableMilestone | null;
  if (!before) return { error: "That milestone no longer exists." };
  if (!before.written_off_at) {
    return { error: "That milestone is not written off." };
  }

  const upd = await db.table("milestones").updateById(id, {
    written_off_at: null,
    written_off_by: null,
    write_off_reason: null,
  });
  if (upd.error) return { error: upd.error.message };

  await recordAudit({
    entity: "milestones",
    entityId: id,
    action: "write_off_restore",
    before: {
      written_off_at: before.written_off_at,
      write_off_reason: before.write_off_reason ?? null,
    },
    after: { written_off_at: null, write_off_reason: null },
  });
  return {};
}
