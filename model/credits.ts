// Metered credits: an action's cost = the sum of the primitive units of work it produces. A tool IS
// the priced unit (usage + optional meter, no usage = free); the run half lives in services/ai/tools.

// anchored so a typical (~12-section, ~3-image) generation ≈ 40 credits
export const COST_UNITS = {
    plan: 3, // one outline / planning call
    section: 2, // one section written/regenerated/reasoned over
    image: 5, // one image generated (per variation)
    video: 100, // one 8s clip generated (Veo Fast ≈ 20 images' worth of provider cost)
    text: 1, // one text run rewritten/translated
    theme: 4, // one theme designed
    reply: 2, // one chat/summary reply
} as const;

export type CostUnit = keyof typeof COST_UNITS;

// What one credit stands for in provider spend. Derived, not chosen: a default 12-section deck
// measures at $0.0092 for the outline plus 12 × $0.0312 for the sections ≈ $0.384, and the unit
// table above bills it at 27 credits. Re-derive this whenever the default model or its price moves,
// or the two drift apart. Measured 2026-08-05 on gemini-3.5-flash.
export const CREDIT_USD = 0.0142;

/** Provider spend → credits. Floored at 1 so a real call is never free. */
export const creditsForUsd = (usd: number): number => Math.max(1, Math.round(usd / CREDIT_USD));

// what an action estimates, or what a run actually did
export type Usage = Partial<Record<CostUnit, number>>;

// A unit's price scales with what the model behind it costs us: the same section is ~6x the provider
// spend on Fable 5 as on the default Flash. Absent multipliers price everything at the baseline.
export type UnitRates = Partial<Record<CostUnit, number>>;

// Σ unit price × count × model rate, floored at 1 so nothing is free
export function costOf(usage: Usage, rates: UnitRates = {}): number {
    let sum = 0;
    for (const u of Object.keys(COST_UNITS) as CostUnit[])
        sum += COST_UNITS[u] * (usage[u] ?? 0) * (rates[u] ?? 1);
    return Math.max(1, Math.round(sum));
}

// human-readable breakdown for the credit ledger
export function describeUsage(usage: Usage): string {
    const parts = (Object.keys(COST_UNITS) as CostUnit[])
        .filter((u) => usage[u])
        .map((u) => `${usage[u]} ${u}${usage[u]! > 1 ? "s" : ""}`);
    return parts.join(" · ") || "—";
}

// The steps a run is made of. Named here rather than in `services` because both sides need them:
// the client pins models per task over `x-galleo-models`, and the artifact records what each step
// used in `ai_meta`.
export type AiTask =
    | "generate"
    | "brief"
    | "outline"
    | "section"
    | "edit"
    | "rewrite"
    | "translate"
    | "chat"
    | "theme";

export const AI_TASKS: readonly AiTask[] = [
    "generate",
    "brief",
    "outline",
    "section",
    "edit",
    "rewrite",
    "translate",
    "chat",
    "theme",
];

// Which task's model does the work a cost unit stands for. `image` and `video` run on their own
// media models and are priced flat, so they have no text task.
const UNIT_TASK: Record<CostUnit, AiTask | null> = {
    plan: "outline",
    section: "section",
    text: "rewrite",
    theme: "theme",
    reply: "chat",
    image: null,
    video: null,
};

/**
 * Per-unit price multipliers for the models a run will actually use.
 * `taskModel` resolves a task to a model id; `rateFor` prices that model against the baseline.
 */
export function unitMultipliers(
    taskModel: (task: AiTask) => string | undefined,
    rateFor: (modelId: string) => number | undefined,
): UnitRates {
    const out: UnitRates = {};
    for (const [unit, task] of Object.entries(UNIT_TASK) as [CostUnit, AiTask | null][]) {
        if (!task) continue;
        const id = taskModel(task);
        const rate = id ? rateFor(id) : undefined;
        if (rate && rate > 0 && rate !== 1) out[unit] = rate;
    }
    return out;
}

