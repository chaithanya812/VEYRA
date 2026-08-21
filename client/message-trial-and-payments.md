**Subject: Free Trial design + payment gateway setup**

Hi [Name],

Good spec — and you've identified the important part correctly. Counting stored records is exactly the loophole that catches most SaaS products out, and metering on lifetime usage instead is the right answer. We'll build it that way.

**How we'll implement it**

Rather than a counter we increment and decrement, every limited action writes a permanent entry to a usage ledger — quotation created, BOQ generated, cutlist run, export taken, and so on. Nothing is ever removed from that ledger. Editing, cancelling, archiving or deleting the item afterwards has no effect on the count, because the count is derived from the ledger and not from what's currently in the system.

That also gives you the audit history you asked for as a by-product, since every entry records who did what and when.

Two design points worth confirming:

- **The quota sits on the company account, not the individual user.** Otherwise someone invites a second team member and gets a fresh allowance.
- **Nothing is deleted when a trial ends.** The account becomes read-only, with export still available, and everything is restored the moment they upgrade. Deleting a prospect's work is both a poor experience and a problem under the data protection rules.

**On preventing duplicate accounts**

I want to be straight with you: this can be made expensive and inconvenient, but it cannot be made impossible. Anyone sufficiently determined can eventually get a second trial. The aim is to stop casual repeat usage, which the following will do:

- **Verified mobile number** via OTP, unique across all accounts. This is the strongest single control, as numbers cost money to obtain.
- **GSTIN uniqueness — one trial per GSTIN.** I'd particularly recommend this one. Every genuine business you're selling to has exactly one GSTIN, it can be verified automatically, and it makes duplicate accounts very difficult. It also improves the quality of your trial signups, since casual browsers won't have one to hand.
- Verified email with disposable domains blocked.
- Company name, PAN and bank details checked for duplicates.
- Device and network signals used to *flag* suspicious signups for your review rather than block them outright, so genuine customers are never turned away by mistake.

**What you'll control from the admin side**

Trial activation, the limits themselves, expiry date, extending a trial, granting extra quota as a one-off, and conversion to a paid plan — with every one of those actions recorded against your name and the reason, so there's a full history.

Users will see Used / Allowed / Remaining against each limit, days left, and upgrade prompts as they approach a limit.

**Four decisions I need from you**

1. Trial length in days, and the usage limits per item — how many quotations, projects, designs, exports, and so on.
2. Should the trial end on whichever comes first, the day count or the usage limit? I'd suggest yes.
3. Which features are trial-limited by volume, and which are simply unavailable until they pay?
4. Do you want a card or payment method required up front to start a trial? It reduces abuse considerably and improves conversion, but it also reduces signups.

**Payments — please start this now**

To take subscription payments we'll integrate a payment gateway. Both **PhonePe** and **Razorpay** support recurring subscription billing properly, so either is a valid choice:

- **PhonePe** is cheaper at around 1.95% per transaction, and is the strongest option if most of your customers pay by UPI, which for this market they will. Their Autopay product handles recurring billing through a full API.
- **Razorpay** is slightly dearer at roughly 2.36% including GST, but has better coverage for cards and net banking, and a wider product range.

There is one point that affects your pricing rather than the technology: **UPI recurring mandates are capped at between ₹5,000 and ₹15,000 depending on the customer's bank**, under RBI and NPCI rules. Monthly plans sit comfortably inside that. An annual plan priced above the cap would require the customer to approve each payment manually, which hurts renewals. Worth keeping in mind when you set the plan prices — this applies to every gateway equally.

My suggestion is to go with PhonePe if the platform will only ever collect subscription payments from your customers. If you later want the platform to also handle payments from *your customers' own clients* — a homeowner paying an interior company through the software, with your commission taken automatically — then Razorpay handles that split-payment setup better, and starting there avoids a migration.

Either way I'll build the payment layer so the provider can be changed later without reworking anything else.

To open the account you'll need:

- The registered business entity, with PAN and GSTIN
- A current bank account in the business name
- Address proof and KYC for the director or proprietor
- Terms of Service, Privacy Policy, Refund and Cancellation Policy, Contact and Pricing pages published on the website

That last item catches people out — payment gateways will not activate an account without those pages live, and verification typically takes several working days. Please start it now so it isn't holding up the launch later. I can draft the policy pages if that helps.

One thing to decide separately, and we can leave it for now: whether the platform should also handle *your customers' customers* paying them — advances and milestone payments from a homeowner to an interior company using the software. That's a different setup to subscription billing and worth discussing on its own once the core is live.

Let me know on the four decisions above and I'll build accordingly.
