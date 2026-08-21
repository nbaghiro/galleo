import { recordParts } from "@services/core/ai/meter";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { GenerateInput } from "@model/ai";

// Imports no capability file, so there's no cycle.
export interface PromptParts {
    system: string;
    prompt: string;
}

/**
 * Joins prompt fragments. A fragment may be labelled as `[name, text]`, which changes nothing about
 * the prompt sent but lets a traced run show what the system prompt was assembled from and what
 * each piece costs.
 */
export function stack(...parts: (Fragment | undefined | false)[]): string {
    const kept = parts.filter((p): p is Fragment => !!p && (typeof p === "string" || !!p[1]));
    const text = kept.map((p) => (typeof p === "string" ? p : p[1])).join("\n\n");
    const named = kept.filter((p): p is [string, string] => Array.isArray(p));
    if (named.length)
        recordParts(
            text,
            named.map(([name, body]) => ({ name, text: body })),
        );
    return text;
}

type Fragment = string | [string, string];

export function heading(title: string, body: string): string {
    return `## ${title}\n${body}`;
}

export const SECTION_RULES = `## How to build a section
- Use the layout the plan assigned (its column count + widths) AND lead each column with the block the plan assigned to it, in order (given in the section brief), don't change the column count or move a block to a different column; a live preview is already showing that exact layout, so the finished section must match it. To place several elements in one column (a headline + body + button), stack them in a \`container\` (direction 'col') led by that block.
- The section's \`root\` is one element tree: a \`container\` with direction 'row' for side-by-side columns (each child carries \`layout.width\`), 'col' to stack, or a single element for a full-width section. Nest to any depth.
- One clear headline per section (a single \`text\` with style \`h1\` or \`h2\`), plus only the supporting elements the point needs.
- Prefer a \`stat\`, \`chart\`, \`diagram\`, \`table\`, or \`image\` over prose whenever the idea is a number, trend, comparison, or process.
- For images, set \`src\` to a short, vivid description of the photo you want (e.g. "aerial view of a wind farm at dusk") and the module sources or generates it. Write it as a phrase with spaces, never as a hyphenated slug or a filename. Only use a real URL if you truly have one. For a PERSON (a testimonial, a headshot, a team member), describe them generically, e.g. "a confident businesswoman in her 40s, smiling". Never a specific or named individual, so a real, fitting portrait turns up instead of a random placeholder face.
- A DECK section must fit a 16:9 slide, so a group of PEOPLE (a team, advisors, testimonials) goes in ONE HORIZONTAL ROW, a row of columns with one person per column, or a single-row \`container\` with one person per child (up to 4), each a compact \`container\` with a \`surface\` holding a small portrait above a name + one-line role. NEVER stack people in a 2×N grid of large square photos: it makes the slide far too tall and it letterboxes when presented. Keep portrait images modest (\`aspect\` ~1). (On doc/web there's no slide to fit, so a taller multi-row grid is fine.)
- Reach for a full-bleed section background image on covers, section-dividers, and closing/CTA sections, set "background" to { "kind": "image", "image": "<vivid, on-theme photo description>", "scrim": 0.5 }, keep the overlaid content minimal (a headline + one supporting line), and raise the scrim to 0.5–0.65 so text stays legible. Never put a background image behind a dense chart/table/stat section.
- Give every section a unique \`id\` (\`s1\`, \`s2\`, …).`;

export function briefContext(input: GenerateInput): string {
    const lines = [
        `Prompt: ${input.prompt}`,
        input.goal && `Goal: ${input.goal}`,
        input.audience && `Audience: ${input.audience}`,
        input.tone && `Tone: ${input.tone}`,
        input.length && `Length: ${input.length}`,
        input.mustInclude?.length &&
            `Must cover:\n${input.mustInclude.map((m) => `- ${m}`).join("\n")}`,
        input.clarifications?.length &&
            `Answers you already have (treat as settled, don't ask again):\n${input.clarifications
                .map((c) => `- ${c}`)
                .join("\n")}`,
    ].filter(Boolean);
    return heading("The brief", lines.join("\n"));
}

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
    visit(section.root);
    return found;
}

