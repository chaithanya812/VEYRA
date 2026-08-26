import "server-only";
import { withOrg } from "./with-org";
import { listOptions } from "./workspace";
import { optionLabel } from "@/lib/workspace-model";

/**
 * The scope a lead has already told us about, rendered as a short brief the AI
 * can read alongside whatever the user types.
 *
 * This is the payoff for capturing budget, scope, rooms and layout size as
 * typed fields on the lead (migration 0024) rather than as free text: the
 * quotation's AI starts from what the salesperson already recorded instead of
 * asking someone to describe the same project a second time.
 *
 * Deliberately excludes the budget figure. The AI must not see a number it
 * could try to allocate — it returns scope, and the engine prices it.
 */
export async function leadScopeContext(
  leadId: string | null | undefined,
): Promise<string | null> {
  if (!leadId) return null;

  const { db } = await withOrg();
  const { data } = await db
    .table("leads")
    .select(
      "project_name, project_type, scope, layout_sqft, theme, rooms, description, city, org_type",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;

  const lead = data as unknown as {
    project_name: string | null;
    project_type: string | null;
    scope: string | null;
    layout_sqft: number | null;
    theme: string | null;
    rooms: string[] | null;
    description: string | null;
    city: string | null;
    org_type: string | null;
  };

  const options = await listOptions();
  const parts: string[] = [];

  if (lead.project_name) parts.push(`Project: ${lead.project_name}`);
  if (lead.project_type) {
    parts.push(`Property type: ${optionLabel(options, "project_type", lead.project_type)}`);
  }
  if (lead.org_type) parts.push(`Segment: ${lead.org_type}`);
  if (lead.layout_sqft) parts.push(`Layout size: ${lead.layout_sqft} sq ft`);
  if (lead.scope) parts.push(`Scope of work: ${optionLabel(options, "lead_scope", lead.scope)}`);
  if (lead.rooms && lead.rooms.length > 0) parts.push(`Rooms in scope: ${lead.rooms.join(", ")}`);
  if (lead.theme) parts.push(`Preferred theme: ${lead.theme}`);
  if (lead.city) parts.push(`Location: ${lead.city}`);
  if (lead.description) parts.push(`Client's own words: ${lead.description}`);

  return parts.length > 0 ? parts.join("\n") : null;
}
