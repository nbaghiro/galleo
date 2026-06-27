import type { FormatDescriptor } from "@model/format";

// Format-as-view presets. The same artifact lays out as a deck (paged slides), a document
// (continuous reading column, paginated only on export), or a web page (full-bleed, fills width).
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
        maxContentWidth: 904,
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
        maxContentWidth: 1280,
        tokenScale: 1,
        splitMinWidth: 720,
        paginate: "never",
    },
};

export const DEFAULT_PROFILE = PROFILES.deck!;

export function resolveProfile(id: string | undefined): FormatDescriptor {
    return (id && PROFILES[id]) || DEFAULT_PROFILE;
}
