import type { GenerateInput, SectionInput, Surface } from "@model/ai";
import { GRID_TEMPLATES, BLOCK_KINDS } from "@model/elements";
import type { Beat, Outline } from "../schema";
import { PERSONA, surfaceVoice } from "./persona";
import { describeTheme, elementCatalog, gridCatalog } from "./catalog";
import { RUBRIC, VOICE, lengthGuidance } from "./rubric";
import { arcGuidance } from "./arcs";
import {
    OUTPUT_NOTE,
    SECTION_OUTPUT,
    SECTION_RULES,
    artifactSpine,
    briefContext,
    heading,
    insertionContext,
    stack,
} from "./system";
import { sectionExemplars } from "./exemplars";
import type { PromptParts } from "./system";

// The generate capability — a two-phase flow that matches the TurnEvent protocol:
//   1) outline  → the plan (title + ordered beats)  → emitted as a `plan` event
//   2) section  → one Section per beat, in order    → each emitted as an `addSection` patch
// Two phases (not one giant object) give real progressive rendering and let each section be written with
// full focus and the outline as shared context. Both phases are handed the quality rubric + the category
// arc so the first generation reads like the hand-built demos, not AI slop.

const OUTLINE_JOB = `## Your job
Plan the artifact: a title, a backdrop, and an ordered list of beats (sections). The backdrop is the artifact's full-bleed background image — describe a moody, on-theme atmospheric scene that evokes the subject (a wide, low-detail environment, since it sits behind every section under a scrim), never a generic abstract texture. Give the piece a real narrative arc that fits the topic — the beat roles (scene, tension, turn, proof, momentum, close) are a toolbox to draw on, not a fixed sequence: use the ones the story needs, in the order it needs, and repeat proof/momentum beats where the argument earns them. For each beat: an id (s1, s2, …), a short working label, its narrative role, the grid you intend, and — crucially — design its LAYOUT: assign a block to each of that grid's cells, in cell order (\`blocks\`, one per cell, each one of: ${BLOCK_KINDS.join(", ")}). Vary grids and blocks across the piece, and place visual blocks (image / stat / chart / diagram / table) where they earn their spot rather than defaulting to walls of text — the layout you choose is rendered as a live skeleton and the section writer must fill it exactly. Also give each beat whether it leads with an image and a one-line brief of what it must say. Give the opening (scene) and closing (close) sections a full-bleed background image — set image=true for them; they anchor the piece. Don't pad and don't truncate.`;

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

// The "fill each cell with its planned block, in order" instruction — shared by the generate placement and
// the insert-a-section placement so both hold the writer to the exact layout the live skeleton is showing.
function blockLine(beat: Beat): string | undefined {
    if (!beat.blocks?.length) return undefined;
    return `Fill the cells in this exact order, leading each with its assigned block — ${cellPlan(beat)}. A "text" cell = a headline + supporting copy; "image" = one image; "stat" = a stat; "bullets" = a short list; "chart"/"diagram"/"table" = that visual; "quote" = a pulled quote; "cards" = a small group of cards. The live preview shows this layout, so match it exactly (don't move a block to a different cell).`;
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
            blockLine(beat),
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

// The system half of a section-writing call — the persona, the surface/theme, the element + grid catalog,
// the section rules, a gold exemplar, and the exact output envelope. Shared by generate (write each planned
// beat) and insert (write one new section into an existing artifact), so both write against the same bar.
function sectionSystem(surface: Surface, theme: string): string {
    return stack(
        PERSONA,
        surfaceVoice(surface),
        describeTheme(theme),
        elementCatalog(),
        gridCatalog(),
        SECTION_RULES,
        VOICE,
        sectionExemplars(surface),
        SECTION_OUTPUT,
    );
}

export function sectionParts(input: GenerateInput, beat: Beat, outline: Outline): PromptParts {
    return {
        system: sectionSystem(input.surface, input.theme),
        prompt: stack(
            briefContext(input),
            placement(beat, outline),
            `Write section "${beat.id}" now — real, specific, finished content.`,
        ),
    };
}

// --- insert a single new section into an existing artifact (the `section` turn) ---

// The surface an artifact reads as — its format id doubles as the surface (deck / doc / web); anything else
// falls back to deck.
export function surfaceOf(format: string): Surface {
    return format === "doc" || format === "web" ? format : "deck";
}

const PLAN_ONE_JOB = `## Your job
Plan ONE new section to slot into this artifact at the marked spot. Decide its narrative role, choose the grid that fits, and design its LAYOUT: assign a block to each of that grid's cells, in cell order (\`blocks\`, one per cell, each one of: ${BLOCK_KINDS.join(", ")}). Reach for a visual block (image / stat / chart / diagram / table) where the idea is a picture, number, trend, or process rather than defaulting to a wall of text. Give it a short working label, whether it leads with an image, and a one-line brief of what it must say. Match the density and voice of the sections around it — this section has to feel like it was always there.`;

// Plan the one new section (structured call): role + grid + per-cell blocks, aware of where it lands.
export function sectionPlanParts(input: SectionInput): PromptParts {
    const surface = surfaceOf(input.content.format);
    return {
        system: stack(
            PERSONA,
            surfaceVoice(surface),
            describeTheme(input.content.theme),
            gridCatalog(),
            PLAN_ONE_JOB,
            OUTPUT_NOTE,
        ),
        prompt: stack(
            artifactSpine(input.content),
            insertionContext(input.content, input.afterId),
            heading("What the reader asked this section to be", input.instruction),
            "Plan the one section now.",
        ),
    };
}

// Placement context for the inserted section — the assigned grid/blocks plus where it sits in the real
// artifact (the outline arc is replaced by the true neighbors, since there's no fresh outline here).
function insertPlacement(beat: Beat, input: SectionInput): string {
    return stack(
        heading(
            "This section",
            [
                `Role: ${beat.role}. Working title: "${beat.label}".`,
                beat.brief && `What it must say: ${beat.brief}`,
                beat.grid &&
                    `Use EXACTLY this grid — a live preview is already showing it: ${beat.grid}.`,
                blockLine(beat),
                beat.image ? "This section leads with a prominent image." : undefined,
            ]
                .filter((x): x is string => typeof x === "string")
                .join("\n"),
        ),
        insertionContext(input.content, input.afterId),
    );
}

// Write the one new section to fill the planned layout, in the voice of the surrounding artifact.
export function insertSectionParts(input: SectionInput, beat: Beat): PromptParts {
    const surface = surfaceOf(input.content.format);
    return {
        system: sectionSystem(surface, input.content.theme),
        prompt: stack(
            heading("The brief", `This one section: ${input.instruction}`),
            insertPlacement(beat, input),
            `Write section "${beat.id}" now — real, specific, finished content.`,
        ),
    };
}
