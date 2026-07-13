import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    chart,
    deck,
    diagram,
    emptyRegion,
    group,
    img,
    quote,
    row,
    section,
    split,
    stat,
    t,
    table,
    card,
} from "@model/authoring";

export const startupPitch: ArtifactContent = deck(
    "noir",
    [
        section(
            "s1",
            group(
                t("MISE · SEED ROUND 2026", "label"),
                t("Run the kitchen, not the spreadsheet.", "h1"),
                t(
                    "Mise turns every restaurant's POS, invoices, and suppliers into one live system — forecasting prep, automating orders, and clawing back the margin that waste quietly eats.",
                    "subtitle",
                ),
                badge("$4M SEED · LED BY ANDISON CAPITAL"),
            ),
            { background: bgImage("mise-kitchen-cover", 0.55) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("01 — The problem", "label"),
                    t("Restaurants run on 4% margins and 1990s tooling.", "h2"),
                    t(
                        "The average independent restaurant throws away 8% of everything it buys, orders by gut feel at 11pm, and learns it lost money a month too late. The back of house is the last part of the business still run on clipboards and group texts.",
                        "body",
                    ),
                ),
                img("mise-walkin-cooler", 0.82),
            ),
        ),
        section(
            "s3",
            quote(
                "Front of house got Toast, Square, and Resy. The kitchen — where the money is actually made or lost — got nothing.",
                "— the Mise thesis",
            ),
            { background: bgImage("mise-chef-pass", 0.6) },
        ),
        section(
            "s4",
            split(
                40,
                img("mise-supplier-truck", 1.1),
                group(
                    t("02 — Why now", "label"),
                    t("The kitchen's data finally left the building.", "h2"),
                    bullets(
                        "Cloud POS (Toast, Square) now expose item-level sales over API — the demand signal didn't exist five years ago",
                        "Distributors like US Foods and Sysco shipped ordering APIs in 2024",
                        "Forecasting that used to need a data team now runs as one model per location",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            split(
                40,
                img("mise-app-prep-list", 1.1),
                group(
                    t("03 — The product", "label"),
                    t("One screen the whole line actually opens.", "h2"),
                    bullets(
                        "Prep lists that predict tomorrow from last year, the weather, and tonight's reservations",
                        "Orders that draft themselves to par and send with one tap",
                        "Live food cost — by dish, by station, by shift",
                    ),
                ),
            ),
        ),
        section(
            "s6",
            row(
                stat("$1.1T", "U.S. restaurant industry"),
                stat("749K", "U.S. restaurant locations"),
                stat("$162B", "food wasted by U.S. restaurants / yr"),
            ),
        ),
        section(
            "s7",
            group(
                t("04 — How it works", "label"),
                t("Connect once. It runs every morning.", "h2"),
                diagram(
                    "process",
                    "Connect POS & invoices, Mise learns your menu, Forecast tonight's covers, Auto-draft the order, Lock in food cost",
                    180,
                ),
            ),
        ),
        section(
            "s8",
            split(
                60,
                group(
                    t("05 — Traction", "label"),
                    t("Kitchens that don't want to give it back.", "h2"),
                    t(
                        "Live in 38 kitchens across 6 restaurant groups, with $2.1M in food orders run through Mise this quarter. Pilots cut food cost by an average of 310 basis points within 60 days.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "112% net revenue retention — groups add locations faster than we can onboard them.",
                            "body",
                        ),
                    ),
                ),
                chart("line", "6, 11, 17, 24, 31, 38", 240),
            ),
        ),
        section(
            "s9",
            row(
                stat("38", "kitchens live"),
                stat("310bps", "avg food-cost reduction"),
                stat("94%", "weekly active kitchens"),
            ),
        ),
        section(
            "s10",
            group(
                t("06 — Business model", "label"),
                t("Per-location SaaS, priced under the waste it kills.", "h2"),
                table(
                    "Plan,Per location / mo,Built for\nLine,$249,Single independents\nKitchen,$399,Full-service & multi-station\nGroup,$329,Multi-unit groups (5+)\nEnterprise,Custom,Chains & franchisors",
                ),
            ),
        ),
        section(
            "s11",
            split(
                60,
                group(
                    t("07 — Why we win", "label"),
                    t("Spreadsheets, distributor portals, and point tools.", "h2"),
                    bullets(
                        "Distributor portals (Sysco, US Foods) want you to buy more, not waste less",
                        "Inventory apps count what's already gone; Mise predicts what's next",
                        "We're POS-agnostic — the data layer for the kitchen, not another silo",
                    ),
                ),
                img("mise-competition-grid", 0.86),
            ),
        ),
        section(
            "s12",
            row(
                group(
                    img("mise-founder-dana", 1),
                    t("Dana Reyes", "h3"),
                    t("CEO · ex-Toast, ran ops for 40 kitchens", "caption"),
                ),
                group(
                    img("mise-founder-marcus", 1),
                    t("Marcus Vallée", "h3"),
                    t("CTO · ex-Flexport forecasting", "caption"),
                ),
                group(
                    img("mise-founder-priya", 1),
                    t("Priya Anand", "h3"),
                    t("Head of Culinary · 12 years on the line", "caption"),
                ),
            ),
        ),
        section(
            "s13",
            split(
                40,
                emptyRegion(),
                group(
                    t("08 — The ask", "label"),
                    t("Raising $4M to put Mise in 1,000 kitchens.", "h2"),
                    t(
                        "Use of funds: supplier API coverage (40%), the forecasting & food-cost engine (35%), and a culinary-led go-to-market across the top 20 U.S. metros (25%). 24 months of runway to $4M ARR.",
                        "body",
                    ),
                    button("dana@mise.kitchen"),
                ),
            ),
            { background: bgImage("mise-kitchen-night", 0.6) },
        ),
    ],
    bgImage("mise-cover-ambient", 0.35),
);

export const salesDeck: ArtifactContent = deck(
    "cobalt",
    [
        section(
            "f1",
            group(
                t("FLEETWISE · FOR OPERATIONS & MAINTENANCE LEADERS", "label"),
                t("Your trucks make money moving, not in the shop.", "h1"),
                t(
                    "Fleetwise reads the telematics you already pay for and turns it into maintenance you do before the breakdown — cutting unplanned downtime, roadside failures, and the overtime that follows.",
                    "subtitle",
                ),
                badge("TRUSTED BY 140+ FLEETS"),
            ),
            { background: bgImage("fleetwise-depot-dawn", 0.55) },
        ),
        section(
            "f2",
            split(
                60,
                group(
                    t("The problem", "label"),
                    t("Every breakdown is a fire you find out about by phone.", "h2"),
                    t(
                        "Maintenance is still scheduled by odometer and gut. A water pump telematics flagged three weeks ago strands a driver on I-80 at 2am — now it's a tow, a missed delivery, a hotel, and a tech on overtime. The signal to prevent it was already in the truck.",
                        "body",
                    ),
                ),
                img("fleetwise-roadside-breakdown", 0.82),
            ),
        ),
        section(
            "f3",
            row(
                stat("$760", "avg cost per truck, per day down"),
                stat("23%", "of road calls were preventable"),
                stat("4.3 days", "avg unplanned repair turnaround"),
            ),
        ),
        section(
            "f4",
            split(
                40,
                img("fleetwise-dashboard", 1.1),
                group(
                    t("The solution", "label"),
                    t("Fix it in the bay, on your schedule.", "h2"),
                    bullets(
                        "Predicts component failures 2–6 weeks out from the telematics you already run",
                        "Auto-builds the work order with parts, labor, and the best open bay window",
                        "One health score per truck — green, watch, or ground it",
                    ),
                ),
            ),
        ),
        section(
            "f5",
            group(
                t("How it works", "label"),
                t("Live in two weeks, no new hardware.", "h2"),
                diagram(
                    "process",
                    "Connect your telematics, Fleetwise scores every vehicle, Flags failures weeks early, Drafts the work order, Schedule before it breaks",
                    180,
                ),
            ),
        ),
        section(
            "f6",
            split(
                60,
                group(
                    t("Case study · Meridian Freight", "label"),
                    t("A 320-truck carrier got its shop ahead of the road.", "h2"),
                    t(
                        "Meridian ran 18% unplanned downtime and a purely reactive shop. Twelve months on Fleetwise, planned maintenance went from 41% to 78% of all work — and roadside failures fell by more than half.",
                        "body",
                    ),
                    callout(
                        "success",
                        t("$1.9M saved in year one — 11× their Fleetwise spend.", "body"),
                    ),
                ),
                chart("line", "18, 16, 14, 11, 9, 8, 8", 240),
            ),
        ),
        section(
            "f7",
            row(
                stat("52%", "fewer roadside failures"),
                stat("78%", "of work now planned"),
                stat("11×", "first-year ROI"),
            ),
        ),
        section(
            "f8",
            quote(
                "We used to staff for breakdowns. Now we staff for the schedule Fleetwise hands us the night before.",
                "— Carla Mendez, VP Maintenance, Meridian Freight",
            ),
            { background: bgImage("fleetwise-shop-bay", 0.6) },
        ),
        section(
            "f9",
            group(
                t("Pricing", "label"),
                t("Priced per truck, under one day of downtime.", "h2"),
                table(
                    "Plan,Per truck / mo,Includes\nCore,$29,Health scores & failure alerts\nShop,$39,+ Auto work orders & parts\nFleet,$34,Multi-depot, 100+ trucks\nEnterprise,Custom,Telematics integrations & SLA",
                ),
            ),
        ),
        section(
            "f10",
            split(
                60,
                group(
                    t("Why now", "label"),
                    t("Margins are thin and parts lead times aren't shrinking.", "h2"),
                    t(
                        "Freight rates are soft, labor is tight, and a backordered part can ground a truck for a week. The fleets pulling ahead stopped reacting — predictive maintenance is now table stakes, and your telematics already carries the signal.",
                        "body",
                    ),
                ),
                img("fleetwise-parts-warehouse", 0.86),
            ),
        ),
        section(
            "f11",
            split(
                40,
                emptyRegion(),
                group(
                    t("Next steps", "label"),
                    t("See your own fleet's risk in 30 minutes.", "h2"),
                    t(
                        "Send us read-only telematics access and we'll bring a free risk assessment of your top 25 vehicles to the next call — no install, no commitment.",
                        "body",
                    ),
                    button("Book your fleet assessment"),
                ),
            ),
            { background: bgImage("fleetwise-fleet-lineup", 0.55) },
        ),
    ],
    bgImage("fleetwise-cover-ambient", 0.35),
);

export const seriesA: ArtifactContent = deck(
    "indigo",
    [
        section(
            "a1",
            group(
                t("SWITCHBOARD · SERIES A · 2026", "label"),
                t("Never miss the call that pays the bills.", "h1"),
                t(
                    "Switchboard is the AI front desk for home-services businesses — answering every call and text in seconds, booking the job, and keeping the schedule full, around the clock.",
                    "subtitle",
                ),
                badge("$18M SERIES A · LED BY MERIDIAN VENTURES"),
            ),
            { background: bgImage("switchboard-dispatch-cover", 0.55) },
        ),
        section(
            "a2",
            split(
                60,
                group(
                    t("01 — Why now", "label"),
                    t("Voice AI finally crossed the line a caller can't hear.", "h2"),
                    t(
                        "The trades still run on the phone — and owners on a roof or under a sink miss roughly one call in four. Until 2024, an AI that answered was obviously a robot. Today Switchboard books the job, and the customer never knows they weren't talking to the front desk.",
                        "body",
                    ),
                ),
                img("switchboard-tech-on-call", 0.82),
            ),
        ),
        section(
            "a3",
            quote(
                "Every missed call is a job that went to the next plumber on Google. We just pick up.",
                "— the Switchboard thesis",
            ),
            { background: bgImage("switchboard-night-shift", 0.6) },
        ),
        section(
            "a4",
            row(
                stat("2,400", "businesses on Switchboard"),
                stat("$6.8M", "ARR · up 3.1× YoY"),
                stat("$140M", "in jobs booked for customers"),
            ),
        ),
        section(
            "a5",
            split(
                60,
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
                chart("line", "0.4, 0.9, 1.8, 3.1, 4.9, 6.8", 240),
            ),
        ),
        section(
            "a6",
            split(
                40,
                img("switchboard-dashboard", 1.1),
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
        ),
        section(
            "a7",
            split(
                60,
                group(
                    t("04 — The wedge", "label"),
                    t("We land on the call they're already losing.", "h2"),
                    t(
                        "Switchboard starts with after-hours and overflow calls — the clearest ROI in the business and nothing to rip out. Once an owner sees jobs booked while they slept, we expand into texting, scheduling, follow-ups, and payments, until we're the whole front office.",
                        "body",
                    ),
                ),
                img("switchboard-after-hours", 0.82),
            ),
        ),
        section(
            "a8",
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
        section(
            "a9",
            group(
                t("06 — Unit economics", "label"),
                t("Payback under three months — and still improving.", "h2"),
                table(
                    "Metric,Today,Series B target\nAverage revenue / account,$236 / mo,$340 / mo\nGross margin,79%,84%\nCAC payback,2.8 months,2.0 months\nNet revenue retention,132%,140%\nAnnual logo churn,9%,6%",
                ),
            ),
        ),
        section(
            "a10",
            row(
                group(
                    img("switchboard-founder-dana", 1),
                    t("Dana Whitfield", "h3"),
                    t("CEO · ex-ServiceTitan, scaled 3,000 contractors", "caption"),
                ),
                group(
                    img("switchboard-founder-amir", 1),
                    t("Amir Hassan", "h3"),
                    t("CTO · ex-Google speech, built real-time voice", "caption"),
                ),
                group(
                    img("switchboard-founder-lena", 1),
                    t("Lena Ortiz", "h3"),
                    t("Head of Revenue · ex-Jobber, 0→$30M", "caption"),
                ),
            ),
        ),
        section(
            "a11",
            row(
                group(
                    t("07 — The raise", "label"),
                    t("Raising $18M to reach 10,000 businesses.", "h2"),
                    t(
                        "Use of funds: deepen the voice and scheduling product (40%), build a category-leading field and partner sales motion (35%), and expand into the next five trades (25%). 24 months of runway to $25M ARR.",
                        "body",
                    ),
                    button("dana@switchboard.ai"),
                ),
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
        ),
        section(
            "a12",
            group(
                t("08 — Vision", "label"),
                t("The operating system for the businesses that show up at your door.", "h1"),
                t(
                    "Eight million tradespeople run the physical economy off a phone and a paper calendar. Switchboard starts by answering the call — and ends up running the whole business behind it.",
                    "subtitle",
                ),
            ),
            { background: bgImage("switchboard-vision-truck", 0.5) },
        ),
    ],
    bgImage("switchboard-cover-ambient", 0.35),
);

export const productDemo: ArtifactContent = deck(
    "signal",
    [
        section(
            "p1",
            group(
                t("SIFT · PRODUCT TOUR", "label"),
                t("Turn every customer signal into your next release.", "h1"),
                t(
                    "Sift pulls feedback from support tickets, sales calls, reviews, and surveys into one place — then tells your product team what to build next, and exactly who asked for it.",
                    "subtitle",
                ),
                badge("A FIVE-MINUTE TOUR"),
            ),
            { background: bgImage("sift-product-cover", 0.55) },
        ),
        section(
            "p2",
            row(
                group(
                    t("Who it's for", "label"),
                    t("Built for the people who own the roadmap.", "h2"),
                    t(
                        "Product managers, support leaders, and founders at growing B2B software companies — anyone who has to decide what's worth building when every customer is asking for something different.",
                        "body",
                    ),
                ),
                img("sift-pm-team", 1.0),
            ),
        ),
        section(
            "p3",
            split(
                40,
                img("sift-scattered-feedback", 1.1),
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
        ),
        section(
            "p4",
            split(
                40,
                img("sift-unified-inbox", 1.1),
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
        ),
        section(
            "p5",
            split(
                60,
                group(
                    t("The tour · 02", "label"),
                    t("Sift reads it so your team doesn't have to.", "h2"),
                    bullets(
                        "Every piece of feedback is summarized, sentiment-scored, and sorted into themes automatically",
                        "Duplicate requests merge into one, with a running count and the revenue behind them",
                        'Ask in plain English — "what are enterprise accounts frustrated by?" — and get the answer with receipts',
                    ),
                ),
                img("sift-ai-themes", 0.82),
            ),
        ),
        section(
            "p6",
            split(
                40,
                img("sift-insights-dashboard", 1.1),
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
        ),
        section(
            "p7",
            split(
                60,
                group(
                    t("The tour · 04", "label"),
                    t("Close the loop without leaving Sift.", "h2"),
                    bullets(
                        "Turn a theme into a roadmap item and push it to Jira or Linear in a click",
                        "When it ships, Sift messages every customer who asked",
                        "Reopen rates drop and renewal calls get a lot friendlier",
                    ),
                ),
                img("sift-close-the-loop", 0.82),
            ),
        ),
        section(
            "p8",
            row(
                stat("9 hrs", "saved per PM, every week"),
                stat("3.4×", "more feedback reviewed"),
                stat("28%", "faster from request to release"),
            ),
        ),
        section(
            "p9",
            quote(
                "We stopped arguing about the roadmap in meetings. Now we just open Sift and the answer's already there.",
                "— Priya Nair, VP Product, Northwind Software",
            ),
            { background: bgImage("sift-customer-office", 0.6) },
        ),
        section(
            "p10",
            row(
                card(t("Support", "h3"), t("Zendesk · Intercom · Front · Help Scout", "body")),
                card(t("Sales & calls", "h3"), t("Gong · Salesforce · HubSpot · Slack", "body")),
                card(
                    t("Voice of customer", "h3"),
                    t("G2 · App Store · Typeform · NPS surveys", "body"),
                ),
            ),
        ),
        section(
            "p11",
            group(
                t("Pricing", "label"),
                t("Starts free. Scales with your team, not your ticket volume.", "h2"),
                table(
                    "Plan,Price,Built for\nFree,$0,Up to 1k feedback items / mo\nTeam,$99 / mo,Growing product teams\nBusiness,$399 / mo,Multiple products & segments\nEnterprise,Custom,SSO · security review · SLAs",
                ),
            ),
        ),
        section(
            "p12",
            group(
                t("Get started", "label"),
                t("Stop guessing. Start shipping what customers actually asked for.", "h1"),
                t(
                    "Connect your first source in under ten minutes — free for your first 1,000 pieces of feedback, no credit card.",
                    "subtitle",
                ),
                button("Start free"),
            ),
            { background: bgImage("sift-get-started-cover", 0.55) },
        ),
    ],
    bgImage("sift-cover-ambient", 0.35),
);

export const companyOverview: ArtifactContent = deck(
    "couture",
    [
        section(
            "c1",
            group(
                t("FERNWOOD & CO.", "label"),
                t("Furniture made to outlast the trend that inspired it.", "h1"),
                t(
                    "We are a Portland design studio and workshop making contemporary furniture, lighting, and objects — drawn by hand, built by people, and meant to be handed down.",
                    "subtitle",
                ),
                badge("EST. 2012 · PORTLAND, OREGON"),
            ),
            { background: bgImage("fernwood-workshop-cover", 0.55) },
        ),

        section(
            "c2",
            split(
                60,
                group(
                    t("WHAT WE DO", "label"),
                    t(
                        "We design and build furniture for the spaces people actually live in.",
                        "h2",
                    ),
                    t(
                        "From a single dining table to the seating for a 200-room hotel, every Fernwood piece is designed in-house and made to order in our Southeast Portland workshop. No middlemen, no warehouse of the same chair — just considered work, built to last.",
                        "body",
                    ),
                ),
                img("fernwood-dining-table", 0.82),
            ),
        ),

        section(
            "c3",
            split(
                40,
                img("fernwood-founders-bench", 1.05),
                group(
                    t("OUR STORY", "label"),
                    t("It started with one stubborn bench.", "h2"),
                    t(
                        "In 2012, Mara and Elias Fernwood couldn't find a bench that would survive their kids, so they built one. Friends asked for theirs. A decade later, that same joinery holds up every piece we ship — now from a 12,000-square-foot workshop and a team of thirty makers.",
                        "body",
                    ),
                ),
            ),
        ),

        section(
            "c4",
            row(
                card(
                    img("fernwood-seating", 1.4),
                    t("Seating", "h3"),
                    t(
                        "Chairs, benches, and sofas with frames that are screwed, not stapled — and reupholstered, not replaced.",
                        "caption",
                    ),
                ),
                card(
                    img("fernwood-tables", 1.4),
                    t("Tables & casegoods", "h3"),
                    t(
                        "Dining tables, desks, and storage in solid oak, walnut, and ash, finished by hand.",
                        "caption",
                    ),
                ),
                card(
                    img("fernwood-lighting", 1.4),
                    t("Lighting", "h3"),
                    t(
                        "Pendants, sconces, and floor lamps in turned wood, blown glass, and brushed brass.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "c5",
            group(
                t("OUR CRAFT", "label"),
                t("Real materials, joined to last a generation.", "h2"),
                t(
                    "We work only in FSC-certified hardwoods, water-based finishes, and solid brass hardware — nothing veneered, nothing disposable. Each joint is cut to fit, each surface sanded through nine grits, and each piece signed by the maker who built it.",
                    "body",
                ),
                button("Tour the workshop"),
            ),
            { background: bgImage("fernwood-craft-joinery", 0.6) },
        ),

        section(
            "c6",
            split(
                60,
                group(
                    t("WHO WE SERVE", "label"),
                    t("Trusted by the people who care how a room feels.", "h2"),
                    t(
                        "Half our work is bespoke commissions for interior designers and architects; the rest furnishes hotels, restaurants, and workplaces that want pieces no one else will have.",
                        "body",
                    ),
                    bullets(
                        "Interior designers & architects — a trade program with to-the-trade pricing",
                        "Hospitality — hotels, restaurants, and members' clubs",
                        "Workplace — studios and offices that have outgrown the catalog",
                        "Private clients — heirloom commissions, made to measure",
                    ),
                    t(
                        "Selected clients · The Hoxton · Roman and Williams · Studio McGee · Ace Hotel",
                        "caption",
                    ),
                ),
                img("fernwood-hotel-lobby", 0.82),
            ),
        ),

        section(
            "c7",
            row(
                quote(
                    "Fernwood is the only shop I trust with a lobby. The pieces arrive better than the drawings, every time.",
                    "Dahlia Reyes · Principal, Reyes + Co. Interiors",
                ),
                quote(
                    "Five years and forty covers a night, and our Fernwood chairs haven't loosened a single joint.",
                    "Marco Bélanger · Owner, Cafe Mistral",
                ),
            ),
        ),

        section(
            "c8",
            row(
                stat("8,400", "pieces built and shipped since 2012"),
                stat("30", "makers, finishers, and designers on the bench"),
                stat("25 yrs", "structural warranty on every frame"),
            ),
        ),

        section(
            "c9",
            split(
                60,
                group(
                    t("HOW WE WORK", "label"),
                    t("From sketch to your room in four steps.", "h2"),
                    t(
                        "Every commission moves through the same calm process — so you always know where your piece is and who is building it.",
                        "body",
                    ),
                    diagram(
                        "process",
                        "Design & quote, Hand-cut joinery, Finish & sign, White-glove delivery",
                        180,
                    ),
                ),
                img("fernwood-finishing-bench", 0.9),
            ),
        ),

        section(
            "c10",
            row(
                group(
                    img("fernwood-team-mara", 1),
                    t("Mara Fernwood", "h3"),
                    t("Founder & Creative Director", "caption"),
                ),
                group(
                    img("fernwood-team-elias", 1),
                    t("Elias Fernwood", "h3"),
                    t("Founder & Head of Workshop", "caption"),
                ),
                group(
                    img("fernwood-team-jun", 1),
                    t("Jun Park", "h3"),
                    t("Design Lead · ex-Heath Ceramics", "caption"),
                ),
            ),
        ),

        section(
            "c11",
            split(
                40,
                img("fernwood-values-detail", 1.05),
                group(
                    t("WHAT WE BELIEVE", "label"),
                    t("Make less. Make it last.", "h2"),
                    bullets(
                        "Repairable by design — we keep the parts and plans for everything we ship",
                        "Local first — we mill, build, and finish under one Portland roof",
                        "Fair work — a living wage and a real bench for every maker",
                        "Honest materials — solid wood and metal, or we don't use it",
                    ),
                    callout(
                        "success",
                        t(
                            "Carbon-measured since 2021 — every piece ships climate-neutral, and our offcuts heat the shop.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),

        section(
            "c12",
            group(
                t("GET IN TOUCH", "label"),
                t("Let's build something that lasts.", "h1"),
                t(
                    "Visit the workshop, start a commission, or join the trade program. We'd love to make something for your space.",
                    "subtitle",
                ),
                button("hello@fernwoodco.com"),
            ),
            { background: bgImage("fernwood-showroom-light", 0.55) },
        ),
    ],
    bgImage("fernwood-ambient", 0.34),
);

export const gtmPlan: ArtifactContent = deck(
    "swiss",
    [
        section(
            "g1",
            group(
                t("TIDEPOOL · GO-TO-MARKET PLAN", "label"),
                t("Launching the inventory brain for growing brands.", "h1"),
                t(
                    "Our plan to take Tidepool — demand planning and inventory for multi-channel retail — from private beta to 1,000 paying brands in twelve months.",
                    "subtitle",
                ),
                badge("GO-TO-MARKET PLAN · H2 2026"),
            ),
            { background: bgImage("tidepool-warehouse-cover", 0.55) },
        ),

        section(
            "g2",
            split(
                60,
                group(
                    t("THE OPPORTUNITY", "label"),
                    t("Growing brands are flying blind on inventory.", "h2"),
                    t(
                        "Once a brand sells across a website, three marketplaces, and a few wholesale accounts, spreadsheets stop working — and stockouts and overstock quietly eat the margin. The tools that solve it are built for the enterprise and priced out of reach. That gap is ours.",
                        "body",
                    ),
                ),
                group(
                    chart("bar", "12, 19, 31, 48, 72, 104", 240),
                    t(
                        "US mid-market brands adopting inventory software, 2021–2026 (thousands)",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "g3",
            row(
                card(
                    img("tidepool-dtc-brand", 1.4),
                    t("DTC brands", "h3"),
                    t(
                        "$2M–$30M online sellers on Shopify juggling Amazon, TikTok Shop, and their own site.",
                        "caption",
                    ),
                ),
                card(
                    img("tidepool-multi-location", 1.4),
                    t("Multi-location retail", "h3"),
                    t(
                        "3–20 store chains that need one source of truth across the floor and the stockroom.",
                        "caption",
                    ),
                ),
                card(
                    img("tidepool-wholesale", 1.4),
                    t("Wholesale & distribution", "h3"),
                    t(
                        "Brands shipping to stockists who need to promise dates they can actually keep.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "g4",
            group(
                t("POSITIONING", "label"),
                t("The demand-planning brain built for brands, not the enterprise.", "h2"),
                t(
                    "For operators at growing multi-channel brands who are tired of guessing, Tidepool is the inventory platform that forecasts demand, flags stockouts before they happen, and tells you exactly what to reorder — without an ERP project or a six-figure contract.",
                    "body",
                ),
                callout(
                    "info",
                    t(
                        "Where the big platforms need a consultant and six months, Tidepool is live in an afternoon and pays for itself the first time it prevents a stockout.",
                        "body",
                    ),
                ),
            ),
            { background: bgImage("tidepool-positioning-shelves", 0.6) },
        ),

        section(
            "g5",
            split(
                40,
                img("tidepool-funnel-dashboard", 1.05),
                group(
                    t("THE FUNNEL", "label"),
                    t("How a curious operator becomes a paying brand.", "h2"),
                    t(
                        "We earn trust at the top with genuinely useful content, convert with a free plan that solves a real problem, and expand as a brand connects more channels.",
                        "body",
                    ),
                    diagram(
                        "funnel",
                        "Discover via search & community, Free plan sign-up, Connect a channel, Convert to paid, Expand seats & SKUs",
                        220,
                    ),
                ),
            ),
        ),

        section(
            "g6",
            row(
                card(
                    img("tidepool-channel-content", 1.4),
                    t("Content & SEO", "h3"),
                    t(
                        "Operator-grade guides on demand planning that rank for the problems brands Google at 11pm.",
                        "caption",
                    ),
                ),
                card(
                    img("tidepool-channel-partners", 1.4),
                    t("Platform partnerships", "h3"),
                    t(
                        "A featured Shopify app and co-marketing with 3PLs and agencies who already have the trust.",
                        "caption",
                    ),
                ),
                card(
                    img("tidepool-channel-community", 1.4),
                    t("Community & events", "h3"),
                    t(
                        "Founder dinners and an operators' Slack where our best customers sell the next ones.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "g7",
            group(
                t("PRICING & PACKAGING", "label"),
                t("Priced to land self-serve and grow with the brand.", "h2"),
                table(
                    "Plan,Price,Built for,Key limits\nFree,$0,Single-channel sellers,1 channel · 500 SKUs · 90-day forecast\nGrowth,$149 / mo,Multi-channel DTC,Unlimited channels · 5k SKUs · reorder alerts\nPro,$399 / mo,Scaling & wholesale,Demand planning · POs · 3 seats\nEnterprise,Custom,Multi-entity brands,SSO · API · onboarding & SLAs",
                ),
                t(
                    "Land on Free or Growth self-serve, convert to Pro as channels and SKUs grow, Enterprise for multi-entity brands.",
                    "caption",
                ),
            ),
        ),

        section(
            "g8",
            group(
                t("LAUNCH TIMELINE", "label"),
                t("Four phases from beta to GA.", "h2"),
                diagram(
                    "process",
                    "Private beta · 40 brands, Open beta · pricing live, Public launch · Shopify feature, Scale · paid channels on",
                    180,
                ),
            ),
        ),

        section(
            "g9",
            row(
                stat("1,000", "paying brands by Q2 '27"),
                stat("$3.6M", "ARR target in the first year"),
                stat("< 4 mo", "CAC payback, blended across channels"),
            ),
        ),

        section(
            "g10",
            row(
                group(
                    t("FIRST 90 DAYS", "label"),
                    t("What we ship before launch.", "h2"),
                    bullets(
                        "Weeks 1–4 — Finalize Free/Growth packaging and the self-serve onboarding",
                        "Weeks 5–8 — Ship the Shopify app listing and three cornerstone guides",
                        "Weeks 9–12 — Open beta to the waitlist and stand up the operators' community",
                    ),
                ),
                group(
                    t("OWNERS", "label"),
                    t("Who's accountable", "h3"),
                    table(
                        "Workstream,Owner\nProduct & onboarding,Priya Anand\nContent & SEO,Tomas Lindqvist\nPartnerships,Renee Okoro\nCommunity & events,Dario Vella",
                    ),
                ),
            ),
        ),

        section(
            "g11",
            group(
                t("NEXT STEPS", "label"),
                t("Greenlight the launch.", "h1"),
                t(
                    "Approve the plan and the H2 budget this week, and Tidepool ships to the waitlist on September 15.",
                    "subtitle",
                ),
                button("Approve & kick off"),
            ),
            { background: bgImage("tidepool-launch-horizon", 0.55) },
        ),
    ],
    bgImage("tidepool-ambient", 0.34),
);
