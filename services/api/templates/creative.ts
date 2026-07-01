import type { ArtifactContent } from "@model/content";
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
} from "@model/authoring";

export const resume: ArtifactContent = doc(
    "manuscript",
    [
        section("r1", "split-6040", {
            a: cell(
                group(
                    t("PRODUCT DESIGNER", "eyebrow"),
                    t("Elena Maris Vance", "display"),
                    t(
                        "Senior product designer shaping calm, durable software for teams that move fast.",
                        "lead",
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
                    t("Summary", "eyebrow"),
                    t(
                        "I design end-to-end product experiences — from the first scrappy prototype to the pixels that ship — for tools people open every day. Nine years across fintech, developer platforms, and consumer health, most recently leading design for a payments product used by 40,000+ small businesses. I care about systems that scale, interfaces that disappear, and shipping work that actually makes it to production.",
                        "lead",
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
                    t("Northwind", "title"),
                    t("Lead Product Designer", "byline"),
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
                    t("Cadence Health", "title"),
                    t("Senior Product Designer", "byline"),
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
                    t("Foglight Studio", "title"),
                    t("Product Designer", "byline"),
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
                    t("Craft", "eyebrow"),
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
                    t("Method", "eyebrow"),
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
                    t("Tools", "eyebrow"),
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
                    t("Selected projects", "eyebrow"),
                    t("Aster Design System", "title"),
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
                    t("Education", "eyebrow"),
                    t("Rhode Island School of Design", "title"),
                    t("BFA, Graphic Design · 2013 — 2017", "byline"),
                    t("Senior thesis on type systems for data-dense interfaces.", "caption"),
                ),
            ),
            b: cell(
                group(
                    t("Recognition", "eyebrow"),
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
                        t("What I value", "eyebrow"),
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
                        "lead",
                    ),
                    t("elena@vance.design · vance.design · in/elenavance", "byline"),
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
                        t("STUDIO HALVORSEN", "eyebrow"),
                        t("Light, made deliberate.", "display"),
                        t(
                            "An independent design studio working at the edge of architecture, brand, and the objects in between — for people who believe a space should be felt before it's understood.",
                            "lead",
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
                    t("Statement", "eyebrow"),
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
                    t("Selected work", "eyebrow"),
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
                    t("Fjord House", "title"),
                    t("Private residence · Bergen · 2025", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("halvorsen-amber-hotel-lobby", 1.2),
                    t("Hotel Amber", "title"),
                    t("28-room boutique hotel · Copenhagen · 2024", "caption"),
                ),
            ),
        }),
        section("p6", "three-up", {
            a: cell(
                card(
                    img("halvorsen-glasshouse-cafe", 1),
                    t("The Glasshouse", "title"),
                    t("Café & roastery · Oslo", "caption"),
                ),
            ),
            b: cell(
                card(
                    img("halvorsen-marble-flagship-retail", 1),
                    t("Marlowe Flagship", "title"),
                    t("Retail identity · London", "caption"),
                ),
            ),
            c: cell(
                card(
                    img("halvorsen-linen-apartment", 1),
                    t("Linen Apartment", "title"),
                    t("Pied-à-terre · Paris", "caption"),
                ),
            ),
        }),
        section("p7", "split-6040", {
            a: cell(
                group(
                    t("In focus", "eyebrow"),
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
            a: cell(group(t("What we do", "eyebrow"), t("Three ways to work with us.", "h2"))),
        }),
        section("p9", "three-up", {
            a: cell(
                card(
                    t("Interiors", "title"),
                    t(
                        "Full-service interior architecture, from first sketch to the last switch plate. Residential and hospitality.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                card(
                    t("Identity", "title"),
                    t(
                        "Brand systems for places and makers — naming, type, and the small printed things people keep.",
                        "body",
                    ),
                ),
            ),
            c: cell(
                card(
                    t("Objects", "title"),
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
                        t("Let's begin", "eyebrow"),
                        t("Tell us about the space.", "h2"),
                        t(
                            "We take on a handful of projects a year so each one gets all of us. If you've got a room, a brand, or an idea that deserves restraint, we'd love to hear it.",
                            "lead",
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
