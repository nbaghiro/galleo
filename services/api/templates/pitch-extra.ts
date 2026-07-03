import type { ArtifactContent } from "@model/content";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    cell,
    chart,
    deck,
    diagram,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

// Series A deck — Switchboard, the AI front desk for home-services businesses.
export const seriesA: ArtifactContent = deck(
    "indigo",
    [
        section(
            "a1",
            "full",
            {
                a: cell(
                    group(
                        t("SWITCHBOARD · SERIES A · 2026", "label"),
                        t("Never miss the call that pays the bills.", "h1"),
                        t(
                            "Switchboard is the AI front desk for home-services businesses — answering every call and text in seconds, booking the job, and keeping the schedule full, around the clock.",
                            "subtitle",
                        ),
                        badge("$18M SERIES A · LED BY MERIDIAN VENTURES"),
                    ),
                ),
            },
            { background: bgImage("switchboard-dispatch-cover", 0.55) },
        ),
        section("a2", "split-6040", {
            a: cell(
                group(
                    t("01 — Why now", "label"),
                    t("Voice AI finally crossed the line a caller can't hear.", "h2"),
                    t(
                        "The trades still run on the phone — and owners on a roof or under a sink miss roughly one call in four. Until 2024, an AI that answered was obviously a robot. Today Switchboard books the job, and the customer never knows they weren't talking to the front desk.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("switchboard-tech-on-call", 0.82)),
        }),
        section(
            "a3",
            "full",
            {
                a: cell(
                    quote(
                        "Every missed call is a job that went to the next plumber on Google. We just pick up.",
                        "— the Switchboard thesis",
                    ),
                ),
            },
            { background: bgImage("switchboard-night-shift", 0.6) },
        ),
        section("a4", "three-up", {
            a: cell(stat("2,400", "businesses on Switchboard")),
            b: cell(stat("$6.8M", "ARR · up 3.1× YoY")),
            c: cell(stat("$140M", "in jobs booked for customers")),
        }),
        section("a5", "split-6040", {
            a: cell(
                group(
                    t("02 — What we've proven", "label"),
                    t("Revenue that compounds with every booked job.", "h2"),
                    t(
                        "Live across 2,400 contractors in 38 states, Switchboard answered 1.9 million calls last quarter and turned a third of them into booked work. Owners don't churn — they add their second location and switch on texting and scheduling on their own.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "132% net revenue retention — accounts grow faster than we can sell to them.",
                            "body",
                        ),
                    ),
                ),
            ),
            b: cell(chart("line", "0.4, 0.9, 1.8, 3.1, 4.9, 6.8", 240)),
        }),
        section("a6", "split-4060", {
            a: cell(img("switchboard-dashboard", 1.1)),
            b: cell(
                group(
                    t("03 — The product", "label"),
                    t("One front desk that never sleeps.", "h2"),
                    bullets(
                        "Answers every call and text in under two seconds, in English or Spanish",
                        "Books the job straight into the calendar — with address, photos, and the right crew",
                        "Texts the customer a confirmation, a reminder, and a review request",
                        "Hands off to a human the moment it should, with the full call summary",
                    ),
                ),
            ),
        }),
        section("a7", "split-6040", {
            a: cell(
                group(
                    t("04 — The wedge", "label"),
                    t("We land on the call they're already losing.", "h2"),
                    t(
                        "Switchboard starts with after-hours and overflow calls — the clearest ROI in the business and nothing to rip out. Once an owner sees jobs booked while they slept, we expand into texting, scheduling, follow-ups, and payments, until we're the whole front office.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("switchboard-after-hours", 0.82)),
        }),
        section("a8", "full", {
            a: cell(
                group(
                    t("05 — Go-to-market", "label"),
                    t("A self-serve funnel with a field-sales motor.", "h2"),
                    diagram(
                        "process",
                        "Owner signs up online, Number ports in minutes, Books the first job same day, Switches on text & scheduling, Refers their trade network",
                        180,
                    ),
                ),
            ),
        }),
        section("a9", "full", {
            a: cell(
                group(
                    t("06 — Unit economics", "label"),
                    t("Payback under three months — and still improving.", "h2"),
                    table(
                        "Metric,Today,Series B target\nAverage revenue / account,$236 / mo,$340 / mo\nGross margin,79%,84%\nCAC payback,2.8 months,2.0 months\nNet revenue retention,132%,140%\nAnnual logo churn,9%,6%",
                    ),
                ),
            ),
        }),
        section("a10", "three-up", {
            a: cell(
                group(
                    img("switchboard-founder-dana", 1),
                    t("Dana Whitfield", "h3"),
                    t("CEO · ex-ServiceTitan, scaled 3,000 contractors", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("switchboard-founder-amir", 1),
                    t("Amir Hassan", "h3"),
                    t("CTO · ex-Google speech, built real-time voice", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("switchboard-founder-lena", 1),
                    t("Lena Ortiz", "h3"),
                    t("Head of Revenue · ex-Jobber, 0→$30M", "caption"),
                ),
            ),
        }),
        section("a11", "two-col", {
            a: cell(
                group(
                    t("07 — The raise", "label"),
                    t("Raising $18M to reach 10,000 businesses.", "h2"),
                    t(
                        "Use of funds: deepen the voice and scheduling product (40%), build a category-leading field and partner sales motion (35%), and expand into the next five trades (25%). 24 months of runway to $25M ARR.",
                        "body",
                    ),
                    button("dana@switchboard.ai"),
                ),
            ),
            b: cell(
                group(
                    t("Milestones", "label"),
                    bullets(
                        "Q3 — Spanish-first voice and SMS go GA",
                        "Q4 — 5,000 businesses, $12M ARR",
                        "Q2 '27 — Payments & invoicing live",
                        "Q4 '27 — 10,000 businesses, $25M ARR",
                    ),
                ),
            ),
        }),
        section(
            "a12",
            "full",
            {
                a: cell(
                    group(
                        t("08 — Vision", "label"),
                        t(
                            "The operating system for the businesses that show up at your door.",
                            "h1",
                        ),
                        t(
                            "Eight million tradespeople run the physical economy off a phone and a paper calendar. Switchboard starts by answering the call — and ends up running the whole business behind it.",
                            "subtitle",
                        ),
                    ),
                ),
            },
            { background: bgImage("switchboard-vision-truck", 0.5) },
        ),
    ],
    bgImage("switchboard-cover-ambient", 0.35),
);

// Product demo deck — Sift, customer-feedback intelligence for product teams.
export const productDemo: ArtifactContent = deck(
    "signal",
    [
        section(
            "p1",
            "full",
            {
                a: cell(
                    group(
                        t("SIFT · PRODUCT TOUR", "label"),
                        t("Turn every customer signal into your next release.", "h1"),
                        t(
                            "Sift pulls feedback from support tickets, sales calls, reviews, and surveys into one place — then tells your product team what to build next, and exactly who asked for it.",
                            "subtitle",
                        ),
                        badge("A FIVE-MINUTE TOUR"),
                    ),
                ),
            },
            { background: bgImage("sift-product-cover", 0.55) },
        ),
        section("p2", "two-col", {
            a: cell(
                group(
                    t("Who it's for", "label"),
                    t("Built for the people who own the roadmap.", "h2"),
                    t(
                        "Product managers, support leaders, and founders at growing B2B software companies — anyone who has to decide what's worth building when every customer is asking for something different.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("sift-pm-team", 1.0)),
        }),
        section("p3", "split-4060", {
            a: cell(img("sift-scattered-feedback", 1.1)),
            b: cell(
                group(
                    t("Before Sift", "label"),
                    t("Feedback lives everywhere. Decisions live on a hunch.", "h2"),
                    bullets(
                        "Requests scattered across Zendesk, Slack, Gong, and a spreadsheet nobody updates",
                        "The loudest customer wins — not the most important one",
                        "No way to prove what's actually driving churn or expansion",
                    ),
                    callout(
                        "warn",
                        t(
                            "The average team burns a full day a week just collating feedback — before a single decision gets made.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section("p4", "split-4060", {
            a: cell(img("sift-unified-inbox", 1.1)),
            b: cell(
                group(
                    t("The tour · 01", "label"),
                    t("Every signal lands in one inbox.", "h2"),
                    bullets(
                        "Connect your tools once — Sift streams in tickets, calls, reviews, and survey replies automatically",
                        "Each item carries the account, plan, and revenue it came from",
                        "Nothing to forward, tag, or copy-paste ever again",
                    ),
                ),
            ),
        }),
        section("p5", "split-6040", {
            a: cell(
                group(
                    t("The tour · 02", "label"),
                    t("Sift reads it so your team doesn't have to.", "h2"),
                    bullets(
                        "Every piece of feedback is summarized, sentiment-scored, and sorted into themes automatically",
                        "Duplicate requests merge into one, with a running count and the revenue behind them",
                        'Ask in plain English — "what are enterprise accounts frustrated by?" — and get the answer with receipts',
                    ),
                ),
            ),
            b: cell(img("sift-ai-themes", 0.82)),
        }),
        section("p6", "split-4060", {
            a: cell(img("sift-insights-dashboard", 1.1)),
            b: cell(
                group(
                    t("The tour · 03", "label"),
                    t("Watch the themes that matter move week over week.", "h2"),
                    bullets(
                        "Top themes ranked by reach, revenue at risk, and momentum",
                        "Filter to any segment — plan, region, ARR band, or lifecycle stage",
                        "Spot a spike the day it starts, not in next quarter's QBR",
                    ),
                ),
            ),
        }),
        section("p7", "split-6040", {
            a: cell(
                group(
                    t("The tour · 04", "label"),
                    t("Close the loop without leaving Sift.", "h2"),
                    bullets(
                        "Turn a theme into a roadmap item and push it to Jira or Linear in a click",
                        "When it ships, Sift messages every customer who asked",
                        "Reopen rates drop and renewal calls get a lot friendlier",
                    ),
                ),
            ),
            b: cell(img("sift-close-the-loop", 0.82)),
        }),
        section("p8", "three-up", {
            a: cell(stat("9 hrs", "saved per PM, every week")),
            b: cell(stat("3.4×", "more feedback reviewed")),
            c: cell(stat("28%", "faster from request to release")),
        }),
        section(
            "p9",
            "full",
            {
                a: cell(
                    quote(
                        "We stopped arguing about the roadmap in meetings. Now we just open Sift and the answer's already there.",
                        "— Priya Nair, VP Product, Northwind Software",
                    ),
                ),
            },
            { background: bgImage("sift-customer-office", 0.6) },
        ),
        section("p10", "three-up", {
            a: cell(card(t("Support", "h3"), t("Zendesk · Intercom · Front · Help Scout", "body"))),
            b: cell(
                card(t("Sales & calls", "h3"), t("Gong · Salesforce · HubSpot · Slack", "body")),
            ),
            c: cell(
                card(
                    t("Voice of customer", "h3"),
                    t("G2 · App Store · Typeform · NPS surveys", "body"),
                ),
            ),
        }),
        section("p11", "full", {
            a: cell(
                group(
                    t("Pricing", "label"),
                    t("Starts free. Scales with your team, not your ticket volume.", "h2"),
                    table(
                        "Plan,Price,Built for\nFree,$0,Up to 1k feedback items / mo\nTeam,$99 / mo,Growing product teams\nBusiness,$399 / mo,Multiple products & segments\nEnterprise,Custom,SSO · security review · SLAs",
                    ),
                ),
            ),
        }),
        section(
            "p12",
            "full",
            {
                a: cell(
                    group(
                        t("Get started", "label"),
                        t("Stop guessing. Start shipping what customers actually asked for.", "h1"),
                        t(
                            "Connect your first source in under ten minutes — free for your first 1,000 pieces of feedback, no credit card.",
                            "subtitle",
                        ),
                        button("Start free"),
                    ),
                ),
            },
            { background: bgImage("sift-get-started-cover", 0.55) },
        ),
    ],
    bgImage("sift-cover-ambient", 0.35),
);
