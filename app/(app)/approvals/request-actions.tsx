"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  approveRequestAction,
  rejectRequestAction,
} from "./actions";
import { Button } from "@/components/ui/button";

/**
 * Row actions for a PENDING approval request. Approve is instant; reject
 * expands an inline mandatory-comment box (a rejection without a reason is
 * not accepted — PROC-APP-001). Red appears only because reject is
 * destructive (DESIGN-DIRECTION §2).
 */
export function RequestActions({ id }: { id: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveRequestAction({ id });
      if (result.error) setError(result.error);
    });
  }

  function confirmReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectRequestAction({ id, comment });
      if (result.error) {
        setError(result.error);
        return;
      }
      setRejecting(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center justify-end gap-1.5">
        {rejecting ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRejecting(false);
                setComment("");
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmReject}
              disabled={pending || !comment.trim()}
            >
              <X className="size-3.5" /> Reject
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={approve} disabled={pending}>
              <Check className="size-3.5" /> Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setRejecting(true)}
              disabled={pending}
            >
              <X className="size-3.5" /> Reject
            </Button>
          </>
        )}
      </div>

      {rejecting && (
        <div className="w-64 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Reason (required)"
            rows={2}
            autoFocus
            aria-label={`Rejection comment for request ${id}`}
            className="w-full resize-none rounded border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] focus:border-[var(--color-red)] outline-none"
          />
        </div>
      )}

      {error && (
        <p className="max-w-64 text-right text-xs text-[var(--color-red)]">{error}</p>
      )}
    </div>
  );
}
