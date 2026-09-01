import type { ArtifactContent } from "@model/artifact";
import {
    badge,
    bgImage,
    bullets,
    button,
    callout,
    card,
    chart,
    code,
    diagram,
    divider,
    doc,
    embed,
    group,
    img,
    quote,
    row,
    section,
    split,
    stat,
    t,
    table,
    video,
} from "@model/authoring";

// Canvas owns its own layout fixture: these are geometry invariants, so the content must stay put
// even when product seed content is re-edited. Covers every @model/authoring element type.
export const richDoc: ArtifactContent = doc("press", [
    section(
        "cover",
        group(t("A Rich Document", "h1"), t("Every element type, one artifact", "lead")),
        {
            background: bgImage(
                "https://images.pexels.com/photos/28380286/pexels-photo-28380286.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                0.55,
            ),
        },
    ),
    section(
        "intro",
        group(
            t("Introduction", "h2"),
            t(
                "Body copy that wraps across more than a single rendered line so the measurer has real work to do.",
                "body",
            ),
            divider(),
        ),
    ),
    section(
        "bullets",
        group(
            t("Key points", "h2"),
            bullets("First point", "Second point with a longer tail", "Third point"),
        ),
    ),
    section(
        "stats",
        row(stat("128", "Sections"), stat("4.2s", "Median build"), stat("99.9%", "Uptime")),
    ),
    section(
        "split",
        split(
            60,
            group(
                t("Weighted column", "h3"),
                t(
                    "The left column carries the narrative while the right carries the visual.",
                    "body",
                ),
            ),
            img(
                "https://images.pexels.com/photos/35320973/pexels-photo-35320973.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                1.4,
            ),
        ),
    ),
    section(
        "quote",
        quote("Layout is the argument the content makes about itself.", "Design note"),
    ),
    section("chart", group(t("Growth", "h2"), chart("bar", "Q1:12,Q2:19,Q3:27,Q4:41"))),
    section("diagram", group(t("Pipeline", "h2"), diagram("flow", "Brief,Outline,Build,Review"))),
    section(
        "table",
        group(
            t("Comparison", "h2"),
            table("Plan,Seats,Price\nSolo,1,$0\nTeam,10,$40\nScale,50,$180"),
        ),
    ),
    section(
        "code",
        group(
            t("Usage", "h2"),
            code('const artifact = doc("press", sections);\nrender(artifact);'),
        ),
    ),
    section(
        "callout",
        callout(
            "info",
            t("Callouts nest their own children and must still bound their box.", "body"),
        ),
    ),
    section(
        "cards",
        row(
            card(badge("New"), t("Card one", "h3"), t("Supporting copy.", "body")),
            card(badge("Beta"), t("Card two", "h3"), t("Supporting copy.", "body")),
        ),
    ),
    section(
        "media",
        group(
            t("Media", "h2"),
            img(
                "https://images.pexels.com/photos/30547365/pexels-photo-30547365.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                1.78,
            ),
            video("https://example.invalid/clip.mp4"),
        ),
    ),
    section(
        "embed",
        group(t("Embedded", "h2"), embed("Reference", "https://example.invalid/embed")),
    ),
    section(
        "cta",
        group(
            t("Get started", "h2"),
            t("Close the arc with an action.", "body"),
            button("Start building"),
        ),
        {
            background: bgImage(
                "https://images.pexels.com/photos/12411299/pexels-photo-12411299.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1700&h=1100",
                0.4,
            ),
        },
    ),
]);
