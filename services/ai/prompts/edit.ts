import type { EditInput, SectionInput, Surface } from "@model/agent";
import type { ArtifactContent, Section } from "@model/artifact";
import { PERSONA, surfaceVoice } from "./persona";
import { describeTheme, elementCatalog, gridCatalog } from "./catalog";
import { VOICE } from "./rubric";
import { OUTPUT_NOTE, SECTION_RULES, artifactDigest, heading, neighbors, stack } from "./system";
import type { PromptParts } from "./system";

// The edit capabilities — revise the whole artifact (`edit` turn) or one section (`section` turn). Both
// read the current content and return replacement content; the runtime diffs the result into the minimal
// replaceSection / replaceElement patches the protocol streams. Both pull the surrounding context so an
// edit stays consistent with the piece it lives in.

const EDIT_JOB = `## Your job
Revise the artifact to satisfy the instruction while preserving everything that already works. Change only what the instruction implies; keep untouched sections intact (same ids). Return the full revised artifact.`;

export function editParts(input: EditInput, content: ArtifactContent): PromptParts {
    return {
        system: stack(
            PERSONA,
            surfaceVoice(content.format as Surface),
            describeTheme(content.theme),
            elementCatalog(),
            gridCatalog(),
            SECTION_RULES,
            VOICE,
            EDIT_JOB,
            OUTPUT_NOTE,
        ),
        prompt: stack(
            artifactDigest(content),
            heading("Instruction", input.instruction),
            "Return the revised artifact.",
        ),
    };
}

// Regenerate / edit a single section (optionally narrowed to one cell). Pulls the neighbouring sections so
// the result flows from them and doesn't repeat what they already say.
export function sectionEditParts(
    input: SectionInput,
    content: ArtifactContent,
    section: Section,
): PromptParts {
    const scope = input.cell
        ? `Edit only cell "${input.cell}" of this section; leave the other cells unchanged.`
        : "Rework this whole section.";
    return {
        system: stack(
            PERSONA,
            surfaceVoice(content.format as Surface),
            describeTheme(content.theme),
            elementCatalog(),
            gridCatalog(),
            SECTION_RULES,
            VOICE,
            OUTPUT_NOTE,
        ),
        prompt: stack(
            neighbors(content, section.id),
            heading(
                "The section, as it is now",
                "```json\n" + JSON.stringify(section, null, 2) + "\n```",
            ),
            heading("Instruction", input.instruction),
            scope,
            `Return the revised section (keep id "${section.id}").`,
        ),
    };
}
