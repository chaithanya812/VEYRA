/**
 * The scope item — "the architectural heart" from PLAN §1.1, finally built
 * (PLAN-V4 §7). Pure and client-safe.
 *
 * A scope item is one thing the firm agreed to deliver: a wardrobe, a false
 * ceiling, 54 sqft of granite. Every module's line table points at it, so a
 * quoted line, the material requested for it, the PO that bought it and the
 * panel that was cut all resolve to the same row. Before this, each module had
 * a private line table and nothing joined them.
 *
 * Nesting is one level in practice — a room parent with item children, which is
 * how a BOQ reads — but the FK is self-referential, so deeper is legal.
 */

export interface ScopeItem {
  id: string;
  project_id: string | null;
  quotation_id: string | null;
  parent_id: string | null;
  code: string | null;
  name: string;
  room: string | null;
  uom: string | null;
  qty: number | string | null;
  sort_order: number;
  created_at: string;
}

export interface ScopeNode extends ScopeItem {
  children: ScopeNode[];
}

/** Roots with their children attached, each level in sort order. */
export function buildScopeTree(items: ScopeItem[]): ScopeNode[] {
  const byId = new Map<string, ScopeNode>();
  for (const i of items) byId.set(i.id, { ...i, children: [] });

  const roots: ScopeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    // An orphan — a parent deleted or filtered out — surfaces as a root rather
    // than vanishing from the tree.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const bySort = (a: ScopeNode, b: ScopeNode) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  roots.sort(bySort);
  for (const n of byId.values()) n.children.sort(bySort);
  return roots;
}

/**
 * The scope items you can actually order material against: leaves with a
 * quantity. A room parent carries no quantity of its own, and requesting
 * "Kitchen" as a line item is how a material request becomes uncheckable.
 */
export function orderableScope(items: ScopeItem[]): ScopeItem[] {
  const parentIds = new Set(items.map((i) => i.parent_id).filter(Boolean) as string[]);
  return items.filter((i) => !parentIds.has(i.id) && num(i.qty) > 0);
}

/** A scope item's display name, room-qualified when it has one. */
export function scopeLabel(item: Pick<ScopeItem, "name" | "room">): string {
  const room = item.room?.trim();
  return room && room !== item.name.trim() ? `${room} — ${item.name}` : item.name;
}

export function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
