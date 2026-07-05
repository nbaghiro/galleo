import type { Section } from "@model/artifact";
import type { Tokens } from "@themes/theme";
import {
    badge,
    bullets,
    button,
    callout,
    card,
    cell,
    chart,
    code,
    group,
    img,
    quote,
    section,
    stat,
    t,
    bgImage,
} from "@model/authoring";

// A purpose-built demo artifact for the theme editor — real, coherent content authored to touch every
// token role in the contexts a real document uses them: a bg-image hero (bg · scrim · on-dark · accent),
// body copy (ink · soft · muted, display + body fonts, heading weight), stats + a chart (accent), a
// split with an image (radius), a card grid (surface · line · radius · border · shadow), a callout +
// quote (accent tint · display), a code block (mono), and an accent-filled CTA (accent · onAccent). It's
// a function of the live tokens so the scrim slider and the accent recolor the artifact in real time.
export function themeDemo(tk: Tokens): Section[] {
    return [
        // Hero — bg image + the theme's scrim; on-dark contrast; the accent button.
        section(
            "hero",
            "full",
            {
                a: cell(
                    group(
                        t("Meridian · Design Studio", "label"),
                        t("Craft that carries the brand", "h1"),
                        t(
                            "Identities, products, and the systems that keep them coherent as they scale.",
                            "subtitle",
                        ),
                        button("Start a project"),
                    ),
                ),
            },
            { background: bgImage("meridian-theme-hero", tk.scrim ?? 0.45) },
        ),

        // Intro — ink / soft / muted, display + body fonts, heading weight.
        section("intro", "full", {
            a: cell(
                group(
                    t("What we do", "label"),
                    t("One team, end to end", "h2"),
                    t(
                        "From the first sketch to the shipped release, strategy, design, and engineering stay in one conversation — so nothing is lost in translation.",
                        "subtitle",
                    ),
                    t(
                        "Every engagement opens with a week of listening: to your team, your users, and the metrics that actually move. Then we design in the open, ship in small steps, and hand over a system your team can run without us.",
                        "body",
                    ),
                ),
            ),
        }),

        // Stats — the accent on big figures.
        section("stats", "three-up", {
            a: cell(stat("120+", "Projects shipped")),
            b: cell(stat("14 yrs", "In practice")),
            c: cell(stat("98%", "Client retention")),
        }),

        // Split — a two-column layout with an image (radius) beside a bulleted list.
        section("approach", "split-6040", {
            a: cell(
                group(
                    t("Approach", "label"),
                    t("Design that holds up in production", "h3"),
                    t(
                        "We treat the design system as the product. Tokens, not screenshots — so the brand stays consistent across every surface.",
                        "body",
                    ),
                    bullets(
                        "Research & strategy sprints",
                        "Design systems & component libraries",
                        "Prototyping & usability testing",
                        "Front-end implementation",
                    ),
                ),
            ),
            b: cell(img("meridian-theme-work", 0.82)),
        }),

        // Card grid — surface · line · radius · border · shadow, three across.
        section("services", "full", {
            a: cell(
                group(t("Services", "label"), t("Three ways we work", "h3"), {
                    type: "group",
                    data: {
                        columns: 3,
                        children: [
                            card(
                                t("Brand", "h3"),
                                t(
                                    "Identity systems that scale from a favicon to a flagship store.",
                                    "body",
                                ),
                                badge("Strategy"),
                            ),
                            card(
                                t("Product", "h3"),
                                t(
                                    "Interfaces designed and built as one continuous system.",
                                    "body",
                                ),
                                badge("Design + Eng"),
                            ),
                            card(
                                t("Growth", "h3"),
                                t("Experiments, analytics, and the loops that compound.", "body"),
                                badge("Data"),
                            ),
                        ],
                    },
                }),
            ),
        }),

        // Callout + quote — the accent tint and the display face at reading size.
        section("proof", "split-6040", {
            a: cell(
                callout(
                    "tip",
                    t("Shipped in week one", "h3"),
                    t(
                        "Real code, real data, real feedback — production from day one, not a slideshow.",
                        "body",
                    ),
                ),
            ),
            b: cell(
                quote(
                    "Meridian didn't just redesign our app — they left us a system we actually use.",
                    "Dana Osei · VP Product, Northwind",
                ),
            ),
        }),

        // Data — the accent driving a chart.
        section("impact", "full", {
            a: cell(
                group(
                    t("Impact", "label"),
                    t("Outcomes we measure", "h3"),
                    chart("bar", "42, 58, 64, 71, 82, 91", 260),
                ),
            ),
        }),

        // Code — the mono face and the line token in a technical context.
        section("system", "split-6040", {
            a: cell(
                group(
                    t("Design tokens", "label"),
                    t("A theme is data", "h3"),
                    t("One token set themes every surface — decks, docs, and sites alike.", "body"),
                ),
            ),
            b: cell(
                code(
                    "export const theme = {\n  ink:     '#1a1a2e',\n  accent:  '#3b5bdb',\n  radius:  12,\n  display: 'Fraunces',\n}",
                ),
            ),
        }),

        // CTA — the accent as a full-bleed surface, testing on-accent legibility.
        section(
            "cta",
            "full",
            {
                a: cell(
                    group(
                        t("Ready when you are", "h2"),
                        t(
                            "Tell us what you're building. We'll tell you how we'd approach it — no pitch deck required.",
                            "subtitle",
                        ),
                    ),
                ),
            },
            { background: { kind: "color", color: tk.accent } },
        ),
    ];
}
