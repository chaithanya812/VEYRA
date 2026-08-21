**Subject: Call Tracking — findings and recommended approach**

Hi [Name],

I've looked into the call tracking requirement in detail. I want to give you a straight answer rather than a comfortable one: **building this from scratch inside the platform is not the right call**, and I'd recommend we integrate an existing specialist tool instead.

Your requirement still gets met in full — every call logged automatically against the lead, with duration, status, attempts and full history, visible in the CRM without anyone typing it in. The difference is in who builds the piece that sits on the phone.

Here is what I found.

**1. iPhones cannot be tracked at all**

Apple provides no way for any app to read the call log. This is a hard restriction in iOS, not a limitation of what we'd build. It applies to every company equally — the market leader in this category, Runo, can only track calls on iPhone if the call is placed from inside their own app, and cannot see normal calls at all.

So a system we build ourselves could never cover anyone on an iPhone. If any of your designers, architects or senior staff use iPhones, they would simply be invisible in the reporting.

**2. Call recording is not possible on a normal Android phone**

Android blocks apps from recording call audio directly — the permission required is a system-level one, and the well-known recording apps only work on phones that have been rooted or had custom firmware installed. Neither is appropriate for your team's phones.

The only workaround is to read recordings that the phone's own manufacturer has already saved. That works on most Xiaomi, Redmi, Realme, Oppo, Vivo and Samsung handsets, and not at all on Google Pixel, Motorola, Nothing and several others. So recording would work for some of your team and silently not for the rest — which is worse than not offering it.

**3. It would need constant maintenance**

Each phone manufacturer handles background apps differently, and most Indian brands aggressively shut them down to save battery. In practice this means the app stops syncing on some phones without any visible error, and it has to be re-tested and fixed for every brand and every Android update. That is ongoing work with no end date.

Google also classes call log access as a restricted permission requiring special approval, with review on each update.

**4. This problem is already solved, cheaply**

Several mature Indian products do exactly this, have handled the manufacturer-specific problems for years, and cost very little. Building our own version would mean committing development time permanently to a solved problem — time much better spent on the parts of the platform that genuinely differentiate you: quotations, BOM and production, procurement, site execution and project profitability. No competitor offers those. Everyone offers call tracking.

**What I recommend**

Use one of the established tools and integrate it into the platform through its API, so the call data still flows into the CRM and appears on the lead timeline exactly as you described.

*Mobile / SIM-based — calls run on your team's existing Airtel or Jio plans, so there is no per-call cost*
- **Runo** — SIM-based call management with automatic logging and AI call summaries
- **Callyzer** — call monitoring with recording sync, from around ₹161 per month per number
- **TeleCRM** — call management with lead tracking and WhatsApp

*Cloud telephony — virtual numbers with click-to-call*
- **Exotel**, **MyOperator**, **Knowlarity**, **Ozonetel**, **Acefone**

These give guaranteed recording on every call, work on iPhone as well as Android, and provide virtual numbers you can put on your website and advertising to see which campaigns generate calls. The trade-off is a monthly subscription plus a per-minute charge.

**My suggestion**

Start with one of the mobile tools for the sales team, since the running cost is close to zero, and add a single cloud telephony number later for enquiries coming from the website and ads.

We handle the integration either way, so from your side and your team's side it behaves as one system — calls appear under the lead in the CRM, automatically, with no manual entry.

If you let me know which phones your team is on and whether anyone uses an iPhone, I can recommend a specific tool and give you a cost estimate.
