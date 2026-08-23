import Link from "next/link";
import { PhoneCall, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { interactionStats, listInteractions } from "@/lib/data/interactions";
import {
  CHANNELS,
  STATUS_META,
  TONE_TO_CHIP,
  formatDuration,
  type InteractionStatus,
} from "@/lib/interactions-model";
import { LogInteractionDialog } from "./log-interaction-dialog";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";

/**
 * Communication — call logs + lite wallboard (REQ-03 / OPS-CALL-001).
 * Every number here is computed from real rows (may be zero — NO fake data).
 * Red appears exactly twice: the hero connect-rate metric and the single
 * primary action. Call statuses are green/amber/grey ONLY.
 */

const channelLabel: Record<string, string> = {
  call: "Calls",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  visit: "Visits",
};

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

export default async function CommunicationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  // Tabs filter by channel: Call Logs = channel 'call', All Channels = none.
  const callsOnly = tab === "calls";

  const [stats, interactions] = await Promise.all([
    interactionStats(),
    listInteractions(callsOnly ? { channel: "call" } : undefined),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Communication"
        subtitle="Every call, WhatsApp, email, SMS and site visit against your leads."
        actions={<LogInteractionDialog />}
      />

      {/* Lite wallboard — real numbers only. Connect rate MAY be the red hero. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Total interactions
          </p>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)] tabular">
            {stats.total}
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-secondary)] tabular">
            {CHANNELS.map((c) => `${channelLabel[c]} ${stats.byChannel[c] ?? 0}`).join(" · ")}
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Connect rate
          </p>
          <p className="mt-2 text-4xl font-semibold text-[var(--color-red)] tabular">
            {stats.connectRate}%
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">
            Interactions that connected or completed
          </p>
        </Card>

        {/* Tabs — active pill follows the active-nav treatment (red text on tint). */}
        <Card className="p-5">
          <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            View
          </p>
          <nav className="mt-3 flex flex-wrap gap-2">
            <TabLink href="/communication" active={!callsOnly}>
              All Channels
            </TabLink>
            <TabLink href="/communication?tab=calls" active={callsOnly}>
              Call Logs
            </TabLink>
          </nav>
        </Card>
      </div>

      {interactions.length === 0 ? (
        <EmptyState
          icon={<PhoneCall className="size-8" />}
          title={callsOnly ? "No calls logged yet" : "No interactions logged yet"}
          description="Log a call, WhatsApp, email, SMS or site visit against a lead — the timeline builds itself."
          action={<LogInteractionDialog />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Customer No.</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium text-right">Duration</th>
                  <th className="px-4 py-3 font-medium text-right">Occurred At</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((i, idx) => {
                  const meta =
                    STATUS_META[i.status as InteractionStatus] ?? {
                      label: i.status,
                      tone: "neutral" as const,
                    };
                  const outbound = i.direction !== "inbound";
                  return (
                    <tr
                      key={i.id}
                      className={`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)] ${
                        idx % 2 === 1 ? "bg-[var(--color-surface-sunken)]" : ""
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-ink-secondary)]">
                          {outbound ? (
                            <ArrowUpRight className="size-3.5" aria-label="Outbound" />
                          ) : (
                            <ArrowDownLeft className="size-3.5 text-[var(--color-green)]" aria-label="Inbound" />
                          )}
                          {outbound ? "Out" : "In"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                        {i.lead_id ? i.lead_id.slice(0, 8) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip
                          tone={TONE_TO_CHIP[meta.tone]}
                          label={meta.label}
                        />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink)] tabular">
                        {i.customer_no ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                        {i.provider ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-ink)] tabular">
                        {formatDuration(i.duration_sec)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular whitespace-nowrap">
                        {fmtDateTime(i.occurred_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-[var(--color-red-tint)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-red-hover)]"
          : "rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
      }
    >
      {children}
    </Link>
  );
}
