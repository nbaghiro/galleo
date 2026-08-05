import type { FormatDescriptor } from "@model/geometry";
import type { Section } from "@model/artifact";

// `width`/`height` drive paged framing (Present/Export); `maxContentWidth` drives the editor canvas.

export const PROFILES: Record<string, FormatDescriptor> = {
    deck: {
        id: "deck",
        name: "Deck",
        kind: "paged",
        width: 1280,
        height: 720,
        maxContentWidth: 1120,
        tokenScale: 1,
        splitMinWidth: 520,
        paginate: "always",
    },
    doc: {
        id: "doc",
        name: "Document",
        kind: "continuous",
        width: 816, // ~8.5in @ 96dpi
        height: "auto",
        maxContentWidth: 1000,
        tokenScale: 1,
        splitMinWidth: 560,
        paginate: "export", // continuous on screen, paginated to paper on export
    },
    web: {
        id: "web",
        name: "Web",
        kind: "continuous",
        width: "fill",
        height: "auto",
        maxContentWidth: 1180,
        bleedSections: true,
        tokenScale: 1,
        splitMinWidth: 720,
        paginate: "never",
    },
};

export const DEFAULT_PROFILE = PROFILES.deck!;

export function resolveProfile(id: string | undefined): FormatDescriptor {
    return (id && PROFILES[id]) || DEFAULT_PROFILE;
}

// Below this a row of columns stacks; a deck sits at its fixed page width, doc/web track the viewport.
export const stacksAtWidth = (profile: FormatDescriptor, availWidth: number): boolean =>
    availWidth < profile.splitMinWidth;

// The paged frame in logical px; a section's `frame.aspect` flexes the height only.
const SLIDE_W = 1280;
const SLIDE_H = 720;
export function slideFrame(section: Section, profile: FormatDescriptor): { w: number; h: number } {
    const w = typeof profile.width === "number" ? profile.width : SLIDE_W;
    const base =
        typeof profile.height === "number" ? profile.height : Math.round((w * 9) / 16) || SLIDE_H;
    const aspect = section.frame?.aspect;
    return { w, h: aspect && aspect > 0 ? Math.round(w / aspect) : base };
}

// A doc's content width grows with the viewport, floored at the editor width, capped for readability.
const PREVIEW_DOC_MAX = 1440;
const PREVIEW_VIEWPORT_FRACTION = 0.78;
export function previewContentProfile(
    base: FormatDescriptor,
    fullW: number,
    bleed = false,
): FormatDescriptor {
    if (base.kind !== "continuous") return base;
    // a phone has no room for the reading gutter, so a doc bleeds edge-to-edge like a site
    if (bleed) return base.bleedSections ? base : { ...base, bleedSections: true };
    if (base.id === "web") return base;
    const editorMax = base.maxContentWidth ?? 1000;
    const wide = Math.min(
        PREVIEW_DOC_MAX,
        Math.max(editorMax, Math.round(fullW * PREVIEW_VIEWPORT_FRACTION)),
    );
    return wide === editorMax ? base : { ...base, maxContentWidth: wide };
}
