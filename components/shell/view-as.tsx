"use client";

import { useRef, useTransition } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { setActingMemberAction } from "@/app/(app)/actions";
import { ROLE_LABELS, asMemberRole, groupByRole } from "@/lib/workspace-model";
import type { Member } from "@/lib/data/team";

/**
 * "View as" — the stand-in for login while auth is removed.
 *
 * No passwords: pick Admin, Owner, Manager or a named Staff profile and the
 * whole app re-scopes to that person. The list is grouped by role so the three
 * tiers read at a glance. The chosen id is validated server-side against this
 * org's own membership list, so this can only ever move between people inside
 * one workspace.
 */
export function ViewAs({
  members,
  currentId,
  currentName,
  currentRole,
}: {
  members: Member[];
  currentId: string;
  currentName: string;
  currentRole: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();

  if (members.length < 2) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-[var(--color-ink-secondary)]">
        <UserRound className="size-4" />
        {currentName}
      </span>
    );
  }

  const groups = groupByRole(members);

  return (
    <form ref={formRef} action={setActingMemberAction} className="flex items-center gap-2">
      <span className="hidden text-[13px] text-[var(--color-ink-secondary)] sm:inline">
        View as
      </span>
      <div className="relative">
        <select
          name="memberId"
          defaultValue={currentId}
          disabled={pending}
          aria-label="View the workspace as"
          onChange={() => start(() => formRef.current?.requestSubmit())}
          className="h-8 appearance-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] pl-3 pr-8 text-[13px] font-medium text-[var(--color-ink)] outline-none focus:border-[var(--color-red)] disabled:opacity-60"
        >
          {groups.map((g) => (
            <optgroup key={g.role} label={g.label}>
              {g.people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.designation ? ` — ${m.designation}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-ink-secondary)]" />
      </div>
      <span className="hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-secondary)] md:inline">
        {ROLE_LABELS[asMemberRole(currentRole)]}
      </span>
    </form>
  );
}
