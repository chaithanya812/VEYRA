import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data/context";
import { getActingContext, listMembers } from "@/lib/data/team";
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
  const [acting, members] = await Promise.all([getActingContext(), listMembers()]);

  return (
    <div className="flex h-screen overflow-hidden">
      <SideNav />
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
