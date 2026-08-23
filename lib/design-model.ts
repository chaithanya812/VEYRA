/**
 * Client-safe design-vault model — enums and types with NO server-only import,
 * so both client components (forms) and the server data module can share them.
 * The server logic lives in lib/data/design.ts.
 *
 * Sign-off colour contract (HARD RULE 5 / DESIGN-DIRECTION §2): rejected is
 * RED (a true alert — it blocks site execution), pending is AMBER, approved is
 * GREEN. Red is reserved for the rejection state, destructive actions, and the
 * one primary action per view — nothing else.
 */
export const ASSET_KINDS = [
  "2d",
  "3d",
  "boq",
  "render",
  "photo",
  "other",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const KIND_LABELS: Record<AssetKind, string> = {
  "2d": "2D drawing",
  "3d": "3D model",
  boq: "BOQ",
  render: "Render",
  photo: "Photo",
  other: "Other",
};

export function kindLabel(kind: string): string {
  return (ASSET_KINDS as readonly string[]).includes(kind)
    ? KIND_LABELS[kind as AssetKind]
    : KIND_LABELS.other;
}

export const SIGNOFF_STATUSES = ["pending", "approved", "rejected"] as const;
export type SignoffStatus = (typeof SIGNOFF_STATUSES)[number];

/** Matches StatusChip tones directly (components/ui/primitives.tsx). */
export type SignoffTone = "amber" | "green" | "red";

export const SIGNOFF_META: Record<
  SignoffStatus,
  { label: string; tone: SignoffTone }
> = {
  pending: { label: "Awaiting sign-off", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export interface Asset {
  id: string;
  project_label: string | null;
  name: string;
  kind: AssetKind;
  url: string | null;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AssetComment {
  id: string;
  asset_id: string;
  x_pct: number | string | null;
  y_pct: number | string | null;
  body: string;
  author: string | null;
  created_at: string;
}

export interface AssetSignoff {
  id: string;
  asset_id: string;
  status: SignoffStatus;
  note: string | null;
  signed_by: string | null;
  signed_at: string | null;
  created_at: string;
}

/**
 * Human label for a comment's pin position, e.g. "pin @ 40%,60%". Null when
 * the comment has no pin (plain remark). Accepts strings because PostgREST may
 * hand numerics back as strings; output rounds to at most 2 decimals.
 */
export function pinLabel(
  xPct: number | string | null,
  yPct: number | string | null,
): string | null {
  if (xPct == null || yPct == null) return null;
  const x = Number(xPct);
  const y = Number(yPct);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const r = (n: number) => Math.round(n * 100) / 100;
  return `pin @ ${r(x)}%,${r(y)}%`;
}

/**
 * Latest sign-off per asset from a newest-first list (listSignoffs orders by
 * created_at desc), so the first row seen for an asset wins. Pure — no I/O.
 */
export function latestSignoffByAsset(
  signoffs: AssetSignoff[],
): Map<string, AssetSignoff> {
  const map = new Map<string, AssetSignoff>();
  for (const s of signoffs) {
    if (!map.has(s.asset_id)) map.set(s.asset_id, s);
  }
  return map;
}
