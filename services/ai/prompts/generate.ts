import type { GenerateInput } from "@model/ai";
import { GRID_TEMPLATES, BLOCK_KINDS } from "@model/elements";
import type { Beat, Outline } from "../schema";
import { PERSONA, surfaceVoice } from "./persona";
import { describeTheme, elementCatalog, gridCatalog } from "./catalog";
import { RUBRIC, VOICE, lengthGuidance } from "./rubric";
import { arcGuidance } from "./arcs";
import { OUTPUT_NOTE, SECTION_OUTPUT, SECTION_RULES, briefContext, heading, stack } from "./system";
import { sectionExemplars } from "./exemplars";
import type { PromptParts } from "./system";

// The generate capability — a two-phase flow that matches the TurnEvent protocol:
//   1) outline  → the plan (title + ordered beats)  → emitted as a `plan` event
//   2) section  → one Section per beat, in order    → each emitted as an `addSection` patch
// Two phases (not one giant object) give real progressive rendering and let each section be written with
// full focus and the outline as shared context. Both phases are handed the quality rubric + the category
// arc so the first generation reads like the hand-built demos, not AI slop.

const OUTLINE_JOB = `## Your job
Plan the artifact: a title and an ordered list of beats (sections). Give the piece a narrative arc — set the scene, build tension, turn, prove it, build momentum, close. For each beat: an id (s1, s2, …), a short working label, its narrative role, the grid you intend, and — crucially — design its LAYOUT: assign a block to each of that grid's cells, in cell order (\`blocks\`, one per cell, each one of: ${BLOCK_KINDS.join(", ")}). Vary grids and blocks across the piece, and place visual blocks (image / stat / chart / diagram / table) where they earn their spot rather than defaulting to walls of text — the layout you choose is rendered as a live skeleton and the section writer must fill it exactly. Also give each beat whether it leads with an image and a one-line brief of what it must say. Give the opening (scene) and closing (close) sections a full-bleed background image — set image=true for them; they anchor the piece. Don't pad and don't truncate.`;

export function outlineParts(input: GenerateInput): PromptParts {
    return {
        system: stack(
            PERSONA,
            surfaceVoice(input.surface),
            describeTheme(input.theme),
            OUTLINE_JOB,
            gridCatalog(),
            RUBRIC,
            OUTPUT_NOTE,
        ),
        prompt: stack(
            briefContext(input),
            lengthGuidance(input.length),
            arcGuidance(input),
            "Produce the outline now.",
        ),
    };
}

// Map a beat's per-cell blocks onto the grid's cell keys → "cell a: text, cell b: image".
function cellPlan(beat: Beat): string {
    const cells = GRID_TEMPLATES.find((g) => g.id === beat.grid)?.cells ?? [];
    return (beat.blocks ?? [])
        .map((b, i) => `cell ${cells[i] ?? String.fromCharCode(97 + i)}: ${b}`)
        .join(", ");
}

// Context about where this section sits, so it flows from the ones around it.
function placement(beat: Beat, outline: Outline): string {
    const idx = outline.beats.findIndex((b) => b.id === beat.id);
    const arc = outline.beats
        .map((b, i) => `${i + 1}. ${b.label}${b.id === beat.id ? "  ← writing this" : ""}`)
        .join("\n");
    return heading(
        "This section",
        [
            `Artifact title: ${outline.title}`,
            `Beat ${idx + 1} of ${outline.beats.length}: "${beat.label}" (role: ${beat.role})`,
            beat.brief && `What it must say: ${beat.brief}`,
            beat.grid &&
                `Use EXACTLY this grid — the plan chose it and a live preview is already showing it: ${beat.grid}.`,
            beat.blocks?.length &&
                `Fill the cells in this exact order, leading each with its assigned block — ${cellPlan(beat)}. A "text" cell = a headline + supporting copy; "image" = one image; "stat" = a stat; "bullets" = a short list; "chart"/"diagram"/"table" = that visual; "quote" = a pulled quote; "cards" = a small group of cards. The live preview shows this layout, so match it exactly (don't move a block to a different cell).`,
            beat.image ? "This section leads with a prominent image." : undefined,
            idx === 0
                ? "This is the COVER — give it a full-bleed background image and keep the overlay to the title plus a one-line subtitle."
                : undefined,
            idx === outline.beats.length - 1
                ? "This is the CLOSING section — a full-bleed background image behind a short closing line and a call to action reads beautifully."
                : undefined,
            "",
            "The full arc, for continuity:",
            arc,
        ]
            .filter((x) => x !== undefined)
            .join("\n"),
    );
}

export function sectionParts(input: GenerateInput, beat: Beat, outline: Outline): PromptParts {
    return {
        system: stack(
            PERSONA,
            surfaceVoice(input.surface),
            describeTheme(input.theme),
            elementCatalog(),
            gridCatalog(),
            SECTION_RULES,
            VOICE,
            sectionExemplars(input.surface),
            SECTION_OUTPUT,
        ),
        prompt: stack(
            briefContext(input),
            placement(beat, outline),
            `Write section "${beat.id}" now — real, specific, finished content.`,
        ),
    };
}
