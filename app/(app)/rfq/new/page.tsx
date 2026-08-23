import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listVendors } from "@/lib/data/vendors";
import { getMaterialRequest } from "@/lib/data/material-requests";
import { NewRfqForm, type RfqPrefill } from "./new-rfq-form";
import { PageHeader } from "@/components/ui/primitives";

/**
 * Create an RFQ (PROC-RFQ-001): header fields + multi-select vendors + an
 * items grid. Optionally pre-fills everything except vendors from a Material
 * Request via ?mrId= (the convert-an-MR flow).
 */
export default async function NewRfqPage({
  searchParams,
}: {
  searchParams: Promise<{ mrId?: string }>;
}) {
  const { mrId } = await searchParams;
  const vendors = await listVendors({ activeOnly: true });

  let prefill: RfqPrefill | null = null;
  if (mrId) {
    const res = await getMaterialRequest(mrId);
    if (res) {
      prefill = {
        mrId: res.mr.id,
        title: res.mr.title,
        projectLabel: res.mr.project_label ?? "",
        items: res.items.map((it) => ({
          item_id: it.item_id,
          item_name: it.item_name,
          uom: it.uom ?? "",
          qty: String(Number(it.qty) || 0),
        })),
      };
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/rfq"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to RFQs
      </Link>
      <PageHeader
        title={prefill ? "New RFQ from material request" : "New RFQ"}
        subtitle={
          prefill
            ? "Pre-filled from the material request — pick the vendors to invite."
            : "Invite vendors, collect their per-line bids, compare on landed cost."
        }
      />
      <NewRfqForm
        vendors={vendors.map((v) => ({
          id: v.id,
          name: v.name,
          category: v.category,
        }))}
        prefill={prefill}
      />
    </div>
  );
}
