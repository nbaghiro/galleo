import type { ArtifactContent, ElementInstance } from "@model/artifact";
import type { Template } from "@model/templates";
import { TEMPLATE_INDEX } from "@model/templates";
import {
    badge,
    bgImage,
    bgTone,
    bullets,
    button,
    callout,
    card,
    chart,
    checks,
    col,
    cta,
    deck,
    diagram,
    divider,
    doc,
    emptyRegion,
    faq,
    feature,
    fill,
    fitW,
    group,
    img,
    menu,
    pricing,
    profile,
    quote,
    row,
    section,
    split,
    stat,
    t,
    table,
    tabs,
    testimonial,
    video,
    web,
} from "@model/authoring";

// The starter-template bodies, hand-authored with the @model/authoring DSL and grouped by the same
// category the index uses. @model/templates carries the client-facing half (ids, labels, grouping);
// this file is the other half, plus the id → body resolution the /templates route and the seed use.

// ---- site chrome
//
// The nav is one flat row: a nested one would reflow to a column at the share of the width it would
// get. The brand takes the slack, which is what puts the links hard right without a justify rule.
// Every nav band carries a solid colour of its own, since a pinned section is painted over whatever
// scrolls beneath it.

const siteNav = (brand: string, ...items: ElementInstance[]): ElementInstance => ({
    ...row({ align: "center" }, fill(t(brand, "label")), ...items.map((i) => fitW(i))),
    layout: { dock: "top" },
});

const navLink = (label: string, href: string): ElementInstance =>
    button(label, href, { variant: "ghost", size: "sm" });

const navCta = (label: string, href: string): ElementInstance =>
    button(label, href, { variant: "filled", size: "sm", shape: "pill" });

// A real, long-lived URL so the demo section actually plays for someone who publishes the template
// before swapping in their own footage; the poster beside it is what every static surface paints.
// Must be an ordinary upload, never a live stream: YouTube embeds a stream's recording as
// "Video unavailable" once the stream rotates.
const DEMO_VIDEO = "https://www.youtube.com/watch?v=WhWc3b3KhnY";

// ---- creative

