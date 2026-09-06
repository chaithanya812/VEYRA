import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data/context";
import { ACTING_COOKIE } from "@/lib/data/team";

/**
 * The front door. While login is removed (owner request), a session is one
 * cookie naming a member — so "signed in" means that cookie exists, and the
 * picker at /login is what sets it. Landing goes to the workspace rather than
 * the leads list: a session that has just started opens on "your work today".
 */
export default async function Home() {
  const [viewer, jar] = await Promise.all([getViewer(), cookies()]);
  if (!viewer) redirect("/login");
  redirect(jar.get(ACTING_COOKIE)?.value ? "/dashboard" : "/login");
}
