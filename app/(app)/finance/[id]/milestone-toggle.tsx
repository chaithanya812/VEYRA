"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toggleMilestoneAction } from "../actions";
import { Button } from "@/components/ui/button";

export function MilestoneToggle({
  milestoneId,
  contractId,
  workDone,
}: {
  milestoneId: string;
  contractId: string;
  workDone: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={workDone ? "ghost" : "secondary"}
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const res = await toggleMilestoneAction(
              milestoneId,
              !workDone,
              contractId,
            );
            if (res?.error) setError(res.error);
          });
        }}
      >
        {workDone ? (
          <>
            <Check className="size-4 text-[var(--color-green)]" /> Done — undo?
          </>
        ) : (
          "Mark work done"
        )}
      </Button>
      {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
    </span>
  );
}
