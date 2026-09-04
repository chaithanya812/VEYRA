"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestLeave } from "@/lib/data/workspace";
import { decideRequest, requestWfh } from "@/lib/data/hr";
import { LEGACY_WFH_LEAVE_TYPE } from "@/lib/hr-model";

/**
 * `/hr/attendance` server actions. This file exports async functions only —
 * a `const` exported from a module a client component imports is a client
 * reference on the server, and the vocabulary it would carry belongs in
 * `lib/hr-model.ts` anyway.
 */

export type HrFormState = { error?: string; ok?: boolean; id?: string } | undefined;

const applySchema = z.object({
  kind: z.string().trim().min(1),
  from_date: z.string().trim().min(1, "Pick a start date."),
  to_date: z.string().trim().min(1, "Pick an end date."),
  reason: z.string().trim().max(1000).optional().nullable(),
});

/**
 * The frame's one `Apply (Leave/WFH)` button, and therefore one action over
 * two tables. `kind = "wfh"` writes `wfh_requests`; anything else is a
 * `leave_type` and writes `leave_requests`.
 *
 * The legacy `wfh` leave-type slug is REFUSED rather than accepted quietly.
 * 0023 seeded it, rows still carry it, and the screen shows those rows on the
 * WFH tab — but writing a NEW one would deepen a collision the owner has not
 * yet decided how to close (HANDOFF §10.5), and the caller means the real
 * thing, which now has its own table.
 */
export async function applyLeaveAction(
  _prev: HrFormState,
  formData: FormData,
): Promise<HrFormState> {
  const parsed = applySchema.safeParse({
    kind: formData.get("kind") || "casual",
    from_date: formData.get("from_date"),
    to_date: formData.get("to_date"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { kind, from_date, to_date, reason } = parsed.data;

  if (kind === "wfh_request") {
    const r = await requestWfh({ from_date, to_date, reason });
    if (r.error) return { error: r.error };
    revalidatePath("/hr/attendance");
    return { ok: true, id: r.id };
  }

  if (kind === LEGACY_WFH_LEAVE_TYPE) {
    return {
      error:
        "Work from home is applied for as itself, not as a leave type — pick “Work from home”.",
    };
  }

  const r = await requestLeave({ leave_type: kind, from_date, to_date, reason });
  if (r.error) return { error: r.error };
  revalidatePath("/hr/attendance");
  return { ok: true, id: r.id };
}

/* ── The approvals queue (`/hr/attendance/admin`, frame `110339`) ─────────── */

const decideSchema = z.object({
  source: z.enum(["leave_requests", "wfh_requests"]),
  id: z.string().uuid("Invalid request"),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(2000, "Keep the reason under 2000 characters").optional(),
});

/**
 * Approve or deny one request, over either table.
 *
 * ONE action, because `wfh_requests` mirrors `leave_requests` exactly so that
 * approvals could be one code path. `source` says which table; every rule
 * beyond that — the manager guard and the reason a denial must carry — lives
 * in `lib/data/hr.ts::decideRequest` and, for leave, in the `decideLeave`
 * writer that already existed. Nothing is re-implemented here.
 *
 * A decision is a status change plus `decided_by` / `decided_at`. There is no
 * delete on this path and no `.delete()` anywhere near it: a denied request
 * stays readable, with its reason, which is the whole point of writing one.
 */
export async function decideRequestAction(
  _prev: HrFormState,
  formData: FormData,
): Promise<HrFormState> {
  const parsed = decideSchema.safeParse({
    source: formData.get("source"),
    id: formData.get("id"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { source, id, decision, note } = parsed.data;
  const r = await decideRequest(source, id, decision, note);
  if (r.error) return { error: r.error };

  revalidatePath("/hr/attendance/admin");
  revalidatePath("/hr/attendance");
  return { ok: true, id };
}
