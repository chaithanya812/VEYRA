import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { ItemForm } from "../item-form";
import { createItemAction } from "../actions";

export default function NewItemPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/items"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to items
      </Link>
      <PageHeader
        title="New item"
        subtitle="Adds to the catalogue — quotations, POs and BOMs reference this record."
      />
      <ItemForm action={createItemAction} mode="create" />
    </div>
  );
}
