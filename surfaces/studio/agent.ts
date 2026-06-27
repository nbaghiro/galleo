import type { ArtifactContent } from "@model/content";
import {
    bgImage,
    bullets,
    button,
    cell,
    deck,
    empty,
    group,
    img,
    quote,
    section,
    stat,
    t,
} from "./demos/build";

// Local preview generator: turns a prompt into a starter deck deterministically. The real
// outline-first LLM generation arrives with the agent backend; this proves the flow.
export function generateFromPrompt(prompt: string, themeId: string): ArtifactContent {
    const title = (prompt.trim() || "Untitled deck").replace(/[.!?]+$/, "");
    const seed =
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 24) || "deck";
    const cap = title.length > 64 ? `${title.slice(0, 62)}…` : title;

    return deck(
        themeId,
        [
            section("g1", "full", {
                a: cell(
                    group(
                        t("GENERATED", "eyebrow"),
                        t(cap, "display"),
                        t(
                            "A starting point — edit anything, switch the theme, or present it.",
                            "lead",
                        ),
                    ),
                ),
            }),
            section("g2", "split-6040", {
                a: cell(
                    group(
                        t("01 — Overview", "eyebrow"),
                        t("The big idea", "h2"),
                        t(
                            `Replace this with the core of ${title}. Galleo drafted the structure; you bring the substance.`,
                            "body",
                        ),
                    ),
                ),
                b: cell(img(`${seed}-1`, 0.82)),
            }),
            section("g3", "three-up", {
                a: cell(stat("3×", "faster to draft")),
                b: cell(stat("22", "themes to try")),
                c: cell(stat("1", "canonical artifact")),
            }),
            section("g4", "full", {
                a: cell(quote("Generated in seconds. Made yours in minutes.", `— ${title}`)),
            }),
            section("g5", "split-4060", {
                a: cell(img(`${seed}-2`, 1.05)),
                b: cell(
                    group(
                        t("02 — How it works", "eyebrow"),
                        t("Three steps", "h2"),
                        bullets(
                            "Describe it — Galleo drafts the outline",
                            "Drag in elements, edit text inline",
                            "Theme it and present",
                        ),
                    ),
                ),
            }),
            section("g6", "split-4060", {
                a: empty,
                b: cell(
                    group(t("Next", "eyebrow"), t("Make it yours.", "h2"), button("Start editing")),
                ),
            }),
        ],
        bgImage(`${seed}-cover`, 0.4),
    );
}
