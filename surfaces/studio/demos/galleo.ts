import type { ArtifactContent } from "@model/content";
import { bgImage, bullets, button, cell, deck, empty, group, img, quote, section, stat, t } from "./build";

export const galleo: ArtifactContent = deck("studio", [
    section(
        "s1",
        "full",
        {
            a: cell(
                group(
                    t("GALLEO", "eyebrow"),
                    t("The editor for people who care how it looks.", "display"),
                    t("One canonical artifact. Deck, doc, and site are just views of it — generated fast, then made genuinely good.", "lead"),
                ),
            ),
        },
        { bleed: true, background: bgImage("galleo-cover", 0.55) },
    ),
    section("s2", "split-6040", {
        a: cell(
            group(
                t("01 — The problem", "eyebrow"),
                t("Everyone can generate. Almost no one can make it good.", "h2"),
                t("AI made a first draft free. It also made the average deck worse — same templates, same stock, same slop. The bottleneck moved from making to judging.", "body"),
            ),
        ),
        b: cell(img("galleo-problem", 0.82)),
    }),
    section("s3", "full", {
        a: cell(quote("Speed made everyone a publisher. Taste is the only moat left.", "— the Galleo thesis")),
    }),
    section("s4", "three-up", {
        a: cell(stat("30s", "prompt → first draft")),
        b: cell(stat("22", "built-in themes")),
        c: cell(stat("4-in-1", "deck · doc · site · social")),
    }),
    section("s5", "split-4060", {
        a: cell(img("galleo-product", 1.1)),
        b: cell(
            group(
                t("02 — Product", "eyebrow"),
                t("One editor. Every format.", "h2"),
                bullets("Blocks, not slides — variable-height sections", "Themes that aren’t slop", "An agent with actual taste"),
            ),
        ),
    }),
    section("s6", "split-6040", {
        a: cell(
            group(
                t("03 — How it works", "eyebrow"),
                t("Outline first. Polish forever.", "h2"),
                bullets("Describe it — Galleo drafts the outline", "Drag elements into any section", "Switch theme or format in one click"),
            ),
        ),
        b: cell(img("galleo-how", 0.82)),
    }),
    section("s7", "two-col", {
        a: cell(group(t("Deck", "title"), t("Present full-screen. Sections paginate to slides automatically.", "body"))),
        b: cell(group(t("Doc & Web", "title"), t("The same blocks reflow into a scrollable document or a publishable page.", "body"))),
    }),
    section("s8", "full", {
        a: cell(
            group(
                t("04 — Traction", "eyebrow"),
                t("Built by people who ship.", "h2"),
                t("Private alpha with 40 design-led teams. 1,200 artifacts created. 70% weekly retention among activated users.", "body"),
            ),
        ),
    }),
    section("s9", "split-4060", {
        a: empty,
        b: cell(group(t("05 — The ask", "eyebrow"), t("Raising a $3M seed to build it.", "h2"), button("hello@galleo.app"))),
    }),
]);
