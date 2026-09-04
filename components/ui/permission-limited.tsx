import type { ReactNode } from "react";
import { capabilityDef } from "@/lib/can-model";

/**
 * What a screen renders when the caller lacks the capability it needs.
 *
 * Deliberately NOT a 404 and NOT a redirect. A 404 says the page does not
 * exist, which is a lie the user will take to support; a redirect drops them
 * somewhere they did not ask to be and explains nothing. This says what is
 * missing, in the same words the Edit Role screen uses for it, so the person
 * can ask their admin for that exact capability by name.
 *
 * It also keeps the app chrome around it — the nav still renders, so this is a
 * closed door inside the building rather than a broken layout.
 *
 * Grey, not red. §2 rule 7 gives red five jobs and "a state the user reached
 * by ordinary navigation" is not one of them: being told you lack a permission
 * is not an error you made, and colouring it like a failure implies it is.
 */
export function PermissionLimited({
  capability,
  hint,
  action,
}: {
  /** The capability key that was refused, e.g. `reports.financial.view`. */
  capability: string;
  /** Optional extra sentence for a screen with a specific consolation. */
  hint?: string;
  action?: ReactNode;
}) {
  const def = capabilityDef(capability);
  const what = def ? `${def.label} (${def.group})` : "this area";

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] py-16 px-6 text-center">
      <div
        aria-hidden
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]"
      >
        {/* A closed padlock. Decorative — the heading carries the meaning. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 1 1 8 0v3" />
        </svg>
      </div>
      <div>
        <p className="font-medium text-[var(--color-ink)]">You do not have access to this</p>
        <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
          It needs the <span className="font-medium text-[var(--color-ink)]">{what}</span>{" "}
          permission. An admin can grant it in Settings → Roles &amp; permissions.
        </p>
        {hint && <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The field-level case, and the register's P1 example: a supervisor sees the
 * BOQ WITHOUT its cost columns.
 *
 * A hidden cost is rendered as an explicit dash with a title, never as an empty
 * cell. An empty cell says "this has no value"; a dash that explains itself
 * says "there is a value and it is not yours to see". The first is a data bug
 * the reader will report; the second is a permission working.
 */
export function HiddenValue({ label = "Hidden" }: { label?: string }) {
  return (
    <span
      title={`${label} — you do not have permission to see cost figures.`}
      className="text-[var(--color-ink-disabled)]"
    >
      —
    </span>
  );
}
