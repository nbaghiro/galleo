import type { EditInput, Surface } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import { PERSONA, surfaceVoice } from "./persona";
import { describeTheme, elementCatalog, layoutCatalog } from "./catalog";
import { VOICE } from "./rubric";
import { OUTPUT_NOTE, SECTION_RULES, artifactDigest, heading, stack } from "./system";
import type { PromptParts } from "./system";

// The whole-artifact edit capability (`edit` turn) — read the current content and return the revised
// artifact; the runtime diffs the result into the minimal replaceSection / replaceElement patches the
// protocol streams. (Inserting one new section is the `section` turn — its prompts live in generate.ts,
// alongside the section writer it reuses.)

const EDIT_JOB = `## Your job
Revise the artifact to satisfy the instruction while preserving everything that already works. Change only what the instruction implies; keep untouched sections intact (same ids). Return the full revised artifact.`;

export function editParts(input: EditInput, content: ArtifactContent): PromptParts {
    return {
        system: stack(
            PERSONA,
            surfaceVoice(content.format as Surface),
            describeTheme(content.theme),
            elementCatalog(),
            layoutCatalog(),
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
