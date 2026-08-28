"use client";

import { useMemo, useState } from "react";
import { CornerUpLeft, MessageSquare, Pin, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import {
  AUDIENCE_LABELS,
  COMMENT_STATUS_LABELS,
  COMMENT_STATUS_TONE,
  buildThreads,
  type CommentAudience,
  type CommentStatus,
  type EntityComment,
} from "@/lib/comments-model";
import { cn } from "@/lib/utils";

/**
 * The thread that appears on a design file (104841), a site photo (105527) and
 * a purchase order (105927). Built once (PLAN-V4 §3) — the owner asked for the
 * composer specifically: *"this should be a message thing… the client has asked
 * us to add TV."*
 *
 * Presentational on purpose. It takes comments and hands text back to the
 * caller's server action; the `entity_comments` table lands in migration 0029
 * and every consumer feeds this same component.
 *
 * Red appears exactly twice: the send button (the one primary action in the
 * composer) and nothing else. Statuses are green/amber/grey chips with labels,
 * never colour alone.
 */

export interface CommentVersion {
  id: string;
  label: string;
}

export function EntityCommentThread({
  comments,
  audience,
  onAudienceChange,
  versions,
  versionId,
  onVersionChange,
  onSubmit,
  placeholder = "Type a message",
  showAudienceSwitch = true,
  busy,
  emptyHint,
}: {
  comments: EntityComment[];
  audience: CommentAudience;
  onAudienceChange?: (next: CommentAudience) => void;
  versions?: CommentVersion[];
  /** null = every version. */
  versionId?: string | null;
  onVersionChange?: (next: string | null) => void;
  onSubmit: (body: string, audience: CommentAudience) => void | Promise<void>;
  placeholder?: string;
  showAudienceSwitch?: boolean;
  busy?: boolean;
  emptyHint?: string;
}) {
  const [status, setStatus] = useState<CommentStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");

  const threads = useMemo(
    () =>
      buildThreads(comments, {
        audience,
        status: status === "all" ? null : status,
        versionId: versionId ?? null,
        query,
      }),
    [comments, audience, status, versionId, query],
  );

  async function send() {
    const body = draft.trim();
    if (!body) return;
    await onSubmit(body, audience);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Scope: which audience, which version. Both change what is shown, so
          they sit above the list rather than inside it. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
        {showAudienceSwitch && (
          <SegmentedControl
            label="Audience"
            size="sm"
            value={audience}
            onChange={(v) => onAudienceChange?.(v)}
            options={[
              { value: "internal", label: AUDIENCE_LABELS.internal },
              { value: "client", label: AUDIENCE_LABELS.client },
            ]}
          />
        )}
        {versions && versions.length > 0 && (
          <select
            aria-label="Version"
            value={versionId ?? ""}
            onChange={(e) => onVersionChange?.(e.target.value || null)}
            className="h-7 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-ink)] outline-none"
          >
            <option value="">All versions</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search comments"
          aria-label="Search comments"
          className="h-7 flex-1 min-w-32 text-[12px]"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] px-3 py-2">
        {(["all", "accepted", "not_required", "open"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
              status === s
                ? "bg-[var(--color-ink)] text-white"
                : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
            )}
          >
            {s === "all" ? "All" : COMMENT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <MessageSquare className="size-5 text-[var(--color-ink-disabled)]" />
            <p className="text-sm font-medium text-[var(--color-ink)]">
              No comments yet
            </p>
            <p className="text-xs text-[var(--color-ink-secondary)]">
              {emptyHint ?? "Start the conversation below."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {threads.map(({ comment, replies, pinNumber }) => (
              <li
                key={comment.id}
                className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-ink-secondary)]">
                    <Pin className="size-3.5" aria-hidden />
                    <span className="tabular">{pinNumber}</span>
                  </span>
                  <StatusChip
                    tone={COMMENT_STATUS_TONE[comment.status]}
                    label={COMMENT_STATUS_LABELS[comment.status]}
                  />
                </div>

                <p className="mt-1.5 text-[13px] text-[var(--color-ink)]">
                  {comment.body}
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
                  {comment.authorName} · {fmtStamp(comment.createdAt)}
                </p>

                {replies.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2 border-l-2 border-[var(--color-border)] pl-3">
                    {replies.map((r) => (
                      <li key={r.id}>
                        <p className="text-[13px] text-[var(--color-ink)]">{r.body}</p>
                        <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
                          {r.authorName} · {fmtStamp(r.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex items-center gap-3 text-[12px]">
                  <span className="inline-flex items-center gap-1 text-[var(--color-ink-secondary)]">
                    <CornerUpLeft className="size-3" /> Reply
                  </span>
                  {comment.status !== "open" && (
                    <span className="inline-flex items-center gap-1 text-[var(--color-ink-secondary)]">
                      <RotateCcw className="size-3" /> Reopen
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--color-border)] p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder}
          aria-label="Write a comment"
          className="h-9 flex-1"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy || !draft.trim()}
          onClick={() => void send()}
          aria-label="Send"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}
