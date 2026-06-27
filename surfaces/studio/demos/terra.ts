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
} from "./build";

export const terra: ArtifactContent = deck(
    "botanic",
    [
        section("s1", "split-6040", {
            a: cell(
                group(
                    t("TERRA", "eyebrow"),
                    t("Grown, not made.", "display"),
                    t(
                        "Everyday objects, designed to return to the earth as cleanly as they left it.",
                        "lead",
                    ),
                ),
            ),
            b: cell(img("terra-hero", 0.9)),
        }),
        section("s2", "full", {
            a: cell(
                group(
                    t("Our promise", "eyebrow"),
                    t("Regenerative by default", "h2"),
                    t(
                        "We don’t offset our way to better. Every material is chosen to give more back than it takes — from the soil it grows in to the bin it ends in.",
                        "body",
                    ),
                ),
            ),
        }),
        section("s3", "three-up", {
            a: cell(stat("100%", "home-compostable")),
            b: cell(stat("-40%", "carbon vs. industry")),
            c: cell(stat("1M", "trees planted")),
        }),
        section("s4", "split-4060", {
            a: cell(img("terra-field", 1.05)),
            b: cell(
                group(
                    t("How", "eyebrow"),
                    t("From field to shelf to soil", "h2"),
                    bullets(
                        "Plant-based, single-material design",
                        "Repair-first, not replace-first",
                        "Take-back on every product",
                    ),
                ),
            ),
        }),
        section("s5", "full", {
            a: cell(
                quote("The most sustainable object is the one you keep.", "— Terra field guide"),
            ),
        }),
        section("s6", "split-4060", {
            a: empty,
            b: cell(
                group(
                    t("Join us", "eyebrow"),
                    t("Start with one good thing.", "h2"),
                    button("Shop the collection"),
                ),
            ),
        }),
    ],
    bgImage("terra-bg", 0.34),
);
