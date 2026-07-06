// The catalog of user-facing AI actions and how each is priced — one edge-safe source of truth shared by
// the backend (which charges) and the app (which showcases costs). Pricing rides on the generic metered
// engine in @model/credits: an action declares the *units of work* it does (via a base `usage` and, when its
// cost scales with the job, a `meter`), and the credit cost is just `costOf(usage)`. So a long artifact
// costs more than a short one, an edit over a big deck costs more than over a small one, and four image
// variations cost four times one — all without any per-action special-casing.

import type { Usage } from "@model/credits";
import { costOf } from "@model/credits";

export type AiActionId =
    | "generate"
    | "edit"
    | "regenerate-section"
    | "edit-element"
    | "continue"
    | "rewrite"
    | "translate"
    | "translate-artifact"
    | "generate-theme"
    | "generate-image"
    | "chat"
    | "retitle"
    | "summarize"
    | "alt-text"
    | "speaker-notes";

export type AiActionCategory = "create" | "edit" | "text" | "media" | "theme" | "assist";

export interface AiActionInfo {
    id: AiActionId;
    label: string; // shown in the UI
    description: string; // one line, for the pricing table + tooltips
    category: AiActionCategory;
    usage: Usage; // the typical units this action does → its typical credit cost via costOf()
    live?: boolean; // a prompt builder (+ eventually a route) exists; false/undefined = planned
}

// The knobs a metered action scales by. All optional; a meter reads the ones it cares about and falls back
// to a sensible default (so an estimate works before exact counts are known).
export interface MeterParams {
    length?: string; // "Short" | "Standard" | "In-depth" — the intake length chip (generate)
    sections?: number; // sections to write / reason over (generate, edit, continue)
    images?: number; // images generated within a generation
    textRuns?: number; // text elements to translate (translate-artifact)
    variations?: number; // image variations (generate-image)
}

// The intake length chip → an expected section count (the demos run ~18; templates ~12; a short deck ~7).
export function sectionsForLength(length?: string): number {
    const l = (length ?? "").toLowerCase();
    if (l.startsWith("short")) return 7;
    if (l.startsWith("in") || l.startsWith("deep") || l.startsWith("long")) return 18;
    return 12;
}

// The catalog. `usage` is the typical case (drives the headline cost); metered actions additionally define a
// `meter` below so the real cost scales with the job.
export const AI_ACTIONS: Record<AiActionId, AiActionInfo> = {
    generate: {
        id: "generate",
        label: "Generate artifact",
        description: "A full deck, doc, or site — scales with length",
        category: "create",
        usage: { plan: 1, section: 12, image: 3 },
        live: true,
    },
    edit: {
        id: "edit",
        label: "Edit whole artifact",
        description: "Revise the piece — scales with its size",
        category: "edit",
        usage: { section: 10 },
        live: true,
    },
    "regenerate-section": {
        id: "regenerate-section",
        label: "Regenerate section",
        description: "Rewrite one section in place",
        category: "edit",
        usage: { section: 1 },
        live: true,
    },
    "edit-element": {
        id: "edit-element",
        label: "Edit element",
        description: "Rework a single element or cell",
        category: "edit",
        usage: { text: 2 },
        live: true,
    },
    continue: {
        id: "continue",
        label: "Add a section",
        description: "Write and insert a new section",
        category: "create",
        usage: { section: 1 },
    },
    rewrite: {
        id: "rewrite",
        label: "Rewrite text",
        description: "Punchier, shorter, clearer, or fixed",
        category: "text",
        usage: { text: 1 },
        live: true,
    },
    translate: {
        id: "translate",
        label: "Translate text",
        description: "Localize a selected passage",
        category: "text",
        usage: { text: 1 },
        live: true,
    },
    "translate-artifact": {
        id: "translate-artifact",
        label: "Translate artifact",
        description: "The whole piece — scales with its length",
        category: "text",
        usage: { text: 12 },
        live: true,
    },
    "generate-theme": {
        id: "generate-theme",
        label: "Generate theme",
        description: "A custom color-and-type theme",
        category: "theme",
        usage: { theme: 1 },
        live: true,
    },
    "generate-image": {
        id: "generate-image",
        label: "Generate image",
        description: "An AI image — scales with variations",
        category: "media",
        usage: { image: 1 },
        live: true,
    },
    chat: {
        id: "chat",
        label: "Ask the assistant",
        description: "A conversational question about your artifact",
        category: "assist",
        usage: { reply: 1 },
        live: true,
    },
    retitle: {
        id: "retitle",
        label: "Suggest a title",
        description: "Name or rename the artifact",
        category: "assist",
        usage: { text: 1 },
    },
    summarize: {
        id: "summarize",
        label: "Summarize",
        description: "Key points or a TL;DR",
        category: "assist",
        usage: { reply: 1 },
    },
    "alt-text": {
        id: "alt-text",
        label: "Image alt text",
        description: "Accessible descriptions for images",
        category: "assist",
        usage: { text: 1 },
    },
    "speaker-notes": {
        id: "speaker-notes",
        label: "Speaker notes",
        description: "Talking points for a deck",
        category: "assist",
        usage: { reply: 1 },
    },
};

