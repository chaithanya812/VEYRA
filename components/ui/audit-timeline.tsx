import { EmptyState } from "@/components/ui/primitives";

/**
 * One rendering of `audit_events`, shared by every audit surface.
 *
 * It borrows the comment thread's visual language — a rail, a dot per entry,
 * actor and time beneath the sentence — rather than inventing a second one. An
 * audit entry and a comment answer the same question ("what happened to this
 * record, and who did it?"), and giving them two different shapes would make
 * the app feel like two apps.
 *
 * `before`/`after` are stored as jsonb precisely so a reader can see WHICH
 * field moved, so this renders `was → now` per changed field rather than a
 * sentence that only says something changed.
 */

export interface AuditEntry {
  id: string;
  actor_name: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  before: unknown;
  after: unknown;
  at: string;
}

/** Label a field by its column name, falling back to the raw name. */
const FIELD_LABELS: Record<string, string> = {
  work_done: "Work done",
  name: "Name",
  amount: "Amount",
  description: "Description",
  internal_status: "Internal status",
  client_approval: "Client approval",
  folder_id: "Folder",
  status: "Status",
  contract_id: "Contract",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  approve: "Approved",
  reject: "Rejected",
  mark_work_done: "Marked work done",
  unmark_work_done: "Marked work NOT done",
};

/** Context fields ride along in `after` but are not the change itself. */
const CONTEXT_KEYS = new Set(["name", "amount", "contract_id", "project_id", "vendor_id"]);

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return new Intl.NumberFormat("en-IN").format(v);
  return String(v);
}

function fmt(at: string): string {
  const d = new Date(at);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

/** The headline: what happened, named as specifically as the row allows. */
function headline(e: AuditEntry): string {
  const label = ACTION_LABELS[e.action] ?? e.action;
  const after = (e.after ?? {}) as Record<string, unknown>;
  const subject = typeof after.name === "string" ? after.name : null;
  const before = (e.before ?? {}) as Record<string, unknown>;
  const beforeName = typeof before.name === "string" ? before.name : null;
  return subject || beforeName ? `${label} — ${subject ?? beforeName}` : label;
}

/** Only the fields that actually moved, `was → now`. */
function changes(e: AuditEntry): { label: string; from: string; to: string }[] {
  const after = (e.after ?? {}) as Record<string, unknown> | null;
  const before = (e.before ?? {}) as Record<string, unknown> | null;
  if (!after) return [];
  return Object.keys(after)
    .filter((k) => !CONTEXT_KEYS.has(k))
    .filter((k) => (before ? before[k] !== after[k] : true))
    .map((k) => ({
      label: FIELD_LABELS[k] ?? k,
      from: show(before?.[k]),
      to: show(after[k]),
    }));
}

export function AuditTimeline({
  entries,
  emptyTitle = "Nothing recorded yet",
  emptyDescription = "Changes appear here from the moment the audit ledger was switched on — it does not reconstruct history from before that.",
}: {
  entries: AuditEntry[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (entries.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="relative">
      {entries.map((e) => {
        const moved = changes(e);
        return (
          <li
            key={e.id}
            className="flex gap-3 border-b border-[var(--color-border)] py-3 last:border-0"
          >
            <span
              aria-hidden
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-ink-secondary)]"
            />
            <div className="min-w-0">
              <p className="text-[13px] text-[var(--color-ink)]">{headline(e)}</p>
              {moved.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {moved.map((c) => (
                    <li
                      key={c.label}
                      className="text-[12px] text-[var(--color-ink-secondary)]"
                    >
                      {c.label}:{" "}
                      <span className="line-through">{c.from}</span>{" "}
                      <span aria-hidden>→</span>{" "}
                      <span className="text-[var(--color-ink)]">{c.to}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] tabular text-[var(--color-ink-secondary)]">
                {e.actor_name ?? "Someone"} · {fmt(e.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
