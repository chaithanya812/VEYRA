"use client";

import { useState, useTransition } from "react";
import { PROJECT_STAGES, STAGE_LABELS } from "@/lib/projects-model";
import { updateProjectStageAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";

export function StageControl({
  projectId,
  current,
}: {
  projectId: string;
  current: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const stage = String(
          new FormData(e.currentTarget).get("stage") ?? "",
        );
        setError(undefined);
        startTransition(async () => {
          const res = await updateProjectStageAction(projectId, stage);
          if (res?.error) setError(res.error);
        });
      }}
    >
      <Field label="Stage" htmlFor="stage">
        <Select id="stage" name="stage" defaultValue={current}>
          {PROJECT_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Updating…" : "Update stage"}
        </Button>
      </div>
    </form>
  );
}
