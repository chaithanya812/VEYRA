import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { listRoleDetails, roleCapabilities, type RoleDetail } from "@/lib/data/roles";
import { can } from "@/lib/data/permissions";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { PermissionLimited } from "@/components/ui/permission-limited";
import { DeleteRoleButton, RoleEditor } from "./role-editor";

/**
 * Roles & permissions — frames `110403` and `110413`–`110429`.
 *
 * This screen is the reason the permission spine exists as a product rather
 * than as plumbing. Before it, `lib/can-model.ts` and the 134 guards were real
 * but unreachable: a tenant could not author a single role, so every member
 * fell back to the four-value `org_members.role` tier.
 *
 * The selected role comes from `searchParams` on the SERVER, never from an
 * effect — otherwise the page server-renders the wrong role and cannot be
 * verified by fetching HTML.
 */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: requestedRole } = await searchParams;

  // Reading roles is its own capability. Somebody who cannot see the matrix
  // gets a designed limited state, not a 404 that claims the page is missing.
  if (!(await can("settings.role.view"))) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Roles & permissions" />
        <PermissionLimited capability="settings.role.view" />
      </div>
    );
  }

  const canEdit = await can("settings.role.edit");
  const roles = await listRoleDetails();
  const active: RoleDetail | null =
    roles.find((r) => r.id === requestedRole) ?? roles[0] ?? null;

  const caps = active
    ? await roleCapabilities(active.id)
    : { own: [], inherited: [], error: null, all: false };

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
        subtitle="What each role may do — the same list the server checks, so a tick here is the control, not a label for one."
      />

      {roles.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="No roles yet"
          description="An Owner role is created when your organisation is provisioned."
        />
      ) : (
        <>
          <RoleEditor
            roles={roles}
            active={active}
            own={caps.own}
            inherited={caps.inherited}
            chainError={caps.error}
            grantsAll={caps.all}
            canEdit={canEdit}
          />

          {active && !active.is_system && canEdit && (
            <div className="mt-6 border-t border-[var(--color-border)] pt-4">
              <DeleteRoleButton role={active} />
              <p className="mt-1.5 text-[12px] text-[var(--color-ink-secondary)]">
                A role that people still hold cannot be deleted — move them
                first. Roles inheriting from this one are kept and simply stop
                inheriting.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
