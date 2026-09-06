# VEYRA — End-to-end test report

**Date:** 2026-09-05 · **Branch:** quotations-v2-plus-fleet · **Tested against:** local dev
(`localhost:3010`), with production (`veyra-five-beta.vercel.app`) used to confirm anything
that looked environment-specific.
**Mandate:** report only. Nothing was fixed. No app code was changed.

---

## 1. Headline

**The build is in good shape.** All 74 routes render, the permission spine works, and the
money engine is internally consistent everywhere it matters — the project finance screen, the
payments dashboard, the receivables screen and the vendor projects screen all agree to the
rupee, using the settled Contracted / Billed / Dues vocabulary.

**Four things are genuinely wrong.** One of them is serious: a report that tells the owner
nothing is overdue when ₹7,00,000 is six weeks late.

| # | Severity | Finding |
|---|---|---|
| 1 | **High** | Receivables Ageing report reports ₹0 overdue when ₹7,00,000 is overdue, and overstates receivables by ₹5,40,000 |
| 2 | **Medium-high** | The `reports.*` permission gate is cosmetic — every figure it withholds is reachable elsewhere |
| 3 | **Medium** | "P&L" names two different quantities on two screens, differing by ₹10,50,000 |
| 4 | **Medium** | `/projects/[id]/finance` and `/billing` carry no capability guard at all |

Plus four low-severity observations in §5.

---

## 2. What was tested, and how

**Method.** Every route was fetched and judged on its **rendered body**, never its status code
— a 200 can be a streamed `notFound()`. Money figures were checked against the database with
`db.mjs`, not against another screen. Permission behaviour was tested by switching actor with
the `veyra_acting_member` cookie across three personas, and the sweep **asserts the actor
actually changed** on all 45 routes before trusting a single result, because a silently-ignored
cookie makes a permission test pass while proving nothing.

**Covered**

- All 74 routes (71 `page.tsx` + parameterised variants), smoke-swept for render failures.
- Money correctness: client contract, vendor contract, milestones, payments — screen vs database.
- Cross-screen consistency of the settled Contracted / Committed / Billed / Dues vocabulary.
- Permission matrix: 45 routes × 3 personas (owner / manager / member).
- Write path: lead creation, including validation refusal and the post-submit redirect.

**Not covered — the honest list.** These need a second pass:

- The quotation builder end to end: sections, lines, measurement mode, discounts, GST, totals,
  approval, and the tokenised `/q/[token]` client link.
- The procurement chain: material request → approval → RFQ → bids → PO → receipt → GRN → stock.
- HR: check in/out, leave apply/approve, WFH, holidays, the attendance report.
- Inventory movements and warehouse transfers.
- Design sign-off, document upload and versioning, site photos, labour entries.
- Saved views, the column chooser, and every CSV export.
- Settings: numbering series, quotation defaults, role editing.
- Any mutation performed from a client component (the `router.refresh()` spring-back class).

---

## 3. Findings

### 3.1 HIGH — Receivables Ageing reports ₹0 overdue while ₹7,00,000 is overdue

**Where:** `/reports/receivables-ageing` · `lib/data/reports.ts:122` (`receivablesAgeing`) ·
config at `app/(app)/reports/reports-config.tsx:124`

**What the two screens say about the same question:**

| | `/finance/receivables` | `/reports/receivables-ageing` |
|---|---|---|
| Overdue | **₹7,00,000** (2 milestones) | **₹0** |
| Not yet due | ₹5,40,000 (1 milestone) | ₹12,40,000 "Current (not yet due)" |

**Ground truth** (client contract `428563e3`, verified in the database):

```
Agreed    ₹18,00,000
Billed    ₹12,60,000   (3 milestones with work_done = true)
Received  ₹ 5,60,000
Dues      ₹ 7,00,000   = Billed − Received
```

Two of the billed milestones fell due on 2026-07-20 and 2026-08-16 — both **past**. So
₹7,00,000 is genuinely overdue for collection.

**Two separate defects produce the wrong answer:**

1. **`lib/data/reports.ts:160`** — `outstanding = contractTotal − inflow`. That is
   **Contracted − Received** (₹18,00,000 − ₹5,60,000 = ₹12,40,000), not **Billed − Received**.
   It counts ₹5,40,000 of work that has not been done, let alone invoiced, as an outstanding
   receivable. This directly contradicts the vocabulary settled in HANDOFF-V9 §7, which
   `/finance/receivables` implements correctly.

