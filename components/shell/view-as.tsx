"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, UserRound } from "lucide-react";
import { setActingMemberAction } from "@/app/(app)/actions";
import { ROLE_LABELS, asMemberRole, groupByRole } from "@/lib/workspace-model";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/data/team";

/**
 * "View as" — the stand-in for login while auth is removed.
 *
 * No passwords: pick Admin, Owner, Manager or a named Staff profile and the
 * whole app re-scopes to that person. The chosen id is validated server-side
 * against this org's own membership list, so this can only ever move between
 * people inside one workspace — never a privilege-escalation path.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Why a popover and not a <select>.
 * ────────────────────────────────────────────────────────────────────────────
 * The previous version was an uncontrolled `<select defaultValue={currentId}>`.
 * React applies `defaultValue` on mount only, so after the server action set
 * the cookie and revalidatePath() re-rendered this layout, React reconciled the
 * SAME DOM node and the browser's dirty-value flag kept the stale selection:
 * the page said "Good morning, Rahul" while the picker still read "Meghana Rao".
 * The control lied about who you were, which read as the switch being broken.
 *
 * Every label below is derived from the `current*` props on each render, so it
 * cannot drift from the server's answer.
 */

/** First letters of the first two words — "Meghana Rao" → "MR". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ name, active }: { name: string; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
        active
          ? "border-[color-mix(in_srgb,var(--color-red)_30%,white)] bg-[var(--color-red-tint)] text-[var(--color-red-hover)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]",
      )}
    >
      {initials(name)}
    </span>
  );
}

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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  // A workspace of one has nobody to switch to — show the person, not a picker.
  if (members.length < 2) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-[var(--color-ink-secondary)]">
        <UserRound className="size-4" />
        {currentName}
      </span>
    );
  }

  const groups = groupByRole(members);

  /**
   * Set the cookie, then re-render the page we are already on.
   *
   * router.refresh() rather than the action calling revalidatePath("/", "layout"):
   * revalidating "/" re-runs app/page.tsx, which is a redirect() to /leads, so
   * the action's response carried that redirect and switching person threw you
   * off whatever page you were viewing. refresh() re-runs the CURRENT route's
   * server components with the new cookie and leaves you where you were.
   */
  function choose(id: string) {
    setOpen(false);
    if (id === currentId) return;
    start(async () => {
      const data = new FormData();
      data.set("memberId", id);
      await setActingMemberAction(data);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="hidden text-[13px] text-[var(--color-ink-secondary)] sm:inline">
          View as
        </span>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={pending}
            aria-label={`Viewing as ${currentName}. Change person.`}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-1 pr-3 text-left transition-colors",
              "hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-sunken)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-red)]",
              "disabled:opacity-60",
            )}
          >
            <Avatar name={currentName} active />
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] font-medium text-[var(--color-ink)]">
                {currentName}
              </span>
              <span className="text-[11px] text-[var(--color-ink-secondary)]">
                {ROLE_LABELS[asMemberRole(currentRole)]}
              </span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-[var(--color-ink-secondary)]" />
          </PopoverTrigger>

          <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
            <p className="border-b border-[var(--color-border)] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
              View the workspace as
            </p>
            <div className="max-h-[70vh] overflow-y-auto py-1">
              {groups.map((g) => (
                <div key={g.role} className="py-1">
                  <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-disabled)]">
                    {g.label}
                  </p>
                  {g.people.map((m) => {
                    const on = m.id === currentId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => choose(m.id)}
                        aria-current={on ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                          "hover:bg-[var(--color-surface-sunken)]",
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-red)]",
                          on && "bg-[var(--color-red-tint)]",
                        )}
                      >
                        <Avatar name={m.name} active={on} />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span
                            className={cn(
                              "truncate text-[13px] font-medium",
                              on
                                ? "text-[var(--color-red-hover)]"
                                : "text-[var(--color-ink)]",
                            )}
                          >
                            {m.name}
                          </span>
                          {m.designation && (
                            <span className="truncate text-[11px] text-[var(--color-ink-secondary)]">
                              {m.designation}
                            </span>
                          )}
                        </span>
                        {on && (
                          <Check className="ml-auto size-4 shrink-0 text-[var(--color-red)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
