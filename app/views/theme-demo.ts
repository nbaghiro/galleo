import type { Section } from "@model/artifact";
import type { Tokens } from "@themes";
import {
    badge,
    bullets,
    button,
    callout,
    card,
    chart,
    code,
    group,
    img,
    quote,
    row,
    section,
    split,
    stat,
    t,
    bgImage,
} from "@model/authoring";

export function themeDemo(tk: Tokens): Section[] {
    return [
        // bg · scrim · on-dark · accent
        section(
            "hero",
            group(
                t("Meridian · Design Studio", "label"),
                t("Craft that carries the brand", "h1"),
                t(
                    "Identities, products, and the systems that keep them coherent as they scale.",
                    "subtitle",
                ),
                button("Start a project"),
            ),
            { background: bgImage("meridian-theme-hero", tk.scrim ?? 0.45) },
        ),

        // ink · soft · muted · display/body fonts · heading weight
        section(
            "intro",
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

        // accent on big figures
        section(
            "stats",
            row(
                stat("120+", "Projects shipped"),
                stat("14 yrs", "In practice"),
                stat("98%", "Client retention"),
            ),
        ),

        // image radius + bullets
        section(
            "approach",
            split(
                60,
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
                img("meridian-theme-work", 0.82),
            ),
        ),

        // surface · line · radius · border · shadow
        section(
            "services",
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
                            t("Interfaces designed and built as one continuous system.", "body"),
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

        // accent tint + display face
        section(
            "proof",
            split(
                60,
                callout(
                    "tip",
                    t("Shipped in week one", "h3"),
                    t(
                        "Real code, real data, real feedback — production from day one, not a slideshow.",
                        "body",
                    ),
                ),
                quote(
                    "Meridian didn't just redesign our app — they left us a system we actually use.",
                    "Dana Osei · VP Product, Northwind",
                ),
            ),
        ),

        // accent-driven chart
        section(
            "impact",
            group(
                t("Impact", "label"),
                t("Outcomes we measure", "h3"),
                chart("bar", "42, 58, 64, 71, 82, 91", 260),
            ),
        ),

        // mono face + line token
        section(
            "system",
            split(
                60,
                group(
                    t("Design tokens", "label"),
                    t("A theme is data", "h3"),
                    t("One token set themes every surface — decks, docs, and sites alike.", "body"),
                ),
                code(
                    "export const theme = {\n  ink:     '#1a1a2e',\n  accent:  '#3b5bdb',\n  radius:  12,\n  display: 'Fraunces',\n}",
                ),
            ),
        ),

        // accent full-bleed surface · on-accent legibility
        section(
            "cta",
            group(
                t("Ready when you are", "h2"),
                t(
                    "Tell us what you're building. We'll tell you how we'd approach it — no pitch deck required.",
                    "subtitle",
                ),
            ),
            { background: { kind: "color", color: tk.accent } },
        ),
    ];
}
