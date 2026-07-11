import type { GenerateInput, SectionInput, Surface } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { BLOCK_KINDS } from "@model/elements";
import type { Beat, Outline } from "../schema";
import { PERSONA, surfaceVoice } from "./persona";
import { describeTheme, elementCatalog, layoutCatalog } from "./catalog";
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
    neighbors,
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
Plan the artifact: a title, a backdrop, and an ordered list of beats (sections). The backdrop is the artifact's full-bleed background image — describe a moody, on-theme atmospheric scene that evokes the subject (a wide, low-detail environment, since it sits behind every section under a scrim), never a generic abstract texture. Give the piece a real narrative arc that fits the topic — the beat roles (scene, tension, turn, proof, momentum, close) are a toolbox to draw on, not a fixed sequence: use the ones the story needs, in the order it needs, and repeat proof/momentum beats where the argument earns them. For each beat: an id (s1, s2, …), a short working label, its narrative role, the layout you intend (\`layout\` — a named preset: full · split-6040 · split-4060 · two-col · three-up), and — crucially — design its LAYOUT: assign a block to each column, in order (\`blocks\`, one per column, each one of: ${BLOCK_KINDS.join(", ")}). Vary layouts and blocks across the piece, and place visual blocks (image / stat / chart / diagram / table) where they earn their spot rather than defaulting to walls of text — the layout you choose is rendered as a live skeleton and the section writer must fill it exactly. Also give each beat whether it leads with an image and a one-line brief of what it must say. Give the opening (scene) and closing (close) sections a full-bleed background image — set image=true for them; they anchor the piece. Don't pad and don't truncate.`;

// Source material to build FROM (pasted text, or an existing artifact's extracted text) — only the outline
// sees it (the sections follow the outline's beats), so grounding stays cheap even for a long source.
function sourceMaterial(source?: string): string | undefined {
    const s = source?.trim();
    if (!s) return undefined;
    const clipped = s.length > 6000 ? `${s.slice(0, 6000)}…` : s;
    return heading(
        "Source material — build the piece FROM this",
        `Ground the outline in this material: use its real facts, structure, and specifics — don't invent competing ones. Distill and reorganize it into a strong narrative that fits this format.\n\n${clipped}`,
    );
}

export function outlineParts(input: GenerateInput): PromptParts {
    return {
        system: stack(
            PERSONA,
            surfaceVoice(input.surface),
            describeTheme(input.theme),
            OUTLINE_JOB,
            layoutCatalog(),
            RUBRIC,
            OUTPUT_NOTE,
        ),
        prompt: stack(
            briefContext(input),
            sourceMaterial(input.source),
            lengthGuidance(input.length),
            arcGuidance(input),
            "Produce the outline now.",
        ),
    };
}

// Map a beat's per-column blocks onto column order → "column 1: text, column 2: image".
function columnPlan(beat: Beat): string {
    return (beat.blocks ?? []).map((b, i) => `column ${i + 1}: ${b}`).join(", ");
}

