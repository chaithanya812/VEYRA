import { getProcurement } from "@/lib/data/project-procurement";
import { procTabOf } from "@/lib/material-requests-model";
import { ACCEPTANCE_STATES, type AcceptanceState } from "@/lib/po-model";
import { PageHeader } from "@/components/ui/primitives";
import { ProcurementView } from "../projects/[id]/procurement/procurement-view";

function acceptOf(raw: string | undefined): AcceptanceState | null {
  return (ACCEPTANCE_STATES as readonly string[]).includes(String(raw))
    ? (raw as AcceptanceState)
    : null;
}
function otypeOf(raw: string | undefined): "purchase" | "work" {
  return raw === "work" ? "work" : "purchase";
}

/**
 * Procurement, company-wide (PLAN-V4 §10.1, frame `110014`).
 *
 * `110014` is the project procurement screen with the project un-pinned: the
 * same four sub-modules — Requests · RFQ · Orders · Acceptance — across every
 * project, plus a `Project` column and filter and the `All Requests` /
 * `Draft Requests` toggle.
 *
 * **So it is the same component and the same read, with one predicate
 * dropped.** `getProcurement({ kind: "company" })` is `getProjectProcurement`
 * without the `project_id` filter, and `ProcurementView` renders the extra
 * column. A second company-wide procurement implementation would be two
 * answers to "has this been ordered", and eventually two different ones.
 *
 * The sub-tab is resolved on the SERVER from `?view=` — a client component
 * that picks its tab in an effect server-renders the wrong one and cannot be
 * verified by fetching HTML.
 */
export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tab?: string; accept?: string; otype?: string }>;
}) {
  const { view, tab, accept, otype } = await searchParams;
  const data = await getProcurement({ kind: "company" });

  // `?tab=draft` is the old company screen's URL. It still resolves, so a
  // bookmark from before this phase lands on the Requests tab rather than a
  // page that silently ignores it.
  const initialTab = procTabOf(view ?? (tab === "draft" ? "requests" : undefined));

  const items = data.requests.reduce((n, r) => n + r.items.length, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Procurement"
        subtitle={`${data.requests.length} requests · ${items} line items · ${data.orders.length} orders across every project`}
      />

      <ProcurementView
        scope={{ kind: "company" }}
        data={data}
        initialTab={initialTab}
        initialAccept={acceptOf(accept)}
        initialOtype={otypeOf(otype)}
      />
    </div>
  );
}
