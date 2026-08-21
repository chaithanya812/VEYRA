# Razorpay setup — what's needed, in order

*Verified against Razorpay's own docs, 2026-08-17*

---

## 0. Decide this before anything else: whose account is it?

**The Razorpay account must belong to the entity that legally receives the money** — your client's company. Not yours.

Their business PAN, their GSTIN, their current account. You get added as a team member and you handle the API keys and the integration. If you register it in your own name to move fast, the subscription revenue lands in your bank account, the GST invoicing to their customers is wrong, and moving it later means redoing the entire KYC.

Get the client to create the account and add you. Ten minutes of friction now, versus unwinding it later.

---

## 1. What you can do today, with zero paperwork

**Test Mode needs no KYC.** Sign up, and test API keys are available immediately.

In test mode you can build and test the whole subscription flow end to end — create plans, create subscriptions, run the checkout, receive webhooks — using test card numbers. Real customers can't pay, and that's the only difference.

**So development is never blocked by the client's paperwork.** Build the entire billing module in test mode while their KYC goes through, then swap the keys.

Note: **Test and Live have completely separate API keys.** Generate each from Settings → API Keys → Generate Key, with the mode selected. Swapping to live is a change of environment variables, nothing more.

---

## 2. Documents the client needs — by entity type

Every type also needs: **PAN**, **address proof**, **bank proof**, and **GST certificate** where registered.

**Sole proprietorship**
- Proprietor's PAN
- Address proof — Aadhaar, Voter ID or Passport
- GST certificate (required once turnover crosses ₹20 lakh; ₹10 lakh in special category states)
- Recent utility bill or rent agreement, within 3 months
- MSME/Udyam certificate, or Shop & Establishment registration
- Cancelled cheque or passbook showing the business name
- Trade licence, if applicable

**Partnership firm**
- Firm's PAN + registered partnership deed
- PAN and Aadhaar for every authorised signatory
- Commercial property documents, or an NOC from the property owner
- Shop & Establishment certificate, GST certificate
- Cancelled cheque in the firm's name
- UBO declarations from any partner holding over 10%

**LLP**
- Certificate of Incorporation from MCA + LLP agreement
- LLP's PAN
- PAN and address proof for all designated partners
- Cancelled cheque or bank statement in the LLP's name

**Private Limited**
- Certificate of Incorporation
- Memorandum and Articles of Association
- Company PAN
- **Board resolution on company letterhead** authorising the payment gateway account
- PAN and address proof for all directors
- Current account statement or cancelled cheque
- GST certificate

**Bank account:** individuals and sole proprietors may use a personal savings account. Partnerships, LLPs and companies **must** use a current account in the business name. The account holder name has to match the PAN exactly — a mismatch is the most common rejection.

---

## 3. The website requirement — this is the real blocker

Razorpay will not activate a live account until these are **published and reachable** on the site:

- Terms of Service
- Privacy Policy
- **Refund and Cancellation Policy**
- Contact Us with a real address and phone number
- Pricing / plans page
- Valid SSL certificate

Every one of these is a page somebody has to write. They're the reason activations get delayed, far more often than the documents.

Write them while the KYC documents are being gathered — the two tracks run in parallel.

---

## 4. Turn Subscriptions on — it is not enabled by default

Easy to lose a day to this. A fresh Razorpay account cannot create subscriptions until you enable it:

**Dashboard → Account & Settings → Checkout Features → enable Flash Checkout**

---

## 5. How the subscription model actually works

Three objects:

- **Plan** — the product, price and billing interval. Create one per pricing tier: Starter Monthly, Pro Monthly, Pro Annual, and so on.
- **Subscription** — links one customer to one plan.
- **Mandate** — the customer's stored consent to be charged, via tokenised card, **UPI AutoPay**, or e-mandate.

Razorpay then charges automatically on schedule. This is different from their "recurring payments" product, where you trigger each charge yourself — Subscriptions is the fully automated one, and it's what you want.

**Integration outline:**

1. Create Plans once, from the dashboard or the API.
2. On signup, create a Customer and a Subscription against a plan.
3. Send the customer through checkout to authorise the mandate.
4. **Webhooks** drive everything after that — `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`, `payment.failed`.
5. Your webhook handler updates the tenant's plan and entitlements.

**Do not trust the browser redirect to confirm payment.** The webhook is the source of truth — the user can close the tab, and someone can forge a redirect. Same discipline as the call webhooks: verify the signature, and make the handler idempotent because Razorpay retries.

---

## 6. Two constraints that affect pricing, not code

- **UPI AutoPay mandates cap at roughly ₹5,000–₹15,000** depending on the customer's bank, per RBI/NPCI. Monthly plans fit. An annual plan above the cap forces manual approval on every renewal. Price the tiers with this in mind.
- **Fees are about 2% + 18% GST ≈ 2.36%** per transaction. No setup or annual fee.

---

## 7. Sequence

| When | What | Who |
|---|---|---|
| Today | Sign up, get test keys, start building | You |
| Today | Start gathering documents | Client |
| This week | Write and publish the five policy pages | You / client |
| After pages are live | Submit KYC for activation | Client |
| +2–7 working days | Activation | Razorpay |
| On activation | Enable Flash Checkout, generate live keys, swap env vars | You |

**Nothing about the build waits on any of this.** Only the final key swap does.

---

## Sources

- [Documents required for a payment gateway — Razorpay](https://razorpay.com/blog/documents-required-for-payment-gateway)
- [Set up a Razorpay account](https://razorpay.com/docs/payments/set-up/?preferred-country=IN)
- [Account activation support](https://razorpay.com/docs/payments/account-activation-support/)
- [Subscriptions](https://razorpay.com/docs/payments/subscriptions/)
- [API keys](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/)
- [Test and live modes](https://razorpay.com/docs/payments/dashboard/test-live-modes/)
