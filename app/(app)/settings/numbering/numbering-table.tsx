"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  formatDocNumber,
  type DocType,
  type NumberingSeries,
} from "@/lib/permissions-model";
import { upsertNumberingSeriesAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";

/**
 * Editable numbering-series table — one row per document type. The "Next
 * number" cell is a LIVE preview: it re-renders via formatDocNumber as the
 * prefix/FY/padding inputs change (the server passes the initial value from
 * previewNextNumber). Saving never touches current_int.
 */

interface RowConfig {
  prefix: string;
  fy_segment: boolean;
  padding: number;
}

type ConfigMap = Record<DocType, RowConfig>;

const DEFAULTS: RowConfig = { prefix: "VEYRA", fy_segment: true, padding: 4 };

function seed(rows: NumberingSeries[]): ConfigMap {
  const map = {} as ConfigMap;
  for (const t of DOC_TYPES) {
    const row = rows.find((r) => r.doc_type === t);
    map[t] = row
      ? { prefix: row.prefix, fy_segment: row.fy_segment, padding: row.padding }
      : { ...DEFAULTS };
  }
  return map;
}

function currentIntOf(rows: NumberingSeries[], t: DocType): number {
  return rows.find((r) => r.doc_type === t)?.current_int ?? 0;
}

export function NumberingTable({
  rows,
  previews,
}: {
  rows: NumberingSeries[];
  previews: Record<DocType, string | null>;
}) {
  const [configs, setConfigs] = useState<ConfigMap>(() => seed(rows));
  const [saved, setSaved] = useState<ConfigMap>(() => seed(rows));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirtyTypes = useMemo(
    () =>
      DOC_TYPES.filter((t) => {
        const c = configs[t];
        const s = saved[t];
        return (
          c.prefix !== s.prefix ||
          c.fy_segment !== s.fy_segment ||
          c.padding !== s.padding
        );
      }),
    [configs, saved],
  );

  function patch(t: DocType, changes: Partial<RowConfig>) {
    setError(null);
    setConfigs((prev) => ({ ...prev, [t]: { ...prev[t], ...changes } }));
  }

  /** Live next-number preview: saved server value when clean, computed when dirty. */
  function previewFor(t: DocType): string {
    const cfg = configs[t];
    if (!dirtyTypes.includes(t) && previews[t]) return previews[t]!;
    return formatDocNumber(
      { ...cfg, current_int: currentIntOf(rows, t) + 1 },
      new Date(),
    );
  }

  function saveAll() {
    setError(null);
    startTransition(async () => {
      for (const t of dirtyTypes) {
        const result = await upsertNumberingSeriesAction({
          doc_type: t,
          ...configs[t],
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setSaved((prev) => ({ ...prev, [t]: { ...configs[t] } }));
      }
    });
  }

  const th =
    "sticky top-0 z-10 bg-[var(--color-surface-sunken)] px-4 py-3 text-left text-[13px] font-medium text-[var(--color-ink-secondary)]";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">
          Document numbering
        </h2>
        <Button
          variant="primary"
          size="sm"
          onClick={saveAll}
          disabled={pending || dirtyTypes.length === 0}
        >
          {pending
            ? "Saving…"
            : dirtyTypes.length > 0
              ? `Save ${dirtyTypes.length} change${dirtyTypes.length > 1 ? "s" : ""}`
              : "Saved"}
        </Button>
      </div>

      {error && (
        <p className="border-b border-[var(--color-border)] bg-[var(--color-red-tint)] px-4 py-2 text-[13px] text-[var(--color-red-hover)]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[13px] text-[var(--color-ink-secondary)]">
              <th className={th}>Document</th>
              <th className={th}>Prefix</th>
              <th className={th}>FY segment</th>
              <th className={th}>Padding</th>
              <th className={`${th} text-right`}>Issued so far</th>
              <th className={`${th} text-right`}>Next number</th>
            </tr>
          </thead>
          <tbody>
            {DOC_TYPES.map((t, i) => {
              const cfg = configs[t];
              const dirty = dirtyTypes.includes(t);
              return (
                <tr
                  key={t}
                  className={
                    "border-b border-[var(--color-border)] last:border-0 " +
                    (i % 2 === 1 ? "bg-[var(--color-surface-sunken)]" : "")
                  }
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                    {DOC_TYPE_LABELS[t]}
                    <span className="ml-2 text-xs text-[var(--color-ink-secondary)]">
                      {t}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={cfg.prefix}
                      onChange={(e) => patch(t, { prefix: e.target.value })}
                      disabled={pending}
                      maxLength={16}
                      aria-label={`Prefix for ${DOC_TYPE_LABELS[t]}`}
                      className="h-8 w-28 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[13px] text-[var(--color-ink)] focus:border-[var(--color-red)] outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <label className="inline-flex items-center gap-2 text-[var(--color-ink)]">
                      <input
                        type="checkbox"
                        checked={cfg.fy_segment}
                        onChange={(e) =>
                          patch(t, { fy_segment: e.target.checked })
                        }
                        disabled={pending}
                        aria-label={`Include FY segment for ${DOC_TYPE_LABELS[t]}`}
                        className="size-4 accent-[var(--color-ink)]"
                      />
                      <span className={cfg.fy_segment ? "" : "text-[var(--color-ink-disabled)]"}>
                        {cfg.fy_segment ? "On" : "Off"}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={cfg.padding}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        patch(t, { padding: Number.isNaN(n) ? 4 : n });
                      }}
                      disabled={pending}
                      aria-label={`Padding for ${DOC_TYPE_LABELS[t]}`}
                      className="h-8 w-20 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 tabular text-[13px] text-[var(--color-ink)] focus:border-[var(--color-red)] outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">
                    {currentIntOf(rows, t)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      suppressHydrationWarning
                      className={
                        "tabular font-medium " +
                        (dirty
                          ? "text-[var(--color-amber)]"
                          : "text-[var(--color-ink)]")
                      }
                    >
                      {previewFor(t)}
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
        Saving a series never resets or renumbers issued documents — only the
        running counter advances, and only when a document actually consumes a
        number.
      </p>
    </Card>
  );
}
