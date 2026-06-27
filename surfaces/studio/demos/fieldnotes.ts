import type { ArtifactContent } from "@model/content";
import { cell, deck, group, img, quote, section, t } from "./build";

export const fieldnotes: ArtifactContent = deck("candy", [
    section("s1", "split-6040", {
        a: cell(
            group(
                t("FIELD NOTES", "eyebrow"),
                t("Kyoto, in spring", "display"),
                t("Seven days, one notebook, and far too many photographs of the same river.", "lead"),
            ),
        ),
        b: cell(img("fn-hero", 0.85)),
    }),
    section("s2", "full", {
        a: cell(
            group(
                t("Day one", "eyebrow"),
                t("Arrival", "h2"),
                t("The train lets you out into a city that smells like rain and cedar. I walked until my phone died, which is the only honest way to meet a place.", "body"),
            ),
        ),
    }),
    section("s3", "two-col", {
        a: cell(group(img("fn-a", 0.8), t("Philosopher’s Path at 6am — empty, except for the cats.", "caption"))),
        b: cell(group(img("fn-b", 0.8), t("A tea house that has been open for four hundred years.", "caption"))),
    }),
    section("s4", "full", {
        a: cell(quote("Travel doesn’t make you wiser. It just makes the world bigger, which is enough.", "— notebook, day four")),
    }),
    section("s5", "split-4060", {
        a: cell(img("fn-c", 1.05)),
        b: cell(
            group(
                t("Day five", "eyebrow"),
                t("The river again", "h2"),
                t("I found the same bend in the Kamo I’d photographed on day one and sat for an hour. Nothing happened. It was the best hour of the trip.", "body"),
            ),
        ),
    }),
    section("s6", "full", {
        a: cell(
            group(
                t("Going home", "h2"),
                t("You don’t bring a place back with you. You bring back a slightly different person, and a camera roll you’ll never fully edit.", "body"),
                t("— Mara, somewhere over the Pacific", "byline"),
            ),
        ),
    }),
]);
