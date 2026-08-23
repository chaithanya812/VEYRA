import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { listPermissions, listRoles } from "@/lib/data/config";
import type { Role } from "@/lib/permissions-model";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusChip,
} from "@/components/ui/primitives";
import { PermissionMatrix } from "./permission-matrix";

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: requestedRole } = await searchParams;
  const roles = await listRoles();
  const active: Role | null =
    roles.find((r) => r.id === requestedRole) ?? roles[0] ?? null;
  const permissions = active ? await listPermissions(active.id) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to settings
      </Link>
      <PageHeader
        title="Roles & permissions"
        subtitle="What each role may do, and how far the grant reaches — no opaque labels, one explicit matrix."
      />

      {roles.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="No roles yet"
          description="An Owner role is created when your organisation is provisioned. Invite teammates to add more roles."
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[240px_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--color-border)] px-4 py-3 text-[13px] font-medium text-[var(--color-ink-secondary)]">
              Roles
            </div>
            <ul>
              {roles.map((r) => {
                const selected = active?.id === r.id;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/settings/roles?role=${r.id}`}
                      aria-current={selected ? "true" : undefined}
                      className={
                        "flex items-center justify-between gap-2 border-l-2 px-4 py-2.5 text-sm transition-colors " +
                        (selected
                          ? "border-[var(--color-red)] bg-[var(--color-red-tint)] font-medium text-[var(--color-red-hover)]"
                          : "border-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]")
                      }
                    >
                      <span>{r.name}</span>
                      {r.is_system && (
                        <StatusChip tone="neutral" label="System" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          {active && (
            <PermissionMatrix
              roleId={active.id}
              roleName={active.name}
              permissions={permissions}
            />
          )}
        </div>
      )}
    </div>
  );
}
