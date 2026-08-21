import "server-only";
import { admin } from "@/lib/supabase/admin";

/**
 * Tenant onboarding / provisioning (Wave 0).
 * Creates a confirmed auth user, their org, a default branch, the owner role,
 * and the owner membership — the seed every new tenant needs. Allowed to use
 * the admin client because it lives in lib/data.
 */

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "org"}-${suffix}`;
}

export async function createUserAndOrg(input: {
  email: string;
  password: string;
  fullName: string;
  orgName: string;
}): Promise<{ userId: string; orgId: string }> {
  // 1. Confirmed auth user (skip email verification for a frictionless start).
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (userErr || !created.user) {
    throw new Error(userErr?.message ?? "Could not create user");
  }
  const userId = created.user.id;

  try {
    // 2. Profile mirror.
    await admin.from("app_users").insert({
      id: userId,
      email: input.email,
      full_name: input.fullName,
    });

    // 3. Org.
    const { data: org, error: orgErr } = await admin
      .from("orgs")
      .insert({ name: input.orgName, slug: slugify(input.orgName) })
      .select("id")
      .single();
    if (orgErr || !org) throw new Error(orgErr?.message ?? "Could not create org");
    const orgId = org.id as string;

    // 4. Default branch, owner role, owner membership.
    await admin.from("branches").insert({
      org_id: orgId,
      name: "Head Office",
      code: "HO",
      is_default: true,
    });
    await admin.from("roles").insert({
      org_id: orgId,
      name: "Owner",
      is_system: true,
      permissions: { all: true },
    });
    await admin.from("org_members").insert({
      org_id: orgId,
      user_id: userId,
      role: "owner",
      status: "active",
    });

    return { userId, orgId };
  } catch (err) {
    // Roll back the auth user if org provisioning failed, so retry is clean.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw err;
  }
}
