import type { FormatDescriptor } from "@model/geometry";
import type { Id, PageSize, Section } from "@model/artifact";

// `width`/`height` drive paged framing (Present/Export); `maxContentWidth` drives the editor canvas.

// One ramp for all three: type constants are tuned for ~640px+ columns, so narrower containers
// (phone editor, phone preview, a published page on a phone) scale type + space down with the
// width. The 0.7 floor keeps the type hierarchy legible instead of shrinking to parity.
const TYPE_RAMP = { reference: 640, min: 0.7 };

// Autofit's two floors (see `.docs/planning/autofit.md`). A section that overflows its frame is
// re-composed smaller rather than scaled as pixels, and this is how far that may go: `FIT_FLOOR`
// matches `TYPE_RAMP.min` so the two floors in the codebase agree, and `MIN_TEXT_PX` is the real
// bound, since a section's SMALLEST type is what becomes illegible first (a 13px label at 0.7 is
// 9px while its title is still comfortable). The ramp multiplies in before it, so it is stated in
// final pixels rather than as a scale.
export const FIT_FLOOR = 0.7;
export const MIN_TEXT_PX = 11;

export const PROFILES: Record<string, FormatDescriptor> = {
    deck: {
        id: "deck",
        name: "Deck",
        kind: "paged",
        width: 1280,
        height: 720,
        maxContentWidth: 1120,
        tokenScale: 1,
        ramp: TYPE_RAMP,
        // slides read best broad: on a narrow stack they keep only a sliver of backdrop,
        // where a doc (default 64) holds its reading-column gutter
        stackInset: 16,
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
        ramp: TYPE_RAMP,
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
        ramp: TYPE_RAMP,
        splitMinWidth: 720,
        overflow: "paginate",
    },
};

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
export const SLIDE_W = 1280;
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

// The effective token scale at a real container width: the profile's base scale times the fluid
// ramp. Wide containers are exactly the base (thumbnails and exports lay out wide, so they never
// ramp); the floor stops a phone from flattening the type hierarchy.
export function rampScale(profile: FormatDescriptor, availWidth: number): number {
    const base = profile.tokenScale || 1;
    const r = profile.ramp;
    if (!r || availWidth >= r.reference) return base;
    return base * Math.max(r.min, availWidth / r.reference);
}

// The paged frame in logical px; the artifact's page size arrives via the profile, and a section's
// `frame.aspect` overrides the height on top of it.
export function sectionFrame(
    section: Section,
    profile: FormatDescriptor,
): { w: number; h: number } {
    const { w, h } = pagedSize(profile);
    const aspect = section.frame?.aspect;
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