// The meters — the actions whose cost scales with the job. Each returns the real expected usage for the
// given params (defaulting gracefully). Actions absent here are fixed-cost (their base `usage`).
const METERS: Partial<Record<AiActionId, (m: MeterParams) => Usage>> = {
    // Generation scales with how many sections (and images) it will produce.
    generate: (m) => {
        const n = m.sections ?? sectionsForLength(m.length);
        return { plan: 1, section: n, image: m.images ?? Math.ceil(n / 4) };
    },
    // A whole-artifact edit reasons over the current artifact, so it scales with its section count.
    edit: (m) => ({ section: Math.max(3, m.sections ?? 10) }),
    // Translating the whole piece scales with how many text runs it has.
    "translate-artifact": (m) => ({ text: Math.max(1, m.textRuns ?? 12) }),
    // Image generation scales with the number of variations requested.
    "generate-image": (m) => ({ image: Math.max(1, m.variations ?? 1) }),
};

// Display order (mirrors the object order above).
export const AI_ACTION_LIST: AiActionInfo[] = Object.values(AI_ACTIONS);

// The real expected usage for an action given the job's size — the meter if it has one, else its base usage.
export function estimateUsage(id: AiActionId, m: MeterParams = {}): Usage {
    const meter = METERS[id];
    return meter ? meter(m) : AI_ACTIONS[id].usage;
}

// The estimated credit cost (what the pre-flight gate reserves and the UI previews).
export function estimateCost(id: AiActionId, m?: MeterParams): number {
    return costOf(estimateUsage(id, m));
}

// The typical (headline) cost, ignoring job size — for a compact showcase number.
export function typicalCost(id: AiActionId): number {
    return costOf(AI_ACTIONS[id].usage);
}

// Whether an action's cost scales with the job (so the UI can show a range, not a single number).
export function isMetered(id: AiActionId): boolean {
    return id in METERS;
}

// The cost range a metered action spans (a small job → a large one); min == max for fixed actions.
const SMALL: MeterParams = { length: "Short", sections: 6, textRuns: 5, images: 2, variations: 1 };
const LARGE: MeterParams = {
    length: "In-depth",
    sections: 20,
    textRuns: 40,
    images: 6,
    variations: 4,
};
export function costRange(id: AiActionId): { min: number; max: number } {
    const meter = METERS[id];
    if (!meter) {
        const c = typicalCost(id);
        return { min: c, max: c };
    }
    return { min: costOf(meter(SMALL)), max: costOf(meter(LARGE)) };
}

// Back-compat: the typical cost of an action (no job size). Prefer estimateCost(id, meter) when the size
// is known, or charge the real usage via costOf() once a run completes.
export function creditsFor(id: AiActionId): number {
    return estimateCost(id);
}
