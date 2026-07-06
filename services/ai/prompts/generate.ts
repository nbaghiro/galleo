import type { GenerateInput } from "@model/agent";
import type { Beat, Outline } from "../schema";
import { PERSONA, surfaceVoice } from "./persona";
import { describeTheme, elementCatalog, gridCatalog } from "./catalog";
import { RUBRIC, VOICE, lengthGuidance } from "./rubric";
import { arcGuidance } from "./arcs";
import { OUTPUT_NOTE, SECTION_RULES, briefContext, heading, stack } from "./system";
import type { PromptParts } from "./system";

// The generate capability — a two-phase flow that matches the AgentEvent protocol:
//   1) outline  → the plan (title + ordered beats)  → emitted as a `plan` event
//   2) section  → one Section per beat, in order    → each emitted as an `addSection` patch
// Two phases (not one giant object) give real progressive rendering and let each section be written with
// full focus and the outline as shared context. Both phases are handed the quality rubric + the category
// arc so the first generation reads like the hand-built demos, not AI slop.

const OUTLINE_JOB = `## Your job
Plan the artifact: a title and an ordered list of beats (sections). Give the piece a narrative arc — set the scene, build tension, turn, prove it, build momentum, close. For each beat: an id (s1, s2, …), a short working label, its narrative role, the grid you intend, whether it leads with an image, and a one-line brief of what it must say. Don't pad and don't truncate.`;

export function outlineParts(input: GenerateInput): PromptParts {
    return {
        system: stack(
            PERSONA,
            surfaceVoice(input.surface),
            describeTheme(input.theme),
            OUTLINE_JOB,
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
            beat.grid && `Intended grid: ${beat.grid}`,
            beat.image ? "This section leads with a prominent image." : undefined,
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
            OUTPUT_NOTE,
        ),
        prompt: stack(
            briefContext(input),
            placement(beat, outline),
            `Write section "${beat.id}" now — real, specific, finished content.`,
        ),
    };
}
