import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    cell,
    chart,
    diagram,
    doc,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

// A company annual report — believable, image-rich, financials and all.
export const annualReport: ArtifactContent = doc(
    "press",
    [
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("ANNUAL REPORT · FISCAL 2025", "label"),
                        t("Solstice", "h1"),
                        t(
                            "Powering homes that give back. A year we crossed half a billion in revenue, doubled our storage business, and put clean energy on 142,000 roofs.",
                            "subtitle",
                        ),
                        t(
                            "Solstice Energy, Inc. · Denver, Colorado · Year ended December 31, 2025",
                            "caption",
                        ),
                        badge("NYSE: SOLS · 1,280 EMPLOYEES · 14 STATES"),
                    ),
                ),
            },
            { background: bgImage("solstice-cover-rooftop-solar-dusk", 0.55) },
        ),
        section("s2", "split-6040", {
            a: cell(
                group(
                    t("A letter from our CEO", "label"),
                    t("We built this year to last.", "h2"),
                    t(
                        "When we founded Solstice in a garage in 2014, the pitch was simple and a little naïve: a home should make more than it takes. Eleven years later that idea is a business of real scale — and 2025 was the year it stopped being a promise and became a balance sheet.",
                        "subtitle",
                    ),
                    t(
                        "Revenue grew 37% to $548 million. We installed our hundred-thousandth solar roof, shipped our first home battery, and turned tens of thousands of households into a single, dispatchable power plant. We did all of it while bringing operating losses down to their lowest level ever — proof that doing this well and doing this responsibly are the same project, not competing ones.",
                        "body",
                    ),
                    t(
                        "None of it happened in a straight line. Interest rates made financing harder, two product launches slipped a quarter, and we learned — again — that the hardest part of energy is not the panel on the roof but the permit on the desk. What did not waver was our team and the families who trusted us. This report is, more than anything, an accounting of that trust.",
                        "body",
                    ),
                    t("— Naomi Okonkwo, Co-founder & Chief Executive Officer", "caption"),
                ),
            ),
            b: cell(img("solstice-ceo-naomi-portrait", 0.82)),
        }),
        section("s3", "full", {
            a: cell(
                group(
                    t("2025 in review", "label"),
                    t("The year in numbers", "h2"),
                    t(
                        "Three figures capture where Solstice stood at year end: how much we earned, how much clean energy we made, and how many homes were counting on us to make it.",
                        "subtitle",
                    ),
                ),
            ),
        }),
        section("s4", "three-up", {
            a: cell(stat("$548M", "total revenue, up 37% year over year")),
            b: cell(stat("1.9M MWh", "clean electricity generated across the network")),
            c: cell(stat("142,000", "homes powered in 14 states")),
        }),
        section("s5", "split-6040", {
            a: cell(
                group(
                    t("Financial highlights", "label"),
                    t("Revenue crossed half a billion.", "h2"),
                    t(
                        "Top-line growth held above 35% for the fifth consecutive year, driven by a record install season and the first full year of battery sales. Gross margin expanded 410 basis points to 31.2% as panel costs fell and our install crews got faster.",
                        "body",
                    ),
                    stat("31.2%", "gross margin, up from 27.1% in FY2024"),
                ),
            ),
            b: cell(
                group(
                    chart("line", "88, 142, 221, 318, 401, 548", 300),
                    t("Total revenue, $M, FY2020–FY2025", "caption"),
                ),
            ),
        }),
        section("s6", "full", {
            a: cell(
                group(
                    t("Financial highlights", "label"),
                    t("Where the growth came from", "h2"),
                    t(
                        "Storage was the breakout story of the year — Solstice One nearly doubled the segment — while software and services grew steadily as more homes came onto recurring plans. Wholesale and financing shrank deliberately as we tightened underwriting in a higher-rate environment.",
                        "body",
                    ),
                    table(
                        "Segment,FY2024,FY2025,Change\nHome solar,$246M,$318M,+29%\nBattery storage,$78M,$142M,+82%\nSoftware & services,$51M,$64M,+25%\nWholesale & financing,$26M,$24M,−8%\nTotal,$401M,$548M,+37%",
                    ),
                    chart("bar", "318, 142, 64, 24", 260),
                    t("FY2025 revenue by segment, $M", "caption"),
                ),
            ),
        }),
        section(
            "s7",
            "full",
            {
                a: cell(
                    group(
                        t("Product & milestones", "label"),
                        t("A year of shipping", "h2"),
                        t(
                            "We promised investors three things at the start of 2025: a home battery, a rebuilt app, and a way for customers to earn from the grid. By December all three were live — the first time we have landed an entire roadmap in a single year.",
                            "subtitle",
                        ),
                        diagram(
                            "process",
                            "Solstice One battery, Aurora 3.0 app, GridShare VPP, Nationwide care",
                            200,
                        ),
                    ),
                ),
            },
            { background: bgImage("solstice-install-crew-rooftop", 0.55) },
        ),
        section("s8", "three-up", {
            a: cell(
                card(
                    img("solstice-battery-product-wall", 1),
                    t("Solstice One", "h3"),
                    t(
                        "Our first home battery — 13.5 kWh, whole-home backup, installed in a single day.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("solstice-app-aurora-dashboard", 1),
                    t("Aurora 3.0", "h3"),
                    t(
                        "A rebuilt app that turns every roof into a dashboard — and every storm into a plan.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("solstice-gridshare-network", 1),
                    t("GridShare", "h3"),
                    t(
                        "A virtual power plant that pays members to share stored energy when demand peaks.",
                        "caption",
                    ),
                ),
            ),
        }),
        section("s9", "split-4060", {
            a: cell(img("solstice-install-team-truck", 1.05)),
            b: cell(
                group(
                    t("Our people", "label"),
                    t("The company is the crew.", "h2"),
                    t(
                        "Solar is still a job done on a ladder, in the sun, with your hands. In 2025 we grew the team to 1,280 — most of them installers, electricians, and care specialists — and brought our in-house apprenticeship to nine cities, training 210 new electricians from the communities we serve.",
                        "body",
                    ),
                ),
            ),
        }),
        section("s10", "three-up", {
            a: cell(stat("1,280", "team members across engineering, install, and care")),
            b: cell(stat("92", "employee net promoter score (eNPS)")),
            c: cell(stat("38%", "of leadership roles held by women")),
        }),
        section("s11", "full", {
            a: cell(
                callout(
                    "success",
                    group(
                        t("Sustainability & community", "label"),
                        t("The point was never just the panels.", "h3"),
                        t(
                            "Energy from the Solstice network avoided 1.1 million tonnes of CO₂ in 2025 — the equivalent of taking 240,000 cars off the road. We recovered and recycled 96% of decommissioned hardware, and the Solstice Community Fund committed $4M to put rooftop solar and storage on 60 schools and clinics in neighborhoods that the energy transition usually reaches last.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section(
            "s12",
            "split-6040",
            {
                a: cell(
                    group(
                        t("Looking ahead", "label"),
                        t("What we're building in 2026", "h2"),
                        t(
                            "We enter the year with the strongest backlog in our history and a clear mandate: get faster, get bigger, and turn the corner to profitability.",
                            "subtitle",
                        ),
                        bullets(
                            "Open three regional install hubs to cut wait times below ten days",
                            "Ship Solstice One v2 — 30% more capacity at the same price",
                            "Enroll 50,000 homes in GridShare, our virtual power plant",
                            "Expand into four new states across the Southeast",
                            "Reach cash-flow-positive operations by the end of FY2026",
                        ),
                    ),
                ),
                b: cell(img("solstice-future-home-evening", 0.9)),
            },
            { background: bgImage("solstice-horizon-rooftops", 0.5) },
        ),
        section("s13", "full", {
            a: cell(
                group(
                    t(
                        "To our customers, our crews, and our shareholders: thank you for a year that asked a lot and gave back more. The sun came up 365 times in 2025. So did we.",
                        "subtitle",
                    ),
                    t(
                        "Solstice Energy, Inc. · Form 10-K and full financial statements available at investors.solstice.energy · Denver, Colorado · February 2026",
                        "caption",
                    ),
                ),
            ),
        }),
    ],
    bgImage("solstice-report-bg", 0.3),
);

// A customer case study — the arc from problem to proof.
export const caseStudy: ArtifactContent = doc(
    "mineral",
    [
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("CUSTOMER STORY · MARLOW HOSPITALITY GROUP", "label"),
                        t("Scaling hospitality without scaling the chaos", "h1"),
                        t(
                            "How a 22-restaurant group cut labor costs 18% and opened six new locations in a year — with one platform running the floor behind the scenes.",
                            "subtitle",
                        ),
                        t("A Tempo case study · Hospitality · 12-month engagement", "caption"),
                        badge("PUBLISHED WITH PERMISSION · MARLOW HOSPITALITY GROUP"),
                    ),
                ),
            },
            { background: bgImage("marlow-dining-room-golden-hour", 0.55) },
        ),
        section("s2", "split-6040", {
            a: cell(
                group(
                    t("The customer", "label"),
                    t("Twenty-two kitchens, one standard", "h2"),
                    t(
                        "Marlow Hospitality Group runs some of the most loved tables on the East Coast — from the original Marlow & Sons bistro in Brooklyn to fast-casual counters in three airports. What ties them together isn't a menu; it's a promise that the service feels the same whether you're in seat 4 or location 22.",
                        "subtitle",
                    ),
                    t(
                        "By 2024 that promise was getting expensive to keep. Each restaurant scheduled its own staff in its own spreadsheet, and a 1,400-person workforce was being managed by 22 people who had never met.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("marlow-restaurant-interior-warm", 0.82)),
        }),
        section("s3", "three-up", {
            a: cell(stat("22", "restaurants across 5 cities")),
            b: cell(stat("1,400", "hourly team members")),
            c: cell(stat("Est. 2009", "Brooklyn, New York")),
        }),
        section("s4", "split-4060", {
            a: cell(img("marlow-kitchen-dinner-rush", 1.05)),
            b: cell(
                group(
                    t("The challenge", "label"),
                    t("Growth was outrunning the spreadsheet", "h2"),
                    t(
                        "Every general manager built next week's schedule by hand on Sunday night. Forecasts were a guess, overtime was a surprise, and a sick line cook in Boston could not be covered by an off-shift cook two blocks away because no one could see who that was.",
                        "body",
                    ),
                    bullets(
                        "Labor ran 4–6 points over target in peak weeks",
                        "Managers spent 8+ hours a week building schedules",
                        "Shift swaps happened in group texts no one could audit",
                        "New-store openings took three managers off the floor",
                    ),
                ),
            ),
        }),
        section("s5", "full", {
            a: cell(
                callout(
                    "warn",
                    group(
                        t("The cost of standing still", "h3"),
                        t(
                            "An internal review put the bill at roughly $2.1M a year — overtime that forecasting could have prevented, plus a 74% annual turnover rate fed by schedules that landed late and changed often. With six new locations on the calendar, doing nothing was the most expensive option on the table.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section("s6", "split-6040", {
            a: cell(
                group(
                    t("The approach", "label"),
                    t("Pilot one city, then earn the rest", "h2"),
                    t(
                        "Rather than a top-down rollout, Tempo started where the pain was sharpest: the four Boston restaurants. We rebuilt their scheduling around demand forecasts drawn from three years of POS data, then let results — not a mandate — sell the other 18 locations.",
                        "body",
                    ),
                    diagram("process", "Audit, Pilot in Boston, Roll out by city, Optimize", 200),
                ),
            ),
            b: cell(img("marlow-manager-tablet-floor", 0.85)),
        }),
        section("s7", "split-4060", {
            a: cell(img("marlow-team-prep-morning", 1.05)),
            b: cell(
                group(
                    t("The solution", "label"),
                    t("One platform, from forecast to clock-out", "h2"),
                    t(
                        "Tempo gave every manager a demand forecast, an auto-built schedule they could adjust in minutes, and a mobile app where the whole company could pick up open shifts. The floor stopped guessing and started planning.",
                        "body",
                    ),
                    bullets(
                        "Sales-driven forecasts auto-build the first draft of every schedule",
                        "A shared shift marketplace lets staff cover across all 22 locations",
                        "Live labor-vs-target alerts catch overtime before it happens",
                        "One-tap onboarding flows stood up each new store in days",
                    ),
                ),
            ),
        }),
        section("s8", "full", {
            a: cell(
                group(
                    t("The results", "label"),
                    t("Twelve months in", "h2"),
                    t(
                        "Inside a year, the numbers that had been drifting the wrong way reversed — and the six new restaurants opened on schedule, staffed from day one.",
                        "subtitle",
                    ),
                    table(
                        "Metric,Before Tempo,After 12 months,Change\nLabor as % of sales,29.4%,24.1%,−18%\nManager hours on scheduling,8.2 / wk,1.6 / wk,−80%\nAnnual staff turnover,74%,49%,−25 pts\nNew-store time to fully staffed,6 weeks,9 days,−79%",
                    ),
                ),
            ),
        }),
        section("s9", "three-up", {
            a: cell(stat("−18%", "labor cost as a share of sales")),
            b: cell(stat("$2.4M", "annualized savings across the group")),
            c: cell(stat("+31", "points of manager satisfaction (eNPS)")),
        }),
        section("s10", "split-6040", {
            a: cell(
                group(
                    t("The results", "label"),
                    t("Labor found its level", "h2"),
                    t(
                        "The line below is labor as a percentage of sales, month by month across the rollout. As each city came onto Tempo, the cost curve bent — and then held, even through the holiday rush and the six openings.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    chart("line", "29.4, 28.8, 27.9, 27.1, 26.2, 25.4, 24.9, 24.1", 280),
                    t("Labor as % of sales, monthly across the engagement", "caption"),
                ),
            ),
        }),
        section(
            "s11",
            "full",
            {
                a: cell(
                    quote(
                        "I got my Sundays back, and my GMs got their floors back. Tempo didn't just save us money — it let us open six restaurants without losing the thing that makes Marlow, Marlow.",
                        "— Daniela Marlow, Chief Operating Officer, Marlow Hospitality Group",
                    ),
                ),
            },
            { background: bgImage("marlow-chef-plating-closeup", 0.6) },
        ),
        section("s12", "split-6040", {
            a: cell(
                group(
                    t("The takeaway", "label"),
                    t("Run the floor, not the spreadsheet", "h2"),
                    t(
                        "Marlow proved what we believe at Tempo: hospitality scales when the back office disappears. Give managers a forecast and a shared workforce, and they'll spend their hours where guests can feel them. See what a 30-minute walkthrough could find in your labor line.",
                        "subtitle",
                    ),
                    button("Book a demo"),
                ),
            ),
            b: cell(img("marlow-host-welcome-door", 0.9)),
        }),
    ],
    bgImage("marlow-case-bg", 0.3),
);
