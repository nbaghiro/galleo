import type { Section } from "@model/artifact";
import { drain, implement } from "@services/core/ai/tools";
import {
    relayoutSectionParts,
    sectionCopyInventory,
    surfaceOf,
} from "@services/core/ai/prompts/generate";
import { resolveImages } from "@services/core/ai/images";
import { writeSectionTool } from "./plan";

// enumerated directives rather than temperature, so each variant chases a genuinely different
// shape; image-led briefs only apply when the section already has an image (a re-layout never
// spends on new media)
const ARRANGEMENTS: { brief: string; needsImage?: boolean }[] = [
    {
        brief: "Full-bleed: make the existing image the section background (or a dominant full-width visual) with the headline and copy overlaid or in a slim rail.",
        needsImage: true,
    },
    {
        brief: "Split: media on one side, all copy in a single rail on the other; pick the 60/40 or 40/60 balance that fits the copy.",
        needsImage: true,
    },
    {
        brief: "Typographic: no media in the flow; one oversized headline moment, generous whitespace, the remaining copy in one or two measured columns.",
    },
    {
        brief: "Grid: break the copy into 2–4 parallel cards or columns of equal weight.",
    },
    {
        brief: "Emphasis: pull the single strongest line out as a stat, quote or callout; the rest of the copy supports it.",
    },
];

export function arrangementBriefs(section: Section, count: number): string[] {
    const hasImage = sectionCopyInventory(section).images.length > 0;
    return ARRANGEMENTS.filter((a) => !a.needsImage || hasImage)
        .slice(0, count)
        .map((a) => a.brief);
}

implement(
    "suggest-section-layouts",
    async function* (input, ctx): AsyncGenerator<never, Section[]> {
        if (!ctx.artifact) throw new Error("no artifact is open");
        const content = ctx.artifact;
        const current = content.sections.find((s) => s.id === input.sectionId);
        if (!current) throw new Error(`there is no section "${input.sectionId}"`);
        const count = Math.max(2, Math.min(4, input.count ?? 3));
        const surface = surfaceOf(content.format);
        return await Promise.all(
            arrangementBriefs(current, count).map((brief, i) =>
                drain(
                    ctx.use(writeSectionTool, {
                        parts: relayoutSectionParts(content, current, brief, input.direction),
                        id: current.id,
                        label: `${current.id} layout ${i + 1}`,
                        surface,
                    }),
                ).then((s) => resolveImages(s, ctx.image)),
            ),
        );
    },
    {
        present: (sections, input) =>
            sections.map((section, i) => ({
                type: "proposal" as const,
                id: crypto.randomUUID(),
                tool: "suggest-section-layouts",
                summary: `Layout option ${i + 1} of ${sections.length}`,
                patch: {
                    artifact: [{ op: "replaceSection" as const, id: input.sectionId, section }],
                },
                preview: section,
            })),
        note: (sections, input) =>
            `Proposed ${sections.length} layout options for ${input.sectionId}; the copy is unchanged in each, and the user applies at most one.`,
    },
);