// every text run in document order — the section's words, not just its first line
export function sectionText(section: Section): string {
    const parts: string[] = [];
    const visit = (el?: ElementInstance): void => {
        if (!el) return;
        const data = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof data.text === "string" && data.text.trim()) parts.push(data.text.trim());
        data.children?.forEach(visit);
    };
    visit(section.root);
    return parts.join(" · ");
}

const WRITTEN_CLIP = 350; // per section, so one long section can't crowd out the rest

// What is already on the page, at reading fidelity: the anti-repetition and continuity context
// for every later section write. Hand-edits are deliberately canon — this reads the live content,
// not the plan.
export function writtenContext(
    content: ArtifactContent | undefined,
    excludeId?: string,
): string | undefined {
    const sections = (content?.sections ?? []).filter((s) => s.id !== excludeId);
    if (!sections.length) return undefined;
    const rows = sections.map((s) => {
        const text = sectionText(s) || "(a visual section, no text)";
        const clipped =
            text.length > WRITTEN_CLIP ? `${text.slice(0, WRITTEN_CLIP - 1).trimEnd()}…` : text;
        return `[${s.id}] ${clipped}`;
    });
    return heading(
        "The piece so far, already on the page",
        `These sections are already written, and the author may have hand-edited them. Their current wording is canon. Match their voice and facts, build on what they establish, and never repeat a claim, number, or image another section already carries.\n${rows.join("\n")}`,
    );
}

// excerpts pulled from the attached context library for THIS call's query
export function retrievedContext(pack?: string | null): string | undefined {
    if (!pack?.trim()) return undefined;
    return heading(
        "Retrieved from the attached contexts, real material, with its source",
        `Use these excerpts' real facts, numbers, names, and phrasing where they serve the ask; never contradict them, and never dress your own invention as coming from them.\n\n${pack.trim()}`,
    );
}

export function artifactDigest(content: ArtifactContent): string {
    const rows = content.sections
        .map((s, i) => {
            const label = firstText(s) || "(untitled)";
            return `${i + 1}. [${s.id}] · ${label.slice(0, 80)}`;
        })
        .join("\n");
    return heading(
        "Current artifact",
        `format=${content.format}, theme=${content.theme}, ${content.sections.length} sections:\n${rows}`,
    );
}

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
            "Fit between them, match the voice, don't repeat what the previous section already said.",
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

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
            "Make it bridge the two, flow out of the previous, set up the next, and don't repeat what either already says.",
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

export const OUTPUT_NOTE = `Return only content that fits the schema. Never include commentary, markdown fences, or placeholder text, every field is real, finished copy.`;

export const SECTION_OUTPUT = `## Output, return ONE JSON object and nothing else
No prose, no explanation, no markdown fences. A section is { "id", "root" } where "root" is ONE element tree.

For side-by-side columns, make "root" a container with direction "row"; each child is a column carrying its width:
{
  "id": "<this section's id>",
  "root": { "type": "container", "data": { "direction": "row", "children": [
    { "type": "container", "data": { "direction": "col", "children": [ /* the left column's stacked elements */ ] }, "layout": { "width": { "pct": 60 } } },
    { "type": "image", "data": { "src": "<photo description>", "aspect": 1.2 }, "layout": { "width": { "pct": 40 } } }
  ] } },
  "background": { "kind": "image", "image": "<vivid photo description>", "scrim": 0.5 }
}
For a full-width section, "root" is a single element (e.g. a container of stacked elements, or one image). Column widths (\`layout.width.pct\`) should sum to ~100; match the planned layout's column count + split. Stack several elements with a container (direction "col"); go side-by-side with direction "row". The "background" key is optional, include it only for a cover, divider, or closing section (omit it entirely otherwise). Every string is real, finished copy. Never placeholder text.`;
