// The creative template set (all variants — un-sharded from the size-split -extra/-extra2 files).

import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    cell,
    doc,
    group,
    img,
    quote,
    section,
    stat,
    t,
    web,
    divider,
    table,
} from "@model/authoring";

export const resume: ArtifactContent = doc(
    "manuscript",
    [
        section("r1", "split-6040", {
            a: cell(
                group(
                    t("PRODUCT DESIGNER", "label"),
                    t("Elena Maris Vance", "h1"),
                    t(
                        "Senior product designer shaping calm, durable software for teams that move fast.",
                        "subtitle",
                    ),
                    t(
                        "San Francisco, CA · elena@vance.design · vance.design · in/elenavance",
                        "caption",
                    ),
                ),
            ),
            b: cell(img("elena-vance-portrait", 0.82, 200)),
        }),
        section("r2", "full", {
            a: cell(
                group(
                    t("Summary", "label"),
                    t(
                        "I design end-to-end product experiences — from the first scrappy prototype to the pixels that ship — for tools people open every day. Nine years across fintech, developer platforms, and consumer health, most recently leading design for a payments product used by 40,000+ small businesses. I care about systems that scale, interfaces that disappear, and shipping work that actually makes it to production.",
                        "subtitle",
                    ),
                ),
            ),
        }),
        section("r3", "three-up", {
            a: cell(stat("9 yrs", "designing shipping product")),
            b: cell(stat("40k+", "businesses on my last product")),
            c: cell(stat("$12M", "ARR influenced by 2024 redesign")),
        }),
        section("r4", "split-4060", {
            a: cell(
                group(
                    t("Northwind", "h3"),
                    t("Lead Product Designer", "caption"),
                    t("2022 — Present · San Francisco", "caption"),
                ),
            ),
            b: cell(
                bullets(
                    "Led the end-to-end redesign of the merchant payments dashboard, lifting weekly active use 34% and cutting time-to-first-invoice from 11 minutes to under 3.",
                    "Built and now maintain Aster, the company's first cross-platform design system — 80+ components adopted by four product teams.",
                    "Mentor two designers and run the weekly critique that the whole product org now attends.",
                ),
            ),
        }),
        section("r5", "split-4060", {
            a: cell(
                group(
                    t("Cadence Health", "h3"),
                    t("Senior Product Designer", "caption"),
                    t("2019 — 2022 · Remote", "caption"),
                ),
            ),
            b: cell(
                bullets(
                    "Designed the onboarding and daily-tracking flows for a chronic-care app that grew from 5k to 220k monthly users.",
                    "Ran a 6-week research sprint with 40 patients that reframed the entire care-plan model the team had been building.",
                    "Shipped an accessibility overhaul that took the app from WCAG A to AA across every core flow.",
                ),
            ),
        }),
        section("r6", "split-4060", {
            a: cell(
                group(
                    t("Foglight Studio", "h3"),
                    t("Product Designer", "caption"),
                    t("2017 — 2019 · Portland", "caption"),
                ),
            ),
            b: cell(
                bullets(
                    "Sole designer on client products for early-stage startups — brand, web, and product across a dozen launches.",
                    "Established the studio's first reusable Figma libraries, cutting average project setup from days to hours.",
                ),
            ),
        }),
        section("r7", "three-up", {
            a: cell(
                card(
                    t("Craft", "label"),
                    bullets(
                        "Interaction & visual design",
                        "Prototyping (Figma, code)",
                        "Design systems",
                        "Motion & micro-interaction",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Method", "label"),
                    bullets(
                        "Generative & evaluative research",
                        "Service blueprinting",
                        "Workshop facilitation",
                        "Design ops",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Tools", "label"),
                    bullets(
                        "Figma, Framer, Origami",
                        "HTML / CSS / React",
                        "Storybook, Linear",
                        "After Effects",
                    ),
                ),
            ),
        }),
        section("r8", "split-6040", {
            a: cell(
                group(
                    t("Selected projects", "label"),
                    t("Aster Design System", "h3"),
                    t(
                        "A single source of truth for four product teams — tokens, components, and usage guidelines that turned a fractured UI into one coherent voice. Documented, versioned, and adopted across web and mobile.",
                        "body",
                    ),
                    t(
                        "Merchant Dashboard 2.0 · Cadence Care Plans · Foglight client launches",
                        "caption",
                    ),
                ),
            ),
            b: cell(img("aster-design-system-screens", 0.82, 12)),
        }),
        section("r9", "two-col", {
            a: cell(
                group(
                    t("Education", "label"),
                    t("Rhode Island School of Design", "h3"),
                    t("BFA, Graphic Design · 2013 — 2017", "caption"),
                    t("Senior thesis on type systems for data-dense interfaces.", "caption"),
                ),
            ),
            b: cell(
                group(
                    t("Recognition", "label"),
                    bullets(
                        "Core77 Design Award, Interaction — 2023",
                        'Speaker, Config 2022: "Design systems that survive reorgs"',
                        "Awwwards Honorable Mention — 2019",
                    ),
                ),
            ),
        }),
        section("r10", "full", {
            a: cell(
                callout(
                    "note",
                    group(
                        t("What I value", "label"),
                        t(
                            "The best design work is quiet. I'd rather ship one flow that genuinely respects a person's time than ten features that demo well. I show up for the unglamorous middle — the edge cases, the empty states, the error copy — because that's where products earn trust. Always learning in public, always shipping.",
                            "body",
                        ),
                    ),
                ),
            ),
        }),
        section("r11", "full", {
            a: cell(
                group(
                    t(
                        "Open to senior and lead product design roles, full-time or fractional.",
                        "subtitle",
                    ),
                    t("elena@vance.design · vance.design · in/elenavance", "caption"),
                ),
            ),
        }),
    ],
    bgImage("manuscript-paper-bg", 0.2),
);

export const portfolio: ArtifactContent = web(
    "couture",
    [
        section(
            "p1",
            "full",
            {
                a: cell(
                    group(
                        t("STUDIO HALVORSEN", "label"),
                        t("Light, made deliberate.", "h1"),
                        t(
                            "An independent design studio working at the edge of architecture, brand, and the objects in between — for people who believe a space should be felt before it's understood.",
                            "subtitle",
                        ),
                    ),
                ),
            },
            { background: bgImage("halvorsen-hero-architecture", 0.55) },
        ),
        section("p2", "split-4060", {
            a: cell(img("halvorsen-portrait-studio", 0.82)),
            b: cell(
                group(
                    t("Statement", "label"),
                    t("We design the pause before the room speaks.", "h2"),
                    t(
                        "Founded in Oslo, Studio Halvorsen makes interiors, identities, and objects that hold their composure. We start with restraint and remove until only what matters is left — then we make that one thing unforgettable. Sixteen years, three continents, one obsession with proportion.",
                        "body",
                    ),
                ),
            ),
        }),
        section("p3", "three-up", {
            a: cell(stat("120+", "projects completed")),
            b: cell(stat("16", "years independent")),
            c: cell(stat("9", "design awards")),
        }),
        section("p4", "full", {
            a: cell(
                group(
                    t("Selected work", "label"),
                    t("A few rooms we're proud of.", "h2"),
                    t(
                        "Residential, hospitality, and retail — each a study in light, material, and the discipline of leaving things out.",
                        "body",
                    ),
                ),
            ),
        }),
        section("p5", "two-col", {
            a: cell(
                card(
                    img("halvorsen-fjord-house-interior", 1.2),
                    t("Fjord House", "h3"),
                    t("Private residence · Bergen · 2025", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("halvorsen-amber-hotel-lobby", 1.2),
                    t("Hotel Amber", "h3"),
                    t("28-room boutique hotel · Copenhagen · 2024", "caption"),
                ),
            ),
        }),
        section("p6", "three-up", {
            a: cell(
                card(
                    img("halvorsen-glasshouse-cafe", 1),
                    t("The Glasshouse", "h3"),
                    t("Café & roastery · Oslo", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("halvorsen-marble-flagship-retail", 1),
                    t("Marlowe Flagship", "h3"),
                    t("Retail identity · London", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("halvorsen-linen-apartment", 1),
                    t("Linen Apartment", "h3"),
                    t("Pied-à-terre · Paris", "caption"),
                ),
            ),
        }),
        section("p7", "split-6040", {
            a: cell(
                group(
                    t("In focus", "label"),
                    badge("FEATURED"),
                    t("Hotel Amber.", "h2"),
                    t(
                        "Twenty-eight rooms inside a former printing house. We kept the cast-iron columns, warmed everything in oak and brass, and let a single skylight do the work of a chandelier. It won the Wallpaper* Design Award the year it opened.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("halvorsen-amber-detail-brass", 0.92)),
        }),
        section("p8", "full", {
            a: cell(group(t("What we do", "label"), t("Three ways to work with us.", "h2"))),
        }),
        section("p9", "three-up", {
            a: cell(
                card(
                    t("Interiors", "h3"),
                    t(
                        "Full-service interior architecture, from first sketch to the last switch plate. Residential and hospitality.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Identity", "h3"),
                    t(
                        "Brand systems for places and makers — naming, type, and the small printed things people keep.",
                        "body",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Objects", "h3"),
                    t(
                        "Limited-run furniture and lighting, designed in-house and made with workshops we've known for years.",
                        "body",
                    ),
                ),
            ),
        }),
        section("p10", "full", {
            a: cell(
                quote(
                    "They handed us a building we'd stopped seeing and gave it back as somewhere we never want to leave.",
                    "Ines Lund · Owner, Hotel Amber",
                ),
            ),
        }),
        section(
            "p11",
            "split-6040",
            {
                a: cell(
                    group(
                        t("Let's begin", "label"),
                        t("Tell us about the space.", "h2"),
                        t(
                            "We take on a handful of projects a year so each one gets all of us. If you've got a room, a brand, or an idea that deserves restraint, we'd love to hear it.",
                            "subtitle",
                        ),
                        button("Start a project"),
                    ),
                ),
                b: cell(img("halvorsen-studio-materials-flatlay", 0.92)),
            },
            { background: bgImage("halvorsen-contact-texture", 0.4) },
        ),
    ],
    bgImage("couture-paper-texture", 0.3),
);

// ── Personal & creative ─────────────────────────────────────────────────────
// A believable about/bio site for an independent writer-designer.

export const personalSite: ArtifactContent = web(
    "aura",
    [
        section("s1", "split-6040", {
            a: cell(
                group(
                    t("WRITER · DESIGNER · FOUNDER", "label"),
                    t("Wren Halloran", "h1"),
                    t(
                        "I make small, durable software — and write about the craft of paying attention. Currently in Lisbon, building Quiet Machines.",
                        "subtitle",
                    ),
                    button("Say hello"),
                ),
            ),
            b: cell(img("wren-halloran-portrait", 0.78)),
        }),
        section("s2", "full", {
            a: cell(
                group(
                    t("A few words", "label"),
                    t("I build things meant to be kept.", "h2"),
                    t(
                        "Most software is designed to be replaced — by the next version, the next funding round, the next acquirer. I’m interested in the other kind: tools that earn a permanent place on your desk, that get quieter and more useful the longer you live with them.",
                        "body",
                    ),
                    t(
                        "For ten years I’ve moved between writing and design, and I’ve stopped pretending they’re different jobs. Both are really about deciding what to leave out. Everything here is an attempt at the same thing: less, but better, and made to last.",
                        "body",
                    ),
                ),
            ),
        }),
        section("s3", "split-4060", {
            a: cell(img("wren-studio-desk", 1.05)),
            b: cell(
                group(
                    t("About", "label"),
                    t("A short version of a long story.", "h2"),
                    t(
                        "I started as a magazine editor, learned to code so I could fix our broken CMS, and never quite stopped. Since then I’ve shipped reading tools, run a tiny studio, and written essays that somehow found more readers than anything I made on purpose.",
                        "body",
                    ),
                    bullets(
                        "Founder of Quiet Machines, a two-person software studio",
                        "Author of the weekly letter “Slow Tools” (24,000 readers)",
                        "Previously design lead at Cadence; editor at The Margin",
                    ),
                ),
            ),
        }),
        section("s4", "three-up", {
            a: cell(
                card(
                    badge("SHIPPING"),
                    t("Margin 2.0", "h3"),
                    t(
                        "A rebuild of my reading app around one idea: nothing you save is ever lost. Beta opens this autumn.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                card(
                    badge("WRITING"),
                    t("The Attention Book", "h3"),
                    t(
                        "A short, illustrated book on focus as a craft. Roughly two-thirds drafted; out next year.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                card(
                    badge("ADVISING"),
                    t("Two founders", "h3"),
                    t(
                        "Helping two early teams find the shape of their product before they write much code.",
                        "caption",
                    ),
                ),
            ),
        }),
        section("s5", "split-6040", {
            a: cell(
                group(
                    t("Selected writing", "label"),
                    t("Essays people actually finished.", "h2"),
                    t("In Praise of Software That Ends", "h3"),
                    t(
                        "On the quiet dignity of a tool that lets you reach the bottom · 9 min",
                        "caption",
                    ),
                    t("The Last Honest Inbox", "h3"),
                    t(
                        "Why I rebuilt email for one person — me — and kept it that way · 12 min",
                        "caption",
                    ),
                    t("Notes on Making Things Small", "h3"),
                    t("A working theory of why less software outlives more · 7 min", "caption"),
                ),
            ),
            b: cell(img("wren-essay-spread", 0.82)),
        }),
        section("s6", "split-4060", {
            a: cell(img("wren-margin-app", 1)),
            b: cell(
                group(
                    t("Featured", "label"),
                    badge("LIVE"),
                    t("Margin — a reading app that forgets nothing.", "h2"),
                    t(
                        "Save anything, highlight freely, and trust that it will still be there in ten years. No feed, no algorithm, no expiry — just your library, getting more valuable the longer you tend it.",
                        "body",
                    ),
                    button("Visit Margin"),
                ),
            ),
        }),
        section("s7", "three-up", {
            a: cell(stat("24K", "readers of the weekly “Slow Tools” letter")),
            b: cell(stat("3", "products shipped and still maintained, years on")),
            c: cell(stat("10 yrs", "moving between writing and design")),
        }),
        section("s8", "two-col", {
            a: cell(
                quote(
                    "Wren is the rare maker who treats restraint as a feature. Working with her, the best ideas were always the ones she talked us out of.",
                    "Aoife Brennan · co-founder, Cadence",
                ),
            ),
            b: cell(
                quote(
                    "Half my saved-articles graveyard is now things I’ve actually read, because of Margin. It’s the only software I’ve paid for twice.",
                    "Theo Marsh · reader since 2021",
                ),
            ),
        }),
        section("s9", "three-up", {
            a: cell(
                group(
                    t("Offscreen", "h3"),
                    t("“A quiet manifesto for durable software.”", "caption"),
                ),
            ),
            b: cell(
                group(t("The Verge", "h3"), t("“Margin is reading, minus the noise.”", "caption")),
            ),
            c: cell(
                group(
                    t("Dense Discovery", "h3"),
                    t("“Wren’s letter is a weekly exhale.”", "caption"),
                ),
            ),
        }),
        section("s10", "full", {
            a: cell(
                group(
                    t("Say hello", "label"),
                    t("Let’s make something that lasts.", "h2"),
                    t(
                        "I take on a couple of small collaborations a year — writing, design, or the early shape of a product. If that sounds like you, I’d love to hear what you’re building.",
                        "subtitle",
                    ),
                    button("Email me"),
                ),
            ),
        }),
    ],
    bgImage("wren-halloran-bg", 0.32),
);

// ── Personal & creative ─────────────────────────────────────────────────────
// An elegant cover letter from a believable applicant for a specific role.

export const coverLetter: ArtifactContent = doc(
    "sumi",
    [
        section("c1", "full", {
            a: cell(
                group(
                    t("COVER LETTER", "label"),
                    t("Camille Laurent", "h1"),
                    t("Application — Senior Product Designer, Northwind", "caption"),
                    t(
                        "camille.laurent@hey.com · (415) 555-0142 · Portland, OR · June 2026",
                        "caption",
                    ),
                ),
            ),
        }),
        section("c2", "full", {
            a: cell(
                group(
                    t("Dear Northwind team,", "subtitle"),
                    t(
                        "I recommend your app to people without being asked — which, for a money product, is almost unheard of. Northwind is the rare financial tool that lowers my pulse instead of raising it. You design for calm in a category that profits from anxiety, and I’ve wanted to work on something like it for a long time. So when I saw the Senior Product Designer role open, I didn’t want to send the usual letter. I wanted to send a real one.",
                        "body",
                    ),
                ),
            ),
        }),
        section("c3", "split-4060", {
            a: cell(img("camille-onboarding-flow", 1.15)),
            b: cell(
                group(
                    t("What I’d bring", "label"),
                    t("I design for trust, not just clicks.", "h2"),
                    t(
                        "At Folio I led the redesign of an onboarding flow that asked first-time users to connect their bank on screen one — and watched most of them leave. We rebuilt it around earning permission slowly: explain, then ask. Activation rose 38% and first-week drop-off was cut nearly in half, without a single dark pattern. It’s the work I’m proudest of, and it’s the kind of work Northwind already values.",
                        "body",
                    ),
                ),
            ),
        }),
        section("c4", "full", {
            a: cell(
                group(
                    t("Systems", "label"),
                    t("Tools that scale past me.", "h3"),
                    t(
                        "Good design shouldn’t depend on the designer being in the room. I built and shipped Atlas, Folio’s design system, and grew it from a Figma file into a living library adopted by six product teams. The point was never consistency for its own sake — it was speed and trust: designers stopped reinventing the same date picker, and engineers stopped guessing.",
                        "body",
                    ),
                    stat("−40%", "time from design to shipped after Atlas was adopted"),
                ),
            ),
        }),
        section("c5", "full", {
            a: cell(
                group(
                    t("Craft", "label"),
                    t("Accessible by default, not as an afterthought.", "h3"),
                    t(
                        "Last year I led an accessibility overhaul that brought our core flows to WCAG 2.2 AA — re-thinking contrast, focus order, and screen-reader copy across the product. I also mentored three junior designers through it, because the surest way to keep standards high is to make sure you’re not the only one who can hold them.",
                        "body",
                    ),
                ),
            ),
        }),
        section("c6", "full", {
            a: cell(
                quote(
                    "Camille is the rare designer who can hold the whole system in her head and still sweat a single label. She raised the bar for the entire team — and made the rest of us want to clear it.",
                    "Devin Park · Head of Design, Folio",
                ),
            ),
        }),
        section("c7", "full", {
            a: cell(
                callout(
                    "note",
                    t(
                        "A few practical notes: I’m based in Portland and happy to relocate or keep to your hours. I’m available from August, and I’d be glad to begin with a short paid design exercise — it’s the fastest honest way for both of us to see how we work together.",
                        "body",
                    ),
                ),
            ),
        }),
        section("c8", "full", {
            a: cell(
                group(
                    t(
                        "I’ve admired Northwind from the outside for two years; I’d love the chance to make it better from the inside. Thank you for reading this far — I know your time is short, and I’ve tried to be worth it.",
                        "body",
                    ),
                ),
            ),
        }),
        section("c9", "full", {
            a: cell(
                group(
                    divider(),
                    t("Warmly,", "body"),
                    t("Camille Laurent", "h3"),
                    t("Portfolio: camillelaurent.design · LinkedIn: in/camille-laurent", "caption"),
                ),
            ),
        }),
    ],
    bgImage("camille-laurent-paper", 0.28),
);

export const eventInvite: ArtifactContent = web(
    "rose",
    [
        // 1 — Hero
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("WITH JOYFUL HEARTS, TOGETHER WITH THEIR FAMILIES", "label"),
                        badge("SATURDAY · 12 SEPTEMBER 2026"),
                        t("Amara & Théo", "h1"),
                        t(
                            "are getting married — and they would be overjoyed for you to be there, under the olive trees, when they say yes.",
                            "subtitle",
                        ),
                        t("Quinta da Lua · Sintra, Portugal", "caption"),
                        button("RSVP by 1 August"),
                    ),
                ),
            },
            { background: bgImage("wedding-hero-olive-grove-dusk", 0.55) },
        ),

        // 2 — The invitation note
        section("s2", "full", {
            a: cell(
                group(
                    t("A NOTE FROM US", "label"),
                    t("Eight years, two cities, and one very good dog later.", "h2"),
                    t(
                        "We met in a rained-out queue for a film neither of us ended up seeing, and we have been choosing each other on purpose every day since.",
                        "subtitle",
                    ),
                    t(
                        "This September we're gathering the people who made us who we are — in a hillside grove above Sintra, with the sea somewhere over the trees — to make it official and then to dance about it for as long as the band will let us. There's no part of this day that matters more than having you in it. So please: come early, stay late, wear shoes you can lose.",
                        "body",
                    ),
                ),
            ),
        }),

        // 3 — The couple (split, image right)
        section("s3", "split-6040", {
            a: cell(
                group(
                    t("THE TWO OF US", "label"),
                    t("Amara, who plans everything. Théo, who plans nothing.", "h2"),
                    t(
                        "Amara grew up in Lagos and London and reads three books at once; Théo is from Porto, cooks like he's feeding an army, and has never once been on time. Somehow it works. Most weekends you'll find us at the market, arguing happily about which tomatoes to buy and where to put the future couch.",
                        "body",
                    ),
                    t("— Amara & Théo", "caption"),
                ),
            ),
            b: cell(img("wedding-couple-portrait-laughing", 0.84)),
        }),

        // 4 — The details (three-up cards)
        section("s4", "three-up", {
            a: cell(
                card(
                    img("wedding-detail-ceremony-arch", 1),
                    t("The Ceremony", "h3"),
                    t("4:00 PM · The Olive Terrace · please be seated by 3:45", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("wedding-detail-dinner-table", 1),
                    t("The Reception", "h3"),
                    t("6:00 PM · The Stone Barn · dinner, toasts & dancing to follow", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("wedding-detail-dress-code-linen", 1),
                    t("What to Wear", "h3"),
                    t("Garden formal · soft colours · flat-friendly for grass & gravel", "caption"),
                ),
            ),
        }),

        // 5 — The schedule (table)
        section("s5", "full", {
            a: cell(
                group(
                    t("THE DAY, HOUR BY HOUR", "label"),
                    t("How Saturday will unfold.", "h2"),
                    table(
                        "Time,What's happening,Where\n3:30 PM,Arrival & welcome drinks,The Lower Courtyard\n4:00 PM,Ceremony,The Olive Terrace\n4:45 PM,Photos & golden-hour aperitivo,The Garden\n6:00 PM,Dinner & toasts,The Stone Barn\n8:30 PM,First dance & the band,The Barn\n11:00 PM,Late-night snacks & last orders,The Courtyard\n12:00 AM,Sparkler send-off,The Drive",
                    ),
                ),
            ),
        }),

        // 6 — The venue (bgImage feature)
        section(
            "s6",
            "full",
            {
                a: cell(
                    group(
                        t("THE PLACE", "label"),
                        t("Quinta da Lua", "h2"),
                        t(
                            "A working olive farm folded into the green hills above Sintra — terracotta, old stone, and rows of silver trees that go gold at dusk. It's a forty-minute drive from Lisbon and feels a hundred years from anywhere.",
                            "subtitle",
                        ),
                    ),
                ),
            },
            { background: bgImage("wedding-venue-quinta-hillside", 0.5) },
        ),

        // 7 — Travel & stay (two-col bullets)
        section("s7", "two-col", {
            a: cell(
                group(
                    t("GETTING THERE", "label"),
                    t("Finding the grove", "h3"),
                    bullets(
                        "Fly into Lisbon (LIS) — about 40 minutes by car from the quinta",
                        "We'll run shuttle vans from central Sintra at 3:00 and 3:20 PM",
                        "Driving? There's free parking on the lower drive; leave the car overnight if you'd rather",
                        "Taxis and rideshare reach the gate, but book the return ahead — signal is thin in the hills",
                    ),
                ),
            ),
            b: cell(
                group(
                    t("WHERE TO STAY", "label"),
                    t("A few nights nearby", "h3"),
                    bullets(
                        "We've held a block of rooms at Casa do Vale in Sintra — code AMARATHEO until 1 August",
                        "Sintra's old town is the prettiest base; Cascais is lovelier still if you want the sea",
                        "Lisbon is close enough for a 'morning after' brunch — we'd love to see you there",
                        "Coming far? Make a holiday of it; we're happy to share our favourite places",
                    ),
                ),
            ),
        }),

        // 8 — Gallery (three-up image grid)
        section("s8", "three-up", {
            a: cell(
                group(
                    img("wedding-gallery-olive-rows-light", 0.8),
                    t("The grove at the hour we'll marry.", "caption"),
                ),
            ),
            b: cell(
                group(
                    img("wedding-gallery-table-figs-candles", 0.8),
                    t("Long tables, figs, and far too many candles.", "caption"),
                ),
            ),
            c: cell(
                group(
                    img("wedding-gallery-dancing-string-lights", 0.8),
                    t("And then, the part with the dancing.", "caption"),
                ),
            ),
        }),

        // 9 — A word from a friend (quote)
        section("s9", "full", {
            a: cell(
                quote(
                    "These two make everyone around them feel like the most interesting person in the room. Come September, that room has a sea view.",
                    "Lena · maid of honour",
                ),
            ),
        }),

        // 10 — RSVP (bgImage CTA)
        section(
            "s10",
            "full",
            {
                a: cell(
                    group(
                        t("THE ONLY HOMEWORK", "label"),
                        t("Let us know you're coming.", "h2"),
                        t(
                            "Kindly reply by 1 August so we can save you a seat, a glass, and a place at the long table. Tell us about dietary needs, songs that will get you dancing, and whether you'll need a shuttle.",
                            "subtitle",
                        ),
                        button("RSVP at amaraandtheo.love"),
                        callout(
                            "tip",
                            t(
                                "Bringing little ones? We adore them and have a quiet room with a sitter from 8 PM — just say the word when you reply.",
                                "body",
                            ),
                        ),
                    ),
                ),
            },
            { background: bgImage("wedding-rsvp-string-lights-evening", 0.55) },
        ),

        // 11 — Footer
        section("s11", "three-up", {
            a: cell(
                group(
                    t("Amara & Théo", "h3"),
                    t("12 September 2026 · Sintra", "caption"),
                    t("hello@amaraandtheo.love", "caption"),
                ),
            ),
            b: cell(
                group(
                    t("GIFTS", "label"),
                    t(
                        "Your presence is the whole gift. If you'd like to do more, we're saving for a honeymoon in the Azores — details on the site.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                group(
                    t("SHARE THE DAY", "label"),
                    t("Tag your photos #AmaraAndTheo so we don't miss a single one.", "caption"),
                    t("amaraandtheo.love", "caption"),
                ),
            ),
        }),

        // 12 — Fine print
        section("s12", "full", {
            a: cell(
                group(
                    divider(),
                    t(
                        "With love, and with thanks to our parents — Ngozi & Emeka Okonkwo and Inês & Rui Almeida — who started all of this.",
                        "caption",
                    ),
                ),
            ),
        }),
    ],
    bgImage("wedding-paper-texture-bg", 0.3),
);

export const photoEssay: ArtifactContent = doc(
    "sumi",
    [
        // 1 — Cover
        section(
            "s1",
            "full",
            {
                a: cell(
                    group(
                        t("A PHOTO ESSAY", "label"),
                        t("Before the City Wakes", "h1"),
                        t(
                            "One hour in Kyoto, between the last streetlight and the first delivery bike — when the old city briefly belongs to no one.",
                            "subtitle",
                        ),
                        t("Photographs & words by Rei Tanaka · winter, 5:40 AM", "caption"),
                    ),
                ),
            },
            { background: bgImage("kyoto-dawn-cover-misty-lane", 0.55) },
        ),

        // 2 — Opening reflection
        section("s2", "full", {
            a: cell(
                group(
                    t("The opening", "label"),
                    t(
                        "I started waking before the city to find out who it is when nobody is watching.",
                        "subtitle",
                    ),
                    t(
                        "There is a particular hour here — too late to be night, too early to be morning — when Kyoto sets itself down like a held breath. The shutters are still drawn. The lanterns have gone out but the sky hasn't quite caught up. For maybe sixty minutes the streets are returned to the stones, the river, the mist, and the few of us foolish enough to be out in the cold to see it.",
                        "body",
                    ),
                    t(
                        "These are the pictures I came home with — and the small things I noticed only because there was nothing else to look at.",
                        "body",
                    ),
                ),
            ),
        }),

        // 3 — Full image
        section("s3", "full", {
            a: cell(
                group(
                    img("kyoto-dawn-gion-empty-lane-lanterns", 1.6),
                    t(
                        "Gion, 5:48. The teahouse lanterns are dark, the cobbles wet from a rain that came and went while the city slept. Not a single footprint yet — only mine, and I keep them to the edge.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 4 — Split, image left
        section("s4", "split-4060", {
            a: cell(img("kyoto-dawn-river-heron-mist", 1.05)),
            b: cell(
                group(
                    t("Kamo River", "label"),
                    t("The first to clock in", "h2"),
                    t(
                        "A grey heron stands in the shallows of the Kamo, perfectly still, the way it has stood every morning for a thousand years of mornings. It is always here before me. It watches the water and not the photographer, which I take, on balance, as a kindness.",
                        "body",
                    ),
                ),
            ),
        }),

        // 5 — Full image
        section("s5", "full", {
            a: cell(
                group(
                    img("kyoto-dawn-fushimi-torii-tunnel", 1.6),
                    t(
                        "Fushimi Inari before the crowds — ten thousand vermilion gates and not one other soul. The light comes through sideways and turns the whole tunnel the colour of a lit ember.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 6 — Split, image right
        section("s6", "split-6040", {
            a: cell(
                group(
                    t("Nishiki", "label"),
                    t("The market, half-awake", "h2"),
                    t(
                        "Behind the shutters of the covered market the day is already starting in whispers — a knife on a board, the hiss of a kettle, a radio turned low. A fishmonger hoses down the stones outside his stall and nods at me without surprise, as if everyone is up at this hour and only pretending otherwise.",
                        "body",
                    ),
                    t(
                        "He hands me a cup of tea I didn't ask for. I drink it standing in the cold, grateful past the reach of my Japanese.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("kyoto-dawn-nishiki-shutter-steam", 0.82)),
        }),

        // 7 — Triptych gallery
        section("s7", "three-up", {
            a: cell(
                group(
                    img("kyoto-dawn-detail-frost-moss", 0.8),
                    t(
                        "Frost holding the edge of the temple moss, an hour from melting.",
                        "caption",
                    ),
                ),
            ),
            b: cell(
                group(
                    img("kyoto-dawn-detail-bicycle-alley", 0.8),
                    t(
                        "One bicycle, leaning where it was left, keeping the alley company.",
                        "caption",
                    ),
                ),
            ),
            c: cell(
                group(
                    img("kyoto-dawn-detail-paper-window-glow", 0.8),
                    t(
                        "The first window to glow — someone, somewhere, putting on the rice.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 8 — Quote / interlude (bgImage)
        section(
            "s8",
            "full",
            {
                a: cell(
                    quote(
                        "I came to photograph the temples and stayed for the silence between them, which no lens has ever once held still.",
                        "— field notes, the third morning",
                    ),
                ),
            },
            { background: bgImage("kyoto-dawn-bamboo-grove-fog", 0.55) },
        ),

        // 9 — Split, image left
        section("s9", "split-4060", {
            a: cell(img("kyoto-dawn-arashiyama-bamboo-path", 1.08)),
            b: cell(
                group(
                    t("Arashiyama", "label"),
                    t("Among the bamboo", "h2"),
                    t(
                        "The grove makes its own weather. Up there the canes close over the path and the light arrives already filtered, green and underwater. In the wind the whole stand creaks and bows like the timbers of a ship, and you understand why the old poets kept coming back here to listen rather than to look.",
                        "body",
                    ),
                ),
            ),
        }),

        // 10 — Full image
        section("s10", "full", {
            a: cell(
                group(
                    img("kyoto-dawn-monk-sweeping-courtyard", 1.6),
                    t(
                        "A monk sweeps the courtyard of a temple that won't open for hours, drawing the same lines in the same gravel he drew yesterday. The point, I think, was never to finish.",
                        "caption",
                    ),
                ),
            ),
        }),

        // 11 — Split, image right
        section("s11", "split-6040", {
            a: cell(
                group(
                    t("Pontocho", "label"),
                    t("The narrowest street", "h2"),
                    t(
                        "Pontocho is barely wide enough for two people to pass and politely apologise. By night it's all neon and noise; by 6 AM it's a corridor of shut doors and drying lanterns, the river breathing at one end of it, and the smell of last night's charcoal still hanging in the damp.",
                        "body",
                    ),
                ),
            ),
            b: cell(img("kyoto-dawn-pontocho-narrow-alley", 0.82)),
        }),

        // 12 — Closing thought (bgImage)
        section(
            "s12",
            "full",
            {
                a: cell(
                    group(
                        t("The closing", "label"),
                        t("And then the bicycles", "h2"),
                        t(
                            "It ends the same way each time. A delivery bike turns the corner, a shutter rolls up with a clatter, a phone rings somewhere behind a wall — and the spell, which was never really mine to keep, lifts. The city stretches, remembers itself, and takes its streets back. I put the lens cap on and walk home into the noise, already a little homesick for an hour that hasn't even finished leaving.",
                            "body",
                        ),
                        t("— Rei, walking back along the Kamo", "caption"),
                    ),
                ),
            },
            { background: bgImage("kyoto-dawn-closing-sunrise-rooftops", 0.5) },
        ),
    ],
    bgImage("photoessay-paper-bg", 0.3),
);
