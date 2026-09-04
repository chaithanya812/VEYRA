import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { admin } from "@/lib/supabase/admin";
import { withOrg } from "./with-org";
import { getSubscription } from "./subscription";
import { isOverLimit, remaining } from "@/lib/subscription-model";
import {
  canConfigureOrg,
  canManageTeam,
  isActiveMember,
  reportCounts,
  wouldCycle,
  type Member,
} from "@/lib/workspace-model";

/**
 * The team/membership module: who works here, and which of them is acting.
 *
 * Everything in the workspace hangs off `org_members.id`. A person is an
 * employee OF an org — the same human can be a member of several — so the
 * membership id, not the auth user id, is the unit "my tasks" is scoped by.
 *
 * Display names are resolved from the platform `app_users` table through the
 * admin client, which is allowed here because this file lives in lib/data
 * (same precedent as approvalUserNames / mrCreatorNames). A per-membership
 * `display_name` override on org_members wins when set, so a tenant can label
 * someone without touching their platform account.
 */

export type { Member };

const ACTING_COOKIE = "veyra_acting_member";

/**
 * Every active member of the caller's org, with names resolved.
 * Cached per request: the workspace reads this from several panels at once.
 */
const MEMBER_COLUMNS =
  "id, user_id, role, status, manager_id, display_name, designation";

/**
 * Resolve platform names/emails onto membership rows in one round-trip.
 * Shared by `listMembers` and `listAllMembers` so the two can never disagree
 * about what a person is called.
 */
async function withNames(
  rows: Omit<Member, "name" | "email">[],
): Promise<Member[]> {
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const names = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from("app_users")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const u of (users ?? []) as unknown as {
      id: string;
      full_name: string | null;
      email: string | null;
    }[]) {
      names.set(u.id, { full_name: u.full_name, email: u.email });
    }
  }

  return rows.map((r) => {
    const u = names.get(r.user_id);
    const name =
      r.display_name?.trim() ||
      u?.full_name?.trim() ||
      u?.email?.split("@")[0] ||
      "Member";
    return { ...r, name, email: u?.email ?? null };
  });
}

