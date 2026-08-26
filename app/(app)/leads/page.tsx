import { getLeadListData } from "@/lib/data/lead-management";
import { LeadsTable } from "./leads-table";

/**
 * Lead Management — the list. Everything is fetched once here on the server;
 * search, filtering, sorting and column visibility are client-side over that
 * payload, so working the list never costs a round-trip.
 */
export default async function LeadsPage() {
  const data = await getLeadListData();

  return (
    <LeadsTable
      leads={data.leads}
      statuses={data.statuses}
      options={data.options}
      members={data.members}
      total={data.total}
      value={data.value}
    />
  );
}
