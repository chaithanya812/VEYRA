import type { ItemType, Uom } from "@/lib/items-model";

/** Human labels for item types (Dzylo "Goods Type", unified into one enum). */
export const typeLabel: Record<ItemType, string> = {
  material: "Material",
  service: "Service",
  labour: "Labour",
  machine: "Machine",
  module: "Module",
};

/** Short display labels for UOM codes. */
export const uomLabel: Record<Uom, string> = {
  nos: "Nos",
  sqft: "Sq.ft",
  sqm: "Sq.m",
  rft: "Running ft",
  rmt: "Running m",
  sheet: "Sheet",
  kg: "Kg",
  ltr: "Litre",
  set: "Set",
  pair: "Pair",
  box: "Box",
  roll: "Roll",
  bag: "Bag",
  hour: "Hour",
  day: "Day",
};

/** Compact UOM (used in dense tables), e.g. "/sqft". */
export function perUom(uom: Uom): string {
  return `/${uomLabel[uom]}`;
}
