import "server-only";
import { admin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth/session";

export interface Viewer {
  userId: string;
  email: string | null;
  orgId: string;
  orgName: string;
  role: string;
}

/**
 * The current viewer with their org, or null. Used by the app layout to gate
 * access and render the shell. Composes the verified auth user with their
 * active org membership + org name.
 */
/**
 * TEMPORARY: login removed by owner request. When there is no authenticated
 * session, resolve the demo tenant so the shell renders without a login. Restore
 * auth by returning null here (and the layout's /login redirect will re-engage).
 */
const DEMO_ORG_ID = "d46a53af-58b1-4ed7-87be-c675e5803802";

export async function getViewer(): Promise<Viewer | null> {
  const user = await getUser();

  // Authenticated path: the user's own active membership.
  if (user) {
    const { data: member } = await admin
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (member) {
      const { data: org } = await admin
        .from("orgs")
        .select("name")
        .eq("id", member.org_id)
        .single();
      return {
        userId: user.id,
        email: user.email,
        orgId: member.org_id as string,
        orgName: (org?.name as string) ?? "—",
        role: member.role as string,
      };
    }
  }

  // No session → demo tenant (login removed; see note above).
  const { data: demo } = await admin
    .from("org_members")
    .select("org_id, role, user_id")
    .eq("org_id", DEMO_ORG_ID)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!demo) return null;
  const { data: org } = await admin
    .from("orgs")
    .select("name")
    .eq("id", DEMO_ORG_ID)
    .single();
  return {
    userId: demo.user_id as string,
    email: user?.email ?? "demo@veyra.app",
    orgId: DEMO_ORG_ID,
    orgName: (org?.name as string) ?? "Demo",
    role: demo.role as string,
  };
}
