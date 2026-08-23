"use client";

import { useMemo, useState, useTransition } from "react";
import {
  APPROVAL_MODULES,
  MODULE_LABELS,
  needsApproval,
  type ApprovalModule,
  type ApprovalRule,
} from "@/lib/approvals-model";
import { upsertRuleAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { inr } from "@/lib/utils";

/**
 * Editable threshold rules — one row per engine module. A draft at or above
 * the threshold (inclusive) in that module needs sign-off; toggling a rule
 * off stops NEW drafts from routing but leaves raised requests untouched.
 * Save persists only dirty rows via upsertRuleAction (upsert on org+module).
 */

interface RowConfig {
  threshold_amount: number;
  approver_role: string;
  is_active: boolean;
}

type ConfigMap = Record<ApprovalModule, RowConfig>;

const DEFAULTS: RowConfig = {
  threshold_amount: 0,
  approver_role: "",
  is_active: true,
};

function seed(rows: ApprovalRule[]): ConfigMap {
  const map = {} as ConfigMap;
  for (const m of APPROVAL_MODULES) {
    const row = rows.find((r) => r.module === m);
    map[m] = row
      ? {
          threshold_amount: Number(row.threshold_amount),
          approver_role: row.approver_role ?? "",
          is_active: row.is_active,
        }
      : { ...DEFAULTS };
  }
  return map;
}

export function RulesTable({ rows }: { rows: ApprovalRule[] }) {
  const [configs, setConfigs] = useState<ConfigMap>(() => seed(rows));
  const [saved, setSaved] = useState<ConfigMap>(() => seed(rows));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirtyModules = useMemo(
    () =>
      APPROVAL_MODULES.filter((m) => {
        const c = configs[m];
        const s = saved[m];
        return (
          c.threshold_amount !== s.threshold_amount ||
          c.approver_role !== s.approver_role ||
          c.is_active !== s.is_active
        );
      }),
    [configs, saved],
  );

  function patch(m: ApprovalModule, changes: Partial<RowConfig>) {
    setError(null);
    setConfigs((prev) => ({ ...prev, [m]: { ...prev[m], ...changes } }));
  }

  function saveAll() {
    setError(null);
    startTransition(async () => {
      for (const m of dirtyModules) {
        const result = await upsertRuleAction({
          module: m,
          threshold_amount: configs[m].threshold_amount,
          approver_role: configs[m].approver_role || undefined,
          is_active: configs[m].is_active,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setSaved((prev) => ({ ...prev, [m]: { ...configs[m] } }));
      }
    });
  }

  const th =
    "sticky top-0 z-10 bg-[var(--color-surface-sunken)] px-4 py-3 text-left text-[13px] font-medium text-[var(--color-ink-secondary)]";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">
          Threshold rules per module
        </h2>
        <Button
          variant="primary"
          size="sm"
          onClick={saveAll}
          disabled={pending || dirtyModules.length === 0}
        >
          {pending
            ? "Saving…"
            : dirtyModules.length > 0
              ? `Save ${dirtyModules.length} change${dirtyModules.length > 1 ? "s" : ""}`
              : "Saved"}
        </Button>
      </div>

      {error && (
        <p className="border-b border-[var(--color-border)] bg-[var(--color-red-tint)] px-4 py-2 text-[13px] text-[var(--color-red-hover)]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[13px] text-[var(--color-ink-secondary)]">
              <th className={th}>Module</th>
              <th className={th}>Threshold amount (₹)</th>
              <th className={th}>Approver role</th>
              <th className={th}>Active</th>
              <th className={`${th} text-right`}>Effect</th>
            </tr>
          </thead>
          <tbody>
            {APPROVAL_MODULES.map((m, i) => {
              const cfg = configs[m];
              const dirty = dirtyModules.includes(m);
              const enforcing = needsApproval(Number.MAX_SAFE_INTEGER, {
                threshold_amount: cfg.threshold_amount,
                is_active: cfg.is_active,
              });
              return (
                <tr
                  key={m}
                  className={
                    "border-b border-[var(--color-border)] last:border-0 " +
                    (i % 2 === 1 ? "bg-[var(--color-surface-sunken)]" : "")
                  }
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                    {MODULE_LABELS[m]}
                    <span className="ml-2 text-xs text-[var(--color-ink-secondary)]">
                      {m}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={cfg.threshold_amount}
                      onChange={(e) => {
                        const n = Number.parseFloat(e.target.value);
                        patch(m, {
                          threshold_amount: Number.isNaN(n) || n < 0 ? 0 : n,
                        });
                      }}
                      disabled={pending}
                      aria-label={`Threshold amount for ${MODULE_LABELS[m]}`}
                      className="h-8 w-36 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 tabular text-[13px] text-[var(--color-ink)] focus:border-[var(--color-red)] outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={cfg.approver_role}
                      onChange={(e) => patch(m, { approver_role: e.target.value })}
                      disabled={pending}
                      maxLength={80}
                      placeholder="e.g. owner"
                      aria-label={`Approver role for ${MODULE_LABELS[m]}`}
                      className="h-8 w-32 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] focus:border-[var(--color-red)] outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <label className="inline-flex items-center gap-2 text-[var(--color-ink)]">
                      <input
                        type="checkbox"
                        checked={cfg.is_active}
                        onChange={(e) =>
                          patch(m, { is_active: e.target.checked })
                        }
                        disabled={pending}
                        aria-label={`Active for ${MODULE_LABELS[m]}`}
                        className="size-4 accent-[var(--color-ink)]"
                      />
                      <span className={cfg.is_active ? "" : "text-[var(--color-ink-disabled)]"}>
                        {cfg.is_active ? "On" : "Off"}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={
                        "tabular font-medium " +
                        (cfg.is_active
                          ? "text-[var(--color-ink)]"
                          : "text-[var(--color-ink-disabled)]")
                      }
                    >
                      {enforcing
                        ? `≥ ${inr(cfg.threshold_amount)} needs sign-off`
                        : "Not enforcing"}
                    </span>
                    {dirty && (
                      <span className="ml-2 text-xs text-[var(--color-amber)]">
                        unsaved
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-ink-secondary)]">
        The threshold is inclusive (a draft at exactly the threshold needs
        approval). Turning a rule off never touches requests already raised.
      </p>
    </Card>
  );
}
