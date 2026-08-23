import "server-only";
import { withOrg } from "./with-org";
import { connectRate } from "@/lib/interactions-model";
import type {
  Channel,
  Direction,
  Interaction,
  InteractionStatus,
} from "@/lib/interactions-model";

/**
 * Interactions data module — REQ-03 call logs / interaction layer.
 * Copies lib/data/leads.ts's shape exactly: no table is ever touched directly.
 * Everything goes through withOrg(), so org_id filtering/stamping is automatic
 * and cross-tenant leakage is impossible by construction.
 *
 * Client-safe enums/types live in @/lib/interactions-model (this file is
 * server-only).
 */
export { connectRate } from "@/lib/interactions-model";

export async function listInteractions(filter?: {
  channel?: string;
  leadId?: string;
}): Promise<Interaction[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("interactions").select("*");
  if (filter?.channel) q = q.eq("channel", filter.channel);
  if (filter?.leadId) q = q.eq("lead_id", filter.leadId);
  const { data, error } = await q.order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Interaction[];
}

export async function getLeadInteractions(
  leadId: string,
): Promise<Interaction[]> {
  return listInteractions({ leadId });
}

export async function logInteraction(input: {
  channel: Channel;
  direction: Direction;
  status: InteractionStatus;
  customerNo?: string | null;
  leadId?: string | null;
  durationSec?: number;
  disposition?: string | null;
  note?: string | null;
  occurredAt?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();
  const { data, error } = await db.table("interactions").insert({
    channel: input.channel,
    direction: input.direction,
    status: input.status,
    customer_no: input.customerNo ?? null,
    lead_id: input.leadId || null,
    duration_sec: Math.max(0, Math.floor(input.durationSec ?? 0)),
    disposition: input.disposition || null,
    note: input.note ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    agent_id: ctx.userId,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  const id = (data?.[0] as { id: string }).id;
  return { id };
}

export async function interactionStats(filter?: {
  channel?: string;
}): Promise<{
  total: number;
  connectRate: number;
  byChannel: Record<string, number>;
}> {
  const { db } = await withOrg();
  let q = db.table("interactions").select("channel,status");
  if (filter?.channel) q = q.eq("channel", filter.channel);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as { channel: string; status: string }[];

  const byChannel: Record<string, number> = {};
  for (const row of rows) {
    byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
  }

  return {
    total: rows.length,
    connectRate: connectRate(rows),
    byChannel,
  };
}
