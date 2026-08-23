"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
} from "lucide-react";
import { StatusChip } from "@/components/ui/primitives";
import {
  STATUS_META,
  TONE_TO_CHIP,
  formatDuration,
  type Channel,
  type Interaction,
  type InteractionStatus,
} from "@/lib/interactions-model";
import { fmtDate } from "@/lib/utils";

/**
 * Reusable interaction timeline (REQ-03). CLIENT component: it receives
 * already-fetched rows as props and imports NOTHING server-only — safe to drop
 * onto a lead detail page later. Status chips are green/amber/grey only; red is
 * reserved (DESIGN-DIRECTION §2) — a missed call is grey, not red.
 */

const channelIcon: Record<Channel, LucideIcon> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  sms: MessageSquare,
  visit: MapPin,
};

const channelLabel: Record<Channel, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  visit: "Visit",
};

export function InteractionTimeline({
  interactions,
}: {
  interactions: Interaction[];
}) {
  if (interactions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-ink-secondary)]">
        No interactions logged yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {interactions.map((i, idx) => {
        const Icon = channelIcon[i.channel as Channel] ?? Phone;
        const meta =
          STATUS_META[i.status as InteractionStatus] ?? {
            label: i.status,
            tone: "neutral" as const,
          };
        const outbound = i.direction !== "inbound";
        const Arrow = outbound ? ArrowUpRight : ArrowDownLeft;

        return (
          <li key={i.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* rail */}
            {idx < interactions.length - 1 && (
              <span
                aria-hidden
                className="absolute top-9 bottom-0 left-[15px] w-px bg-[var(--color-border)]"
              />
            )}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)]">
              <Icon className="size-4" aria-label={channelLabel[i.channel as Channel] ?? i.channel} />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Arrow
                  className={
                    outbound
                      ? "size-3.5 text-[var(--color-ink-secondary)]"
                      : "size-3.5 text-[var(--color-green)]"
                  }
                  aria-label={outbound ? "Outbound" : "Inbound"}
                />
                <span className="text-sm font-medium text-[var(--color-ink)]">
                  {outbound ? "Outbound" : "Inbound"}{" "}
                  {channelLabel[i.channel as Channel] ?? i.channel}
                </span>
                <StatusChip tone={TONE_TO_CHIP[meta.tone]} label={meta.label} />
              </div>

              <p className="mt-1 text-[13px] text-[var(--color-ink-secondary)] tabular">
                {i.customer_no ?? "No number"}
                {(i.duration_sec ?? 0) > 0 && (
                  <> · {formatDuration(i.duration_sec)}</>
                )}
                {i.disposition && <> · {i.disposition}</>}
              </p>

              {i.note && (
                <p className="mt-1 text-sm text-[var(--color-ink)]">{i.note}</p>
              )}

              <p className="mt-1 text-xs text-[var(--color-ink-secondary)] tabular">
                {fmtDate(i.occurred_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
