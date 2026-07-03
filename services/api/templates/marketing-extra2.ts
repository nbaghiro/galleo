import type { ArtifactContent } from "@model/content";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    cell,
    diagram,
    divider,
    doc,
    group,
    img,
    quote,
    section,
    stat,
    t,
    web,
} from "@model/authoring";

// A creative agency / studio website for a believable brand-and-digital studio.
export const agencySite: ArtifactContent = web(
    "carbon",
    [
        // 1 — Hero (bgImage cover): studio name + tagline + CTA
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("Counterform · Brand & digital studio", "label"),
                        badge("EST. 2015 · LISBON & NEW YORK"),
                        t("We design brands that know how to behave.", "h1"),
                        t(
                            "A small studio for ambitious companies. We build identities, products, and the systems that hold them together — so the work still looks like itself on the fortieth screen, not just the first.",
                            "subtitle",
                        ),
                        button("Start a project"),
                    ),
                ),
            },
            { background: bgImage("counterform-studio-wall-pinups-mono", 0.58) },
        ),
        // 2 — What we do (services, three-up cards)
        section("s2", "three-up", {
            a: cell(
                card(
                    img("counterform-service-brand-identity", 1.6),
                    t("Brand", "h3"),
                    t(
                        "Naming, identity, voice, and the guidelines that keep it all honest as you grow.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    img("counterform-service-digital-product", 1.6),
                    t("Digital", "h3"),
                    t(
                        "Websites and product interfaces — designed and built, from the first sketch to shipped code.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    img("counterform-service-design-system", 1.6),
                    t("Systems", "h3"),
                    t(
                        "Design systems, motion, and the components that let your team move fast without us in the room.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 3 — Selected work, intro
        section("s3", "full", {
            a: cell(
                group(
                    t("Selected work", "label"),
                    t("A few things we’re proud of.", "h2"),
                    t(
                        "Eleven years, a hundred-odd launches, and a stubborn belief that the details are the work. A small selection below — the rest lives in the deck we’ll send once we’ve talked.",
                        "body",
                    ),
                ),
            ),
        }),
        // 4 — Selected work, grid one (three-up image cards)
        section("s4", "three-up", {
            a: cell(
                card(
                    img("counterform-work-meridian-bank-brand", 1.4),
                    t("Meridian", "h3"),
                    t("Brand & app for a challenger bank · 2025", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("counterform-work-orchard-grocery-identity", 1.4),
                    t("Orchard", "h3"),
                    t("Identity & packaging for a grocery startup · 2024", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("counterform-work-atlas-analytics-product", 1.4),
                    t("Atlas", "h3"),
                    t("Product design for an analytics platform · 2024", "caption"),
                ),
            ),
        }),
        // 5 — Selected work, grid two (two-col large image cards)
        section("s5", "two-col", {
            a: cell(
                card(
                    img("counterform-work-novel-press-rebrand", 1.6),
                    t("Novel Press", "h3"),
                    t("Full rebrand & site for an independent publisher · 2023", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("counterform-work-tidal-energy-campaign", 1.6),
                    t("Tidal", "h3"),
                    t("Campaign & motion system for a clean-energy launch · 2023", "caption"),
                ),
            ),
        }),
        // 6 — Our approach (process diagram + callout)
        section("s6", "full", {
            a: cell(
                group(
                    t("Our approach", "label"),
                    t("Four phases, no surprises.", "h2"),
                    t(
                        "Every engagement runs the same clear arc, whether it’s a six-week sprint or a year-long build. You always know what we’re working on, why it matters, and what lands next.",
                        "body",
                    ),
                    diagram("process", "Discover, Define, Design, Build"),
                    callout(
                        "note",
                        t(
                            "Most projects run 8–14 weeks. We take on six clients a year, on purpose — so yours is never the one we’re squeezing in.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        // 7 — Clients / logos (caption list)
        section("s7", "full", {
            a: cell(
                group(
                    t("Clients", "label"),
                    t("In good company.", "h2"),
                    t(
                        "Meridian · Orchard · Atlas · Novel Press · Tidal · Halcyon · Cedarworks · Field Day · Northwind · Bright Coast · Mara Health · Postscript",
                        "subtitle",
                    ),
                    t(
                        "From two-person seed startups to public companies rebuilding from the logo out — the constant is people who care how the thing actually works.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 8 — By the numbers (stats on a feature background)
        section(
            "s8",
            "three-up",
            {
                a: cell(stat("120+", "brands and products shipped")),
                b: cell(stat("11 yrs", "designing in the open")),
                c: cell(stat("6", "clients a year, on purpose")),
            },
            { background: bgImage("counterform-studio-shelves-archive", 0.55) },
        ),
        // 9 — A client quote (bgImage)
        section(
            "s9",
            "full",
            {
                a: cell(
                    quote(
                        "Counterform didn’t hand us a logo and leave. They gave us a way of making decisions — a year on, we still design like they’re in the room.",
                        "Dana Okoro · VP Brand, Meridian",
                    ),
                ),
            },
            { background: bgImage("counterform-meeting-table-warm-light", 0.6) },
        ),
        // 10 — The team (three-up image cards)
        section("s10", "three-up", {
            a: cell(
                card(
                    img("counterform-team-sofia-marques", 1),
                    t("Sofia Marques", "h3"),
                    t("Founder & Creative Director", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("counterform-team-ravi-anand", 1),
                    t("Ravi Anand", "h3"),
                    t("Design Director", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("counterform-team-june-park", 1),
                    t("June Park", "h3"),
                    t("Engineering Lead", "caption"),
                ),
            ),
        }),
        // 11 — Start a project (bgImage CTA)
        section(
            "s11",
            "full",
            {
                a: cell(
                    group(
                        t("Start a project", "label"),
                        t("Tell us what you’re building.", "h2"),
                        t(
                            "A brand from scratch, a product that’s outgrown its first look, or a system to hold a fast-growing team together — whatever it is, we’d love to hear about it. We reply to every note within two days.",
                            "subtitle",
                        ),
                        button("Start a project"),
                    ),
                ),
            },
            { background: bgImage("counterform-studio-window-morning-light", 0.55) },
        ),
        // 12 — Footer columns
        section("s12", "three-up", {
            a: cell(
                group(
                    t("Counterform", "h3"),
                    t("Brand & digital studio. Lisbon & New York.", "caption"),
                    t("hello@counterform.studio", "caption"),
                ),
            ),
            b: cell(
                group(
                    t("STUDIO", "label"),
                    bullets("Work", "Services", "About", "Journal", "Careers"),
                ),
            ),
            c: cell(
                group(
                    t("ELSEWHERE", "label"),
                    bullets("Instagram", "Dribbble", "LinkedIn", "Read.cv", "Newsletter"),
                ),
            ),
        }),
    ],
    bgImage("counterform-paper-texture-mono-bg", 0.3),
);

// A polished newsletter issue for a believable fortnightly publication on cities & design.
export const newsletter: ArtifactContent = doc(
    "studio",
    [
        // 1 — Masthead (bgImage cover): title + issue # + date + byline
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("Common Ground · Issue No. 58", "label"),
                        t("Common Ground", "h1"),
                        t(
                            "A fortnightly letter on cities, design, and the small things that make a place feel like home.",
                            "subtitle",
                        ),
                        t("Saturday, June 27, 2026 · edited by Lena Hartmann", "caption"),
                    ),
                ),
            },
            { background: bgImage("commonground-city-square-morning-light", 0.55) },
        ),
        // 2 — Editor's note (lede)
        section("s2", "full", {
            a: cell(
                group(
                    t("From the editor", "label"),
                    t("Good morning from the square.", "h2"),
                    t(
                        "This issue nearly missed its deadline, because the street outside my window has been closed to cars for three weeks and I keep going down to sit in it. That’s the whole newsletter, really — the strange, immediate joy of a place suddenly built for people instead of through-traffic.",
                        "subtitle",
                    ),
                    t(
                        "So this fortnight: a street that closed for the summer, a bench worth the detour, the economics of a well-lit evening, and a postcard from Ghent. As always, hit reply — the best half of this letter is the part you write back.",
                        "body",
                    ),
                ),
            ),
        }),
        // 3 — The lead story (heading + body + image)
        section("s3", "split-6040", {
            a: cell(
                group(
                    t("The lead", "label"),
                    t("The street that closed for the summer.", "h2"),
                    t(
                        "In May the city did something quietly radical: it closed Rua das Flores to cars, put down forty planters and a few hundred chairs, and waited to see what would happen. What happened is that the street filled up — not with programming or events, just people doing the ordinary things people do when there’s finally room for them. Children drew on the cobbles. The café tripled its tables. An old man brought a folding chair and a newspaper and held court by the fountain every morning at nine.",
                        "body",
                    ),
                    t(
                        "The merchants, who fought it, now want it made permanent. Foot traffic is up, the bakery sold out by noon three Saturdays running, and the hardware store — the one everyone was sure would suffer — reports its best quarter in a decade. It turns out a street you want to linger on is a street you also want to shop on.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    img("commonground-pedestrian-street-chairs", 0.78, 6),
                    t(
                        "Rua das Flores, three weeks after the cars left. The chairs were the city’s only intervention.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 4 — Shorter item (image + heading + paragraph)
        section("s4", "split-4060", {
            a: cell(
                group(
                    img("commonground-public-bench-waterfront", 1.05, 6),
                    t(
                        "The new benches on the waterfront — backs, armrests, and shade, which is more than most cities manage.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("A bench worth sitting on.", "h3"),
                    t(
                        "It sounds like nothing, but most public benches are designed to be looked at, not used — backless, armrest-less, deliberately uncomfortable so no one stays too long. The new ones along the harbour do the radical thing of being comfortable: a real back to lean on, armrests to push up from, and a tree planted to throw shade by August. The test of a city isn’t its monuments. It’s whether an eighty-year-old can find somewhere to rest between the bus and the front door.",
                        "body",
                    ),
                ),
            ),
        }),
        // 5 — Shorter item (heading + paragraph)
        section("s5", "full", {
            a: cell(
                group(
                    t("The 8 p.m. economy.", "h3"),
                    t(
                        "A surprising line in this month’s council report: streets with warm, human-scale lighting see thirty percent more evening foot traffic than those lit by the usual orange floodlights — and, counter-intuitively, less crime. Light that makes a place feel watched-over rather than interrogated turns out to be the cheapest urban safety measure we have. The city is swapping two thousand fixtures this autumn. Watch the corners that used to empty at dusk.",
                        "body",
                    ),
                ),
            ),
        }),
        // 6 — Shorter item (heading + paragraph + image)
        section("s6", "split-6040", {
            a: cell(
                group(
                    t("Field notes from Ghent.", "h3"),
                    t(
                        "I spent last weekend in Ghent, which famously banned through-traffic from its medieval centre back in 2017 and has spent the years since being smug about it — deservedly. What strikes you isn’t the absence of cars; it’s the presence of everything else. Deliveries happen by cargo bike before ten. Children ride to school alone. The air, measurably, is cleaner. It isn’t a museum either — it’s loud and ordinary and full of teenagers. The lesson Ghent keeps trying to teach the rest of us: you don’t lose a city by slowing it down. You finally get to keep it.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                group(
                    img("commonground-ghent-cargo-bike-delivery", 0.78, 6),
                    t(
                        "Morning deliveries in central Ghent. The cargo bike has quietly replaced the delivery van.",
                        "caption",
                    ),
                ),
            ),
        }),
        // 7 — A pull quote
        section("s7", "full", {
            a: cell(
                quote("A street you want to linger on is a street you also want to shop on.", ""),
            ),
        }),
        // 8 — Shorter item (reader mailbag)
        section("s8", "full", {
            a: cell(
                group(
                    t("From the mailbag", "label"),
                    t("“Doesn’t pedestrianizing just push the traffic somewhere else?”", "h3"),
                    t(
                        "It’s the first question every time, and the honest answer is: less than you’d think. The phenomenon is called traffic evaporation — when you remove road capacity, a measurable share of trips simply stop happening. People combine errands, walk the short ones, or shift the discretionary ones off the peak. Study after study finds that roughly a fifth of the displaced traffic just disappears. Cars, it turns out, are not water. They don’t have to go somewhere.",
                        "body",
                    ),
                ),
            ),
        }),
        // 9 — By the numbers (stat block)
        section("s9", "three-up", {
            a: cell(stat("21%", "of displaced car trips that simply evaporate")),
            b: cell(stat("+38%", "weekend foot traffic on Rua das Flores")),
            c: cell(stat("2,000", "streetlights the city swaps out this autumn")),
        }),
        // 10 — Recommended links (bullets)
        section("s10", "full", {
            a: cell(
                group(
                    t("Worth your time", "label"),
                    t("Five things I saved this fortnight.", "h2"),
                    bullets(
                        "“The Death and Life of Great American Streets” — a long, generous reappraisal of Jane Jacobs at sixty.",
                        "A photo essay on Tokyo’s pocket parks, the smallest of which is the size of a single parking space.",
                        "The council’s own before-and-after data on Rua das Flores (a PDF, but worth the download).",
                        "A short film on Pontevedra, the Spanish town that banned cars and forgot what a traffic jam feels like.",
                        "My friend Cira’s newsletter on trees in cities, which is better than this one and you should read it too.",
                    ),
                ),
            ),
        }),
        // 11 — Sign-off
        section("s11", "full", {
            a: cell(
                group(
                    divider(),
                    t(
                        "That’s the fortnight. I’ll be in the square if you need me — third chair from the fountain, the one with the newspaper. See you in two weeks. — Lena",
                        "subtitle",
                    ),
                ),
            ),
        }),
        // 12 — Colophon
        section("s12", "full", {
            a: cell(
                group(
                    divider(),
                    t(
                        "Common Ground is written every other Saturday by Lena Hartmann, a writer and former city planner in Lisbon. Forwarded this? Subscribe at commonground.letter. Reply to anything — it all reaches me.",
                        "caption",
                    ),
                ),
            ),
        }),
    ],
    bgImage("commonground-paper-grain-bg", 0.26),
);
