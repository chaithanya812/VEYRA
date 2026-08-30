"use client";

import { useState } from "react";
import { Check, CornerUpLeft, MessageSquare, Pin, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import {
  AUDIENCE_LABELS,
  COMMENT_STATUS_LABELS,
  COMMENT_STATUS_TONE,
  type CommentAudience,
  type CommentStatus,
  type CommentThread,
} from "@/lib/comments-model";
import { cn } from "@/lib/utils";

/**
 * The thread that appears on a design file (104841), a site photo (105527) and
 * a purchase order (105927). Built once (PLAN-V4 §3) — the owner asked for the
 * composer specifically: *"this should be a message thing… the client has asked
 * us to add TV."*
 *
 * **The threads are built by the caller, not here.** That is deliberate: the
 * viewer draws numbered pins on the drawing from the same list this rail
 * renders, and the badge on the plan must always be the number beside the
 * comment. Building the list twice from two copies of the filter state is
 * exactly how those two drift apart, so one place builds it and both consume it.
 *
 * Presentational otherwise: it hands text and intents back to the caller's
 * server actions and knows nothing about `entity_comments`.
 *
 * Red appears exactly twice — the send button and the destructive-adjacent
 * `Reopen` link. Statuses are green/amber/grey chips *with labels*, never
 * colour alone (DESIGN-DIRECTION §8).
 */

export interface CommentVersion {
  id: string;
  label: string;
}

export function EntityCommentThread({
  threads,
  audience,
  onAudienceChange,
  versions,
  versionId,
  onVersionChange,
  status,
  onStatusChange,
  query,
  onQueryChange,
  onSubmit,
  onReply,
  onSetStatus,
  activeId,
  onSelect,
  placeholder = "Type a message",
  showAudienceSwitch = true,
  busy,
  emptyHint,
  composerHint,
}: {
  /** Already filtered and numbered by the caller — see the note above. */
  threads: CommentThread[];
  audience: CommentAudience;
  onAudienceChange?: (next: CommentAudience) => void;
  versions?: CommentVersion[];
  /** null = every version. */
  versionId?: string | null;
  onVersionChange?: (next: string | null) => void;
  status: CommentStatus | "all";
  onStatusChange: (next: CommentStatus | "all") => void;
  query: string;
  onQueryChange: (next: string) => void;
  onSubmit: (body: string, audience: CommentAudience) => void | Promise<void>;
  onReply?: (parentId: string, body: string) => void | Promise<void>;
  onSetStatus?: (id: string, status: CommentStatus) => void | Promise<void>;
  /** The comment whose pin is selected on the document, if any. */
  activeId?: string | null;
  onSelect?: (id: string) => void;
  placeholder?: string;
  showAudienceSwitch?: boolean;
  busy?: boolean;
  emptyHint?: string;
  /** A line under the composer — e.g. where the next comment will be pinned. */
  composerHint?: string;
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  async function send() {
    const body = draft.trim();
    if (!body) return;
    await onSubmit(body, audience);
    setDraft("");
  }

  async function sendReply(parentId: string) {
    const body = replyDraft.trim();
    if (!body || !onReply) return;
    await onReply(parentId, body);
    setReplyDraft("");
    setReplyTo(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
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
          onChange={(e) => onQueryChange(e.target.value)}
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
            onClick={() => onStatusChange(s)}
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
            {threads.map(({ comment, replies, pinNumber }) => {
              const active = activeId === comment.id;
              const pinned = comment.x != null && comment.y != null;
              return (
                <li
                  key={comment.id}
                  className={cn(
                    "rounded-[var(--radius-card)] border p-3 transition-colors",
                    active
                      ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)]"
                      : "border-[var(--color-border)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect?.(comment.id)}
                      disabled={!onSelect}
                      title={
                        pinned
                          ? `Pin ${pinNumber} on the document`
                          : "Not pinned to a place on the document"
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[12px] font-medium",
                        pinned
                          ? "text-[var(--color-ink)]"
                          : "text-[var(--color-ink-disabled)]",
                        onSelect && "hover:text-[var(--color-ink)]",
                      )}
                    >
                      <Pin className="size-3.5" aria-hidden />
                      <span className="tabular">{pinNumber}</span>
                    </button>
                    <StatusChip
                      tone={COMMENT_STATUS_TONE[comment.status]}
                      label={COMMENT_STATUS_LABELS[comment.status]}
                    />
                  </div>

                  <p className="mt-1.5 text-[13px] text-[var(--color-ink)]">
                    <span className="tabular text-[var(--color-ink-secondary)]">
                      {pinNumber}.{" "}
                    </span>
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

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                    {onReply && (
                      <button
                        type="button"
                        onClick={() =>
                          setReplyTo(replyTo === comment.id ? null : comment.id)
                        }
                        className="inline-flex items-center gap-1 text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
                      >
                        <CornerUpLeft className="size-3" /> Reply
                      </button>
                    )}

                    {onSetStatus && comment.status === "open" && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onSetStatus(comment.id, "accepted")}
                          className="inline-flex items-center gap-1 text-[var(--color-ink-secondary)] hover:text-[var(--color-green)]"
                        >
                          <Check className="size-3" /> Accept
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onSetStatus(comment.id, "not_required")}
                          className="inline-flex items-center gap-1 text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
                        >
                          <X className="size-3" /> Not required
                        </button>
                      </>
                    )}

                    {onSetStatus && comment.status !== "open" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onSetStatus(comment.id, "open")}
                        className="inline-flex items-center gap-1 text-[var(--color-red)] hover:text-[var(--color-red-hover)]"
                      >
                        <RotateCcw className="size-3" /> Reopen
                      </button>
                    )}
                  </div>

                  {replyTo === comment.id && onReply && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        value={replyDraft}
                        autoFocus
                        onChange={(e) => setReplyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendReply(comment.id);
                          }
                          if (e.key === "Escape") setReplyTo(null);
                        }}
                        placeholder="Reply"
                        aria-label={`Reply to comment ${pinNumber}`}
                        className="h-8 flex-1 text-[12px]"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy || !replyDraft.trim()}
                        onClick={() => void sendReply(comment.id)}
                      >
                        Send
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2">
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
        {composerHint && (
          <p className="mt-1.5 text-[11px] text-[var(--color-ink-secondary)]">
            {composerHint}
          </p>
        )}
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
