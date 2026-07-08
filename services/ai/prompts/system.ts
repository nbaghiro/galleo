import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { GenerateInput } from "@model/ai";

// Shared prompt primitives — the composition helpers and the reusable fragments (brief context, artifact
// digest, the output/shape rules) that every capability builder assembles. Capability files import from
// here; this file imports no capability, so there is no cycle.

// What a capability builder returns: the two halves of a chat call.
export interface PromptParts {
    system: string;
    prompt: string;
}

// Join non-empty fragments with blank lines — the standard way we stack a system prompt.
export function stack(...parts: (string | undefined | false)[]): string {
    return parts.filter((p): p is string => !!p).join("\n\n");
}

export function heading(title: string, body: string): string {
    return `## ${title}\n${body}`;
}

// The rules for shaping a section — referenced by generate + section builders.
export const SECTION_RULES = `## How to build a section
- Use the grid the plan assigned AND lead each cell with the block the plan assigned to it, in order (given in the section brief) — don't switch the grid or move a block to a different cell; a live preview is already showing that exact layout, so the finished section must match it. To place several elements in one cell (a headline + body + button), wrap them in a group led by that block.
- Fill each of the grid's cells with exactly one element. To place several elements in one cell, use a \`group\`.
- One clear headline per section (a single \`text\` with style \`h1\` or \`h2\`), plus only the supporting elements the point needs.
- Prefer a \`stat\`, \`chart\`, \`diagram\`, \`table\`, or \`image\` over prose whenever the idea is a number, trend, comparison, or process.
- For images, set \`src\` to a short, vivid description of the photo you want (e.g. "aerial view of a wind farm at dusk") — the module sources or generates it. Only use a real URL if you truly have one. For a PERSON (a testimonial, a headshot, a team member), describe them generically — e.g. "a confident businesswoman in her 40s, smiling" — never a specific or named individual, so a real, fitting portrait turns up instead of a random placeholder face.
- Reach for a full-bleed section background image on covers, section-dividers, and closing/CTA sections — set "background" to { "kind": "image", "image": "<vivid, on-theme photo description>", "scrim": 0.5 }, keep the overlaid content minimal (a headline + one supporting line), and raise the scrim to 0.5–0.65 so text stays legible. Never put a background image behind a dense chart/table/stat section.
- Give every section a unique \`id\` (\`s1\`, \`s2\`, …).`;

// The brief the user supplied at intake, rendered for the model.
export function briefContext(input: GenerateInput): string {
    const lines = [
        `Prompt: ${input.prompt}`,
        input.goal && `Goal: ${input.goal}`,
        input.audience && `Audience: ${input.audience}`,
        input.tone && `Tone: ${input.tone}`,
        input.length && `Length: ${input.length}`,
    ].filter(Boolean);
    return heading("The brief", lines.join("\n"));
}

// Pull a short label from a section (its first text run) — for the compact artifact digest.
function firstText(section: Section): string {
    let found = "";
    const visit = (el?: ElementInstance): void => {
        if (found || !el) return;
        const data = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof data.text === "string" && data.text.trim()) {
            found = data.text.trim();
            return;
        }
        data.children?.forEach(visit);
    };
    for (const cell of Object.values(section.cells)) visit(cell.element);
    return found;
}

// A compact, token-cheap map of an existing artifact — enough for the model to target an edit without
// re-sending the whole tree. (When surgical fidelity is needed, a route can include the full section JSON.)
export function artifactDigest(content: ArtifactContent): string {
    const rows = content.sections
        .map((s, i) => {
            const label = firstText(s) || "(untitled)";
            return `${i + 1}. [${s.id}] grid=${s.grid} — ${label.slice(0, 80)}`;
        })
        .join("\n");
    return heading(
        "Current artifact",
        `format=${content.format}, theme=${content.theme}, ${content.sections.length} sections:\n${rows}`,
    );
}

// The one-line identity of an artifact — its title (section 1) and thesis (section 2) + format/theme. The
// cheapest context to give any editing turn so a change stays on-message with the whole piece.
export function artifactSpine(content: ArtifactContent): string {
    const title = content.sections[0] ? firstText(content.sections[0]) : "";
    const thesis = content.sections[1] ? firstText(content.sections[1]) : "";
    return heading(
        "This artifact",
        [
            `A ${content.format} themed "${content.theme}".`,
            title && `Title: ${title}`,
            thesis && `Thesis: ${thesis}`,
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

// The sections immediately around a target — so a regenerated/edited section flows from its neighbors
// (voice, level of detail, and not repeating what the previous section already said).
export function neighbors(content: ArtifactContent, sectionId: string): string {
    const i = content.sections.findIndex((s) => s.id === sectionId);
    if (i < 0) return "";
    const label = (n: number): string | undefined => {
        const s = content.sections[n];
        return s ? `[${s.id}] ${firstText(s) || "(untitled)"}` : undefined;
    };
    const before = label(i - 1);
    const after = label(i + 1);
    return heading(
        "Where this section sits",
        [
            `Section ${i + 1} of ${content.sections.length}.`,
            before && `Previous: ${before}`,
            after && `Next: ${after}`,
            "Fit between them — match the voice, don't repeat what the previous section already said.",
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

// Where a NEW, inserted section lands — the section it follows and the one it precedes, so the plan/writer
// makes it bridge the two (flows from the previous, sets up the next, repeats neither). Used by the
// insert-a-section turn, whose "afterId" says which section the new one comes right after.
export function insertionContext(content: ArtifactContent, afterId: string | null): string {
    const i = afterId ? content.sections.findIndex((s) => s.id === afterId) : -1;
    const prev = i >= 0 ? content.sections[i] : undefined;
    const next = content.sections[i + 1];
    const label = (s?: Section): string | undefined =>
        s ? `[${s.id}] ${firstText(s) || "(untitled)"}` : undefined;
    return heading(
        "Where the new section goes",
        [
            `You're inserting ONE new section into an existing ${content.format} of ${content.sections.length} sections.`,
            prev
                ? `It comes right AFTER: ${label(prev)}`
                : "It goes at the very START, before everything else.",
            next ? `And right BEFORE: ${label(next)}` : "It becomes the new closing section.",
            "Make it bridge the two — flow out of the previous, set up the next, and don't repeat what either already says.",
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

// A short, standing reminder about the output — the Zod schema enforces the shape, this reminds the model
// what "good" content looks like inside it. (Used by the outline phase, which is structured-output.)
export const OUTPUT_NOTE = `Return only content that fits the schema. Never include commentary, markdown fences, or placeholder text — every field is real, finished copy.`;

// The exact JSON envelope a section is returned as. Section writing is free-form JSON (not a rigid schema)
// because an element's `data` is an open, type-dependent map the catalog teaches — so the model needs the
// outer shape spelled out here, and validation happens on the parse.
export const SECTION_OUTPUT = `## Output — return ONE JSON object and nothing else
No prose, no explanation, no markdown fences. This exact shape:
{
  "id": "<this section's id>",
  "grid": "<one of the grid ids above>",
  "cells": {
    "<cellKey>": { "element": { "type": "<element type>", "data": { /* fields the catalog lists for that type */ } } }
  },
  "background": { "kind": "image", "image": "<vivid photo description>", "scrim": 0.5 }
}
Fill exactly the cells the chosen grid exposes (e.g. grid "two-col" → cells "a" and "b"). One element per cell; to place several elements in one cell use a "group" whose \`data.children\` is an array of elements. The "background" key is optional — include it only for a cover, divider, or closing section (omit it entirely otherwise). Every string is real, finished copy — never placeholder text.`;
