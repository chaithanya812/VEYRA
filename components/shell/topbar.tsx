import { ViewAs } from "./view-as";
import type { Member } from "@/lib/data/team";

/**
 * The app chrome. While login is removed (owner request) the right-hand side
 * carries the "View as" picker instead of an account menu — pick a profile and
 * the whole workspace re-scopes to that person. When auth returns, swap this
 * back for the signed-in user + sign-out control.
 */
export function TopBar({
  orgName,
  members,
  currentId,
  currentName,
  currentRole,
}: {
  orgName: string;
  members: Member[];
  currentId: string;
  currentName: string;
  currentRole: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <span className="truncate text-sm font-semibold text-[var(--color-ink)]">
        {orgName}
      </span>
      <ViewAs
        members={members}
        currentId={currentId}
        currentName={currentName}
        currentRole={currentRole}
      />
    </header>
  );
}
