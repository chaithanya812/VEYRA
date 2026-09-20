/**
 * Self-clearing demo notice — pure decision, no I/O.
 *
 * A starter row is flagged `is_demo`. The notice explains those samples, and
 * it must disappear the moment the tenant has authored even one real row.
 * Empty lists show nothing: there is no demo content to explain.
 *
 * Demo rows stay usable (a sample payment plan can still attach to a PO).
 * They simply do not count as the tenant having configured the list.
 */

export type DemoFlagged = { is_demo?: boolean | null };

/** True only when there is ≥1 demo row and ZERO non-demo rows. */
export function shouldShowDemoNotice(
  rows: ReadonlyArray<DemoFlagged>,
): boolean {
  if (rows.length === 0) return false;
  let demo = 0;
  for (const r of rows) {
    if (r.is_demo) demo += 1;
    else return false;
  }
  return demo > 0;
}

/** Rows the tenant authored. Demo samples are excluded. */
export function tenantAuthoredCount(
  rows: ReadonlyArray<DemoFlagged>,
): number {
  let n = 0;
  for (const r of rows) {
    if (!r.is_demo) n += 1;
  }
  return n;
}
