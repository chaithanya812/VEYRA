# VEYRA Feature-Coverage Report

*Read-only audit by a Claude sub-agent. Verdicts derived by reading `lib/data/*`,
`lib/*-model.ts`, `supabase/migrations/*`, and `app/(app)/*` routes against
`competitor-research/FEATURE-REGISTER.md`. Nothing was modified.*

> Note: this audit ran just before the Production **nesting + panel-QR** merge
> (commit `0813857`), so it lists that as "unmerged/missing" — it is now merged
> and live. Measurement-mode is reflected as implemented.

## 1. Executive summary

VEYRA is a **genuinely functional multi-module ERP shell**, not AI slop. Almost every
nav item resolves to a real page backed by a real data layer, a real migration, and a
pure engine with tests. The architecture is consistent and disciplined: every tenant
read/write goes through `withOrg()` (org isolation by construction; RLS deliberately off),
money is always computed by pure engines from stored config, and the "no-LLM-pricing" rule
is honoured everywhere.

The weakness is **depth at the seams**. Most modules implement the *record + list + detail*
core but stop before the cross-module workflow that the register treats as the actual value
(award→PO, dispatch, QC, 3-way match, nesting/QR, e-invoicing). And the single biggest
headline — the **AI layer — does not exist at all**.

**Scored across the 68 active feature rows** (deferred/rejected rows excluded):

| Status | Count | % |
|---|---|---|
| ✅ Implemented | 19 | ~28% |
| 🟡 Partial | 28 | ~41% |
| ❌ Missing | 21 | ~31% |

Credit-partials-at-half weighted coverage ≈ **48%**.

### The 5 biggest gaps

1. **No AI anywhere.** Zero Anthropic/LLM integration in the entire repo. Every AI feature is
   unbuilt: AI prompt-to-BOQ, MR "AI parse", call recording/transcription/AI disposition, and
   the AI-credit meter (the ledger exists but nothing AI feeds it). REQ-01's Claude-only
   pipeline is vaporware today.
2. **Procurement chain breaks at the award.** `awardRfq()` only flips status — PO creation is
   "deliberately NOT built here" (`rfq.ts:485`). So one-click PO / split-award is missing,
   there is no OTP vendor portal (bids are proxy-entry only), no dispatch, no QC step, no
   3-way match, no landed-cost valuation / lot-batch / moving-average.
3. **The production moat is shallow.** *(now improved — nesting+QR merged after this audit.)*
   BOM lines + cutlist panels exist (grain/edge-banding/waste) but there is no `[id]` drill-in.
4. **Platform governance is placeholder-heavy.** No seat/user-management UI, no 2FA, no
   audit-log service, and field-level visibility is unenforced (the permission `scope` enum is
   stored but never gates a query). 4 of 6 config layers are "Soon" cards.
5. **Finance stops at cash tracking.** Contracts/milestones/payments/P&L work, but no GST
   invoice / e-invoice IRN / e-way-bill, no petty-cash/voucher, no reusable payment-plan
   master. Metering (REQ-04) is real but wired into quotations only.

## 2. Per-module coverage

| Module | Status | Cov. | Key working parts | Key missing parts |
|---|---|---|---|---|
| Platform / Admin / Config | 🟡 | ~40% | Multi-tenant isolation via `withOrg`; FY-segmented numbering; roles×(module,action,scope) matrix | No seat/user mgmt UI; no 2FA; no audit log; field-visibility unenforced; 4 "Soon" config tiles |
| Subscription / Trial (REQ-04) | 🟡 | ~55% | Append-only usage ledger, derived quota, read-only-at-expiry gate; Billing page | Metering wired to quotations only; no seat counter; AI-credit metric never populated |
| Master Data & Catalogue | ✅ | ~70% | Item master + dedupe + bulk CSV import; multi-UOM; catalogue autocomplete reused everywhere | No variants; no image-zip; no parametric module/hardware masters |
| CRM & Sales | 🟡 | ~55% | Phone-dedupe leads; Kanban + configurable stages; follow-up buckets; sales funnel | Single assignee; no stage SLA/ageing; no 360° typed profile; no public capture form |
| Interaction / Telephony (REQ-03) | 🟡 | ~35% | One channel-agnostic interactions table, manual logging, connect-rate | Manual only — no dialer; no dispatch outbox; no recording/AI; no wallboard |
| Estimation & Quotation | ✅ | ~80% | Section BOQ engine, margin/discount/GST split, measure-mode qty; versioning+diff; templates; `/q/[token]` share + PDF; cost roll-up | AI prompt-to-BOQ missing; quote threshold-approval not clearly wired to approvals |
| Projects & Site | 🟡 | ~60% | Portfolio + health; design vault (pin-comments + sign-off); site logs + photos; geo attendance; measurement variance (the wedge) | Project hub thin (stage+notes); no WBS/tasks; no labour master |
| Procurement & Vendors | 🟡 | ~45% | MR w/ ad-hoc flag; RFQ multi-vendor + versioned bids + landed-cost rank; proxy bid entry; dual-state PO + partial receipts; rate contracts | Award doesn't create PO; no split-award; no OTP portal; no dispatch; no QC; no 3-way match; no valuation; vendor rating never computed |
| Inventory & Warehouse | 🟡 | ~50% | Warehouses; append-only movement ledger w/ stock projection; stock-in w/ rate/GST/HSN; GRN auto-gen + PO link | No moving-avg valuation; no lot/batch; no ITC split; no inter-site transfer; no Excel/Tally export |
| Production / Factory (moat) | 🟡→ | ~25%→ | BOM explosion w/ waste-adjusted qty; cutlist w/ grain + edge-banding + totals. **Nesting + panel-QR + work centers now merged (0021).** | No BOM/cutlist detail route; no CNC/DXF export |
| Finance & Billing | 🟡 | ~45% | Contracts + milestone billing + inflow/outflow + P&L; cash summary; 6 read-only reports | No GST invoice / e-invoice IRN / e-way-bill; no petty-cash; no payment-plan master; no cash-flow trends |
| Approvals | 🟡 | ~50% | Generic threshold engine: request→approve/reject w/ mandatory comment; per-module rules | Single-step only — no chains/thresholds/delegation/escalation; unclear which modules raise requests |
| Reports | ✅ | ~70% | 6 real aggregations: funnel, receivables ageing, vendor spend, stock, GST, project P&L | No export; vendor "performance" is spend, not a computed rating |

