import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data/context";
import { SideNav } from "@/components/shell/sidenav";
import { TopBar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <SideNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar orgName={viewer.orgName} userEmail={viewer.email} />
        <main className="flex-1 overflow-y-auto bg-[var(--color-surface-sunken)] p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
