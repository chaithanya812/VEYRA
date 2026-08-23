import Link from "next/link";
import { CalendarClock, AlertTriangle, Check } from "lucide-react";
import { listFollowUps } from "@/lib/data/pipeline";
import { listLeads } from "@/lib/data/leads";
import {
  FOLLOW_UP_BUCKETS,
  bucketLabel,
  followUpBucket,
  type FollowUpBucket,
} from "@/lib/pipeline-model";
import { completeFollowUpAction } from "../pipeline/actions";
import { NewFollowUpDialog } from "./new-follow-up-dialog";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";

/**
 * Follow-up scheduler (OPS-HR-001): overdue / today / upcoming / done per lead.
 * Red is used exactly where the design allows it here — the overdue alert
 * (icon + text) and the single primary action. Done rows are green status.
 */

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    fmtDate(d) +
    ", " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
}

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: FollowUpBucket = FOLLOW_UP_BUCKETS.includes(
    tab as FollowUpBucket,
  )
    ? (tab as FollowUpBucket)
    : "overdue";

  const [all, leads] = await Promise.all([listFollowUps(), listLeads()]);

  const byBucket = new Map<FollowUpBucket, typeof all>(
    FOLLOW_UP_BUCKETS.map((b) => [b, []]),
  );
  for (const f of all) {
    byBucket.get(followUpBucket(f.due_at, f.done))?.push(f);
  }

  const rows = byBucket.get(active) ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Follow-ups"
        subtitle="Every scheduled next touchpoint against your leads."
        actions={<NewFollowUpDialog leads={leads.map((l) => ({ id: l.id, name: l.name }))} />}
      />

      {/* Tabs — counts computed from the real rows; active pill red-tint. */}
      <nav className="mb-6 flex flex-wrap gap-2">
        {FOLLOW_UP_BUCKETS.map((b) => (
          <TabLink
            key={b}
            href={`/followups?tab=${b}`}
            active={active === b}
            count={byBucket.get(b)?.length ?? 0}
            alert={b === "overdue" && (byBucket.get(b)?.length ?? 0) > 0}
          >
            {bucketLabel[b]}
          </TabLink>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-8" />}
          title={`No ${bucketLabel[active].toLowerCase()} follow-ups`}
          description={
            active === "overdue"
              ? "Nothing overdue — the queue is clear."
              : "Schedule one with “New follow-up”."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map((f) => (
              <li
                key={f.id}
                className={`flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-0 hover:bg-[var(--color-surface-sunken)] ${
                  active === "overdue"
                    ? "bg-[var(--color-red-tint)]"
                    : ""
                }`}
              >
                {f.done ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-green)]" />
                ) : (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-border-strong)]" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    <Link
                      href={`/leads/${f.lead_id}`}
                      className="hover:text-[var(--color-red)]"
                    >
                      {f.lead_name ?? f.lead_id.slice(0, 8)}
                    </Link>
                    {!f.done && (
                      <span
                        className={`ml-3 inline-flex items-center gap-1 align-middle text-xs font-medium ${
                          active === "overdue"
                            ? "text-[var(--color-red)]"
                            : "text-[var(--color-ink-secondary)]"
                        }`}
                      >
                        {active === "overdue" && (
                          <AlertTriangle className="size-3.5" aria-label="Overdue" />
                        )}
                        {fmtDateTime(f.due_at)}
                      </span>
                    )}
                  </p>
                  {f.note && (
                    <p className="mt-0.5 truncate text-xs text-[var(--color-ink-secondary)]">
                      {f.note}
                    </p>
                  )}
                </div>

                {f.done ? (
                  <StatusChip tone="green" label="Done" />
                ) : (
                  <form action={completeFollowUpAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      Mark done
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  count,
  alert,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-[var(--color-red-tint)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-red-hover)]"
          : "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
      }
    >
      {alert && (
        <AlertTriangle
          className={`size-3.5 ${active ? "" : "text-[var(--color-red)]"}`}
          aria-label="Overdue items"
        />
      )}
      {children}
      <span className="tabular">({count})</span>
    </Link>
  );
}
