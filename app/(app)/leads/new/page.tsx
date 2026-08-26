import { listLeadStatuses } from "@/lib/data/lead-management";
import { ensureDefaultOptions, listOptions } from "@/lib/data/workspace";
import { listMembers } from "@/lib/data/team";
import { NewLeadForm } from "./new-lead-form";

export default async function NewLeadPage() {
  await ensureDefaultOptions();
  const [statuses, options, members] = await Promise.all([
    listLeadStatuses(),
    listOptions(),
    listMembers(),
  ]);

  return <NewLeadForm statuses={statuses} options={options} members={members} />;
}