export type ToolId =
    | "generate-artifact"
    | "revise-artifact"
    | "add-section"
    | "rewrite-section"
    | "edit-artifact"
    | "reorder-section"
    | "remove-section"
    | "set-format"
    | "set-theme"
    | "revise-element"
    | "ask-assistant"
    | "rewrite-text"
    | "rewrite-passage"
    | "translate-text"
    | "translate-artifact"
    | "suggest-title"
    | "generate-theme"
    | "generate-image"
    | "reimage"
    | "write-summary"
    | "write-alt-text"
    | "write-speaker-notes"
    | "suggest-sections"
    | "show-sections"
    | "find-artifacts"
    | "read-artifact"
    | "rename-artifact"
    | "move-artifact"
    | "duplicate-artifact"
    | "trash-artifact"
    | "restore-artifact"
    | "create-folder"
    | "share-artifact"
    | "export-artifact"
    | "find-templates"
    | "find-stock-image"
    | "draft-brief"
    | "plan-outline"
    | "plan-section"
    | "write-section"
    | "source-image"
    | "check-section"
    | "pick-arc"
    | "apply-patch";

export type ToolTier = "composite" | "action" | "primitive";

// where a tool is exposed; internal = composition-only (never called directly)
export type ToolSurface = "agent" | "direct" | "mcp" | "internal";

// showcase grouping for the credits table
export type ToolCategory = "create" | "edit" | "text" | "media" | "theme" | "assist";

export interface MeterParams {
    length?: string; // "Short" | "Standard" | "In-depth"
    sections?: number;
    images?: number;
    imageSource?: "stock" | "ai"; // stock images are free; AI images metered per image
    textRuns?: number;
    variations?: number;
}

export interface ToolMeta {
    id: ToolId;
    title: string;
    summary: string;
    tier: ToolTier;
    surfaces: ToolSurface[];
    // present on credit-costing tools; absent = free
    category?: ToolCategory;
    usage?: Usage; // typical units → typical cost via costOf()
    meter?: (m: MeterParams) => Usage; // scales cost with the job; absent = fixed-cost
    live?: boolean; // false/undefined = planned (no route yet)
}

type Pricing = Pick<ToolMeta, "category" | "usage" | "meter" | "live">;

const meta = (
    id: ToolId,
    title: string,
    summary: string,
    tier: ToolTier,
    surfaces: ToolSurface[],
    pricing?: Pricing,
): ToolMeta => ({ id, title, summary, tier, surfaces, ...pricing });

const AGENT_DIRECT: ToolSurface[] = ["agent", "direct", "mcp"];
const INTERNAL: ToolSurface[] = ["internal"];

// length chip → expected section count
export function sectionsForLength(length?: string): number {
    const l = (length ?? "").toLowerCase();
    if (l.startsWith("short")) return 7;
    if (l.startsWith("in") || l.startsWith("deep") || l.startsWith("long")) return 18;
    return 12;
}

