import "server-only";
import { cache } from "react";
import { admin } from "@/lib/supabase/admin";
import type { TenantTable } from "./tables";

/**
 * TEMPORARY: login removed by owner request (auth to be implemented later). When
 * no authenticated session resolves, the app operates as this demo tenant so
 * every route is usable without logging in. To restore auth: make getOrgContext
 * throw when there is no user (see the block below) and restore the /login
 * redirect in app/(app)/layout.tsx.
 */
const DEMO_ORG_ID = "d46a53af-58b1-4ed7-87be-c675e5803802";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * withOrg — the ONE tenant-isolation accessor.
 * ────────────────────────────────────────────────────────────────────────────
 * With RLS OFF, this is the only thing preventing cross-tenant data leakage.
 * Feature code must never import the raw `admin` client; it goes through here.
 *
 *   Reads   → automatically filtered by `org_id`.
 *   Inserts → automatically stamped with `org_id`.
 *   Updates/Deletes → automatically scoped by `org_id` AND `id`.
 *
 * Usage (in a server action or route handler):
 *
 *   const { db, ctx } = await withOrg();
 *   const { data } = await db.table("leads").select().order("created_at", { ascending: false });
 *   await db.table("leads").insert({ name, phone });
 *   await db.table("leads").updateById(id, { status: "won" });
 */

export class NoOrgMembershipError extends Error {
  constructor() {
    super("The current user is not an active member of any organization.");
    this.name = "NoOrgMembershipError";
  }
}

export interface OrgContext {
  orgId: string;
  userId: string;
  role: string;
  memberId: string;
}

/**
 * Resolve the caller's active org membership. Throws if none.
 *
 * Wrapped in React `cache()`: withOrg() is called many times while rendering a
 * single page (e.g. quotations resolves it 16×). Without memoization each call
 * re-ran the auth validation + this org_members lookup, adding dozens of serial
 * network round-trips per navigation. cache() collapses them to one lookup per
 * request; it is request-scoped, so tenant isolation is unchanged.
 */
export const getOrgContext = cache(async function getOrgContext(): Promise<OrgContext> {
  // ⛔ TEMPORARY (login removed) — THE DEMO TENANT IS PINNED.
  //
  // This used to prefer the authenticated user's own membership and only fall
  // back to the demo tenant. With the password form gone there is no way to
  // choose an account, but a Supabase auth cookie from an earlier sign-up
  // SURVIVES in the browser — so whoever had one silently landed in their own
  // workspace instead of the demo. That is how the owner ended up looking at an
  // org literally named "1", with one project worth ₹10,000 and no leads, and
  // concluded the demo data was missing. It was not missing; they were in the
  // wrong tenant, and `ensureDemoProfiles()` had seeded that org with the same
  // person names, which made it look like the demo.
  //
  // The session picker at /login is now the only way in, and it offers exactly
  // one workspace, so the context must resolve to that same workspace for
  // everyone — cookie or no cookie. The auth branch is deliberately not
  // consulted while login is removed.
  //
  // TO RESTORE AUTH: put the `getUser()` lookup back ABOVE this block (see git
  // history for `9fda188`), and delete this note. Isolation is unchanged either
  // way — every read below is still filtered by whatever orgId resolves here.
  const { data: demo, error: demoErr } = await admin
    .from("org_members")
    .select("id, org_id, role, user_id")
    .eq("org_id", DEMO_ORG_ID)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (demoErr) throw demoErr;
  if (!demo) throw new NoOrgMembershipError();
  return {
    orgId: DEMO_ORG_ID,
    userId: demo.user_id as string,
    role: demo.role as string,
    memberId: demo.id as string,
  };
});

type SelectOptions = { count?: "exact" | "planned" | "estimated"; head?: boolean };

/** A single org-scoped table handle. Every operation is bound to `orgId`. */
function scopedTable(orgId: string, table: TenantTable) {
  return {
    /** Read builder, pre-filtered to this org. Chain .eq/.order/.range/.ilike etc. */
    select(columns = "*", options?: SelectOptions) {
      return admin.from(table).select(columns, options).eq("org_id", orgId);
    },
    /** Insert one or many rows; `org_id` is stamped on each. Returns the inserted rows. */
    insert<T extends Record<string, unknown>>(values: T | T[]) {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...v,
        org_id: orgId,
      }));
      return admin.from(table).insert(rows).select();
    },
    /** Update a single row by id, scoped to this org. */
    updateById(id: string, patch: Record<string, unknown>) {
      return admin
        .from(table)
        .update(patch)
        .eq("org_id", orgId)
        .eq("id", id)
        .select();
    },
    /** Hard delete a single row by id, scoped to this org. Prefer soft-delete flags where a table has them. */
    deleteById(id: string) {
      return admin.from(table).delete().eq("org_id", orgId).eq("id", id);
    },
  };
}

export interface OrgDb {
  orgId: string;
  table(name: TenantTable): ReturnType<typeof scopedTable>;
}

function makeOrgDb(orgId: string): OrgDb {
  return {
    orgId,
    table: (name) => scopedTable(orgId, name),
  };
}

/**
 * An org-scoped db for a caller with NO session that has proven its org another
 * way — today: a public share token resolved by token lookup. The caller MUST
 * derive `orgId` from the resolved token row and NEVER from user input. This
 * exists so public writes stay inside the one isolation accessor instead of
 * spreading raw `admin` through feature code.
 */
export function orgDbForVerifiedOrg(orgId: string): OrgDb {
  return makeOrgDb(orgId);
}

/** Resolve org context and hand back a scoped db. The primary entry point. */
export async function withOrg(): Promise<{ db: OrgDb; ctx: OrgContext }> {
  const ctx = await getOrgContext();
  return { db: makeOrgDb(ctx.orgId), ctx };
}
