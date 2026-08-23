import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { VendorForm } from "../vendor-form";
import { createVendorAction } from "../actions";

export default function NewVendorPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/vendors"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to vendors
      </Link>
      <PageHeader
        title="New vendor"
        subtitle="Adds a party you buy from — RFQs, POs and rate contracts reference this record."
      />
      <VendorForm action={createVendorAction} mode="create" />
    </div>
  );
}
