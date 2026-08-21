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
export async function getViewer(): Promise<Viewer | null> {
  const user = await getUser();
  if (!user) return null;

  const { data: member } = await admin
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!member) return null;

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
