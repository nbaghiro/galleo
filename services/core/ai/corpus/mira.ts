import type { ArtifactContent } from "@model/artifact";
import { bgImage, bullets, group, quote, section, social, stat, t } from "@model/authoring";

// DTC beauty ad on the problem → mechanism → ingredient → proof → objection → offer spine. Card copy
// stays near 25 words because completion falls off past that, and every card is a full-bleed photograph:
// an image background resolves dark (compose.ts), so ink flips white and the theme's accent lifts to stay
// legible — the scrim is the only knob, so it goes heavier wherever the copy gets denser.
export const mira: ArtifactContent = social("atelier", [
    section(
        "s1",
        group(
            t("MIRA", "label"),
            t("Your moisturiser isn't the problem.", "h1"),
            t("Swipe →", "caption"),
        ),
        { background: bgImage("mira-serum-hero-marble", 0.5) },
    ),
    section(
        "s2",
        group(
            t("2 / 12", "label"),
            t("It's the 60 seconds after you wash.", "h2"),
            t("Damp skin loses water faster than dry skin.", "body"),
        ),
        { background: bgImage("mira-damp-skin-shoulder", 0.6) },
    ),
    section(
        "s3",
        group(
            t("3 / 12", "label"),
            t("Water leaves faster than you replace it.", "h2"),
            t("Cleanse, wait, apply. By then the barrier is already open.", "body"),
        ),
        { background: bgImage("mira-bathroom-mirror-steam", 0.64) },
    ),
    section(
        "s4",
        group(
            t("4 / 12 · THE FIX", "label"),
            t("So seal it. Don't soak it.", "h1"),
            t("One layer, onto damp skin, before anything else.", "body"),
        ),
        { background: bgImage("mira-serum-drop-hand", 0.56) },
    ),
    section(
        "s5",
        group(
            t("5 / 12 · HOW TO USE", "label"),
            bullets(
                "Cleanse. Don't towel dry.",
                "Two pumps, face and neck.",
                "Wait ten seconds.",
                "Everything else goes on top.",
            ),
        ),
        { background: bgImage("mira-morning-routine-sink", 0.72) },
    ),
    section(
        "s6",
        group(
            t("6 / 12 · WHAT'S IN IT", "label"),
            bullets(
                "Ceramide NP — rebuilds the barrier",
                "Squalane — holds the water in",
                "5% panthenol — calms the red",
                "Glycerin — draws moisture down",
            ),
        ),
        { background: bgImage("mira-ingredients-flatlay", 0.74) },
    ),
    section(
        "s7",
        group(
            t("7 / 12 · THE ONE THAT MATTERS", "label"),
            t("Ceramide NP.", "h1"),
            t("The lipid your skin already makes, and stops making in winter.", "body"),
        ),
        { background: bgImage("mira-ceramide-macro-texture", 0.58) },
    ),
    section(
        "s8",
        group(
            t("8 / 12 · WHAT'S NOT IN IT", "label"),
            bullets(
                "No fragrance, added or natural",
                "No essential oils",
                "No denatured alcohol",
                "No colour",
            ),
        ),
        { background: bgImage("mira-clean-glass-shelf", 0.72) },
    ),
    section(
        "s9",
        group(
            t("9 / 12 · THE TRIAL", "label"),
            stat("94%", "reported less tightness by day 14"),
            stat("2.1×", "barrier recovery vs. cleansing alone"),
            t("112 participants · 8 weeks · independently run", "caption"),
        ),
        { background: bgImage("mira-lab-glass-quiet", 0.72) },
    ),
    section(
        "s10",
        group(
            quote(
                "Four winters of flaking. Two weeks of this and I stopped thinking about my face.",
                "Priya R. · verified purchase",
            ),
        ),
        { background: bgImage("mira-portrait-window-light", 0.62) },
    ),
    section(
        "s11",
        group(
            t("11 / 12", "label"),
            t("It won't fix everything.", "h2"),
            t("Acne, pigmentation, deep lines — see a dermatologist. Mira does one job.", "body"),
        ),
        { background: bgImage("mira-clinic-counter-still", 0.66) },
    ),
    section(
        "s12",
        group(
            t("12 / 12", "label"),
            t("30 days, or your money back.", "h1"),
            t("Barrier Serum, £34 · free shipping over £30", "body"),
            t("Tap to shop →", "caption"),
        ),
        { background: bgImage("mira-serum-bottle-linen", 0.55) },
    ),
]);
