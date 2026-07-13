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
        tokenScale: 1,
        splitMinWidth: 720,
        paginate: "never",
    },
};

export const DEFAULT_PROFILE = PROFILES.deck!;

export function resolveProfile(id: string | undefined): FormatDescriptor {
    return (id && PROFILES[id]) || DEFAULT_PROFILE;
}

// The paged frame (logical px) a section renders into: format page size, overridden by the section's `frame.aspect`. `width` stays at the page width; only height flexes with the aspect.
const SLIDE_W = 1280;
const SLIDE_H = 720;
export function slideFrame(section: Section, profile: FormatDescriptor): { w: number; h: number } {
    const w = typeof profile.width === "number" ? profile.width : SLIDE_W;
    const base =
        typeof profile.height === "number" ? profile.height : Math.round((w * 9) / 16) || SLIDE_H;
    const aspect = section.frame?.aspect;
    return { w, h: aspect && aspect > 0 ? Math.round(w / aspect) : base };
}

// Grow a doc's content width with the viewport, floored at the editor width and capped for readability. Deck + web pass through untouched.
const PREVIEW_DOC_MAX = 1440;
const PREVIEW_VIEWPORT_FRACTION = 0.78;
export function previewContentProfile(base: FormatDescriptor, fullW: number): FormatDescriptor {
    if (base.kind !== "continuous" || base.id === "web") return base;
    const editorMax = base.maxContentWidth ?? 1000;
    const wide = Math.min(
        PREVIEW_DOC_MAX,
        Math.max(editorMax, Math.round(fullW * PREVIEW_VIEWPORT_FRACTION)),
    );
    return wide === editorMax ? base : { ...base, maxContentWidth: wide };
}
