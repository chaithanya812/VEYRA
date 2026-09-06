import { LogOut } from "lucide-react";
import { ViewAs } from "./view-as";
import { endSessionAction } from "@/app/(auth)/login/actions";
import type { Member } from "@/lib/data/team";

/**
 * The app chrome. While login is removed (owner request) the right-hand side
 * carries the "View as" picker instead of an account menu — pick a profile and
 * the whole workspace re-scopes to that person. When auth returns, swap this
 * back for the signed-in user + sign-out control.
 *
 * "End session" sits beside it and drops the session cookie, which returns the
 * client to the picker at /login. View-as switches WITHIN a session and stays
 * on the current page; ending one starts over. Two different things, so two
 * controls rather than one overloaded menu.
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
      <div className="flex items-center gap-2">
        <ViewAs
          members={members}
          currentId={currentId}
          currentName={currentName}
          currentRole={currentRole}
        />
        {/* Not destructive — it ends a demo session, it deletes nothing — so
            grey, not red (§2 rule 7 keeps red to its five jobs). */}
        <form action={endSessionAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
          >
            <LogOut aria-hidden className="size-3.5" />
            End session
          </button>
        </form>
      </div>
    </header>
  );
}
