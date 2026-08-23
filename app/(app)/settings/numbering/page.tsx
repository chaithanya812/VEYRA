import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listNumberingSeries, previewNextNumber } from "@/lib/data/config";
import {
  DOC_TYPES,
  type DocType,
  type NumberingSeries,
} from "@/lib/permissions-model";
import { PageHeader } from "@/components/ui/primitives";
import { NumberingTable } from "./numbering-table";

export default async function NumberingPage() {
  const series = await listNumberingSeries();
  // Server-side preview of the next number per doc_type (previewNextNumber
  // never persists); the table recomputes live as the config is edited.
  const previewEntries = await Promise.all(
    DOC_TYPES.map(async (t) => [t, await previewNextNumber(t)] as const),
  );
  const previews = Object.fromEntries(previewEntries) as Record<
    DocType,
    string | null
  >;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to settings
      </Link>
      <PageHeader
        title="Numbering series"
        subtitle="Per-document prefix, Indian financial-year segment and zero-padding — e.g. VEYRA/2026-27/0042. The FY runs 1 Apr to 31 Mar."
      />

      <NumberingTable rows={series as NumberingSeries[]} previews={previews} />
    </div>
  );
}
