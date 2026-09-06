import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data/context";
import { ACTING_COOKIE, getActingContext, listMembers } from "@/lib/data/team";
import { SideNav } from "@/components/shell/sidenav";
import { TopBar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  // Who is acting, and who else could be. Both are request-cached, so the
  // panels below reuse these reads rather than issuing their own.
  const [acting, members, jar] = await Promise.all([
    getActingContext(),
    listMembers(),
    cookies(),
  ]);

  // TEMPORARY (login removed) — the demo session gate. `getActingContext()`
  // falls back to the first member when no cookie is set, which is what keeps
  // every route usable without auth; that fallback also means a client opening
  // a deep link would silently land inside the app as somebody. Requiring the
  // cookie HERE, rather than only on `/`, means every route goes through the
  // picker once — a shared link to /quotations still asks who you are.
  if (!jar.get(ACTING_COOKIE)?.value) redirect("/login");

  // Read on the server so a collapsed rail renders at 64px on the first paint
  // instead of snapping in after hydration.
  const navCollapsed = jar.get("veyra_nav_collapsed")?.value === "1";

  return (
    <div className="flex h-screen overflow-hidden">
      <SideNav defaultCollapsed={navCollapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          orgName={viewer.orgName}
          members={members}
          currentId={acting.member.id}
          currentName={acting.member.name}
          currentRole={acting.member.role}
        />
        <main className="flex-1 overflow-y-auto bg-[var(--color-surface-sunken)] p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
