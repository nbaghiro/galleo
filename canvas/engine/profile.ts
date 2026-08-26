import type { FormatDescriptor } from "@model/geometry";
import type { Id, PageSize, Section, SectionBackground } from "@model/artifact";

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
        // where a doc (32) holds a wider reading-column gutter
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
        // between the deck's sliver and the 64 default: at 64 a phone-width column read cramped,
        // 16 a side keeps the page feel over the backdrop without starving the text
        stackInset: 32,
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

/** The width a contained section lays out at: the reading column, held off the board's edges. */
export function containedWidth(profile: FormatDescriptor, fullW: number): number {
    return Math.min(fullW - (profile.stackInset ?? 64), profile.maxContentWidth ?? 1080);
}

// A background that paints the section edge to edge. A `tone` is derived theme rhythm and an absent
// one paints the page's own surface, so neither is a statement worth a break in the reading column.
const paintsBand = (bg: SectionBackground | undefined): boolean =>
    !!bg &&
    ((bg.kind === "image" && !!bg.image) ||
        (bg.kind === "color" && !!bg.color) ||
        (bg.kind === "gradient" && !!bg.gradient));

/**
 * The section's authored `bleed`, as this format honours it: full width, the wider band padding, no
 * card frame. On a site every section is a band anyway (`bleedSections`, applied by the callers) and
 * on a deck each section is its own page, so both take the flag as authored.
 *
 * A doc is the one format with a shared reading column running down the whole piece, and a band that
 * spans the page beside contained neighbours reads as a misalignment rather than a statement. So a
 * doc honours it only for a section that both declares itself a band — `bleed`, or the `frame.aspect`
 * that already makes a hero one — and paints one: a photo, a colour or a gradient. A tone band keeps
 * the column with its neighbours, which is what a site's alternating tints degrade into.
 */
export function sectionBleeds(section: Section, profile: FormatDescriptor): boolean {
    if (profile.bleedSections || profile.kind === "paged") return section.bleed ?? false;
    const declared = (section.bleed ?? false) || (section.frame?.aspect ?? 0) > 0;
    return declared && paintsBand(section.background);
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

// A preview lays a doc out at the editor's own reading column, so the two agree line for line; the
// one divergence is a phone, which has no room for the gutter and bleeds edge-to-edge like a site.
export function previewContentProfile(base: FormatDescriptor, bleed = false): FormatDescriptor {
    if (base.kind !== "continuous" || !bleed) return base;
    return base.bleedSections ? base : { ...base, bleedSections: true };
}
