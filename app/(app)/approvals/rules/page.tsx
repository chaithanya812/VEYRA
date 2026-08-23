import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listRules } from "@/lib/data/approvals";
import type { ApprovalRule } from "@/lib/approvals-model";
import { PageHeader } from "@/components/ui/primitives";
import { RulesTable } from "./rules-table";

export default async function ApprovalRulesPage() {
  const rules = await listRules();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/approvals"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to approvals
      </Link>
      <PageHeader
        title="Approval rules"
        subtitle="Per-module rupee thresholds — a draft at or above the threshold needs sign-off before it proceeds."
      />

      <RulesTable rows={rules as ApprovalRule[]} />
    </div>
  );
}