2. **`lib/data/reports.ts:162-167`** — the "Overdue" bucket filters on `!m.work_done`, i.e.
   milestones whose work is **not** signed off and whose date has passed. That is a real
   bucket — `/finance/receivables` shows it too, and correctly calls it *"Milestone Overdue —
   work NOT signed off and its date has passed — **not yet invoiceable**"*. But the report
   labels it plain **"Overdue"** under a page titled *Receivables Ageing*. An owner reads
   "Overdue ₹0" as "nothing is late to collect". The money that *is* late — the
   "Overdue Payment" bucket, ₹7,00,000 — is not counted anywhere in this report.

   It also ages on `tentative_due` while the receivables screen uses `actual_due` where one
   exists (milestone 2: tentative 2026-08-14, actual 2026-08-16).

**Why it matters:** both numbers are wrong, and both err in the same dangerous direction —
they say collections are healthy and larger than they are. This is the report an owner or
accountant would open to decide who to chase.

---

### 3.2 MEDIUM-HIGH — The reports permission gate is cosmetic

**Where:** `lib/can-model.ts:351-358` (member tier) vs the Accounting and project screens.

The `member` tier is defined as everything except destructive capabilities, `settings.*`,
**`reports.*`**, `billing.cost.view`, and `*.approve`.

Verified with the `veyra_acting_member` cookie as Rahul Verma (member tier, no `role_id`):

| Screen | Result for a member |
|---|---|
| `/reports/receivables-ageing` | **Refused** — "needs Reports → Payments" |
| `/reports/project-profitability` | **Refused** — "needs Reports → Financial" |
| `/reports/gst-summary` | **Refused** |
| `/finance/receivables` | **Shown in full** — Contracted, Billed, Received, Dues ₹7,00,000 |
| `/finance/payments` | **Shown in full** — company-wide payments matrix, all 12 columns |
| `/projects/{id}/finance` | **Shown in full** — project value, dues, and vendor outflow |

The Accounting screens gate on `billing.payment.view`, which the member tier **does** grant.
So blocking `reports.*` withholds nothing: every figure the reports refuse is available, in
richer form, one menu across. `/finance/receivables` is a strict superset of the Receivables
Ageing report it is meant to be denied.

**This is a design question, not a code bug** — but as it stands the reports gate reads as
protection it does not provide. Either the member tier should lose `billing.payment.view`, or
`reports.*` should not be blanket-excluded. Choosing quietly is the thing to avoid.

*(Everything the gate does do, it does correctly: all three personas resolved on all 45 routes,
the refusal renders the designed `PermissionLimited` panel naming the exact capability, and
`/settings/roles` correctly refuses both manager and member.)*

---

### 3.3 MEDIUM — "P&L" means two different things, ₹10,50,000 apart

| Screen | Label | Value | Actually |
|---|---|---|---|
| `/projects/{id}/finance` | **Expected P&L** | ₹15,60,000 | Project value − estimated expenses |
| `/reports/project-profitability` | **P&L** | ₹5,10,000 | Received − disbursed, i.e. **cash flow** |

The project finance screen itself already prints ₹5,10,000 under the correct name —
**"Cash flow · funds received less disbursed"**. So the same screen family has a right word for
this number, and the report uses the wrong one.

The report's own subtitle half-admits it — *"Project value next to cash P&L booked under the
same label"* — but a column headed **P&L** in a report titled **Project Profitability** will be
read as profit by everyone who opens it.

This is precisely the collision HANDOFF-V9 §2 rule 13 warns about: *"The same words must mean
the same thing on every screen. Two of this project's worst bugs were one label over two
quantities."* Recommend renaming the report column to **Cash flow**, matching the project screen.

---

### 3.4 MEDIUM — Two money screens have no capability guard at all

`app/(app)/projects/[id]/finance/page.tsx` and `app/(app)/billing/page.tsx` contain **zero**
`can()` / `requireCan()` / `PermissionLimited` references.

- `/projects/{id}/finance` shows the full inflow and outflow picture — client contract value,
  billed, received, receivable dues, vendor estimated expenses, disbursed, committed and dues —
  to anyone who can reach the project.
- `/billing` shows plan, trial end date and metering to anyone, although `billing.cost.view` is
  deliberately excluded from the member tier. No rupee price is exposed on the Free Trial plan,
  so the practical exposure today is small — but the guard the capability implies is not there.

`/finance/page.tsx` (the contracts list) likewise has no page-level guard.

Note this is about *page* guards. Server actions are separately covered — `lib/can-coverage.test.ts`
walks the real files and enforces a `can()` as the first statement — so this is a read-exposure
question, not a write-authorisation one.

---

## 4. What works well

Worth stating, because it is most of the app.

- **All 74 routes render.** No 500s, no crashes, no blank screens. Every parameterised route
  was tested against a real row.
