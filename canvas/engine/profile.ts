import type { ArtifactContent } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";

// Format-as-view presets. The same artifact lays out as a deck (paged slides), a document
// (continuous reading column, paginated only on export), a web page (full-bleed, fills width), or a
// `flex` page at a custom, per-artifact size (poster / card / story). `width`/`height` drive paged
// framing (Present/Export); `maxContentWidth` drives the editor canvas.

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
        group: "Presentation",
        icon: "deck",
    },
    doc: {
        id: "doc",
        name: "Document",
        kind: "continuous",
        width: 816, // ~8.5in @ 96dpi
        height: "auto",
        maxContentWidth: 904,
        tokenScale: 1,
        splitMinWidth: 560,
        paginate: "export", // continuous on screen, paginated to paper on export
        group: "Document",
        icon: "doc",
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
        group: "Web",
        icon: "site",
    },
    flex: {
        id: "flex",
        name: "Flex",
        kind: "paged",
        width: 1080, // fallback size until the artifact carries its own `page`
        height: 1350,
        maxContentWidth: 1000,
        tokenScale: 1,
        splitMinWidth: 900, // narrow canvases collapse splits
        paginate: "always",
        group: "Custom",
        icon: "flex",
        fullBleed: true,
        frame: true, // edit inside the true page frame (fixed-frame editing)
    },
};

export const DEFAULT_PROFILE = PROFILES.deck!;

export function resolveProfile(id: string | undefined): FormatDescriptor {
    return (id && PROFILES[id]) || DEFAULT_PROFILE;
}

// The effective profile for an artifact: the base format, with the custom page size overlaid when the
// artifact is `flex`. `page` is honored ONLY for flex, so switching away from flex leaves it inert
// (and switching back restores it). Non-flex formats stay byte-identical to resolveProfile().
export function profileFor(content: ArtifactContent): FormatDescriptor {
    const base = resolveProfile(content.format);
    if (content.format !== "flex" || !content.page) return base;
    const { width, height } = content.page;
    return {
        ...base,
        width,
        height,
        maxContentWidth: Math.min(width, base.maxContentWidth ?? width),
    };
}

// width/height are typed `number | "fill" | "auto"`; paged renderers need a numeric accessor.
export const SLIDE_FALLBACK = { w: 1280, h: 720 };
export function pagedSize(p: FormatDescriptor): { w: number; h: number } {
    return {
        w: typeof p.width === "number" ? p.width : SLIDE_FALLBACK.w,
        h: typeof p.height === "number" ? p.height : SLIDE_FALLBACK.h,
    };
}

// One-click flex sizes surfaced by the dimension picker. Pure data — the UI reads it; not engine profiles.
export interface FlexPreset {
    label: string;
    group: string; // "Social" | "Print"
    width: number;
    height: number;
}

export const FLEX_PRESETS: FlexPreset[] = [
    { label: "Square", group: "Social", width: 1080, height: 1080 },
    { label: "Portrait 4:5", group: "Social", width: 1080, height: 1350 },
    { label: "Story 9:16", group: "Social", width: 1080, height: 1920 },
    { label: "Poster", group: "Print", width: 1240, height: 1754 },
    { label: "A4", group: "Print", width: 1240, height: 1754 },
    { label: "Letter", group: "Print", width: 1275, height: 1650 },
    { label: "Postcard", group: "Print", width: 1500, height: 1050 },
    { label: "Business card", group: "Print", width: 1050, height: 600 },
];
