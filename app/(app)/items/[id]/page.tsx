import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getItem } from "@/lib/data/items";
import { typeLabel, uomLabel } from "@/lib/items-ui";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusChip } from "@/components/ui/primitives";
import { ItemForm } from "../item-form";
import { updateItemAction, toggleActiveAction } from "../actions";
import { fmtDate } from "@/lib/utils";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const subtitleParts = [
    item.code ?? "No code",
    typeLabel[item.type],
    `Base unit: ${uomLabel[item.base_uom]}`,
    `Updated ${fmtDate(item.updated_at)}`,
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/items"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to items
      </Link>

      <PageHeader
        title={item.name}
        subtitle={subtitleParts.join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip
              tone={item.is_active ? "green" : "neutral"}
              label={item.is_active ? "Active" : "Inactive"}
            />
            <form action={toggleActiveAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="next" value={String(!item.is_active)} />
              <Button
                type="submit"
                variant={item.is_active ? "danger" : "secondary"}
                size="sm"
              >
                {item.is_active ? "Deactivate" : "Activate"}
              </Button>
            </form>
          </div>
        }
      />

      <ItemForm action={updateItemAction} mode="edit" item={item} />
    </div>
  );
}
