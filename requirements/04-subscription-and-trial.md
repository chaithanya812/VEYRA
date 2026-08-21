# REQ-04 — Plans, subscription and free trial

**Source:** Client, verbatim.
**Status:** Accepted, awaiting the client's numbers. **This is a core module and was missing from the v0.1 plan entirely.**

---

## Client's message

> Also, in the subscription plans, please add a proper Free Trial option.
>
> Please design the free trial carefully so there are no loopholes for repeated free usage. For example, a user must not be able to use the free quotation limit, delete those quotations, and then create new quotations repeatedly to reset the free quota.
>
> The trial limits should therefore work on lifetime usage/creation counters, not on the number of records currently stored. Once a free user creates a quotation, design, BOQ, cutlist, export, AI call, or any other limited item, that usage must remain counted even if the user later edits, cancels, archives, or deletes it.
>
> Also prevent free-trial abuse through duplicate accounts as far as reasonably possible, with controls around verified mobile number/email, company/account identity and owner account. The Main Owner/Admin should control trial activation, limits, expiry and conversion to a paid plan.
>
> Please include this properly in the Plans & Subscription module, including trial usage counters such as Used / Allowed / Remaining, expiry date, upgrade prompts, and an admin-side audit history.

---

## The client is right about the core mechanic

Metering on **stored record count** is exactly the loophole that catches most SaaS products. Metering on **lifetime usage** is correct.

## How to implement it

**An append-only usage ledger, not a counter column.** Every limited action writes a permanent row: action type, entity id, actor, timestamp. Nothing is ever deleted from it. Editing, cancelling, archiving or deleting the underlying record has no effect, because the quota is *derived* from the ledger rather than from current state.

A mutable counter can be reset by a bug or a well-meaning support action. A ledger cannot, and it produces the audit history the client asked for as a by-product.

### Two design points the client's spec doesn't cover

1. **The quota must be scoped to the org, not the user.** Otherwise someone invites a second team member and gets a fresh allowance. The client's entire message is about preventing resets and would have been undone by per-user scoping.
2. **Nothing is deleted at trial expiry.** The account goes read-only with export retained, and everything is restored on upgrade. Deleting a prospect's work is a poor experience and a problem under the DPDP Act.

## Duplicate-account prevention

State plainly: this can be made expensive and inconvenient, **not impossible**. The goal is stopping casual repeat usage.

| Control | Strength |
|---|---|
| **Verified mobile via OTP**, unique across accounts | Strongest single control — numbers cost money |
| **One trial per GSTIN** | **Recommended.** Every genuine B2B customer has exactly one, it's verifiable automatically, and it filters out tyre-kickers who won't have one to hand |
| Verified email, disposable domains blocked | Moderate |
| Company name / PAN / bank duplicate check | Moderate |
| Device and network fingerprinting | Weak — use to **flag for review**, never to hard-block, or genuine customers get turned away |

## Module requirements

- Plan definitions with entitlements per feature
- Trial: length in days **and** per-item usage limits, ending on whichever comes first
- Metered items: quotations, designs, BOQs, cutlists, exports, projects, users, storage — each configurable
- **Used / Allowed / Remaining** display against every limit, plus days remaining
- Upgrade prompts as limits approach
- Owner controls: activation, limits, expiry, extension, one-off bonus quota, conversion to paid — **each recorded with actor, timestamp and reason**
- Admin audit history
- Payment gateway integration behind a provider-agnostic interface

## Constraint that affects pricing, not code

**UPI AutoPay mandates cap at roughly ₹5,000–₹15,000** depending on the customer's bank, under RBI/NPCI rules. Monthly plans fit comfortably. An annual plan priced above the cap forces manual approval on every renewal, which damages retention. **The client must set plan prices with this in mind** — it applies to every gateway equally.

See `research/payments-razorpay-setup.md` and `client/message-trial-and-payments.md`.

## Open questions for the client

1. Trial length in days.
2. Usage limits per metered item.
3. Which features are volume-limited during trial versus simply unavailable until payment.
4. Is a payment method required up front? It cuts abuse and improves conversion, but reduces signups.
5. SaaS pricing model — per user, per company, or per module? This shapes the entire metering design and belongs in Wave 0.
