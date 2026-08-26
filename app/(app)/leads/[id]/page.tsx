import { notFound } from "next/navigation";
import { getLeadDetail } from "@/lib/data/lead-management";
import { LeadDetailView } from "./lead-detail";

/**
 * One lead, five tabs. Fetched once on the server; the tabs swap in place.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getLeadDetail(id);
  if (!detail) notFound();

  return <LeadDetailView detail={detail} />;
}