- **The money engine is consistent and correct.** `/projects/{id}/finance`,
  `/finance/receivables`, `/finance/payments` and `/vendors/{id}/projects` all agree exactly:
  Contracted ₹18,00,000 · Billed ₹12,60,000 · Received ₹5,60,000 · Dues ₹7,00,000, and on the
  vendor side Committed ₹1,90,000 · Billed ₹96,000 · Dues ₹46,000. Every one of them prints the
  derivation next to the figure ("Billed less received"), which is what makes them checkable.
- **The settled vocabulary held.** Contracted / Committed / Billed / Dues are used with one
  meaning each on every screen that carries them — the Part 7 decision survived implementation.
- **Permission refusals are well designed.** Not a 404, not a redirect: a grey panel naming the
  exact capability in the same words the Edit Role screen uses, with the nav still around it.
- **Form validation is server-side and the messages are actionable** — an empty lead submit
  returns "The lead needs a name." rather than a generic failure.
- **Lead creation works end to end**, including the `303` redirect to the new lead's detail page.
- **Accessibility on the lead form is sound** — every visible input has a real `<label>`.
- **A ₹50,000 vendor payment carries `vendor_id` but no `contract_id`**, and every screen still
  attributes it correctly. The joins are resilient to real-world partial linkage.

---

## 5. Low-severity observations

1. **Role label mismatch.** The database tier is `member`; the UI renders **"Staff"**. Harmless
   in isolation, but documentation, the tier constant and the screen now use two words for one
   thing — the same drift that produced finding 3.3.
2. **"Required" fields are not `required` in HTML.** "Client name *" and "Source *" render the
   required marker, but the inputs carry `required=false`. The server catches it correctly, so
   nothing breaks; the cost is a round-trip and no field-level anchoring of the error.
3. **`/` 307-redirects to `/leads`, not `/dashboard`.** Probably deliberate, but the nav's first
   item is Dashboard, so the landing page and the first nav entry disagree. Worth confirming.
4. **Reports index is reachable by a member** (`/reports` returns 200 and lists the cards) while
   5 of the 6 reports behind it refuse. The cards advertise what the person cannot open.

---

## 6. False alarms — ruled out, do not chase

Recorded because each looked like a defect and cost real time to disprove.

1. **`/vendors/[id]/projects` returned 404 for every vendor**, locally, consistently, with the
   route present in `app-paths-manifest.json`. It is a **stale `.next` cache**. Production
   returned 200 and rendered the screen correctly with live data (`aria-busy: 0`,
   Estimated Expenses ₹2,40,000). `rm -rf .next` and restart fixes it. Not a product bug.
2. **Lead creation appeared to leave the user on a blank form with a stale error.** It does not.
   The server log shows `POST /leads/new 303` followed by `GET /leads/{id} 200` — the redirect
   fires and the page renders. The browser pane simply did not update its DOM, which is the
   documented pane flakiness. Verify writes in the server log and the database, never in the pane.
3. **Four reports and `/rfq` looked near-empty** in the first sweep. They are correct and
   sparse — the demo tenant has one project. GST Summary is internally consistent
   (₹1,40,264 × 18% = ₹25,247.52).
4. **A first sweep flagged all 74 routes as broken.** The detector matched
   "This page could not be found" against raw HTML; Next embeds the not-found component in every
   flight payload. Judge the stripped body, not the raw response.

---

## 7. Test data created

Two leads were created in the demo tenant (`d46a53af-58b1-4ed7-87be-c675e5803802`) and left in
place, since the mandate was to change nothing:

| Name | id | Source |
|---|---|---|
| QA Test — Priya Menon | `8bb837eb-5e54-40e3-8cfe-b8993312e474` | referral |
| QA Test Two — Anil Rao | `1aa15b37-72c5-4480-a5c5-70e8142f0ca5` | website |

Both are status `new` and belong to no project. Safe to delete:

```sql
delete from leads where id in ('8bb837eb-5e54-40e3-8cfe-b8993312e474','1aa15b37-72c5-4480-a5c5-70e8142f0ca5');
```

No other rows were written. `.next` was cleared and rebuilt; no source file was modified.

---

## 8. Suggested order of work

1. **Fix the Receivables Ageing report** (3.1). It is wrong in the direction that costs money,
   and both defects are in one 40-line function. Make it read from the same model
   `/finance/receivables` uses rather than recomputing — that is what stopped the other four
   screens from drifting.
2. **Decide the reports-vs-accounting gating question** (3.2). A design decision, not a patch.
3. **Rename the report's "P&L" column to "Cash flow"** (3.3). One word, removes a ₹10,50,000
   ambiguity.
4. **Add page guards to `/projects/[id]/finance`, `/finance` and `/billing`** (3.4), once 3.2
   settles which capability they should require.
5. **Run the second pass** over §2's uncovered list — the quotation builder and the procurement
   chain are the two largest untested surfaces, and both are money-bearing.
