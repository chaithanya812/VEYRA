/**
 * Procurement vocabulary — one authored map, never inline in JSX, never
 * produced by an LLM. Each body is one or two sentences for a tooltip /
 * inline hint, not documentation.
 *
 * Shape mirrors `VOCAB` in prompt-library-model.ts: a plain exported keyed
 * map with a matching test.
 */

export interface ExplainerEntry {
  term: string;
  body: string;
}

export const PROCUREMENT_EXPLAINERS = {
  place_of_supply: {
    term: "Place of Supply",
    body: "The GST state where the goods are delivered. It decides whether the invoice is intra-state (CGST + SGST) or inter-state (IGST).",
  },
  rfq_vs_proxy: {
    term: "RFQ vs filling a quote in",
    body: "An RFQ is the request you send to vendors. Filling a quote in is you typing their bid after they emailed or phoned it — it is still their bid.",
  },
  resend_for_revision: {
    term: "Resend for revision",
    body: "Saving a bid again adds a new version; earlier versions stay in the record. Use it when a vendor revises a rate, not to overwrite history.",
  },
  l1_l2_l3: {
    term: "L1 / L2 / L3",
    body: "Rank on landed cost, cheapest first. L1 is the lowest, L2 the next, L3 the third. Rank informs the award; it does not decide it.",
  },
  po_vs_wo: {
    term: "PO vs WO",
    body: "A purchase order buys goods. A work order buys labour or a site service. Same document spine; the type is what the vendor is being asked to do.",
  },
  order_vs_payment_state: {
    term: "Order state vs payment state",
    body: "Order state is fulfilment — drafted, sent, delivered. Payment state is money — unpaid, partial, paid. They move independently: goods can arrive before you pay.",
  },
  partial_delivery: {
    term: "Partial delivery",
    body: "Receive only what actually arrived. The order is partially delivered while received quantity is below ordered, and fully delivered when every line is in.",
  },
  company_vs_project_warehouse: {
    term: "Company vs project warehouse",
    body: "A company warehouse is a shared godown every project can draw from. A project warehouse is a site store that belongs to exactly one project and is never shared.",
  },
  good_type: {
    term: "Good Type",
    body: "A merchandising class such as Raw Material or Consumable. It is free text, separate from the Type enum (material, labour, machine) and from Category.",
  },
  negative_margin: {
    term: "Negative margin",
    body: "A percentage stripped off the quoted sell rate to get the buy rate. 0% buys at the quoted rate; a margin that would make the buy rate negative is refused.",
  },
  grn: {
    term: "GRN",
    body: "A Goods Receipt Note — the numbered inward document that books received goods into a warehouse. An outward movement is an issue note, not a GRN.",
  },
  goods_value: {
    term: "Goods Value",
    body: "The ledger's own sum: every inward line at its recorded rate, less every outward one. It is not FIFO or a weighted-average valuation.",
  },
} as const satisfies Record<string, ExplainerEntry>;

export type ExplainerKey = keyof typeof PROCUREMENT_EXPLAINERS;

/**
 * Keys screens actually pass to <Explainer />. The test asserts each exists
 * in the map; TypeScript already refuses a key the map does not have.
 */
export const SCREEN_EXPLAINER_KEYS: readonly ExplainerKey[] = [
  "place_of_supply",
  "rfq_vs_proxy",
  "resend_for_revision",
  "l1_l2_l3",
  "po_vs_wo",
  "order_vs_payment_state",
  "partial_delivery",
  "company_vs_project_warehouse",
  "good_type",
  "negative_margin",
  "grn",
  "goods_value",
];

export function getExplainer(key: ExplainerKey): ExplainerEntry {
  return PROCUREMENT_EXPLAINERS[key];
}