// The "fill each column with its planned block, in order" instruction — shared by the generate placement
// and the insert-a-section placement so both hold the writer to the exact layout the live skeleton shows.
function blockLine(beat: Beat): string | undefined {
    if (!beat.blocks?.length) return undefined;
    return `Fill the columns in this exact order, leading each with its assigned block — ${columnPlan(beat)}. A "text" column = a headline + supporting copy; "image" = one image; "stat" = a stat; "bullets" = a short list; "chart"/"diagram"/"table" = that visual; "quote" = a pulled quote; "cards" = a small group of cards. The live preview shows this layout, so match it exactly (don't move a block to a different column).`;
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
            beat.layout &&
                `Use EXACTLY this layout — the plan chose it and a live preview is already showing it: ${beat.layout}.`,
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
        layoutCatalog(),
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
Plan ONE new section to slot into this artifact at the marked spot. Decide its narrative role, choose the layout that fits (\`layout\` — a named preset: full · split-6040 · split-4060 · two-col · three-up), and design its LAYOUT: assign a block to each column, in order (\`blocks\`, one per column, each one of: ${BLOCK_KINDS.join(", ")}). Reach for a visual block (image / stat / chart / diagram / table) where the idea is a picture, number, trend, or process rather than defaulting to a wall of text. Give it a short working label, whether it leads with an image, and a one-line brief of what it must say. Match the density and voice of the sections around it — this section has to feel like it was always there.`;

// Plan the one new section (structured call): role + layout + per-column blocks, aware of where it lands.
export function sectionPlanParts(input: SectionInput): PromptParts {
    const surface = surfaceOf(input.content.format);
    return {
        system: stack(
            PERSONA,
            surfaceVoice(surface),
            describeTheme(input.content.theme),
            layoutCatalog(),
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

// Placement context for the inserted section — the assigned layout/blocks plus where it sits in the real
// artifact (the outline arc is replaced by the true neighbors, since there's no fresh outline here).
function insertPlacement(beat: Beat, input: SectionInput): string {
    return stack(
        heading(
            "This section",
            [
                `Role: ${beat.role}. Working title: "${beat.label}".`,
                beat.brief && `What it must say: ${beat.brief}`,
                beat.layout &&
                    `Use EXACTLY this layout — a live preview is already showing it: ${beat.layout}.`,
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

// --- edit an existing section in place (the chat agent's editSection tool) ---

// Rewrite a section to satisfy an instruction, keeping its id and grounding in the real neighbours, so the
// result still flows with the piece. Returns the full revised section (the runtime diffs it → replaceSection).
export function editSectionParts(
    content: ArtifactContent,
    section: Section,
    instruction: string,
): PromptParts {
    return {
        system: sectionSystem(surfaceOf(content.format), content.theme),
        prompt: stack(
            heading("What to change", instruction),
            neighbors(content, section.id),
            heading("The section as it is now", "```json\n" + JSON.stringify(section) + "\n```"),
            `Rewrite section "${section.id}" to satisfy the instruction — keep its id (and its layout, unless the change requires a different one), and return the full revised section as JSON.`,
        ),
    };
}

// --- regenerate ONE element in place (the ContextBar's Regenerate action / the revise-element tool) ---

// The output envelope for a single element — one `{ type, data }` object, keeping the original type (this
// rewrites the element's CONTENT, not what kind of element it is), so the section's layout stays valid.
const ELEMENT_OUTPUT = `## Output — return ONE JSON object and nothing else
No prose, no explanation, no markdown fences. A single element in this exact shape:
{ "type": "<the SAME type as the original element>", "data": { /* the fields the catalog lists for that type */ } }
Keep "type" identical to the original — you are rewriting its CONTENT, not changing what kind of element it is. If it's a container (group / card / quote / stat / bullets / callout), return it with its \`data.children\` fully populated. Every string is real, finished copy — never placeholder text.`;

// The system half of an element-regeneration call — the persona, surface/theme, the full element catalog +
// section rules (so the writer knows the element's fields and honours the image/person guidance), the voice,
// and the single-element output envelope.
function elementSystem(surface: Surface, theme: string): string {
    return stack(
        PERSONA,
        surfaceVoice(surface),
        describeTheme(theme),
        elementCatalog(),
        SECTION_RULES,
        VOICE,
        ELEMENT_OUTPUT,
    );
}

// Where the element sits — the whole-piece voice plus the section it belongs to (so the fresh version fits
// the topic and doesn't just repeat what a sibling element in the same section already says).
function elementContext(content: ArtifactContent, section: Section): string {
    return stack(
        artifactSpine(content),
        heading(
            "The section it belongs to",
            `Fit this section's point and the piece's voice; don't duplicate copy that another element in the section already carries.\n\`\`\`json\n${JSON.stringify(section)}\n\`\`\``,
        ),
    );
}

// Regenerate a single element: keep its type, produce a genuinely fresh, stronger version. With no
// instruction it's a straight re-roll; an instruction ("make it punchier", "use a different stat") steers it.
export function reviseElementParts(
    content: ArtifactContent,
    section: Section,
    element: ElementInstance,
    instruction?: string,
): PromptParts {
    const change = instruction?.trim()
        ? heading("What to change", instruction.trim())
        : heading(
              "What to do",
              "Regenerate this element — a fresh, stronger version that makes the same kind of point in a better way. Keep it the same TYPE, but genuinely rework the wording, numbers, or framing so it reads as a real alternative, not the same text handed back.",
          );
    return {
        system: elementSystem(surfaceOf(content.format), content.theme),
        prompt: stack(
            change,
            elementContext(content, section),
            heading("The element as it is now", "```json\n" + JSON.stringify(element) + "\n```"),
            `Return the single revised element as JSON — same "type", fresh content.`,
        ),
    };
}
