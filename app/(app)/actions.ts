"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTING_COOKIE, listMembers } from "@/lib/data/team";

/**
 * TEMPORARY (login removed by owner request): the "View as" picker.
 *
 * Instead of signing in, the shell lets you act as any profile in this
 * workspace — Admin, Owner, Manager or a named Staff member — and every "my"
 * surface re-scopes to them. There are no passwords; these are profile rows,
 * not auth accounts.
 *
 * The chosen id is validated against listMembers(), which is itself org-scoped
 * by withOrg(), so this can only ever move between people inside one tenant —
 * it is not a way to reach another org's data. When auth returns, delete this
 * action and the cookie read in lib/data/team.ts.
 */

const schema = z.object({ memberId: z.string().min(1) });

export async function setActingMemberAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({ memberId: formData.get("memberId") });
  if (!parsed.success) return;

  const members = await listMembers();
  if (!members.some((m) => m.id === parsed.data.memberId)) return;

  const jar = await cookies();
  jar.set(ACTING_COOKIE, parsed.data.memberId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Every surface reads "my" data — re-render the whole app shell.
  revalidatePath("/", "layout");
}
