import type { ArtifactContent } from "@model/content";
import { bullets, button, cell, deck, empty, group, img, quote, section, stat, t } from "./build";

export const aria: ArtifactContent = deck("midnight", [
    section("s1", "full", {
        a: cell(
            group(
                t("ARIA", "eyebrow"),
                t("Sound, rediscovered.", "display"),
                t("A music player that learns the way you actually listen — and then gets out of the way.", "lead"),
            ),
        ),
    }),
    section("s2", "split-6040", {
        a: cell(
            group(
                t("The feeling", "eyebrow"),
                t("Your taste, on autopilot", "h2"),
                t("No more endless scrolling for the right track. Aria reads the room — time of day, tempo, who’s around — and just plays the thing.", "body"),
            ),
        ),
        b: cell(img("aria-hero", 0.82)),
    }),
    section("s3", "three-up", {
        a: cell(stat("10M+", "lossless tracks")),
        b: cell(stat("0", "ads, ever")),
        c: cell(stat("∞", "offline playlists")),
    }),
    section("s4", "two-col", {
        a: cell(group(t("Spatial audio", "title"), t("Head-tracked 3D sound on any headphones. The stage, not the speaker.", "body"))),
        b: cell(group(t("Offline-first", "title"), t("Every favorite, cached and instant. The subway is no longer a dead zone.", "body"))),
    }),
    section("s5", "full", {
        a: cell(quote("It’s the first app that feels like it has ears.", "— Lena Ito, music director")),
    }),
    section("s6", "split-4060", {
        a: cell(img("aria-art", 1.0)),
        b: cell(
            group(
                t("Designed in the dark", "eyebrow"),
                t("Built for night listening", "h2"),
                bullets("OLED-true blacks", "Gesture-only controls", "A lock screen worth looking at"),
            ),
        ),
    }),
    section("s7", "split-4060", {
        a: empty,
        b: cell(group(t("Launch", "eyebrow"), t("Free for 90 days.", "h2"), button("Download Aria"))),
    }),
]);
