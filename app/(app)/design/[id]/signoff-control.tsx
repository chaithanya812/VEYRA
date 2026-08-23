"use client";

import { useState, useTransition } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";
import { signOffAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

/**
 * The sign-off gate. Approve is a plain secondary (green lives in the status
 * chip, never decoration); Reject is destructive RED and requires a note —
 * a rejection blocks site execution, so the reason is mandatory (HARD RULE 5,
 * DESIGN-DIRECTION §2).
 */
export function SignOffControl({
  assetId,
  status,
}: {
  assetId: string;
  status: "pending" | "approved" | "rejected" | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [justSigned, setJustSigned] = useState<
    "approved" | "rejected" | null
  >(null);

  const submit = (next: "approved" | "rejected") => {
    setError(undefined);
    startTransition(async () => {
      const res = await signOffAction(assetId, next, note);
      if (res?.error) {
        setError(res.error);
      } else {
        setNote("");
        setJustSigned(next);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {status === "rejected" && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-red)]">
          <CircleAlert className="size-4" />
          Rejected — do not take this asset to site until it is re-approved.
        </p>
      )}
      {justSigned === "rejected" && !error && (
        <p className="text-sm text-[var(--color-red)]">
          Rejection recorded.
        </p>
      )}
      {justSigned === "approved" && !error && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-green)]">
          <CircleCheck className="size-4" /> Approval recorded — cleared for execution.
        </p>
      )}

      <Textarea
        name="signoff_note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          status === "rejected"
            ? "What must change before approval?"
            : "Optional note for the record…"
        }
      />
      {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => submit("approved")}
        >
          {pending ? "Saving…" : "Approve"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => submit("rejected")}
        >
          Reject with note
        </Button>
      </div>
    </div>
  );
}
