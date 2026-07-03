import type { ArtifactContent } from "@model/content";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    cell,
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