## 3. Prioritized missing / partial features

### P1 — core workflow the register treats as load-bearing
- **RFQ award → PO** (one-click + split award): map winning bid lines → `createPurchaseOrder`.
- **OTP vendor portal** for RFQ bids: public tokenized bid entry like `/q/[token]` + email OTP.
- **AI prompt-to-BOQ** (REQ-01): Claude structures scope → existing engine prices → validator verifies.
- **MR "AI parse"** (PROC-MR-002): paste/upload → Claude → catalogue-matched draft MR lines.
- **3-way match + QC on receiving**: accept/reject/quarantine per receipt line; match PO↔GRN↔bill.
- **Landed-cost / lot-batch / moving-avg valuation**: extend `stock_movements`.
- **Field-level visibility enforcement**: the `scope` enum is stored but never gates reads (esp. cost columns on site screens).
- **Labour master + cost-vs-budget** feeding project P&L.
- **GST invoice / e-invoice IRN / e-way-bill**.
- **Production depth**: BOM/cutlist `[id]` drill-in, CNC/DXF export (nesting+QR now done).

### P2 — governance, dispatch, breadth
- Approval chains/delegation/escalation + wire quote/PO/MR create paths into it.
- Audit-log service (append-only, surfaced everywhere).
- Seat/user management UI + per-seat counter.
- RFQ/PO dispatch outbox (WhatsApp/email) writing interactions rows.
- Broaden REQ-04 metering to BOQs/exports/users.
- Vendor performance rating computed from PO/GRN history.
- Inter-site stock transfer with transit approval.
- Project hub rework — module tab-bar + embedded financials/procurement + in-page P&L.
- 2FA; reusable payment-plan master; T&C clause library; doc-branding/PDF-template config.

### P3 — differentiation polish
- Multi-assignee leads; stage SLA/ageing/rot alerts; 360° typed lead profile; public lead-capture form.
- Item variants, multi-UOM conversion UI, image-zip import; parametric module/hardware masters.
- Gamified call wallboard; conversion-trend/referral KPIs; report Excel/PDF export; cash-flow trends; petty-cash voucher.

## 4. Design-fidelity note (functional divergence from the frames)

- **Procurement flow diverges most.** The frames imply a continuous RFQ→compare→award→PO→
  receive→GRN→match loop; VEYRA renders each screen but the **award-to-PO join is severed** and
  there's no vendor-facing bid portal — so the demo-critical "click the L1 winner, PO drafts
  itself" moment doesn't exist.
- **Production page** is a flat two-form list where §6.6 implies a factory workspace (BOM tree →
  cutlist → nesting layout → labeled/QR panels → work centers). *(Nesting/QR now merged; the
  page still reads more like data-entry than a factory workspace.)*
- **Single-project hub** should be a tabbed hub with financials, milestones, embedded procurement;
  VEYRA's `projects/[id]` is a stage-control + notes page.
- **Communication** should mirror a dialer + call-log + connect-rate wallboard; VEYRA's is a
  manual "log interaction" dialog (right table shape, none of the telephony path).
- **Settings** should present the whole config catalogue; VEYRA shows 2 live layers and 4
  disabled "Soon" tiles.

Screens that **do** match their intended function well: the **Quotation builder** (section BOQ,
versioning, diff, share, PDF, GST), **Design vault** (pin-comments + sign-off), **Site
measurement variance** (the wedge), and the **RFQ bid-comparison matrix** (landed-cost ranking).
These are the strongest, most demo-ready parts of the build.

*Assessed functional fidelity from code + the analysis docs; did not pixel-compare the 116 frames.*
