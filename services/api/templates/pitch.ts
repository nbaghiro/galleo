import type { ArtifactContent } from "@model/content";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    cell,
    chart,
    deck,
    diagram,
    empty,
    group,
    img,
    quote,
    section,
    stat,
    t,
    table,
} from "@model/authoring";

// Seed-stage startup pitch deck — Mise, an operating system for the restaurant back of house.
export const startupPitch: ArtifactContent = deck(
    "noir",
    [
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("MISE · SEED ROUND 2026", "label"),
                        t("Run the kitchen, not the spreadsheet.", "h1"),
                        t(
                            "Mise turns every restaurant's POS, invoices, and suppliers into one live system — forecasting prep, automating orders, and clawing back the margin that waste quietly eats.",
                            "subtitle",
                        ),
                        badge("$4M SEED · LED BY ANDISON CAPITAL"),
                    ),
                ),
            },
            { background: bgImage("mise-kitchen-cover", 0.55) },
        ),
        section("s2", "split-6040", {
            a: cell(
                group(
                    t("01 — The problem", "label"),
                    t("Restaurants run on 4% margins and 1990s tooling.", "h2"),
                    t(
                        "The average independent restaurant throws away 8% of everything it buys, orders by gut feel at 11pm, and learns it lost money a month too late. The back of house is the last part of the business still run on clipboards and group texts.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("mise-walkin-cooler", 0.82)),
        }),
        section(
            "s3",
            "full",
            {
                a: cell(
                    quote(
                        "Front of house got Toast, Square, and Resy. The kitchen — where the money is actually made or lost — got nothing.",
                        "— the Mise thesis",
                    ),
                ),
            },
            { background: bgImage("mise-chef-pass", 0.6) },
        ),
        section("s4", "split-4060", {
            a: cell(img("mise-supplier-truck", 1.1)),
            b: cell(
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
        }),
        section("s5", "split-4060", {
            a: cell(img("mise-app-prep-list", 1.1)),
            b: cell(
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
        }),
        section("s6", "three-up", {
            a: cell(stat("$1.1T", "U.S. restaurant industry")),
            b: cell(stat("749K", "U.S. restaurant locations")),
            c: cell(stat("$162B", "food wasted by U.S. restaurants / yr")),
        }),
        section("s7", "full", {
            a: cell(
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
        }),
        section("s8", "split-6040", {
            a: cell(
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
            ),
            b: cell(chart("line", "6, 11, 17, 24, 31, 38", 240)),
        }),
        section("s9", "three-up", {
            a: cell(stat("38", "kitchens live")),
            b: cell(stat("310bps", "avg food-cost reduction")),
            c: cell(stat("94%", "weekly active kitchens")),
        }),
        section("s10", "full", {
            a: cell(
                group(
                    t("06 — Business model", "label"),
                    t("Per-location SaaS, priced under the waste it kills.", "h2"),
                    table(
                        "Plan,Per location / mo,Built for\nLine,$249,Single independents\nKitchen,$399,Full-service & multi-station\nGroup,$329,Multi-unit groups (5+)\nEnterprise,Custom,Chains & franchisors",
                    ),
                ),
            ),
        }),
        section("s11", "split-6040", {
            a: cell(
                group(
                    t("07 — Why we win", "label"),
                    t("Spreadsheets, distributor portals, and point tools.", "h2"),
                    bullets(
                        "Distributor portals (Sysco, US Foods) want you to buy more, not waste less",
                        "Inventory apps count what's already gone; Mise predicts what's next",
                        "We're POS-agnostic — the data layer for the kitchen, not another silo",
                    ),
                ),
            ),
            b: cell(img("mise-competition-grid", 0.86)),
        }),
        section("s12", "three-up", {
            a: cell(
                group(
                    img("mise-founder-dana", 1),
                    t("Dana Reyes", "h3"),
                    t("CEO · ex-Toast, ran ops for 40 kitchens", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("mise-founder-marcus", 1),
                    t("Marcus Vallée", "h3"),
                    t("CTO · ex-Flexport forecasting", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("mise-founder-priya", 1),
                    t("Priya Anand", "h3"),
                    t("Head of Culinary · 12 years on the line", "caption"),
                ),
            ),
        }),
        section(
            "s13",
            "split-4060",
            {
                a: empty,
                b: cell(
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
            },
            { background: bgImage("mise-kitchen-night", 0.6) },
        ),
    ],
    bgImage("mise-cover-ambient", 0.35),
);

// B2B sales deck — Fleetwise, predictive maintenance for commercial truck fleets.
export const salesDeck: ArtifactContent = deck(
    "cobalt",
    [
        section(
            "f1",
            "full",
            {
                a: cell(
                    group(
                        t("FLEETWISE · FOR OPERATIONS & MAINTENANCE LEADERS", "label"),
                        t("Your trucks make money moving, not in the shop.", "h1"),
                        t(
                            "Fleetwise reads the telematics you already pay for and turns it into maintenance you do before the breakdown — cutting unplanned downtime, roadside failures, and the overtime that follows.",
                            "subtitle",
                        ),
                        badge("TRUSTED BY 140+ FLEETS"),
                    ),
                ),
            },
            { background: bgImage("fleetwise-depot-dawn", 0.55) },
        ),
        section("f2", "split-6040", {
            a: cell(
                group(
                    t("The problem", "label"),
                    t("Every breakdown is a fire you find out about by phone.", "h2"),
                    t(
                        "Maintenance is still scheduled by odometer and gut. A water pump telematics flagged three weeks ago strands a driver on I-80 at 2am — now it's a tow, a missed delivery, a hotel, and a tech on overtime. The signal to prevent it was already in the truck.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("fleetwise-roadside-breakdown", 0.82)),
        }),
        section("f3", "three-up", {
            a: cell(stat("$760", "avg cost per truck, per day down")),
            b: cell(stat("23%", "of road calls were preventable")),
            c: cell(stat("4.3 days", "avg unplanned repair turnaround")),
        }),
        section("f4", "split-4060", {
            a: cell(img("fleetwise-dashboard", 1.1)),
            b: cell(
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
        }),
        section("f5", "full", {
            a: cell(
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
        }),
        section("f6", "split-6040", {
            a: cell(
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
            ),
            b: cell(chart("line", "18, 16, 14, 11, 9, 8, 8", 240)),
        }),
        section("f7", "three-up", {
            a: cell(stat("52%", "fewer roadside failures")),
            b: cell(stat("78%", "of work now planned")),
            c: cell(stat("11×", "first-year ROI")),
        }),
        section(
            "f8",
            "full",
            {
                a: cell(
                    quote(
                        "We used to staff for breakdowns. Now we staff for the schedule Fleetwise hands us the night before.",
                        "— Carla Mendez, VP Maintenance, Meridian Freight",
                    ),
                ),
            },
            { background: bgImage("fleetwise-shop-bay", 0.6) },
        ),
        section("f9", "full", {
            a: cell(
                group(
                    t("Pricing", "label"),
                    t("Priced per truck, under one day of downtime.", "h2"),
                    table(
                        "Plan,Per truck / mo,Includes\nCore,$29,Health scores & failure alerts\nShop,$39,+ Auto work orders & parts\nFleet,$34,Multi-depot, 100+ trucks\nEnterprise,Custom,Telematics integrations & SLA",
                    ),
                ),
            ),
        }),
        section("f10", "split-6040", {
            a: cell(
                group(
                    t("Why now", "label"),
                    t("Margins are thin and parts lead times aren't shrinking.", "h2"),
                    t(
                        "Freight rates are soft, labor is tight, and a backordered part can ground a truck for a week. The fleets pulling ahead stopped reacting — predictive maintenance is now table stakes, and your telematics already carries the signal.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("fleetwise-parts-warehouse", 0.86)),
        }),
        section(
            "f11",
            "split-4060",
            {
                a: empty,
                b: cell(
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
            },
            { background: bgImage("fleetwise-fleet-lineup", 0.55) },
        ),
    ],
    bgImage("fleetwise-cover-ambient", 0.35),
);
