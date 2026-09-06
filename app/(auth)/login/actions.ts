"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTING_COOKIE, listMembers } from "@/lib/data/team";

/**
 * TEMPORARY (login removed by owner request) — the demo session gate.
 *
 * A client is evaluating the product, so the app needs a front door without
 * needing accounts: pick a person, and the whole workspace runs as them. There
 * are no passwords because there are no auth accounts behind these rows — they
 * are `org_members` profiles, and the session is one cookie naming one of them.
 *
 * ⛔ NOT an authentication boundary, and it must never be sold as one. The id
 * is validated against `listMembers()`, which is itself org-scoped by
 * `withOrg()`, so a chosen id can only ever be someone inside this one tenant —
 * it cannot reach another org's data. But anyone with the URL can pick Owner.
 * When real auth returns, delete this directory and the cookie read in
 * `lib/data/team.ts`, and restore the password form from git history.
 *
 * Server-action file: every export is an async function (§2 rule 11).
 */

const schema = z.object({ memberId: z.string().min(1) });

/** Thirty days — long enough that a client evaluating over a fortnight stays in. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Start a session as one member. Consumed as `<form action={...}>`, so it
 * returns void and reports failure by re-rendering the picker rather than by
 * throwing a screen away.
 */
export async function startSessionAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({ memberId: formData.get("memberId") });
  if (!parsed.success) redirect("/login?error=pick");

  // Only ever a member of THIS org — listMembers() is org-scoped by withOrg().
  const members = await listMembers();
  if (!members.some((m) => m.id === parsed.data.memberId)) {
    redirect("/login?error=gone");
  }

  const jar = await cookies();
  jar.set(ACTING_COOKIE, parsed.data.memberId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // The workspace, not the leads list: a session that has just started should
  // open on "your work today", which is what the person actually signed in for.
  redirect("/dashboard");
}

/** End the session and return to the picker. */
export async function endSessionAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTING_COOKIE);
  redirect("/login");
}
