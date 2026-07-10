import type { FormatDescriptor } from "@model/geometry";

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

// A document's `maxContentWidth` is tuned for *authoring* — a fixed, narrowish reading column that stays
// put as the editor's panels open/close. A full-screen preview has no such constraint: it should let a
// document breathe wider when the screen has the room, while staying a centered, bounded column (unlike
// web, which deliberately bleeds full-width). This grows the doc content width with the viewport, floored
// at the editor width (never narrower than the authoring view) and capped so lines stay readable. Returns
// the profile untouched for paged (deck) and web formats. Preview surfaces call this with their full
// viewport width; the editor canvas keeps using the base profile.
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
