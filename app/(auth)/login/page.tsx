import { ArrowRight, Info } from "lucide-react";
import { listMembers } from "@/lib/data/team";
import { getViewer } from "@/lib/data/context";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  asMemberRole,
  groupByRole,
} from "@/lib/workspace-model";
import { startSessionAction } from "./actions";

/**
 * The demo front door. Pick a person, get their workspace.
 *
 * There is no password because there is no account: these are `org_members`
 * profile rows, and "signing in" is one cookie naming one of them (see
 * ./actions.ts, which is explicit that this is not an auth boundary).
 *
 * The point of the screen is the ROLE, not the person — a client evaluating
 * VEYRA wants to see what an Owner sees and then what Staff sees. So people are
 * grouped under their tier with that tier's description printed once above
 * them, using the same `ROLE_LABELS` / `ROLE_DESCRIPTIONS` the View-as picker
 * and the Users screen use, so all three cannot drift.
 *
 * Red discipline (§2 rule 7): every card here is an equal primary action, so
 * none of them is red — red would have to be spent a dozen times on one screen.
 * The cards are neutral and take a red ring on hover/focus, which is the
 * accent doing its "this is the control you are on" job exactly once.
 */

export const dynamic = "force-dynamic";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, members, viewer] = await Promise.all([
    searchParams,
    listMembers(),
    getViewer(),
  ]);
  const groups = groupByRole(members);

  return (
    <main className="min-h-screen bg-[var(--color-surface-sunken)] px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          <span className="text-3xl font-bold tracking-tight text-[var(--color-ink)]">
            VEYRA
          </span>
          <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
            {viewer?.orgName ?? "Demo workspace"}
          </p>
          <h1 className="mt-6 text-xl font-semibold text-[var(--color-ink)]">
            Who are you signing in as?
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-ink-secondary)]">
            Pick a person to start a session. The whole app re-scopes to them —
            their work, their numbers, their permissions.
          </p>
        </header>

        {error && (
          <p
            role="alert"
            className="mb-6 rounded-md border border-[var(--color-amber)] bg-[var(--color-amber-tint)] px-4 py-2.5 text-center text-sm text-[var(--color-amber)]"
          >
            {error === "gone"
              ? "That person is no longer in this workspace. Pick someone else."
              : "Pick a person to continue."}
          </p>
        )}

        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.role}>
              <div className="mb-2.5 flex items-baseline gap-2.5">
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  {group.label}
                </h2>
                <p className="text-xs text-[var(--color-ink-secondary)]">
                  {ROLE_DESCRIPTIONS[group.role]}
                </p>
              </div>

              <ul className="grid gap-2.5 sm:grid-cols-2">
                {group.people.map((m) => (
                  <li key={m.id}>
                    <form action={startSessionAction}>
                      <input type="hidden" name="memberId" value={m.id} />
                      <button
                        type="submit"
                        className="group flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left transition-colors hover:border-[var(--color-red)] focus-visible:border-[var(--color-red)]"
                      >
                        <span
                          aria-hidden
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-surface-sunken)] text-xs font-semibold text-[var(--color-ink-secondary)]"
                        >
                          {initials(m.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                            {m.name}
                          </span>
                          <span className="block truncate text-xs text-[var(--color-ink-secondary)]">
                            {m.designation?.trim() ||
                              ROLE_LABELS[asMemberRole(m.role)]}
                          </span>
                        </span>
                        <ArrowRight
                          aria-hidden
                          className="size-4 shrink-0 text-[var(--color-ink-disabled)] transition-colors group-hover:text-[var(--color-red)]"
                        />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 flex items-start justify-center gap-2 text-center text-xs text-[var(--color-ink-secondary)]">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Demo access — no passwords, and everyone here shares one workspace.
            You can switch person at any time from the top bar.
          </span>
        </p>
      </div>
    </main>
  );
}