export const listMembers = cache(async function listMembers(): Promise<Member[]> {
  await ensureDemoProfiles(); // TEMPORARY (login removed) — see below
  const { db } = await withOrg();
  const { data, error } = await db
    .table("org_members")
    .select(MEMBER_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;

  return withNames((data ?? []) as unknown as Omit<Member, "name" | "email">[]);
});

/**
 * Every membership in the org, ACTIVE AND DEACTIVATED.
 *
 * `listMembers` filters to active because that is what an assignee picker or a
 * team board means by "the team". `/settings/users` is the one screen that has
 * to see the other half — the Deactivated tab is literally a read of
 * `org_members.status` — and the reporting-line guard has to walk the whole
 * graph, including a manager who has since been deactivated, or a cycle
 * through that person would be invisible to `wouldCycle`.
 */
export const listAllMembers = cache(async function listAllMembers(): Promise<Member[]> {
  await ensureDemoProfiles();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("org_members")
    .select(MEMBER_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return withNames((data ?? []) as unknown as Omit<Member, "name" | "email">[]);
});

/**
 * TEMPORARY (login removed): the workspace needs more than one person to be
 * worth looking at — "my tasks" versus "the team's tasks" is meaningless with a
 * headcount of one. When a workspace has fewer than two members we seed a small
 * set of profile rows so the View-as picker has Admin / Owner / Manager / Staff
 * to switch between.
 *
 * These are PROFILE rows on org_members only. They have no auth account and no
 * password — `user_id` is a standalone uuid, not a login. A tenant that has
 * added real people never trips this branch. Delete this function when auth
 * returns and people are invited properly.
 */
const DEMO_PROFILES: {
  role: string;
  display_name: string;
  designation: string;
}[] = [
  { role: "admin", display_name: "Chaithanya V", designation: "Platform admin" },
  { role: "manager", display_name: "Meghana Rao", designation: "Projects manager" },
  { role: "member", display_name: "Rahul Verma", designation: "Sales executive" },
  { role: "member", display_name: "Sneha Iyer", designation: "Interior designer" },
  { role: "member", display_name: "Karthik Nair", designation: "Site supervisor" },
];

export const ensureDemoProfiles = cache(async function ensureDemoProfiles(): Promise<void> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("org_members")
    .select("id, display_name, designation")
    .eq("status", "active");
  if (error) return;
  const rows = (data ?? []) as unknown as {
    id: string;
    display_name: string | null;
    designation: string | null;
  }[];
  if (rows.length >= 2) return; // a real team exists — never touch it

  // Give the founding membership a name so it reads as a person, not a uuid.
  const first = rows[0];
  if (first && !first.display_name) {
    await db.table("org_members").updateById(first.id, {
      display_name: "Aditi Pradhan",
      designation: first.designation ?? "Founder",
    });
  }

  await db.table("org_members").insert(
    DEMO_PROFILES.map((p) => ({
      user_id: crypto.randomUUID(), // a profile id, NOT an auth account
      role: p.role,
      status: "active",
      display_name: p.display_name,
      designation: p.designation,
    })),
  );
});

export interface ActingContext {
  /** The membership acting right now — what "my" means on every panel. */
  member: Member;
  /** True when this member may see the team view and approve things. */
  isManager: boolean;
  /**
   * TEMPORARY: true while login is removed, meaning the acting member came
   * from a switcher cookie rather than a real session. The UI shows the
   * switcher only in this mode; restoring auth turns it off everywhere.
   */
  impersonating: boolean;
}

/**
 * Resolve who is acting.
 *
 * With auth in place this is simply the caller's own membership. While login is
 * removed (see lib/data/with-org.ts), every visitor resolves to the same demo
 * membership, which would make "my workspace" and "the team's workspace"
 * indistinguishable — so a cookie may name a different member to act as.
 *
 * The cookie is NOT a privilege escalation path: the named id must already be
 * an active member of the caller's own org (that list is itself org-scoped by
 * withOrg), so it can only ever move between people inside one tenant. When
 * auth returns, delete the cookie branch and this collapses to ctx.memberId.
 */
export const getActingContext = cache(async function getActingContext(): Promise<ActingContext> {
  const { ctx } = await withOrg();
  const members = await listMembers();

  const self =
    members.find((m) => m.id === ctx.memberId) ??
    members[0] ??
    ({
      id: ctx.memberId,
      user_id: ctx.userId,
      role: ctx.role,
      status: "active",
      manager_id: null,
      display_name: null,
      designation: null,
      name: "Member",
      email: null,
    } satisfies Member);

  let member = self;
  let impersonating = false;

  const jar = await cookies();
  const wanted = jar.get(ACTING_COOKIE)?.value;
  if (wanted && wanted !== self.id) {
    // Only ever a member of THIS org — members[] is already org-scoped.
    const target = members.find((m) => m.id === wanted);
    if (target) {
      member = target;
      impersonating = true;
    }
  }

  return { member, isManager: canManageTeam(member.role), impersonating };
});

/** Convenience: the acting membership id, for scoping "my" queries. */
export async function actingMemberId(): Promise<string> {
  return (await getActingContext()).member.id;
}

/** Name lookup for rendering assignee/approver columns. */
export async function memberNames(): Promise<Record<string, string>> {
  const members = await listMembers();
  const map: Record<string, string> = {};
  for (const m of members) map[m.id] = m.name;
  return map;
}

/** Update a member's tenant-local label and designation (manager action). */
export async function updateMemberProfile(
  memberId: string,
  input: { display_name?: string | null; designation?: string | null; role?: string },
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const patch: Record<string, unknown> = {};
  if (input.display_name !== undefined) patch.display_name = input.display_name?.trim() || null;
  if (input.designation !== undefined) patch.designation = input.designation?.trim() || null;
  if (input.role !== undefined) patch.role = input.role;
  if (Object.keys(patch).length === 0) return {};
  const { error } = await db.table("org_members").updateById(memberId, patch);
  return error ? { error: error.message } : {};
}

/* ── The Users screen (`/settings/users`) ─────────────────────────────────── */

export interface UsersBoard {
  /** Every membership, active and deactivated, in join order. */
  members: Member[];
  /** id → number of direct reports, so the table can say who is a manager. */
  reports: Record<string, number>;
  counts: { total: number; active: number; invited: number; deactivated: number };
  /**
   * Seats. `licensed` is `plans.limits.users` — a REAL number from the plan
   * this org is on, not an invented "purchased licences" figure. `null` means
   * the plan does not cap users, and the screen says "Unlimited" rather than
   * printing a zero that would read as "none left".
   */
  seats: {
    planName: string | null;
    licensed: number | null;
    free: number | null;
    over: boolean;
  };
  actor: { id: string; name: string; role: string };
  canEdit: boolean;
}

/**
 * Everything `/settings/users` renders. Assembled here, computed nowhere:
 * the counts come from `reportCounts` and the seat arithmetic from
 * `remaining` / `isOverLimit` in `lib/subscription-model.ts`, which the
 * billing page already uses — one answer to "how many seats are left", not two.
 */
export async function getUsersBoard(): Promise<UsersBoard> {
  const [members, acting, { plan }] = await Promise.all([
    listAllMembers(),
    getActingContext(),
    getSubscription(),
  ]);

  const counts = { total: members.length, active: 0, invited: 0, deactivated: 0 };
  for (const m of members) {
    if (isActiveMember(m.status)) counts.active += 1;
    else if (m.status === "invited") counts.invited += 1;
    else counts.deactivated += 1;
  }

  const licensed = plan?.limits?.users ?? null;
  return {
    members,
    reports: reportCounts(members),
    counts,
    seats: {
      planName: plan?.name ?? null,
      licensed,
      free: remaining(licensed, counts.active),
      over: isOverLimit(licensed, counts.active),
    },
    actor: { id: acting.member.id, name: acting.member.name, role: acting.member.role },
    canEdit: canConfigureOrg(acting.member.role),
  };
}

/* ── The reporting line (`/settings/users`) ───────────────────────────────── */

/**
 * Point one member at their manager, or clear the pointer with `null`.
 *
 * **`org_members_manager_id_fkey` is `FOREIGN KEY (manager_id) REFERENCES
 * org_members(id)` — it does NOT require the manager to share the row's
 * `org_id`.** Postgres would happily let a Gurugram firm's member report to a
 * Hyderabad firm's manager. (The same hole exists on `wfh_requests.decided_by`
 * and `leave_requests.decided_by`; closing it is migration 0035's job, not
 * this writer's.) So the same-org rule is enforced HERE, and the mechanism is
 * that both ids must appear in `listAllMembers()`, which is already scoped by
 * `withOrg()` — membership of that list IS the proof, rather than a second
 * hand-written `org_id` comparison that could drift from it.
 *
 * The cycle guard is `wouldCycle` from `lib/workspace-model.ts`, run over the
 * WHOLE membership (deactivated people included, or a loop through somebody
 * who has left would be invisible). The picker hides the same options, but a
 * hidden option is a courtesy and this is the control.
 */
export async function setMemberManager(
  memberId: string,
  managerId: string | null,
): Promise<{ error?: string }> {
  const acting = await getActingContext();
  // TODO(§11.3): Unit 5/6 replace this coarse tier check with
  // `can("settings", "edit", …)`. Until then the org-config tier is the guard,
  // and it is applied in the WRITER, not only on the screen.
  if (!canConfigureOrg(acting.member.role)) {
    return { error: "Only an owner or admin can change the reporting line." };
  }

  const members = await listAllMembers();
  const member = members.find((m) => m.id === memberId);
  if (!member) return { error: "That person is not a member of this workspace." };

  const next = managerId?.trim() || null;
  if (next) {
    const manager = members.find((m) => m.id === next);
    // Same-org, said as itself: the FK does not check this, so the refusal
    // must name the real cause rather than a friendlier different one.
    if (!manager) {
      return { error: "That manager is not a member of this workspace." };
    }
    if (!isActiveMember(manager.status)) {
      return { error: `${manager.name} is not active, so they cannot be somebody's manager.` };
    }
    if (next === memberId) {
      return { error: `${member.name} cannot report to themselves.` };
    }
    if (wouldCycle(members, memberId, next)) {
      return {
        error: `${manager.name} already reports to ${member.name}, directly or through somebody else — that would make a loop.`,
      };
    }
  }

  const { db } = await withOrg();
  const { error } = await db.table("org_members").updateById(memberId, {
    manager_id: next,
  });
  return error ? { error: error.message } : {};
}

/**
 * Activate or deactivate a membership.
 *
 * A STATUS CHANGE, never a delete — `deleteById` is not on this path and never
 * will be. A membership is what every task, session, leave request and
 * decision in the workspace points at; removing the row would orphan or
 * cascade away somebody's whole history.
 *
 * Deactivating somebody who still has direct reports is REFUSED, because it
 * would leave those people reporting to a person nobody can approve through.
 * Postgres agrees, incidentally: the self-FK has no `on delete` clause, so it
 * refuses to remove a manager who still has reports either.
 */
export async function setMemberStatus(
  memberId: string,
  status: "active" | "disabled",
): Promise<{ error?: string }> {
  const acting = await getActingContext();
  if (!canConfigureOrg(acting.member.role)) {
    return { error: "Only an owner or admin can activate or deactivate a member." };
  }

  const members = await listAllMembers();
  const member = members.find((m) => m.id === memberId);
  if (!member) return { error: "That person is not a member of this workspace." };

  if (status === "disabled") {
    if (memberId === acting.member.id) {
      return { error: "You cannot deactivate the membership you are signed in as." };
    }
    const reports = reportCounts(members)[memberId] ?? 0;
    if (reports > 0) {
      return {
        error: `${member.name} still has ${reports} direct report${
          reports === 1 ? "" : "s"
        }. Move them to another manager first.`,
      };
    }
  }

  const { db } = await withOrg();
  const { error } = await db.table("org_members").updateById(memberId, { status });
  return error ? { error: error.message } : {};
}

export { ACTING_COOKIE };
