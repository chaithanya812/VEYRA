"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import { parseItemsCsv } from "@/lib/items-csv";
import { typeLabel, uomLabel } from "@/lib/items-ui";
import type { ImportState } from "../actions";
import type { BulkItemOutcome } from "@/lib/items-model";
import { importItemsCsvAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card, PageHeader, StatusChip } from "@/components/ui/primitives";

const SAMPLE =
  "name,code,type,base_uom,base_rate,tax_rate,hsn_sac,brand,category,description\n" +
  "18mm BWP Plywood,PLY-18-BWP,material,nos,95,18,4412,Century,Plywood,Marine grade\n" +
  "Site supervisor labour,LAB-SUP,labour,hour,450,18,,,Labour,Supervision";

export default function ImportItemsPage() {
  const [csv, setCsv] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importItemsCsvAction,
    undefined,
  );

  const parsed = useMemo(() => (csv.trim() ? parseItemsCsv(csv) : { rows: [] }), [csv]);
  const readyCount = parsed.rows.filter((r) => r.status === "ok").length;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setShowPreview(true);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/items"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to items
      </Link>

      <PageHeader
        title="Import items (CSV)"
        subtitle="Bulk-load the catalogue. Duplicates on name (or code) are skipped; each row is reported."
      />

      <Card className="mb-4 overflow-hidden">
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3">
          <FileText className="mt-0.5 size-4 text-[var(--color-ink-secondary)]" />
          <div className="text-[13px] text-[var(--color-ink-secondary)]">
            <p className="font-medium text-[var(--color-ink)]">Expected header</p>
            <p className="mt-1 font-mono text-xs">
              name, code, type, base_uom, base_rate, tax_rate, hsn_sac, brand, category, description
            </p>
            <p className="mt-1">Optional columns may be omitted or reordered. A sample row is below.</p>
          </div>
        </div>
        <pre className="overflow-x-auto px-4 py-3 font-mono text-xs text-[var(--color-ink-secondary)]">
          {SAMPLE}
        </pre>
        <div className="px-4 pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCsv(SAMPLE)}
          >
            Load sample
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" /> Upload CSV
            </Button>
            <span className="text-xs text-[var(--color-ink-secondary)]">
              or paste below
            </span>
          </div>

          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"name,type,base_uom,base_rate\nexample item,material,nos,100"}
            className="min-h-44 font-mono text-xs"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPreview(true)}
              disabled={!csv.trim()}
            >
              Preview
            </Button>
          </div>

          {state?.error && (
            <p className="text-sm text-[var(--color-amber)]">{state.error}</p>
          )}

          {showPreview && parsed.rows.length > 0 && (
            <PreviewTable rows={parsed.rows} />
          )}

          <form action={formAction} className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <input type="hidden" name="csv" value={csv} />
            <p className="text-sm text-[var(--color-ink-secondary)]">
              {readyCount > 0
                ? `${readyCount} row${readyCount === 1 ? "" : "s"} ready to import.`
                : "No valid rows to import."}
            </p>
            <Button type="submit" variant="primary" disabled={pending || readyCount === 0}>
              {pending ? "Importing…" : "Import items"}
            </Button>
          </form>

          {state?.summary && (
            <ImportSummary
              summary={state.summary}
              outcomes={state.outcomes ?? []}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function PreviewTable({ rows }: { rows: ReturnType<typeof parseItemsCsv>["rows"] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Unit</th>
            <th className="px-3 py-2 font-medium">Rate</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.index}
              className="border-b border-[var(--color-border)] last:border-0"
            >
              <td className="px-3 py-2 text-[var(--color-ink-secondary)] tabular">
                {r.index}
              </td>
              <td className="px-3 py-2 font-medium">{r.values.name}</td>
              <td className="px-3 py-2 text-[var(--color-ink-secondary)]">
                {typeLabel[r.values.type]}
              </td>
              <td className="px-3 py-2 text-[var(--color-ink-secondary)]">
                {uomLabel[r.values.base_uom]}
              </td>
              <td className="px-3 py-2 text-[var(--color-ink-secondary)] tabular">
                {r.values.base_rate == null ? "—" : r.values.base_rate}
              </td>
              <td className="px-3 py-2">
                {r.status === "ok" ? (
                  <StatusChip tone="green" label="Ready" />
                ) : (
                  <StatusChip
                    tone="amber"
                    label={r.errors.join(" · ") || "Error"}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportSummary({
  summary,
  outcomes,
}: {
  summary: { created: number; skipped: number; errors: number };
  outcomes: BulkItemOutcome[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
      <div className="flex flex-wrap gap-2">
        <StatusChip tone="green" label={`${summary.created} created`} />
        <StatusChip tone="amber" label={`${summary.skipped} skipped (duplicate)`} />
        <StatusChip tone="amber" label={`${summary.errors} error`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[13px] text-[var(--color-ink-secondary)]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr
                key={o.index}
                className="border-b border-[var(--color-border)] last:border-0"
              >
                <td className="px-3 py-2 text-[var(--color-ink-secondary)] tabular">
                  {o.index}
                </td>
                <td className="px-3 py-2 font-medium">{o.name}</td>
                <td className="px-3 py-2">
                  {o.status === "created" ? (
                    <StatusChip tone="green" label="Created" />
                  ) : o.status === "skipped_duplicate" ? (
                    <StatusChip tone="amber" label="Skipped (duplicate)" />
                  ) : (
                    <StatusChip tone="amber" label={o.message || "Error"} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
