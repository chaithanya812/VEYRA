import { getFollowUpsOverview } from "@/lib/data/followups";
import { FollowUpsView } from "./followups-view";

/**
 * Follow-ups: Overview · Follow-ups · Call logs · Team, swapped in place.
 * One server fetch feeds all four; the tiles and the tables read the same rows.
 */
export default async function FollowUpsPage() {
  const data = await getFollowUpsOverview();
  return <FollowUpsView data={data} />;
}
