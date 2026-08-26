import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { admin } from "@/lib/supabase/admin";
import { withOrg } from "./with-org";
import { canManageTeam, type Member } from "@/lib/workspace-model";

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
export const listMembers = cache(async function listMembers(): Promise<Member[]> {
  await ensureDemoProfiles(); // TEMPORARY (login removed) — see below
  const { db } = await withOrg();
  const { data, error } = await db
    .table("org_members")
    .select("id, user_id, role, status, manager_id, display_name, designation")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Omit<Member, "name" | "email">[];
  if (rows.length === 0) return [];

  // Resolve display names from the platform table in one round-trip.
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

export { ACTING_COOKIE };
