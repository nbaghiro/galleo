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
- Choose the \`grid\` that fits the point: \`full\` for a hero/statement, a split for text-with-visual, \`three-up\` for three parallel items.
- Fill each of the grid's cells with exactly one element. To place several elements in one cell, use a \`group\`.
- One clear headline per section (a single \`text\` with style \`h1\` or \`h2\`), plus only the supporting elements the point needs.
- Prefer a \`stat\`, \`chart\`, \`diagram\`, \`table\`, or \`image\` over prose whenever the idea is a number, trend, comparison, or process.
- For images, set \`src\` to a short, vivid description of the photo you want (e.g. "aerial view of a wind farm at dusk") — the module sources or generates it. Only use a real URL if you truly have one.
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

// A short, standing reminder about the output — the Zod schema enforces the shape, this reminds the model
// what "good" content looks like inside it.
export const OUTPUT_NOTE = `Return only content that fits the schema. Never include commentary, markdown fences, or placeholder text — every field is real, finished copy.`;
