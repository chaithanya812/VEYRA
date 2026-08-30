import "server-only";
import {
  SMARTPLAN_JSON_SHAPE,
  parseSmartPlan,
  type SmartPlanProposal,
} from "@/lib/smartplan-model";
import { extractJson, generate, type AiAttachment } from "./provider";

/**
 * SmartPlan (PLAN-V4 §9.2, the `SmartPlan` button on every scope band in
 * `105010`).
 *
 * The model reads what the project is — type, scope group, how long there is
 * until handover — plus any attached floor plan or BOQ, and returns the
 * SEQUENCE: which milestones, in what order, how long each runs, and what waits
 * on what.
 *
 * It returns no dates and no money. `datePlan()` computes every date from a
 * start the user picked, and `parseSmartPlan()` drops any step that arrives
 * carrying a rate, a cost or a quantity. That is the same split as the AI BOQ:
 * the model is good at structure and has no business deciding what happens on
 * the 14th of March or what a day of carpentry costs.
 */

const SYSTEM_PROMPT = `You are a senior project planner for the Indian interior fit-out and modular-furniture
industry. Given a project's type, its scope group and how many days remain until handover — plus any
attached floor plans, BOQs or briefs — propose the SEQUENCE OF MILESTONES for that scope group.

HARD RULES:
- NEVER output a price, rate, cost, amount, budget, quantity, unit of measure or currency of any
  kind. If you include one, the milestone is discarded.
- NEVER output a calendar date. Use relative day offsets from the start of the plan; the first
  milestone starts at offset 0. Real dates are computed downstream from a date a person chose.
- "depends_on" holds indices of EARLIER milestones in your own list. Never a later one, never itself.
- Keep the plan realistic for the number of days available: the last milestone should finish at or
  before that horizon.
- Use the vocabulary of the trade — "False Ceiling Channel Work", "POP Punning Work", "Site Marking",
  "ModularWoodwork Ordering" — not generic phases like "Phase 1".
- Between 4 and 20 milestones. Fewer is better than padding.
- Respond with ONLY a single valid JSON object matching this exact shape — no prose, no code fences:

${SMARTPLAN_JSON_SHAPE}`;

export interface SmartPlanInput {
  /** The scope band being planned — "Execution Team", "Design Team", … */
  scopeGroup: string;
  projectName: string;
  /** Free text: what kind of project this is, site notes, anything relevant. */
  brief?: string;
  /** Days from the plan's start to the target handover, when one is known. */
  horizonDays?: number | null;
  /** Milestones already on the plan, so the model does not propose them again. */
  existing?: string[];
  attachments?: AiAttachment[];
}

/**
 * Ask for a sequence. Returns a validated, price-free, date-free proposal or a
 * message safe to show a user — never throws.
 */
export async function proposeMilestones(
  input: SmartPlanInput,
): Promise<{ plan: SmartPlanProposal } | { error: string }> {
  const scopeGroup = input.scopeGroup.trim();
  if (!scopeGroup) return { error: "Which scope group should this plan cover?" };

  const lines = [
    `Project: ${input.projectName.trim() || "Interior fit-out"}`,
    `Scope group to plan: ${scopeGroup}`,
  ];
  if (input.horizonDays && input.horizonDays > 0) {
    lines.push(`Days available before handover: ${Math.round(input.horizonDays)}`);
  }
  if (input.brief?.trim()) lines.push(`Brief: ${input.brief.trim()}`);
  if (input.existing?.length) {
    lines.push(
      `Already on the plan — do not repeat these: ${input.existing.slice(0, 60).join(", ")}`,
    );
  }

  const result = await generate({
    system: SYSTEM_PROMPT,
    user: lines.join("\n"),
    attachments: input.attachments,
    json: true,
    maxTokens: 4000,
  });
  if ("error" in result) return result;

  try {
    return parseSmartPlan(extractJson(result.text));
  } catch {
    return { error: "Could not read SmartPlan's response. Try again with a shorter brief." };
  }
}
