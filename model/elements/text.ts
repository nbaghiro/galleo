// Text-category value-sets — the enums the text / bullets / callout elements read. One file per element
// category under `model/elements/`, mirroring the `canvas/elements/<category>/` folders and the UI palette
// groups so the taxonomy lines up everywhere. Pure data + types; imports nothing. Canvas builds its control
// options from these consts (with its own UI labels); the AI catalog (@model/ai-schema) annotates them.

export const TEXT_STYLES = [
    "h1",
    "subtitle",
    "h2",
    "h3",
    "body",
    "caption",
    "quote",
    "label",
] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

export const TEXT_ALIGN = ["start", "center", "end"] as const;
export type TextAlign = (typeof TEXT_ALIGN)[number];

export const BULLET_MARKERS = ["dot", "number", "dash", "check"] as const;
export type BulletMarker = (typeof BULLET_MARKERS)[number];

export const CALLOUT_TONES = [
    "note",
    "info",
    "tip",
    "success",
    "warn",
    "caution",
    "question",
] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];
