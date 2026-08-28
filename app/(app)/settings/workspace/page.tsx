import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActingContext, listMembers } from "@/lib/data/team";
import { ensureDefaultOptions, listOptions } from "@/lib/data/workspace";
import { listLeadStatuses } from "@/lib/data/lead-management";
import { canConfigureOrg } from "@/lib/workspace-model";
import { SetupPanel } from "../../dashboard/panels-team";
import { LeadStatusEditor } from "./lead-statuses";

/**
 * Workspace configuration: the people in this workspace and every dropdown the
 * app offers them — task types, priorities, expense categories, leave types,
 * visit purposes, lead sources, budget bands, scope, property types and
 * follow-up outcomes. All of it is data the tenant owns.
 */
export default async function WorkspaceSettingsPage() {
  await ensureDefaultOptions();
  const [options, members, acting, statuses] = await Promise.all([
    listOptions(),
    listMembers(),
    getActingContext(),
    listLeadStatuses(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to settings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold text-[var(--color-ink)]">
        Workspace &amp; people
      </h1>
      <p className="mb-6 text-sm text-[var(--color-ink-secondary)]">
        Who works here, and every list the app offers them. Rename anything;
        retire what you do not use; add your own.
      </p>

      <SetupPanel
        options={options}
        members={members}
        canConfigure={canConfigureOrg(acting.member.role)}
      />

      {/* The one place lead statuses are edited. /pipeline/stages used to sit
          here too, writing to a table nothing read (PLAN-V4 §6.1). */}
      <LeadStatusEditor statuses={statuses} />
    </div>
  );
}
