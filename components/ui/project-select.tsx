import { Field, Select } from "@/components/ui/field";

/**
 * The one project picker, shared by every module screen that can attach its
 * work to a project.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Why this exists.
 * ────────────────────────────────────────────────────────────────────────────
 * Eleven tables were built against a free-text `project_label` (PLAN-V4 §7.1),
 * so Design, Production and Site asked the user to TYPE a project name. A typo
 * silently detached the row: `v_project_label_unmatched` still lists demo
 * expense claims tagged "DLF Greens" and "Skyview Apartment", projects that do
 * not exist. Migration 0028 added a real `project_id` FK to those tables and
 * backfilled it, but the forms were never moved across — so the schema was
 * right and the screens were still guessing.
 *
 * This is that move. The user picks from the projects that actually exist, the
 * form posts `project_id`, and the write stamps `project_label` alongside it
 * from the chosen project's real name — PLAN-V4 §7.3 keeps the label as a
 * DISPLAY FALLBACK for old rows, not as the link.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Company-wide is a real answer, not a missing one.
 * ────────────────────────────────────────────────────────────────────────────
 * A warehouse, a work centre or a stock item genuinely belongs to the firm
 * rather than to one job, so "No project" is offered first and is the default.
 * The screens stay company-wide; the association is available whenever the work
 * does belong to a project.
 *
 * No "use client" here: it is markup with no state, so it renders inside client
 * forms and server pages alike. Options are always passed in from a server
 * component — this never reads the database itself.
 */

export interface ProjectOption {
  id: string;
  name: string;
  client_name?: string | null;
}

/** How a project reads in a dropdown: the job, then whose job it is. */
export function projectOptionLabel(p: ProjectOption): string {
  const client = p.client_name?.trim();
  return client ? `${p.name} — ${client}` : p.name;
}

export function ProjectSelect({
  projects,
  defaultValue,
  name = "project_id",
  label = "Project",
  hint = "Leave as company-wide if this is not tied to one job",
  required = false,
  id,
  lockedTo,
}: {
  projects: ProjectOption[];
  defaultValue?: string | null;
  name?: string;
  label?: string;
  hint?: string;
  required?: boolean;
  /** Defaults to `name`, so the label's htmlFor always points at the control. */
  id?: string;
  /**
   * Pin the form to one project and show it rather than ask for it. Used by
   * `/projects/[id]/production`, where the project is the page you are on — a
   * dropdown there could only ever be set wrong.
   */
  lockedTo?: ProjectOption;
}) {
  const controlId = id ?? name;

  if (lockedTo) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-disabled)]">
          {label}
        </span>
        {/* Hidden input, not a disabled <select>: a disabled control submits
            nothing, and the write would silently lose its project. */}
        <input type="hidden" name={name} value={lockedTo.id} />
        <span className="rounded-md border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] px-3 py-2 text-sm text-[var(--color-ink)]">
          {projectOptionLabel(lockedTo)}
        </span>
      </div>
    );
  }

  // A tenant with no projects yet would otherwise get an empty dropdown that
  // looks broken. Say why it is empty instead.
  const emptyHint =
    projects.length === 0
      ? "No projects yet — create one first to attach this to a job"
      : hint;

  return (
    <Field label={label} htmlFor={controlId} hint={emptyHint} required={required}>
      <Select
        id={controlId}
        name={name}
        defaultValue={defaultValue ?? ""}
        disabled={projects.length === 0}
      >
        <option value="">
          {required ? "— Select a project —" : "— No project (company-wide) —"}
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {projectOptionLabel(p)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
