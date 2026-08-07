import type { FormatDescriptor } from "@model/geometry";
import type { Id, PageSize, Section } from "@model/artifact";

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
        overflow: "paginate",
    },
    doc: {
        id: "doc",
        name: "Doc",
        kind: "continuous",
        width: 816, // ~8.5in @ 96dpi
        height: "auto",
        maxContentWidth: 1000,
        tokenScale: 1,
        splitMinWidth: 560,
        overflow: "paginate",
    },
    web: {
        id: "web",
        name: "Site",
        kind: "continuous",
        width: "fill",
        height: "auto",
        maxContentWidth: 1180,
        bleedSections: true,
        tokenScale: 1,
        splitMinWidth: 720,
        overflow: "paginate",
    },
    // A carousel of portrait cards. Story 9:16 by default; the artifact's `page` picks another size
    // from SOCIAL_PRESETS. Every value here differs from deck for a reason, not just the dimensions:
    // cards run edge to edge, type reads far larger relative to the frame (a card is viewed at phone
    // width in a feed), columns stack because 1080px of portrait has no room for them at that type
    // size, a too-tall card is scaled rather than split, and every card shares one shape.
    social: {
        id: "social",
        name: "Social",
        kind: "paged",
        width: 1080,
        height: 1920,
        // the card IS the page, so it lays out at exactly 1080 — no `bleedSections`, which spans the
        // viewport (that is a web band, not a fixed card)
        maxContentWidth: 1080,
        tokenScale: 1.75,
        splitMinWidth: 1000,
        overflow: "fit",
        uniformFrame: true,
        canvas: "carousel",
    },
};

// One-click sizes for the `social` format, written to ArtifactContent.page. Pure data — the UI reads
// it; these are not profiles of their own.
export interface SocialPreset {
    label: string;
    width: number;
    height: number;
}

export const SOCIAL_PRESETS: SocialPreset[] = [
    { label: "Story 9:16", width: 1080, height: 1920 },
    { label: "Portrait 4:5", width: 1080, height: 1350 },
    { label: "Square 1:1", width: 1080, height: 1080 },
];

export const DEFAULT_PROFILE = PROFILES.deck!;

export function resolveProfile(id: string | undefined): FormatDescriptor {
    return (id && PROFILES[id]) || DEFAULT_PROFILE;
}

// Use resolveProfile instead where the format is named regardless of the artifact. Returns the base
// profile by identity when there's nothing to overlay — the paint caches compare it by reference.
export function profileFor(content: { format?: Id; page?: PageSize }): FormatDescriptor {
    const base = resolveProfile(content.format);
    const page = content.page;
    if (base.kind !== "paged" || !page || page.width <= 0 || page.height <= 0) return base;
    return {
        ...base,
        width: page.width,
        height: page.height,
        maxContentWidth: Math.min(page.width, base.maxContentWidth ?? page.width),
    };
}

// fallbacks when a viewport-sized profile ("fill"/"auto") is asked for a page
const SLIDE_W = 1280;
const SLIDE_H = 720;

export function pagedSize(profile: FormatDescriptor): { w: number; h: number } {
    const w = typeof profile.width === "number" ? profile.width : SLIDE_W;
    return {
        w,
        h:
            typeof profile.height === "number"
                ? profile.height
                : Math.round((w * 9) / 16) || SLIDE_H,
    };
}

// Below this a row of columns stacks; a deck sits at its fixed page width, doc/web track the viewport.
export const stacksAtWidth = (profile: FormatDescriptor, availWidth: number): boolean =>
    availWidth < profile.splitMinWidth;

// The paged frame in logical px; the artifact's page size arrives via the profile, and a section's
// `frame.aspect` overrides the height on top of it — unless the format keeps every page one shape.
export function sectionFrame(
    section: Section,
    profile: FormatDescriptor,
): { w: number; h: number } {
    const { w, h } = pagedSize(profile);
    const aspect = profile.uniformFrame ? undefined : section.frame?.aspect;
    return { w, h: aspect && aspect > 0 ? Math.round(w / aspect) : h };
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