export const TOOL_CATALOG: Record<ToolId, ToolMeta> = {
    "generate-artifact": meta(
        "generate-artifact",
        "Generate artifact",
        "Build a whole deck, doc, or site from a brief",
        "composite",
        AGENT_DIRECT,
        {
            category: "create",
            live: true,
            usage: { plan: 1, section: 12, image: 3 },
            meter: (m) => {
                const n = m.sections ?? sectionsForLength(m.length);
                return {
                    plan: 1,
                    section: n,
                    image: m.imageSource === "ai" ? (m.images ?? Math.ceil(n / 4)) : 0,
                };
            },
        },
    ),
    "revise-artifact": meta(
        "revise-artifact",
        "Revise artifact",
        "Revise the whole piece per an instruction",
        "composite",
        AGENT_DIRECT,
        {
            category: "edit",
            usage: { section: 10 },
            meter: (m) => ({ section: Math.max(3, m.sections ?? 10) }),
        },
    ),
    "add-section": meta(
        "add-section",
        "Add section",
        "Generate a new section and propose inserting it",
        "composite",
        AGENT_DIRECT,
        { category: "create", live: true, usage: { section: 1 } },
    ),
    "rewrite-section": meta(
        "rewrite-section",
        "Rewrite section",
        "Rewrite one existing section in place",
        "composite",
        AGENT_DIRECT,
        { category: "edit", live: true, usage: { section: 1 } },
    ),
    "edit-artifact": meta(
        "edit-artifact",
        "Edit artifact",
        "Edit a section of another library artifact in place",
        "composite",
        ["agent", "direct"],
        { category: "edit", live: true, usage: { section: 1 } },
    ),
    "reorder-section": meta(
        "reorder-section",
        "Reorder section",
        "Move a section to a new position",
        "action",
        ["agent", "direct"],
    ),
    "remove-section": meta("remove-section", "Remove section", "Delete a section", "action", [
        "agent",
        "direct",
    ]),
    "set-format": meta("set-format", "Set format", "Re-render as deck / doc / web", "action", [
        "agent",
        "direct",
    ]),
    "set-theme": meta(
        "set-theme",
        "Set theme",
        "Switch the artifact to a built-in theme",
        "action",
        ["agent", "direct"],
    ),
    "revise-element": meta(
        "revise-element",
        "Revise element",
        "Rework a single element or cell",
        "composite",
        AGENT_DIRECT,
        { category: "edit", live: true, usage: { text: 2 } },
    ),
    "ask-assistant": meta(
        "ask-assistant",
        "Ask the assistant",
        "A conversational agent turn — reasons over your artifact and chains the tools above",
        "composite",
        ["direct"],
        { category: "assist", live: true, usage: { reply: 1 } },
    ),
    "rewrite-text": meta(
        "rewrite-text",
        "Rewrite text",
        "Rewrite one text run per an instruction",
        "action",
        AGENT_DIRECT,
        { category: "text", live: true, usage: { text: 1 } },
    ),
    "rewrite-passage": meta(
        "rewrite-passage",
        "Rewrite a passage",
        "Rewrite one passage inside a section, in place",
        "action",
        ["agent"],
        { category: "text", live: true, usage: { text: 1 } },
    ),
    "translate-text": meta(
        "translate-text",
        "Translate text",
        "Translate one text run",
        "action",
        AGENT_DIRECT,
        { category: "text", live: true, usage: { text: 1 } },
    ),
    "translate-artifact": meta(
        "translate-artifact",
        "Translate artifact",
        "Translate the whole piece",
        "action",
        AGENT_DIRECT,
        {
            category: "text",
            usage: { text: 12 },
            meter: (m) => ({ text: Math.max(1, m.textRuns ?? 12) }),
        },
    ),
    "suggest-title": meta(
        "suggest-title",
        "Suggest title",
        "Propose a title for the artifact",
        "action",
        AGENT_DIRECT,
        { category: "assist", usage: { text: 1 } },
    ),
    "generate-theme": meta(
        "generate-theme",
        "Generate theme",
        "Create a theme from a prompt",
        "action",
        AGENT_DIRECT,
        { category: "theme", live: true, usage: { theme: 1 } },
    ),
    // stock costs nothing; an AI variation is metered by the route, which counts what was really made
    reimage: meta(
        "reimage",
        "Replace an image",
        "Re-source a section's image or backdrop from a new description",
        "action",
        ["agent"],
        { category: "media" },
    ),
    "generate-image": meta(
        "generate-image",
        "Generate image",
        "Create an image with AI",
        "action",
        ["direct"],
        {
            category: "media",
            live: true,
            usage: { image: 1 },
            meter: (m) => ({ image: Math.max(1, m.variations ?? 1) }),
        },
    ),
    "write-summary": meta(
        "write-summary",
        "Write summary",
        "Write a summary of the piece",
        "action",
        AGENT_DIRECT,
        { category: "assist", usage: { reply: 1 } },
    ),
    "write-alt-text": meta(
        "write-alt-text",
        "Write alt text",
        "Write alt text for an image",
        "action",
        AGENT_DIRECT,
        { category: "assist", usage: { text: 1 } },
    ),
    "write-speaker-notes": meta(
        "write-speaker-notes",
        "Write speaker notes",
        "Write presenter notes for slides",
        "action",
        AGENT_DIRECT,
        { category: "assist", usage: { reply: 1 } },
    ),
    "suggest-sections": meta(
        "suggest-sections",
        "Suggest sections",
        "Propose what to add next",
        "action",
        AGENT_DIRECT,
    ),
    "show-sections": meta(
        "show-sections",
        "Show sections",
        "Display the existing sections as a carousel",
        "action",
        ["agent", "direct"],
    ),
    "find-artifacts": meta(
        "find-artifacts",
        "Find artifacts",
        "Search the user's library by title or topic",
        "action",
        ["agent", "direct"],
    ),
    "read-artifact": meta(
        "read-artifact",
        "Read artifact",
        "Load one artifact's content to summarize or edit it",
        "action",
        ["agent", "direct"],
    ),
    "rename-artifact": meta("rename-artifact", "Rename artifact", "Rename an artifact", "action", [
        "agent",
        "direct",
    ]),
    "move-artifact": meta(
        "move-artifact",
        "Move artifact",
        "Move an artifact into a folder (or out)",
        "action",
        ["agent", "direct"],
    ),
    "duplicate-artifact": meta(
        "duplicate-artifact",
        "Duplicate artifact",
        "Make a copy of an artifact",
        "action",
        ["agent", "direct"],
    ),
    "trash-artifact": meta(
        "trash-artifact",
        "Trash artifact",
        "Move an artifact to Trash",
        "action",
        ["agent", "direct"],
    ),
    "restore-artifact": meta(
        "restore-artifact",
        "Restore artifact",
        "Restore an artifact from Trash",
        "action",
        ["agent", "direct"],
    ),
    "create-folder": meta("create-folder", "Create folder", "Make a new folder", "action", [
        "agent",
        "direct",
    ]),
    "share-artifact": meta(
        "share-artifact",
        "Share artifact",
        "Open the share options for an artifact",
        "action",
        ["agent", "direct"],
    ),
    "export-artifact": meta(
        "export-artifact",
        "Export artifact",
        "Open an artifact to export it",
        "action",
        ["agent", "direct"],
    ),
    "find-templates": meta(
        "find-templates",
        "Find templates",
        "List the starter templates",
        "action",
        ["agent", "direct"],
    ),
    "find-stock-image": meta(
        "find-stock-image",
        "Find stock image",
        "Search stock libraries for a photo",
        "action",
        ["direct", "internal"],
    ),
    "draft-brief": meta(
        "draft-brief",
        "Draft brief",
        "Expand a raw prompt into an editable structured brief",
        "action",
        ["direct"],
        { category: "create", live: true, usage: { text: 1 } },
    ),
    "plan-outline": meta(
        "plan-outline",
        "Plan outline",
        "Plan the arc: title, backdrop, ordered beats",
        "primitive",
        ["direct", "internal"],
        { category: "create", live: true, usage: { plan: 1 } },
    ),
    "plan-section": meta(
        "plan-section",
        "Plan section",
        "Decide one section's grid + per-cell blocks",
        "primitive",
        INTERNAL,
    ),
    "write-section": meta(
        "write-section",
        "Write section",
        "Write the content that fills a planned grid",
        "primitive",
        INTERNAL,
    ),
    "source-image": meta(
        "source-image",
        "Source image",
        "Turn a phrase into a real image url (stock or AI)",
        "primitive",
        INTERNAL,
    ),
    "check-section": meta(
        "check-section",
        "Check section",
        "Audit a section for quality issues",
        "primitive",
        INTERNAL,
    ),
    "pick-arc": meta(
        "pick-arc",
        "Pick arc",
        "Select the narrative-arc scaffold for a brief",
        "primitive",
        INTERNAL,
    ),
    "apply-patch": meta(
        "apply-patch",
        "Apply patch",
        "Commit a proposed patch to the artifact",
        "action",
        ["mcp", "direct"],
    ),
};

