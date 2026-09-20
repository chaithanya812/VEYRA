/**
 * Client-safe PO payment-plan model — PURE helpers with NO server-only import,
 * so the settings form can validate as the user types and the PO detail page
 * can derive rupee rows, while the server action remains authoritative.
 *
 * Two jobs, both arithmetic on numbers a person typed:
 *   1. validateMilestones — refuse an empty plan, a pct ≤ 0, or a set that
 *      does not sum to 100% (0.01 tolerance for 2dp input).
 *   2. allocateMilestoneAmounts — pct% × PO amount, rounded so the rows
 *      ALWAYS foot to the PO amount (running cumulative; last row absorbs
 *      the remainder). Naive per-row round2(pct/100 × amount) drifts by
 *      paise on thirds; this does not.
 *
 * No LLM ever produces a number. No amount is stored on a milestone.
 */

function num(n: number | string | null | undefined): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Integer hundredths — paise for rupees, 2dp for percentages. */
function hundredths(n: number | string | null | undefined): number {
  return Math.round(num(n) * 100);
}

export interface MilestonePct {
  label: string;
  pct: number;
}

export interface AllocatedMilestone extends MilestonePct {
  /** Derived rupees: never stored, always recomputed from pct × PO amount. */
  amount: number;
}

export type ValidateMilestonesResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Authoritative pct rules. The server action calls this before writing; the
 * client may call it for instant feedback. An empty list, a non-positive pct,
 * or a set that does not add up to 100% (within 0.01) is refused in words a
 * person can act on.
 */
export function validateMilestones(
  rows: { label?: string; pct: number | string }[],
): ValidateMilestonesResult {
  if (rows.length === 0) {
    return { ok: false, error: "A payment plan needs at least one milestone." };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = (row.label ?? "").trim() || `Milestone ${i + 1}`;
    const pct = Number(row.pct);
    if (!Number.isFinite(pct) || pct <= 0) {
      return {
        ok: false,
        error: `"${label}" must have a percentage greater than 0.`,
      };
    }
  }

  const sumHundredths = rows.reduce((s, r) => s + hundredths(r.pct), 0);
  if (Math.abs(sumHundredths - 10000) > 1) {
    const sum = sumHundredths / 100;
    return {
      ok: false,
      error: `Milestone percentages must add up to 100% (they add up to ${sum}%).`,
    };
  }

  return { ok: true };
}

/**
 * Derive each milestone's rupee amount from the PO's stored `amount`.
 *
 * Running cumulative: row i is round2(Σpct[0..i]/100 × amount) minus the
 * running total already handed out, so rounding error never accumulates.
 * The final row takes whatever is left so Σ rows === the PO amount exactly,
 * including awkward splits (thirds, 2dp pcts, amounts that do not divide
 * evenly into paise).
 */
export function allocateMilestoneAmounts(
  rows: MilestonePct[],
  poAmount: number | string | null | undefined,
): AllocatedMilestone[] {
  const totalPaise = hundredths(poAmount);
  if (rows.length === 0) return [];

  let runningPaise = 0;
  let cumPct = 0;
  return rows.map((row, i) => {
    const pct = num(row.pct);
    if (i === rows.length - 1) {
      return { label: row.label, pct, amount: (totalPaise - runningPaise) / 100 };
    }
    cumPct += pct;
    const targetPaise = Math.round((cumPct / 100) * totalPaise);
    const amountPaise = targetPaise - runningPaise;
    runningPaise += amountPaise;
    return { label: row.label, pct, amount: amountPaise / 100 };
  });
}
