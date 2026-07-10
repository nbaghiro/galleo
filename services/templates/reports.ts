// The reports template set (all variants — un-sharded from the size-split -extra/-extra2 files).

import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    chart,
    diagram,
    doc,
    group,
    img,
    quote,
    row,
    section,
    split,
    stat,
    t,
    table,
    divider,
} from "@model/authoring";

// A company annual report — believable, image-rich, financials and all.
export const annualReport: ArtifactContent = doc(
    "press",
    [
        section(
            "s1",
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
            { background: bgImage("solstice-cover-rooftop-solar-dusk", 0.55) },
        ),
        section(
            "s2",
            split(
                60,
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
                img("solstice-ceo-naomi-portrait", 0.82),
            ),
        ),
        section(
            "s3",
            group(
                t("2025 in review", "label"),
                t("The year in numbers", "h2"),
                t(
                    "Three figures capture where Solstice stood at year end: how much we earned, how much clean energy we made, and how many homes were counting on us to make it.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s4",
            row(
                stat("$548M", "total revenue, up 37% year over year"),
                stat("1.9M MWh", "clean electricity generated across the network"),
                stat("142,000", "homes powered in 14 states"),
            ),
        ),
        section(
            "s5",
            split(
                60,
                group(
                    t("Financial highlights", "label"),
                    t("Revenue crossed half a billion.", "h2"),
                    t(
                        "Top-line growth held above 35% for the fifth consecutive year, driven by a record install season and the first full year of battery sales. Gross margin expanded 410 basis points to 31.2% as panel costs fell and our install crews got faster.",
                        "body",
                    ),
                    stat("31.2%", "gross margin, up from 27.1% in FY2024"),
                ),
                group(
                    chart("line", "88, 142, 221, 318, 401, 548", 300),
                    t("Total revenue, $M, FY2020–FY2025", "caption"),
                ),
            ),
        ),
        section(
            "s6",
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
        section(
            "s7",
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
            { background: bgImage("solstice-install-crew-rooftop", 0.55) },
        ),
        section(
            "s8",
            row(
                card(
                    img("solstice-battery-product-wall", 1),
                    t("Solstice One", "h3"),
                    t(
                        "Our first home battery — 13.5 kWh, whole-home backup, installed in a single day.",
                        "caption",
                    ),
                ),
                card(
                    img("solstice-app-aurora-dashboard", 1),
                    t("Aurora 3.0", "h3"),
                    t(
                        "A rebuilt app that turns every roof into a dashboard — and every storm into a plan.",
                        "caption",
                    ),
                ),
                card(
                    img("solstice-gridshare-network", 1),
                    t("GridShare", "h3"),
                    t(
                        "A virtual power plant that pays members to share stored energy when demand peaks.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s9",
            split(
                40,
                img("solstice-install-team-truck", 1.05),
                group(
                    t("Our people", "label"),
                    t("The company is the crew.", "h2"),
                    t(
                        "Solar is still a job done on a ladder, in the sun, with your hands. In 2025 we grew the team to 1,280 — most of them installers, electricians, and care specialists — and brought our in-house apprenticeship to nine cities, training 210 new electricians from the communities we serve.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s10",
            row(
                stat("1,280", "team members across engineering, install, and care"),
                stat("92", "employee net promoter score (eNPS)"),
                stat("38%", "of leadership roles held by women"),
            ),
        ),
        section(
            "s11",
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
        section(
            "s12",
            split(
                60,
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
                img("solstice-future-home-evening", 0.9),
            ),
            { background: bgImage("solstice-horizon-rooftops", 0.5) },
        ),
        section(
            "s13",
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
    ],
    bgImage("solstice-report-bg", 0.3),
);

// A customer case study — the arc from problem to proof.
export const caseStudy: ArtifactContent = doc(
    "mineral",
    [
        section(
            "s1",
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
            { background: bgImage("marlow-dining-room-golden-hour", 0.55) },
        ),
        section(
            "s2",
            split(
                60,
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
                img("marlow-restaurant-interior-warm", 0.82),
            ),
        ),
        section(
            "s3",
            row(
                stat("22", "restaurants across 5 cities"),
                stat("1,400", "hourly team members"),
                stat("Est. 2009", "Brooklyn, New York"),
            ),
        ),
        section(
            "s4",
            split(
                40,
                img("marlow-kitchen-dinner-rush", 1.05),
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
        ),
        section(
            "s5",
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
        section(
            "s6",
            split(
                60,
                group(
                    t("The approach", "label"),
                    t("Pilot one city, then earn the rest", "h2"),
                    t(
                        "Rather than a top-down rollout, Tempo started where the pain was sharpest: the four Boston restaurants. We rebuilt their scheduling around demand forecasts drawn from three years of POS data, then let results — not a mandate — sell the other 18 locations.",
                        "body",
                    ),
                    diagram("process", "Audit, Pilot in Boston, Roll out by city, Optimize", 200),
                ),
                img("marlow-manager-tablet-floor", 0.85),
            ),
        ),
        section(
            "s7",
            split(
                40,
                img("marlow-team-prep-morning", 1.05),
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
        ),
        section(
            "s8",
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
        section(
            "s9",
            row(
                stat("−18%", "labor cost as a share of sales"),
                stat("$2.4M", "annualized savings across the group"),
                stat("+31", "points of manager satisfaction (eNPS)"),
            ),
        ),
        section(
            "s10",
            split(
                60,
                group(
                    t("The results", "label"),
                    t("Labor found its level", "h2"),
                    t(
                        "The line below is labor as a percentage of sales, month by month across the rollout. As each city came onto Tempo, the cost curve bent — and then held, even through the holiday rush and the six openings.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "29.4, 28.8, 27.9, 27.1, 26.2, 25.4, 24.9, 24.1", 280),
                    t("Labor as % of sales, monthly across the engagement", "caption"),
                ),
            ),
        ),
        section(
            "s11",
            quote(
                "I got my Sundays back, and my GMs got their floors back. Tempo didn't just save us money — it let us open six restaurants without losing the thing that makes Marlow, Marlow.",
                "— Daniela Marlow, Chief Operating Officer, Marlow Hospitality Group",
            ),
            { background: bgImage("marlow-chef-plating-closeup", 0.6) },
        ),
        section(
            "s12",
            split(
                60,
                group(
                    t("The takeaway", "label"),
                    t("Run the floor, not the spreadsheet", "h2"),
                    t(
                        "Marlow proved what we believe at Tempo: hospitality scales when the back office disappears. Give managers a forecast and a shared workforce, and they'll spend their hours where guests can feel them. See what a 30-minute walkthrough could find in your labor line.",
                        "subtitle",
                    ),
                    button("Book a demo"),
                ),
                img("marlow-host-welcome-door", 0.9),
            ),
        ),
    ],
    bgImage("marlow-case-bg", 0.3),
);

// A research report / whitepaper — the sixth edition of an annual study on remote work.
export const researchReport: ArtifactContent = doc(
    "studio",
    [
        section(
            "s1",
            group(
                t("RESEARCH REPORT · THE STATE OF REMOTE WORK 2026", "label"),
                t("Where Work Lives Now", "h1"),
                t(
                    "Six years after the office emptied, the question is no longer whether knowledge work can happen anywhere — it's where it happens best, and what that means for the people, places, and companies caught in between.",
                    "subtitle",
                ),
                t(
                    "Northwind Institute for Work · Annual Survey, sixth edition · June 2026",
                    "caption",
                ),
                badge("11,400 KNOWLEDGE WORKERS · 38 COUNTRIES · 6 INDUSTRIES"),
            ),
            { background: bgImage("remote-work-home-office-morning-light", 0.55) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("Executive summary", "label"),
                    t("Hybrid won — but nobody agrees what it means.", "h2"),
                    t(
                        "The headline of 2026 is settlement, not revolution. The fully-remote surge has cooled and the return-to-office mandates have plateaued; what's left is a durable, messy middle. Fifty-four percent of knowledge workers now split their week between home and an office, and almost none of them define that split the same way.",
                        "subtitle",
                    ),
                    t(
                        "Across 11,400 respondents we found that flexibility has become the single strongest predictor of retention — outranking pay growth for the first time in the survey's history. But the same flexibility that keeps people is quietly fragmenting how teams collaborate, mentor, and belong. The companies pulling ahead are not the most remote or the most in-person; they are the most deliberate.",
                        "body",
                    ),
                    t(
                        "This report lays out what changed in the past year, what the data says about productivity and presence, and what we believe the next phase of distributed work requires.",
                        "body",
                    ),
                ),
                img("remote-worker-laptop-kitchen-table", 0.82),
            ),
        ),
        section(
            "s3",
            split(
                40,
                img("research-survey-data-charts-desk", 1.05),
                group(
                    t("Methodology", "label"),
                    t("How we ran the study", "h2"),
                    t(
                        "Between February and April 2026 the Northwind Institute surveyed 11,400 full-time knowledge workers and conducted 84 structured interviews with people leaders. Respondents span six industries — technology, finance, healthcare, media, professional services, and the public sector — across 38 countries, weighted to reflect each market's knowledge-economy workforce.",
                        "body",
                    ),
                    bullets(
                        "11,400 survey responses, margin of error ±1.1 points",
                        "84 qualitative interviews with managers and HR leaders",
                        "Six industries, weighted to national workforce data",
                        "Productivity self-reports validated against 1,900 anonymized output logs",
                        "Year-over-year trends benchmarked to the 2021–2025 editions",
                    ),
                ),
            ),
        ),
        section(
            "s4",
            group(
                t("Key findings", "label"),
                t("Five things the data made clear", "h2"),
                t(
                    "The numbers this year tell a coherent story: the location debate is over, the calendar debate has just begun. Here is what stood out across the five findings that follow.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s5",
            split(
                60,
                group(
                    t("Finding 01 · Where work happens", "label"),
                    t("The week is split, not the workforce", "h2"),
                    t(
                        "Hybrid is no longer a transitional state on the way back to the office — it is the destination. A majority now work in a blended pattern, while fully-remote roles held steady and fully-in-office work continued its slow decline. The interesting movement is inside hybrid: the median in-office stint fell from 3.0 days to 2.4.",
                        "body",
                    ),
                    stat("2.4 days", "median time in-office per week among hybrid workers"),
                ),
                group(
                    chart("pie", "54, 27, 19", 280),
                    t(
                        "Work pattern: hybrid 54% · fully remote 27% · fully in-office 19%",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s6",
            row(
                stat("+11%", "self-reported focus-work output vs. a fully in-office baseline"),
                stat("72 min", "average daily commute time reclaimed by remote-capable staff"),
                stat("1 in 3", "managers who say measuring output still relies on presence"),
            ),
        ),
        section(
            "s7",
            split(
                40,
                img("modern-office-collaboration-space-bright", 1.05),
                group(
                    t("Finding 02 · The office's new job", "label"),
                    t("Buildings became meeting rooms", "h2"),
                    t(
                        "When people come in, they come in to be together. The share of office time spent in scheduled collaboration jumped sharply, while solo desk work — the thing offices were built for — migrated home. The implication for real estate is stark: companies need less square footage but far more of it configured for groups.",
                        "body",
                    ),
                    chart("bar", "31, 44, 58, 67", 220),
                    t("Share of office hours spent in collaboration, 2023→2026", "caption"),
                ),
            ),
        ),
        section(
            "s8",
            group(
                t("Finding 03 · The geography of talent", "label"),
                quote(
                    "We stopped hiring from a forty-mile radius and started hiring from a forty-country one. Our best engineer last year lives three time zones from anyone she works with.",
                    "— Priya Raghunathan, VP of Engineering, interviewed for this report",
                ),
                t(
                    "Remote-capable employers now draw 41% of new hires from outside their headquarters metro — up from 12% in 2020. Talent is dispersing toward lower-cost cities and toward the lives people actually want, and the firms that embraced distributed hiring report the widest candidate pools and the shortest time-to-fill.",
                    "body",
                ),
            ),
            { background: bgImage("world-map-talent-network-connections", 0.6) },
        ),
        section(
            "s9",
            group(
                t("Finding 04 · The trade-offs, side by side", "label"),
                t("No model wins on every axis", "h2"),
                t(
                    "When we hold output, retention, mentorship, and cost up against each other, each working model trades one strength for another. Hybrid leads on retention and balance; fully-remote leads on cost and reach; in-office still leads on early-career mentorship. There is no free lunch — only an honest choice about what a team needs most.",
                    "body",
                ),
                table(
                    "Dimension,Fully in-office,Hybrid,Fully remote\nFocus-work output,Baseline,+11%,+14%\n12-month retention,81%,89%,84%\nEarly-career mentorship,Strong,Moderate,Weak\nReal-estate cost / head,$11.2k,$6.4k,$1.9k\nReported belonging,High,High,Moderate",
                ),
            ),
        ),
        section(
            "s10",
            split(
                60,
                callout(
                    "warn",
                    group(
                        t("Implications · The proximity gap", "label"),
                        t("Mentorship is the quiet casualty", "h3"),
                        t(
                            "The clearest warning in the data concerns people in their first three years of work. Junior staff in fully-remote roles reported 28% fewer informal coaching moments and were promoted, on average, four months later than in-office peers. Flexibility is a benefit the experienced enjoy and the inexperienced often pay for — unless mentorship is designed in on purpose.",
                            "body",
                        ),
                    ),
                ),
                img("mentor-junior-colleague-pairing-desk", 0.85),
            ),
        ),
        section(
            "s11",
            group(
                t("Recommendations", "label"),
                t("What deliberate distributed work looks like", "h2"),
                t(
                    "The companies thriving in 2026 treat flexibility as an operating model to be designed, not a perk to be granted. Five practices separated the leaders from the strugglers in our data.",
                    "subtitle",
                ),
                bullets(
                    "Anchor days, not mandates — coordinate when teams overlap, don't police where they sit",
                    "Make the office a collaboration venue, then size and shape the space for that one job",
                    "Write decisions down by default so presence stops being a prerequisite for influence",
                    "Engineer mentorship explicitly — pair, sponsor, and review on a schedule, not by chance",
                    "Measure outcomes, never hours; retire any metric that rewards being seen",
                ),
                diagram("process", "Set anchors, Document, Pair & sponsor, Measure outcomes", 200),
            ),
            { background: bgImage("team-planning-whiteboard-session", 0.5) },
        ),
        section(
            "s12",
            group(
                t(
                    "The office is no longer the workplace; it is one tool among several for doing work together. The organizations that say this out loud — and redesign around it — are quietly building the most resilient, far-reaching, and loyal teams we have measured in six years of this study.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s13",
            split(
                60,
                group(
                    t("About the research", "label"),
                    t("Northwind Institute for Work", "h3"),
                    t(
                        "The Northwind Institute is an independent research body studying how work is changing. The State of Remote Work is its longest-running annual study, first published in 2021. This edition was authored by Dr. Lena Halvorsen and the Future of Work team, with fieldwork by Halden Research Partners. Full datasets and methodology notes are available at northwind.org/remote-2026.",
                        "body",
                    ),
                    t(
                        "© 2026 Northwind Institute for Work · Oslo & Toronto · CC BY-NC 4.0",
                        "caption",
                    ),
                    button("Download the full dataset"),
                ),
                img("research-institute-team-portrait", 0.82),
            ),
        ),
    ],
    bgImage("remote-work-report-bg", 0.3),
);

// A market analysis — the global EV charging infrastructure sector, top to bottom.
export const marketAnalysis: ArtifactContent = doc(
    "blue",
    [
        section(
            "s1",
            group(
                t("MARKET ANALYSIS · 2026 OUTLOOK", "label"),
                t("Charging the Transition", "h1"),
                t(
                    "The plug is the new pump. As electric vehicles cross from early adopters to the mainstream, the race to power them is becoming one of the decade's largest infrastructure build-outs — and one of its most contested markets.",
                    "subtitle",
                ),
                t("Meridian Research · Global EV Infrastructure Practice · June 2026", "caption"),
                badge("GLOBAL · PUBLIC + HOME CHARGING · 2026–2032 FORECAST"),
            ),
            { background: bgImage("ev-charging-station-night-blue-lights", 0.55) },
        ),
        section(
            "s2",
            group(
                t("The market at a glance", "label"),
                t("Three numbers that frame the sector", "h2"),
                t(
                    "Before the segments and the players, start here: how big the market is, how fast it's growing, and how much hardware is already in the ground.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s3",
            row(
                stat("$34.2B", "global EV charging market in 2025"),
                stat("23.6%", "projected CAGR through 2032"),
                stat("4.1M", "public charge points installed worldwide"),
            ),
        ),
        section(
            "s4",
            split(
                60,
                group(
                    t("Market size & growth", "label"),
                    t("A market compounding above 20% a year", "h2"),
                    t(
                        "The EV charging market has grown roughly fourfold since 2021 and shows no sign of slowing. Vehicle parc is the engine: every new EV on the road creates years of downstream demand for energy, hardware, and services. On our base case the market reaches $148B by 2032, with the steepest gains in DC fast charging and managed home charging.",
                        "body",
                    ),
                    stat("$148B", "projected market size by 2032, base case"),
                ),
                group(
                    chart("line", "9, 13, 19, 26, 34, 44, 56", 300),
                    t("Global market revenue, $B, 2021–2027E", "caption"),
                ),
            ),
        ),
        section(
            "s5",
            group(
                t("Segments", "label"),
                t("Where the dollars sit, and where they're moving", "h2"),
                t(
                    "The market splits along charging speed and location. Level 2 AC charging dominates by unit volume — it's what sits in homes and workplaces — but ultra-fast DC is capturing revenue share fastest as highway corridors and fleets electrify. Home charging, long an afterthought, is becoming a managed-energy business in its own right.",
                    "body",
                ),
                table(
                    "Segment,2025 revenue,Share,2025–2032 CAGR\nLevel 2 AC (home),$11.6B,34%,21%\nLevel 2 AC (public/work),$7.2B,21%,18%\nDC fast (50–150kW),$8.1B,24%,26%\nUltra-fast (>150kW),$5.5B,16%,31%\nFleet & depot,$1.8B,5%,29%",
                ),
                chart("bar", "11.6, 7.2, 8.1, 5.5, 1.8", 240),
                t("2025 revenue by segment, $B", "caption"),
            ),
        ),
        section(
            "s6",
            row(
                card(
                    img("ev-network-charging-hub-canopy", 1),
                    t("Voltline Networks", "h3"),
                    t(
                        "The volume leader in public Level 2, with ~190k connectors and a software platform others license.",
                        "caption",
                    ),
                ),
                card(
                    img("highway-fast-charging-corridor", 1),
                    t("AmpGrid", "h3"),
                    t(
                        "Pure-play ultra-fast operator betting on highway corridors and 350kW megawatt-ready sites.",
                        "caption",
                    ),
                ),
                card(
                    img("automaker-proprietary-charging-stalls", 1),
                    t("Hyperion (OEM)", "h3"),
                    t(
                        "An automaker's captive network now opening to other brands — distribution as a moat.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s7",
            split(
                40,
                img("ev-charging-operator-control-room", 1.05),
                group(
                    t("Competitive landscape", "label"),
                    t("Four ways players are trying to win", "h2"),
                    t(
                        "The field is crowded and consolidating at the same time. Differentiation is moving away from hardware — increasingly commoditized — and toward uptime, energy economics, and the driver experience.",
                        "body",
                    ),
                    bullets(
                        "Reliability — guaranteed uptime is becoming the headline SLA buyers pay for",
                        "Energy arbitrage — on-site batteries and smart load management protect margins",
                        "Network density — winning corridors and fleets before rivals plant hardware",
                        "Software & roaming — one app, one payment, every network is the experience play",
                    ),
                ),
            ),
        ),
        section(
            "s8",
            group(
                t("Trends", "label"),
                t("What's reshaping the next five years", "h2"),
                t(
                    "Five forces are pulling the market forward and changing what a charging site is. The endpoint isn't a parking lot full of plugs — it's a distributed energy asset that happens to charge cars.",
                    "subtitle",
                ),
                diagram(
                    "process",
                    "Plug-and-charge, Megawatt charging, Battery-buffered sites, V2G pilots, Charging-as-a-service",
                    200,
                ),
            ),
            { background: bgImage("solar-canopy-battery-charging-site", 0.5) },
        ),
        section(
            "s9",
            row(
                callout(
                    "success",
                    group(
                        t("Opportunities", "label"),
                        t("Where the upside concentrates", "h3"),
                        bullets(
                            "Fleet & depot electrification — sticky, high-utilization contracts",
                            "Reliability-as-a-product for networks battling a trust deficit",
                            "Software, payments, and roaming layers that ride on anyone's hardware",
                            "Behind-the-meter storage that turns volatile power prices into margin",
                        ),
                    ),
                ),
                callout(
                    "caution",
                    group(
                        t("Risks", "label"),
                        t("What could stall the curve", "h3"),
                        bullets(
                            "Utilization risk — too many stalls chasing too few sessions early",
                            "Grid interconnection delays of 12–24 months in key metros",
                            "Subsidy dependence as public incentives taper after 2027",
                            "Standards fragmentation slowing the seamless-roaming promise",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "s10",
            quote(
                "The winners won't be whoever pours the most concrete. They'll be whoever keeps the most plugs working, at the lowest cost of energy, with the fewest taps to pay.",
                "— Marcus Idowu, Partner, Meridian Research",
            ),
            { background: bgImage("ev-driver-charging-app-payment", 0.6) },
        ),
        section(
            "s11",
            split(
                60,
                group(
                    t("Outlook", "label"),
                    t("Our base case: $148B and a flight to quality", "h2"),
                    t(
                        "We expect the market to keep compounding above 20% through 2032, but the easy growth phase is ending. As utilization matures, capital will reward operators with reliable hardware, smart energy stacks, and real network density — and punish those who built for subsidies rather than sessions. Expect consolidation to accelerate from 2027 as the long tail of sub-scale networks is acquired or shut.",
                        "body",
                    ),
                    stat("23.6%", "base-case CAGR, 2025–2032"),
                ),
                img("ev-charging-future-cityscape-dusk", 0.9),
            ),
        ),
        section(
            "s12",
            group(
                t(
                    "Meridian Research is an independent technology and infrastructure research firm. This analysis draws on operator filings, our proprietary connector database, and 40 industry interviews. Full segment models and the bull/bear scenarios are available to subscribers at meridian.research/ev-2026.",
                    "caption",
                ),
            ),
        ),
    ],
    bgImage("ev-market-report-bg", 0.3),
);

// A quarterly business review — Tessera, a data-integration (iPaaS) company, reviewing Q2 FY2026
// for its board and executive staff. Candid, operational, decision-oriented.
export const qbr: ArtifactContent = doc("manuscript", [
    section(
        "q1",
        group(
            t("TESSERA · QUARTERLY BUSINESS REVIEW", "label"),
            t("Q2 FY2026 in Review", "h1"),
            t(
                "A strong quarter on revenue, a soft one on new logos, and a clear read on what to fix before Q3. The numbers, the wins, the misses — and the four decisions we need from this room.",
                "subtitle",
            ),
            t(
                "Prepared by the Tessera leadership team · For the Board & Executive Staff · June 2026",
                "caption",
            ),
            badge("ARR $48.6M · NRR 119% · 612 CUSTOMERS"),
        ),
        {
            background: bgImage(
                "tessera-leadership-team-glass-meeting-room-quarterly-review",
                0.58,
            ),
        },
    ),

    section(
        "q2",
        split(
            60,
            group(
                t("The quarter at a glance", "label"),
                t("We beat plan on revenue and missed it on reach.", "h2"),
                t(
                    "Q2 was our best revenue quarter ever and our slowest new-logo quarter in a year — at the same time. Existing customers expanded faster than we modeled, carrying net new ARR to 113% of plan. But the top of the funnel cooled: enterprise cycles stretched, the SDR class ramped slowly, and we closed 84 of the 95 new logos we forecast.",
                    "subtitle",
                ),
                t(
                    "The shape of the business is healthy. The shape of the pipeline is the risk. This review walks the scorecard top to bottom, names what slipped without flinching, and ends with four asks that determine whether Q3 holds the line on growth.",
                    "body",
                ),
            ),
            group(
                img("tessera-product-integration-dashboard-on-monitor", 0.82, 10),
                t(
                    "Tessera Flow shipped to general availability in May — the largest release of the quarter.",
                    "caption",
                ),
            ),
        ),
    ),

    section(
        "q3",
        row(
            stat("$5.1M", "net new ARR — 113% of plan"),
            stat("119%", "net revenue retention, up 4 pts QoQ"),
            stat("81%", "gross margin, holding above target"),
        ),
    ),

    section(
        "q4",
        group(
            t("Scorecard", "label"),
            t("KPIs vs. targets", "h2"),
            t(
                "Six metrics define the quarter. Four beat or held; two missed. The pattern is consistent — anything driven by our installed base outperformed, and anything driven by new acquisition came in light.",
                "body",
            ),
            table(
                "Metric,Target,Actual,Status\n" +
                    "Net new ARR,$4.5M,$5.1M,Beat\n" +
                    "Net revenue retention,115%,119%,Beat\n" +
                    "New logos,95,84,Miss\n" +
                    "Gross margin,80%,81%,On track\n" +
                    "CAC payback,14 mo,16 mo,Miss\n" +
                    "Net promoter score,45,52,Beat",
            ),
        ),
    ),

    section(
        "q5",
        split(
            60,
            group(
                t("Revenue & pipeline", "label"),
                t("ARR keeps compounding; coverage is thinning.", "h2"),
                t(
                    "ARR crossed $48.6M, our sixth straight quarter of double-digit sequential growth, driven almost entirely by expansion. The concern sits one layer down: qualified pipeline entering Q3 is 3.2x of target, below our 4.0x guardrail. We are not short on revenue today — we are short on the future quarters' worth of it.",
                    "body",
                ),
                stat("3.2x", "Q3 pipeline coverage vs. 4.0x guardrail"),
            ),
            group(
                chart("line", "30, 34, 38, 42, 45, 49", 300),
                t("Ending ARR by quarter, $M, Q1 FY25 – Q2 FY26", "caption"),
            ),
        ),
    ),

    section(
        "q6",
        split(
            40,
            group(
                img("tessera-customer-success-manager-on-video-call", 1.05, 10),
                t(
                    "Northwind Bank went live on Tessera in six weeks — a new record for a Tier 1 account.",
                    "caption",
                ),
            ),
            group(
                t("What went right", "label"),
                t("Four wins worth repeating", "h2"),
                bullets(
                    "Closed Northwind Bank at $1.2M ARR — our largest new logo ever, and a reference account in financial services.",
                    "Shipped Tessera Flow to GA; 38% of active customers adopted it within three weeks of launch.",
                    "Earned SOC 2 Type II, unblocking nine enterprise deals that had been gated on it.",
                    "Expanded Cobalt Health from two business units to seven, a $640K upsell closed a quarter early.",
                ),
            ),
        ),
    ),

    section(
        "q7",
        quote(
            "Our installed base is doing the work of a sales team we haven't hired yet. That's a gift and a warning.",
            "— Priya Nandakumar, Chief Revenue Officer",
        ),
        { background: bgImage("tessera-quiet-open-office-evening-warm-light", 0.6) },
    ),

    section(
        "q8",
        group(
            t("What slipped", "label"),
            t("Three things we missed — and why", "h2"),
            callout(
                "caution",
                group(
                    t("NEW-LOGO SHORTFALL", "label"),
                    t(
                        "We closed 84 of 95 forecast new logos. Two-thirds of the gap traces to enterprise deals slipping a quarter as security review queued behind our SOC 2 cycle; the rest to an SDR class that ramped roughly five weeks slower than the last. Neither is structural, but both are now in the Q3 plan as named risks.",
                        "body",
                    ),
                ),
            ),
            t(
                "Two more slips worth naming plainly: Reverse ETL, promised for May GA, moved to Q3 after a data-residency rework — it cost us at least two competitive evaluations. And CAC payback drifted to 16 months against a 14-month target, a direct consequence of spending into a funnel that converted slower than planned.",
                "body",
            ),
        ),
    ),

    section(
        "q9",
        split(
            60,
            group(
                t("Customer health", "label"),
                t("Retention is strong; a few whales need watching.", "h2"),
                t(
                    "Gross retention held at 94% and NPS climbed to 52, its highest reading since we began tracking it. Support CSAT sits at 4.6/5. The watch list is short but heavy: three accounts representing $2.1M of ARR are mid-renewal with new economic buyers, and all three are now under direct executive sponsorship.",
                    "body",
                ),
                quote(
                    "Tessera quietly became the system the rest of our stack reports into. We'd feel its absence in a day.",
                    "— Director of Data Platform, Cobalt Health",
                ),
            ),
            group(
                chart("line", "111, 113, 115, 117, 119", 260),
                t("Net revenue retention by quarter, %", "caption"),
            ),
        ),
    ),

    section(
        "q10",
        group(
            t("Looking ahead", "label"),
            t("Priorities for Q3", "h2"),
            t(
                "One quarter, five moves. Each maps directly to a gap above — the plan is to fix what slipped without slowing what's working.",
                "body",
            ),
            bullets(
                "Rebuild pipeline coverage to 4.0x by mid-quarter — protect outbound spend, accelerate the partner-sourced channel.",
                "Ship Reverse ETL to GA in week six; win back the two stalled evaluations it cost us.",
                "Fully ramp the new SDR class and stand up a dedicated enterprise security-review fast lane.",
                "Pull CAC payback back toward 14 months by reweighting spend to the segments that convert.",
                "Lock the three at-risk renewals early, ahead of their economic-buyer transitions.",
            ),
        ),
    ),

    section(
        "q11",
        card(
            t("The asks", "label"),
            t("Four decisions we need from this room", "h2"),
            bullets(
                "Approve six incremental enterprise AE hires, front-loaded into July to protect H2 capacity.",
                "Release the $400K field-marketing budget to refill top-of-funnel ahead of Q3.",
                "Sponsor the three strategic renewals at board level — intros where you have them.",
                "Sign off on the usage-based pricing change for the mid-market tier, effective August 1.",
            ),
            button("Approve the Q3 plan"),
        ),
    ),

    section(
        "q12",
        t(
            "The business is compounding from the inside out — the work now is to make sure the next twelve months of new customers are as healthy as this quarter's revenue. We have the team, the product, and the plan. We need the four yeses above to run it.",
            "subtitle",
        ),
        { background: bgImage("tessera-city-skyline-sunrise-office-window", 0.55) },
    ),
]);

// An industry trends report — the state of industrial robotics in 2026, published by an analyst
// practice. Cover, the landscape, five key trends, implications, predictions, and methodology.
export const trendsReport: ArtifactContent = doc("mocha", [
    section(
        "t1",
        group(
            t("INDUSTRY TRENDS REPORT · 2026", "label"),
            t("The Factory Wakes Up", "h1"),
            t(
                "For thirty years the industrial robot was a caged, single-purpose machine bolted to a floor. In 2026 it is becoming something else — cheaper, sighted, rentable, and increasingly able to share the room with people. This is the year automation stopped being a project and started being a default.",
                "subtitle",
            ),
            t("Continuum Research · Automation & Robotics Practice · June 2026", "caption"),
            badge("420 MANUFACTURERS SURVEYED · 11 SECTORS · 19 COUNTRIES"),
        ),
        { background: bgImage("industrial-robot-arms-automotive-assembly-line-sparks", 0.58) },
    ),

    section(
        "t2",
        split(
            60,
            group(
                t("The landscape today", "label"),
                t("Automation crossed from the margins to the mainstream.", "h2"),
                t(
                    "The story of industrial robotics used to be a story about cars — heavy arms welding chassis in a handful of giant plants. That era hasn't ended, but it has been overtaken. The fastest growth now comes from electronics, logistics, food, and metals, and from companies with under five hundred employees that could never have justified automation a decade ago.",
                    "subtitle",
                ),
                t(
                    "Three forces are converging: hardware costs are falling, perception software has gotten good enough to handle mess, and new financing models have erased the upfront capital wall. Together they are pulling robots out of the cage and into the kind of work that used to be considered too varied, too delicate, or too small-batch to automate.",
                    "body",
                ),
            ),
            group(
                img("collaborative-robot-cobot-working-beside-human-technician-factory", 0.82, 10),
                t(
                    "A cobot and a technician share a line at a contract electronics plant in Penang.",
                    "caption",
                ),
            ),
        ),
    ),

    section(
        "t3",
        row(
            stat("4.3M", "industrial robots operating worldwide"),
            stat("+12%", "annual installations, 2025 vs. 2024"),
            stat("$16.5B", "projected cobot market by 2030"),
        ),
    ),

    section(
        "t4",
        split(
            60,
            group(
                t("Trend 01", "label"),
                t("Collaborative robots go mainstream", "h2"),
                t(
                    "Cobots — robots designed to work safely alongside people without a cage — have moved from novelty to backbone. They install in days rather than months, cost a fraction of traditional cells, and don't require a safety guard or a dedicated operator. In 2020 they were one in twelve new installations; on our forecast they cross one in three by 2027.",
                    "body",
                ),
                t(
                    "What changed is not the robots so much as the buyers. The marginal new customer in 2026 is a mid-sized job shop automating a single repetitive station — palletizing, machine tending, quality inspection — and expecting payback inside a year. Cobots are the only category that meets that bar.",
                    "body",
                ),
            ),
            group(
                chart("line", "9, 12, 16, 21, 27, 33", 300),
                t("Cobots as a share of new robot installations, %, 2022–2027E", "caption"),
            ),
        ),
    ),

    section(
        "t5",
        split(
            40,
            group(
                img("robot-arm-machine-vision-camera-bin-picking-parts", 1.05, 10),
                t(
                    "Vision-guided bin picking — the task that AI perception finally solved.",
                    "caption",
                ),
            ),
            group(
                t("Trend 02", "label"),
                t("Perception gets a brain", "h2"),
                t(
                    "The hardest problem in automation was never motion — it was sight. A robot that can only repeat a memorized path is useless the moment a part arrives at the wrong angle. AI-driven vision changed that. Modern perception stacks identify, orient, and grasp jumbled parts from a bin in real time, a task that defeated automation for thirty years.",
                    "body",
                ),
                stat("10x", "improvement in vision-guided bin-picking success since 2021"),
                t(
                    "The downstream effect is larger than the feature itself: once a robot can handle variability, the universe of automatable tasks expands dramatically, and the line between fixed automation and flexible labor begins to blur.",
                    "body",
                ),
            ),
        ),
    ),

    section(
        "t6",
        split(
            60,
            group(
                t("Trend 03", "label"),
                t("Robots without the capital expense", "h2"),
                t(
                    "Robotics-as-a-Service is doing to automation what cloud did to servers. Instead of a six-figure purchase and a multi-year depreciation schedule, manufacturers rent capacity by the month — hardware, software, maintenance, and uptime guarantees bundled into a single operating-expense line. RaaS contracts signed grew more than tenfold in three years.",
                    "body",
                ),
                t(
                    "The model matters most for exactly the buyers who were previously locked out: smaller manufacturers without capital budgets or in-house robotics teams. It converts a daunting one-time bet into a cancelable subscription, and in doing so widens the market far faster than falling hardware prices alone could.",
                    "body",
                ),
            ),
            group(
                chart("bar", "120, 340, 610, 980, 1520", 300),
                t("RaaS contracts signed per year, 2021–2025", "caption"),
            ),
        ),
    ),

    section(
        "t7",
        group(
            t("Trend 04", "label"),
            t("The labor equation flips", "h2"),
            stat("1.9M", "U.S. manufacturing jobs projected to go unfilled by 2030"),
            t(
                "For most of the last century automation was framed as a substitute for available labor. In 2026 it is increasingly a response to labor that simply isn't there. An aging workforce, tighter immigration, and a reshoring wave have left factories structurally short-staffed — and robots are filling the dull, dirty, and dangerous roles people no longer take. The political conversation about jobs is, on the factory floor, quietly inverting.",
                "subtitle",
            ),
        ),
        { background: bgImage("empty-modern-factory-floor-automation-robots-night-shift", 0.62) },
    ),

    section(
        "t8",
        split(
            60,
            group(
                t("Trend 05", "label"),
                t("Humanoids cross from demo to pilot", "h2"),
                t(
                    "The most hyped category is also the least proven — but in 2026 it stopped being only a hype. General-purpose humanoid robots moved from staged demos to paid pilots inside real warehouses and plants, with announced deployments climbing from a handful in 2022 to roughly ninety this year. None are at scale, and the unit economics remain unproven.",
                    "body",
                ),
                t(
                    "Our read is to treat humanoids as a five-year bet, not a 2026 purchase. The near-term value is narrow — moving totes, tending machines, simple loading — and the durability and cost questions are real. But the trajectory is steep enough that no operations leader should let the category go un-watched.",
                    "body",
                ),
            ),
            group(
                chart("line", "3, 7, 18, 44, 90", 260),
                t("Announced humanoid robot pilots, cumulative, 2022–2026", "caption"),
            ),
        ),
    ),

    section(
        "t9",
        quote(
            "The question on the floor is no longer whether to automate a task. It's which financing model and how soon — and that shift is the whole story of 2026.",
            "— Lead Analyst, Continuum Automation Practice",
        ),
        { background: bgImage("warehouse-logistics-robots-conveyor-blue-light", 0.6) },
    ),

    section(
        "t10",
        card(
            t("What it means for you", "label"),
            t("Reading the trends as an operator", "h2"),
            callout(
                "tip",
                group(
                    t("THE PRACTICAL TAKEAWAY", "label"),
                    t(
                        "If you run operations, the cost of waiting just went up. The combination of cheap cobots, working perception, and rentable capacity means the first automatable station in your plant probably pays back inside a year — and your competitors are doing the math too.",
                        "body",
                    ),
                ),
            ),
            bullets(
                "Start with one station, not a line. Pick a repetitive, single-task bottleneck and prove payback before scaling.",
                "Pilot via RaaS to sidestep the capital case and learn before you commit hardware.",
                "Insist on vision-guided flexibility — fixed automation ages badly as product mix changes.",
                "Watch humanoids, but don't buy yet; budget attention this year, capital in two to three.",
            ),
        ),
    ),

    section(
        "t11",
        group(
            t("The outlook", "label"),
            t("Five predictions for the next five years", "h2"),
            t(
                "Where the curves above point, with our confidence stated plainly. We will grade ourselves against these in next year's edition.",
                "body",
            ),
            table(
                "Prediction,Timeframe,Confidence\n" +
                    "Cobots exceed 40% of new installations,By 2028,High\n" +
                    "Vision-guided picking becomes standard on new cells,By 2027,High\n" +
                    "RaaS becomes the default for SMB automation,By 2029,Medium\n" +
                    "Robot density doubles in reshored U.S. plants,By 2031,Medium\n" +
                    "First single-site 10,000-unit humanoid fleet deployed,By 2031,Low",
            ),
        ),
    ),

    section(
        "t12",
        group(
            divider(),
            t("Methodology", "label"),
            t(
                "This report draws on a survey of 420 manufacturing operations leaders across eleven sectors and nineteen countries, fielded in March–April 2026, supplemented by global robot shipment data, RaaS-provider contract figures, and forty in-depth interviews with plant managers and automation integrators. Forecasts represent our base case; ranges and full segment data are available in the data appendix.",
                "body",
            ),
            button("Request the full data appendix"),
            t(
                "Continuum Research · Automation & Robotics Practice · Lead analyst: Dr. Elena Vasquez · © 2026",
                "caption",
            ),
        ),
    ),
]);