// only tools that are BOTH priced (usage) and live, so no unbuyable prices
export const PRICED_TOOLS: ToolMeta[] = Object.values(TOOL_CATALOG).filter(
    (t) => t.usage && t.live,
);

function estimateUsage(id: ToolId, m: MeterParams = {}): Usage {
    const t = TOOL_CATALOG[id];
    return t.meter ? t.meter(m) : (t.usage ?? {});
}

// what the pre-flight gate reserves + the UI previews
export function estimateCost(id: ToolId, m?: MeterParams, rates?: UnitRates): number {
    return costOf(estimateUsage(id, m), rates);
}

// headline cost, ignoring job size
export function typicalCost(id: ToolId): number {
    return costOf(TOOL_CATALOG[id].usage ?? {});
}

export function isMetered(id: ToolId): boolean {
    return !!TOOL_CATALOG[id].meter;
}

// min == max for fixed-cost tools
const SMALL: MeterParams = {
    length: "Short",
    sections: 6,
    textRuns: 5,
    images: 2,
    variations: 1,
    imageSource: "stock",
};
const LARGE: MeterParams = {
    length: "In-depth",
    sections: 20,
    textRuns: 40,
    images: 6,
    variations: 4,
    imageSource: "ai",
};
export function costRange(id: ToolId): { min: number; max: number } {
    const t = TOOL_CATALOG[id];
    if (!t.meter) {
        const c = typicalCost(id);
        return { min: c, max: c };
    }
    return { min: costOf(t.meter(SMALL)), max: costOf(t.meter(LARGE)) };
}
