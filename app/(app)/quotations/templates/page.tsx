import Link from "next/link";
import { LayoutTemplate, Plus, Trash2, FileText } from "lucide-react";
import { listTemplates } from "@/lib/data/quotation-templates";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import {
  newQuotationFromTemplateAction,
  deleteTemplateAction,
} from "../actions";

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Quotation templates"
        subtitle="Reusable BOQ presets — save a quote's structure, spin up a new draft in one click."
        actions={
          <Link href="/quotations">
            <Button variant="secondary">
              <Plus className="size-4" /> New quotation
            </Button>
          </Link>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="size-8" />}
          title="No templates yet"
          description="Open a quotation and use “Save as template” to capture its sections and line items as a reusable preset."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-[var(--color-ink-secondary)]">
                  <LayoutTemplate className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[var(--color-ink)]">{t.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)] tabular">
                    Created {fmtDate(t.created_at)}
                  </p>
                </div>
              </div>

              {t.description && (
                <p className="mt-3 line-clamp-2 text-sm text-[var(--color-ink-secondary)]">
                  {t.description}
                </p>
              )}

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
                <form action={newQuotationFromTemplateAction}>
                  <input type="hidden" name="templateId" value={t.id} />
                  <Button type="submit" variant="primary" size="sm">
                    <FileText className="size-4" /> New quote from this
                  </Button>
                </form>

                <form action={deleteTemplateAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]"
                  >
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
