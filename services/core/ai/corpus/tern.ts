import type { ArtifactContent } from "@model/artifact";
import { bgImage, bullets, group, quote, section, social, stat, t } from "@model/authoring";

// Allbirds-shape product drop: the hook asks a materials question and the middle cards answer it one
// component at a time, which is the structure that lets a materials story carry twelve cards without
// repeating itself. The photograph is the card, not an element inside it.
export const tern: ArtifactContent = social("clay", [
    section(
        "s1",
        group(
            t("TERN", "label"),
            t("What your trainers are made of.", "h1"),
            t("Swipe →", "caption"),
        ),
        { background: bgImage("tern-wool-fibre-macro", 0.45) },
    ),
    section(
        "s2",
        group(
            t("2 / 12", "label"),
            t("Mostly plastic, mostly glue.", "h2"),
            t(
                "The average trainer is 12 synthetics bonded into something you can't take apart.",
                "body",
            ),
        ),
        { background: bgImage("tern-landfill-shoes-pile", 0.66) },
    ),
    section(
        "s3",
        group(
            t("3 / 12", "label"),
            t("So we started with the sheep.", "h1"),
            t("Then worked forward, one component at a time.", "body"),
        ),
        { background: bgImage("tern-otago-hills-flock", 0.5) },
    ),
    section(
        "s4",
        group(
            t("4 / 12 · THE UPPER", "label"),
            t("Merino from four farms in Otago.", "h2"),
            t("Mulesing-free, traced to the paddock.", "body"),
        ),
        { background: bgImage("tern-merino-sheep-otago", 0.55) },
    ),
    section(
        "s5",
        group(
            t("5 / 12 · THE SOLE", "label"),
            t("Sugarcane, not crude oil.", "h2"),
            t("Brazilian cane, rain-fed, no irrigation.", "body"),
        ),
        { background: bgImage("tern-sugarcane-field-green", 0.55) },
    ),
    section(
        "s6",
        group(
            t("6 / 12 · THE INSOLE", "label"),
            t("Castor bean, not petroleum foam.", "h2"),
            t("Grows on land that won't take food crops.", "body"),
        ),
        { background: bgImage("tern-castor-plant-field", 0.58) },
    ),
    section(
        "s7",
        group(
            t("7 / 12 · THE LACES", "label"),
            t("Six bottles a pair.", "h2"),
            t("Recycled polyester, and we're not proud of needing it.", "body"),
        ),
        { background: bgImage("tern-recycled-bottle-yarn", 0.58) },
    ),
    section(
        "s8",
        group(
            t("8 / 12 · THE FACTORY", "label"),
            bullets(
                "One mill, one assembly floor, 40km apart",
                "Water-based adhesive only",
                "Living wage, audited twice a year",
                "Offcuts go back into insoles",
            ),
        ),
        { background: bgImage("tern-factory-floor-workers", 0.74) },
    ),
    section(
        "s9",
        group(
            t("9 / 12 · THE NUMBER", "label"),
            stat("−72%", "carbon vs. a standard trainer"),
            t("4.1kg CO₂e per pair, measured cradle to gate.", "caption"),
        ),
        { background: bgImage("tern-morning-fog-valley", 0.7) },
    ),
    section(
        "s10",
        group(
            t("10 / 12 · THE PART YOU'LL CARE ABOUT", "label"),
            t("They go in the machine.", "h1"),
            t("Cold wash, air dry, no shape loss. Wool handles it.", "body"),
        ),
        { background: bgImage("tern-laundry-room-light", 0.6) },
    ),
    section(
        "s11",
        group(
            quote(
                "Wore them through a Rotterdam winter and a wedding. Nobody could tell which was which.",
                "Ivo M. · 14 months in",
            ),
        ),
        { background: bgImage("tern-city-street-walking", 0.64) },
    ),
    section(
        "s12",
        group(
            t("12 / 12", "label"),
            t("Wool Runner, £98.", "h1"),
            t("Free returns for 30 days. Wear them outside.", "body"),
            t("Tap to shop →", "caption"),
        ),
        { background: bgImage("tern-shoe-pair-studio", 0.58) },
    ),
]);
