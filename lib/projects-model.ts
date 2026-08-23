/**
 * Client-safe projects model — enums and types with NO server-only import, so
 * both client components (forms) and the server data module can share them.
 * The server logic lives in lib/data/projects.ts.
 */
export const PROJECT_STAGES = [
  "planning",
  "design",
  "execution",
  "handover",
  "closed",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PROJECT_HEALTH = [
  "on_track",
  "delayed",
  "budget_exceeded",
] as const;
export type ProjectHealth = (typeof PROJECT_HEALTH)[number];

export interface Project {
  id: string;
  name: string;
  client_name: string | null;
  lead_id: string | null;
  stage: ProjectStage;
  health: ProjectHealth;
  project_value: number;
  funds_received: number;
  total_payable: number;
  start_date: string | null;
  handover_date: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  physical_progress_pct: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  kind: string;
  note: string | null;
  created_at: string;
}

/** Status semantics only — red (`alert`) is reserved for TRUE alerts (DESIGN-DIRECTION §2). */
export type HealthTone = "positive" | "warning" | "alert";

export const HEALTH_META: Record<
  ProjectHealth,
  { label: string; tone: HealthTone }
> = {
  on_track: { label: "On track", tone: "positive" },
  delayed: { label: "Delayed", tone: "warning" },
  budget_exceeded: { label: "Budget exceeded", tone: "alert" },
};

export const STAGE_LABELS: Record<ProjectStage, string> = {
  planning: "Planning",
  design: "Design",
  execution: "Execution",
  handover: "Handover",
  closed: "Closed",
};

/**
 * Project P&L from stored values only: contract value minus total payable.
 * Pure arithmetic on user-entered config — no LLM ever produces a number here
 * (HARD RULE 4). Number() guards against PostgREST returning numerics as strings.
 */
export function computePnl(
  p: Pick<Project, "project_value" | "total_payable">,
): number {
  return Number(p.project_value) - Number(p.total_payable);
}