export const resume: ArtifactContent = doc(
    "studio",
    [
        section(
            "r1",
            split(
                60,
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
                img("elena-vance-portrait", 0.82, 200),
            ),
        ),
        section(
            "r2",
            group(
                t("Summary", "label"),
                t(
                    "I design end-to-end product experiences, from the first scrappy prototype to the pixels that ship, for tools people open every day. Nine years across fintech, developer platforms, and consumer health, most recently leading design for a payments product used by 40,000+ small businesses. I care about systems that scale, interfaces that disappear, and shipping work that actually makes it to production.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "r3",
            row(
                stat("9 yrs", "designing shipping product"),
                stat("40k+", "businesses on my last product"),
                stat("$12M", "ARR influenced by 2024 redesign"),
            ),
        ),
        section(
            "r4",
            split(
                40,
                group(
                    t("Northwind", "h3"),
                    t("Lead Product Designer", "caption"),
                    t("2022–Present · San Francisco", "caption"),
                ),
                bullets(
                    "Led the end-to-end redesign of the merchant payments dashboard, lifting weekly active use 34% and cutting time-to-first-invoice from 11 minutes to under 3.",
                    "Built and now maintain Aster, the company's first cross-platform design system: 80+ components adopted by four product teams.",
                    "Mentor two designers and run the weekly critique that the whole product org now attends.",
                ),
            ),
        ),
        section(
            "r5",
            split(
                40,
                group(
                    t("Cadence Health", "h3"),
                    t("Senior Product Designer", "caption"),
                    t("2019–2022 · Remote", "caption"),
                ),
                bullets(
                    "Designed the onboarding and daily-tracking flows for a chronic-care app that grew from 5k to 220k monthly users.",
                    "Ran a 6-week research sprint with 40 patients that reframed the entire care-plan model the team had been building.",
                    "Shipped an accessibility overhaul that took the app from WCAG A to AA across every core flow.",
                ),
            ),
        ),
        section(
            "r6",
            split(
                40,
                group(
                    t("Foglight Studio", "h3"),
                    t("Product Designer", "caption"),
                    t("2017–2019 · Portland", "caption"),
                ),
                bullets(
                    "Sole designer on client products for early-stage startups: brand, web, and product across a dozen launches.",
                    "Established the studio's first reusable Figma libraries, cutting average project setup from days to hours.",
                ),
            ),
        ),
        section(
            "r7",
            row(
                card(
                    t("Craft", "label"),
                    bullets(
                        "Interaction & visual design",
                        "Prototyping (Figma, code)",
                        "Design systems",
                        "Motion & micro-interaction",
                    ),
                ),
                card(
                    t("Method", "label"),
                    bullets(
                        "Generative & evaluative research",
                        "Service blueprinting",
                        "Workshop facilitation",
                        "Design ops",
                    ),
                ),
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
        ),
        section(
            "r8",
            split(
                60,
                group(
                    t("Selected projects", "label"),
                    t("Aster Design System", "h3"),
                    t(
                        "A single source of truth for four product teams: tokens, components, and usage guidelines that turned a fractured UI into one coherent voice. Documented, versioned, and adopted across web and mobile.",
                        "body",
                    ),
                    t(
                        "Merchant Dashboard 2.0 · Cadence Care Plans · Foglight client launches",
                        "caption",
                    ),
                ),
                img("aster-design-system-screens", 0.82, 12),
            ),
        ),
        section(
            "r9",
            row(
                group(
                    t("Education", "label"),
                    t("Rhode Island School of Design", "h3"),
                    t("BFA, Graphic Design · 2013–2017", "caption"),
                    t("Senior thesis on type systems for data-dense interfaces.", "caption"),
                ),
                group(
                    t("Recognition", "label"),
                    bullets(
                        "Core77 Design Award, Interaction · 2023",
                        'Speaker, Config 2022: "Design systems that survive reorgs"',
                        "Awwwards Honorable Mention · 2019",
                    ),
                ),
            ),
        ),
        section(
            "r10",
            callout(
                "note",
                group(
                    t("What I value", "label"),
                    t(
                        "The best design work is quiet. I'd rather ship one flow that genuinely respects a person's time than ten features that demo well. I show up for the unglamorous middle (the edge cases, the empty states, the error copy) because that is where products earn trust.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "r11",
            group(
                t(
                    "Open to senior and lead product design roles, full-time or fractional.",
                    "subtitle",
                ),
                t("elena@vance.design · vance.design · in/elenavance", "caption"),
            ),
        ),
    ],
    bgImage("manuscript-paper-bg", 0.2),
);

export const portfolio: ArtifactContent = web(
    "couture",
    [
        section(
            "hero",
            col(
                siteNav(
                    "STUDIO HALVORSEN",
                    menu(
                        "Work",
                        navLink("Fjord House", "#work"),
                        navLink("Hotel Amber", "#amber"),
                        navLink("The Glasshouse", "#more-work"),
                        navLink(
                            "Archive on Instagram",
                            "https://www.instagram.com/studiohalvorsen",
                        ),
                    ),
                    navLink("Studio", "#studio"),
                    navLink("Services", "#services"),
                    navCta("Enquire", "#contact"),
                ),
                t("STUDIO HALVORSEN", "label"),
                t("Light, made deliberate.", "h1"),
                t(
                    "An independent design studio working at the edge of architecture, brand, and the objects in between, for people who believe a space should be felt before it's understood.",
                    "subtitle",
                ),
                button("See the work", "#work"),
            ),
            {
                bleed: true,
                background: bgImage("halvorsen-hero-architecture", 0.55),
                frame: { aspect: 16 / 7 },
            },
        ),
        section(
            "studio",
            split(
                40,
                img("halvorsen-portrait-studio", 0.82),
                col(
                    t("Statement", "label"),
                    t("We design the pause before the room speaks.", "h2"),
                    t(
                        "Founded in Oslo, Studio Halvorsen makes interiors, identities, and objects that hold their composure. We start with restraint and remove until only what matters is left. Then we make that one thing unforgettable. Sixteen years, three continents, one obsession with proportion.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("120+", "projects completed"),
                stat("16", "years independent"),
                stat("9", "design awards"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "work",
            col(
                t("Selected work", "label"),
                t("A few rooms we're proud of.", "h2"),
                t(
                    "Residential, hospitality, and retail, each a study in light, material, and the discipline of leaving things out.",
                    "body",
                ),
            ),
        ),
        section(
            "work-a",
            row(
                card(
                    img("halvorsen-fjord-house-interior", 1.2),
                    t("Fjord House", "h3"),
                    t("Private residence · Bergen · 2025", "caption"),
                ),
                card(
                    img("halvorsen-amber-hotel-lobby", 1.2),
                    t("Hotel Amber", "h3"),
                    t("28-room boutique hotel · Copenhagen · 2024", "caption"),
                ),
            ),
        ),
        section("interlude", col(t("Light is the one material we never buy.", "h2", "center")), {
            background: bgImage("halvorsen-interlude-white-wall-shadow", 0.5),
            bleed: true,
            frame: { aspect: 16 / 5 },
        }),
        section(
            "more-work",
            row(
                card(
                    img("halvorsen-glasshouse-cafe", 1),
                    t("The Glasshouse", "h3"),
                    t("Café & roastery · Oslo", "caption"),
                ),
                card(
                    img("halvorsen-marble-flagship-retail", 1),
                    t("Marlowe Flagship", "h3"),
                    t("Retail identity · London", "caption"),
                ),
                card(
                    img("halvorsen-linen-apartment", 1),
                    t("Linen Apartment", "h3"),
                    t("Pied-à-terre · Paris", "caption"),
                ),
            ),
        ),
        section(
            "amber",
            split(
                60,
                col(
                    t("In focus", "label"),
                    badge("FEATURED"),
                    t("Hotel Amber.", "h2"),
                    t(
                        "Twenty-eight rooms inside a former printing house. We kept the cast-iron columns, warmed everything in oak and brass, and let a single skylight do the work of a chandelier. It won the Wallpaper* Design Award the year it opened.",
                        "body",
                    ),
                    button("Read the project note", "https://studiohalvorsen.no/amber", {
                        variant: "outline",
                    }),
                ),
                img("halvorsen-amber-detail-brass", 0.92),
            ),
        ),
        section("services", col(t("What we do", "label"), t("Three ways to work with us.", "h2"))),
        section(
            "services-list",
            row(
                card(
                    t("Interiors", "h3"),
                    t(
                        "Full-service interior architecture, from first sketch to the last switch plate. Residential and hospitality.",
                        "body",
                    ),
                ),
                card(
                    t("Identity", "h3"),
                    t(
                        "Brand systems for places and makers: naming, type, and the small printed things people keep.",
                        "body",
                    ),
                ),
                card(
                    t("Objects", "h3"),
                    t(
                        "Limited-run furniture and lighting, designed in-house and made with workshops we've known for years.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "praise",
            quote(
                "They handed us a building we'd stopped seeing and gave it back as somewhere we never want to leave.",
                "Ines Lund · Owner, Hotel Amber",
            ),
            { background: bgImage("halvorsen-amber-suite-evening", 0.62), bleed: true },
        ),
        section(
            "contact",
            split(
                60,
                col(
                    t("Let's begin", "label"),
                    t("Tell us about the space.", "h2"),
                    t(
                        "We take on a handful of projects a year so each one gets all of us. If you've got a room, a brand, or an idea that deserves restraint, we'd love to hear it.",
                        "subtitle",
                    ),
                    row(
                        { align: "center" },
                        button("Start a project", "mailto:studio@halvorsen.no"),
                        button("See the archive", "https://www.instagram.com/studiohalvorsen", {
                            variant: "ghost",
                        }),
                    ),
                ),
                img("halvorsen-studio-materials-flatlay", 0.92),
            ),
            { bleed: true, background: bgImage("halvorsen-contact-texture", 0.4) },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Studio Halvorsen", "h3")),
                            fitW(t("Thorvald Meyers gate 12, Oslo", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("STUDIO", "label")),
                            fitW(t("studio@halvorsen.no", "caption")),
                            fitW(t("+47 22 40 18 06", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("ELSEWHERE", "label")),
                            fitW(t("Instagram · Pinterest", "caption")),
                            fitW(t("Photography by Ingrid Sæther", "caption")),
                        ),
                    ),
                ),
            ),
        ),
    ],
    bgImage("couture-paper-texture", 0.3),
);

export const personalSite: ArtifactContent = web(
    "vellum",
    [
        section(
            "hero",
            col(
                siteNav(
                    "WREN HALLORAN",
                    navLink("Writing", "#writing"),
                    navLink("Work", "#now"),
                    navLink("The letter", "#letter"),
                    navCta("Say hello", "#contact"),
                ),
                t("WRITER · DESIGNER · FOUNDER", "label"),
                t("Wren Halloran", "h1"),
                t(
                    "I make small, durable software, and write about the craft of paying attention. Currently in Lisbon, building Quiet Machines.",
                    "subtitle",
                ),
                button("Read the essays", "#writing"),
            ),
            {
                bleed: true,
                background: bgImage("wren-halloran-hero-desk-window", 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "about",
            col(
                t("A few words", "label"),
                t("I build things meant to be kept.", "h2"),
                t(
                    "Most software is designed to be replaced by the next version, the next funding round, the next acquirer. I’m interested in the other kind: tools that earn a permanent place on your desk, that get quieter and more useful the longer you live with them.",
                    "body",
                ),
                t(
                    "For ten years I’ve moved between writing and design, and I’ve stopped pretending they’re different jobs. Both are really about deciding what to leave out. Everything here is an attempt at the same thing: less, but better, and made to last.",
                    "body",
                ),
            ),
        ),
        section(
            "story",
            split(
                40,
                img("wren-halloran-portrait", 0.9),
                col(
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
        ),
        section(
            "now",
            row(
                card(
                    badge("SHIPPING"),
                    t("Margin 2.0", "h3"),
                    t(
                        "A rebuild of my reading app around one idea: nothing you save is ever lost. Beta opens this autumn.",
                        "caption",
                    ),
                ),
                card(
                    badge("WRITING"),
                    t("The Attention Book", "h3"),
                    t(
                        "A short, illustrated book on focus as a craft. Roughly two-thirds drafted; out next year.",
                        "caption",
                    ),
                ),
                card(
                    badge("ADVISING"),
                    t("Two founders", "h3"),
                    t(
                        "Helping two early teams find the shape of their product before they write much code.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "writing",
            col(
                t("Selected writing", "label"),
                t("Essays people actually finished.", "h2"),
                divider(),
                row(
                    fill(
                        col(
                            t("In Praise of Software That Ends", "h3"),
                            t(
                                "On the quiet dignity of a tool that lets you reach the bottom.",
                                "caption",
                            ),
                        ),
                    ),
                    fitW(t("9 min · 2026", "caption")),
                ),
                divider(),
                row(
                    fill(
                        col(
                            t("The Last Honest Inbox", "h3"),
                            t(
                                "Why I rebuilt email for one person (me) and then kept it that way.",
                                "caption",
                            ),
                        ),
                    ),
                    fitW(t("12 min · 2025", "caption")),
                ),
                divider(),
                row(
                    fill(
                        col(
                            t("Notes on Making Things Small", "h3"),
                            t("A working theory of why less software outlives more.", "caption"),
                        ),
                    ),
                    fitW(t("7 min · 2025", "caption")),
                ),
                divider(),
                row(
                    fill(
                        col(
                            t("The Year I Stopped Shipping", "h3"),
                            t(
                                "Twelve months of maintenance, and what it taught me about scope.",
                                "caption",
                            ),
                        ),
                    ),
                    fitW(t("11 min · 2024", "caption")),
                ),
                divider(),
                button("Read the archive", "https://slowtools.substack.com/archive", {
                    variant: "ghost",
                }),
            ),
        ),
        section(
            "letter",
            col(
                t("SLOW TOOLS", "label", "center"),
                t("A letter most Sunday mornings.", "h2", "center"),
                t(
                    "One short essay a week on attention, craft, and software that ages well. Twenty-four thousand people read it; nobody has ever been sold anything in it.",
                    "subtitle",
                    "center",
                ),
                fitW(
                    row(
                        { align: "center" },
                        button("Subscribe free", "https://slowtools.substack.com"),
                        button("Read a recent issue", "https://slowtools.substack.com/archive", {
                            variant: "outline",
                        }),
                    ),
                ),
                t("No sponsors, no tracking, one click to leave.", "caption", "center"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "margin",
            split(
                40,
                img("wren-margin-app", 1),
                col(
                    t("Featured", "label"),
                    badge("LIVE"),
                    t("Margin, a reading app that forgets nothing.", "h2"),
                    t(
                        "Save anything, highlight freely, and trust that it will still be there in ten years. No feed, no algorithm, no expiry. Just your library, getting more valuable the longer you tend it.",
                        "body",
                    ),
                    button("Visit Margin", "https://margin.app", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("24K", "readers of the weekly “Slow Tools” letter"),
                stat("3", "products shipped and still maintained, years on"),
                stat("10 yrs", "moving between writing and design"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "praise",
            row(
                quote(
                    "Wren is the rare maker who treats restraint as a feature. Working with her, the best ideas were always the ones she talked us out of.",
                    "Aoife Brennan · co-founder, Cadence",
                ),
                quote(
                    "Half my saved-articles graveyard is now things I’ve actually read, because of Margin. It’s the only software I’ve paid for twice.",
                    "Theo Marsh · reader since 2021",
                ),
            ),
        ),
        section(
            "press",
            col(
                t("ELSEWHERE", "label", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("Offscreen", "h3")),
                    fitW(t("The Verge", "h3")),
                    fitW(t("Dense Discovery", "h3")),
                    fitW(t("Hacker News", "h3")),
                ),
                t(
                    "“A quiet manifesto for durable software.” · “Margin is reading, minus the noise.” · “Wren’s letter is a weekly exhale.”",
                    "caption",
                    "center",
                ),
            ),
        ),
        section(
            "contact",
            col(
                t("Say hello", "label"),
                t("Let’s make something that lasts.", "h2"),
                t(
                    "I take on a couple of small collaborations a year: writing, design, or the early shape of a product. If that sounds like you, I’d love to hear what you’re building.",
                    "subtitle",
                ),
                button("Email me", "mailto:wren@quietmachines.co"),
            ),
            { bleed: true, background: bgImage("wren-contact-window-light", 0.45) },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Wren Halloran", "h3")),
                            fitW(t("Lisbon, most of the year", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("WRITING", "label")),
                            fitW(t("Essays · The letter · The book", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("FIND ME", "label")),
                            fitW(t("wren@quietmachines.co", "caption")),
                            fitW(t("Mastodon · Read.cv", "caption")),
                        ),
                    ),
                ),
            ),
        ),
    ],
    bgImage("wren-halloran-bg", 0.32),
);

export const coverLetter: ArtifactContent = doc(
    "chalk",
    [
        section(
            "c1",
            group(
                t("COVER LETTER", "label"),
                t("Camille Laurent", "h1"),
                t("Application · Senior Product Designer, Northwind", "caption"),
                t("camille.laurent@hey.com · (415) 555-0142 · Portland, OR · June 2026", "caption"),
            ),
        ),
        section(
            "c2",
            group(
                t("Dear Northwind team,", "subtitle"),
                t(
                    "I recommend your app to people without being asked, which for a money product is almost unheard of. Northwind is the rare financial tool that lowers my pulse instead of raising it. You design for calm in a category that profits from anxiety, and I’ve wanted to work on something like it for a long time. So when I saw the Senior Product Designer role open, I didn’t want to send the usual letter. I wanted to send a real one.",
                    "body",
                ),
            ),
        ),
        section(
            "c3",
            split(
                40,
                img("camille-onboarding-flow", 1.15),
                group(
                    t("What I’d bring", "label"),
                    t("Earning permission before asking for it.", "h2"),
                    t(
                        "At Folio I led the redesign of an onboarding flow that asked first-time users to connect their bank on screen one, and watched most of them leave. We rebuilt it around earning permission slowly: explain, then ask. Activation rose 38% and first-week drop-off was cut nearly in half, without a single dark pattern. It’s the work I’m proudest of, and it’s the kind of work Northwind already values.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "c4",
            group(
                t("Systems", "label"),
                t("Tools that scale past me.", "h3"),
                t(
                    "Good design shouldn’t depend on the designer being in the room. I built and shipped Atlas, Folio’s design system, and grew it from a Figma file into a living library adopted by six product teams. Consistency was the smaller half of it. What the system really bought was speed and trust: designers stopped reinventing the same date picker, and engineers stopped guessing.",
                    "body",
                ),
                stat("−40%", "time from design to shipped after Atlas was adopted"),
            ),
        ),
        section(
            "c5",
            group(
                t("Craft", "label"),
                t("Accessible by default, not as an afterthought.", "h3"),
                t(
                    "Last year I led an accessibility overhaul that brought our core flows to WCAG 2.2 AA, re-thinking contrast, focus order, and screen-reader copy across the product. I also mentored three junior designers through it, because the surest way to keep standards high is to make sure you’re not the only one who can hold them.",
                    "body",
                ),
            ),
        ),
        section(
            "c6",
            quote(
                "Camille is the rare designer who can hold the whole system in her head and still sweat a single label. She raised the bar for the entire team, and made the rest of us want to clear it.",
                "Devin Park · Head of Design, Folio",
            ),
        ),
        section(
            "c7",
            callout(
                "note",
                t(
                    "A few practical notes: I’m based in Portland and happy to relocate or keep to your hours. I’m available from August, and I’d be glad to begin with a short paid design exercise. It’s the fastest honest way for both of us to see how we work together.",
                    "body",
                ),
            ),
        ),
        section(
            "c8",
            group(
                t(
                    "I’ve admired Northwind from the outside for two years; I’d love the chance to make it better from the inside. Thank you for reading this far. I know your time is short, and I’ve tried to be worth it.",
                    "body",
                ),
            ),
        ),
        section(
            "c9",
            group(
                divider(),
                t("Warmly,", "body"),
                t("Camille Laurent", "h3"),
                t("Portfolio: camillelaurent.design · LinkedIn: in/camille-laurent", "caption"),
            ),
        ),
    ],
    bgImage("camille-laurent-paper", 0.28),
);

export const eventInvite: ArtifactContent = web(
    "orchard",
    [
        section(
            "hero",
            col(
                siteNav(
                    "AMARA & THÉO",
                    navLink("The day", "#schedule"),
                    navLink("Travel", "#travel"),
                    navLink("Registry", "https://amaraandtheo.love/registry"),
                    navCta("RSVP", "#rsvp"),
                ),
                t("WITH JOYFUL HEARTS, TOGETHER WITH THEIR FAMILIES", "label"),
                badge("SATURDAY · 12 SEPTEMBER 2026"),
                t("Amara & Théo", "h1"),
                t(
                    "are getting married, and they would be overjoyed for you to be there, under the olive trees, when they say yes.",
                    "subtitle",
                ),
                t("Quinta da Lua · Sintra, Portugal", "caption"),
                button("RSVP by 1 August", "#rsvp"),
            ),
            {
                bleed: true,
                background: bgImage("wedding-hero-olive-grove-dusk", 0.55),
                frame: { aspect: 16 / 7 },
            },
        ),

        section(
            "note",
            col(
                t("A NOTE FROM US", "label"),
                t("Eight years, two cities, and one very good dog later.", "h2"),
                t(
                    "We met in a rained-out queue for a film neither of us ended up seeing, and we have been choosing each other on purpose every day since.",
                    "subtitle",
                ),
                t(
                    "This September we're gathering the people who made us who we are, in a hillside grove above Sintra with the sea somewhere over the trees, to make it official and then to dance about it for as long as the band will let us. There's no part of this day that matters more than having you in it. So please: come early, stay late, wear shoes you can lose.",
                    "body",
                ),
            ),
        ),

        section(
            "us",
            split(
                60,
                col(
                    t("THE TWO OF US", "label"),
                    t("Amara, who plans everything. Théo, who plans nothing.", "h2"),
                    t(
                        "Amara grew up in Lagos and London and reads three books at once; Théo is from Porto, cooks like he's feeding an army, and has never once been on time. Somehow it works. Most weekends you'll find us at the market, arguing happily about which tomatoes to buy and where to put the future couch.",
                        "body",
                    ),
                    t("Yours, Amara & Théo", "caption"),
                ),
                img("wedding-couple-portrait-laughing", 0.84),
            ),
        ),

        section("olive", col(t("Come for the vows. Stay for the figs.", "h2", "center")), {
            background: bgImage("wedding-interlude-olive-branch-sunlight", 0.45),
            bleed: true,
            frame: { aspect: 16 / 5 },
        }),

        section(
            "details",
            row(
                card(
                    img("wedding-detail-ceremony-arch", 1),
                    t("The Ceremony", "h3"),
                    t("4:00 PM · The Olive Terrace · please be seated by 3:45", "caption"),
                ),
                card(
                    img("wedding-detail-dinner-table", 1),
                    t("The Reception", "h3"),
                    t("6:00 PM · The Stone Barn · dinner, toasts & dancing to follow", "caption"),
                ),
                card(
                    img("wedding-detail-dress-code-linen", 1),
                    t("What to Wear", "h3"),
                    t("Garden formal · soft colours · flat-friendly for grass & gravel", "caption"),
                ),
            ),
        ),

        section(
            "schedule",
            col(
                t("THE DAY, HOUR BY HOUR", "label"),
                t("How Saturday will unfold.", "h2"),
                table(
                    "Time,What's happening,Where\n3:30 PM,Arrival & welcome drinks,The Lower Courtyard\n4:00 PM,Ceremony,The Olive Terrace\n4:45 PM,Photos & golden-hour aperitivo,The Garden\n6:00 PM,Dinner & toasts,The Stone Barn\n8:30 PM,First dance & the band,The Barn\n11:00 PM,Late-night snacks & last orders,The Courtyard\n12:00 AM,Sparkler send-off,The Drive",
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),

        section(
            "venue",
            col(
                t("THE PLACE", "label"),
                t("Quinta da Lua", "h2"),
                t(
                    "A working olive farm folded into the green hills above Sintra: terracotta, old stone, and rows of silver trees that go gold at dusk. It's a forty-minute drive from Lisbon and feels a hundred years from anywhere.",
                    "subtitle",
                ),
                button("Open the map", "https://maps.google.com/?q=Sintra+Portugal", {
                    variant: "outline",
                }),
            ),
            { bleed: true, background: bgImage("wedding-venue-quinta-hillside", 0.5) },
        ),

        section(
            "travel",
            col(
                t("GETTING HERE & STAYING OVER", "label"),
                t("Everything you'll want to know.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "How do I get to the quinta?",
                            "Fly into Lisbon (LIS) and drive about forty minutes north. We'll run shuttle vans from central Sintra at 3:00 and 3:20 PM, and they'll take you back down whenever you're ready to go.",
                        ],
                        [
                            "Can I drive and park?",
                            "Yes. There's free parking on the lower drive, and you're welcome to leave the car overnight and collect it the next morning. Taxis reach the gate too, but book the return ahead: signal is thin in the hills.",
                        ],
                        [
                            "Where should I stay?",
                            "We've held a block of rooms at Casa do Vale in Sintra under the code AMARATHEO until 1 August. Sintra's old town is the prettiest base, and Cascais is lovelier still if you want to be near the sea.",
                        ],
                        [
                            "Is there anything the morning after?",
                            "There is. Coffee and pastries at the quinta from ten, and a long, slow brunch in Lisbon for anyone still standing.",
                        ],
                        [
                            "Can we bring the children?",
                            "Please do. We adore them, and there's a quiet room with a sitter from 8 PM so you can stay for the dancing. Just tell us when you reply.",
                        ],
                    ],
                    true,
                ),
            ),
        ),

        section(
            "gallery",
            row(
                col(
                    img("wedding-gallery-olive-rows-light", 0.8),
                    t("The grove at the hour we'll marry.", "caption"),
                ),
                col(
                    img("wedding-gallery-table-figs-candles", 0.8),
                    t("Long tables, figs, and far too many candles.", "caption"),
                ),
                col(
                    img("wedding-gallery-dancing-string-lights", 0.8),
                    t("And then, the part with the dancing.", "caption"),
                ),
            ),
        ),

        section(
            "praise",
            quote(
                "These two make everyone around them feel like the most interesting person in the room. Come September, that room has a sea view.",
                "Lena · maid of honour",
            ),
            { background: bgImage("wedding-praise-candlelit-toast", 0.6), bleed: true },
        ),

        section(
            "rsvp",
            col(
                t("THE ONLY HOMEWORK", "label", "center"),
                t("Let us know you're coming.", "h2", "center"),
                t(
                    "Kindly reply by 1 August so we can save you a seat, a glass, and a place at the long table. Tell us about dietary needs, songs that will get you dancing, and whether you'll need a shuttle.",
                    "subtitle",
                    "center",
                ),
                button("RSVP at amaraandtheo.love", "https://amaraandtheo.love/rsvp", {
                    shape: "pill",
                    size: "lg",
                }),
                t("Replies close 1 August 2026.", "caption", "center"),
            ),
            { background: bgTone("accent"), bleed: true },
        ),

        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Amara & Théo", "h3")),
                            fitW(t("12 September 2026 · Sintra", "caption")),
                            fitW(t("hello@amaraandtheo.love", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("GIFTS", "label")),
                            fitW(t("Your presence is the whole gift.", "caption")),
                            fitW(
                                t(
                                    "If you'd like to do more, we're saving for the Azores.",
                                    "caption",
                                ),
                            ),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("SHARE THE DAY", "label")),
                            fitW(t("Tag your photos #AmaraAndTheo", "caption")),
                            fitW(t("amaraandtheo.love", "caption")),
                        ),
                    ),
                ),
                divider(),
                t(
                    "With love, and with thanks to our parents, Ngozi & Emeka Okonkwo and Inês & Rui Almeida, who started all of this.",
                    "caption",
                    "center",
                ),
            ),
        ),
    ],
    bgImage("wedding-paper-texture-bg", 0.3),
);

export const photoEssay: ArtifactContent = doc(
    "atelier",
    [
        section(
            "s1",
            group(
                t("A PHOTO ESSAY", "label"),
                t("Before the City Wakes", "h1"),
                t(
                    "One hour in Kyoto, between the last streetlight and the first delivery bike, when the old city briefly belongs to no one.",
                    "subtitle",
                ),
                t("Photographs & words by Rei Tanaka · winter, 5:40 AM", "caption"),
            ),
            { background: bgImage("kyoto-dawn-cover-misty-lane", 0.55) },
        ),

        section(
            "s2",
            group(
                t("The opening", "label"),
                t(
                    "I started waking before the city to find out who it is when nobody is watching.",
                    "subtitle",
                ),
                t(
                    "There is a particular hour here, too late to be night and too early to be morning, when Kyoto sets itself down like a held breath. The shutters are still drawn. The lanterns have gone out but the sky hasn't quite caught up. For maybe sixty minutes the streets are returned to the stones, the river, the mist, and the few of us foolish enough to be out in the cold to see it.",
                    "body",
                ),
                t(
                    "These are the pictures I came home with, and the small things I noticed only because there was nothing else to look at.",
                    "body",
                ),
            ),
        ),

        section(
            "s3",
            group(
                img("kyoto-dawn-gion-empty-lane-lanterns", 1.6),
                t(
                    "Gion, 5:48. The teahouse lanterns are dark, the cobbles wet from a rain that came and went while the city slept. Not a single footprint yet. Only mine, and I keep them to the edge.",
                    "caption",
                ),
            ),
        ),

        section(
            "s4",
            split(
                40,
                img("kyoto-dawn-river-heron-mist", 1.05),
                group(
                    t("Kamo River", "label"),
                    t("The first to clock in", "h2"),
                    t(
                        "A grey heron stands in the shallows of the Kamo, perfectly still, the way it has stood every morning for a thousand years of mornings. It is always here before me. It watches the water and not the photographer, which I take, on balance, as a kindness.",
                        "body",
                    ),
                ),
            ),
        ),

        section(
            "s5",
            group(
                img("kyoto-dawn-fushimi-torii-tunnel", 1.6),
                t(
                    "Fushimi Inari before the crowds: ten thousand vermilion gates and not one other soul. The light comes through sideways and turns the whole tunnel the colour of a lit ember.",
                    "caption",
                ),
            ),
        ),

        section(
            "s6",
            split(
                60,
                group(
                    t("Nishiki", "label"),
                    t("The market, half-awake", "h2"),
                    t(
                        "Behind the shutters of the covered market the day is already starting in whispers: a knife on a board, the hiss of a kettle, a radio turned low. A fishmonger hoses down the stones outside his stall and nods at me without surprise, as if everyone is up at this hour and only pretending otherwise.",
                        "body",
                    ),
                    t(
                        "He hands me a cup of tea I didn't ask for. I drink it standing in the cold, grateful past the reach of my Japanese.",
                        "body",
                    ),
                ),
                img("kyoto-dawn-nishiki-shutter-steam", 0.82),
            ),
        ),

        section(
            "s7",
            row(
                group(
                    img("kyoto-dawn-detail-frost-moss", 0.8),
                    t(
                        "Frost holding the edge of the temple moss, an hour from melting.",
                        "caption",
                    ),
                ),
                group(
                    img("kyoto-dawn-detail-bicycle-alley", 0.8),
                    t(
                        "One bicycle, leaning where it was left, keeping the alley company.",
                        "caption",
                    ),
                ),
                group(
                    img("kyoto-dawn-detail-paper-window-glow", 0.8),
                    t(
                        "The first window to glow: someone, somewhere, putting on the rice.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "s8",
            quote(
                "I came to photograph the temples and stayed for the silence between them, which no lens has ever once held still.",
                "From field notes, the third morning",
            ),
            { background: bgImage("kyoto-dawn-bamboo-grove-fog", 0.55) },
        ),

        section(
            "s9",
            split(
                40,
                img("kyoto-dawn-arashiyama-bamboo-path", 1.08),
                group(
                    t("Arashiyama", "label"),
                    t("Among the bamboo", "h2"),
                    t(
                        "The grove makes its own weather. Up there the canes close over the path and the light arrives already filtered, green and underwater. In the wind the whole stand creaks and bows like the timbers of a ship, and you understand why the old poets kept coming back here to listen rather than to look.",
                        "body",
                    ),
                ),
            ),
        ),

        section(
            "s10",
            group(
                img("kyoto-dawn-monk-sweeping-courtyard", 1.6),
                t(
                    "A monk sweeps the courtyard of a temple that won't open for hours, drawing the same lines in the same gravel he drew yesterday. The point, I think, was never to finish.",
                    "caption",
                ),
            ),
        ),

        section(
            "s11",
            split(
                60,
                group(
                    t("Pontocho", "label"),
                    t("The narrowest street", "h2"),
                    t(
                        "Pontocho is barely wide enough for two people to pass and politely apologise. By night it's all neon and noise; by 6 AM it's a corridor of shut doors and drying lanterns, the river breathing at one end of it, and the smell of last night's charcoal still hanging in the damp.",
                        "body",
                    ),
                ),
                img("kyoto-dawn-pontocho-narrow-alley", 0.82),
            ),
        ),

        section(
            "s12",
            group(
                t("The closing", "label"),
                t("And then the bicycles", "h2"),
                t(
                    "It ends the same way each time. A delivery bike turns the corner, a shutter rolls up with a clatter, a phone rings somewhere behind a wall. The spell, which was never really mine to keep, lifts. The city stretches, remembers itself, and takes its streets back. I put the lens cap on and walk home into the noise, already a little homesick for an hour that hasn't even finished leaving.",
                    "body",
                ),
                t("Rei, walking back along the Kamo", "caption"),
            ),
            { background: bgImage("kyoto-dawn-closing-sunrise-rooftops", 0.5) },
        ),
    ],
    bgImage("photoessay-paper-bg", 0.3),
);

// ---- marketing

export const productLaunch: ArtifactContent = web(
    "moss",
    [
        section(
            "hero",
            col(
                siteNav(
                    "AER",
                    menu(
                        "Explore",
                        navLink("The device", "#product"),
                        navLink("See it running", "#demo"),
                        navLink("How it works", "#how"),
                        navLink("Specifications", "#specs"),
                        navLink("What we measured", "#data"),
                        navLink("Support", "https://help.aerone.com"),
                    ),
                    navLink("Pricing", "#pricing"),
                    navCta("Pre-order", "#preorder"),
                ),
                t("Introducing Aer One", "label"),
                t("The air you forgot you were breathing.", "h1"),
                t(
                    "A whisper-quiet purifier that reads your room and clears it in minutes: no app to babysit, no filters you’ll forget to change.",
                    "subtitle",
                ),
                button("Pre-order · $249", "#preorder"),
            ),
            {
                bleed: true,
                background: bgImage("aer-hero-living-room", 0.58),
                frame: { aspect: 16 / 7 },
            },
        ),
        section(
            "problem",
            split(
                60,
                col(
                    t("The problem", "label"),
                    t("Indoor air is the pollution nobody talks about.", "h2"),
                    t(
                        "We spend 90% of our lives indoors, where the air can be up to five times more polluted than the street outside, from cooking smoke and off-gassing furniture to pollen, pet dander, and the fine particles that slip past every cheap filter. Most purifiers either roar like a jet or quietly do nothing at all.",
                        "body",
                    ),
                ),
                img("aer-dust-particles-light", 0.92),
            ),
        ),
        section(
            "proof",
            row(
                stat("99.97%", "of particles down to 0.1 microns captured"),
                stat("12 min", "to clear a 400 sq ft room"),
                stat("21 dB", "quieter than a library at night"),
            ),
            { background: bgImage("aer-clean-air-gradient", 0.5), bleed: true },
        ),
        section(
            "product",
            split(
                40,
                img("aer-device-on-floor", 1.05),
                col(
                    t("Meet Aer One", "label"),
                    t("Engineered to disappear into your home.", "h2"),
                    t(
                        "A single seamless aluminum shell, a fabric crown spun from recycled PET, and a glow ring that fades from amber to white as your air gets cleaner. It’s the first purifier we’ve made that people leave out on purpose.",
                        "body",
                    ),
                    button("Take the tour", "#how", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "demo",
            col(
                t("Two minutes", "label", "center"),
                t("Watch a room clear itself.", "h2", "center"),
                t(
                    "A sealed 400 sq ft kitchen, one seared steak, and a particle counter running the whole time. Nothing is sped up.",
                    "subtitle",
                    "center",
                ),
                video(DEMO_VIDEO, "aer-demo-still-kitchen-evening"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "sensing",
            split(
                60,
                col(
                    t("Intelligence", "label"),
                    badge("ON-DEVICE"),
                    t("It senses, then it acts.", "h2"),
                    t(
                        "Four laser sensors sample the room sixty times a second. When you sear a steak or the pollen count spikes, Aer One spins up before you’d ever notice, then settles back to a hush the moment the air is clear. All of it runs on the device. Nothing leaves your home.",
                        "body",
                    ),
                ),
                img("aer-sensor-closeup", 0.92),
            ),
        ),
        section(
            "how",
            col(
                t("How it works", "label"),
                t("Four stages, one breath.", "h2"),
                t(
                    "Air is pulled in from every direction, stripped of particles and gases, and returned cooler and cleaner than it came, a full pass every ninety seconds.",
                    "body",
                ),
                diagram("process", "Draw in, Pre-filter, HEPA + carbon, Return clean", 240),
            ),
        ),
        section(
            "specs",
            col(
                t("Specifications", "label"),
                t("The numbers, in full.", "h2"),
                table(
                    "Model,Room size,Noise range,Filter life,Weight,Price\nAer One,Up to 400 sq ft,21–48 dB,12 months,4.1 kg,$249\nAer One Plus,Up to 650 sq ft,23–52 dB,18 months,5.6 kg,$329",
                ),
                t(
                    "Both models draw under 6 W on the lowest setting and share the same filter chemistry; the Plus adds a larger fan and a deeper carbon bed.",
                    "caption",
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "features",
            row(
                card(
                    img("aer-filter-cartridge", 1),
                    t("One-click filter", "h3"),
                    t(
                        "A magnetic cartridge swaps in five seconds, and the device tells you the exact day it’s due.",
                        "caption",
                    ),
                ),
                card(
                    img("aer-quiet-bedroom-night", 1),
                    t("Sleep mode", "h3"),
                    t(
                        "The glow ring dims to nothing and the fan drops below a whisper, so it works while you don’t hear it.",
                        "caption",
                    ),
                ),
                card(
                    img("aer-solar-panel-eco", 1),
                    t("Built to last", "h3"),
                    t(
                        "Repairable by design, a five-year warranty, and a shell spun from 100% recycled aluminum.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "reviews",
            split(
                60,
                testimonial(
                    "I stopped waking up congested within a week. I didn’t expect to feel the difference, but the whole house notices when it’s off.",
                    "Dr. Lena Osei",
                    "Pulmonologist · early tester",
                    "https://i.pravatar.cc/240?img=45",
                ),
                col(
                    stat("4.9★", "average across 2,300 beta reviews"),
                    stat("96%", "would replace their old purifier"),
                ),
            ),
            { background: bgImage("aer-soft-home-window", 0.55), bleed: true },
        ),
        section(
            "data",
            split(
                40,
                col(
                    t("What we measured", "label"),
                    t("From hazy to clear in twelve minutes.", "h2"),
                    t(
                        "Particulate count (PM2.5) in a sealed 400 sq ft room after a stovetop sear, sampled every two minutes. Lower is cleaner.",
                        "body",
                    ),
                ),
                chart("line", "182, 168, 121, 74, 41, 18, 9, 4", 240),
            ),
        ),
        section(
            "pricing",
            col(
                t("Pricing", "label"),
                t("Reserve one now, pay the rest at dispatch.", "h2"),
                row(
                    { align: "start" },
                    pricing(
                        "AER ONE",
                        "$249",
                        "Up to 400 sq ft · ships March",
                        [
                            "True HEPA H13 + carbon",
                            "12-month filter included",
                            "Five-year warranty",
                            "60-night trial at home",
                        ],
                        button("Pre-order Aer One", "#preorder"),
                    ),
                    pricing(
                        "AER ONE PLUS",
                        "$329",
                        "Up to 650 sq ft · ships April",
                        [
                            "Everything in Aer One",
                            "Larger fan, deeper carbon bed",
                            "18-month filter included",
                            "Priority dispatch",
                        ],
                        button("Pre-order the Plus", "#preorder", { variant: "outline" }),
                    ),
                ),
                t(
                    "Aer Care is $6 a month and entirely optional: filters arrive the week they’re due and the warranty extends for as long as you keep it.",
                    "caption",
                ),
            ),
        ),
        section(
            "faq",
            col(
                t("Frequently asked", "label"),
                t("The honest answers.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "Is it really HEPA?",
                            "Yes: true HEPA H13, independently certified, not the “HEPA-type” media most cheap purifiers ship with. The test report is linked from every product page.",
                        ],
                        [
                            "How often do filters change?",
                            "Once a year on the Aer One and every eighteen months on the Plus. The device counts real runtime rather than calendar days, so a quiet season buys you longer.",
                        ],
                        [
                            "Do I need the app?",
                            "No. Everything works on the device, and nothing breaks if you never install it. The app only adds history charts and a filter reminder.",
                        ],
                        [
                            "What if I don’t notice a difference?",
                            "Sleep on it for sixty nights. If your air doesn’t feel different, send it back and we refund every cent, return shipping included.",
                        ],
                        [
                            "When does my pre-order ship?",
                            "First units leave in March, in the order they were placed. Your $25 deposit is fully refundable until the day yours is boxed.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "preorder",
            col(
                t("Breathe better, starting now", "label", "center"),
                t("Your first clear breath ships in March.", "h2", "center"),
                t(
                    "Reserve yours today with a fully refundable $25 deposit and lock in launch pricing before it goes up.",
                    "subtitle",
                    "center",
                ),
                button("Pre-order Aer One", "https://aerone.com/preorder", { size: "lg" }),
                t("Free shipping across North America · 2–4 days", "caption", "center"),
            ),
            { background: bgImage("aer-final-cta-sky", 0.55), bleed: true },
        ),
    ],
    bgImage("aer-bg-texture", 0.32),
);

export const landingPage: ArtifactContent = web(
    "press",
    [
        section(
            "hero",
            col(
                siteNav(
                    "NORTHWIND",
                    menu(
                        "Product",
                        navLink("What it does", "#features"),
                        navLink("Live metrics", "#live"),
                        navLink("What teams save", "#why"),
                        navLink("Questions", "#faq"),
                        navLink("Status page", "https://status.northwind.dev"),
                    ),
                    navLink("Pricing", "#pricing"),
                    navLink("Docs", "https://docs.northwind.dev"),
                    navCta("Start free", "#signup"),
                ),
                t("Northwind Analytics", "label"),
                t("Your metrics, finally in one place.", "h1"),
                t(
                    "Connect every tool your team already uses and watch a single, trustworthy dashboard build itself: no SQL, no data team, no waiting on a Monday report.",
                    "subtitle",
                ),
                row(
                    { align: "center" },
                    button("Start free, no card", "#signup"),
                    button("See the pricing", "#pricing", { variant: "outline" }),
                ),
            ),
            {
                bleed: true,
                background: bgImage("northwind-hero-workspace", 0.52),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "shot",
            col(t("One screen, every source", "label"), img("northwind-dashboard-hero", 1.7)),
        ),
        section(
            "logos",
            col(
                t("TRUSTED BY FAST-MOVING TEAMS", "label", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("LUMEN", "h3")),
                    fitW(t("CEDARWORKS", "h3")),
                    fitW(t("HALOWAY", "h3")),
                    fitW(t("NORRØN", "h3")),
                    fitW(t("BELLWEATHER", "h3")),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "numbers",
            row(
                stat("8,400+", "teams shipping with Northwind"),
                stat("42M", "events processed every day"),
                stat("99.99%", "uptime over the last 12 months"),
            ),
        ),
        section(
            "features",
            col(
                t("What it does", "label"),
                t("Three jobs, one afternoon.", "h2"),
                tabs(
                    "Connect, Ask, Share",
                    split(
                        45,
                        img("northwind-connect-sources", 1.35),
                        col(
                            t("Connect in minutes", "h3"),
                            t(
                                "Forty native integrations (Stripe, Postgres, HubSpot, GA4 and the rest) go live the moment you click connect. No warehouse to stand up first, and no engineer on the hook for the pipeline.",
                                "body",
                            ),
                            checks(
                                "40 native sources, OAuth in one click",
                                "Incremental syncs every 60 seconds",
                                "Bring your own warehouse if you have one",
                            ),
                        ),
                    ),
                    split(
                        45,
                        img("northwind-ask-question", 1.35),
                        col(
                            t("Ask in plain English", "h3"),
                            t(
                                "Type “revenue by plan last quarter” and get a chart you can trust, then open the SQL underneath it and edit anything you disagree with. Every answer shows its working.",
                                "body",
                            ),
                            checks(
                                "Generated SQL is always visible and editable",
                                "Saved answers become dashboard tiles",
                                "Definitions live in one shared metric layer",
                            ),
                        ),
                    ),
                    split(
                        45,
                        img("northwind-team-share", 1.35),
                        col(
                            t("Share without friction", "h3"),
                            t(
                                "Dashboards, alerts, and weekly digests land where your team already works: Slack, email, or the TV on the wall. Read access costs nothing, so nobody is stuck screenshotting a number.",
                                "body",
                            ),
                            checks(
                                "Unlimited free viewers on every plan",
                                "Slack and email digests on a schedule",
                                "Public links with an expiry, when you need one",
                            ),
                        ),
                    ),
                ),
            ),
        ),
        section(
            "live",
            split(
                40,
                img("northwind-live-metrics-screen", 1.05),
                col(
                    t("Always current", "label"),
                    badge("REAL-TIME"),
                    t("Numbers that move when your business does.", "h2"),
                    t(
                        "Northwind streams your data instead of batching it overnight, so the figure on the screen is the figure right now. Set a threshold once and we’ll ping you the instant signups dip or churn spikes, long before it shows up in a monthly review.",
                        "body",
                    ),
                    button("See it live", "#signup", { variant: "outline" }),
                ),
            ),
            { background: bgImage("northwind-feature-glow", 0.5), bleed: true },
        ),
        section(
            "why",
            split(
                60,
                col(
                    t("Why teams switch", "label"),
                    t("Less time wrangling, more time deciding.", "h2"),
                    t(
                        "Average hours per week our customers spend building reports, before Northwind and after their first month.",
                        "body",
                    ),
                ),
                chart("column", "11, 9, 4, 2, 1", 240),
            ),
        ),
        section(
            "praise",
            col(
                t("What changed for them", "label"),
                row(
                    testimonial(
                        "We replaced a $90k BI contract and two spreadsheets with Northwind in an afternoon. Our whole company reads the same numbers now.",
                        "Priya Raman",
                        "VP Growth, Cedarworks",
                        "https://i.pravatar.cc/240?img=32",
                    ),
                    testimonial(
                        "I’m not technical, and I built our exec dashboard myself on day one. That has never once been true of an analytics tool.",
                        "Tom Becker",
                        "Founder, Haloway",
                        "https://i.pravatar.cc/240?img=12",
                    ),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "pricing",
            col(
                t("Pricing", "label"),
                t("Start free. Grow when you’re ready.", "h2"),
                t(
                    "Every plan includes unlimited viewers, because a metric nobody can see is not worth collecting. Enterprise adds SAML, a private deployment, and a migration engineer for your first month; annual billing takes two months off any plan.",
                    "body",
                ),
            ),
        ),
        section(
            "tiers",
            row(
                { align: "start" },
                pricing(
                    "FREE",
                    "$0",
                    "For a side project",
                    ["3 data sources", "Unlimited viewers", "7-day history", "Community support"],
                    button("Start free", "#signup", { variant: "outline" }),
                ),
                pricing(
                    "TEAM",
                    "$49",
                    "Per month, for a growing startup",
                    [
                        "15 data sources",
                        "Alerts and Slack digests",
                        "12-month history",
                        "Email support",
                    ],
                    button("Start a trial", "#signup"),
                ),
                pricing(
                    "BUSINESS",
                    "$199",
                    "Per month, for a scaling company",
                    [
                        "Unlimited sources",
                        "SSO and audit log",
                        "Unlimited history",
                        "Named support engineer",
                    ],
                    button("Talk to us", "https://northwind.dev/contact", {
                        variant: "outline",
                    }),
                ),
            ),
        ),
        section(
            "faq",
            col(
                t("Questions, answered", "label"),
                t("Everything before you sign up.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "Is the free plan really free?",
                            "Yes, and permanently: three sources, unlimited viewers, no trial clock and no card. We only charge when you outgrow it.",
                        ],
                        [
                            "How long does setup take?",
                            "Most teams have a live dashboard inside ten minutes. If you’re moving off another tool, our team will rebuild your old reports for free.",
                        ],
                        [
                            "Where does my data live?",
                            "In your region, encrypted in transit and at rest. We’re SOC 2 Type II certified and the report is available under NDA.",
                        ],
                        [
                            "Can I get my data out?",
                            "Any time, in one click: CSV for the tables, SQL for the queries, JSON for the dashboards. Cancelling never locks anything up.",
                        ],
                        [
                            "Do you charge for viewers?",
                            "No. Read access is free on every plan. Charging per seat only teaches a team to screenshot numbers instead of sharing them.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "signup",
            col(
                t("Ten minutes to your first dashboard", "label", "center"),
                t("Start free. Bring the whole team.", "h2", "center"),
                t(
                    "Connect a source, ask one question, and share the answer before your coffee goes cold. No card, no sales call, no data engineer.",
                    "subtitle",
                    "center",
                ),
                fitW(
                    row(
                        { align: "center" },
                        button("Create your free workspace", "https://app.northwind.dev/signup", {
                            size: "lg",
                        }),
                        button("Read the docs", "https://docs.northwind.dev", {
                            variant: "ghost",
                        }),
                    ),
                ),
            ),
            { background: bgTone("contrast"), bleed: true },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Northwind", "h3")),
                        fitW(t("Analytics for teams without a data team.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("PRODUCT", "label")),
                        fitW(t("Integrations · Pricing · Changelog", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("COMPANY", "label")),
                        fitW(t("About · Careers · Security", "caption")),
                        fitW(t("hello@northwind.dev", "caption")),
                    ),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
    ],
    bgImage("northwind-bg-texture", 0.3),
);

export const eventPage: ArtifactContent = web(
    "obsidian",
    [
        section(
            "hero",
            col(
                siteNav(
                    "FREQUENCY 2026",
                    menu(
                        "Programme",
                        navLink("Speakers", "#speakers"),
                        navLink("The agenda", "#agenda"),
                        navLink("The venue", "#venue"),
                        navLink("Good to know", "#faq"),
                        navLink("Last year’s recap", "https://frequency.fest/2025"),
                    ),
                    navLink("Tickets", "#tickets"),
                    navCta("Register", "#register"),
                ),
                t("Frequency 2026 · A design + technology festival", "label"),
                t("Where design meets the machine.", "h1"),
                t(
                    "Three days of talks, workshops, and after-dark sessions on the new craft of building with AI. October 15–17, 2026 · Lx Factory, Lisbon.",
                    "subtitle",
                ),
                row(
                    { align: "center" },
                    button("Register now", "#register"),
                    button("See the lineup", "#speakers", { variant: "outline" }),
                ),
            ),
            {
                bleed: true,
                background: bgImage("frequency-lisbon-stage-lights", 0.58),
                frame: { aspect: 16 / 7 },
            },
        ),
        section(
            "about",
            split(
                60,
                col(
                    t("What is Frequency", "label"),
                    t("The festival for people who make the future feel good to use.", "h2"),
                    t(
                        "Frequency is where 3,000 designers, engineers, and founders gather to figure out what comes next, and how to build it with taste. No keynote theatre, no vendor booths shouting over each other. Just the people quietly shaping the tools everyone else will use in three years, in one beautiful old factory by the river.",
                        "body",
                    ),
                ),
                img("frequency-crowd-warehouse-talk", 0.92),
            ),
        ),
        section(
            "why",
            row(
                card(
                    img("frequency-workshop-hands-on", 1),
                    t("Learn the new craft", "h3"),
                    t(
                        "Forty hands-on workshops on prompt design, agent UX, and shipping AI features people actually trust.",
                        "caption",
                    ),
                ),
                card(
                    img("frequency-hallway-conversation", 1),
                    t("Meet your next collaborators", "h3"),
                    t(
                        "Curated dinners, hallway tracks, and a matchmaking app that puts the right five people in a room together.",
                        "caption",
                    ),
                ),
                card(
                    img("frequency-demo-night-projector", 1),
                    t("See it before everyone else", "h3"),
                    t(
                        "First looks at unreleased tools, live demo nights, and research that won’t be public for another year.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "lineup",
            split(
                40,
                img("frequency-speaker-on-stage-portrait", 1.05),
                col(
                    t("The lineup", "label"),
                    t("Sixty voices worth flying for.", "h2"),
                    t(
                        "Heads of design from the labs defining the field, the engineers behind the tools in your dock, and the independent makers whose side projects became everyone’s daily driver. Every talk is brand-new for Frequency. No recycled conference deck in the building.",
                        "body",
                    ),
                    button("See all speakers", "#speakers", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "speakers",
            col(
                t("Speaking this year", "label"),
                t("Six of the sixty.", "h2"),
                row(
                    fill(
                        profile(
                            "Maya Okonkwo",
                            "Head of Design · Northwind",
                            "https://i.pravatar.cc/240?img=44",
                            "“Interfaces for things that think”",
                        ),
                    ),
                    fill(
                        profile(
                            "Diego Salas",
                            "Creative Technologist · Studio Mono",
                            "https://i.pravatar.cc/240?img=15",
                            "“Motion as a state machine”",
                        ),
                    ),
                    fill(
                        profile(
                            "Aisha Rahman",
                            "Founder · Halcyon Labs",
                            "https://i.pravatar.cc/240?img=47",
                            "“Shipping an agent people trust”",
                        ),
                    ),
                ),
                row(
                    fill(
                        profile(
                            "Ren Takahashi",
                            "Principal Engineer · Cedarworks",
                            "https://i.pravatar.cc/240?img=68",
                            "“Latency is a design material”",
                        ),
                    ),
                    fill(
                        profile(
                            "Nora Vance",
                            "Independent · Vanta",
                            "https://i.pravatar.cc/240?img=26",
                            "“Building quiet software”",
                        ),
                    ),
                    fill(
                        profile(
                            "Kwame Boateng",
                            "Research Lead · Field Day",
                            "https://i.pravatar.cc/240?img=53",
                            "“What users do with the undo button”",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "agenda",
            col(
                t("The agenda", "label"),
                t("Three days, three frequencies.", "h2"),
                table(
                    "Day,Morning,Afternoon,Night\nThu · Foundations,Keynote + craft talks,Hands-on workshops,Opening party on the terrace\nFri · Frontiers,Agent UX deep dives,Research showcase,Live demo night\nSat · Futures,Design fireside chats,Build-your-own labs,Closing set + dinner",
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "flow",
            col(
                t("How a day flows", "label"),
                t("Arrive curious, leave building.", "h2"),
                t(
                    "Every day moves the same way: a big idea in the morning, your hands on the keyboard by lunch, and something real to show by the time the lights come down.",
                    "body",
                ),
                diagram("process", "Big talk, Hands-on lab, Build, Demo + connect", 240),
            ),
        ),
        section(
            "numbers",
            row(
                stat("3,200", "makers in the room last year"),
                stat("96%", "said they’d come back"),
                stat("48", "countries on the badge list"),
            ),
            { background: bgImage("frequency-crowd-from-above-night", 0.55), bleed: true },
        ),
        section(
            "praise",
            row(
                testimonial(
                    "I came with a half-finished prototype and left with three collaborators and a launch date. Frequency is the only conference I expense without asking.",
                    "Priya Raman",
                    "Product Lead, Cedarworks",
                    "https://i.pravatar.cc/240?img=32",
                ),
                testimonial(
                    "It’s the rare event where the hallway is better than the stage, and the stage was incredible.",
                    "Tom Becker",
                    "Founder, Haloway",
                    "https://i.pravatar.cc/240?img=12",
                ),
                testimonial(
                    "Three days without a single slide about digital transformation. I have been to eleven conferences this year and this is the one I would pay for myself.",
                    "Ines Duarte",
                    "Design Lead, Bright Coast",
                    "https://i.pravatar.cc/240?img=20",
                ),
            ),
        ),
        section(
            "tickets",
            col(
                t("Tickets", "label"),
                t("Pick your pass before they’re gone.", "h2"),
                row(
                    { align: "start" },
                    pricing(
                        "DAY PASS",
                        "€220",
                        "One day of talks",
                        [
                            "Any single day",
                            "All stage sessions",
                            "Lunch and all-day coffee",
                            "Access to the courtyard",
                        ],
                        button("Get a day pass", "#register", { variant: "outline" }),
                    ),
                    pricing(
                        "FULL FESTIVAL",
                        "€540",
                        "All three days",
                        [
                            "Every talk, all three days",
                            "Open workshop seating",
                            "Opening party and demo night",
                            "Recordings for a year",
                        ],
                        button("Get the full pass", "#register"),
                    ),
                    pricing(
                        "MAKER PASS",
                        "€780",
                        "All three days, seats reserved",
                        [
                            "Everything in Full Festival",
                            "Guaranteed workshop seats",
                            "Curated dinner on the Friday",
                            "Speaker office hours",
                        ],
                        button("Get a maker pass", "#register", { variant: "outline" }),
                    ),
                ),
                t(
                    "Teams of five or more pay €650 a head on the Maker Pass. Students and independents: write to us and we’ll sort something out.",
                    "caption",
                ),
            ),
        ),
        section(
            "sponsors",
            col(
                t("MADE POSSIBLE BY", "label", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("NORTHWIND", "h3")),
                    fitW(t("HALCYON", "h3")),
                    fitW(t("CEDARWORKS", "h3")),
                    fitW(t("FIELD DAY", "h3")),
                    fitW(t("STUDIO MONO", "h3")),
                ),
                t("Sponsorship packs for 2027 open in January.", "caption", "center"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "venue",
            split(
                60,
                col(
                    t("The venue", "label"),
                    t("A printworks turned playground.", "h2"),
                    t(
                        "Lx Factory is a reclaimed industrial block in Alcântara: exposed brick, river light, and a courtyard built for the conversations that happen between sessions. Lisbon airport is twenty minutes away, and partner hotels are a short tram ride down the hill.",
                        "body",
                    ),
                    button("Hotels and travel", "https://frequency.fest/travel", {
                        variant: "outline",
                    }),
                ),
                img("frequency-lx-factory-courtyard", 1.1),
            ),
        ),
        section(
            "faq",
            col(
                t("Good to know", "label"),
                t("The practical part.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "Is lunch included?",
                            "Yes. Every full-festival pass covers lunch, all-day coffee, and the opening-night party. Day passes include lunch on the day you attend.",
                        ],
                        [
                            "Can I get a refund?",
                            "Full refunds up to thirty days out, and you can transfer your pass to a colleague any time before the doors open.",
                        ],
                        [
                            "I need a visa letter.",
                            "We send an invitation letter within 48 hours of purchase. Reply to your confirmation email with the name exactly as it appears in your passport.",
                        ],
                        [
                            "Are the talks recorded?",
                            "The stage sessions are, and full-festival ticket holders keep access for a year. Workshops are never recorded, so people can be wrong out loud.",
                        ],
                        [
                            "How accessible is the venue?",
                            "Step-free throughout, with a quiet room off the courtyard and live captioning on both stages. Tell us what you need and we will arrange it.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "register",
            col(
                t("Three days that change how you build", "label", "center"),
                t("Lisbon, October 2026. Save your seat.", "h2", "center"),
                t(
                    "Early-bird pricing ends August 1, and Maker Passes sold out in nine days last year. Don’t watch the recap. Be in the room.",
                    "subtitle",
                    "center",
                ),
                button("Get your pass", "https://frequency.fest/tickets", { size: "lg" }),
            ),
            { background: bgImage("frequency-river-sunset-lisbon", 0.55), bleed: true },
        ),
    ],
    bgImage("frequency-bg-grain", 0.32),
);

export const waitlistPage: ArtifactContent = web(
    "noir",
    [
        section(
            "hero",
            col(
                siteNav(
                    "VANTA",
                    navLink("The idea", "#idea"),
                    navLink("First look", "#look"),
                    navLink("Timeline", "#plan"),
                    navCta("Join the waitlist", "#join"),
                ),
                t("Coming this fall", "label"),
                t("Vanta", "h1"),
                t(
                    "The workspace that disappears. One thing at a time, in perfect quiet, built to hold your attention instead of stealing it. We’re opening the first invites soon.",
                    "subtitle",
                ),
                button("Join the waitlist", "#join"),
            ),
            {
                bleed: true,
                background: bgImage("vanta-dark-desk-single-light", 0.62),
                frame: { aspect: 16 / 9 },
            },
        ),
        section(
            "idea",
            split(
                60,
                col(
                    t("The idea", "label"),
                    t("Your tools should get out of the way.", "h2"),
                    t(
                        "Every app you own is fighting for your attention: notifications, tabs, the endless pull to check one more thing. Vanta does the opposite. It shows you the single piece of work in front of you and hides everything else until you’re done. No feeds, no badges, no noise. Just the quiet you forgot work could feel like.",
                        "body",
                    ),
                ),
                img("vanta-minimal-interface-dark", 0.92),
            ),
        ),
        section(
            "look",
            col(
                t("First look", "label"),
                t("This is what nothing-in-your-way looks like.", "h2"),
                img("vanta-app-fullscreen-focus-mode", 1.7),
            ),
        ),
        section(
            "features",
            row(
                card(
                    img("vanta-feature-single-focus", 1),
                    t("One thing at a time", "h3"),
                    t(
                        "Pull a task into focus and the rest of the world dims. When you finish, the next thing rises on its own.",
                        "caption",
                    ),
                ),
                card(
                    img("vanta-feature-on-device", 1),
                    t("Private by design", "h3"),
                    t(
                        "Everything runs on your device. Your notes, your work, your patterns. None of it leaves the machine.",
                        "caption",
                    ),
                ),
                card(
                    img("vanta-feature-quiet-ai", 1),
                    t("A quiet assistant", "h3"),
                    t(
                        "An AI that drafts, summarizes, and clears the busywork, then steps back without asking for a thing.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "deep",
            split(
                40,
                img("vanta-night-mode-typing", 1.05),
                col(
                    t("Built for deep work", "label"),
                    badge("ON-DEVICE"),
                    t("It learns your rhythm, not your data.", "h2"),
                    t(
                        "Vanta notices when you do your best work and protects it: softening the world during your focus hours, surfacing the right task at the right moment, and leaving you completely alone when you’re in flow. All of it happens locally, on hardware you own.",
                        "body",
                    ),
                ),
            ),
            { background: bgImage("vanta-dark-gradient-glow", 0.5), bleed: true },
        ),
        section(
            "numbers",
            row(
                stat("31,400", "people already on the list"),
                stat("74", "countries waiting"),
                stat("Invite-only", "at launch this fall"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "plan",
            col(
                t("The plan", "label"),
                t("Here’s when it lands.", "h2"),
                table(
                    "Phase,When,What\nPrivate beta,August 2026,First 1,000 invites from the waitlist\nOpen beta,October 2026,Invites roll out in weekly batches\nLaunch,December 2026,Public release on macOS + iOS\nNext,Early 2027,Windows and a team workspace",
                ),
            ),
        ),
        section(
            "founders",
            split(
                40,
                img("vanta-founders-studio-portrait", 1.05),
                testimonial(
                    "We built Vanta because we were tired of software that treats your attention as inventory to sell. This is the tool we wanted for ourselves, and the first thing in years that made our own work feel quiet again.",
                    "Eli Brandt & Nora Vance",
                    "Co-founders",
                    "https://i.pravatar.cc/240?img=26",
                ),
            ),
        ),
        section(
            "faq",
            col(
                t("Before you ask", "label"),
                t("Four things people write in about.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "When do I get in?",
                            "Invites go out in order, starting in August. You move up the list every time a friend joins with your link.",
                        ],
                        [
                            "What will it cost?",
                            "There’s a generous free tier, and everyone on the waitlist gets six months of Vanta Pro at launch. No card is needed to hold your place.",
                        ],
                        [
                            "Which platforms?",
                            "macOS and iOS first. Windows and a shared team workspace follow in early 2027.",
                        ],
                        [
                            "Is my work really private?",
                            "Yes. Vanta runs entirely on your device. There’s no cloud account to create, and nothing of yours is ever uploaded or sold.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "join",
            col(
                t("Be first through the door", "label", "center"),
                t("The quiet is almost ready.", "h2", "center"),
                t(
                    "Join 31,000 people waiting for a calmer way to work. We’ll only email you twice before launch: once with your invite, once to say it’s live.",
                    "subtitle",
                    "center",
                ),
                button("Join the waitlist", "https://vanta.app/waitlist", { size: "lg" }),
            ),
            { background: bgImage("vanta-dawn-window-calm", 0.58), bleed: true },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "center" },
                    fitW(t("Vanta", "h3")),
                    fitW(t("hello@vanta.app", "caption")),
                    fitW(t("Changelog · Privacy", "caption")),
                ),
            ),
        ),
    ],
    bgImage("vanta-bg-noir-texture", 0.34),
);

export const agencySite: ArtifactContent = web(
    "carbon",
    [
        section(
            "hero",
            col(
                siteNav(
                    "COUNTERFORM",
                    menu(
                        "Work",
                        navLink("Meridian", "#work"),
                        navLink("Novel Press", "#more-work"),
                        navLink("Client list", "#clients"),
                        navLink("Archive on Read.cv", "https://read.cv/counterform"),
                    ),
                    navLink("Services", "#services"),
                    navLink("Approach", "#approach"),
                    navLink("Team", "#team"),
                    navCta("Start a project", "#contact"),
                ),
                t("Counterform · Brand & digital studio", "label"),
                badge("EST. 2015 · LISBON & NEW YORK"),
                t("We design brands that know how to behave.", "h1"),
                t(
                    "A small studio for ambitious companies. We build identities, products, and the systems that hold them together, so the work still looks like itself on the fortieth screen, not just the first.",
                    "subtitle",
                ),
                row(
                    { align: "center" },
                    button("Start a project", "#contact"),
                    button("See the work", "#work", { variant: "outline" }),
                ),
            ),
            {
                bleed: true,
                frame: { aspect: 16 / 7 },
                background: bgImage("counterform-studio-wall-pinups-mono", 0.58),
            },
        ),
        section(
            "services",
            col(
                t("What we do", "label"),
                t("Three practices, one studio.", "h2"),
                row(
                    { align: "start" },
                    feature(
                        "Brand",
                        "Naming, identity, voice, and the guidelines that keep it all honest as you grow. Usually where a relationship starts.",
                        "01",
                    ),
                    feature(
                        "Digital",
                        "Websites and product interfaces, designed and built by the same people, from the first sketch to shipped code.",
                        "02",
                    ),
                    feature(
                        "Systems",
                        "Design systems, motion, and the components that let your team keep moving after we have left the room.",
                        "03",
                    ),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "work-intro",
            col(
                t("Selected work", "label"),
                t("A few things we’re proud of.", "h2"),
                t(
                    "Eleven years, a hundred-odd launches, and a stubborn belief that the details are the work. A small selection is below. The rest lives in the deck we’ll send once we’ve talked.",
                    "body",
                ),
            ),
        ),
        section(
            "work",
            row(
                card(
                    img("counterform-work-meridian-bank-brand", 1.4),
                    t("Meridian", "h3"),
                    t("Brand & app for a challenger bank · 2025", "caption"),
                ),
                card(
                    img("counterform-work-orchard-grocery-identity", 1.4),
                    t("Orchard", "h3"),
                    t("Identity & packaging for a grocery startup · 2024", "caption"),
                ),
                card(
                    img("counterform-work-atlas-analytics-product", 1.4),
                    t("Atlas", "h3"),
                    t("Product design for an analytics platform · 2024", "caption"),
                ),
            ),
        ),
        section("interlude", col(t("The details are the work.", "h2", "center")), {
            background: bgImage("counterform-detail-press-proof-mono", 0.55),
            bleed: true,
            frame: { aspect: 16 / 5 },
        }),
        section(
            "more-work",
            row(
                card(
                    img("counterform-work-novel-press-rebrand", 1.6),
                    t("Novel Press", "h3"),
                    t("Full rebrand & site for an independent publisher · 2023", "caption"),
                ),
                card(
                    img("counterform-work-tidal-energy-campaign", 1.6),
                    t("Tidal", "h3"),
                    t("Campaign & motion system for a clean-energy launch · 2023", "caption"),
                ),
            ),
        ),
        section(
            "approach",
            col(
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
                        "Most projects run 8–14 weeks. We take on six clients a year, on purpose, so yours is never the one we’re squeezing in.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "clients",
            col(
                t("Clients", "label", "center"),
                t("In good company.", "h2", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("MERIDIAN", "h3")),
                    fitW(t("ORCHARD", "h3")),
                    fitW(t("ATLAS", "h3")),
                    fitW(t("NOVEL PRESS", "h3")),
                    fitW(t("TIDAL", "h3")),
                ),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("HALCYON", "h3")),
                    fitW(t("CEDARWORKS", "h3")),
                    fitW(t("FIELD DAY", "h3")),
                    fitW(t("NORTHWIND", "h3")),
                    fitW(t("MARA HEALTH", "h3")),
                ),
                t(
                    "From two-person seed startups to public companies rebuilding from the logo out. The constant is people who care how the thing actually works.",
                    "caption",
                    "center",
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "numbers",
            row(
                stat("120+", "brands and products shipped"),
                stat("11 yrs", "designing in the open"),
                stat("6", "clients a year, on purpose"),
            ),
            { background: bgImage("counterform-studio-shelves-archive", 0.55), bleed: true },
        ),
        section(
            "quote",
            testimonial(
                "Counterform didn’t hand us a logo and leave. They gave us a way of making decisions. A year on, we still design like they’re in the room.",
                "Dana Okoro",
                "VP Brand, Meridian",
                "https://i.pravatar.cc/240?img=41",
            ),
            { background: bgImage("counterform-meeting-table-warm-light", 0.6), bleed: true },
        ),
        section(
            "team",
            col(
                t("The studio", "label"),
                t("Nine people, no account managers.", "h2"),
                row(
                    fill(
                        profile(
                            "Sofia Marques",
                            "Founder & Creative Director",
                            "https://i.pravatar.cc/240?img=31",
                        ),
                    ),
                    fill(
                        profile(
                            "Ravi Anand",
                            "Design Director",
                            "https://i.pravatar.cc/240?img=59",
                        ),
                    ),
                    fill(
                        profile(
                            "June Park",
                            "Engineering Lead",
                            "https://i.pravatar.cc/240?img=25",
                        ),
                    ),
                    fill(
                        profile(
                            "Tomás Ferreira",
                            "Motion & Systems",
                            "https://i.pravatar.cc/240?img=60",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "contact",
            cta(
                "Tell us what you’re building.",
                "A brand from scratch, a product that has outgrown its first look, or a system to hold a fast-growing team together. We reply to every note within two days.",
                button("hello@counterform.studio", "mailto:hello@counterform.studio", {
                    size: "lg",
                }),
            ),
            { background: bgImage("counterform-studio-window-morning-light", 0.55), bleed: true },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Counterform", "h3")),
                            fitW(t("Brand & digital studio.", "caption")),
                            fitW(t("Lisbon & New York.", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("STUDIO", "label")),
                            fitW(t("Work · Services · About", "caption")),
                            fitW(t("Journal · Careers", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("ELSEWHERE", "label")),
                            fitW(t("Instagram · Dribbble · LinkedIn", "caption")),
                            fitW(t("hello@counterform.studio", "caption")),
                        ),
                    ),
                ),
            ),
        ),
    ],
    bgImage("counterform-paper-texture-mono-bg", 0.3),
);

export const newsletter: ArtifactContent = doc(
    "studio",
    [
        section(
            "s1",
            group(
                t("Common Ground · Issue No. 58", "label"),
                t("Common Ground", "h1"),
                t(
                    "A fortnightly letter on cities, design, and the small things that make a place feel like home.",
                    "subtitle",
                ),
                t("Saturday, June 27, 2026 · edited by Lena Hartmann", "caption"),
            ),
            { background: bgImage("commonground-city-square-morning-light", 0.55) },
        ),
        section(
            "s2",
            group(
                t("From the editor", "label"),
                t("Good morning from the square.", "h2"),
                t(
                    "This issue nearly missed its deadline, because the street outside my window has been closed to cars for three weeks and I keep going down to sit in it. That’s the whole newsletter, really: the strange, immediate joy of a place suddenly built for people instead of through-traffic.",
                    "subtitle",
                ),
                t(
                    "So this fortnight: a street that closed for the summer, a bench worth the detour, the economics of a well-lit evening, and a postcard from Ghent. As always, hit reply. The best half of this letter is the part you write back.",
                    "body",
                ),
            ),
        ),
        section(
            "s3",
            split(
                60,
                group(
                    t("The lead", "label"),
                    t("The street that closed for the summer.", "h2"),
                    t(
                        "In May the city did something quietly radical: it closed Rua das Flores to cars, put down forty planters and a few hundred chairs, and waited to see what would happen. What happened is that the street filled up, not with programming or events, just people doing the ordinary things people do when there’s finally room for them. Children drew on the cobbles. The café tripled its tables. An old man brought a folding chair and a newspaper and held court by the fountain every morning at nine.",
                        "body",
                    ),
                    t(
                        "The merchants, who fought it, now want it made permanent. Foot traffic is up, the bakery sold out by noon three Saturdays running, and the hardware store (the one everyone was sure would suffer) reports its best quarter in a decade. It turns out a street you want to linger on is a street you also want to shop on.",
                        "body",
                    ),
                ),
                group(
                    img("commonground-pedestrian-street-chairs", 0.78, 6),
                    t(
                        "Rua das Flores, three weeks after the cars left. The chairs were the city’s only intervention.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s4",
            split(
                40,
                group(
                    img("commonground-public-bench-waterfront", 1.05, 6),
                    t(
                        "The new benches on the waterfront: backs, armrests, and shade, which is more than most cities manage.",
                        "caption",
                    ),
                ),
                group(
                    t("A bench worth sitting on.", "h3"),
                    t(
                        "It sounds like nothing, but most public benches are designed to be looked at, not used. They are backless, armrest-less, deliberately uncomfortable so no one stays too long. The new ones along the harbour do the radical thing of being comfortable: a real back to lean on, armrests to push up from, and a tree planted to throw shade by August. The test of a city isn’t its monuments. It’s whether an eighty-year-old can find somewhere to rest between the bus and the front door.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            group(
                t("The 8 p.m. economy.", "h3"),
                t(
                    "A surprising line in this month’s council report: streets with warm, human-scale lighting see thirty percent more evening foot traffic than those lit by the usual orange floodlights. Counter-intuitively, they also see less crime. Light that makes a place feel watched-over rather than interrogated turns out to be the cheapest urban safety measure we have. The city is swapping two thousand fixtures this autumn. Watch the corners that used to empty at dusk.",
                    "body",
                ),
            ),
        ),
        section(
            "s6",
            split(
                60,
                group(
                    t("Field notes from Ghent.", "h3"),
                    t(
                        "I spent last weekend in Ghent, which famously banned through-traffic from its medieval centre back in 2017 and has spent the years since being smug about it, deservedly. What strikes you isn’t the absence of cars; it’s the presence of everything else. Deliveries happen by cargo bike before ten. Children ride to school alone. The air, measurably, is cleaner. It is not a museum, either. The centre is loud and ordinary and full of teenagers. The lesson Ghent keeps trying to teach the rest of us: you don’t lose a city by slowing it down. You finally get to keep it.",
                        "body",
                    ),
                ),
                group(
                    img("commonground-ghent-cargo-bike-delivery", 0.78, 6),
                    t(
                        "Morning deliveries in central Ghent. The cargo bike has quietly replaced the delivery van.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s7",
            quote("A street you want to linger on is a street you also want to shop on.", ""),
        ),
        section(
            "s8",
            group(
                t("From the mailbag", "label"),
                t("“Doesn’t pedestrianizing just push the traffic somewhere else?”", "h3"),
                t(
                    "It’s the first question every time, and the honest answer is: less than you’d think. The phenomenon is called traffic evaporation. When you remove road capacity, a measurable share of trips simply stop happening. People combine errands, walk the short ones, or shift the discretionary ones off the peak. Study after study finds that roughly a fifth of the displaced traffic just disappears. Cars, it turns out, are not water. They don’t have to go somewhere.",
                    "body",
                ),
            ),
        ),
        section(
            "s9",
            row(
                stat("21%", "of displaced car trips that simply evaporate"),
                stat("+38%", "weekend foot traffic on Rua das Flores"),
                stat("2,000", "streetlights the city swaps out this autumn"),
            ),
        ),
        section(
            "s10",
            group(
                t("Worth your time", "label"),
                t("Five things I saved this fortnight.", "h2"),
                bullets(
                    "“The Death and Life of Great American Streets”, a long, generous reappraisal of Jane Jacobs at sixty.",
                    "A photo essay on Tokyo’s pocket parks, the smallest of which is the size of a single parking space.",
                    "The council’s own before-and-after data on Rua das Flores (a PDF, but worth the download).",
                    "A short film on Pontevedra, the Spanish town that banned cars and forgot what a traffic jam feels like.",
                    "My friend Cira’s newsletter on trees in cities, which is better than this one and you should read it too.",
                ),
            ),
        ),
        section(
            "s11",
            group(
                divider(),
                t(
                    "That’s the fortnight. I’ll be in the square if you need me, third chair from the fountain, the one with the newspaper. Until the next one, Lena.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s12",
            group(
                divider(),
                t(
                    "Common Ground is written every other Saturday by Lena Hartmann, a writer and former city planner in Lisbon. Forwarded this? Subscribe at commonground.letter. Reply to anything. It all reaches me.",
                    "caption",
                ),
            ),
        ),
    ],
    bgImage("commonground-paper-grain-bg", 0.26),
);

// ---- pitch

export const startupPitch: ArtifactContent = deck(
    "noir",
    [
        section(
            "s1",
            group(
                t("MISE · SEED ROUND 2026", "label"),
                t("Run the kitchen, not the spreadsheet.", "h1"),
                t(
                    "Mise turns every restaurant's POS, invoices, and suppliers into one live system: forecasting prep, automating orders, and clawing back the margin that waste quietly eats.",
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
                    t("01 · The problem", "label"),
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
                "Front of house got Toast, Square, and Resy. The kitchen, where the money is actually made or lost, got nothing.",
                "The Mise thesis",
            ),
            { background: bgImage("mise-chef-pass", 0.6) },
        ),
        section(
            "s4",
            split(
                40,
                img("mise-supplier-truck", 1.1),
                group(
                    t("02 · Why now", "label"),
                    t("The kitchen's data finally left the building.", "h2"),
                    bullets(
                        "Cloud POS (Toast, Square) now expose item-level sales over API: the demand signal didn't exist five years ago",
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
                    t("03 · The product", "label"),
                    t("One screen the whole line actually opens.", "h2"),
                    bullets(
                        "Prep lists that predict tomorrow from last year, the weather, and tonight's reservations",
                        "Orders that draft themselves to par and send with one tap",
                        "Live food cost: by dish, by station, by shift",
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
                t("04 · How it works", "label"),
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
                    t("05 · Traction", "label"),
                    t("Kitchens that don't want to give it back.", "h2"),
                    t(
                        "Live in 38 kitchens across 6 restaurant groups, with $2.1M in food orders run through Mise this quarter. Pilots cut food cost by an average of 310 basis points within 60 days.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "112% net revenue retention: groups add locations faster than we can onboard them.",
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
                t("06 · Business model", "label"),
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
                    t("07 · Why we win", "label"),
                    t("What we are up against, and why it loses.", "h2"),
                    bullets(
                        "Distributor portals (Sysco, US Foods) want you to buy more, not waste less",
                        "Inventory apps count what's already gone; Mise predicts what's next",
                        "We're POS-agnostic: the data layer for the kitchen, not another silo",
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
                    t("08 · The ask", "label"),
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
    "carbon",
    [
        section(
            "f1",
            group(
                t("FLEETWISE · FOR OPERATIONS & MAINTENANCE LEADERS", "label"),
                t("Your trucks make money moving, not in the shop.", "h1"),
                t(
                    "Fleetwise reads the telematics you already pay for and turns it into maintenance you do before the breakdown, cutting unplanned downtime, roadside failures, and the overtime that follows.",
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
                        "Maintenance is still scheduled by odometer and gut. A water pump telematics flagged three weeks ago strands a driver on I-80 at 2am. Now it's a tow, a missed delivery, a hotel, and a tech on overtime. The signal to prevent it was already in the truck.",
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
                        "One health score per truck: green, watch, or ground it",
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
                        "Meridian ran 18% unplanned downtime and a purely reactive shop. Twelve months on Fleetwise, planned maintenance went from 41% to 78% of all work, and roadside failures fell by more than half.",
                        "body",
                    ),
                    callout(
                        "success",
                        t("$1.9M saved in year one, 11× their Fleetwise spend.", "body"),
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
                "Carla Mendez, VP Maintenance, Meridian Freight",
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
                        "Freight rates are soft, labor is tight, and a backordered part can ground a truck for a week. The fleets pulling ahead stopped reacting. Predictive maintenance is now table stakes, and your telematics already carries the signal.",
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
                        "Send us read-only telematics access and we'll bring a free risk assessment of your top 25 vehicles to the next call: no install, no commitment.",
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
    "obsidian",
    [
        section(
            "a1",
            group(
                t("SWITCHBOARD · SERIES A · 2026", "label"),
                t("Never miss the call that pays the bills.", "h1"),
                t(
                    "Switchboard is the AI front desk for home-services businesses, answering every call and text in seconds, booking the job, and keeping the schedule full, around the clock.",
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
                    t("01 · Why now", "label"),
                    t("Voice AI finally crossed the line a caller can't hear.", "h2"),
                    t(
                        "The trades still run on the phone, and owners on a roof or under a sink miss roughly one call in four. Until 2024, an AI that answered was obviously a robot. Today Switchboard books the job, and the customer never knows they weren't talking to the front desk.",
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
                "The Switchboard thesis",
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
                    t("02 · What we've proven", "label"),
                    t("Revenue that compounds with every booked job.", "h2"),
                    t(
                        "Live across 2,400 contractors in 38 states, Switchboard answered 1.9 million calls last quarter and turned a third of them into booked work. Owners don't churn. They add their second location and switch on texting and scheduling on their own.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "132% net revenue retention: accounts grow faster than we can sell to them.",
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
                    t("03 · The product", "label"),
                    t("One front desk that never sleeps.", "h2"),
                    bullets(
                        "Answers every call and text in under two seconds, in English or Spanish",
                        "Books the job straight into the calendar, with address, photos, and the right crew",
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
                    t("04 · The wedge", "label"),
                    t("We land on the call they're already losing.", "h2"),
                    t(
                        "Switchboard starts with after-hours and overflow calls: the clearest ROI in the business and nothing to rip out. Once an owner sees jobs booked while they slept, we expand into texting, scheduling, follow-ups, and payments, until we're the whole front office.",
                        "body",
                    ),
                ),
                img("switchboard-after-hours", 0.82),
            ),
        ),
        section(
            "a8",
            group(
                t("05 · Go-to-market", "label"),
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
                t("06 · Unit economics", "label"),
                t("Payback under three months, and still improving.", "h2"),
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
                    t("07 · The raise", "label"),
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
                        "Q3 · Spanish-first voice and SMS go GA",
                        "Q4 · 5,000 businesses, $12M ARR",
                        "Q2 '27 · Payments & invoicing live",
                        "Q4 '27 · 10,000 businesses, $25M ARR",
                    ),
                ),
            ),
        ),
        section(
            "a12",
            group(
                t("08 · Vision", "label"),
                t("The operating system for the businesses that show up at your door.", "h1"),
                t(
                    "Eight million tradespeople run the physical economy off a phone and a paper calendar. Switchboard starts by answering the call, and ends up running the whole business behind it.",
                    "subtitle",
                ),
            ),
            { background: bgImage("switchboard-vision-truck", 0.5) },
        ),
    ],
    bgImage("switchboard-cover-ambient", 0.35),
);

export const productDemo: ArtifactContent = deck(
    "telegraph",
    [
        section(
            "p1",
            group(
                t("SIFT · PRODUCT TOUR", "label"),
                t("Turn every customer signal into your next release.", "h1"),
                t(
                    "Sift pulls feedback from support tickets, sales calls, reviews, and surveys into one place, then tells your product team what to build next, and exactly who asked for it.",
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
                        "Product managers, support leaders, and founders at growing B2B software companies: anyone who has to decide what's worth building when every customer is asking for something different.",
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
                        "The loudest customer wins, not the most important one",
                        "No way to prove what's actually driving churn or expansion",
                    ),
                    callout(
                        "warn",
                        t(
                            "The average team burns a full day a week just collating feedback, before a single decision gets made.",
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
                        "Connect your tools once: Sift streams in tickets, calls, reviews, and survey replies automatically",
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
                        'Ask in plain English ("what are enterprise accounts frustrated by?") and get the answer with receipts',
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
                        "Filter to any segment: plan, region, ARR band, or lifecycle stage",
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
                "Priya Nair, VP Product, Northwind Software",
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
                    "Connect your first source in under ten minutes. Free for your first 1,000 pieces of feedback, no credit card.",
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
                    "We are a Portland design studio and workshop making contemporary furniture, lighting, and objects: drawn by hand, built by people, and meant to be handed down.",
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
                        "From a single dining table to the seating for a 200-room hotel, every Fernwood piece is designed in-house and made to order in our Southeast Portland workshop. No middlemen, no warehouse of the same chair. Just considered work, built to last.",
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
                        "In 2012, Mara and Elias Fernwood couldn't find a bench that would survive their kids, so they built one. Friends asked for theirs. A decade later, that same joinery holds up every piece we ship, now from a 12,000-square-foot workshop and a team of thirty makers.",
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
                        "Chairs, benches, and sofas with frames that are screwed rather than stapled, and reupholstered rather than replaced.",
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
                    "We work only in FSC-certified hardwoods, water-based finishes, and solid brass hardware. Nothing veneered, nothing disposable. Each joint is cut to fit, each surface sanded through nine grits, and each piece signed by the maker who built it.",
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
                        "Interior designers & architects · a trade program with to-the-trade pricing",
                        "Hospitality · hotels, restaurants, and members' clubs",
                        "Workplace · studios and offices that have outgrown the catalog",
                        "Private clients · heirloom commissions, made to measure",
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
                        "Every commission moves through the same calm process, so you always know where your piece is and who is building it.",
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
                        "Repairable by design · we keep the parts and plans for everything we ship",
                        "Local first · we mill, build, and finish under one Portland roof",
                        "Fair work · a living wage and a real bench for every maker",
                        "Honest materials · solid wood and metal, or we don't use it",
                    ),
                    callout(
                        "success",
                        t(
                            "Carbon-measured since 2021: every piece ships climate-neutral, and our offcuts heat the shop.",
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
    "cement",
    [
        section(
            "g1",
            group(
                t("TIDEPOOL · GO-TO-MARKET PLAN", "label"),
                t("Launching the inventory brain for growing brands.", "h1"),
                t(
                    "Our plan to take Tidepool (demand planning and inventory for multi-channel retail) from private beta to 1,000 paying brands in twelve months.",
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
                        "Once a brand sells across a website, three marketplaces, and a few wholesale accounts, spreadsheets stop working. Stockouts and overstock quietly eat the margin. The tools that solve it are built for the enterprise and priced out of reach. That gap is ours.",
                        "body",
                    ),
                ),
                group(
                    chart("column", "12, 19, 31, 48, 72, 104", 240),
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
                    "For operators at growing multi-channel brands who are tired of guessing, Tidepool is the inventory platform that forecasts demand, flags stockouts before they happen, and tells you exactly what to reorder, without an ERP project or a six-figure contract.",
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
                        "Weeks 1–4 · Finalize Free/Growth packaging and the self-serve onboarding",
                        "Weeks 5–8 · Ship the Shopify app listing and three cornerstone guides",
                        "Weeks 9–12 · Open beta to the waitlist and stand up the operators' community",
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

// ---- proposals

export const projectProposal: ArtifactContent = deck(
    "studio",
    [
        section(
            "cover",
            group(
                t("PROPOSAL · PREPARED FOR ATLAS COFFEE ROASTERS", "label"),
                t("A rebrand worth waking up for.", "h1"),
                t(
                    "Foldwork (a brand & digital studio) on relaunching Atlas as a specialty-coffee name that travels. Prepared for the Atlas leadership team, June 2026.",
                    "subtitle",
                ),
                badge("CONFIDENTIAL · v2"),
            ),
            { background: bgImage("atlas-coffee-cover", 0.55) },
        ),
        section(
            "opportunity",
            split(
                60,
                group(
                    t("01 · The opportunity", "label"),
                    t("Great coffee, hiding behind a tired bag.", "h2"),
                    t(
                        "Atlas has roasted exceptional coffee since 2014 and earned a loyal following across 60 wholesale cafes. But the brand hasn’t kept up with the cup. The packaging reads local-craft-2014, the site converts below category benchmarks, and the look fractures at every touchpoint. Meanwhile specialty-coffee DTC is growing 23% a year, and the shelf has never been more crowded.",
                        "body",
                    ),
                ),
                img("atlas-coffee-bags", 0.82),
            ),
        ),
        section(
            "goals",
            group(
                t("02 · What we heard", "label"),
                t("Where you want to be in twelve months.", "h2"),
                bullets(
                    "Triple direct-to-consumer revenue within twelve months",
                    "Launch a coffee subscription with predictable recurring revenue",
                    "Look like a national brand without losing the neighborhood story",
                    "Win shelf space in regional grocery and specialty retail",
                    "Unify the look across the bag, the web, and the cafe counter",
                ),
            ),
        ),
        section(
            "northstar",
            quote(
                "We don’t want to look bigger. We want to look like the best version of ourselves.",
                "Dana Mercer · Founder, Atlas Coffee Roasters",
            ),
            { background: bgImage("atlas-coffee-pour", 0.6) },
        ),
        section(
            "approach",
            split(
                40,
                img("atlas-roastery-craft", 1.05),
                group(
                    t("03 · Our approach", "label"),
                    t("Strategy first. Then a system, not a logo.", "h2"),
                    bullets(
                        "Roast notes, not buzzwords: language that actually sounds like you",
                        "A flexible identity that scales from one bag to a grocery shelf",
                        "Designed for the shelf and the screen at the same time",
                    ),
                ),
            ),
        ),
        section(
            "deliverables",
            row(
                card(
                    t("Brand Strategy", "h3"),
                    bullets(
                        "Positioning & messaging platform",
                        "Naming & voice guidelines",
                        "Category & competitive audit",
                    ),
                ),
                card(
                    t("Visual Identity", "h3"),
                    bullets(
                        "Logo system & wordmark",
                        "Packaging design across 3 core SKUs",
                        "Type, color & art direction",
                    ),
                ),
                card(
                    t("Digital & Commerce", "h3"),
                    bullets(
                        "Shopify storefront redesign",
                        "Subscription & checkout flow",
                        "Photography & launch asset kit",
                    ),
                ),
            ),
        ),
        section(
            "timeline",
            group(
                t("04 · Timeline", "label"),
                t("Twelve weeks, four milestones.", "h2"),
                diagram("process", "Discovery, Strategy, Identity, Build, Launch", 180),
                bullets(
                    "Weeks 1–2 · Discovery sprint, stakeholder interviews, brand & UX audit",
                    "Weeks 3–6 · Strategy platform and two identity directions",
                    "Weeks 7–11 · Packaging, storefront design and front-end build",
                    "Week 12 · Launch, handover and brand guidelines",
                ),
            ),
        ),
        section(
            "team",
            row(
                group(
                    img("foldwork-team-nora", 1),
                    t("Nora Vance", "h3"),
                    t("Creative Director", "caption"),
                ),
                group(
                    img("foldwork-team-devin", 1),
                    t("Devin Osei", "h3"),
                    t("Brand Strategist", "caption"),
                ),
                group(
                    img("foldwork-team-lina", 1),
                    t("Lina Park", "h3"),
                    t("Design & Web Lead", "caption"),
                ),
            ),
        ),
        section(
            "investment",
            group(
                t("05 · Investment", "label"),
                t("A fixed-scope engagement.", "h2"),
                table(
                    "Phase,Timeline,Investment\nDiscovery & Strategy,2 weeks,$16K\nVisual Identity,4 weeks,$34K\nWebsite & Build,5 weeks,$39K\nLaunch & Handover,1 week,$11K\nTotal,12 weeks,$100K",
                ),
                t(
                    "50% to begin, 50% at launch. Excludes third-party costs (photography talent, licensed fonts, Shopify apps), estimated at $6–9K.",
                    "caption",
                ),
            ),
        ),
        section(
            "why-us",
            split(
                40,
                img("foldwork-studio-work", 0.86),
                group(
                    t("06 · Why Foldwork", "label"),
                    t("We make brands people taste before they read.", "h2"),
                    bullets(
                        "Specialty-only · 14 food & beverage brands launched",
                        "Strategy and design under one roof, one team",
                        "We build what we design: no handoff, no surprises",
                    ),
                    callout(
                        "success",
                        t(
                            "Brands we’ve relaunched have seen an average 184% lift in DTC revenue in their first year.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "track-record",
            row(
                stat("184%", "Avg. first-year DTC lift"),
                stat("14", "F&B brands launched"),
                stat("4.9★", "Average client rating"),
            ),
        ),
        section(
            "next-steps",
            split(
                60,
                group(
                    t("07 · Next steps", "label"),
                    t("Let’s get the first roast on.", "h2"),
                    t(
                        "If this resonates, we’ll schedule a 60-minute kickoff and hold a start date in July. This proposal is valid for 30 days.",
                        "subtitle",
                    ),
                    button("Approve & schedule kickoff"),
                ),
                emptyRegion(),
            ),
            { background: bgImage("atlas-coffee-beans", 0.58) },
        ),
    ],
    bgImage("foldwork-bg", 0.35),
);

export const investorUpdate: ArtifactContent = doc(
    "clay",
    [
        section(
            "cover",
            group(
                t("INVESTOR UPDATE · MAY 2026", "label"),
                t("Cadence", "h1"),
                t(
                    "The billing engine for usage-based software. Another month of compounding, with MRR up 16% to $248K, NRR holding at 124%, and Usage Studio now shipped to every customer.",
                    "subtitle",
                ),
                t("Elena Vossberg · Co-founder & CEO", "caption"),
            ),
            { background: bgImage("cadence-cover", 0.55) },
        ),
        section(
            "tldr",
            callout(
                "success",
                group(
                    t("TL;DR", "label"),
                    bullets(
                        "MRR grew 16% MoM to $248K (≈ $3.0M ARR)",
                        "14 net-new logos (our best month yet) at 1.1% logo churn",
                        "Shipped Usage Studio: real-time metering for every customer",
                        "Runway extended to 21 months on improving gross margin",
                        "The ask: warm intros to Series A leads and a VP Sales",
                    ),
                ),
            ),
        ),
        section(
            "headline",
            row(
                stat("$248K", "MRR · +16% MoM"),
                stat("124%", "Net revenue retention"),
                stat("21 mo", "Cash runway"),
            ),
        ),
        section(
            "growth",
            split(
                60,
                group(
                    t("Growth", "label"),
                    t("Six straight months of compounding.", "h2"),
                    t(
                        "Net revenue retention is doing the heavy lifting: existing customers expanding usage now drives 61% of new MRR. New-logo velocity is the other half, and it accelerated this month off the back of two enterprise wins.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "131, 152, 171, 196, 214, 248", 240),
                    t("MRR, Dec 2025 – May 2026 ($K)", "caption"),
                ),
            ),
        ),
        section(
            "wins",
            group(
                t("Wins this month", "label"),
                t("What went right.", "h2"),
                bullets(
                    "Closed Northloop and Verge, our two largest contracts to date ($3.4K and $2.9K MRR)",
                    "Shipped Usage Studio: live metering, anomaly alerts and revenue forecasting",
                    "Completed SOC 2 Type II, unblocking three enterprise deals in the pipeline",
                    "Hired Sofia Reyes as VP Engineering (ex-Stripe, ex-Plaid)",
                    "Gross margin improved from 71% to 78% after the metering rewrite",
                ),
            ),
        ),
        section(
            "voice",
            quote(
                "Cadence replaced three internal tools and a spreadsheet the whole team was afraid of. We closed the books four days faster.",
                "Marisol Tan · VP Finance, Northloop",
            ),
            { background: bgImage("cadence-dashboard-glow", 0.6) },
        ),
        section(
            "challenges",
            group(
                t("Challenges & lowlights", "label"),
                t("What we’re watching.", "h2"),
                t(
                    "Enterprise sales cycles are stretching: the SOC 2 deals are real but slow, averaging 71 days from first call to signature. We lost one SMB customer (Pinecrest, $2.1K MRR) to an in-house build, our first churn of that size. And a usage spike from two accounts pushed infra costs 22% over plan before we shipped autoscaling caps.",
                    "body",
                ),
                callout(
                    "caution",
                    t(
                        "Senior backend hiring is our critical path. Two offers are out; if both land we’re staffed for the Q3 roadmap. If neither does, Usage Studio v2 slips a month.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "metrics",
            group(
                t("By the numbers", "label"),
                t("Key metrics.", "h2"),
                table(
                    "Metric,April,May,Change\nMRR,$214K,$248K,+16%\nNet new logos,9,14,+5\nLogo churn,1.8%,1.1%,-0.7pt\nNRR,118%,124%,+6pt\nGross margin,71%,78%,+7pt\nCash runway,19 mo,21 mo,+2 mo",
                ),
            ),
        ),
        section(
            "product",
            split(
                40,
                img("cadence-usage-studio", 1.2),
                group(
                    t("Product progress", "label"),
                    t("Usage Studio is live.", "h2"),
                    t(
                        "Customers can now watch metered usage in real time, set anomaly alerts and forecast next-month revenue straight from live consumption. Adoption hit 64% of accounts in three weeks. It’s already the most-opened screen in the product and the top reason cited in deals we won this month.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "ask",
            group(
                t("The ask", "label"),
                t("How you can help.", "h2"),
                bullets(
                    "Intros to Series A leads in fintech infra or usage-based SaaS: we open the round in Q3",
                    "Candidates for VP Sales, taking us from PLG into a sales-led enterprise motion",
                    "Design partners in fintech and dev-tools with metered-billing pain",
                    "Anyone you know wrestling with the limits of Stripe billing",
                ),
                button("elena@cadence.dev"),
            ),
        ),
        section(
            "thanks",
            group(
                t(
                    "Thank you for the intros, the candidates and the patience. Reply to this update anytime; I read and answer every one.",
                    "subtitle",
                ),
                t("Elena Vossberg · Co-founder & CEO, Cadence · May 2026", "caption"),
            ),
            { background: bgImage("cadence-team-closing", 0.6) },
        ),
    ],
    bgImage("cadence-bg", 0.3),
);

export const businessProposal: ArtifactContent = doc(
    "chalk",
    [
        section(
            "cover",
            group(
                t("PROPOSAL · PREPARED FOR BRIGHTLINE MANUFACTURING", "label"),
                t("Power the plant with the roof you already own.", "h1"),
                t(
                    "Cascade Solar & Energy on a 1.4-megawatt rooftop and carport solar system for the Brightline plant in Reno, engineered to cut energy spend 68% and pay for itself in under six years. Prepared for the Brightline leadership team, June 2026.",
                    "subtitle",
                ),
                badge("CONFIDENTIAL · v1.2"),
            ),
            { background: bgImage("brightline-solar-rooftop", 0.55) },
        ),
        section(
            "summary",
            group(
                t("Executive summary", "label"),
                t("A 1.4-megawatt system that pays for itself.", "h2"),
                t(
                    "Brightline spent $1.18M on electricity last year, and exposure to peak-demand charges is climbing. This proposal outlines a turnkey solar and storage system that offsets 68% of that load from day one, locks in your energy cost for 25 years, and qualifies for $1.9M in federal and state incentives. Cascade designs, permits, builds, and monitors the entire system: a single point of accountability from contract to commissioning.",
                    "body",
                ),
                callout(
                    "success",
                    t(
                        "Estimated 25-year net savings of $7.4M, with a 5.8-year payback and a 17% internal rate of return.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "needs",
            split(
                60,
                group(
                    t("01 · Understanding your needs", "label"),
                    t("What we heard from your team.", "h2"),
                    bullets(
                        "Cut a $1.18M annual energy bill that grows 6–8% a year",
                        "Hedge against Nevada peak-demand and time-of-use charges",
                        "Hit the 2030 corporate carbon-neutral commitment",
                        "Keep the line running: zero downtime during installation",
                        "A financing structure that protects working capital",
                    ),
                ),
                img("brightline-plant-floor", 0.82),
            ),
        ),
        section(
            "opportunity",
            split(
                60,
                group(
                    t("02 · The opportunity", "label"),
                    t("Your energy cost is only going one way.", "h2"),
                    t(
                        "Without action, Brightline’s electricity spend climbs to roughly $1.7M a year by 2031 on current rate trajectories. The solar system flips that curve: after year six the marginal cost of your generated power is effectively zero, and the savings compound for two more decades.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "1.18, 1.27, 1.36, 1.47, 1.58, 1.70", 240),
                    t("Projected utility spend without solar, 2026–2031 ($M)", "caption"),
                ),
            ),
        ),
        section(
            "solution",
            split(
                40,
                img("brightline-solar-carport", 1.05),
                group(
                    t("03 · Proposed solution", "label"),
                    t("Rooftop, carport, and storage: one integrated system.", "h2"),
                    bullets(
                        "1.4 MW of high-efficiency panels across 180,000 sq ft of roof",
                        "420 kW solar carport over the north employee lot",
                        "600 kWh battery storage to shave peak-demand charges",
                        "Real-time monitoring with the Cascade Energy dashboard",
                    ),
                ),
            ),
        ),
        section(
            "scope",
            row(
                card(
                    t("Design & Engineering", "h3"),
                    bullets(
                        "Structural & electrical engineering",
                        "Shade & production modeling",
                        "Utility interconnection design",
                    ),
                ),
                card(
                    t("Permitting & Build", "h3"),
                    bullets(
                        "All permits & inspections handled",
                        "Panel, carport & inverter install",
                        "Battery & switchgear integration",
                    ),
                ),
                card(
                    t("Monitor & Maintain", "h3"),
                    bullets(
                        "24/7 production monitoring",
                        "Annual cleaning & inspection",
                        "25-year performance guarantee",
                    ),
                ),
            ),
        ),
        section(
            "timeline",
            group(
                t("04 · Timeline", "label"),
                t("Twenty weeks to switch-on, zero plant downtime.", "h2"),
                diagram("process", "Design, Permit, Install, Commission, Monitor", 180),
                bullets(
                    "Weeks 1–4 · Engineering, production modeling and final design",
                    "Weeks 5–9 · Permitting and utility interconnection approval",
                    "Weeks 10–17 · Rooftop, carport and storage install, staged around your production calendar",
                    "Weeks 18–20 · Commissioning, utility sign-off and dashboard handover",
                ),
            ),
        ),
        section(
            "pricing",
            group(
                t("05 · Pricing & terms", "label"),
                t("A transparent, fixed-price engagement.", "h2"),
                table(
                    "Line item,Detail,Investment\nSolar array (1.4 MW),Panels racking and inverters,$2.34M\nSolar carport (420 kW),Structure and install,$0.61M\nBattery storage (600 kWh),Hardware and integration,$0.48M\nEngineering & permitting,Design permits and interconnect,$0.27M\nGross system cost,,$3.70M\nIncentives (30% ITC + state),Federal and Nevada credits,-$1.90M\nNet investment,After incentives,$1.80M",
                ),
                t(
                    "Financing available: $0-down power purchase agreement at $0.071/kWh, or a cash purchase on the schedule above. 25-year workmanship and production warranty included.",
                    "caption",
                ),
            ),
        ),
        section(
            "why-us",
            row(
                stat("142 MW", "Commercial solar installed"),
                stat("99.4%", "Average system uptime"),
                stat("5.8 yr", "Typical payback period"),
            ),
        ),
        section(
            "reference",
            quote(
                "Cascade ran the whole project around our production schedule. We never lost an hour on the line, and our power bill dropped 71% the first month it switched on.",
                "Renata Pho · Director of Operations, Sierra Foods",
            ),
            { background: bgImage("cascade-install-crew", 0.6) },
        ),
        section(
            "team",
            row(
                group(
                    img("cascade-team-marcus", 1),
                    t("Marcus Bell", "h3"),
                    t("Lead Project Engineer", "caption"),
                ),
                group(
                    img("cascade-team-yuki", 1),
                    t("Yuki Tanaka", "h3"),
                    t("Energy Modeling & Finance", "caption"),
                ),
                group(
                    img("cascade-team-darnell", 1),
                    t("Darnell Cruz", "h3"),
                    t("Construction Manager", "caption"),
                ),
            ),
        ),
        section(
            "accept",
            split(
                60,
                group(
                    t("06 · Acceptance & next steps", "label"),
                    t("Let’s lock in your rate for the next 25 years.", "h2"),
                    t(
                        "To proceed, countersign below and we’ll schedule a site survey within ten business days and hold a Q3 installation slot. This proposal and pricing are valid for 45 days.",
                        "subtitle",
                    ),
                    button("Approve & schedule site survey"),
                ),
                emptyRegion(),
            ),
            { background: bgImage("brightline-solar-sunset", 0.58) },
        ),
    ],
    bgImage("cascade-bg", 0.35),
);

export const boardDeck: ArtifactContent = deck(
    "press",
    [
        section(
            "cover",
            group(
                t("BOARD MEETING · Q2 FY2026", "label"),
                t("Tideline", "h1"),
                t(
                    "Product analytics for teams that ship daily. A strong quarter: ARR up 19% to $6.2M, NRR holding at 121%, and the Signals launch already live in 38% of accounts. Prepared for the board, June 2026.",
                    "subtitle",
                ),
                t("Priya Anand · Co-founder & CEO", "caption"),
            ),
            { background: bgImage("tideline-board-cover", 0.55) },
        ),
        section(
            "agenda",
            group(
                t("Agenda", "label"),
                t("What we’ll cover today.", "h2"),
                bullets(
                    "The quarter at a glance · KPIs vs. plan",
                    "Financials · revenue, burn and runway",
                    "Growth & funnel · pipeline and conversion",
                    "Product & ops · what shipped, what’s next",
                    "Team & hiring · org and key roles",
                    "Risks & mitigations",
                    "Priorities for Q3",
                    "Open discussion",
                ),
            ),
        ),
        section(
            "glance",
            row(
                stat("$6.2M", "ARR · +19% QoQ"),
                stat("121%", "Net revenue retention"),
                stat("16 mo", "Cash runway"),
            ),
        ),
        section(
            "financials-rev",
            split(
                60,
                group(
                    t("01 · Financials", "label"),
                    t("Six quarters of compounding growth.", "h2"),
                    t(
                        "ARR reached $6.2M, up 19% quarter-over-quarter and 7 points ahead of plan. Expansion revenue drove 58% of net-new ARR: existing accounts are growing faster than we’re adding logos, which is exactly the shape we want heading into the Series B.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "2.9, 3.4, 4.0, 4.6, 5.2, 6.2", 240),
                    t("ARR by quarter, Q1 FY25 – Q2 FY26 ($M)", "caption"),
                ),
            ),
        ),
        section(
            "financials-table",
            group(
                t("01 · Financials", "label"),
                t("The numbers vs. plan.", "h2"),
                table(
                    "Metric,Q1,Q2,Plan,vs. Plan\nARR,$5.2M,$6.2M,$5.8M,+7%\nNet new ARR,$0.6M,$1.0M,$0.8M,+25%\nNRR,118%,121%,118%,+3pt\nGross margin,79%,81%,80%,+1pt\nNet burn,$0.34M,$0.31M,$0.38M,better\nCash runway,15 mo,16 mo,13 mo,+3 mo",
                ),
            ),
        ),
        section(
            "funnel",
            split(
                40,
                group(
                    t("02 · Growth & funnel", "label"),
                    t("The funnel is tightening.", "h2"),
                    t(
                        "Top-of-funnel held steady while activation and paid conversion both improved, a product-led motion finally compounding. Sales-assisted deals now close 22% faster after we shipped the in-product trial extension.",
                        "body",
                    ),
                ),
                diagram(
                    "funnel",
                    "12.4K signups, 7.8K activated, 1.9K trials, 540 closed-won",
                    240,
                ),
            ),
        ),
        section(
            "product",
            split(
                40,
                img("tideline-signals-dashboard", 1.2),
                group(
                    t("03 · Product & ops", "label"),
                    t("Signals shipped, and it’s landing.", "h2"),
                    bullets(
                        "Launched Signals: automated anomaly detection on any metric",
                        "Adoption hit 38% of accounts in five weeks",
                        "Cut median dashboard load time from 2.4s to 0.9s",
                        "99.98% platform uptime, best quarter on record",
                    ),
                ),
            ),
        ),
        section(
            "team",
            split(
                60,
                group(
                    t("04 · Team & hiring", "label"),
                    t("Scaling the org behind the growth.", "h2"),
                    t(
                        "We grew from 38 to 49 full-time staff this quarter, weighted toward engineering and customer success. The VP Sales search is in final-round interviews with two strong candidates; we expect an offer out by mid-July.",
                        "body",
                    ),
                ),
                group(chart("column", "38, 41, 44, 49", 240), t("Headcount by quarter", "caption")),
            ),
        ),
        section(
            "voice",
            quote(
                "Tideline is the first analytics tool our PMs actually open every morning. Signals caught a checkout regression before our on-call did.",
                "Theo Marsh · Head of Product, Loop Commerce",
            ),
            { background: bgImage("tideline-customer-team", 0.6) },
        ),
        section(
            "risks",
            row(
                callout(
                    "caution",
                    group(
                        t("Sales leadership gap", "h3"),
                        t(
                            "We’ve run two quarters without a VP Sales, capping enterprise pipeline. Mitigation: two finalists in process, offer expected mid-July; founders are covering the top deals until then.",
                            "body",
                        ),
                    ),
                ),
                callout(
                    "warn",
                    group(
                        t("Revenue concentration", "h3"),
                        t(
                            "Our top 5 accounts are 31% of ARR. Mitigation: a dedicated mid-market motion launches in Q3 to broaden the base and dilute concentration risk.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "priorities",
            row(
                card(
                    t("Close the Series B", "h3"),
                    bullets(
                        "Open the round in August",
                        "Target $18M at a $90M cap",
                        "Two term sheets as the goal",
                    ),
                ),
                card(
                    t("Ship Signals v2", "h3"),
                    bullets(
                        "Custom alert routing",
                        "Slack & PagerDuty integrations",
                        "Forecasting on any metric",
                    ),
                ),
                card(
                    t("Build the sales engine", "h3"),
                    bullets(
                        "Hire VP Sales & two AEs",
                        "Launch the mid-market motion",
                        "Lift NRR toward 125%",
                    ),
                ),
            ),
        ),
        section(
            "discussion",
            group(
                t("05 · Discussion", "label"),
                t("Where we’d value the board’s input.", "h2"),
                bullets(
                    "Series B timing and the target investor list",
                    "The right pace of sales hiring vs. burn",
                    "Whether to accelerate the mid-market motion",
                    "Intros to VP Sales candidates and design partners",
                ),
                button("Open discussion"),
            ),
            { background: bgImage("tideline-board-closing", 0.6) },
        ),
    ],
    bgImage("tideline-bg", 0.3),
);

export const sponsorshipDeck: ArtifactContent = deck(
    "royal",
    [
        section(
            "cover",
            group(
                t("HARBORLIGHT FESTIVAL 2026 · SPONSORSHIP PROSPECTUS", "label"),
                t("Three days on the water. One unforgettable summer.", "h1"),
                t(
                    "Harborlight is Oakhaven’s flagship waterfront festival: three days of live music, regional food, and public art on the working piers. We’re inviting a small circle of partners to help us build the 2026 edition, and to reach the 65,000 people who’ll spend a long weekend with us.",
                    "subtitle",
                ),
                badge("AUG 14–16, 2026 · PIER 9, OAKHAVEN"),
            ),
            { background: bgImage("harborlight-pier-sunset-crowd", 0.55) },
        ),

        section(
            "property",
            split(
                60,
                group(
                    t("THE PROPERTY", "label"),
                    t("A festival the whole region plans its summer around.", "h2"),
                    t(
                        "What started in 2014 as a single-stage block party on Pier 9 has grown into the largest open-air event on the Oakhaven calendar. Four stages, a 40-vendor food market, a juried art walk, and a free family programme run from Friday afternoon to Sunday night, all framed by the harbor and the city skyline behind it.",
                        "body",
                    ),
                    t(
                        "It is independently produced, fiercely local, and sold out three years running. Partners aren’t buying a logo placement. They’re buying a place in the weekend people remember.",
                        "body",
                    ),
                ),
                img("harborlight-main-stage-dusk", 0.82),
            ),
        ),

        section(
            "audience",
            row(
                group(
                    t("OUR AUDIENCE", "label"),
                    stat("65K", "attendees across the three-day weekend"),
                ),
                stat("68%", "aged 21–44, the hard-to-reach experiential spender"),
                stat("$120", "average per-person spend on-site, beyond the ticket"),
            ),
        ),

        section(
            "reach",
            split(
                40,
                group(
                    chart("column", "18, 27, 38, 52, 65", 240),
                    t(
                        "Paid attendance by year, in thousands (2018 → 2025). 2025 sold out in nine days.",
                        "caption",
                    ),
                ),
                group(
                    t("REACH & ENGAGEMENT", "label"),
                    t("The crowd is only half the story.", "h2"),
                    t(
                        "Harborlight lives online long after the last set ends. Our channels and the attendee-generated wave around them turn a single weekend into a months-long conversation that your brand sits inside of.",
                        "body",
                    ),
                    bullets(
                        "4.2M social impressions across the 2025 campaign window",
                        "240K combined followers on Instagram, TikTok & email",
                        "11M earned media impressions from 38 press placements",
                    ),
                ),
            ),
        ),

        section(
            "why",
            group(
                t("WHY PARTNER WITH US", "label"),
                t("A weekend of goodwill you can’t buy in a feed.", "h2"),
                t(
                    "People arrive at Harborlight relaxed, generous, and ready to discover. That’s a context most marketing never gets near. Our partners improve the experience rather than interrupting it: shade and water on a hot pier, the charging lockers that save a night, the ferry that gets everyone home. Sponsorship here reads as hosting, not advertising, and the audience remembers who hosted them.",
                    "body",
                ),
                button("Talk to our partnerships team"),
            ),
            { background: bgImage("harborlight-crowd-golden-hour", 0.6) },
        ),

        section(
            "activations",
            row(
                card(
                    img("harborlight-brand-lounge", 1.4),
                    t("Branded lounges", "h3"),
                    t(
                        "Shaded waterfront decks with seating, charging, and your brand as the host of the calm.",
                        "caption",
                    ),
                ),
                card(
                    img("harborlight-sampling-booth", 1.4),
                    t("Sampling & retail", "h3"),
                    t(
                        "Hand product to 65,000 people in the exact moment they’re open to trying something new.",
                        "caption",
                    ),
                ),
                card(
                    img("harborlight-stage-naming", 1.4),
                    t("Stage & moment naming", "h3"),
                    t(
                        "Put your name on a stage, the sunset set, or the after-dark fireworks over the harbor.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "tiers",
            group(
                t("SPONSORSHIP TIERS", "label"),
                t("Four ways in. One conversation to find your fit.", "h2"),
                table(
                    "Tier,Investment,Availability,Headline benefit\nPresenting,$120K,1 partner,“Harborlight presented by” lockup across all assets\nStage,$60K,4 partners,Naming rights to a named stage + on-stage moments\nMarket,$28K,8 partners,Premium activation footprint in the food & art market\nCommunity,$9K,12 partners,Logo placement, tickets & a sampling table",
                ),
                t(
                    "Every tier is a starting point: we build the activation around your goals, not a fixed menu.",
                    "caption",
                ),
            ),
        ),

        section(
            "benefits",
            split(
                60,
                group(
                    t("WHAT SPONSORS GET", "label"),
                    t("Reach, hospitality, and a story worth telling.", "h2"),
                    bullets(
                        "Logo & brand integration across stages, signage, app and the festival website",
                        "A turnkey on-site activation footprint with power, water and load-in handled",
                        "A VIP hospitality allotment: tickets, the harbor-deck lounge, and artist access",
                        "Inclusion in the paid, owned and earned media campaign reaching 4M+ people",
                        "Full post-event reporting: footfall, dwell time, sampling and social lift",
                    ),
                ),
                group(
                    img("harborlight-vip-deck-evening", 0.78),
                    t(
                        "The harbor-deck hospitality lounge, where partners host clients above the crowd.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "results",
            row(
                group(
                    t("PAST PARTNERS & RESULTS", "label"),
                    stat("3.1M", "branded impressions delivered for our 2025 presenting partner"),
                ),
                stat("42K", "product samples handed out across the weekend"),
                stat("94%", "of 2025 partners renewed or upgraded for 2026"),
            ),
        ),

        section(
            "quote",
            quote(
                "Harborlight is the only sponsorship on our calendar where the audience thanks us for being there. We didn’t buy attention. We earned a weekend of it.",
                "Priya Anand · VP Brand, Northwater Seltzer · Presenting Partner 2024–25",
            ),
            { background: bgImage("harborlight-fireworks-harbor", 0.62) },
        ),

        section(
            "ask",
            split(
                40,
                img("harborlight-aerial-pier-map", 1.05),
                group(
                    t("THE ASK", "label"),
                    t("Let’s build your 2026 weekend.", "h2"),
                    t(
                        "Tiers are confirmed on a first-come basis and the presenting slot moves fast. We hold partner conversations through March and lock the roster by April 1. Send us your goals and we’ll come back with a tailored activation plan and a single, simple agreement.",
                        "body",
                    ),
                    button("partners@harborlightfest.org"),
                ),
            ),
        ),
    ],
    bgImage("harborlight-bg-water-texture", 0.32),
);

export const sow: ArtifactContent = doc(
    "chalk",
    [
        section(
            "cover",
            group(
                t("STATEMENT OF WORK · SOW-2026-014", "label"),
                t("Commerce Replatform & Returns Portal", "h1"),
                t(
                    "Prepared by Anvil & Oak Studio for Wexford Outdoor Co. This Statement of Work defines the scope, deliverables, timeline, and commercial terms for a twelve-week engagement to replatform wexfordoutdoor.com and ship a self-service returns experience.",
                    "subtitle",
                ),
                t(
                    "Effective: July 6, 2026 · Master Services Agreement dated March 2, 2026",
                    "caption",
                ),
            ),
            { background: bgImage("sow-blueprint-desk-laptop", 0.55) },
        ),

        section(
            "overview",
            split(
                60,
                group(
                    t("1 · PROJECT OVERVIEW", "label"),
                    t("Replatform the storefront, and stop returns from leaking revenue.", "h2"),
                    t(
                        "Wexford Outdoor Co. runs a high-traffic Shopify storefront on an aging custom theme that no longer keeps pace with its catalog or its peak-season load. Returns are handled by email and a shared inbox, which costs the support team an estimated 40 hours a week and frustrates customers.",
                        "body",
                    ),
                    t(
                        "Anvil & Oak will rebuild the storefront on a headless architecture and deliver a branded, self-service returns and exchange portal integrated with Wexford’s existing fulfillment and OMS systems.",
                        "body",
                    ),
                ),
                img("sow-storefront-mockups", 0.82),
            ),
        ),

        section(
            "objectives",
            group(
                t("2 · OBJECTIVES", "label"),
                t("What success looks like.", "h2"),
                t(
                    "The engagement is considered successful when the following business outcomes are met within ninety days of launch:",
                    "body",
                ),
                bullets(
                    "Reduce storefront median page load to under 1.5s on 4G, measured by Core Web Vitals",
                    "Cut return-handling support time by 60% through self-service automation",
                    "Increase exchange-over-refund rate to 35%, retaining revenue inside the brand",
                    "Support a 4× traffic spike during the autumn sale with no manual scaling",
                ),
            ),
        ),

        section(
            "at-a-glance",
            row(
                group(
                    t("AT A GLANCE", "label"),
                    stat("12 wks", "engagement, kickoff to production launch"),
                ),
                stat("5", "named deliverables across two workstreams"),
                stat("$186K", "fixed fee, billed against five milestones"),
            ),
        ),

        section(
            "approach",
            split(
                40,
                group(
                    img("sow-team-whiteboard-planning", 1.05),
                    t(
                        "Discovery workshops run on-site in week one to lock scope before any code ships.",
                        "caption",
                    ),
                ),
                group(
                    t("3 · OUR APPROACH", "label"),
                    t("Five phases, weekly demos, no surprises.", "h2"),
                    t(
                        "We work in one-week iterations with a Friday demo and a shared backlog. Each phase ends in a reviewable artifact and a written sign-off, so scope and budget stay visible from day one.",
                        "body",
                    ),
                    diagram("process", "Discovery, Design, Build, QA & UAT, Launch", 180),
                ),
            ),
        ),

        section(
            "scope",
            group(
                t("4 · SCOPE OF WORK", "label"),
                t("In scope.", "h2"),
                t("Anvil & Oak will design, build, and deliver the following:", "body"),
                bullets(
                    "A headless storefront (Next.js) consuming Shopify’s Storefront API, with ISR and edge caching",
                    "Responsive design system covering 18 templates: home, collection, product, cart, and account",
                    "A self-service returns & exchange portal with policy rules, label generation, and status tracking",
                    "Integrations with the existing OMS, ShipStation, and the Klaviyo marketing stack",
                    "Analytics instrumentation, a staging environment, and CI/CD on the client’s Vercel account",
                    "Content migration of the existing catalog, redirects, and SEO metadata",
                ),
            ),
        ),

        section(
            "out-of-scope",
            split(
                60,
                callout(
                    "warn",
                    group(
                        t("5 · OUT OF SCOPE", "label"),
                        t(
                            "To keep the timeline and fee firm, the following are explicitly excluded from this SOW and may be addressed under a separate change order:",
                            "body",
                        ),
                        bullets(
                            "Net-new photography, copywriting, or brand identity work",
                            "Replatforming the ERP, warehouse (WMS), or payment processor",
                            "Native iOS / Android applications",
                            "Ongoing post-launch support beyond the 30-day warranty period",
                            "Third-party app license fees and infrastructure hosting costs",
                        ),
                    ),
                ),
                img("sow-checklist-documents", 0.78),
            ),
        ),

        section(
            "deliverables",
            group(
                t("6 · DELIVERABLES", "label"),
                t("What you receive, and when.", "h2"),
                table(
                    "Deliverable,Description,Format,Due\nD1 · Discovery brief,Technical audit, scope lock & architecture diagram,PDF + Figma,Week 2\nD2 · Design system,Component library & 18 responsive templates,Figma,Week 4\nD3 · Storefront,Production-ready headless build with CI/CD,Git repo + staging,Week 9\nD4 · Returns portal,Self-service returns & exchange flow,Git repo + staging,Week 10\nD5 · Launch package,Cutover plan, runbook & analytics dashboards,PDF + Looker,Week 12",
                ),
            ),
        ),

        section(
            "timeline",
            group(
                t("7 · TIMELINE & MILESTONES", "label"),
                t("A twelve-week path to launch.", "h2"),
                diagram(
                    "process",
                    "Wk 1–2 Discovery, Wk 3–4 Design, Wk 5–9 Build, Wk 10–11 QA & UAT, Wk 12 Launch",
                    200,
                ),
                t(
                    "Milestone acceptance is due within five business days of delivery; absent written objection, a deliverable is deemed accepted.",
                    "caption",
                ),
            ),
        ),

        section(
            "roles",
            group(
                t("8 · ROLES & RESPONSIBILITIES", "label"),
                t("Who owns what.", "h2"),
                table(
                    "Role,Name,Responsibility,Party\nEngagement lead,Dana Okonkwo,Scope, schedule & weekly status,Anvil & Oak\nTech lead,Marcus Vey,Architecture & code review,Anvil & Oak\nProduct designer,Lena Sørensen,Design system & UX,Anvil & Oak\nProduct owner,Tom Bryce,Decisions, approvals & content,Wexford\nIT liaison,Sara Whitlock,System access & integrations,Wexford",
                ),
                t(
                    "Wexford will provide environment access and consolidated feedback within two business days of each request.",
                    "caption",
                ),
            ),
        ),

        section(
            "pricing",
            group(
                t("9 · PRICING & PAYMENT TERMS", "label"),
                t("Fixed fee, billed against milestones.", "h2"),
                table(
                    "Milestone,Trigger,Amount,Payment terms\nM1 · Kickoff,SOW execution,$37,200,Due on signing\nM2 · Design accepted,D2 sign-off,$46,500,Net 15\nM3 · Build complete,D3 sign-off,$55,800,Net 15\nM4 · UAT passed,D4 sign-off,$28,000,Net 15\nM5 · Launch,Production cutover,$18,500,Net 15\nTotal,,$186,000,",
                ),
                t(
                    "Fees are fixed for the scope above. Approved change orders are billed at a blended rate of $215/hour.",
                    "caption",
                ),
            ),
        ),

        section(
            "assumptions",
            group(
                t("10 · ASSUMPTIONS & DEPENDENCIES", "label"),
                t("What this plan relies on.", "h2"),
                callout(
                    "info",
                    t(
                        "The timeline and fee in this SOW assume the conditions below hold. A material change to any of them may trigger a written change order adjusting scope, schedule, or cost.",
                        "body",
                    ),
                ),
                bullets(
                    "Wexford’s Shopify Plus plan and existing API credentials remain available throughout",
                    "Product, pricing, and inventory data are supplied in a clean, agreed export format by Week 2",
                    "A single product owner is empowered to give binding approvals within the agreed SLAs",
                    "Third-party services (ShipStation, Klaviyo, OMS) expose stable, documented APIs",
                ),
            ),
        ),

        section(
            "acceptance",
            group(
                t("11 · ACCEPTANCE", "label"),
                t("Authorization to proceed.", "h2"),
                t(
                    "By signing below, the parties agree to the scope, deliverables, timeline, and commercial terms set out in this Statement of Work, governed by the Master Services Agreement dated March 2, 2026.",
                    "body",
                ),
                table(
                    "Party,Signatory,Title,Date\nAnvil & Oak Studio,Dana Okonkwo,Principal,_______________\nWexford Outdoor Co.,Tom Bryce,VP Digital,_______________",
                ),
                button("Sign & return this SOW"),
            ),
        ),
    ],
    bgImage("sow-bg-grid-paper", 0.3),
);

// ---- reports

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
                        "When we founded Solstice in a garage in 2014, the pitch was simple and a little naïve: a home should make more than it takes. Eleven years later that idea is a business of real scale, and 2025 was the year it stopped being a promise and became a balance sheet.",
                        "subtitle",
                    ),
                    t(
                        "Revenue grew 37% to $548 million. We installed our hundred-thousandth solar roof, shipped our first home battery, and turned tens of thousands of households into a single, dispatchable power plant. We did all of it while bringing operating losses down to their lowest level ever. Doing this well and doing this responsibly are the same project, not competing ones.",
                        "body",
                    ),
                    t(
                        "None of it happened in a straight line. Interest rates made financing harder, two product launches slipped a quarter, and we learned (again) that the hardest part of energy is not the panel on the roof but the permit on the desk. What did not waver was our team and the families who trusted us. This report is, more than anything, an accounting of that trust.",
                        "body",
                    ),
                    t("Naomi Okonkwo, Co-founder & Chief Executive Officer", "caption"),
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
                    "Storage was the breakout story of the year (Solstice One nearly doubled the segment) while software and services grew steadily as more homes came onto recurring plans. Wholesale and financing shrank deliberately as we tightened underwriting in a higher-rate environment.",
                    "body",
                ),
                table(
                    "Segment,FY2024,FY2025,Change\nHome solar,$246M,$318M,+29%\nBattery storage,$78M,$142M,+82%\nSoftware & services,$51M,$64M,+25%\nWholesale & financing,$26M,$24M,−8%\nTotal,$401M,$548M,+37%",
                ),
                chart("column", "318, 142, 64, 24", 260),
                t("FY2025 revenue by segment, $M", "caption"),
            ),
        ),
        section(
            "s7",
            group(
                t("Product & milestones", "label"),
                t("A year of shipping", "h2"),
                t(
                    "We promised investors three things at the start of 2025: a home battery, a rebuilt app, and a way for customers to earn from the grid. By December all three were live, the first time we have landed an entire roadmap in a single year.",
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
                        "Our first home battery: 13.5 kWh, whole-home backup, installed in a single day.",
                        "caption",
                    ),
                ),
                card(
                    img("solstice-app-aurora-dashboard", 1),
                    t("Aurora 3.0", "h3"),
                    t(
                        "A rebuilt app that turns every roof into a dashboard, and every storm into a plan.",
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
                        "Solar is still a job done on a ladder, in the sun, with your hands. In 2025 we grew the team to 1,280 (most of them installers, electricians, and care specialists) and brought our in-house apprenticeship to nine cities, training 210 new electricians from the communities we serve.",
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
                        "Energy from the Solstice network avoided 1.1 million tonnes of CO₂ in 2025, the equivalent of taking 240,000 cars off the road. We recovered and recycled 96% of decommissioned hardware, and the Solstice Community Fund committed $4M to put rooftop solar and storage on 60 schools and clinics in neighborhoods that the energy transition usually reaches last.",
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
                        "Ship Solstice One v2: 30% more capacity at the same price",
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

export const caseStudy: ArtifactContent = doc(
    "gazette",
    [
        section(
            "s1",
            group(
                t("CUSTOMER STORY · MARLOW HOSPITALITY GROUP", "label"),
                t("Scaling hospitality without scaling the chaos", "h1"),
                t(
                    "How a 22-restaurant group cut labor costs 18% and opened six new locations in a year, with one platform running the floor behind the scenes.",
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
                        "Marlow Hospitality Group runs some of the most loved tables on the East Coast, from the original Marlow & Sons bistro in Brooklyn to fast-casual counters in three airports. What ties them together isn't a menu; it's a promise that the service feels the same whether you're in seat 4 or location 22.",
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
                        "An internal review put the bill at roughly $2.1M a year, most of it overtime that forecasting could have prevented, plus a 74% annual turnover rate fed by schedules that landed late and changed often. With six new locations on the calendar, doing nothing was the most expensive option on the table.",
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
                        "Rather than a top-down rollout, Tempo started where the pain was sharpest: the four Boston restaurants. We rebuilt their scheduling around demand forecasts drawn from three years of POS data, then let results, not a mandate, sell the other 18 locations.",
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
                    "Inside a year, the numbers that had been drifting the wrong way reversed, and the six new restaurants opened on schedule, staffed from day one.",
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
                        "The line below is labor as a percentage of sales, month by month across the rollout. As each city came onto Tempo, the cost curve bent, and then held, even through the holiday rush and the six openings.",
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
                "I got my Sundays back, and my GMs got their floors back. Tempo didn't just save us money. It let us open six restaurants without losing the thing that makes Marlow, Marlow.",
                "Daniela Marlow, Chief Operating Officer, Marlow Hospitality Group",
            ),
            { background: bgImage("marlow-chef-plating-closeup", 0.6) },
        ),
        section(
            "s12",
            split(
                60,
                group(
                    t("The takeaway", "label"),
                    t("Managers back on the floor", "h2"),
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

export const researchReport: ArtifactContent = doc(
    "studio",
    [
        section(
            "s1",
            group(
                t("RESEARCH REPORT · THE STATE OF REMOTE WORK 2026", "label"),
                t("Where Work Lives Now", "h1"),
                t(
                    "Six years after the office emptied, the question is no longer whether knowledge work can happen anywhere: it's where it happens best, and what that means for the people, places, and companies caught in between.",
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
                    t("Hybrid won, but nobody agrees what it means.", "h2"),
                    t(
                        "The headline of 2026 is settlement, not revolution. The fully-remote surge has cooled and the return-to-office mandates have plateaued; what's left is a durable, messy middle. Fifty-four percent of knowledge workers now split their week between home and an office, and almost none of them define that split the same way.",
                        "subtitle",
                    ),
                    t(
                        "Across 11,400 respondents we found that flexibility has become the single strongest predictor of retention, outranking pay growth for the first time in the survey's history. But the same flexibility that keeps people is quietly fragmenting how teams collaborate, mentor, and belong. The companies pulling ahead are not the most remote or the most in-person; they are the most deliberate.",
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
                        "Between February and April 2026 the Northwind Institute surveyed 11,400 full-time knowledge workers and conducted 84 structured interviews with people leaders. Respondents span six industries (technology, finance, healthcare, media, professional services, and the public sector) across 38 countries, weighted to reflect each market's knowledge-economy workforce.",
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
                t("Four findings, and one warning", "h2"),
                t(
                    "The numbers this year tell a coherent story: the location debate is over, the calendar debate has just begun. Four findings follow, then the one result that should worry anyone managing early-career staff.",
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
                        "Hybrid is no longer a transitional state on the way back to the office. It is the destination. A majority now work in a blended pattern, while fully-remote roles held steady and fully-in-office work continued its slow decline. The interesting movement is inside hybrid: the median in-office stint fell from 3.0 days to 2.4.",
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
                        "When people come in, they come in to be together. The share of office time spent in scheduled collaboration jumped sharply, while solo desk work (the thing offices were built for) migrated home. The implication for real estate is stark: companies need less square footage but far more of it configured for groups.",
                        "body",
                    ),
                    chart("column", "31, 44, 58, 67", 220),
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
                    "Priya Raghunathan, VP of Engineering, interviewed for this report",
                ),
                t(
                    "Remote-capable employers now draw 41% of new hires from outside their headquarters metro, up from 12% in 2020. Talent is dispersing toward lower-cost cities and toward the lives people actually want, and the firms that embraced distributed hiring report the widest candidate pools and the shortest time-to-fill.",
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
                    "When we hold output, retention, mentorship, and cost up against each other, each working model trades one strength for another. Hybrid leads on retention and balance; fully-remote leads on cost and reach; in-office still leads on early-career mentorship. There is no free lunch, only an honest choice about what a team needs most.",
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
                            "The clearest warning in the data concerns people in their first three years of work. Junior staff in fully-remote roles reported 28% fewer informal coaching moments and were promoted, on average, four months later than in-office peers. Flexibility is a benefit the experienced enjoy and the inexperienced often pay for, unless mentorship is designed in on purpose.",
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
                    "Anchor days, not mandates: coordinate when teams overlap, don't police where they sit",
                    "Make the office a collaboration venue, then size and shape the space for that one job",
                    "Write decisions down by default so presence stops being a prerequisite for influence",
                    "Engineer mentorship explicitly: pair, sponsor, and review on a schedule, not by chance",
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
                    "The office is no longer the workplace; it is one tool among several for doing work together. The organizations that say this out loud, and redesign around it, are quietly building the most resilient, far-reaching, and loyal teams we have measured in six years of this study.",
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

export const marketAnalysis: ArtifactContent = doc(
    "press",
    [
        section(
            "s1",
            group(
                t("MARKET ANALYSIS · 2026 OUTLOOK", "label"),
                t("Charging the Transition", "h1"),
                t(
                    "The plug is the new pump. As electric vehicles cross from early adopters to the mainstream, the race to power them is becoming one of the decade's largest infrastructure build-outs, and one of its most contested markets.",
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
                    "The market splits along charging speed and location. Level 2 AC charging dominates by unit volume (it's what sits in homes and workplaces) but ultra-fast DC is capturing revenue share fastest as highway corridors and fleets electrify. Home charging, long an afterthought, is becoming a managed-energy business in its own right.",
                    "body",
                ),
                table(
                    "Segment,2025 revenue,Share,2025–2032 CAGR\nLevel 2 AC (home),$11.6B,34%,21%\nLevel 2 AC (public/work),$7.2B,21%,18%\nDC fast (50–150kW),$8.1B,24%,26%\nUltra-fast (>150kW),$5.5B,16%,31%\nFleet & depot,$1.8B,5%,29%",
                ),
                chart("column", "11.6, 7.2, 8.1, 5.5, 1.8", 240),
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
                        "An automaker's captive network now opening to other brands: distribution as a moat.",
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
                        "The field is crowded and consolidating at the same time. Differentiation is moving away from hardware (increasingly commoditized) and toward uptime, energy economics, and the driver experience.",
                        "body",
                    ),
                    bullets(
                        "Reliability · guaranteed uptime is becoming the headline SLA buyers pay for",
                        "Energy arbitrage · on-site batteries and smart load management protect margins",
                        "Network density · winning corridors and fleets before rivals plant hardware",
                        "Software & roaming · one app, one payment, every network is the experience play",
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
                    "Five forces are pulling the market forward and changing what a charging site is. The endpoint isn't a parking lot full of plugs. It's a distributed energy asset that happens to charge cars.",
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
                            "Fleet & depot electrification · sticky, high-utilization contracts",
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
                            "Utilization risk · too many stalls chasing too few sessions early",
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
                "Marcus Idowu, Partner, Meridian Research",
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
                        "We expect the market to keep compounding above 20% through 2032, but the easy growth phase is ending. As utilization matures, capital will reward operators with reliable hardware, smart energy stacks, and real network density, and punish those who built for subsidies rather than sessions. Expect consolidation to accelerate from 2027 as the long tail of sub-scale networks is acquired or shut.",
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

export const qbr: ArtifactContent = doc("studio", [
    section(
        "q1",
        group(
            t("TESSERA · QUARTERLY BUSINESS REVIEW", "label"),
            t("Q2 FY2026 in Review", "h1"),
            t(
                "A strong quarter on revenue, a soft one on new logos, and a clear read on what to fix before Q3. The numbers, the wins, the misses, and the four decisions we need from this room.",
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
                    "Q2 was our best revenue quarter ever and our slowest new-logo quarter in a year, at the same time. Existing customers expanded faster than we modeled, carrying net new ARR to 113% of plan. But the top of the funnel cooled: enterprise cycles stretched, the SDR class ramped slowly, and we closed 84 of the 95 new logos we forecast.",
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
                    "Tessera Flow shipped to general availability in May, the largest release of the quarter.",
                    "caption",
                ),
            ),
        ),
    ),

    section(
        "q3",
        row(
            stat("$5.1M", "net new ARR · 113% of plan"),
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
                "Six metrics define the quarter. Four beat or held; two missed. The pattern is consistent: anything driven by our installed base outperformed, and anything driven by new acquisition came in light.",
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
                    "ARR crossed $48.6M, our sixth straight quarter of double-digit sequential growth, driven almost entirely by expansion. The concern sits one layer down: qualified pipeline entering Q3 is 3.2x of target, below our 4.0x guardrail. We are not short on revenue today. We are short on the future quarters' worth of it.",
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
                    "Northwind Bank went live on Tessera in six weeks, a new record for a Tier 1 account.",
                    "caption",
                ),
            ),
            group(
                t("What went right", "label"),
                t("Four wins worth repeating", "h2"),
                bullets(
                    "Closed Northwind Bank at $1.2M ARR, our largest new logo ever and a reference account in financial services.",
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
            "Priya Nandakumar, Chief Revenue Officer",
        ),
        { background: bgImage("tessera-quiet-open-office-evening-warm-light", 0.6) },
    ),

    section(
        "q8",
        group(
            t("What slipped", "label"),
            t("Three things we missed, and why", "h2"),
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
                "Two more slips worth naming plainly: Reverse ETL, promised for May GA, moved to Q3 after a data-residency rework. It cost us at least two competitive evaluations. And CAC payback drifted to 16 months against a 14-month target, a direct consequence of spending into a funnel that converted slower than planned.",
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
                    "Director of Data Platform, Cobalt Health",
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
                "One quarter, five moves. Each maps directly to a gap above, and the plan is to fix what slipped without slowing what's working.",
                "body",
            ),
            bullets(
                "Rebuild pipeline coverage to 4.0x by mid-quarter: protect outbound spend, accelerate the partner-sourced channel.",
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
                "Sponsor the three strategic renewals at board level: intros where you have them.",
                "Sign off on the usage-based pricing change for the mid-market tier, effective August 1.",
            ),
            button("Approve the Q3 plan"),
        ),
    ),

    section(
        "q12",
        t(
            "The business is compounding from the inside out. The work now is to make sure the next twelve months of new customers are as healthy as this quarter's revenue. We have the team, the product, and the plan. We need the four yeses above to run it.",
            "subtitle",
        ),
        { background: bgImage("tessera-city-skyline-sunrise-office-window", 0.55) },
    ),
]);

export const trendsReport: ArtifactContent = doc("studio", [
    section(
        "t1",
        group(
            t("INDUSTRY TRENDS REPORT · 2026", "label"),
            t("The Factory Wakes Up", "h1"),
            t(
                "For thirty years the industrial robot was a caged, single-purpose machine bolted to a floor. In 2026 it is becoming something else: cheaper, sighted, rentable, and increasingly able to share the room with people. This is the year automation stopped being a project and started being a default.",
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
                    "The story of industrial robotics used to be a story about cars, about heavy arms welding chassis in a handful of giant plants. That era hasn't ended, but it has been overtaken. The fastest growth now comes from electronics, logistics, food, and metals, and from companies with under five hundred employees that could never have justified automation a decade ago.",
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
                    "Cobots (robots designed to work safely alongside people without a cage) have moved from novelty to backbone. They install in days rather than months, cost a fraction of traditional cells, and don't require a safety guard or a dedicated operator. In 2020 they were one in twelve new installations; on our forecast they cross one in three by 2027.",
                    "body",
                ),
                t(
                    "What changed is not the robots so much as the buyers. The marginal new customer in 2026 is a mid-sized job shop automating a single repetitive station (palletizing, machine tending, quality inspection) and expecting payback inside a year. Cobots are the only category that meets that bar.",
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
                    "Vision-guided bin picking, the task that AI perception finally solved.",
                    "caption",
                ),
            ),
            group(
                t("Trend 02", "label"),
                t("Perception gets a brain", "h2"),
                t(
                    "The hardest problem in automation was never motion. It was sight. A robot that can only repeat a memorized path is useless the moment a part arrives at the wrong angle. AI-driven vision changed that. Modern perception stacks identify, orient, and grasp jumbled parts from a bin in real time, a task that defeated automation for thirty years.",
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
                    "Robotics-as-a-Service is doing to automation what cloud did to servers. Instead of a six-figure purchase and a multi-year depreciation schedule, manufacturers rent capacity by the month, with hardware, software, maintenance, and uptime guarantees bundled into a single operating-expense line. RaaS contracts signed grew more than tenfold in three years.",
                    "body",
                ),
                t(
                    "The model matters most for exactly the buyers who were previously locked out: smaller manufacturers without capital budgets or in-house robotics teams. It converts a daunting one-time bet into a cancelable subscription, and in doing so widens the market far faster than falling hardware prices alone could.",
                    "body",
                ),
            ),
            group(
                chart("column", "120, 340, 610, 980, 1520", 300),
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
                "For most of the last century automation was framed as a substitute for available labor. In 2026 it is increasingly a response to labor that simply isn't there. An aging workforce, tighter immigration, and a reshoring wave have left factories structurally short-staffed, and robots are filling the dull, dirty, and dangerous roles people no longer take. The political conversation about jobs is, on the factory floor, quietly inverting.",
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
                    "The most hyped category is also the least proven, but in 2026 it stopped being only hype. General-purpose humanoid robots moved from staged demos to paid pilots inside real warehouses and plants, with announced deployments climbing from a handful in 2022 to roughly ninety this year. None are at scale, and the unit economics remain unproven.",
                    "body",
                ),
                t(
                    "Our read is to treat humanoids as a five-year bet, not a 2026 purchase. The near-term value is narrow (moving totes, tending machines, simple loading) and the durability and cost questions are real. But the trajectory is steep enough that no operations leader should let the category go un-watched.",
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
            "The question on the floor is no longer whether to automate a task. It's which financing model and how soon, and that shift is the whole story of 2026.",
            "Lead Analyst, Continuum Automation Practice",
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
                        "If you run operations, the cost of waiting just went up. The combination of cheap cobots, working perception, and rentable capacity means the first automatable station in your plant probably pays back inside a year, and your competitors are doing the math too.",
                        "body",
                    ),
                ),
            ),
            bullets(
                "Start with one station, not a line. Pick a repetitive, single-task bottleneck and prove payback before scaling.",
                "Pilot via RaaS to sidestep the capital case and learn before you commit hardware.",
                "Insist on vision-guided flexibility: fixed automation ages badly as product mix changes.",
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

// keyed by the same ids as @model/workspace's TEMPLATE_INDEX; a missing key is a 404, so the two
// must stay in sync (the index is the client-facing half, this is the body half)
const BODIES: Record<string, ArtifactContent> = {
    "startup-pitch": startupPitch,
    "sales-deck": salesDeck,
    "series-a": seriesA,
    "product-demo": productDemo,
    "company-overview": companyOverview,
    "gtm-plan": gtmPlan,
    "annual-report": annualReport,
    "case-study": caseStudy,
    "research-report": researchReport,
    "market-analysis": marketAnalysis,
    qbr,
    "trends-report": trendsReport,
    "product-launch": productLaunch,
    "landing-page": landingPage,
    "event-page": eventPage,
    "waitlist-page": waitlistPage,
    "agency-site": agencySite,
    newsletter,
    "project-proposal": projectProposal,
    "investor-update": investorUpdate,
    "business-proposal": businessProposal,
    "board-deck": boardDeck,
    "sponsorship-deck": sponsorshipDeck,
    sow,
    resume,
    portfolio,
    "personal-site": personalSite,
    "cover-letter": coverLetter,
    "event-invite": eventInvite,
    "photo-essay": photoEssay,
};

export function templateBody(id: string): ArtifactContent | null {
    return BODIES[id] ?? null;
}

// index + body, the shape the client renders from
export function template(id: string): Template | null {
    const entry = TEMPLATE_INDEX.find((t) => t.id === id);
    const content = templateBody(id);
    return entry && content ? { ...entry, content } : null;
}
